import type { PatchReference } from "../domain/patch-reference";

// Numbers cover the star level or breakpoint named in each row.
export const patchReferences: PatchReference[] = [
  {
    id: "pbe-6018196",
    edition: "s19-pbe",
    title: "PBE 11/23 更新 · 薇恩和铁男解锁",
    date: "2026-11-23",
    dateLabel: "PBE1 实装 · UTC",
    build: "19.1.0.6018196",
    source: { name: "设计师公告", url: "https://x.com/TheTruexy/status/2124948130936541578" },
    highlights: [
      "七级找薇恩，改看摇滚恶魔或花式射手的不同名弈子星级，合计需要 5 星。五杀乐队解锁铁男从 10 星降到 9 星。",
      "古典女枪、海之歌男枪和五杀天使的技能加强，泽丽的激光伤害降低。五摇滚伤害不变，七摇滚才吃到这次加强。",
      "烈娜塔配狗头时，二星、三星狗头的自疗和群疗都比上版低。高能流行在 200 热度换了奖励，K/DA 的 15 星伤害也下调。",
    ],
    observation: "七级搜薇恩前先数场上不同名弈子的星级；五杀天使过渡时，凑到 9 星就可以找铁男。公告还列出了周末已实装的男枪双倍伤害修复、真伤阿卡丽 320 珠光解锁、真伤 B 面珠光调整和「数星星」停用。",
    groups: {
      "解锁": [
        { name: "薇恩", unit: "vayne", aliases: ["VN"], guides: ["sample-block-0338", "sample-block-0407"],
          values: [["七级及以上", "激活摇滚恶魔出战 3 回合", "摇滚恶魔或花式射手的不同名弈子合计 5 星"]] },
        { name: "莫德凯撒", unit: "mordekaiser", aliases: ["铁男"], guides: ["sample-block-0219"],
          values: [["五杀乐队不同名弈子星级总和", "10 星", "9 星"]] },
      ],
      "弈子": [
        { name: "薇恩", unit: "vayne", aliases: ["VN"], guides: ["sample-block-0338", "sample-block-0407"],
          values: [["技能攻击力系数（1／2／3 星）", "165%／250%／2000%", "175%／265%／2400%"]] },
        { name: "厄运小姐", unit: "miss-fortune", aliases: ["女枪", "MF"], guides: ["sample-block-0394", "sample-block-0154"],
          values: [["技能攻击力系数（1／2 星）", "140%／210%", "150%／225%"]] },
        { name: "泽丽", unit: "zeri", guides: ["sample-block-0235", "sample-block-0154"],
          values: [["激光攻击力系数（1／2 星）", "145%／215%", "135%／200%"]] },
        { name: "格雷福斯", unit: "graves", aliases: ["男枪"], guides: ["sample-block-0251", "sample-block-0452"],
          values: [["技能攻击力系数（1／2 星）", "40%／60%", "42%／63%"]] },
        { name: "凯尔", unit: "kayle", aliases: ["天使"], guides: ["sample-block-0219", "sample-block-0468"],
          values: [["剑刃伤害（1／2／3 星）", "37／55／400", "42／63／480"]] },
        { name: "内瑟斯", unit: "nasus", aliases: ["狗头", "烈娜塔"], guides: ["sample-block-0122"],
          values: [["自身每秒治疗（2／3 星）", "150／250", "130／225"], ["友军每秒治疗（2／3 星）", "35／60", "30／50"]] },
        { name: "萨勒芬妮", unit: "seraphine", aliases: ["芬妮"], guides: ["sample-block-0420", "sample-block-0367"],
          values: [["明日新星的额外音符", "8 个", "6 个"]] },
      ],
      "羁绊": [
        { name: "摇滚恶魔", aliases: ["摇滚", "Rock"], guides: ["sample-block-0338"],
          values: [["技能伤害（5／7 摇滚）", "450／600", "450／650"]] },
        { name: "高能流行", aliases: ["Hyperpop"], guides: ["sample-block-0420"],
          values: [["200 热度奖励", "1 个次级英雄复制器", "1 个微型英雄复制器＋1 金币"]] },
        { name: "K/DA", guides: ["sample-block-0764", "sample-block-0464", "sample-block-0006"],
          values: [["15 星的目标生命值伤害", "12%", "10%"]] },
      ],
      "海克斯": [
        { name: "棱彩巡演：五杀乐队+", aliases: ["Pentakill Prismatic Tour+"], guides: ["sample-block-0219"],
          values: [["赠送的奥拉夫", "二星", "一星"]] },
        { name: "棱彩巡演：K/DA+", aliases: ["K/DA Prismatic Tour+"], guides: ["sample-block-0764"],
          values: [["次级／微型英雄复制器", "各 2 个", "各 1 个"]] },
      ],
      "装备": [
        { name: "K/DA纹章", aliases: ["K/DA Emblem"], guides: ["sample-block-0367"],
          values: [["生命值", "150", "100"], ["攻击力／法术强度", "各 15%", "各 10%"]] },
      ],
    },
  },
  {
    id: "pbe-6014015",
    edition: "s19-pbe",
    title: "PBE 19.1a 真实伤害热补",
    date: "2026-11-22",
    dateLabel: "PBE1 实装 · UTC",
    build: "19.1.0.6014015",
    source: { name: "设计师公告", url: "https://x.com/TheTruexy/status/2124320104158752970" },
    highlights: ["真实伤害阿卡丽降到 320 珠光贵气。B 面落败给 20 基础珠光，获胜只扣已有珠光的 20%。", "金色强化「数星星」已从本构建图鉴移除。"],
    observation: "真伤 B 面断败的损失降低，前排能稳血就继续上质量。九级再考虑用真伤阿卡丽提高上限。",
    groups: {
      "解锁": [{ name: "阿卡丽 · 真实伤害", unit: "akali-true-damage", values: [["解锁珠光贵气", "350", "320"]] }],
      "羁绊": [{ name: "真实伤害", values: [["B 面落败基础珠光贵气", "14", "20"], ["B 面每层连败额外珠光贵气", "6", "4"], ["B 面获胜扣除比例", "50%", "20%"]] }],
    },
  },
  {
    id: "pbe-19-1a",
    edition: "s19-pbe",
    title: "PBE 19.1a 环境观察",
    date: "2026-11-22",
    dateLabel: "首批对局 · UTC",
    build: "19.1.0.6013636",
    source: { name: "对局样本", url: "https://matches3.metatft.com/PBE1_4536437974.json" },
    highlights: [],
    groups: {},
  },
  {
    id: "pbe-day-2",
    edition: "s19-pbe",
    title: "PBE 次日更新",
    date: "2026-11-20",
    dateLabel: "公告 · 北京时间",
    build: "19.1.0.5995286",
    source: {"name":"设计师公告","url":"https://x.com/TheTruexy/status/2123482553810113002"},
    highlights: ["四古典增伤 18% → 20%，烬的技能加强，锤石少攒 25 秒沉醉。","高能流行、天才和高星 K/DA 削弱，三星芬妮的巨星高音从 135 降到 100。","开风女要让霞在场累计吃 25 金利息。"],
    observation: "次日预判：物理装开局，莎弥拉能带无尽攒沉醉就走四古典烬，4-2 上八找烬、锤石。德莱文、布隆来得多，七级一起追三。",
    groups: {
      "弈子": [
        {
          name: "烬",
          unit: "jhin",
          guides: ["sample-block-0051"],
          values: [
            ["小提琴攻击力系数（1／2 星）","25%／38%","27%／41%"],
          ],
        },
        {
          name: "德莱文",
          unit: "draven",
          aliases: ["德子"],
          guides: ["sample-block-0407"],
          values: [
            ["三星飞斧攻击力系数","340%","370%"],
            ["三星漩涡攻击力系数","250%","275%"],
          ],
        },
        {
          name: "萨勒芬妮",
          unit: "seraphine",
          aliases: ["芬妮"],
          guides: ["sample-block-0420","sample-block-0367"],
          values: [
            ["三星主技能伤害","1280","1240"],
            ["三星超级巨星高音伤害","135","100"],
          ],
        },
        {
          name: "玛尔扎哈",
          unit: "malzahar",
          aliases: ["蚂蚱"],
          guides: ["sample-block-0229"],
          values: [
            ["主目标伤害（1／2／3 星）","355／530／850","325／485／815"],
          ],
        },
        {
          name: "霞",
          unit: "xayah",
          guides: ["sample-block-0214"],
          values: [
            ["每根羽毛攻击力系数（1／2 星）","20%／30%","22%／33%"],
          ],
        },
        {
          name: "薇恩",
          unit: "vayne",
          aliases: ["VN","维恩"],
          guides: ["sample-block-0407"],
          values: [
            ["强化普攻攻击力系数（1／2 星）","175%／265%","165%／250%"],
            ["附带目标最大生命值伤害（1／2 星）","2%／3% 物理","1.5%／2.5% 真实"],
          ],
        },
        {
          name: "莎弥拉",
          unit: "samira",
          aliases: ["莎米拉","沙弥拉"],
          guides: ["sample-block-0051","sample-block-0394"],
          values: [
            ["三星攻击力系数","80%","86%"],
            ["法力值","0／60","0／55"],
          ],
        },
        {
          name: "艾希",
          unit: "ashe",
          aliases: ["寒冰"],
          guides: ["sample-block-0327","sample-block-0171"],
          values: [
            ["三星技能攻击力系数","75%","80%"],
          ],
        },
        {
          name: "伊泽瑞尔",
          unit: "ezreal",
          aliases: ["EZ"],
          guides: ["sample-block-0258"],
          values: [
            ["三星技能攻击力系数","430%","475%"],
          ],
        },
        {
          name: "阿木木",
          unit: "amumu",
          aliases: ["木木"],
          values: [
            ["两星技能治疗","625","575"],
          ],
        },
        {
          name: "赛娜",
          unit: "senna",
          values: [
            ["两星技能攻击力系数","210%","240%"],
          ],
        },
        {
          name: "辛德拉",
          unit: "syndra",
          aliases: ["球女"],
          guides: ["sample-block-0122"],
          values: [
            ["两星主目标伤害","450","495"],
          ],
        },
        {
          name: "提伯斯",
          unit: "tibbers",
          aliases: ["安妮熊"],
          guides: ["sample-block-0307","sample-block-0466"],
          values: [
            ["两星护盾","600","650"],
          ],
        },
        {
          name: "洛克",
          unit: "locke",
          values: [
            ["每枚钉子的额外伤害","10%","15%"],
            ["两星位移伤害","225","205"],
          ],
        },
        {
          name: "希瓦娜",
          unit: "shyvana",
          aliases: ["龙女"],
          guides: ["sample-block-0307"],
          values: [
            ["两星技能伤害","225","150"],
          ],
        },
        {
          name: "悠米",
          unit: "yuumi",
          aliases: ["猫咪"],
          guides: ["sample-block-0407"],
          values: [
            ["攻速","0.75","0.8"],
            ["两星技能伤害","265","280"],
          ],
        },
        {
          name: "厄运小姐",
          unit: "miss-fortune",
          aliases: ["女枪","MF"],
          guides: ["sample-block-0394","sample-block-0154"],
          values: [
            ["技能攻击力系数（1／2 星）","130%／200%","140%／210%"],
          ],
        },
        {
          name: "奈德丽",
          unit: "nidalee",
          aliases: ["豹女"],
          values: [
            ["两星豹形态伤害","200","185"],
            ["两星人形态伤害","570","540"],
          ],
        },
        {
          name: "努努和威朗普",
          unit: "nunu-willump",
          aliases: ["努努"],
          values: [
            ["迪斯科每秒治疗","1%","0.8%"],
          ],
        },
        {
          name: "派克",
          unit: "pyke",
          values: [
            ["主动技能攻击力系数（1／2 星）","300%／470%","320%／515%"],
            ["被动施法中目标死亡","主伤害可改向","主伤害不再改向"],
          ],
        },
        {
          name: "芮尔",
          unit: "rell",
          aliases: ["瑞尔"],
          values: [
            ["骑乘范围分摊伤害倍数","1.5 倍","1.8 倍"],
            ["节拍大师普攻双抗系数（1／2 星）","50%／70%","70%／105%"],
          ],
        },
        {
          name: "塔莉垭",
          unit: "taliyah",
          aliases: ["岩雀"],
          values: [
            ["小技能伤害（1／2 星）","185／280","200／300"],
          ],
        },
        {
          name: "弗拉基米尔",
          unit: "vladimir",
          aliases: ["吸血鬼"],
          guides: ["sample-block-0051","sample-block-0394"],
          values: [
            ["小技能伤害（1／2 星）","100／150","120／180"],
          ],
        },
      ],
      "羁绊": [
        {
          name: "古典乐",
          aliases: ["古典","Classical"],
          guides: ["sample-block-0051","sample-block-0394"],
          values: [
            ["4 古典增伤","18%","20%"],
            ["6 古典增伤","33%","35%"],
          ],
        },
        {
          name: "高能流行",
          aliases: ["Hyperpop","超流行"],
          guides: ["sample-block-0420"],
          values: [
            ["3／4／5 档生命值","200／300／500","175／250／400"],
          ],
        },
        {
          name: "天才",
          aliases: ["Prodigy"],
          guides: ["sample-block-0229"],
          values: [
            ["4／5 天才回蓝","6／7","5／6"],
            ["5 天才治疗","12%","10%"],
          ],
        },
        {
          name: "K/DA",
          aliases: ["KDA"],
          guides: ["sample-block-0367","sample-block-0464","sample-block-0020"],
          values: [
            ["13 星全体眩晕","1.25 秒","1 秒"],
            ["15 星最大生命值灼烧","16%","12%"],
          ],
        },
        {
          name: "保镖",
          aliases: ["护卫","Bodyguard"],
          guides: ["sample-block-0122","sample-block-0020"],
          values: [
            ["6 保镖双抗","115","105"],
          ],
        },
        {
          name: "海滩流行",
          aliases: ["海洋","Beach Pop"],
          guides: ["sample-block-0251","sample-block-0327","sample-block-0171"],
          values: [
            ["攻速加成","20%／35%","25%／40%"],
          ],
        },
        {
          name: "主唱",
          aliases: ["Juggernaut"],
          guides: ["sample-block-0281"],
          values: [
            ["6 主唱减伤范围","35%–45%","35%–48%"],
          ],
        },
        {
          name: "真实伤害",
          aliases: ["True Damage","真伤"],
          values: [
            ["A 面每次获胜获得珠光贵气","10／18","15／20"],
          ],
        },
        {
          name: "心之钢",
          aliases: ["Heartsteel"],
          guides: ["sample-block-0214"],
          values: [
            ["棱彩任务 · 物理／魔法伤害","30 万／20 万","25 万／12 万"],
            ["棱彩任务 · 承伤／治疗","30 万／4 万","17.5 万／3.5 万"],
          ],
        },
      ],
      "解锁": [
        {
          name: "锤石",
          unit: "thresh",
          aliases: ["迷醉","古典"],
          guides: ["sample-block-0051","sample-block-0394"],
          values: [
            ["古典乐累计沉醉敌人","300 秒","275 秒"],
          ],
        },
        {
          name: "迦娜",
          unit: "janna",
          aliases: ["风女","国风"],
          guides: ["sample-block-0214"],
          values: [
            ["霞在场时累计利息","20 金币","25 金币"],
          ],
        },
        {
          name: "亚索",
          unit: "yasuo",
          aliases: ["真实伤害","裁决战士"],
          values: [
            ["真实伤害或裁决战士的独特星级总数","7 星","6 星"],
          ],
        },
        {
          name: "阿卡丽 · 真实伤害",
          unit: "akali-true-damage",
          aliases: ["真伤阿卡丽"],
          values: [
            ["未解锁 K/DA 形态时，累计珠光贵气","375","350"],
          ],
        },
      ],
      "海克斯": [
        {
          name: "我又蹦又唱",
          unit: "lillia",
          aliases: ["毒舞莉莉娅","Dancin' n' Prancin'"],
          guides: ["sample-block-0020"],
          values: [
            ["三星每层梦尘伤害","550","480"],
          ],
        },
        {
          name: "齿痕",
          unit: "elise",
          aliases: ["咬痕","蜘蛛","Bite Marks"],
          guides: ["sample-block-0273"],
          values: [
            ["三星技能伤害","550","600"],
          ],
        },
        {
          name: "救生员值班中",
          unit: "renekton",
          aliases: ["鳄鱼","Lifeguard on Duty"],
          guides: ["sample-block-0171"],
          values: [
            ["晒太阳获得攻击力","10%","12%"],
            ["三星拍击伤害","115","135"],
          ],
        },
        {
          name: "狂斧渐强音",
          unit: "olaf",
          aliases: ["远程奥拉夫","Axe Crescendo"],
          guides: ["sample-block-0281"],
          values: [
            ["基础飞斧攻击次数","2 次","3 次"],
            ["三星每斧攻击力系数","360%","335%"],
          ],
        },
        {
          name: "爆梗重拳",
          unit: "sett",
          aliases: ["飞拳瑟提","Punch Line"],
          guides: ["sample-block-0258"],
          values: [
            ["三星技能／击退攻击力系数","625%／205%","695%／240%"],
          ],
        },
        {
          name: "举高点，提伯斯！我看不到舞台",
          unit: "annie",
          aliases: ["骑熊安妮"],
          guides: ["sample-block-0466"],
          values: [
            ["三星安妮技能伤害","410","375"],
          ],
        },
        {
          name: "装备百宝袋",
          aliases: ["Item Grab Bag"],
          values: [
            ["出现回合","可在 3-2 或 4-2 出现","从 3-2 和 4-2 移除"],
          ],
        },
        {
          name: "生涯规划",
          aliases: ["Management Track"],
          values: [
            ["兑现门槛","30 金","40 金"],
          ],
        },
        {
          name: "基克的先驱",
          aliases: ["Zeke's Herald"],
          values: [
            ["出现回合","可在 2-1 出现","2-1 移除"],
            ["攻速加成","30%","33%"],
          ],
        },
        {
          name: "兰顿之兆",
          aliases: ["Randuin's Omen"],
          values: [
            ["出现回合","可在 2-1 出现","2-1 移除"],
            ["双抗","30","33"],
          ],
        },
      ],
      "装备": [
        {
          name: "死亡之刃",
          aliases: ["杀人剑","Deathblade"],
          values: [
            ["攻击力","55%","60%"],
          ],
        },
        {
          name: "灭世者的死亡之帽",
          aliases: ["帽子","大帽","Rabadon"],
          values: [
            ["法术强度","55","60"],
          ],
        },
      ],
      "修复": [
        {
          name: "战斗中的装备解锁",
          aliases: ["金克丝","艾希","莎弥拉","厄斐琉斯"],
          guides: ["sample-block-0307","sample-block-0051","sample-block-0327"],
          values: [
            ["友军阵亡后合成装备","可能漏记解锁","可正常触发"],
          ],
        },
      ],
    },
  },
  {
    id: "pbe-5986652",
    edition: "s19-pbe",
    title: "PBE 开服构建",
    date: "2026-11-19",
    dateLabel: "快照 · 北京时间",
    build: "19.1.0.5986652",
    source: { name: "Riot PBE 构建记录", url: "https://sieve.services.riotcdn.net/api/v1/products/teamfighttactics/version-sets/pbe-global", rolling: true },
    highlights: ["对照 5973071 与 5986652 两版实装数据，三星炸弹、芬妮和蚂蚱的技能系数下调。"],
    groups: {
      "弈子": [
        {
          name: "吉格斯",
          unit: "ziggs",
          aliases: ["炸弹人","炸弹"],
          guides: ["sample-block-0420"],
          values: [
            ["三星首段技能系数","405","355"],
          ],
        },
        {
          name: "萨勒芬妮",
          unit: "seraphine",
          aliases: ["芬妮"],
          guides: ["sample-block-0420","sample-block-0367"],
          values: [
            ["三星主技能系数","1350","1280"],
          ],
        },
        {
          name: "可酷伯",
          unit: "kobuko",
          aliases: ["可酷博","熊"],
          guides: ["sample-block-0420"],
          values: [
            ["每点热力的生命值系数","1","0.85"],
          ],
        },
        {
          name: "提莫",
          unit: "teemo",
          guides: ["sample-block-0420"],
          values: [
            ["两星病毒伤害系数","165","135"],
          ],
        },
        {
          name: "玛尔扎哈",
          unit: "malzahar",
          aliases: ["蚂蚱"],
          guides: ["sample-block-0229"],
          values: [
            ["三星技能系数","960","850"],
          ],
        },
        {
          name: "拉克丝",
          unit: "lux",
          guides: ["sample-block-0229"],
          values: [
            ["三星主目标伤害系数","800","675"],
          ],
        },
        {
          name: "烈娜塔·戈拉斯克",
          unit: "renata-glasc",
          aliases: ["烈娜塔","列娜塔"],
          guides: ["sample-block-0122"],
          values: [
            ["低星目标沉醉时间","6 秒","9 秒"],
            ["同星目标沉醉时间","6 秒","3 秒"],
          ],
        },
      ],
    },
  },
];
