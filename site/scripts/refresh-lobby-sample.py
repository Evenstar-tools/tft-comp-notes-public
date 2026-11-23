"""Refresh anonymous S19 PBE lobbies from the unfiltered MetaTFT recent-games feed.

Run from the site with: python scripts/refresh-lobby-sample.py
Repeated runs append new complete lobbies and retain prior builds for patch notes.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RECENT = "https://api-hc.metatft.com/tft-explorer-api/recent_matches?formatnoarray=true&compact=true&queue=PBE&patch=current&days=3&permit_filter_adjustment=true"
DETAIL = "https://matches3.metatft.com/"
FAMILIES = json.loads((ROOT / "data/lobby-families.json").read_text(encoding="utf-8"))
MATCH_ID = re.compile(r"PBE1_[0-9]+")


def fetch(url):
    request = Request(url, headers={"User-Agent": "TFT-Notes/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=18) as response:
        return json.load(response)


def classify(player):
    stars = {}
    for unit in player["units"]:
        key = unit["character_id"]
        stars[key] = max(stars.get(key, 0), unit["tier"])
    traits = {t["name"]: t["num_units"] for t in player["traits"] if t["tier_current"] > 0}
    return [rule["id"] for rule in FAMILIES
            if traits.get(rule["trait"], 0) >= rule["min"]
            and all(stars.get(name, 0) >= tier for name, tier in rule["units"].items())]


def normalize(raw, expected):
    info = raw["info"]
    if raw["metadata"].get("match_id") != expected or not MATCH_ID.fullmatch(expected):
        return None
    if (info.get("tft_set_core_name") != "TFTSet19" or info.get("queue_id") != 1090
            or info.get("tft_game_type") != "standard"):
        return None
    version = raw.get("_metatft", {}).get("patch_resolution", {}).get("client_version", "")
    build = re.fullmatch(r"rls-(19\.\d+\.\d+\.\d+)\.Set19\.Shipping\.pbe", version)
    players = sorted(info["participants"], key=lambda p: p["placement"])
    if not build or [p["placement"] for p in players] != list(range(1, 9)):
        return None
    if any(not player.get("units") or "traits" not in player for player in players):
        return None
    return {"id": expected, "build": build[1], "at": info["game_datetime"], "seats": [classify(p) for p in players]}


def collect(match_id):
    try:
        return normalize(fetch(DETAIL + match_id + ".json"), match_id)
    except HTTPError as exc:
        if exc.code == 429:
            raise
        print(f"Skip {match_id}: HTTP {exc.code}", file=sys.stderr)
        return None
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Skip {match_id}: {exc}", file=sys.stderr)
        return None


def player_recent(player, seed_time):
    name, tag = player.get("riotIdGameName"), player.get("riotIdTagline")
    if not name or not tag:
        return []
    url = "https://api.metatft.com/public/profile/lookup_by_riotid/PBE1/" + quote(name, safe="") + "/" + quote(tag, safe="")
    try:
        matches = fetch(url)["matches"]
        eligible = [m for m in matches if m.get("queue_id") == 1090 and m.get("tft_set") == "TFTSet19"
                    and seed_time - 3 * 86400000 <= m["match_timestamp"] < seed_time
                    and MATCH_ID.fullmatch(m["riot_match_id"])]
        return [m["riot_match_id"] for m in sorted(eligible, key=lambda m: -m["match_timestamp"])[:7]]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Skipped unavailable public match history: {type(exc).__name__}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "data/lobby-sample.json")
    parser.add_argument("--with-history", action="store_true",
                        help="also take up to 7 previous standard games of every player in the newest lobby")
    args = parser.parse_args()
    saved = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else []
    known = {rec["id"]: rec for rec in saved}
    try:
        recent = fetch(RECENT)["data"]
    except (OSError, ValueError, KeyError) as exc:
        raise SystemExit(f"Recent-games feed unavailable; snapshot retained. {exc}") from None
    if not recent:
        raise SystemExit("Recent-games feed is empty; snapshot retained.")
    ids = {row["match_id"] for row in recent if MATCH_ID.fullmatch(row["match_id"])}
    latest_ids = ids.copy()
    if args.with_history and ids:
        seed_id = max((row for row in recent if row["match_id"] in ids), key=lambda row: row["__time"])["match_id"]
        try:
            seed = fetch(DETAIL + seed_id + ".json")
        except HTTPError as exc:
            if exc.code == 429:
                raise SystemExit(f"Source rate-limited; snapshot retained. Retry after {exc.headers.get('Retry-After', 'the next refresh')}.") from None
            seed = None
        if seed and normalize(seed, seed_id):
            seed_time = seed["info"]["game_datetime"]
            with ThreadPoolExecutor(max_workers=3) as pool:
                for prior in pool.map(lambda p: player_recent(p, seed_time), seed["info"]["participants"]):
                    ids.update(prior)
    rows = []
    pending = sorted(latest_ids - known.keys(), reverse=True) + sorted(ids - latest_ids - known.keys(), reverse=True)
    for match_id in pending:
        try:
            record = collect(match_id)
        except HTTPError as exc:
            print(f"Feed rate-limited; retained all complete lobbies. Retry after {exc.headers.get('Retry-After', 'the next refresh')}.", file=sys.stderr)
            break
        if record:
            rows.append(record)
        time.sleep(1)
    if not rows:
        print(f"No new complete lobbies. Retained {len(known)}.")
        if not set(ids) & known.keys():
            raise SystemExit(1)
        return
    known.update({r["id"]: r for r in rows})
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=args.out.parent, delete=False) as out:
        out.write("[\n" + ",\n".join(json.dumps(rec, separators=(",", ":")) for rec in
                                   sorted(known.values(), key=lambda r: (r["at"], r["id"]))) + "\n]\n")
        temporary = Path(out.name)
    temporary.replace(args.out)
    print(f"Added {len(rows)} complete lobbies; total {len(known)}.")


if __name__ == "__main__":
    main()
