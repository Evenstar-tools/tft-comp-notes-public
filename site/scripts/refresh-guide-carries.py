"""Refresh board-specific carry samples from the public S19 PBE Explorer."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from guide_stats_window import current_window, scoped_url

DATA = Path(__file__).resolve().parents[1] / "data"
EXPLORER = "https://www.metatft.com/explorer?"
API = "https://api-hc.metatft.com/tft-explorer-api/"
LOOKUP = "https://data.metatft.com/lookups/TFTSet19_pbe_en_us.json"
FULL_GEAR = {"Item.Equippable.Item." + tag for tag in ("Craftable", "Radiant", "Artifact", "Support")}
FORMS = {"akali-kda": "DA_AkaliKDA19", "akali-true-damage": "DA_Akali_TrueDamage19",
         "seraphine": "DA_Seraphine19_Indie", "elise": "DA_Elise19", "nidalee": "DA_Nidalee19", "shyvana": "DA_Shyvana19"}


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def fetch(url):
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0",
                                    "Referer": "https://www.metatft.com/"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=28) as response:
                payload = json.load(response)
                if payload.get("filter_adjustment"):
                    raise ValueError("Source adjusted the requested filters")
                return payload
        except HTTPError as err:
            if attempt or err.code not in (502, 503, 504):
                raise


def single(candidates, name):
    if len(candidates) != 1:
        raise ValueError(f"Cannot resolve form or tier for {name}: {candidates}")
    return candidates[0]


def key(name):
    return re.sub("[^a-z0-9]", "", name.lower())


def audit_games(records, plan, window, units, required, traits, full_gear, item_ids, augment_id):
    carry = units[plan["carryId"]]
    tank = units[plan["tankId"]]
    emblem = plan.get("emblem")
    carry_items, tank_items = ({item_ids.get(i, i) for i in plan[k]} for k in ("carryItems", "tankItems"))
    seen = set()
    completed = loadouts = with_augments = 0
    special_counts = [0] * 8
    for record in records:
        placement = record["placement"]
        identity = (record["match_id"], placement)
        if (record["set"] != "TFTSet19" or record["patch"] != window["patch"]
                or record.get("b_patch_version") != window["b_patch"] or str(record["queue"]) != "1090"
                or not re.fullmatch(r"PBE1_\d+", str(identity[0])) or type(placement) is not int or not 1 <= placement <= 8):
            raise ValueError("Unexpected recent match cohort")
        if identity in seen:
            continue
        tiers = record["unit_tier_numitems"]
        if not all(any(re.fullmatch(pattern, tier) for tier in tiers) for pattern in required):
            continue
        if (not set(traits) <= set(record["traits"])
                or (plan.get("level") and str(record["level"]) != str(plan["level"]))):
            continue
        seen.add(identity)
        builds = [value.split("&", 1) for value in record.get("unit_buildNames") or [] if "&" in value]
        gear = [items.split("|") for unit, items in builds if unit == carry]
        tank_gear = {name for unit, items in builds if unit == tank for name in items.split("|")}
        # Distinct copies can have different stars and items. The feed doesn't
        # join those arrays by instance, so skip ambiguous duplicates.
        if len(gear) != 1 or sum(t.startswith(carry + "_") for t in tiers) != 1:
            continue
        items = gear[0]
        three = len(items) == 3 and all(i in full_gear or (emblem and i == emblem) for i in items)
        if not three:
            continue
        completed += 1
        loadouts += bool(set(items) & carry_items and tank_gear & tank_items)
        if augment_id and record.get("augments"):
            with_augments += 1
        if (augment_id and augment_id in (record.get("augments") or [])) or (emblem and items.count(emblem) == 1):
            special_counts[placement - 1] += 1
    return ({"recentGames": len(seen), "completedGames": completed, "loadoutGames": loadouts,
             "withAugments": with_augments}, special_counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DATA / "guide-carry-stats.json")
    args = parser.parse_args()
    plans, season, source = read("guide-carry-queries.json"), read("season.json"), fetch(LOOKUP)
    build, window = current_window(DATA)
    patch = window["patch"]
    release = re.fullmatch(r"rls-(19\.\d+)\.\d+\.(\d+)\.Set19\.Shipping\.pbe", source["_metadata"]["release"])
    if (source["_metadata"]["set"] != "TFTSet19" or not season["id"].startswith(f"s19-pbe-{patch}.")
            or not release or release.groups() != (patch, build)):
        raise ValueError("S19 PBE season and lookup do not match")
    known = {unit["id"]: unit for unit in season["units"]}
    used = {unit for plan in plans for unit in [plan["carryId"], *plan["anchorIds"]]}
    units = {}
    for uid in used:
        unit = known[uid]
        matches = [u["apiName"] for u in source["units"] if u.get("shopUnit") and u["cost"] == unit["cost"]
                   and (u["apiName"] == FORMS[uid] if uid in FORMS else key(u["name"]) == key(unit["nameEn"]))]
        units[uid] = single(matches, uid)
    source_traits = {t["name"]: t for t in source["traits"] if t["apiName"].startswith("DA_")}
    traits = {t["id"]: t for t in season["traits"]}
    trait_names = read("trait-reference.json")
    augments = {a["unitId"]: a["id"] for a in read("hero-augments.json")}
    full = {i["apiName"] for i in source["items"] if FULL_GEAR.intersection(i.get("tags", []))
            and not i.get("associatedTraits") and "thiefsgloves" not in i["apiName"].lower()
            and not any(t.endswith((".Emblem", ".Component")) for t in i.get("tags", []))}
    item_ids = {k: v["pbeId"] for k, v in read("item-reference.json")["items"].items() if v.get("pbeId")}
    base = [*window.items(), ("compact", "true"), ("formatnoarray", "true"), ("permit_filter_adjustment", "false")]

    def query(plan):
        carry_id = plan["carryId"]
        carry = known[carry_id]
        stars = 3 if carry["cost"] <= 3 else 2
        filters = [("unit", units[carry_id] + f"-1_{stars}_3")]
        required = [units[carry_id] + f"_{stars}_3"]
        descriptions = []
        for uid in plan["anchorIds"]:
            tier = plan.get("anchorStars", {}).get(uid)
            filters.append(("unit", units[uid] + (f"-1_{tier}" if tier else "-1")))
            required.append(units[uid] + (f"_{tier}_[0-3]" if tier else "_[1-4]_[0-3]"))
            descriptions.append(known[uid]["name"] + ("三星" if tier == 3 else ""))
        thresholds = []
        for tid, minimum in plan["traits"].items():
            trait = traits[tid]
            src = source_traits[trait["nameEn"]]
            # The live ability lookup includes placeholder and duplicate effect
            # levels for dynamic traits. Explorer uses the playable tier index.
            index = trait["thresholds"].index(minimum) + 1
            thresholds.append(src["apiName"] + "_" + str(index))
            descriptions.append(str(minimum) + (trait_names.get(tid, {}).get("gameName") or trait["name"]))
        filters.extend(("trait", t) for t in thresholds)
        if plan.get("level"):
            filters.append(("level", str(plan["level"])))
        params = []
        for kind, value in filters:
            if kind in ("trait", "level"):
                params.append((kind, value))
            elif value.endswith("-1"):
                params.append(("unit_unique", value))
            else:
                params.append(("unit_tier_numitems_unique", value if value.rpartition("-")[2].count("_") == 2 else value + "_.*"))
        suffix = "?" + urlencode([*base, *params])
        records = fetch(API + "recent_matches" + suffix)["data"]
        audit, verified = audit_games(records, plan, window, units, required, thresholds, full, item_ids,
                                      augments[carry_id] if plan.get("augment") else None)
        special = "augment" if plan.get("augment") else "emblem" if plan.get("emblem") else None
        if special:
            counts = verified
        else:
            totals = fetch(API + "total" + suffix)["data"]
            if not isinstance(totals, list) or len(totals) > 1:
                raise ValueError("Invalid aggregate")
            counts = totals[0]["placement_count"] if totals else [0] * 8
        if len(counts) != 8 or any(type(n) is not int or n < 0 for n in counts):
            raise ValueError(f"Invalid placement buckets for {plan['board']}")
        args = [("set","TFTSet19"), *filters]
        result = {k: plan[k] for k in ("sectionId","teamId","sameNine") if k in plan}
        return {**result, "carryId":carry_id, "carryName":carry["name"], "stars":stars, "slots":3,
                "anchorIds":plan["anchorIds"], "tankName":known[plan["tankId"]]["name"],
                "scope":"九人口 · 同九张棋子" if plan.get("sameNine") else "、".join(descriptions),
                "games":sum(counts), "placementCounts":counts, "kind":special or "slots", **audit,
                "gearComparable":bool(plan["carryItems"] and plan["tankItems"]),
                "url":scoped_url(EXPLORER + urlencode([("tab","games" if special else "units"), *args]), window)}

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = list(pool.map(query, plans))
    if not any(r["games"] >= 100 and r["completedGames"] > 0 for r in rows):
        raise ValueError("No usable anchor sample. Keeping previous file.")
    out = {"seasonId":season["id"],"queue":"PBE","patch":patch + window["b_patch"],"build":build,
           "window":"热补后","days":3,"minGames":100,
           "updatedAt":datetime.now(timezone.utc).isoformat(timespec="seconds"),"rows":rows}
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=args.out.parent, delete=False) as f:
        json.dump(out, f, ensure_ascii=False, separators=(",",":"), allow_nan=False)
        f.write("\n")
    Path(f.name).replace(args.out)
    print(f"{len(rows)} carry filters saved to {args.out}")


if __name__ == "__main__":
    main()
