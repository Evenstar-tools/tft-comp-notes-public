"""Refresh the S19 catalog or import a source's complete augment choice statistics for one edition."""
import argparse
import json
import math
import os
import re
import tempfile
from collections import Counter
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "data"
LOOKUP = "https://data.metatft.com/lookups/TFTSet19_pbe_zh_cn.json"
NOXU = "https://noxutft.com/zh/tft-augments"
TIERS = {"Silver": "银色", "Gold": "金色", "Prismatic": "棱彩"}

# These descriptions are still English in the Simplified Chinese game lookup.
TRANSLATIONS = {
    "DA_ChampionAirdrop": '立即获得<TFTCurveTable row="Champions_0"/>名<TFTCurveTable row="ChampionCost_TOOLTIPONLY"/>费弈子。<TFTCurveTable row="Delay_1"/>回合后再获得<TFTCurveTable row="Champions_1"/>名。此后每次空投，等候回合和弈子数各增加<TFTCurveTable row="Increase_TOOLTIPONLY"/>。',
    "DA_Cloning": '每场玩家战斗后，随机复制一名场上弈子。场上不同弈子少于<TFTCurveTable row="MinUniqueChampsToPrint"/>名时，有可能改为获得金币。',
    "DA_ThreeFourTime": '立即获得<TFTCurveTable row="Gold"/>金币、<TFTCurveTable row="Health"/>玩家生命和<TFTCurveTable row="Rerolls"/>次商店刷新。<TFTCurveTable row="Delay"/>回合后，获得一名随机<TFTCurveTable row="ChampionCost"/>费弈子。',
    "DA_ReunionShowII": '获得一批拥有相同羁绊的弈子，总价值为<TFTCurveTable row="GoldValue"/>金币。',
    "DA_Elise19_HeroAugment": '获得一名伊莉丝。最强的伊莉丝成为法系刺客。她的撕咬击杀敌人后，会对低生命值敌人再次施放。',
    "DA_19_HeartsteelPrismaticTour": '获得心之钢棱彩任务、3名心之钢弈子、1个幸运装备宝箱和7金币。开启7心之钢，让心之钢弈子造成伤害、承伤并治疗。',
    "DA_19_HeartsteelPrismaticTourPlus": '获得心之钢棱彩任务、3名心之钢弈子、3件基础装备和2金币。开启7心之钢，让心之钢弈子造成伤害、承伤并治疗。',
    "DA_19_KDAPrismaticTour": '获得 K/DA 棱彩任务、3名 K/DA 弈子、2个微型复制器、1个次级英雄复制器和10金币。场上 K/DA 弈子的星级总和需达到<TFTCurveTable row="RequiredStarLevels"/>星。',
    "DA_Augment19_Manager_ManagementTrack": '获得经纪人纹章和蕾欧娜。弈子获得经纪人加成时，有<TFTCurveTable row="GoldChance" format="percent"/>概率获得<TFTCurveTable row="GoldToGrant"/>金币。靠经纪人累计获得<TFTCurveTable row="GoldReq"/>金币后，获得蒙多医生和狂徒铠甲。',
    "DA_Augment19_Manager_StakeholderMeeting": '增加2个经纪人格。站在格上的经纪人获得<TFTCurveTable row="HealthPercent" format="percentMinusOne"/>最大生命加成，格子加成额外提高<TFTCurveTable row="HexPercentIncrease" format="percentMinusOne"/>。<TFTCurveTable row="NumRounds"/>回合后获得蕾欧娜和2名天才弈子。',
    "DA_Augment19_Manager_StakeholderMeetingLate": '增加2个经纪人格。站在格上的经纪人获得<TFTCurveTable row="HealthPercent" format="percentMinusOne"/>最大生命加成，格子加成额外提高<TFTCurveTable row="HexPercentIncrease" format="percentMinusOne"/>。立即获得蕾欧娜和2名天才弈子。',
    "DA_19_PentakillPrismaticTourPlus": '获得五杀乐队棱彩任务、3名五杀乐队弈子、2件基础装备和10金币。开启7五杀，让光明使者完成击杀，并升到10级。',
}
TRANSLATIONS["DA_Augment19_Manager_ManagementTrackPlus"] = TRANSLATIONS["DA_Augment19_Manager_ManagementTrack"]


def load_url(url):
    with urlopen(Request(url, headers={"User-Agent": "TFT-Comp-Notes/1.0"}), timeout=30) as response:
        return response.read()


def game_text(item):
    source = item.get("desc") or ""
    if not re.search(r"[\u4e00-\u9fff]", source):
        source = TRANSLATIONS.get(item["apiName"], source)
    curves = item.get("curveTable", {}) | item.get("curveValues", {})

    def value(match):
        attrs = dict(re.findall(r'(\w+)="([^"]+)"', match.group(0)))
        points = curves.get(attrs["row"], [])
        column = int(attrs.get("column", 1))
        number = next((v for k, v in points if k == column), None)
        if number is None and points and len(set(v for _, v in points)) == 1:
            number = points[0][1]
        if number is None:
            raise ValueError(f"Unresolved value in {item['apiName']}: {attrs}")
        fmt = attrs.get("format", "").lower()
        if fmt == "percentminusone":
            number -= 1
        if fmt == "invertedpercent":
            number = 1 - number
        percent = fmt in ("percent", "p", "percentminusone", "invertedpercent")
        return f"{round(number * (100 if percent else 1), int(attrs.get('precision', 3))):g}" + ("%" if percent else "")

    source = re.sub(r"<TFTCurveTable\b[^>]*>", value, source, flags=re.I)
    # Dynamic counters and per-player rolls have no value before a game.
    source = re.sub(r"\(最大：<TFTAttribute\b[^>]*/>/(\d+)\)", r"（最多 \1 件）", source)
    source = re.sub(r"\{Augment\.Variant\.[^}]+\}|<[^>]*>", "", source)
    return " ".join(source.split())


def catalog():
    lookup = json.loads(load_url(LOOKUP))
    meta = lookup["_metadata"]
    if meta["set"] != "TFTSet19" or meta["patch"] != "pbe":
        raise ValueError(f"Unexpected game source {meta}")
    active = [a for a in lookup["augments"] if "Augment.ExcludeFromCatalog" not in a["tags"]]
    counts = Counter(a["apiName"] for a in active)
    rows = []
    for a in active:
        key = a["apiName"]
        if counts[key] > 1:
            variant = re.sub(r"[^a-z0-9]+", "-", a["en_name"].lower().replace("+", "-plus")).strip("-")
            key += "--" + variant
        rows.append({"id": key, "apiName": a["apiName"], "name": a["name"], "english": a["en_name"],
                     "rarity": TIERS[a["rarity"]], "rounds": a["rounds"], "effect": game_text(a),
                     "kind": "hero" if "Augment.Category.Hero" in a["tags"] else a["type"],
                     "icon": (a.get("icon") or "").lower()})
    assert len(rows) >= 200 and len({r["id"] for r in rows}) == len(rows)
    return {"source": LOOKUP, "release": meta["release"], "generated": meta["generated"], "rows": rows}


def selection_snapshot(history):
    from bs4 import BeautifulSoup

    page = BeautifulSoup(load_url(NOXU), "html.parser")
    header = page.select_one("main header")
    heading = header.get_text(" ", strip=True)
    season = int(re.search(r"第\s*(\d+)\s*赛季", header.h1.get_text(strip=True))[1])
    updated = re.search(r"更新于\s*(\d{4})年(\d+)月(\d+)日", heading)
    if not updated:
        raise ValueError("Noxu publication date is missing")
    source_date = date(*map(int, updated.groups())).isoformat()
    if re.search(r"\bPBE\b|测试服", heading, re.I):
        realm = "pbe"
    elif re.search(r"正式服|\blive\b", heading, re.I):
        realm = "live"
    elif any(s["source"] == NOXU and s["season"] == season and s["realm"] == "live" and
             not s.get("patch") for s in history.values()) and season == 18:
        # The archived S18 comparison already identifies this season-only table.
        realm = "live"
    else:
        raise ValueError("Noxu does not identify this table's realm; keep existing results")
    patch_match = re.search(r"(?:补丁|版本|\bpatch)\s*[:：]?\s*(\d+\.\d+(?:\.\d+)*[a-z]?)", heading, re.I)
    if season >= 19 and not patch_match:
        raise ValueError("Noxu does not identify the patch for this season; keep existing results")
    rows = []
    for tr in page.select("tbody tr[data-row]"):
        cells = tr.find_all("td", recursive=False)
        name, rarity, grade = cells[0].b.get_text(strip=True), tr["data-f"].title(), cells[2].get_text(strip=True)
        api = cells[0].select_one("[data-tt]")["data-tt"].removeprefix("aug:")
        mean, top4 = cells[3].get_text(strip=True), cells[4].get_text(strip=True)
        effect = cells[0].find("em")
        row = {"apiName": api, "name": name, "rarity": TIERS[rarity], "grade": grade,
               "effect": effect.get_text(" ", strip=True) if effect else ""}
        if mean != "—":
            row["mean"] = float(mean)
        if top4 != "—":
            row["top4"] = float(top4.rstrip("%"))
        rows.append(row)
    expected = re.search(r"全部\s*(\d+)\s*个强化符文", heading)
    if not expected or len(rows) != int(expected[1]):
        raise ValueError("Noxu returned an incomplete table")
    result = {"season": season, "realm": realm, "date": source_date, "source": NOXU, "sourceName": "NoxuTFT",
              "scope": "NoxuTFT 客户端玩家，平均名次经校正，单项场数未公开。", "rows": rows}
    if patch_match:
        result["patch"] = patch_match[1]
    return result


def save(path, obj):
    file = tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name, suffix=".tmp", delete=False)
    temp = Path(file.name)
    try:
        with file:
            file.write((json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n").encode())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


PERFORMANCE = {"mean": (1, 8), "top4": (0, 100), "win": (0, 100)}
ROUNDS = {"all", "2-1", "3-2", "4-2"}


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def require_text(obj, field):
    if not isinstance(obj.get(field), str) or not obj[field].strip():
        raise ValueError(f"Missing text field: {field}")
    return obj[field]


def bind_catalog_row(row, entries, check_rounds):
    if row.get("id"):
        matches = [e for e in entries if e["id"] == row["id"]]
    else:
        matches = [e for e in entries if e["apiName"] == row.get("apiName") and e["rarity"] == row.get("rarity")
                   and row.get("name") in (e["name"], e["english"])]
    if len(matches) != 1:
        raise ValueError(f"Unknown or ambiguous S19 augment: {row.get('id') or row.get('apiName')}")
    e = matches[0]
    if any(row.get(k, e[k]) != e[k] for k in ("apiName", "rarity")) or row.get("name", e["name"]) not in (e["name"], e["english"]):
        raise ValueError(f"Catalog identity conflicts with {e['id']}")
    if check_rounds and row.get("round", "all") != "all" and e["rounds"] and row["round"] not in e["rounds"]:
        raise ValueError(f"{e['id']} cannot be selected at {row['round']}")
    row.update({key: e[key] for key in ("id", "apiName", "name", "english", "rarity")})


def validate_snapshot(snapshot, game, *, archived=False):
    if not isinstance(snapshot, dict) or type(snapshot.get("season")) is not int or snapshot["season"] <= 0:
        raise ValueError("A positive season number is required")
    if snapshot.get("realm") not in ("pbe", "live"):
        raise ValueError("realm must be pbe or live")
    if "patch" in snapshot or not archived or snapshot["season"] >= 19:
        if not re.fullmatch(r"\d+\.\d+(?:\.\d+)*[a-z]?", require_text(snapshot, "patch")):
            raise ValueError("Use a patch such as 19.1")
    if date.fromisoformat(require_text(snapshot, "date")).isoformat() != snapshot["date"]:
        raise ValueError("Use a source date in YYYY-MM-DD format")
    source = urlsplit(require_text(snapshot, "source"))
    if source.scheme != "https" or not source.hostname or source.username or source.password:
        raise ValueError("Provide the HTTPS address of the source table")
    require_text(snapshot, "scope")
    if "sourceName" in snapshot:
        require_text(snapshot, "sourceName")
    if not isinstance(snapshot.get("rows"), list):
        raise ValueError("Expected a rows array")
    release = game.get("release", "").lower()
    round_basis = snapshot.get("roundBasis", "stage")
    if round_basis not in ("stage", "pick-order"):
        raise ValueError("roundBasis must be stage or pick-order")
    # Some sources label the first, second and third pick as 2-1, 3-2 and
    # 4-2 even in special encounters that move the picks to another stage.
    check_rounds = (round_basis == "stage" and release.startswith("rls-" + str(snapshot.get("patch")) + ".")
                    and release.endswith("." + snapshot["realm"]))
    seen = set()
    for row in snapshot["rows"]:
        if not isinstance(row, dict):
            raise ValueError("Expected one object per augment row")
        # Missing source values may be omitted or null. A published zero stays zero.
        for key in ("grade", "games", *PERFORMANCE, "effect", "english", "round", "id"):
            if row.get(key) is None:
                row.pop(key, None)
        round_id = row.get("round", "all")
        if round_id not in ROUNDS:
            raise ValueError(f"Invalid selection round: {round_id}")
        if snapshot["season"] == 19:
            bind_catalog_row(row, game["rows"], check_rounds)
        for key in ("apiName", "name", "rarity"):
            require_text(row, key)
        if row["rarity"] not in TIERS.values():
            raise ValueError(f"Invalid rarity for {row['name']}")
        for key in ("grade", "effect", "english", "id"):
            if key in row and not isinstance(row[key], str):
                raise ValueError(f"Invalid {key} for {row['name']}")
        identity = (row["apiName"], row.get("id", row["name"]), row["rarity"], round_id)
        if identity in seen:
            raise ValueError(f"Duplicate augment and round: {identity}")
        seen.add(identity)
        if "games" in row and (type(row["games"]) is not int or row["games"] < 1):
            raise ValueError(f"Invalid sample size for {row['name']}")
        for metric, (low, high) in PERFORMANCE.items():
            if metric in row:
                value = row[metric]
                if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                    raise ValueError(f"Invalid {metric} for {row['name']}")
        if "win" in row and "top4" in row and row["win"] > row["top4"]:
            raise ValueError(f"Win rate exceeds top four rate for {row['name']}")
    if not any(PERFORMANCE.keys() & row.keys() for row in snapshot["rows"]):
        raise ValueError("No selection performance figures were supplied; keeping the previous snapshot")


@contextmanager
def archive_lock(dst):
    # The OS releases the lock even if the importing process is interrupted.
    if os.name == "nt":
        flags = os.O_CREAT | os.O_EXCL | os.O_TEMPORARY | os.O_RDWR
        try:
            fd = os.open(dst.with_name(dst.name + ".lock"), flags)
        except (FileExistsError, PermissionError):
            raise ValueError(f"Could not lock {dst}; check for another update or directory permissions") from None
    else:
        import fcntl
        fd = os.open(dst.parent, os.O_RDONLY)
    try:
        if os.name != "nt":
            fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def update_results(dst, import_file=None, game_file=ROOT / "augment-catalog.json"):
    with archive_lock(dst):
        history = read_json(dst) if dst.exists() else {}
        fresh = read_json(import_file) if import_file else selection_snapshot(history)
        validate_snapshot(fresh, read_json(game_file), archived=import_file is None)
        edition = (fresh["season"], fresh["realm"], fresh.get("patch"))
        key = next((k for k, s in history.items() if (s["season"], s["realm"], s.get("patch")) == edition),
                   f"{edition[0]}:{edition[1]}:{edition[2] or 'unversioned'}")
        previous = history.get(key)
        if previous and previous["date"] > fresh["date"]:
            raise ValueError("An older snapshot cannot replace a newer one")
        if previous and fresh["season"] < 19 and fresh["source"] == previous["source"] == NOXU:
            # The Chinese Noxu table omits the English labels matched from its parallel edition.
            def label_key(row):
                return (row["apiName"], row["rarity"], row["name"], row.get("id"), row.get("round", "all"))
            labels = {label_key(row): row["english"] for row in previous["rows"] if row.get("english")}
            for row in fresh["rows"]:
                label = labels.get(label_key(row))
                if label and not row.get("english"):
                    row["english"] = label
        if previous != fresh:
            history[key] = fresh
            save(dst, history)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, epilog=(
        "Offline import takes a JSON object with season, realm (pbe/live), patch, date (YYYY-MM-DD), "
        "source (HTTPS), scope (who was observed), optional sourceName, and rows. "
        "Each S19 row identifies an augment by catalog id or by apiName, name and rarity. "
        "Use source-reported mean (1–8), top4/win (0–100), optional games, grade, and round "
        "(all, 2-1, 3-2 or 4-2). Missing round denotes an unsplit sample. "
        "For sources grouping by pick order instead of the actual stage, set roundBasis to pick-order "
        "and describe it in scope. Omit unavailable metrics. A new dated import replaces the complete snapshot for that edition."
    ))
    parser.add_argument("--only", choices=["catalog", "results"])
    parser.add_argument("--import-results", type=Path, help="Import a complete, source-identified selection snapshot (offline)")
    parser.add_argument("--results-output", type=Path, default=ROOT / "augment-results.json", help="Override the results archive path")
    parser.add_argument("--results-catalog", type=Path, default=ROOT / "augment-catalog.json", help="Catalog for resolving augment IDs when importing an older patch")
    args = parser.parse_args()
    if args.only == "catalog" and args.import_results:
        parser.error("--only catalog cannot also import results")
    try:
        if not args.import_results and args.only != "results":
            save(ROOT / "augment-catalog.json", catalog())
        if args.only != "catalog":
            update_results(args.results_output, args.import_results, args.results_catalog)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, f"Refresh failed: {exc}\n")
