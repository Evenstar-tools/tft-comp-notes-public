"""Refresh S19 PBE guide placement counts from the same filters as the guide's mean."""
import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, urlsplit
from guide_stats_window import current_window, scoped_url

DATA = Path(__file__).resolve().parents[1] / "data"
BATCH = DATA / "guide-placement.json"
CORE = "https://www.metatft.com/explorer?tab=units&set=TFTSet19&level=8&unit=DA_RenataGlasc19-1_3_3&unit=DA_Nasus19-1"
BASE = "https://api-hc.metatft.com/tft-explorer-api/"


def fetch_counts(url):
    pairs = parse_qsl(urlsplit(url).query)
    exact = ("tab", "comps") in pairs
    if ("set", "TFTSet19") not in pairs or not (exact or ("tab", "units") in pairs):
        raise ValueError(f"Unsupported season or query: {url}")
    window = {k: v for k, v in pairs if k in ("queue", "patch", "b_patch", "days")}
    if len(window) != 4:
        raise ValueError(f"Missing explicit patch window: {url}")
    params = [*window.items(), ("formatnoarray", "true"), ("compact", "true"), ("permit_filter_adjustment", "false")]
    units, traits = set(), set()
    for key, value in pairs:
        if key in ("tab", "set") or window.get(key) == value:
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
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    with requests.Session() as session:
        session.mount("https://", HTTPAdapter(max_retries=Retry(total=2, backoff_factor=0.5, status_forcelist=[429, 502, 503, 504])))
        response = session.get(BASE + ("exact_units_traits2" if exact else "total"), params=params, timeout=(8, 25))
        response.raise_for_status()
        payload = response.json()
        if payload.get("filter_adjustment"):
            raise ValueError(f"Source adjusted the requested filters: {url}")
        rows = payload["data"]
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


def apply_refreshed_counts(records, snapshots, observed, *, hours=None, build=None, now_iso=None):
    preserved = []
    unexpected_zero_active = 0
    for r in records:
        counts = snapshots[r["url"]]
        total = sum(counts)
        prev_games = r.get("games", 0)
        if total == 0 and hours is None and isinstance(prev_games, int) and prev_games > 0:
            preserved.append(r["url"])
            if prev_games >= 20:
                unexpected_zero_active += 1
            continue
        r.update(placementCounts=counts, games=total, observedOn=observed)
        if hours is not None:
            r.update(windowHours=hours, build=build, checkedAt=now_iso)
        if total:
            r.update(mean=round(sum(i * n for i, n in enumerate(counts, 1)) / total, 2),
                     topFourRate=sum(counts[:4]) / total, winRate=counts[0] / total)
        else:
            for field in ("mean", "winRate", "topFourRate"):
                r.pop(field, None)
    if unexpected_zero_active >= 3:
        raise ValueError(f"Multiple active board filters ({unexpected_zero_active}) unexpectedly returned 0 games; keeping previous snapshot")
    return preserved


def apply_auxiliary_counts(comparisons, formation, formation_groups, snapshots, observed, now_iso):
    for sample in comparisons:
        counts = snapshots[sample["url"]]
        if sum(counts) == 0 and sum(sample.get("placementCounts") or []) > 0:
            continue
        sample.update(placementCounts=counts, observedOn=observed)
    updated_formation = False
    for sample in formation:
        counts = snapshots[sample["url"]]
        if sum(counts) == 0 and sum(sample.get("placementCounts") or []) > 0:
            continue
        sample["placementCounts"] = counts
        updated_formation = True
    if updated_formation or not formation:
        for group in formation_groups:
            group["checkedAt"] = now_iso


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=BATCH)
    parser.add_argument("--team", action="append", help="Refresh only records bound to this board (repeatable)")
    parser.add_argument("--hours", type=int, help="Collect a current-build window for the selected boards")
    args = parser.parse_args()
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    build, window = current_window(DATA)
    patch = window["patch"]
    edition = json.loads((DATA / "season.json").read_text(encoding="utf-8"))["id"]
    if (batch.get("edition") != "s19-pbe-" + patch or not edition.startswith(batch["edition"] + ".")
            or batch.get("build") != build or batch["patch"] != "PBE " + patch + window["b_patch"]):
        raise ValueError("The guide snapshot and S19 PBE edition must match")
    if args.hours is not None:
        if not args.team or not 0 < args.hours <= 72:
            parser.error("--hours requires --team and must be between 1 and 72")
        active = json.loads((DATA / "current-patch.json").read_text(encoding="utf-8"))
        start = datetime.now(timezone.utc) - timedelta(hours=args.hours)
        if start < datetime.fromisoformat(active["effectiveAt"]):
            raise ValueError("The requested hours extend before the current build")
        window["days"] = str(args.hours / 24)
    # Curated short-window and hero-augment observations keep their own capture date.
    records = [
        row for row in batch["records"]
        if not row.get("boardObservation")
        and not row.get("sourcePeriod")
        and not row.get("referencesAugment")
        and not row.get("conditions", {}).get("augmentId")
        and (not row.get("windowHours") or args.hours is not None)
    ]
    if args.team:
        records = [row for row in records if row.get("conditions", {}).get("teamId") in args.team]
        missing = set(args.team) - {row["conditions"]["teamId"] for row in records}
        if missing:
            raise ValueError(f"No refreshable records for: {', '.join(sorted(missing))}")
    comparisons = [] if args.team else [sample for group in batch.get("boardComparisons", []) for sample in group["samples"]]
    core = None if args.team else scoped_url(CORE, window)
    for row in records + comparisons:
        row["url"] = scoped_url(row["url"], window)
    # Comparisons with a separately sampled core stay together as one observation.
    formation_groups = [
        group for group in batch.get("formationComparisons", [])
        if not args.team and group["patch"] == batch["patch"] and not group.get("coreSummary")
    ]
    formation = [entry for group in formation_groups for board in group["boards"]
                 for entry in [board["sample"], board.get("subset", {}).get("sample")] if entry]
    for sample in formation:
        sample["url"] = scoped_url(sample["url"], window)
    urls = list(dict.fromkeys([*([core] if core else []), *(r["url"] for r in records + comparisons + formation)]))
    with ThreadPoolExecutor(max_workers=4) as pool:
        snapshots = dict(zip(urls, pool.map(fetch_counts, urls)))
    if core and not sum(snapshots[core]):
        raise ValueError("The S19 anchor sample is empty; keeping the previous snapshot")
    now = datetime.now(timezone.utc)
    observed = now.date().isoformat()
    now_iso = now.isoformat(timespec="seconds")
    preserved = apply_refreshed_counts(records, snapshots, observed, hours=args.hours, build=build, now_iso=now_iso)
    if core:
        batch["date"] = observed
        batch["renataNasusReference"] = {"url": core, "observedOn": observed, "placementCounts": snapshots[core]}
    apply_auxiliary_counts(comparisons, formation, formation_groups, snapshots, observed, now_iso)
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=args.out.parent, delete=False) as tmp:
        json.dump(batch, tmp, ensure_ascii=False, indent=2, allow_nan=False)
        tmp.write("\n")
    os.replace(tmp.name, args.out)
    reference = " and the level-eight Renata/Nasus reference" if core else ""
    kept_note = f" ({len(preserved)} zero-count sample(s) preserved previous observation)" if preserved else ""
    print(f"Refreshed {len(records)} board filters{reference}, {observed}{kept_note}.")


if __name__ == "__main__":
    main()
