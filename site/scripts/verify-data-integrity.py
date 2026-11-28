"""Validate the committed statistics and public archive without network access."""

import argparse
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import json
from math import isfinite
from pathlib import Path
import re
import os
from subprocess import CalledProcessError, run
from urllib.parse import parse_qs, urlsplit


ROOT = Path(__file__).resolve().parents[1]
MODULES = {
    "hero-stats": ("rows", dict, "updatedAt"),
    "item-wearers": ("items", dict, "updatedAt"),
    "special-item-wearers": ("items", dict, "updatedAt"),
    "emblem-stats": ("emblems", dict, "updatedAt"),
    "trait-stats": ("rows", dict, "asOf"),
    "guide-family-stats": ("rows", list, "updatedAt"),
    "guide-placement": ("records", list, "date"),
    "guide-carry-stats": ("rows", list, "updatedAt"),
    "comp-trends": ("series", list, "capturedAt"),
    "patch-recommendations": ("entries", list, "reviewedAt"),
    "patch-recommendation-stats": ("rows", list, "updatedAt"),
}
DISTRIBUTIONS = {
    "guide-family-stats": "places",
    "guide-placement": "placementCounts",
    "guide-carry-stats": "placementCounts",
    "patch-recommendation-stats": "placementCounts",
}
ARCHIVE_MODULES = ("hero-stats", "item-wearers", "special-item-wearers")
RANKED_QUEUES = {"RANKED", "RANKED_TFT", "1100"}
PENDING_AUXILIARY = {
    "hero-stats": ("previous",),
    "trait-stats": ("scopes", "comparison"),
    "guide-family-stats": ("smallSamples", "previous", "totalFinishes"),
    "guide-placement": ("boardComparisons", "formationComparisons"),
    "comp-trends": ("batches", "discoveries", "families"),
}
SAMPLE_TIMES = ("updatedAt", "date", "asOf", "reviewedAt", "capturedAt")
EDITION = re.compile(r"^(s[1-9]\d*-(?:pbe|live))(?:-|$)")
PATCH = re.compile(r"\d+\.\d+[a-z]?")
BUILD = re.compile(r"[1-9]\d*")
ISO_TIME = re.compile(
    r"\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d"
    r"(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)"
)
PRIVATE_ID = re.compile(r"\bdoxc[a-z0-9_]+", re.I)
REGULAR_GROUPS = {"reroll", "fast8", "fast9"}
RECOMMENDATION_GROUPS = REGULAR_GROUPS | {"heroAugment"}
RECOMMENDATION_STATUSES = ("recommended", "conditional", "avoid", "review")
RECOMMENDATION_OVERRIDES = ("pin", "include", "exclude")
HOME_MIN_GAMES, HOME_CUTOFF = 100, 4.40
HOME_MIN_VISIBLE, HOME_MAX_VISIBLE, HOME_MAX_PER_GROUP, HOME_MAX_HERO = 4, 12, 8, 2
UTC8 = timezone(timedelta(hours=8))


def matches(pattern, value):
    return isinstance(value, str) and pattern.fullmatch(value) is not None


def timestamp(value):
    if matches(ISO_TIME, value):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return None


def sample_date(value):
    if matches(re.compile(r"\d{4}-\d\d-\d\d"), value):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    return None


def edition(value):
    match = EDITION.match(value) if isinstance(value, str) else None
    return match[1] if match else None


def invalid_constant(value):
    raise ValueError(f"非法 JSON 常量 {value}")


def finite_float(value):
    parsed = float(value)
    if not isfinite(parsed):
        raise ValueError("JSON 数值超出范围")
    return parsed


def read_json(relative, kind, errors):
    try:
        value = json.loads((ROOT / relative).read_text(encoding="utf-8"),
                           parse_constant=invalid_constant, parse_float=finite_float)
        if isinstance(value, kind):
            return value
        errors.append(f"{relative}：JSON 根节点类型错误")
    except FileNotFoundError:
        errors.append(f"{relative}：文件缺失")
    except (OSError, ValueError, RecursionError):
        errors.append(f"{relative}：无法读取合法 JSON")
    return kind()


def current_patch(errors):
    name = "data/current-patch.json"
    current = read_json(name, dict, errors)
    mapping = current.get("metaTftPatch")
    base = mapping.get("patch") if isinstance(mapping, dict) else None
    suffix = mapping.get("bPatch", "") if isinstance(mapping, dict) else None
    season, build, label = (current.get(key) for key in ("seasonId", "build", "label"))
    scope = edition(season)
    effective = timestamp(current.get("effectiveAt"))
    valid_mapping = matches(re.compile(r"\d+\.\d+"), base) and matches(re.compile(r"[a-z]?"), suffix)
    patch = base + suffix if valid_mapping else None
    problems = [
        key for key, valid in (
            ("seasonId", season == scope and season is not None),
            ("build", matches(BUILD, build)),
            ("label", isinstance(label, str) and bool(label.strip())),
            ("metaTftPatch.patch / bPatch", valid_mapping),
            ("effectiveAt", effective is not None),
        ) if not valid
    ]
    if scope:
        allowed = {"PBE"} if scope.endswith("-pbe") else RANKED_QUEUES
        if "queue" in current and str(current["queue"]).upper() not in allowed:
            problems.append("queue")
    launch = current.get("launchTransition", False)
    if type(launch) is not bool or (launch and (not scope or not scope.endswith("-live") or suffix != "")):
        problems.append("launchTransition")
    if problems:
        errors.append(f"{name}：字段无效（{', '.join(problems)}）")
    return {
        "seasonId": season, "build": build, "label": label,
        "patch": patch, "effectiveAt": current.get("effectiveAt"),
        **({"launchTransition": True} if launch is True else {}),
    }, effective, not problems


def module_scope(module, data, metadata):
    patch = metadata.get("patch")
    scope = edition(data.get("seasonId", data.get("edition")))
    queue = data.get("queue")
    if module in ARCHIVE_MODULES:
        version = data.get("version")
        parts = re.fullmatch(r"(S\d+) (PBE|Ranked) (\d+\.\d+[a-z]?)", version) if isinstance(version, str) else None
        if parts:
            scope = parts[1].lower() + ("-pbe" if parts[2] == "PBE" else "-live")
            queue, patch = parts[2], parts[3]
    elif module == "emblem-stats" and isinstance(data.get("set"), str):
        queue = data.get("mode")
        scope = data["set"].lower() + ("-pbe" if queue == "PBE" else "-live")
    elif module == "trait-stats" and type(data.get("season")) is int:
        scope = f"s{data['season']}" + ("-pbe" if queue == "PBE" else "-live")
    elif module == "guide-placement" and isinstance(patch, str):
        patch_label = re.fullmatch(r"(PBE|Ranked) (\d+\.\d+[a-z]?)", patch)
        queue, patch = patch_label.groups() if patch_label else (None, None)
    return scope, queue, patch


def patch_order(value):
    major, minor, suffix = re.fullmatch(r"(\d+)\.(\d+)([a-z]?)", value).groups()
    return int(major), int(minor), suffix


def pending_query(url, current):
    try:
        parts = urlsplit(url)
        query = parse_qs(parts.query, keep_blank_values=True)
    except (ValueError, TypeError, AttributeError):
        return False
    season = current["seasonId"].split("-")[0][1:]
    patch, suffix = re.fullmatch(r"(\d+\.\d+)([a-z]?)", current["patch"]).groups()
    return (parts.scheme == "https" and parts.netloc == "www.metatft.com" and parts.path == "/explorer"
            and query.get("tab") in (["comps"], ["units"])
            and query.get("queue") == ["1100"] and query.get("set") == [f"TFTSet{season}"]
            and query.get("patch") == [patch] and query.get("b_patch") == [suffix]
            and query.get("days") == ["3"])


def pending_placement(records, anchor, current):
    if anchor is not None and (not isinstance(anchor, dict) or set(anchor) != {"url"}
                               or not pending_query(anchor["url"], current)):
        return False
    template_keys = {"population", "roster", "url", "conditions", "sampleScope", "sampleNote",
                     "sampleLabel", "detailOnly", "games", "sectionId"}
    return all(isinstance(row, dict) and set(row) <= template_keys
               and type(row.get("games")) is int and row["games"] == 0
               and pending_query(row.get("url"), current) for row in records)


def check_pending_module(module, data, current, valid_patch, errors):
    name = f"data/{module}.json"
    collection, kind, _ = MODULES[module]
    records = data.get(collection)
    scope, queue, patch = module_scope(module, data, data)
    build = data.get("build")
    initial_errors = len(errors)
    if not valid_patch or not current.get("launchTransition"):
        errors.append(f"{name}：仅正式服首版过渡可以标记待采集")
    elif (scope != current["seasonId"] or str(queue).upper() not in RANKED_QUEUES
          or patch != current["patch"] or build != current["build"]
          or module == "trait-stats" and data.get("sourcePatch") not in (None, patch)):
        errors.append(f"{name}：待采集的赛季、队列、补丁或构建未对齐")
    if any(data.get(key) is not None for key in SAMPLE_TIMES):
        errors.append(f"{name}：待采集不能填入采样时间")
    empty = isinstance(records, kind) and not records
    if module == "guide-placement" and valid_patch and isinstance(records, list):
        empty = pending_placement(records, data.get("renataNasusReference"), current)
    if not empty or any(data.get(key) for key in PENDING_AUXILIARY.get(module, ())):
        errors.append(f"{name}：待采集只能留空集合或当前正式服的无战绩查询模板")
    return {
        "id": module, "file": name, "patch": patch, "build": build,
        "sampledAt": None, "updatedAtUtc8": None, "records": 0,
        "alignment": "pending" if len(errors) == initial_errors else "error",
    }


def check_module(module, data, current, effective, aligned_check, warnings, errors):
    if data.get("sampleStatus") == "pending":
        return check_pending_module(module, data, current, aligned_check, errors)
    name = f"data/{module}.json"
    initial_errors = len(errors)
    collection, kind, time_key = MODULES[module]
    records = data.get(collection)
    count = len(records) if isinstance(records, kind) else 0
    if not count and not (
        (module == "patch-recommendations" and isinstance(records, list))
        or (module == "guide-family-stats" and isinstance(records, list)
            and isinstance(data.get("smallSamples"), list) and bool(data["smallSamples"]))
    ):
        errors.append(f"{name}：{collection} 缺失、为空或类型错误")
    metadata = data
    if module == "comp-trends":
        batches = data.get("batches")
        if not isinstance(batches, list) or not batches or not all(
            isinstance(batch, dict) and timestamp(batch.get(time_key)) for batch in batches
        ):
            errors.append(f"{name}：batches 缺失或采样时间无效")
            metadata = {}
        else:
            metadata = max(batches, key=lambda batch: timestamp(batch[time_key]))

    value = metadata.get(time_key)
    captured = timestamp(value) if time_key != "date" else sample_date(value)
    if captured is None:
        errors.append(f"{name}：{time_key} 采样时间无效")
    utc8 = captured.astimezone(UTC8).isoformat() if isinstance(captured, datetime) else None
    scope, queue, patch = module_scope(module, data, metadata)
    build = metadata.get("build")
    editorial = module == "patch-recommendations"
    if not editorial and not matches(PATCH, patch):
        errors.append(f"{name}：缺少可核对的补丁")
    if (build is not None or module in {"guide-placement", "guide-carry-stats",
                                        "patch-recommendations", "patch-recommendation-stats"}) and not matches(BUILD, build):
        errors.append(f"{name}：构建号无效")
    if module == "trait-stats" and data.get("sourcePatch") != patch:
        errors.append(f"{name}：来源未锁定所标注的补丁")

    alignment = "unchecked"
    if aligned_check and len(errors) == initial_errors:
        season = current["seasonId"]
        allowed = {"PBE"} if season.endswith("-pbe") else RANKED_QUEUES
        same_scope = scope == season and (editorial or str(queue).upper() in allowed)
        older = (captured < effective if isinstance(captured, datetime)
                 else captured < effective.astimezone(timezone.utc).date())
        patch_matches = editorial or patch == current["patch"]
        build_matches = build is None or build == current["build"]
        if same_scope and patch_matches and build_matches and not older:
            alignment = "aligned"
        elif same_scope and (
            module == "emblem-stats" and patch_order(patch) < patch_order(current["patch"])
            or module in {"patch-recommendations", "patch-recommendation-stats"}
            and older and not build_matches and int(build) < int(current["build"])
            and (editorial or patch_order(patch) <= patch_order(current["patch"]))
        ):
            alignment = "lagging"
            warnings.append(f"{name}：独立更新批次 {patch or build}，当前为 {current['patch']} / {current['build']}")
        else:
            errors.append(
                f"{name}：赛季、队列、补丁、构建或采样时间未对齐当前批次"
                f"（{scope} / {queue} / {patch} / {build}，当前 {season} / {current['patch']} / {current['build']}）"
            )
    if len(errors) != initial_errors:
        alignment = "error"
    return {
        "id": module, "file": name, "patch": patch, "build": build,
        "sampledAt": value, "updatedAtUtc8": utc8, "records": count,
        "alignment": alignment,
    }


def objects(value, path):
    if isinstance(value, dict):
        yield path, value
        for key, child in value.items():
            yield from objects(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from objects(child, f"{path}[{index}]")


def check_distributions(module, data, errors):
    key = DISTRIBUTIONS[module]
    checked = 0
    for path, record in objects(data, f"data/{module}.json"):
        if key not in record:
            continue
        checked += 1
        counts = record[key]
        if not isinstance(counts, list) or len(counts) != 8 or any(type(n) is not int or n < 0 for n in counts):
            errors.append(f"{path}.{key}：需要 8 个非负整数名次桶")
            continue
        total = sum(counts)
        if "games" in record and (type(record["games"]) is not int or record["games"] != total):
            errors.append(f"{path}：名次桶合计 {total} 与 games 不符")
        if "mean" in record:
            mean = record["mean"]
            if total == 0 and mean is None:
                continue
            expected = sum(i * n for i, n in enumerate(counts, 1)) / total if total else None
            if expected is None or type(mean) not in (int, float) or not 1 <= mean <= 8 or abs(expected - mean) > 0.02 + 1e-12:
                errors.append(f"{path}：mean 与名次桶复算均名不符（允许误差 0.02）")
    return checked


def check_history(errors):
    name = "data/stats-history.json"
    history = read_json(name, list, errors)
    seen = set()
    for index, entry in enumerate(history):
        key = entry.get("id") if isinstance(entry, dict) else None
        if not matches(re.compile(r"[a-z0-9]+(?:[.-][a-z0-9]+)*"), key):
            errors.append(f"{name}[{index}]：批次 id 无效")
            continue
        if key in seen:
            errors.append(f"{name}：重复 id {key}")
            continue
        seen.add(key)
        directory = f"public/stats-history/{key}"
        heroes_file = f"{directory}/heroes.json"
        equipment_file = f"{directory}/equipment.json"
        before_heroes = len(errors)
        heroes = read_json(heroes_file, dict, errors)
        if len(errors) == before_heroes:
            rows = heroes.get("rows")
            if not isinstance(rows, dict) or not rows:
                errors.append(f"{heroes_file}：归档集合 rows 为空或类型错误")
        before_equipment = len(errors)
        equipment = read_json(equipment_file, dict, errors)
        if len(errors) == before_equipment:
            for field in ("standard", "special"):
                part = equipment.get(field)
                if not isinstance(part, dict) or not isinstance(part.get("items"), dict) or not part["items"]:
                    errors.append(f"{equipment_file}：{field}.items 为空或类型错误")
    return len(history)


def recommendation_board_ids(row, primary):
    shared = row.get("sharedTeamIds")
    return [board for board in (row.get("landingTeamId"), row.get("teamId") or primary,
                                *(shared if isinstance(shared, list) else []))
            if isinstance(board, str)]


def current_recommendation_family(family, recommendations, current, effective, aligned):
    days = family.get("days")
    if not aligned or family.get("patch") != current["patch"] or type(days) is not int or days < 1:
        return False
    if family.get("spansBuilds"):
        return (family.get("build") == current["build"]
                and family.get("patch") == recommendations.get("reviewedRollingPatch"))
    if family.get("build"):
        return family["build"] == current["build"]
    updated = timestamp(family.get("updatedAt"))
    return updated is not None and (updated - effective).total_seconds() >= days * 86400


def validate_recommendation_overrides(entry, active, path, errors):
    if not active:
        return
    override = entry.get("override")
    if "override" in entry and override not in RECOMMENDATION_OVERRIDES:
        errors.append(f"{path}.override：须为 pin、include 或 exclude")
    if "pinOrder" in entry and (override != "pin" or type(entry["pinOrder"]) is not int
                                or abs(entry["pinOrder"]) > 2**53 - 1):
        errors.append(f"{path}.pinOrder：仅 pin 可使用，须为有效整数")
    if "manualBadge" in entry:
        badge = entry["manualBadge"]
        if not isinstance(badge, str) or not badge.strip() or len(badge.splitlines()) != 1:
            errors.append(f"{path}.manualBadge：须为单行有效文字")
    return override if override in RECOMMENDATION_OVERRIDES else None


def collect_public_boards(sections, preview, errors, reroll=None):
    boards = {}
    primaries = {}
    sections_by_id = {section["id"]: section for section in sections}
    original_board_ids = {}
    for section in sections:
        section_id = section["id"]
        section_teams = section.get("teams")
        teams = {
            team["id"]: team
            for team in [section.get("team"), *(section_teams if isinstance(section_teams, list) else [])]
            if isinstance(team, dict) and isinstance(team.get("id"), str)
        }
        primary = section.get("primaryTeamId")
        primaries[section_id] = primary if isinstance(primary, str) else next(iter(teams), None)
        original_board_ids[section_id] = set(teams)
        boards.update({(section_id, team_id): team for team_id, team in teams.items()})
    reroll_path = ROOT / "data/s19-reroll-boards.json"
    season_scope = edition(preview.get("season", {}).get("id") if isinstance(preview.get("season"), dict) else None)
    if season_scope in ("s19-pbe", "s19-live"):
        if reroll is None:
            reroll = read_json("data/s19-reroll-boards.json", list, errors) if reroll_path.exists() else []
        for guide in reroll:
            if not isinstance(guide, dict):
                continue
            section_id = guide.get("sectionId")
            if not isinstance(section_id, str) or section_id not in sections_by_id:
                continue
            local_data = sections_by_id[section_id].get("gameData")
            if isinstance(local_data, dict) and edition(local_data.get("id")) != season_scope:
                continue
            for stage in guide.get("stages") or []:
                if not isinstance(stage, dict) or not isinstance(stage.get("teamId"), str):
                    continue
                pieces = stage.get("pieces")
                if not isinstance(pieces, list) or not pieces:
                    continue
                parent_id = stage.get("parentTeamId")
                if parent_id is not None and parent_id not in original_board_ids.get(section_id, set()):
                    continue
                key = (section_id, stage["teamId"])
                if key not in boards:
                    boards[key] = {
                        "id": stage["teamId"],
                        "boardRole": stage.get("boardRole", "stage"),
                        "pieces": pieces,
                    }
    return boards, primaries, sections_by_id


def check_recommendation_entries(recommendations, family, boards, primaries, sections_by_id,
                                 current, effective, patch_ready, family_aligned, warnings, errors):
    name = "data/patch-recommendations.json"
    entries = recommendations.get("entries")
    if not isinstance(entries, list):
        return
    reviewed = timestamp(recommendations.get("reviewedAt"))
    active = (patch_ready and recommendations.get("seasonId") == current["seasonId"]
              and recommendations.get("build") == current["build"] and reviewed is not None and reviewed >= effective)
    current_family = current_recommendation_family(family, recommendations if active else {},
                                                   current, effective, family_aligned)
    rows = family.get("rows")
    families = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict) or not isinstance(row.get("sectionId"), str):
            continue
        anchor = row.get("teamId") or primaries.get(row["sectionId"])
        if isinstance(anchor, str) and (row["sectionId"], anchor) in boards:
            families.append(row)
    landing_boards = {(row["sectionId"], row.get("landingTeamId")) for row in families
                      if isinstance(row.get("landingTeamId"), str)}
    decisions, excluded, manual = {}, set(), {}
    seen = set()
    for index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        path = f"{name}.entries[{index}]"
        section_id, team_id, group, status = (entry.get(key) for key in ("sectionId", "teamId", "group", "status"))
        valid_group = isinstance(group, str) and group in RECOMMENDATION_GROUPS
        if "group" in entry and not valid_group:
            errors.append(f"{path}.group：未知推荐分组")
        if status not in RECOMMENDATION_STATUSES:
            errors.append(f"{path}.status：未知推荐状态")
        for key in ("note", "timing", "upgrade"):
            value = entry.get(key)
            if (key == "note" or key in entry) and (not isinstance(value, str) or not value.strip()
                                                   or key != "note" and len(value.splitlines()) != 1):
                errors.append(f"{path}.{key}：需填写有效文字，结构化建议须为单行")
        override = validate_recommendation_overrides(entry, active, path, errors)
        if not isinstance(section_id, str) or not isinstance(team_id, str) or (section_id, team_id) not in boards:
            errors.append(f"{path}.teamId：未在对应的公开攻略中找到")
            continue
        key = (section_id, team_id)
        if key in seen:
            errors.append(f"{path}.teamId：同一棋盘只能写一次")
            continue
        seen.add(key)
        section = sections_by_id[section_id]
        is_hero = section.get("category") == "英雄强化阵容"
        if valid_group and is_hero != (group == "heroAugment"):
            errors.append(f"{path}.group：与公开攻略的英雄强化分类不匹配")
        if active:
            decisions[key] = (group if valid_group else None, status)
            if status in ("avoid", "review") or override == "exclude":
                excluded.add(key)
        if override not in ("pin", "include"):
            continue
        if key in excluded:
            errors.append(f"{path}.override：待复核或次选棋盘不能置顶或手动入榜")
            continue
        stage_ids = section.get("stageTeamIds")
        board = boards[key]
        stage = (team_id in stage_ids if isinstance(stage_ids, list) else False) or board.get("boardRole") == "stage"
        primary_id = primaries[section_id]
        main_board = boards.get((section_id, primary_id), {})
        launch_entry = (active and current.get("launchTransition") is True and override == "include"
                        and entry.get("launchEntry") is True)
        if (stage and team_id != primary_id and key not in landing_boards and not launch_entry
                and board_population(board) <= board_population(main_board)):
            errors.append(f"{path}.override：过渡盘不能置顶或手动入榜")
            continue
        manual[key] = ("heroAugment" if is_hero else group if valid_group else None, override)

    manual_hero = sum(group == "heroAugment" for group, _ in manual.values())
    if len(manual) > HOME_MAX_VISIBLE or manual_hero > HOME_MAX_HERO:
        errors.append(f"{name}：手动入榜合计最多 {HOME_MAX_VISIBLE} 套，其中英雄强化最多 {HOME_MAX_HERO} 套")
    if sum(group != "heroAugment" and override == "pin" for group, override in manual.values()) > 4:
        warnings.append(f"{name}：常规置顶超过 4 条，请复核是否仍需保留")

    if not patch_ready:
        return
    candidates = {(section_id, group) for (section_id, _), (group, _) in manual.items()}
    if current_family:
        candidates.update(qualified_home_guides(families, primaries, boards, decisions, excluded, sections_by_id))
    # The reader infers the group from the guide when editorial metadata is absent.
    classified = {section_id for section_id, group in candidates if group is not None}
    by_group = Counter(group for section_id, group in candidates
                       if group is not None or section_id not in classified)
    unclassified = by_group.pop(None, 0)
    heroes = min(by_group.pop("heroAugment", 0), HOME_MAX_HERO)
    total = min(HOME_MAX_VISIBLE, unclassified + heroes
                + sum(min(count, HOME_MAX_PER_GROUP) for count in by_group.values()))
    if total < HOME_MIN_VISIBLE:
        warnings.append(f"{name}：本版推荐达线及手动入榜仅 {total} 套（少于 {HOME_MIN_VISIBLE}），请复核")


def board_population(board):
    pieces = board.get("pieces")
    return sum(2 if piece.get("unitId") == "baron-nashor" else 1
               for piece in pieces if isinstance(piece, dict)) if isinstance(pieces, list) else 0


def qualified_home_guides(families, primaries, boards, decisions, excluded, sections_by_id):
    comparable = [row for row in families if type(row.get("games")) is int and row["games"] >= HOME_MIN_GAMES
                  and type(row.get("mean")) in (int, float) and 1 <= row["mean"] <= 8]
    linked = [(row, dict.fromkeys(recommendation_board_ids(row, primaries.get(row["sectionId"]))))
              for row in comparable]
    counts = Counter((row["sectionId"], board) for row, keys in linked for board in keys)
    for row, keys in linked:
        section_id = row["sectionId"]
        is_hero = sections_by_id[section_id].get("category") == "英雄强化阵容"
        if is_hero != bool(row.get("heroAugment")) or row["mean"] > HOME_CUTOFF:
            continue
        canonical = (row.get("teamId") or primaries.get(section_id), row.get("landingTeamId"))
        if any((section_id, board) in excluded for board in canonical if isinstance(board, str)):
            continue
        eligible = [(section_id, board) for board in keys if counts[(section_id, board)] == 1
                    and (section_id, board) in boards and (section_id, board) not in excluded]
        first = next((key for key in eligible if decisions.get(key, (None, None))[1]
                      in ("recommended", "conditional")), eligible[0] if eligible else None)
        if first is not None:
            yield section_id, "heroAugment" if is_hero else decisions.get(first, (None, None))[0]


def board_units(board):
    return Counter(piece["unitId"] for piece in (board.get("pieces") or [])
                   if isinstance(piece, dict) and isinstance(piece.get("unitId"), str))


def check_sample_bindings(boards, current, errors):
    by_team = {team_id: (section_id, board) for (section_id, team_id), board in boards.items()}
    placement = read_json("data/guide-placement.json", dict, errors)
    s19_pbe = current.get("seasonId") == "s19-pbe"
    source_ids = {}
    if s19_pbe:
        reference = read_json("data/conditional-gear-unit-ids.json", dict, errors)
        source_ids = {api_id: unit_id for unit_id, api_id in reference.get("units", {}).items()}
    for index, row in enumerate(placement.get("records") or []):
        if not isinstance(row, dict) or row.get("sourcePeriod") or row.get("boardObservation"):
            continue
        scope = row.get("conditions") or {}
        if not isinstance(scope, dict) or "teamId" not in scope:
            continue
        team_id = scope["teamId"]
        path = f"data/guide-placement.json.records[{index}] ({team_id})"
        if not isinstance(team_id, str) or team_id not in by_team:
            errors.append(f"{path}：战绩绑定的公开棋盘不存在")
            continue
        _, board = by_team[team_id]
        units = board_units(board)
        if scope.get("population") is not None and scope["population"] != board_population(board):
            errors.append(f"{path}：统计条件人口与公开棋盘不一致")
        if scope.get("kind") == "core":
            core = scope.get("coreRoster")
            if not isinstance(core, list) or not core or any(not isinstance(unit, str) or unit not in units for unit in core):
                errors.append(f"{path}：核心样本包含目标棋盘未上场的棋子")
            continue
        try:
            url = urlsplit(row.get("url") or "")
            query = parse_qs(url.query)
        except (ValueError, TypeError):
            errors.append(f"{path}：样本查询链接无效")
            continue
        if query.get("tab") != ["comps"]:
            if scope.get("kind") == "fixed":
                errors.append(f"{path}：固定终盘需要精确名单查询")
            continue
        roster = row.get("roster")
        if (row.get("population") != board_population(board) or not isinstance(roster, list)
                or not all(isinstance(unit, str) for unit in roster) or Counter(roster) != units):
            errors.append(f"{path}：固定终盘样本的人口或名单与公开棋盘不一致")
        if query.get("level") != [str(row.get("population"))]:
            errors.append(f"{path}：来源查询的结算等级与固定终盘样本不一致")
        if s19_pbe:
            query_units = Counter(source_ids.get(token.split("-", 1)[0]) for token in query.get("unit", []))
            if query_units != units:
                errors.append(f"{path}：来源查询的棋子名单与绑定棋盘不一致")

    for name in ("guide-carry-stats", "patch-recommendation-stats"):
        snapshot = read_json(f"data/{name}.json", dict, errors)
        for index, row in enumerate(snapshot.get("rows") or []):
            if not isinstance(row, dict):
                continue
            section_id, team_id = row.get("sectionId"), row.get("teamId")
            path = f"data/{name}.json.rows[{index}] ({team_id})"
            if not all(isinstance(key, str) for key in (section_id, team_id)) or (section_id, team_id) not in boards:
                errors.append(f"{path}：样本绑到了其他攻略或不存在的棋盘")
                continue
            anchors = row.get("anchorIds") or []
            units = board_units(boards[(section_id, team_id)])
            if not isinstance(anchors, list) or any(not isinstance(unit, str) or unit not in units for unit in [row.get("carryId"), *anchors]):
                errors.append(f"{path}：主 C 或核心棋子不在绑定棋盘上")


def check_family_bindings(family_map, family, boards, family_aligned, errors):
    map_name = "data/guide-family-map.json"
    stats_name = "data/guide-family-stats.json"
    rows = family_map.get("rows")
    if not isinstance(rows, list):
        return
    model = family_map.get("model")
    if type(model) is not int:
        errors.append(f"{map_name}：缺少有效整数 model")
    seen_clusters = set()
    used_boards = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        path = f"{map_name}.rows[{index}]"
        cluster_id = row.get("clusterId")
        if not isinstance(cluster_id, str) or not cluster_id.strip():
            errors.append(f"{path}.clusterId：缺少有效分组 ID")
        elif cluster_id in seen_clusters:
            errors.append(f"{path}.clusterId：重复绑定分组 {cluster_id}")
        else:
            seen_clusters.add(cluster_id)
        section_id, team_id = row.get("sectionId"), row.get("teamId")
        if isinstance(section_id, str):
            if not isinstance(team_id, str) or (section_id, team_id) not in boards:
                errors.append(f"{path}.teamId：未在对应公开攻略中找到棋盘 {team_id}")
            if "landingTeamId" in row:
                landing = row.get("landingTeamId")
                if not isinstance(landing, str) or (section_id, landing) not in boards:
                    errors.append(f"{path}.landingTeamId：未在对应公开攻略中找到棋盘 {landing}")
            if "sharedTeamIds" in row:
                shared = row.get("sharedTeamIds")
                if not isinstance(shared, list) or any(
                    not isinstance(tid, str) or (section_id, tid) not in boards for tid in shared
                ):
                    errors.append(f"{path}.sharedTeamIds：包含未在对应公开攻略中找到的棋盘")
            shared_ids = row.get("sharedTeamIds")
            links = [team_id, row.get("landingTeamId"), *(shared_ids if isinstance(shared_ids, list) else [])]
            carries = row.get("carryIds")
            for target in dict.fromkeys(key for key in links if isinstance(key, str)):
                key = (section_id, target)
                if key not in boards:
                    continue
                previous = used_boards.setdefault(key, index)
                if previous != index:
                    errors.append(f"{path}：棋盘 {target} 重复绑定多个体系")
                units = board_units(boards[key])
                if not isinstance(carries, list) or not any(isinstance(unit, str) and unit in units for unit in carries):
                    errors.append(f"{path}：棋盘 {target} 不含该体系的主 C")

    present = {}
    for collection_key in ("rows", "smallSamples"):
        collection = family.get(collection_key)
        if collection is None:
            continue
        if not isinstance(collection, list):
            errors.append(f"{stats_name}.{collection_key}：须为数组")
            continue
        for item in collection:
            if not isinstance(item, dict) or item.get("clusterId") is None:
                continue
            cid = str(item["clusterId"])
            if cid in present:
                errors.append(f"{stats_name}：重复收录体系分组 {cid}")
            else:
                present[cid] = item

    if family_aligned and type(model) is int:
        if type(family.get("model")) is not int or family.get("model") != model:
            errors.append(f"{stats_name}：体系模型 {family.get('model')} 与 {map_name}（{model}）不一致")
        else:
            for row in rows:
                if not isinstance(row, dict) or not isinstance(row.get("clusterId"), str):
                    continue
                cid = row["clusterId"].strip()
                if not cid:
                    continue
                if cid not in present:
                    label = row.get("name") or row.get("sectionId") or cid
                    errors.append(f"{stats_name}：缺少已绑定体系 {cid}（{label}），不允许残缺快照上线")
                    continue
                actual = present[cid]
                if (actual.get("sectionId") != row.get("sectionId")
                        or actual.get("teamId") != row.get("teamId")
                        or actual.get("landingTeamId") != row.get("landingTeamId")
                        or actual.get("sharedTeamIds", []) != row.get("sharedTeamIds", [])
                        or actual.get("carryIds") != row.get("carryIds")
                        or actual.get("url") != row.get("url")):
                    errors.append(f"{stats_name}：体系 {cid} 的攻略、棋盘、主 C 或来源与 {map_name} 不一致")
            orphans = sorted(set(present) - seen_clusters)
            if orphans:
                errors.append(f"{stats_name}：存在未在 {map_name} 登记的残留分组（{'、'.join(orphans[:5])}）")


def check_references(recommendations, family, current, effective,
                     patch_ready, family_aligned, warnings, errors):
    preview = read_json("data/public-preview.json", dict, errors)
    sections = preview.get("sections")
    if not isinstance(sections, list) or not sections:
        errors.append("data/public-preview.json：sections 缺失或为空")
        sections = []
    sections = [section for section in sections if isinstance(section, dict) and isinstance(section.get("id"), str)]
    ids = {section["id"] for section in sections}
    boards, primaries, sections_by_id = collect_public_boards(sections, preview, errors)
    check_recommendation_entries(recommendations, family, boards, primaries, sections_by_id,
                                 current, effective, patch_ready, family_aligned, warnings, errors)
    names = ("data/patch-recommendations.json", "data/guide-family-map.json")
    family_map = read_json(names[1], dict, errors)
    pending_map = family_map.get("sampleStatus") == "pending"
    if pending_map or family.get("sampleStatus") == "pending":
        season = current.get("seasonId") or ""
        if (not patch_ready or not current.get("launchTransition") or not pending_map
                or family.get("sampleStatus") != "pending" or family_map.get("rows") != []
                or family_map.get("model") is not None or family.get("model") is not None
                or edition(family_map.get("seasonId")) != season
                or family_map.get("set") != "TFTSet" + season.split("-")[0][1:]
                or family_map.get("set") != family.get("set")
                or str(family_map.get("queue")).upper() not in RANKED_QUEUES
                or family_map.get("patch") != current["patch"] or family_map.get("build") != current["build"]):
            errors.append(f"{names[1]}：待采集的正式服体系映射需与空体系战绩同批，且不含旧模型")
    for name, source, key in zip(names, (recommendations, family_map), ("entries", "rows")):
        rows = source.get(key)
        if (not isinstance(rows, list) or (key == "rows" and not pending_map and not rows)
                or not all(isinstance(row, dict) and "sectionId" in row for row in rows)):
            errors.append(f"{name}：{key} 缺少攻略章节引用")
        if PRIVATE_ID.search(json.dumps(source, ensure_ascii=False)):
            errors.append(f"{name}：含私有 doxc 前缀 ID")
        for path, record in objects(source, name):
            if "sectionId" in record:
                section_id = record["sectionId"]
                if not isinstance(section_id, str) or section_id not in ids:
                    errors.append(f"{path}.sectionId：未在公开攻略中找到")
    if not pending_map:
        check_family_bindings(family_map, family, boards, family_aligned, errors)
    check_sample_bindings(boards, current, errors)


def release_inventory(preview, reroll, family_map, placement):
    sections = [section for section in preview["sections"] if section.get("kind") != "category"]
    boards, _, _ = collect_public_boards(sections, preview, [], reroll)
    inventory = {*(f"guide:{section_id}" for section_id, _ in boards),
                 *(f"board:{section_id}/{team_id}" for section_id, team_id in boards),
                 *(f"family:{row['clusterId']}" for row in family_map["rows"])}
    for row in placement["records"]:
        scope = row.get("conditions") or {}
        if not scope.get("teamId") or row.get("sourcePeriod") or row.get("boardObservation"):
            continue
        kind = "augment" if scope.get("augmentId") or row.get("referencesAugment") else scope.get("kind")
        if kind in {"full", "fixed"}:
            kind = "fixed" if parse_qs(urlsplit(row["url"]).query).get("tab") == ["comps"] else "lineup"
        inventory.add(f"sample:{kind}/{scope['teamId']}")
    return inventory


def check_release_inventory(base, patch, modules, errors):
    if not re.fullmatch(r"[0-9a-f]{7,40}", base):
        errors.append("发布对账需要明确的 Git 基线提交")
        return
    def read_base(name):
        result = run(["git", "show", f"{base}:site/data/{name}.json"], cwd=ROOT, check=True, capture_output=True)
        return json.loads(result.stdout)

    files = ("public-preview", "s19-reroll-boards", "guide-family-map", "guide-placement")
    try:
        previous = [read_base(name) for name in files]
        current = [read_json(f"data/{name}.json", list if name == "s19-reroll-boards" else dict, errors) for name in files]
        before, after = release_inventory(*previous), release_inventory(*current)
        previous_patch = read_base("current-patch")
        launch = patch.get("launchTransition") and not previous_patch.get("launchTransition")
        live = patch["seasonId"]
        if launch and (previous_patch.get("seasonId") != live.removesuffix("-live") + "-pbe"
                       or edition(previous[0]["season"]["id"]) != previous_patch.get("seasonId")
                       or edition(current[0]["season"]["id"]) != live):
            errors.append("只有同赛季 PBE 切至正式服可以启用首版待采集状态")
            launch = False
        if launch or previous[2].get("model") != current[2].get("model") or previous[2]["set"] != current[2]["set"]:
            before = {key for key in before if not key.startswith("family:")}
        if launch or any(previous[3].get(key) != current[3].get(key) for key in ("edition", "patch", "build")):
            before = {key for key in before if not key.startswith("sample:")}
        if edition(previous[0]["season"]["id"]) == edition(current[0]["season"]["id"]):
            for entry in modules:
                module = entry["id"]
                previous_module = read_base(module)
                if entry["alignment"] == "pending" and previous_module.get("sampleStatus") != "pending":
                    errors.append(f"data/{module}.json：已采集的数据不能退回待采集")
                old = check_module(module, previous_module, {}, None, False, [], [])
                if old["patch"] != entry["patch"]:
                    continue
                parse_date = sample_date if module == "guide-placement" else timestamp
                before_time, after_time = parse_date(old["sampledAt"]), parse_date(entry["sampledAt"])
                if before_time and after_time and after_time < before_time:
                    errors.append(f"data/{module}.json：采样时间倒退（{old['sampledAt']} → {entry['sampledAt']}）")
    except (CalledProcessError, ValueError, KeyError, TypeError, OSError) as error:
        errors.append(f"无法生成发布目录对账：{error}")
        return
    removed = before - after
    declared = set(re.findall(r"^\s*- retire `([^`]+)` +[—-] +\S[^\r\n]*$", os.environ.get("RELEASE_PR_BODY", ""), re.M))
    if launch:
        for key in sorted(removed & declared):
            errors.append(f"正式服首版过渡必须保留已发布攻略与棋盘 {key}")
    for key in sorted(removed - declared):
        errors.append(f"发布目录遗漏 {key}。确需下线时，在 PR 正文逐项写 - retire `{key}` — 原因")
    for key in sorted(declared - removed):
        errors.append(f"PR 申报下线 {key}，但本批并未移除该条目")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="Also compare guide, board and family inventory with a Git base commit")
    args = parser.parse_args()
    errors, warnings, modules = [], [], []
    current, effective, valid_patch = current_patch(errors)
    checked = 0
    family, family_aligned = {}, False
    for module in MODULES:
        data = read_json(f"data/{module}.json", dict, errors)
        modules.append(check_module(module, data, current, effective, valid_patch, warnings, errors))
        if module in DISTRIBUTIONS:
            checked += check_distributions(module, data, errors)
        if module == "guide-family-stats":
            family, family_aligned = data, modules[-1]["alignment"] == "aligned"
        if module == "patch-recommendations":
            check_references(data, family, current, effective, valid_patch, family_aligned, warnings, errors)
    batches = check_history(errors)
    if args.base and not errors:
        check_release_inventory(args.base, current, modules, errors)
    print(json.dumps({
        "ok": not errors, "currentPatch": current, "modules": modules,
        "historyBatches": batches, "checkedDistributions": checked,
        "warnings": warnings, "errors": errors,
    }, ensure_ascii=False, allow_nan=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
