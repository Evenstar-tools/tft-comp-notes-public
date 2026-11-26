"""Validate the committed statistics and public archive without network access."""

from collections import Counter
from datetime import date, datetime, timedelta, timezone
import json
from math import isfinite
from pathlib import Path
import re


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
HOME_MIN_REGULAR, HOME_MAX_REGULAR, HOME_MAX_PER_GROUP, HOME_MAX_HERO = 4, 12, 8, 2
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
    effective = timestamp(current.get("effectiveAt"))
    valid_mapping = matches(re.compile(r"\d+\.\d+"), base) and matches(re.compile(r"[a-z]?"), suffix)
    patch = base + suffix if valid_mapping else None
    problems = [
        key for key, valid in (
            ("seasonId", season == edition(season) and season is not None),
            ("build", matches(BUILD, build)),
            ("label", isinstance(label, str) and bool(label.strip())),
            ("metaTftPatch.patch / bPatch", valid_mapping),
            ("effectiveAt", effective is not None),
        ) if not valid
    ]
    if problems:
        errors.append(f"{name}：字段无效（{', '.join(problems)}）")
    return {
        "seasonId": season, "build": build, "label": label,
        "patch": patch, "effectiveAt": current.get("effectiveAt"),
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


def check_module(module, data, current, effective, aligned_check, warnings, errors):
    name = f"data/{module}.json"
    initial_errors = len(errors)
    collection, kind, time_key = MODULES[module]
    records = data.get(collection)
    count = len(records) if isinstance(records, kind) else 0
    if not count and not (module == "patch-recommendations" and isinstance(records, list)):
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
        allowed = {"PBE"} if season.endswith("-pbe") else {"RANKED", "RANKED_TFT", "1100"}
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


def check_recommendation_entries(recommendations, family, sections, current, effective,
                                 patch_ready, family_aligned, warnings, errors):
    name = "data/patch-recommendations.json"
    entries = recommendations.get("entries")
    if not isinstance(entries, list):
        return
    reviewed = timestamp(recommendations.get("reviewedAt"))
    active = (patch_ready and recommendations.get("seasonId") == current["seasonId"]
              and recommendations.get("build") == current["build"] and reviewed is not None and reviewed >= effective)
    current_family = current_recommendation_family(family, recommendations if active else {},
                                                   current, effective, family_aligned)
    boards = {}
    primaries = {}
    sections_by_id = {section["id"]: section for section in sections}
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
        boards.update({(section_id, team_id): team for team_id, team in teams.items()})
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
        stage = (team_id in stage_ids if isinstance(stage_ids, list) else board.get("boardRole") == "stage")
        primary_id = primaries[section_id]
        main_board = boards.get((section_id, primary_id), {})
        if stage and team_id != primary_id and key not in landing_boards and board_population(board) <= board_population(main_board):
            errors.append(f"{path}.override：过渡盘不能置顶或手动入榜")
            continue
        manual[key] = ("heroAugment" if is_hero else group if valid_group else None, override)

    manual_hero = sum(group == "heroAugment" for group, _ in manual.values())
    manual_regular = len(manual) - manual_hero
    if manual_regular > HOME_MAX_REGULAR or manual_hero > HOME_MAX_HERO:
        errors.append(f"{name}：手动入榜常规最多 {HOME_MAX_REGULAR} 套，英雄强化最多 {HOME_MAX_HERO} 套")
    if sum(group != "heroAugment" and override == "pin" for group, override in manual.values()) > 4:
        warnings.append(f"{name}：常规置顶超过 4 条，请复核是否仍需保留")

    if not patch_ready:
        return
    candidates = {(section_id, group) for (section_id, _), (group, _) in manual.items()
                  if group != "heroAugment"}
    if current_family:
        candidates.update(qualified_home_guides(families, primaries, boards, decisions, excluded))
    # The reader infers the group from the guide when editorial metadata is absent.
    classified = {section_id for section_id, group in candidates if group is not None}
    by_group = Counter(group for section_id, group in candidates
                       if group is not None or section_id not in classified)
    total = min(HOME_MAX_REGULAR, by_group.pop(None, 0)
                + sum(min(count, HOME_MAX_PER_GROUP) for count in by_group.values()))
    if total < HOME_MIN_REGULAR:
        warnings.append(f"{name}：本版推荐常规达线及手动入榜仅 {total} 套（少于 {HOME_MIN_REGULAR}），请复核")


def board_population(board):
    pieces = board.get("pieces")
    return sum(2 if piece.get("unitId") == "baron-nashor" else 1
               for piece in pieces if isinstance(piece, dict)) if isinstance(pieces, list) else 0


def qualified_home_guides(families, primaries, boards, decisions, excluded):
    comparable = [row for row in families if type(row.get("games")) is int and row["games"] >= HOME_MIN_GAMES
                  and type(row.get("mean")) in (int, float) and 1 <= row["mean"] <= 8]
    linked = [(row, dict.fromkeys(recommendation_board_ids(row, primaries.get(row["sectionId"]))))
              for row in comparable]
    counts = Counter((row["sectionId"], board) for row, keys in linked for board in keys)
    for row, keys in linked:
        if row.get("heroAugment") or row["mean"] > HOME_CUTOFF:
            continue
        section_id = row["sectionId"]
        canonical = (row.get("teamId") or primaries.get(section_id), row.get("landingTeamId"))
        if any((section_id, board) in excluded for board in canonical if isinstance(board, str)):
            continue
        eligible = [(section_id, board) for board in keys if counts[(section_id, board)] == 1
                    and (section_id, board) in boards and (section_id, board) not in excluded]
        first = next((key for key in eligible if decisions.get(key, (None, None))[1]
                      in ("recommended", "conditional")), eligible[0] if eligible else None)
        if first is not None:
            yield section_id, decisions.get(first, (None, None))[0]


def check_references(recommendations, family, current, effective,
                     patch_ready, family_aligned, warnings, errors):
    preview = read_json("data/public-preview.json", dict, errors)
    sections = preview.get("sections")
    if not isinstance(sections, list) or not sections:
        errors.append("data/public-preview.json：sections 缺失或为空")
        sections = []
    sections = [section for section in sections if isinstance(section, dict) and isinstance(section.get("id"), str)]
    ids = {section["id"] for section in sections}
    check_recommendation_entries(recommendations, family, sections, current, effective,
                                 patch_ready, family_aligned, warnings, errors)
    names = ("data/patch-recommendations.json", "data/guide-family-map.json")
    family_map = read_json(names[1], dict, errors)
    for name, source, key in zip(names, (recommendations, family_map), ("entries", "rows")):
        rows = source.get(key)
        if (not isinstance(rows, list) or (key == "rows" and not rows)
                or not all(isinstance(row, dict) and "sectionId" in row for row in rows)):
            errors.append(f"{name}：{key} 缺少攻略章节引用")
        if PRIVATE_ID.search(json.dumps(source, ensure_ascii=False)):
            errors.append(f"{name}：含私有 doxc 前缀 ID")
        for path, record in objects(source, name):
            if "sectionId" in record:
                section_id = record["sectionId"]
                if not isinstance(section_id, str) or section_id not in ids:
                    errors.append(f"{path}.sectionId：未在公开攻略中找到")


def main():
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
    print(json.dumps({
        "ok": not errors, "currentPatch": current, "modules": modules,
        "historyBatches": batches, "checkedDistributions": checked,
        "warnings": warnings, "errors": errors,
    }, ensure_ascii=False, allow_nan=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
