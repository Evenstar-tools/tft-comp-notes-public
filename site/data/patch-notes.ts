import type { PatchReference } from "../domain/patch-reference";

// Numbers cover the star level or breakpoint named in each row.
export const patchReferences: PatchReference[] = [
  {
    id: "pbe-6035832",
    edition: "s19-pbe",
    title: "感恩节前 PBE 更新",
    date: "2026-11-25",
    dateLabel: "PBE1 实装 · UTC",
    build: "19.1.0.6035832",
    source: { name: "设计师公告", url: "https://bsky.app/profile/truexy-bot.bsky.social/post/3n35nkji6lr2w" },
    highlights: [
      "PBE1 于北京时间 11 月 26 日 04:56 实装。7 费解锁门槛上调：史密奇需要 9 个非唯一羁绊，娑娜需要 20 次灵感，男爵乐器更难刷到。",
      "烬的小提琴和泽丽的激光伤害下调。摇滚恶魔的偶像重击和治疗、离子火花每封信的攻速，以及青龙刀和狂徒加强。",
      "男枪、铁男和狗头有了独立小队规划器代码。修复莎弥拉伤害偏低、国风终章输给真实伤害棱彩 A 面、塔里克与奎桑提护盾异常，以及金蛋在野怪回合未正确增加 2 层的问题。",
    ],
    observation: "6035832 对局已入库。MetaTFT 大盘当前仍以 19.1c 近三天滚动样本为主，窗口覆盖实装前后的多个构建。阵容表现可结合新构建的短窗核心样本观察。",
    groups: {
      "解锁": [
        { name: "史密奇", unit: "smeech", guides: ["sample-block-0275", "sample-block-0051", "sample-block-1110"], values: [["同时激活的非唯一羁绊", "8 个", "9 个"]] },
        { name: "娑娜", unit: "sona", values: [["合奏弈子在玩家对战中获得灵感", "15 次", "20 次"]] },
        { name: "纳什男爵", unit: "baron-nashor", aliases: ["大龙"], guides: ["sample-block-0229"], values: [["商店男爵乐器", "原掉率", "略微降低出现概率"]] },
      ],
      "弈子": [
        { name: "莉莉娅", unit: "lillia", guides: ["sample-block-0464"], values: [["治疗法强系数（1／2／3／4 星）", "280／350／550／750", "305／375／575／775"]] },
        { name: "安妮", unit: "annie", guides: ["sample-block-0307"], values: [["护盾法强系数（1／2／3／4 星）", "350／400／550／725", "325／375／525／700"]] },
        { name: "俄洛伊", unit: "illaoi", values: [["治疗法强系数（1／2／3／4 星）", "275／325／525／850", "300／350／550／900"]] },
        { name: "古拉加斯", unit: "gragas", aliases: ["酒桶"], guides: ["sample-block-0464"], values: [
          ["每名三星 K/DA 友军的额外技能效果", "15%", "12%"], ["每秒治疗法强系数（1／2／3／4 星）", "56／61／68／77", "60／66／74／85"],
        ] },
        { name: "卢锡安", unit: "lucian", values: [["每发子弹攻击力系数（1／2／3／4 星）", "85%／130%／200%／340%", "90%／135%／205%／350%"]] },
        { name: "莎弥拉", unit: "samira", guides: ["sample-block-0051"], values: [
          ["每发子弹攻击力系数（1／2／3／4 星）", "38%／57%／86%／146%", "31%／47%／70%／119%"],
          ["实际伤害", "受异常影响偏低", "修复后净加强"],
        ] },
        { name: "萨勒芬妮", unit: "seraphine", aliases: ["芬妮"], guides: ["sample-block-0420", "sample-block-0367"], values: [["生成弈子", "原概率", "降低生成高价值弈子的概率"]] },
        { name: "巴德", unit: "bard", values: [["木灵伤害法强系数（1／2／3 星）", "245／365／590", "265／400／650"]] },
        { name: "贝蕾亚", unit: "briar", values: [["治疗法强系数（1／2／3 星）", "100／150／200", "80／120／160"], ["护甲／魔抗", "各 50", "各 45"]] },
        { name: "德莱文", unit: "draven", aliases: ["德子"], guides: ["sample-block-0407", "sample-block-1020"], values: [["漩涡每秒伤害的攻击力系数（1／2／3 星）", "115%／175%／275%", "125%／190%／300%"]] },
        { name: "赛娜", unit: "senna", values: [["技能攻击力系数（1／2／3 星）", "175%／265%／420%", "175%／265%／450%"]] },
        { name: "辛德拉", unit: "syndra", values: [["主目标伤害法强系数（1／2／3 星）", "330／495／790", "350／525／850"]] },
        { name: "佛耶戈", unit: "viego", guides: ["sample-block-0243"], values: [["每把剑的攻击力系数（1／2／3 星）", "28%／42%／67%", "26%／40%／63%"]] },
        { name: "盖伦", unit: "garen", values: [["治疗法强系数（1／2 星）", "300／350", "350／400"]] },
        { name: "烬", unit: "jhin", guides: ["sample-block-0051"], values: [["小提琴攻击力系数（1／2 星）", "27%／41%", "25%／38%"]] },
        { name: "洛克", unit: "locke", aliases: ["Locke"], values: [["普攻附加伤害法强系数（1／2 星）", "45／68", "50／75"]] },
        { name: "梅尔", unit: "mel", values: [["基础攻速", "0.75", "0.80"], ["主目标导弹比例", "60%", "70%"]] },
        { name: "永恩", unit: "yone", guides: ["sample-block-0411"], values: [
          ["普攻伤害系数（攻击力和法强取较高者，1／2 星）", "55／82", "58／87"],
          ["每次挥击伤害系数（攻击力和法强取较高者，1／2 星）", "38／57", "40／60"],
        ] },
        { name: "阿卡丽 · 真实伤害", unit: "akali-true-damage", values: [["炸弹范围伤害法强系数（1／2 星）", "620／930", "560／875"]] },
        { name: "厄斐琉斯", unit: "aphelios", values: [["技能攻击力系数（1／2 星）", "280%／420%", "315%／475%"]] },
        { name: "纳什男爵", unit: "baron-nashor", aliases: ["大龙"], guides: ["sample-block-0229"], values: [["召唤物每击攻击力系数（1／2 星）", "33%／50%", "35%／55%"]] },
        { name: "迦娜", unit: "janna", aliases: ["风女"], guides: ["sample-block-0214"], values: [["天风伤害法强系数（1／2 星）", "1800／2700", "1950／3000"]] },
        { name: "奈德丽", unit: "nidalee", aliases: ["豹女"], values: [["美洲狮形态每次猛扑的法强系数（1／2 星）", "125／185", "140／210"]] },
        { name: "派克", unit: "pyke", guides: ["sample-block-0452"], values: [["基础攻速", "0.9", "0.85"]] },
        { name: "娑娜", unit: "sona", values: [["主动伤害法强系数（1／2 星）", "1500／2400", "1650／2600"], ["主动护盾法强系数（1／2 星）", "250／450", "250／500"]] },
        { name: "崔斯特", unit: "twisted-fate", aliases: ["卡牌"], values: [["主目标伤害法强系数（1／2 星）", "100／150", "110／165"]] },
        { name: "弗拉基米尔", unit: "vladimir", aliases: ["吸血鬼"], values: [["客户端推荐装备", "莫雷洛秘典", "正义之手"]] },
        { name: "泽丽", unit: "zeri", guides: ["sample-block-0235"], values: [["每道激光的攻击力系数（1／2 星）", "135%／200%", "125%／190%"]] },
      ],
      "羁绊": [
        { name: "海之歌", aliases: ["Beach Pop"], guides: ["sample-block-0251"], values: [["5 海之歌攻速", "40%", "45%"], ["7 海之歌海风回蓝", "40", "30"]] },
        { name: "K/DA", guides: ["sample-block-0006", "sample-block-0464"], values: [["13 星晕眩", "1 秒", "0.8 秒"]] },
        { name: "离子火花", aliases: ["Ionic Spark"], guides: ["sample-block-0307"], values: [["每封信提供攻速", "7%", "8%"], ["棱彩波次伤害", "原伤害", "降低"]] },
        { name: "国风", aliases: ["Gu Feng"], guides: ["sample-block-0214"], values: [["灵兽画卷 10 级每胜经验", "250", "200"], ["灵兽画卷基础每胜经验", "6", "4"]] },
        { name: "摇滚恶魔", aliases: ["摇滚", "Rock"], guides: ["sample-block-0338"], values: [
          ["地狱偶像起始／最大法力（5／7 摇滚）", "30／90", "30／80"],
          ["地狱偶像重击伤害的攻击力系数（5／7 摇滚）", "90%／135%", "110%／175%"],
          ["地狱偶像重击治疗的法强系数（5／7 摇滚）", "75／100", "85／120"],
        ] },
        { name: "真实伤害", aliases: ["True Damage"], values: [
          ["双人模式 5 真伤治疗／经验", "2／2", "0／3"],
          ["棱彩任务遇到错误胜负", "中断有效重叠进度", "最多保留 1 次有效重叠进度"],
        ] },
        { name: "心之钢", aliases: ["Heartsteel"], values: [
          ["棱彩任务物理伤害", "220,000", "200,000"], ["棱彩任务魔法伤害", "110,000", "100,000"], ["棱彩任务减免伤害", "160,000", "150,000"],
        ] },
        { name: "五杀乐队", aliases: ["Pentakill"], guides: ["sample-block-0219"], values: [["棱彩任务：光明使者击杀", "65", "55"]] },
      ],
      "装备": [
        { name: "朔极之矛", aliases: ["青龙刀", "Spear of Shojin"], values: [["物理加成／法术加成", "各 15%", "各 18%"]] },
        { name: "光明版朔极之矛", aliases: ["希拉娜之矛", "光明朔极之矛", "光明青龙刀"], values: [["物理加成／法术加成", "各 30%", "各 35%"]] },
        { name: "冕卫", aliases: ["Crownguard"], values: [["生命值", "100", "150"], ["额外治疗和护盾效果", "25%", "20%"]] },
        { name: "狂徒铠甲", aliases: ["狂徒", "Warmog's Armor"], values: [["生命值", "500", "550"]] },
        { name: "光明版狂徒铠甲", aliases: ["狂徒之傲", "光明狂徒铠甲", "光明狂徒"], values: [["生命值", "1200", "1300"]] },
      ],
      "海克斯": [
        { name: "大百宝袋", aliases: ["Big Grab Bag"], values: [["可选状态", "停用", "重新启用"]] },
        { name: "珠光莲花", aliases: ["珠光莲花 I", "Jeweled Lotus"], values: [["可选状态", "停用", "重新启用"]] },
        { name: "珠光莲花 II", aliases: ["Jeweled Lotus II"], values: [["可选状态", "停用", "重新启用"]] },
        { name: "潘朵拉的装备 II", aliases: ["Pandora's Items II"], values: [["2-1 可选状态", "停用", "重新启用"]] },
        { name: "潘朵拉的装备 II++", aliases: ["Pandora's Items II++"], values: [["4-2 可选状态", "停用", "重新启用"]] },
        { name: "作弊码", aliases: ["Cheat Code"], values: [["第 2／3／4 阶段金币价值", "原价值", "降低"], ["未完成当前指令时", "中断有效重叠进度", "保留有效重叠进度"]] },
        { name: "电火花 II", aliases: ["Electrocharge II"], values: [["伤害", "65–120", "55–110，并修复伤害异常"]] },
        { name: "各绽异彩，光芒万丈", aliases: ["永燃更亮", "Forever Burning Brighter"], values: [["每档所需礼物", "30", "50"]] },
        { name: "丶掷骰犭王人灬", aliases: ["High Rolling"], values: [["击杀掉落", "原概率", "提高"]] },
        { name: "三相庇护", aliases: ["无尽护盾", "Infinity Protection"], values: [["金币", "3", "5"], ["护盾", "12%", "15%"]] },
        { name: "稀有珍藏", aliases: ["稀有收藏", "Rare Collection"], values: [["每解锁一名弈子获得的生命值", "50", "40"]] },
        { name: "叫嚣着狂乱的极致", aliases: ["Running Wild"], values: [["生命值", "100", "30"]] },
        { name: "我欲成仙", aliases: ["The Immortal Journey"], values: [["金币", "6", "10"]] },
        { name: "羁绊天梯", aliases: ["羁绊阶梯", "Trait Ladder"], values: [["9／13 个羁绊的奖励", "原奖励", "降低"]] },
        { name: "赶海", aliases: ["发掘宝藏", "Unearthed Treasure"], values: [["掉落", "原概率", "提高"]] },
        { name: "水乳交融", aliases: ["团结一心", "We Stick Together"], values: [["可提供的羁绊", "含主唱、主宰、护卫", "移除主唱、主宰、护卫"]] },
      ],
      "奇遇": [
        { name: "超级巨星", aliases: ["巨星", "Superstar"], values: [["复制初始弈子的间隔", "2 场战斗", "2 场玩家战斗"]] },
      ],
    },
  },
  {
    id: "pbe-6028987",
    edition: "s19-pbe",
    title: "PBE 19.1c 环境观察",
    date: "2026-11-24",
    dateLabel: "PBE1 实装 · UTC",
    build: "19.1.0.6028987",
    source: { name: "设计师公告", url: "https://x.com/TheTruexy/status/2125291417765572776" },
    highlights: [
      "PBE1 于北京时间 11 月 25 日 07:36 实装构建 6028987。锤石沉醉解锁缩短至 250 秒，但治疗量下调。",
      "伊泽瑞尔技能和男枪每发子弹的攻击特效下调，烈娜塔强化沉醉缩短，玛尔扎哈最大法力提高。",
      "高能流行高档奖励下移至 2,400–3,750 热度。3,750 热度发放原 6,200 档奖励，5,500 和 6,200 档取消。",
    ],
    observation: "首批战绩中，五摇滚薇恩 876 场、均名 4.00，七海之歌扎克男枪 825 场、4.04，七离子金克丝 2,253 场、4.19。四安可伊泽瑞尔均名 4.65，双电子泽丽 4.88。八级先看主 C 和主坦能不能两星，再决定是否升九。",
    groups: {
      "解锁": [
        { name: "锤石", unit: "thresh", values: [["敌人累计沉醉时间", "275 秒", "250 秒"]] },
      ],
      "弈子": [
        { name: "伊泽瑞尔", unit: "ezreal", values: [["技能攻击力系数（1／2／3 星）", "210%／315%／475%", "190%／285%／440%"]] },
        { name: "烈娜塔·戈拉斯克", unit: "renata-glasc", values: [["对低星敌人的沉醉时长", "9 秒", "6 秒"]] },
        { name: "玛尔扎哈", unit: "malzahar", values: [["起始／最大法力", "0／50", "0／55"]] },
        { name: "格雷福斯", unit: "graves", values: [["每发子弹的攻击特效效率", "80%", "60%"]] },
        { name: "锤石", unit: "thresh", values: [["治疗法强系数（1／2 星）", "350%／450%", "300%／400%"]] },
      ],
      "羁绊": [
        { name: "高能流行", values: [
          ["奖励所需热度", "2,500／2,900／3,350／4,100／4,800", "2,400／2,650／2,900／3,300／3,750"],
          ["600 热度奖励", "微型英雄复制器", "次级英雄复制器"],
          ["最终奖励", "6,200 热度", "3,750 热度"],
        ] },
      ],
    },
  },
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
    observationStats: [
      { name: "四古典烬", games: 1888, mean: 4.03 },
      { name: "七离子金克丝", games: 3183, mean: 4.10 },
      { name: "薇恩＋约里克", games: 1132, mean: 4.14 },
      { name: "薇恩＋斯维因", games: 1495, mean: 4.57 },
      { name: "双电子泽丽", games: 3906, mean: 4.94 },
    ],
    observation: "七级先确认能解锁薇恩，按先来的前排选路线。女枪虽有加强，同一张九级棋盘互换三件装备的样本还少。",
    groups: {
      "解锁": [
        { name: "薇恩", unit: "vayne", aliases: ["VN"], guides: ["sample-block-0338", "sample-block-0407"],
          values: [["七级及以上", "激活摇滚恶魔出战 3 回合", "摇滚恶魔或花式射手的不同名弈子合计 5 星"]] },
        { name: "莫德凯撒", unit: "mordekaiser", aliases: ["铁男"], guides: ["sample-block-0219"],
          values: [["五杀乐队不同名弈子星级总和", "10 星", "9 星"]] },
      ],
      "弈子": [
        { name: "薇恩", unit: "vayne", aliases: ["VN"], guides: ["sample-block-0338", "sample-block-0407"],
          values: [["技能攻击力系数（1／2／3 星）", "165%／250%／2000%", "175%／265%／2400%"]] },
        { name: "厄运小姐", unit: "miss-fortune", aliases: ["女枪", "MF"], guides: ["sample-block-0051"],
          values: [["技能攻击力系数（1／2 星）", "140%／210%", "150%／225%"]] },
        { name: "泽丽", unit: "zeri", guides: ["sample-block-0235"],
          values: [["激光攻击力系数（1／2 星）", "145%／215%", "135%／200%"]] },
        { name: "格雷福斯", unit: "graves", aliases: ["男枪"], guides: ["sample-block-0251", "sample-block-0452"],
          values: [["技能攻击力系数（1／2 星）", "40%／60%", "42%／63%"]] },
        { name: "凯尔", unit: "kayle", aliases: ["天使"], guides: ["sample-block-0219"],
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
          guides: ["sample-block-0051"],
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
          guides: ["sample-block-0051"],
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
          guides: ["sample-block-0051"],
          values: [
            ["小技能伤害（1／2 星）","100／150","120／180"],
          ],
        },
      ],
      "羁绊": [
        {
          name: "古典乐",
          aliases: ["古典","Classical"],
          guides: ["sample-block-0051"],
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
          guides: ["sample-block-0051"],
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
