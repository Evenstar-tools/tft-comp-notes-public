"""Build the public S19 eight-population roster shards from the research archive."""
import argparse
import json
import re
from pathlib import Path


ROW_FIELDS = [
    "unitIndices", "dataMax", "siteMax", "dataOne", "siteOne",
    "oneCopyCost", "maxCost", "unlockFiveCount", "upgradeMask",
]


def check(condition, message):
    if not condition:
        raise ValueError(message)


def emit(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")


def make_units(raw_units, trait_ids):
    units = []
    for raw in raw_units:
        has_unlock = bool(raw["unlock"] or raw["siteUnlock"])
        unit = {
            "id": raw["id"], "name": raw["name"], "cost": raw["cost"],
            "population": raw["population"], "unlockFive": raw["cost"] == 5 and has_unlock,
            "dataTraits": raw["traits"], "siteTraits": raw["siteTraits"],
        }
        check(re.fullmatch(r"[a-z0-9-]+", unit["id"]), f"Unsafe unit ID: {unit['id']}")
        check(unit["cost"] in (1, 2, 3, 4, 5, 7), f"Unknown cost: {unit['id']}")
        for key in ("dataTraits", "siteTraits"):
            ids = unit[key]
            check(set(ids) <= trait_ids and len(ids) == len(set(ids)), f"Invalid {key}: {unit['id']}")
        units.append(unit)
    check(len({u["id"] for u in units}) == len(units), "Duplicate unit ID")
    return units


def trait_masks(units, traits, key):
    """An integer per trait encodes the qualifying units of one source."""
    return [
        (sum(1 << i for i, unit in enumerate(units) if trait["id"] in unit[key]),
         trait["threshold"], trait["mode"] == "stars")
        for trait in traits
    ]


def active_traits(masks, board, upgrades):
    return sum(
        ((members & board).bit_count() + ((members & upgrades).bit_count() if by_stars else 0))
        >= threshold
        for members, threshold, by_stars in masks
    )


def cheapest_plan(indices, units):
    # Both sources use the same K/DA members, 3 total stars, and a 2-star cap.
    kda_slots = [slot for slot, i in enumerate(indices) if "k-da" in units[i]["dataTraits"]]
    if len(kda_slots) != 2:
        return 0
    slot = min(kda_slots, key=lambda s: (units[indices[s]]["cost"], units[indices[s]]["id"]))
    return 1 << slot


def group_stats(rows):
    return {
        "count": len(rows),
        "atLeast": {str(n): sum(min(r[1], r[2]) >= n for r in rows) for n in (8, 9, 10, 11)},
        "pureFour": sum(r[6] <= 4 for r in rows),
        "withUnlockFive": sum(r[7] > 0 for r in rows),
        "withSeven": sum(r[6] == 7 for r in rows),
        "withUpgradeForMax": sum(r[8] != 0 for r in rows),
        "withUpgradeForEight": sum(min(r[3], r[4]) < 8 for r in rows),
        "oneCopyCostRange": [min(r[5] for r in rows), max(r[5] for r in rows)] if rows else [],
        "maxBySource": [max((r[1] for r in rows), default=0), max((r[2] for r in rows), default=0)],
    }


def generate(source, destination):
    raw = json.loads(source.read_text(encoding="utf-8-sig"))
    traits = [
        {"id": t["id"], "name": t["name"], "siteName": t["localName"],
         "threshold": t["threshold"], "mode": t["mode"]}
        for t in raw["traits"]
    ]
    trait_ids = {t["id"] for t in traits}
    check(len(trait_ids) == len(traits) and "collab" not in trait_ids, "Invalid countable traits")
    check(all(t["levels"][0] == t["threshold"] for t in raw["traits"]), "First trait tier differs")
    check(all(t["mode"] in {"units", "stars"} and t["threshold"] > 0 for t in traits),
          "Unrecognized counting mode or threshold")
    check([(t["id"], t["threshold"]) for t in traits if t["mode"] == "stars"] == [("k-da", 3)],
          "K/DA star rule changed")
    units = make_units(raw["units"], trait_ids)
    check(all(("k-da" in u["dataTraits"]) == ("k-da" in u["siteTraits"]) for u in units),
          "Source K/DA memberships diverged; re-evaluate minimum shared upgrades")
    check(not {"sona", "smeech"} & {u["id"] for u in units}, "Level-locked unit in archive")
    data_masks = trait_masks(units, traits, "dataTraits")
    site_masks = trait_masks(units, traits, "siteTraits")
    jazz_mask = [data_masks[next(i for i, t in enumerate(traits) if t["id"] == "jazz")]]
    seen = set()
    groups = {"default": [], "high": []}
    for n, entry in enumerate(raw["rows"], 1):
        indices, data, site, price, highest, jazz, unlocks, grp, five = entry
        label = f"Source row {n}, units {indices}"
        key = tuple(indices)
        check(indices == sorted(indices) and key not in seen, f"{label}: duplicate/unsorted roster")
        seen.add(key)
        check(all(0 <= i < len(units) for i in indices), f"{label}: invalid unit index")
        original = [raw["units"][i] for i in indices]
        team = [units[i] for i in indices]
        check(len({u["nameEn"] for u in original}) == len(team), f"{label}: duplicate hero identity")
        check(sum(u["population"] for u in team) == 8, f"{label}: population")
        board = sum(1 << i for i in indices)
        upgrade_mask = cheapest_plan(indices, units)
        upgrades = sum(1 << i for slot, i in enumerate(indices) if (upgrade_mask >> slot) & 1)
        for source_name, masks, source_counts in (("data", data_masks, data), ("site", site_masks, site)):
            one = active_traits(masks, board, 0)
            maximum = active_traits(masks, board, board)
            actual = active_traits(masks, board, upgrades)
            check(source_counts == [maximum, one] and actual == maximum, f"{label}: {source_name} counts")
        need_upgrade = data[0] > data[1] or site[0] > site[1]
        check(upgrade_mask.bit_count() == int(need_upgrade), f"{label}: non-minimal upgrade plan")
        by_cost = (sum(u["cost"] for u in team), max(u["cost"] for u in team),
                   sum(u["unlockFive"] for u in team))
        high = any(u["cost"] == 7 or (u["cost"] == 5 and not u["unlockFive"]) for u in team)
        check((price, highest, five) == by_cost and grp == high, f"{label}: cost group")
        check(unlocks == sum(bool(u["unlock"] or u["siteUnlock"]) for u in original),
              f"{label}: unlocked units")
        check(jazz == active_traits(jazz_mask, board, upgrades), f"{label}: jazz")
        if min(data[0], site[0]) >= 8:
            groups["high" if high else "default"].append(
                [indices, data[0], site[0], data[1], site[1], price, highest, five, upgrade_mask]
            )
    for rows in groups.values():
        rows.sort(key=lambda r: (-min(r[1], r[2]), -r[1], -r[2], r[6], r[5], r[0]))
    summary = {key: group_stats(rows) for key, rows in groups.items()}
    source_stats = raw["stats"]
    total = sum(group["count"] for group in summary.values())
    check(source_stats["total"] == len(seen) and total == source_stats["bothSources"],
          "Archive aggregate counts differ")
    for key, source_key in (("default", "default"), ("high", "expensive")):
        stats = summary[key]
        archived = source_stats[source_key]
        check((stats["count"], stats["pureFour"], stats["withUnlockFive"], stats["atLeast"])
              == (archived["both"], archived["pureFourBoth"], archived["unlockFiveBoth"], archived["bothCounts"]),
              f"{key}: archive group aggregates differ")
    meta = {
        "season": "s19", "sourceDate": "2026-11-16", "formatVersion": 1,
        "sourceCount": len(seen), "total": total, "exhaustive": source_stats["complete"],
        "population": 8, "starCap": 2, "minimumTraits": 8,
        "rosterKey": "ASCII-sorted unit IDs joined by '.'",
        "upgradeMask": "Bit p upgrades unitIndices[p]. Minimum upgrades for both sources' maximum counts; cheapest unit, then ASCII ID.",
        "sources": [
            {"key": "data", "name": "DataTFT", "url": "https://www.datatft.com/database?season=19"},
            {"key": "site", "name": "站内（MetaTFT / 本地基线）", "url": "https://www.metatft.com/new-set"},
        ],
        "rowFields": ROW_FIELDS, "units": units, "traits": traits, "groups": summary,
    }
    for key, rows in groups.items():
        emit(destination / "public" / "combos" / f"s19-{key}.json", rows)
    emit(destination / "data" / "combos-s19-meta.json", meta)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="archived 组合数据.json")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1],
                        help="root containing public/ and data/ (default: script's project root)")
    args = parser.parse_args()
    print(json.dumps(generate(args.source, args.out), ensure_ascii=False))
