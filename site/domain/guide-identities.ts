/**
 * Centralized public-snapshot ID aliases for S19 guides, legacy Feishu folders,
 * and authored content blocks referenced by business rules.
 *
 * Values intentionally stay identical to the published public-preview alias map
 * so existing URLs, bookmarks, and snapshot imports remain 100% compatible.
 */
export const GUIDE_SECTION_IDS = {
  /** 四古典烬 */
  classicalJhin: "sample-block-0051",
  /** 五杀天使 */
  pentakillKayle: "sample-block-0219",
  /** 四保镖烈娜塔 */
  bodyguardRenata: "sample-block-0122",
  /** 五天才玛尔扎哈 */
  prodigyMalzahar: "sample-block-0229",
  /** 七海洋扎克男枪 */
  oceanGraves: "sample-block-0251",
  /** 四安可伊泽瑞尔 */
  encoreEzreal: "sample-block-0254",
  /** 海洋艾希 */
  oceanAshe: "sample-block-0327",
  /** 五摇滚薇恩 */
  rockVayne: "sample-block-0338",
  /** 高能流行芬妮&炸弹 */
  hyperpopSeraphine: "sample-block-0420",
  /** 非主流派克男枪 */
  altPykeGraves: "sample-block-0452",
  /** 爵士金克丝 */
  jazzJinx: "sample-block-1110",
  /** 探戈爵士卡牌 95 */
  tangoJazzTwistedFate: "sample-block-1180",
  /** 三心之钢三经纪月男 95 */
  heartsteelManagerAphelios: "sample-block-1181",
  threeJazzSmeech: "sample-block-0275",
  jazzPykeAurora: "sample-block-1090",
  /** K/DA妮蔻 */
  kdaNeeko: "sample-block-0464",
  /** K/DA伊芙琳&卡莎 */
  kdaEvelynn: "sample-block-0764",
} as const;

export const AD_GRAVES_BOARD_IDS = [
  "00000000-0000-4000-8000-000000001261",
  "00000000-0000-4000-8000-000000001262",
] as const;

export const LEGACY_FOLDER_IDS = {
  /** 次选成熟阵容 -> 八级运营 */
  levelEight: "sample-block-1067",
  /** 连胜成型阵容 -> 国风九五 */
  guofeng95: "sample-block-1064",
  /** 条件定阵阵容 -> 高能流行与天才慢搜 */
  hyperpopProdigyReroll: "sample-block-1065",
  /** PBE试阵 -> 芸阿娜慢搜 */
  yunaraReroll: "sample-block-1066",
} as const;

export const HYPERPOP_BLOCK_IDS = {
  opening: "sample-block-0101",
  rolling: "sample-block-0365",
  heat: "sample-block-0102",
  transition: "sample-block-0071",
  damage: "sample-block-0418",
  tank: "sample-block-0378",
  teemo: "sample-block-0040",
  jazzWhen: "sample-block-0255",
  jazzItems: "sample-block-0169",
} as const;
