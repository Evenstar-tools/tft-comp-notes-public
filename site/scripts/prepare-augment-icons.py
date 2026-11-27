"""Render the current catalog's packed augment textures as transparent tier art."""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
CDN = "https://cdn.metatft.com/file/metatft/augments/"
TIERS = {"银色": "silver", "金色": "gold", "棱彩": "prismatic"}
# Core, highlight and halo use the site's silver-blue, amber and lavender tones.
PALETTES = {
    "silver": ("#7597ba", "#e0efff", "#487aa8"),
    "gold": ("#c49538", "#fff0b8", "#b18b38"),
    "prismatic": ("#9d82c5", "#f4edff", "#8163b5"),
}


def texture(key: str, cache: Path | None) -> Image.Image:
    image_path = cache / f"{key}.png" if cache else None
    if image_path and image_path.is_file():
        payload = image_path.read_bytes()
    else:
        request = Request(f"{CDN}{key}.png", headers={"User-Agent": "TFT-Comp-Notes/1.0"})
        with urlopen(request, timeout=20) as response:
            payload = response.read()
        if image_path:
            image_path.write_bytes(payload)
    with Image.open(BytesIO(payload)) as image:
        return image.convert("RGBA")


def render(image: Image.Image, tier: str) -> Image.Image:
    red, green, blue, alpha = image.split()
    # A finished transparent icon already contains the colors to display.
    if alpha.getextrema() != (255, 255):
        return image
    # In a packed texture, red carries the glyph, green the highlights and blue the glow.
    if image.getpixel((0, 0))[:3] != (0, 0, 0):
        raise ValueError("expected transparent artwork or a black-cornered packed texture")
    core_color, highlight_color, glow_color = PALETTES[tier]
    glow = Image.new("RGBA", image.size, glow_color)
    glow.putalpha(ImageChops.subtract(blue, red).point(lambda n: n * 0.45))
    core = Image.composite(
        Image.new("RGBA", image.size, highlight_color),
        Image.new("RGBA", image.size, core_color),
        green,
    )
    core.putalpha(red)
    return Image.alpha_composite(glow, core)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="Optional directory for upstream PNGs")
    args = parser.parse_args()
    if args.cache:
        args.cache.mkdir(parents=True, exist_ok=True)
    catalog = json.loads((ROOT / "data/augment-catalog.json").read_text(encoding="utf-8"))
    icons: dict[str, set[str]] = {}
    for row in catalog["rows"]:
        if row["icon"] and not row["icon"].startswith(("t_missing-", "missing-")):
            icons.setdefault(row["icon"], set()).add(TIERS[row["rarity"]])

    def prepare(item: tuple[str, set[str]]) -> list[str]:
        key, tiers = item
        try:
            source = texture(key, args.cache)
            outputs = []
            for tier in sorted(tiers):
                name = f"{tier}/{key}"
                dest = ROOT / "public/assets/augment-icons" / f"{name}.webp"
                dest.parent.mkdir(parents=True, exist_ok=True)
                art = render(source, tier)
                # 128 px covers the 34 px catalog icons and their high-density displays.
                art.thumbnail((128, 128), Image.Resampling.LANCZOS)
                art.save(dest, "WEBP", quality=90, method=6)
                outputs.append(name)
            return outputs
        except (OSError, ValueError) as error:
            raise ValueError(f"{key}: {error}") from error

    with ThreadPoolExecutor(max_workers=8) as pool:
        paths = sorted(name for outputs in pool.map(prepare, sorted(icons.items())) for name in outputs)
    index = ROOT / "data/augment-art.json"
    index.write_text(json.dumps(paths, indent=2) + "\n", encoding="utf-8")
    print(f"Rendered {len(paths)} tier icons from {len(icons)} textures.")


if __name__ == "__main__":
    main()

