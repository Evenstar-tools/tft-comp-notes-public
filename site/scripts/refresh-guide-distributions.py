"""Refresh guide placement counts from the same filters as the guide's mean."""
import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, urlsplit
from guide_stats_window import WINDOW_KEYS, current_cohort, scoped_url

DATA = Path(__file__).resolve().parents[1] / "data"
BATCH = DATA / "guide-placement.json"
BASE = "https://api-hc.metatft.com/tft-explorer-api/"


def fetch_counts(url, set_name):
    pairs = parse_qsl(urlsplit(url).query, keep_blank_values=True)
    exact = ("tab", "comps") in pairs
    if ("set", set_name) not in pairs or not (exact or ("tab", "units") in pairs):
        raise ValueError(f"Unsupported season or query: {url}")
    window = {k: v for k, v in pairs if k in WINDOW_KEYS}
    if not {"queue", "patch", "b_patch", "days"} <= window.keys():
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


def _patch_scope(url):
    pairs = dict(parse_qsl(urlsplit(url).query, keep_blank_values=True))
    return pairs.get("queue"), pairs.get("patch"), pairs.get("b_patch", ""), pairs.get("rank")


def _same_patch_scope(url, window):
    if window is None:
        return True
    return _patch_scope(url) == (window.get("queue"), window.get("patch"), window.get("b_patch", ""), window.get("rank"))


def _within_preserve_window(prev_observed, observed):
    if not prev_observed or not observed:
        return True
    try:
        prev_day = datetime.fromisoformat(str(prev_observed)).date()
        cur_day = datetime.fromisoformat(str(observed)).date()
    except ValueError:
        return False
    return 0 <= (cur_day - prev_day).days <= 1


def apply_refreshed_counts(records, snapshots, observed, *, window=None, hours=None, build=None, now_iso=None, team_scoped=False):
    preserved = []
    unexpected_zero_active = 0
    for r in records:
        target_url = scoped_url(r["url"], window) if window else r["url"]
        counts = snapshots[target_url]
        total = sum(counts)
        prev_games = r.get("games", 0)
        can_preserve = (
            total == 0
            and hours is None
            and not team_scoped
            and _same_patch_scope(r["url"], window)
            and type(prev_games) is int
            and prev_games >= 20
            and _within_preserve_window(r.get("observedOn"), observed)
        )
        if can_preserve:
            preserved.append(target_url)
            unexpected_zero_active += 1
            continue
        r["url"] = target_url
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


def apply_auxiliary_counts(comparisons, formation, formation_groups, snapshots, observed, now_iso, *, window=None):
    for sample in comparisons:
        target_url = scoped_url(sample["url"], window) if window else sample["url"]
        counts = snapshots[target_url]
        prev_total = sum(sample.get("placementCounts") or [])
        if (sum(counts) == 0 and prev_total >= 20
                and _same_patch_scope(sample["url"], window)
                and _within_preserve_window(sample.get("observedOn"), observed)):
            continue
        sample["url"] = target_url
        sample.update(placementCounts=counts, observedOn=observed)
    for group in formation_groups:
        group_samples = [
            entry for board in group.get("boards", [])
            for entry in (board.get("sample"), board.get("subset", {}).get("sample"))
            if entry
        ]
        if not group_samples:
            continue
        group_day = str(group.get("checkedAt") or "")[:10] or None
        preserve_group = any(
            sum(snapshots[scoped_url(entry["url"], window) if window else entry["url"]]) == 0
            and sum(entry.get("placementCounts") or []) >= 20
            and _same_patch_scope(entry["url"], window)
            and _within_preserve_window(group_day, observed)
            for entry in group_samples
        )
        if preserve_group:
            continue
        for entry in group_samples:
            target_url = scoped_url(entry["url"], window) if window else entry["url"]
            entry["url"] = target_url
            entry["placementCounts"] = snapshots[target_url]
        group["checkedAt"] = now_iso


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=BATCH)
    parser.add_argument("--team", action="append", help="Refresh only records bound to this board (repeatable)")
    parser.add_argument("--hours", type=int, help="Collect a current-build window for the selected boards")
    args = parser.parse_args()
    batch = json.loads(BATCH.read_text(encoding="utf-8"))
    if batch.get("sampleStatus") == "pending" and args.team:
        parser.error("The first ranked placement snapshot requires the full guide refresh")
    cohort = current_cohort(DATA)
    build, window = cohort.build, dict(cohort.window)
    edition = json.loads((DATA / "season.json").read_text(encoding="utf-8"))["id"]
    label = "PBE" if cohort.pbe else "Ranked"
    if (batch.get("edition") != cohort.edition or not edition.startswith(cohort.edition + ".")
            or batch.get("build") != build or batch["patch"] != f"{label} {cohort.version}"):
        raise ValueError("The guide snapshot and active season, queue and patch must match")
    if args.hours is not None:
        if not args.team or not 0 < args.hours <= 72:
            parser.error("--hours requires --team and must be between 1 and 72")
        start = datetime.now(timezone.utc) - timedelta(hours=args.hours)
        if start < datetime.fromisoformat(cohort.effective_at):
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
    core_url = (batch.get("renataNasusReference") or {}).get("url")
    if not args.team and cohort.number == 19 and not core_url:
        raise ValueError("Missing the S19 anchor query; keeping the previous snapshot")
    core = scoped_url(core_url, window) if core_url and not args.team else None
    # Comparisons with a separately sampled core stay together as one observation.
    formation_groups = [
        group for group in batch.get("formationComparisons", [])
        if not args.team and group["patch"] == batch["patch"] and not group.get("coreSummary")
    ]
    formation = [entry for group in formation_groups for board in group["boards"]
                 for entry in [board["sample"], board.get("subset", {}).get("sample")] if entry]
    urls = list(dict.fromkeys([
        *([core] if core else []),
        *(scoped_url(r["url"], window) for r in records + comparisons + formation),
    ]))
    with ThreadPoolExecutor(max_workers=4) as pool:
        snapshots = dict(zip(urls, pool.map(lambda url: fetch_counts(url, cohort.set_name), urls)))
    if core and not sum(snapshots[core]):
        raise ValueError("The S19 anchor sample is empty; keeping the previous snapshot")
    now = datetime.now(timezone.utc)
    observed = now.date().isoformat()
    now_iso = now.isoformat(timespec="seconds")
    preserved = apply_refreshed_counts(
        records, snapshots, observed,
        window=window, hours=args.hours, build=build, now_iso=now_iso, team_scoped=bool(args.team),
    )
    if not args.team:
        batch["date"] = observed
        batch.pop("sampleStatus", None)
    if core:
        batch["renataNasusReference"] = {"url": core, "observedOn": observed, "placementCounts": snapshots[core]}
    apply_auxiliary_counts(comparisons, formation, formation_groups, snapshots, observed, now_iso, window=window)
    with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=args.out.parent, delete=False) as tmp:
        json.dump(batch, tmp, ensure_ascii=False, indent=2, allow_nan=False)
        tmp.write("\n")
    os.replace(tmp.name, args.out)
    reference = " and the level-eight Renata/Nasus reference" if core else ""
    kept_note = f" ({len(preserved)} zero-count sample(s) preserved previous observation)" if preserved else ""
    print(f"Refreshed {len(records)} board filters{reference}, {observed}{kept_note}.")


if __name__ == "__main__":
    main()
