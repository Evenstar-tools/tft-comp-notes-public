"""Rebuild guide equipment samples from a saved MetaTFT builds table and its EN lookup.

Usage: python scripts/import-guide-builds.py meta-core-matched-loadouts.json core-meta-lookup.json 2026-11-19
"""
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
SCOPES = [
    ("jinx7-l8", "00000000-0000-4000-8000-000000000007", "jinx", "ionic-spark", 7, "Jinx19-1_2_3", 8, "IonicSpark19_3"),
    ("jinx7-l9", "00000000-0000-4000-8000-000000000031", "jinx", "ionic-spark", 7, "Jinx19-1_2_3", 9, "IonicSpark19_3"),
    ("xayah4-l9", "00000000-0000-4000-8000-000000000104", "xayah", "gu-feng", 4, "Xayah19-1_2_3", 9, "Heavenscale19_3"),
    ("malzahar5-l7", "00000000-0000-4000-8000-000000000017", "malzahar", "prodigy", 5, "Malzahar19-1_3_3", 7, "Prodigy19_4"),
    ("malzahar5-l9", "00000000-0000-4000-8000-000000000071", "malzahar", "prodigy", 5, "Malzahar19-1_3_3", 9, "Prodigy19_4"),
    ("kayle7-l8", "00000000-0000-4000-8000-000000000064", "kayle", "pentakill", 7, "Kayle19-1_2_3", 8, "Pentakill19_3"),
]


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def main(source, lookup, date):
    raw = read(source)
    existing = read(ROOT / "data/item-reference.json")["items"]
    by_api = {item["pbeId"]: key for key, item in existing.items() if item.get("components")}
    by_name = {item["name"]: by_api[item["apiName"]] for item in read(lookup)["items"] if item["apiName"] in by_api}
    records = []
    for key, board_id, unit, trait, tier, unit_query, level, trait_query in SCOPES:
        snap = raw[key]
        query = parse_qs(urlparse(snap["url"]).query)
        expected = {"tab": "builds", "set": "TFTSet19", "unit": "DA_" + unit_query, "trait": "DA_" + trait_query, "level": str(level)}
        if any(query.get(k) != [v] for k, v in expected.items()) or snap["mode"] != ["PBE", "19.1", "Last 3 Days"]:
            raise ValueError(f"{key}: scope or patch differs")
        champion = unit_query.split("19")[0]
        builds = []
        seen = set()
        for row in snap["rows"]:
            icons = [s for s in row[0]["images"] if s != "Unlockable Unit"]
            if len(icons) != 4 or icons[0] != champion or not all(name in by_name for name in icons[1:]):
                continue
            items = tuple(sorted(by_name[name] for name in icons[1:]))
            if items in seen:
                raise ValueError(f"{key}: duplicate three-item sample")
            seen.add(items)
            games = int(row[-1]["text"].splitlines()[0].replace(",", ""))
            mean = float(row[1]["text"])
            if games < 1 or not 1 <= mean <= 8:
                raise ValueError(f"{key}: invalid result")
            builds.append({"items": items, "games": games, "mean": mean})
        if not builds:
            raise ValueError(f"{key}: no champion builds")
        records.append({"teamId": board_id, "unitId": unit, "traitId": trait, "tier": tier, "level": level,
                        "stars": int(unit_query.split("_")[1]), "url": snap["url"], "builds": builds})
    used_ids = {item for record in records for build in record["builds"] for item in build["items"]}
    names = {item["id"]: item["name"] for item in read(ROOT / "data/season.json")["items"] if item["id"] in used_ids}
    if used_ids != names.keys():
        raise ValueError("Missing game item names")
    output = {"season": "s19-pbe-19.1.", "patch": "PBE 19.1", "date": date, "windowDays": 3, "itemNames": names, "records": records}
    (ROOT / "data/guide-item-builds.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(*sys.argv[1:])
