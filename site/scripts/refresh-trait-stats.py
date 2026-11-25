"""Refresh public MetaTFT exact-tier placement counts and an independently scoped NoxuTFT comparison.

Run from any directory with Python 3, requests and beautifulsoup4.
The published snapshot is replaced only after the complete primary data batch passes validation.
"""
import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, urlencode, urlsplit

from guide_stats_window import current_window
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DATA = Path(__file__).resolve().parents[1] / "data"
ENDPOINT = "https://api-hc.metatft.com/tft-explorer-api/traits"
NOXU = "https://noxutft.com/zh/tft-traits"
S19_LOOKUP = "https://data.metatft.com/lookups/TFTSet19_pbe_zh_cn.json"
RENATA = "https://www.metatft.com/explorer?set=TFTSet19&level=8&unit=DA_RenataGlasc19-1_3_3&unit=DA_Nasus19-1"
DAYS = 3
BOARD_FILTERS = {
    "duplicate_unit_count": ("无重复弈子", "重复弈子"),
    "emblem_count": ("无纹章", "纹章"),
    "tactician_item_count": ("无人口装", "人口装"),
}


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def fetch(url, params=None):
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=Retry(total=2, backoff_factor=0.6, status_forcelist=[429, 502, 503, 504])))
        response = session.get(url, params=params, timeout=(7, 30))
        response.raise_for_status()
        return response


def published_scopes(mapping):
    groups = {}
    for url in [RENATA, *(row["url"] for row in load(DATA / "guide-placement.json")["records"])]:
        parts = [(key, value) for key, value in parse_qsl(urlsplit(url).query)
                 if key not in {"queue", "patch", "b_patch", "days"}]
        if ("set", "TFTSet19") not in parts:
            continue
        units = sorted(set(v for k, v in parts if k == "unit"))
        levels = [v for k, v in parts if k == "level"]
        if len(levels) > 1 or any(k not in ("set", "tab", "unit", "level", "trait", *BOARD_FILTERS) for k, _ in parts):
            raise ValueError(f"Unsupported guide query: {url}")
        restrictions = sorted((key, value) for key, value in parts if key in BOARD_FILTERS)
        if len({key for key, _ in restrictions}) != len(restrictions) or any(not value.isascii() or not value.isdecimal() for _, value in restrictions):
            raise ValueError(f"Invalid board restrictions: {url}")
        pins = sorted(set(v for k, v in parts if k == "trait"))
        if any(pin not in mapping for pin in pins):
            raise ValueError(f"Unknown S19 board trait in {url}")
        # Keep every other pin while comparing a particular trait's tiers.
        compared_traits = {mapping[pin][0] for pin in pins}
        variants = [pins, *([pin for pin in pins if mapping[pin][0] != compared] for compared in compared_traits)]
        for fixed in variants:
            key = ",".join([levels[0] if levels else "", *units, *fixed, *(f"{k}={v}" for k, v in restrictions)])
            groups[key] = levels, units, fixed, restrictions
    return groups


def placements(window, filters=()):
    params = [*window.items(), ("formatnoarray", "true"), ("compact", "true"),
              ("permit_filter_adjustment", "false"), *filters]
    body = fetch(ENDPOINT, params).json()
    rows = body.get("data")
    if body.get("filter_adjustment") or not isinstance(rows, list):
        raise ValueError(f"Invalid MetaTFT response for {filters}")
    result = {}
    for row in rows:
        key = row["traits"]
        if not key:
            continue
        values = row["placement_count"]
        if not isinstance(key, str) or key in result or len(values) != 8 or any(type(n) is not int or n < 0 for n in values):
            raise ValueError(f"Invalid placement bucket {key}")
        if sum(values):
            result[key] = values
    return result


def lookup_mapping(lookup, season):
    if lookup["_metadata"]["set"] != "TFTSet19" or lookup["_metadata"]["patch"] != "pbe":
        raise ValueError("S19 PBE lookup is required")
    traits = {row["en_name"].casefold(): row for row in lookup["traits"]}
    mapping = {}
    sources = {}
    for row in season["traits"]:
        reference = traits[row["nameEn"].casefold()]
        tiers = [effect["minUnits"] for effect in reference["effects"]]
        if row["id"] == "beach-pop" and tiers == [0]:
            # This unit-granted trait has a placeholder in the game lookup. The site tracks its 3/5/7 instruments.
            tiers = row["thresholds"]
        if set(tiers) != set(row["thresholds"]):
            raise ValueError(f"Thresholds changed for {row['id']}: {tiers}")
        sources[row["id"]] = {}
        for index, level in enumerate(tiers, 1):
            source_id = f"{reference['apiName']}_{index}"
            mapping[source_id] = (row["id"], str(level))
            sources[row["id"]].setdefault(str(level), []).append(source_id)
    return mapping, sources


def summarize(rows, mapping):
    result = {}
    for source_id, counts in rows.items():
        if source_id not in mapping:
            continue
        trait, level = mapping[source_id]
        combined = result.setdefault(trait, {}).setdefault(level, [0] * 8)
        for i, n in enumerate(counts):
            combined[i] += n
    return result


def guide_scope(job, mapping, names, window, trait_names):
    key, (levels, units, fixed, restrictions) = job
    params = [("level", level) for level in levels] + restrictions
    labels = [level + "级结算" for level in levels]
    labels.extend(BOARD_FILTERS[k][0] if v == "0" else BOARD_FILTERS[k][1] + " " + v for k, v in restrictions)
    for unit in units:
        match = re.fullmatch(r"(.*)-1(?:_(\d)(?:_(\d))?)?", unit)
        if not match or match[1] not in names:
            raise ValueError(f"Unknown guide unit filter {unit}")
        name, star, item = names[match[1]], match[2], match[3]
        if star:
            params.append(("unit_tier_numitems_unique", unit if item else unit + "_.*"))
        else:
            params.append(("unit_unique", unit))
        labels.append(name + (star + "星" if star else "") + (item + "件装" if item else ""))
    params.extend(("trait", pin) for pin in fixed)
    for pin in fixed:
        trait, tier = mapping[pin]
        labels.append(tier + trait_names[trait])
    url = "https://www.metatft.com/explorer?" + urlencode([("set", "TFTSet19"), ("tab", "traits"), *(("level", n) for n in levels), *(("unit", u) for u in units), *(("trait", pin) for pin in fixed), *restrictions, *window.items()])
    stats = summarize(placements(window, params), mapping)
    return key, {"labels": labels, "url": url, "rows": stats}


def crosscheck():
    page = BeautifulSoup(fetch(NOXU).content, "html.parser")
    title = page.select_one("h1").get_text(strip=True)
    match = re.search(r"第\s*(\d+)\s*赛季", title)
    if not match:
        raise ValueError("NoxuTFT season could not be verified")
    season = int(match[1])
    # MetaTFT's default ranked summary declares both the season and the patch for queue 1100.
    ranked = fetch("https://api-hc.metatft.com/tft-comps-api/unit_items_processed").json()
    if ranked["queue_id"] != 1100 or ranked["tft_set"] != f"TFTSet{season}":
        raise ValueError("NoxuTFT and MetaTFT ranked seasons differ")
    patch = ranked["region_patch_adjustment"]["global_patch"]["patch"]
    if not re.fullmatch(r"\d+\.\d+", patch):
        raise ValueError("Missing explicit ranked patch")
    meta = placements({"queue": "1100", "patch": patch, "days": str(DAYS)})
    rows = []
    for card in page.select("article.trait"):
        icon = card.select_one(".trait__icon")
        if not icon:
            continue
        api = Path(urlsplit(icon["src"]).path).stem
        tiers = [int(t.get_text(strip=True)) for t in card.select(".trait__bp")]
        if len(set(tiers)) != len(tiers):
            continue
        for chip in card.select(".trait__lvl"):
            text = chip.get_text(" ", strip=True).split()
            if len(text) != 3:
                continue
            level, avg, sample = text
            if not re.fullmatch(r"\d+", level) or int(level) not in tiers:
                continue
            counts = meta.get(f"{api}_{tiers.index(int(level)) + 1}")
            if not counts:
                continue
            games = sum(counts)
            mean = sum((i + 1) * n for i, n in enumerate(counts)) / games
            rows.append({"name": card.select_one(".trait__name").get_text(strip=True), "id": card["id"], "tier": int(level),
                         "noxuMean": float(avg), "noxuGames": sample, "metaMean": round(mean, 2), "metaGames": games})
    if not rows:
        raise ValueError("No comparable ranked tiers found")
    return {"set": season, "patch": patch, "on": datetime.now(timezone.utc).isoformat(timespec="seconds"), "url": NOXU,
            "metaUrl": f"https://www.metatft.com/explorer?set=TFTSet{season}&tab=traits", "rows": rows}


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--output", type=Path, default=DATA / "trait-stats.json")
    opts = args.parse_args()
    season = load(DATA / "season.json")
    _, window = current_window(DATA)
    lookup = fetch(S19_LOOKUP).json()
    mapping, sources = lookup_mapping(lookup, season)
    patch = ".".join(lookup["_metadata"]["release"].split("-", 1)[1].split(".")[:2])
    if patch != window["patch"] or not season["id"].startswith(f"s19-pbe-{patch}."):
        raise ValueError("Local season and MetaTFT PBE patch differ")
    overall = summarize(placements(window), mapping)
    required = {row["id"] for row in season["traits"] if row["axis"] != "special" and not row["dynamic"]}
    if required - overall.keys():
        raise ValueError(f"Incomplete S19 snapshot, missing {required - overall.keys()}")
    names = {unit["apiName"]: unit["name"] for unit in lookup["units"]}
    jobs = published_scopes(mapping).items()
    trait_names = {row["id"]: row["name"] for row in season["traits"]}
    with ThreadPoolExecutor(max_workers=3) as pool:
        scopes = dict(pool.map(lambda job: guide_scope(job, mapping, names, window, trait_names), jobs))
    try:
        comparison = crosscheck()
    except (requests.RequestException, ValueError, KeyError, AttributeError) as exc:
        print(f"NoxuTFT comparison unavailable: {exc}", file=sys.stderr)
        comparison = load(opts.output).get("comparison") if opts.output.exists() else None
    patch += window["b_patch"]
    snapshot = {"season": 19, "queue": "PBE", "patch": patch, "sourcePatch": patch, "days": DAYS, "asOf": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "metaUrl": "https://www.metatft.com/explorer?" + urlencode({"set": "TFTSet19", "tab": "traits", **window}), "sources": sources,
                "rows": overall, "scopes": scopes, "comparison": comparison}
    with NamedTemporaryFile("w", dir=opts.output.parent, encoding="utf-8", delete=False) as file:
        json.dump(snapshot, file, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        file.write("\n")
    os.replace(file.name, opts.output)
    print(f"{len(overall)} traits, {sum(map(len, overall.values()))} tiers, {len(scopes)} board filters, {len((comparison or {}).get('rows', []))} ranked cross-checks")


if __name__ == "__main__":
    main()
