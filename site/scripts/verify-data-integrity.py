"""Validate the committed statistics and public archive without network access."""

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
    if not count:
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


def check_recommendation_entries(recommendations, sections, errors):
    name = "data/patch-recommendations.json"
    entries = recommendations.get("entries")
    if not isinstance(entries, list):
        return
    boards = {
        (section["id"], team["id"]): section.get("category")
        for section in sections
        for team in [section.get("team"), *(section.get("teams") or [])]
        if isinstance(team, dict) and isinstance(team.get("id"), str)
    }
    seen, active, groups = set(), set(), set()
    regular_guides, hero_guides = set(), set()
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
        if not isinstance(section_id, str) or not isinstance(team_id, str) or (section_id, team_id) not in boards:
            errors.append(f"{path}.teamId：未在对应的公开攻略中找到")
            continue
        key = (section_id, team_id)
        if key in seen:
            errors.append(f"{path}.teamId：同一棋盘只能写一次")
            continue
        seen.add(key)
        is_hero = boards[key] == "英雄强化阵容"
        if valid_group and is_hero != (group == "heroAugment"):
            errors.append(f"{path}.group：与公开攻略的英雄强化分类不匹配")
        if status in ("recommended", "conditional"):
            active.add(team_id)
            if is_hero:
                hero_guides.add(section_id)
            else:
                regular_guides.add((group, section_id))
                if valid_group:
                    groups.add(group)

    regular, hero = len(regular_guides), len(hero_guides)

    max_regular, max_hero = 15, 2
    if regular > max_regular or hero > max_hero:
        errors.append(f"{name}：常规推荐最多 {max_regular} 套，英雄强化最多 {max_hero} 套")
    if regular == max_regular and groups and not REGULAR_GROUPS.issubset(groups):
        errors.append(f"{name}：{max_regular} 套常规推荐须涵盖赌狗、84 和 95")
    if "displayOrder" in recommendations:
        order = recommendations["displayOrder"]
        if not isinstance(order, list) or not all(isinstance(team_id, str) and team_id in active for team_id in order):
            errors.append(f"{name}.displayOrder：只可引用推荐或有条件的棋盘")
        elif len(order) != len(set(order)):
            errors.append(f"{name}.displayOrder：棋盘不得重复")


def check_references(recommendations, errors):
    preview = read_json("data/public-preview.json", dict, errors)
    sections = preview.get("sections")
    if not isinstance(sections, list) or not sections:
        errors.append("data/public-preview.json：sections 缺失或为空")
        sections = []
    sections = [section for section in sections if isinstance(section, dict) and isinstance(section.get("id"), str)]
    ids = {section["id"] for section in sections}
    check_recommendation_entries(recommendations, sections, errors)
    names = ("data/patch-recommendations.json", "data/guide-family-map.json")
    family_map = read_json(names[1], dict, errors)
    for name, source, key in zip(names, (recommendations, family_map), ("entries", "rows")):
        rows = source.get(key)
        if not isinstance(rows, list) or not rows or not all(isinstance(row, dict) and "sectionId" in row for row in rows):
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
    for module in MODULES:
        data = read_json(f"data/{module}.json", dict, errors)
        modules.append(check_module(module, data, current, effective, valid_patch, warnings, errors))
        if module in DISTRIBUTIONS:
            checked += check_distributions(module, data, errors)
        if module == "patch-recommendations":
            check_references(data, errors)
    batches = check_history(errors)
    print(json.dumps({
        "ok": not errors, "currentPatch": current, "modules": modules,
        "historyBatches": batches, "checkedDistributions": checked,
        "warnings": warnings, "errors": errors,
    }, ensure_ascii=False, allow_nan=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
