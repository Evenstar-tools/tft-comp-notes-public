"""Refresh S19 PBE guide placement counts from the same filters as the guide's mean."""
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, urlsplit

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DATA = Path(__file__).resolve().parents[1] / "data"
BATCH = DATA / "guide-placement.json"
CORE = "https://www.metatft.com/explorer?tab=units&set=TFTSet19&level=8&unit=DA_RenataGlasc19-1_3_3&unit=DA_Nasus19-1"
BASE = "https://api-hc.metatft.com/tft-explorer-api/"


def fetch_counts(url):
    pairs = parse_qsl(urlsplit(url).query)
    exact = ("tab", "comps") in pairs
    if ("set", "TFTSet19") not in pairs or not (exact or ("tab", "units") in pairs):
        raise ValueError(f"Unsupported season or query: {url}")
    params = [("queue", "PBE"), ("patch", "current"), ("days", 3), ("formatnoarray", "true"), ("compact", "true")]
    units, traits = set(), set()
    for key, value in pairs:
        if key in ("tab", "set"):
            continue
        if key in ("trait", "level", "emblem_count", "tactician_item_count", "duplicate_unit_count"):
            params.append((key, value))
            if key == "trait":
                traits.add(value)
        elif key == "unit" and re.fullmatch(r"[A-Za-z0-9_]+-1(?:_[1-4](?:_[0-3])?)?", value):
            units.add(value.rsplit("-", 1)[0])
            suffix = value.rsplit("-", 1)[1]
            if suffix == "1":
                params.append(("unit_unique", value))
            else:
                params.append(("unit_tier_numitems_unique", value if suffix.count("_") == 2 else value + "_.*"))
        else:
            raise ValueError(f"Unrecognised query parameter {key}={value}")
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=Retry(total=2, backoff_factor=0.5, status_forcelist=[429, 502, 503, 504])))
        response = session.get(BASE + ("exact_units_traits2" if exact else "total"), params=params, timeout=(8, 25))
        response.raise_for_status()
        rows = response.json()["data"]
    if not isinstance(rows, list) or (not exact and len(rows) > 1):
        raise ValueError(f"Invalid aggregate: {url}")
    counts = [0] * 8
    for row in rows:
        if exact:
            roster, active = row["units_traits"].split("|", 1)
            if set(roster.split("&")) != units or not traits.issubset(active.split("&")):
                continue
        buckets = row["placement_count"]
        if len(buckets) != 8 or any(type(n) is not int or n < 0 for n in buckets):
            raise ValueError(f"Invalid eight placement buckets: {url}")
        if row.get("total_games", sum(buckets)) != sum(buckets):
            raise ValueError(f"Placement counts differ from total games: {url}")
        counts = [total + n for total, n in zip(counts, buckets)]
    return counts


def main():
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    patch = batch["patch"].removeprefix("PBE ")
    edition = json.loads((DATA / "season.json").read_text(encoding="utf-8"))["id"]
    if batch.get("edition") != "s19-pbe-" + patch or not edition.startswith(batch["edition"] + "."):
        raise ValueError("The guide snapshot and S19 PBE edition must match")
    # Curated short-window and hero-augment observations keep their own capture date.
    records = [
        row for row in batch["records"]
        if not row.get("boardObservation")
        and not row.get("referencesAugment")
        and not row.get("conditions", {}).get("augmentId")
    ]
    comparisons = [sample for group in batch.get("boardComparisons", []) for sample in group["samples"]]
    urls = list(dict.fromkeys([CORE, *(r["url"] for r in records + comparisons)]))
    with ThreadPoolExecutor(max_workers=4) as pool:
        snapshots = dict(zip(urls, pool.map(fetch_counts, urls)))
    if not sum(snapshots[CORE]):
        raise ValueError("The S19 anchor sample is empty; keeping the previous snapshot")
    observed = datetime.now(timezone.utc).date().isoformat()
    for r in records:
        counts = snapshots[r["url"]]
        total = sum(counts)
        r.update(placementCounts=counts, games=total, observedOn=observed)
        if total:
            r.update(mean=round(sum(i * n for i, n in enumerate(counts, 1)) / total, 2),
                     topFourRate=sum(counts[:4]) / total, winRate=counts[0] / total)
        else:
            for field in ("mean", "winRate", "topFourRate"):
                r.pop(field, None)
    batch["date"] = observed
    batch["renataNasusReference"] = {"url": CORE, "observedOn": observed, "placementCounts": snapshots[CORE]}
    for sample in comparisons:
        sample.update(placementCounts=snapshots[sample["url"]], observedOn=observed)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=BATCH.parent, delete=False) as tmp:
        json.dump(batch, tmp, ensure_ascii=False, indent=2, allow_nan=False)
        tmp.write("\n")
    os.replace(tmp.name, BATCH)
    print(f"Refreshed {len(records)} board filters and the level-eight Renata/Nasus reference, {observed}.")


if __name__ == "__main__":
    main()
