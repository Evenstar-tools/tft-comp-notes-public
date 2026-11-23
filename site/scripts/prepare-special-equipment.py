"""Import Set 19 equipment tooltips and cookware recipes from matching PBE lookups."""

import argparse
import json
import re
from collections import Counter
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LOOKUP = "https://data.metatft.com/lookups/TFTSet19_pbe_zh_cn.json"
EMBLEM_LOOKUP = "https://data.metatft.com/lookups/TFTSet19_pbe_en_us.json"
CATEGORIES = {"Artifact": "artifact", "Support": "support", "Radiant": "radiant"}
NAMES = {
    "DA_ChaliceOfPower": "能量圣杯",
    "DA_RanduinsOmen": "兰顿之兆",
    "DA_ZekesHerald": "基克的先驱",
    "DA_ZZRotPortal": "兹若特传送门",
    "DA_CrownguardRadiant": "光明版冕卫",
    "TFT_Emblem_CHANGEME": "天才纹章",
}
STAT_NAMES = {
    "ad": "物理加成", "ap": "法术加成", "health": "生命值", "armor": "护甲",
    "mr": "魔抗", "as": "攻速", "manaregen": "法力回复", "critchance": "暴击率",
    "omnivamp": "全能吸血", "damageamp": "伤害增幅", "dura": "伤害减免", "critdmg": "暴击伤害",
}
EMBLEM_STAT_NAMES = {
    "EmblemHealth": "生命值", "EmblemAD": "物理加成", "EmblemAP": "法术加成",
    "EmblemArmor": "护甲", "EmblemMR": "魔抗", "EmblemAS": "攻速",
    "EmblemManaRegen": "法力回复", "EmblemCritChance": "暴击率",
    "EmblemCritDamage": "暴击伤害", "EmblemOmnivamp": "全能吸血",
    "EmblemDA": "伤害增幅", "EmblemDR": "伤害减免",
}
# The English lookup includes emblem effects that are absent from some localized descriptions.
EMBLEM_EFFECTS = {
    "arcanist": "击杀时获得{ManaOnKill}法力值。",
    "bodyguard": "获得相当于总护甲{ResistConversionRatio:percent}的物理加成和相当于总魔抗{ResistConversionRatio:percent}的法术加成。",
    "choreographer": "在前两排时，受到的治疗和护盾效果提高{IncomingHealShieldBonus:percent}。在后两排时，获得{BackAttackSpeedMultiplier:percentMinusOne}攻速和额外移速。",
    "classical": "技能命中的敌人陷入迷醉，持续{CaptivateDuration}秒。陷入迷醉的敌人会为古典乐弈子提供加成。",
    "frontman": "每过{EmpoweredAttackCadence}秒，下次攻击会造成相当于自身最大生命值{PercentHealthDamage:percent}的魔法伤害。",
    "heartsteel": "获得心之钢每项本命加成的{BiasStatPercentage:percent}。",
    "hitmaker": "携带者额外成为一名大腕枪手。",
    "juggernaut": "携带者免疫控制，每有1000点最大生命值，获得{DamageAmpPer1000Health:percent}伤害增幅。",
    "manager": "施放技能时，为聚光灯格上的友军回复相当于本次消耗{EmblemMaxManaPercent:percent}的法力值。",
    "prodigy": "施放技能时，每消耗{PerXManaSpent}法力值，获得{HealthGainPercent:percent}最大生命值。",
    "renegade": "暴击有{EmpoweredCritDamageChance:percent}几率造成{EmpoweredAdditionalCritDamage:percent}额外暴击伤害。",
    "slayer": "根据目标已损失的生命值，最多额外造成{EnemyHealthBasedDamageIncrease:percent}伤害。",
    "swiftstriker": "普攻附带{OnHitTrueDamage}点额外真实伤害，伤害随阶段提升。",
}
# Chinese translations for the lines the localized lookup ships in English.
DESCRIPTIONS = {
    "DA_ChaliceOfPower": "携带者及同一排{AllyHexes}格内的友军获得{AllyAP:percent}法术加成和{AllyMana}法力回复。",
    "DA_RanduinsOmen": "携带者及{AllyHexes}格内的友军获得{AllyResists}护甲和魔抗。",
    "DA_ZekesHerald": "携带者及同一排{AllyHexes}格内的友军获得{AllyAS:percentMinusOne}攻速。",
    "DA_ZZRotPortal": "召唤一只大型虚空生物。它的强度随阶段提升。",
    "DA_Artifact_AegisOfDawn": "每{AOEFrequency}秒从1格内的敌人处偷取{ArmorSteal}护甲，并按自身护甲治疗，治疗量随阶段提升。同时携带黄昏圣盾时，每{DuskBonusFrequency}秒触发。",
    "DA_Artifact_BlightingJewel": "造成魔法伤害时使目标降低{MagicResistShred}魔抗。目标魔抗为0时，携带者改为获得{ManaGain}法力值。持续伤害对每名目标每{DOTCooldown}秒最多触发一次。",
    "DA_Artifact_EternalPact": "每场战斗绑定最大生命值最高的友军。该友军阵亡时，携带者获得{ManaRegenOnDeath}法力回复和{APOnDeath:percent}法术加成。\n\n该友军施放技能时，携带者回复{ManaOnAbilityUse}法力。每{Frequency}秒，携带者为该友军提供相当于自身{ShieldPercentOfAP:percent}法术加成的护盾。",
    "DA_Artifact_LichBane": "每次施放技能后的第一次普攻造成{ProcDamage}额外魔法伤害，伤害随阶段提升。",
    "DA_Artifact_WitsEnd": "普攻造成{OnHitDamage}额外魔法伤害，伤害随阶段提升。携带者按其造成魔法伤害的{MagicVampPercent}%回复生命值。",
    "DA_BloodthirsterRadiant": "每场战斗一次。生命值降至{ThresholdMaxHealthRatio:percent}时，获得相当于{ShieldMaxHealthRatio:percent}最大生命值的护盾，并在此后获得{AdditionalOmnivamp:percent}额外全能吸血，持续到战斗结束。",
    "DA_BlueBuffRadiant": "战斗开始时获得{StartingMana}法力值。",
    "DA_CrownguardRadiant": "战斗开始时获得{MaxHealthShieldPercent}%最大生命值的护盾，持续{ShieldDuration}秒。携带者受到的治疗和护盾效果提高{HealingShieldingMultiplier:percent}。",
    "DA_DeathbladeRadiant": "从所有来源获得的物理加成提高{ADMultiplier:percentMinusOne}。",
    "DA_RabadonsDeathcap_Radiant": "从所有来源获得的法术加成提高{APMultiplier:percentMinusOne}。",
    "DA_TitansResolve_Radiant": "攻击或受到伤害时获得{ADAPPerStack:percent}物理加成和法术加成，最多叠加{MaxStacks}次。叠满后获得{MaxHPFullStacks:percentMinusOne}额外最大生命值并免疫控制。",
}
TOKEN = re.compile(r"<(?:TFTCurveTable|TFTAttribute)\b[^>]*?/>", re.I)
ATTR = re.compile(r'(\w+)="([^"]*)"')


def read(path):
    return json.loads(path.read_text("utf-8"))


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def curve(row, key):
    points = row.get("curveValues", {}).get(key) or row.get("curveTable", {}).get(key)
    if not points:
        raise ValueError((row["apiName"], key))
    return [value for _, value in points]


def format_value(values, mode):
    def show(number):
        if mode == "percent":
            number *= 100
        elif mode == "percentminusone":
            number = (number - 1) * 100
        elif mode == "invertedpercent":
            number = (1 - number) * 100
        return f"{number:.6f}".rstrip("0").rstrip(".") + ("%" if mode else "")
    first, last = min(values), max(values)
    return show(first) if first == last else show(first) + "–" + show(last)


def attributes(tag):
    return {key.lower(): value for key, value in ATTR.findall(tag)}


def render_tag(row, tag):
    props = attributes(tag)
    if "attributeid" in props:
        values = row.get("attributeValues", {}).get(props["attributeid"])
        if not values:
            values = curve(row, props["fallbackrow"])
    else:
        values = curve(row, props["row"])
    return format_value(values, props.get("format", "").lower())


def description(row):
    item_id = row["apiName"]
    if item_id in DESCRIPTIONS:
        template = re.sub(
            r"\{(\w+)(?::(\w+))?\}",
            lambda m: format_value(curve(row, m[1]), (m[2] or "").lower()),
            DESCRIPTIONS[item_id],
        )
    else:
        template = row["desc"].replace("\r", "")
        # Keep mechanical text and omit battle-only counters rendered by the client.
        template = "\n".join(line for line in template.split("\n")
                             if not re.search(r'TFTItemAttributes\.Stack|TFTCalculationAttributes\.HealthCalc1', line))
        template = re.sub(r"\{(?:ItemTags|Augment\.)[^}]+\}", "", template)
        if item_id == "DA_AdaptiveHelm_Radiant":
            template = template.replace('row="ManaMultiplierFromAllSources" format="percentMinusOne"',
                                        'row="ManaMultiplierFromAllSources" format="percent"')
        template = TOKEN.sub(lambda m: render_tag(row, m[0]), template)
    text = unescape(re.sub(r"<[^>]+>", "", template))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if re.search(r"[{}<>]", text) or (text and not re.search(r"[\u3400-\u9fff]", text)):
        raise ValueError((item_id, text))
    return text


def reference(row):
    stats = []
    for m in TOKEN.finditer(row.get("statLine") or ""):
        key = attributes(m[0])["icon"].lower().split(".")[-1]
        value = render_tag(row, m[0])
        stats.append({"label": STAT_NAMES[key], "value": ("" if value.startswith("-") else "+") + value})
    return {
        "name": NAMES.get(row["apiName"], row["name"]),
        "description": description(row),
        "stats": stats,
    }


def emblem_equipment(lookup):
    metadata = lookup["_metadata"]
    if metadata["set"] != "TFTSet19" or metadata["patch"] != "pbe":
        raise ValueError("Use the S19 PBE equipment lookup")
    build = metadata["release"].split(".Set19", 1)[0].removeprefix("rls-")
    emblems = read(DATA / "emblem-stats.json")["emblems"]
    names = read(DATA / "trait-reference.json")
    by_source = {row["apiName"]: row for row in lookup["items"]
                 if row.get("associatedTraits") and row["name"].endswith(" Emblem")}
    if set(by_source) != {entry["sourceId"] for entry in emblems.values()}:
        raise ValueError("The S19 PBE emblem catalogue has changed")
    items = {}
    for trait, entry in emblems.items():
        row = by_source[entry["sourceId"]]
        stats = []
        for token in TOKEN.finditer(row["statLine"]):
            props = attributes(token[0])
            stat = props["row"]
            if any(curve(row, stat)):
                value = render_tag(row, token[0])
                stats.append({"label": EMBLEM_STAT_NAMES[stat], "value": ("" if value.startswith("-") else "+") + value})

        name = names[trait]["emblem"]["name"]
        effect = f"携带者获得【{name.removesuffix('纹章')}】羁绊。"
        if trait in EMBLEM_EFFECTS:
            effect += "\n" + re.sub(
                r"\{(\w+)(?::(\w+))?\}",
                lambda token: format_value(curve(row, token[1]), (token[2] or "").lower()),
                EMBLEM_EFFECTS[trait],
            )
        if "Item.Equippable.Item.Emblem.Elusive" in row["tags"]:
            effect += "\n无法合成。"
        items["emblem-" + trait] = {"name": name, "description": effect, "stats": stats}
    return {"build": build, "sourceUrl": EMBLEM_LOOKUP, "items": items}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("lookup_dir", nargs="?", type=Path)
    parser.add_argument("art_dir", nargs="?", type=Path)
    parser.add_argument("--emblem-lookup", type=Path, help="Only update emblem stats and effects from an English lookup")
    args = parser.parse_args()
    if args.emblem_lookup:
        snapshot = emblem_equipment(read(args.emblem_lookup))
        write(DATA / "emblem-equipment.json", snapshot)
        print(snapshot["build"], len(snapshot["items"]), "emblem references")
        return
    if not args.lookup_dir or not args.art_dir:
        parser.error("lookup_dir and art_dir are required for a full equipment import")
    from PIL import Image

    cn = read(args.lookup_dir / "lookup-zh_cn.json")
    en = read(args.lookup_dir / "lookup-en_us.json")
    release = cn["_metadata"]["release"]
    if cn["_metadata"]["set"] != "TFTSet19" or release != en["_metadata"]["release"]:
        raise ValueError("Lookups must use the same S19 PBE build")
    build = release.split(".Set19")[0].removeprefix("rls-")
    base = read(DATA / "item-reference.json")
    if base["build"] != build:
        raise ValueError("Refresh the ordinary item reference for this build first")

    legacy = {row["pbeId"]: item_id for item_id, row in base["items"].items()}
    emblems = {row["sourceId"]: "emblem-" + trait for trait, row in read(DATA / "emblem-stats.json")["emblems"].items()}
    english = {row["apiName"]: row for row in en["items"]}
    items, recipes, images = [], {}, []
    for row in cn["items"]:
        item_id = row["apiName"]
        tags = row["tags"]
        category = next((label for tag, label in CATEGORIES.items() if "Item.Equippable.Item." + tag in tags), None)
        if category and "Item.Equippable.Consumable" not in tags:
            with Image.open(args.art_dir / (item_id + ".png")) as image:
                image.load()
                images.append((item_id, image.convert("RGBA")))
            items.append({"id": item_id, "category": category,
                          "image": f"/assets/items/{item_id}.webp", **reference(row)})
        parts = row["composition"]
        if not any(part in ("DA_Component_Spatula", "DA_Component_FryingPan") for part in parts):
            continue
        if len(parts) != 2 or Counter(parts) != Counter(english[item_id]["composition"]):
            raise ValueError((item_id, parts))
        mapped = [legacy[part] for part in parts]
        if item_id in emblems:
            if "Item.Equippable.Item.Craftable" not in tags:
                raise ValueError((item_id, tags))
            recipes[emblems[item_id]] = {**reference(row), "components": mapped, "sourceUrl": LOOKUP}
        elif Counter(mapped) != Counter(base["items"][legacy[item_id]]["components"]):
            raise ValueError((item_id, mapped))

    pairs = [tuple(sorted(recipe["components"])) for recipe in recipes.values()]
    if len(pairs) != len(set(pairs)) or any(not item["name"] for item in items):
        raise ValueError("Invalid equipment catalogue")
    if set(item["id"] for item in items) != set(read(DATA / "special-item-wearers.json")["items"]):
        raise ValueError("Refresh the usage snapshot for these items")
    for item_id, image in images:
        image.thumbnail((96, 96), Image.Resampling.LANCZOS)
        image.save(ROOT / "public" / "assets" / "items" / (item_id + ".webp"), "WEBP", quality=90)
    art_path = DATA / "item-art.json"
    old_art = read(art_path)
    write(art_path, list(dict.fromkeys([*old_art, *(item_id for item_id, _ in images)])))
    write(DATA / "special-equipment.json", {"build": build, "sourceUrl": LOOKUP, "items": items, "recipes": recipes})
    print(Counter(item["category"] for item in items), len(recipes), "emblem recipes")


if __name__ == "__main__":
    main()
