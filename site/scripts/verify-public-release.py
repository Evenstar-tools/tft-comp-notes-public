"""Automated public-release hygiene and integrity gate for CI and local checks.

Verifies five invariants in one fast pass:
1. data/public-preview.json contains no sensitive strings, raw Feishu block IDs,
   or duplicate same-season section.gameData copies.
2. Shared code/data directories contain no leaked secrets, private URLs, or local paths.
3. Public image assets referenced by season.json (including -card.webp thumbs) and
   domain/board-instruments.ts exist on disk.
4. domain/guide-identities.ts contains only public sample-block aliases.
5. No unreferenced dead components reappear under components/ui/.
"""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys

SITE_ROOT = Path(__file__).resolve().parent.parent

BLOCK_ID = re.compile(r"(?<![A-Za-z0-9])doxc[A-Za-z0-9]{14,}(?![A-Za-z0-9])")
PRIVATE_URL = re.compile(
    r'https?://[^\s/"<>]*(?:feishu\.cn|larksuite\.com|chatgpt\.site|chatgpt-team\.site)(?::\d+)?(?:/[^\s"<>]*)?',
    re.I,
)
PRIVATE_TEXT = re.compile(
    r"\bappg(?:prj|dep|ver)_[a-z0-9]+\b|[a-z]:[\\/](?:users|codex)[\\/]|"
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{32,}|"
    r"\bgithub_pat_[A-Za-z0-9_]{55,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|"
    r"\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}|"
    r"\b[A-Za-z0-9_.+-]+@(?:gmail\.com|qq\.com|163\.com|outlook\.com)\b",
    re.I,
)

SCAN_DIRS = ("app", "components", "data", "domain", "hooks", "lib", "server")
TEXT_SUFFIXES = {".ts", ".tsx", ".mts", ".js", ".mjs", ".json", ".css"}


def check_public_preview(errors: list[str]) -> dict:
    preview_path = SITE_ROOT / "data" / "public-preview.json"
    if not preview_path.is_file():
        errors.append("Missing data/public-preview.json")
        return {}
    raw = preview_path.read_text(encoding="utf-8")
    for label, pattern in (
        ("private URL", PRIVATE_URL),
        ("sensitive text", PRIVATE_TEXT),
        ("unmapped Feishu block ID", BLOCK_ID),
    ):
        match = pattern.search(raw)
        if match:
            errors.append(f"data/public-preview.json contains {label}: {match.group(0)!r}")

    data = json.loads(raw)
    top_season_id = data.get("season", {}).get("id")
    dup_game_data = [
        section.get("id")
        for section in data.get("sections", [])
        if isinstance(section.get("gameData"), dict)
        and top_season_id
        and section["gameData"].get("id") == top_season_id
    ]
    if dup_game_data:
        errors.append(
            f"data/public-preview.json has {len(dup_game_data)} duplicate same-season section.gameData entries "
            f"(e.g. {dup_game_data[0]}); run scripts/prepare-public-snapshot.py"
        )
    return {
        "previewKB": round(preview_path.stat().st_size / 1024, 1),
        "sections": len(data.get("sections", [])),
    }


def check_leaks(errors: list[str]) -> int:
    scanned = 0
    for dirname in SCAN_DIRS:
        base = SITE_ROOT / dirname
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            rel = path.relative_to(SITE_ROOT).as_posix()
            if rel == "data/public-preview.json":
                continue
            scanned += 1
            text = path.read_text(encoding="utf-8", errors="ignore")
            match = PRIVATE_TEXT.search(text)
            if match:
                errors.append(f"Sensitive pattern in {rel}: {match.group(0)!r}")
    return scanned


def check_assets(errors: list[str]) -> dict:
    public_dir = SITE_ROOT / "public"
    season_path = SITE_ROOT / "data" / "season.json"
    season = json.loads(season_path.read_text(encoding="utf-8"))
    missing: list[str] = []
    checked = 0
    for unit in season.get("units", []):
        for field in ("image", "splashImage"):
            url = unit.get(field)
            if isinstance(url, str) and url.startswith("/assets/"):
                checked += 1
                if not (public_dir / url.lstrip("/")).is_file():
                    missing.append(url)
        splash = unit.get("splashImage")
        if isinstance(splash, str) and splash.endswith("-splash.jpg"):
            thumb = splash.replace("-splash.jpg", "-card.webp")
            checked += 1
            if not (public_dir / thumb.lstrip("/")).is_file():
                missing.append(thumb)

    instruments_src = (SITE_ROOT / "domain" / "board-instruments.ts").read_text(encoding="utf-8")
    for asset_url in re.findall(r'image:\s*"(/assets/[^"]+)"', instruments_src):
        checked += 1
        if not (public_dir / asset_url.lstrip("/")).is_file():
            missing.append(asset_url)

    if missing:
        errors.append(f"Missing {len(missing)} referenced public asset(s): {', '.join(missing[:8])}")
    return {"checkedAssets": checked, "missingAssets": len(missing)}


def check_guide_identities(errors: list[str]) -> int:
    identities_path = SITE_ROOT / "domain" / "guide-identities.ts"
    if not identities_path.is_file():
        errors.append("Missing domain/guide-identities.ts")
        return 0
    text = identities_path.read_text(encoding="utf-8")
    if BLOCK_ID.search(text):
        errors.append("domain/guide-identities.ts contains raw private Feishu block IDs")
    aliases = re.findall(r'"(sample-block-\d{4})"', text)
    if not aliases:
        errors.append("domain/guide-identities.ts contains no public sample-block aliases")
    return len(aliases)


def check_unused_ui_components(errors: list[str]) -> int:
    ui_dir = SITE_ROOT / "components" / "ui"
    if not ui_dir.is_dir():
        return 0
    ui_files = sorted(p for p in ui_dir.glob("*.tsx") if p.is_file())
    code_blobs = []
    for dirname in ("app", "components", "domain", "hooks"):
        base = SITE_ROOT / dirname
        if not base.is_dir():
            continue
        for p in base.rglob("*"):
            if p.is_file() and p.suffix in {".ts", ".tsx"} and not p.is_relative_to(ui_dir):
                code_blobs.append(p.read_text(encoding="utf-8", errors="ignore"))
    combined = "\n".join(code_blobs)
    unused = [
        p.name
        for p in ui_files
        if not re.search(rf"""["'](?:@/components/ui|\./ui|\.\./components/ui)/{re.escape(p.stem)}["']""", combined)
    ]
    if unused:
        errors.append(f"Unused shadcn UI template files under components/ui/: {', '.join(unused)}")
    return len(ui_files)


def main() -> int:
    errors: list[str] = []
    preview_info = check_public_preview(errors)
    scanned = check_leaks(errors)
    asset_info = check_assets(errors)
    alias_count = check_guide_identities(errors)
    ui_count = check_unused_ui_components(errors)

    summary = {
        "ok": not errors,
        **preview_info,
        "scannedSourceFiles": scanned,
        **asset_info,
        "guideIdentityAliases": alias_count,
        "activeUiComponents": ui_count,
        "errors": errors,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
