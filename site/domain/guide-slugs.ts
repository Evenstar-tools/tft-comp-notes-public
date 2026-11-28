type GuideSlugs = { slug: string; boards: Record<string, string>; searchAliases?: Record<string, string[]> };

// Public URL names are permanent. Existing section and board IDs remain the data keys.
const guideSlugs: Record<string, GuideSlugs> = {
  "sample-block-1110": { slug: "jazz-jinx", boards: {
    "00000000-0000-4000-8000-000000001251": "lv9-smeech",
    "00000000-0000-4000-8000-000000001252": "lv8",
    "00000000-0000-4000-8000-000000001253": "lv9-rell",
  } },
  "sample-block-1060": { slug: "ocean-ekko-syndra", boards: {
    "00000000-0000-4000-8000-000000001201": "lv8-yuumi",
    "00000000-0000-4000-8000-000000001202": "lv7",
    "00000000-0000-4000-8000-000000001203": "lv9-nidalee",
  } },
  "sample-block-0214": { slug: "guofeng-xayah", boards: {
    "00000000-0000-4000-8000-000000000015": "95-lv10",
    "00000000-0000-4000-8000-000000000037": "95-lv8",
    "00000000-0000-4000-8000-000000000070": "lv9-miss-fortune",
    "00000000-0000-4000-8000-000000000090": "lv9-ionic-jinx",
    "00000000-0000-4000-8000-000000000104": "95-lv9",
    "00000000-0000-4000-8000-000000000112": "lv9-jazz-nunu",
  } },
  "sample-block-0420": { slug: "hyperpop-ziggs", boards: {
    "00000000-0000-4000-8000-000000000042": "lv9-choreo",
    "00000000-0000-4000-8000-000000000066": "lv5",
    "00000000-0000-4000-8000-000000000089": "lv9-4-lead",
    "144cb8a8-4046-4b85-8acc-f6610fa882c1": "lv6-4-lead",
    "f8b6749a-eb90-491d-9ada-35e35aa0a9eb": "lv7-4-lead",
    "00000000-0000-4000-8000-000000000096": "lv6",
    "00000000-0000-4000-8000-000000000098": "lv8-jazz",
  } },
  "sample-block-0229": { slug: "prodigy-baron", searchAliases: { "95-lv9": ["大龙95", "95大龙", "速九大龙"] }, boards: {
    "00000000-0000-4000-8000-000000000005": "lv7-open",
    "00000000-0000-4000-8000-000000000017": "lv7",
    "00000000-0000-4000-8000-000000000071": "lv9-reroll",
    "a56a62e0-a4de-4986-9917-7acfaab6c105": "95-lv8",
    "0dd45d5d-496c-459b-9db2-8e05355bd6c2": "95-lv9",
    "cae04fb7-8a61-4ef2-8e86-b716e0b2fd13": "95-lv10",
  } },
  "sample-block-0764": { slug: "kda-evelynn", boards: {
    "00000000-0000-4000-8000-000000000025": "lv9-akali",
    "00000000-0000-4000-8000-000000000043": "lv7",
    "00000000-0000-4000-8000-000000000057": "lv8-leona",
  } },
  "sample-block-0254": { slug: "encore-ezreal", boards: {
    "00000000-0000-4000-8000-000000000050": "lv8",
    "00000000-0000-4000-8000-000000000052": "lv6",
    "00000000-0000-4000-8000-000000001109": "lv8-illaoi-shyvana",
  } },
  "sample-block-0243": { slug: "mosher-viego", boards: {
    "00000000-0000-4000-8000-000000000041": "lv7-4-mosher",
    "00000000-0000-4000-8000-000000000074": "lv7-6-mosher",
    "00000000-0000-4000-8000-000000000087": "lv8",
    "3356f4a8-25be-44b1-a0bf-702e866cfa63": "lv8-briar",
  } },
  "sample-block-0464": { slug: "kda-neeko", boards: {
    "00000000-0000-4000-8000-000000000039": "lv8-akali",
    "00000000-0000-4000-8000-000000000053": "lv5",
    "00000000-0000-4000-8000-000000000113": "lv7-kaisa",
    "00000000-0000-4000-8000-000000000114": "lv8-ahri",
  } },
  "sample-block-0122": { slug: "bodyguard-renata", boards: {
    "00000000-0000-4000-8000-000000000023": "lv8-edm-jax",
    "00000000-0000-4000-8000-000000000044": "lv8-6-bodyguard",
    "00000000-0000-4000-8000-000000000046": "lv9-6-bodyguard",
    "00000000-0000-4000-8000-000000000048": "lv6",
    "00000000-0000-4000-8000-000000000058": "lv6-seraphine",
    "00000000-0000-4000-8000-000000000084": "lv9-jugg-jax",
    "00000000-0000-4000-8000-000000000099": "lv7-ahri",
    "00000000-0000-4000-8000-000000000118": "lv6-original",
  } },
  "sample-block-0407": { slug: "showoff-draven", boards: {
    "00000000-0000-4000-8000-000000000013": "lv7",
    "00000000-0000-4000-8000-000000000029": "lv8",
  } },
  "choreographer-draven-viego": { slug: "choreographer-draven-viego", searchAliases: { "lv7": ["德莱文佛爷", "佛爷德莱文", "德莱文佛耶戈", "佛耶戈德莱文", "琴吹唯德莱文", "琴吹唯"] }, boards: {
    "00000000-0000-4000-8000-000000001177": "lv7",
  } },
  "sample-block-0327": { slug: "ocean-ashe", boards: {
    "00000000-0000-4000-8000-000000000020": "lv6",
    "00000000-0000-4000-8000-000000000054": "lv6-jazz",
    "00000000-0000-4000-8000-000000000122": "lv8-zac-vi",
  } },
  "sample-block-1090": { slug: "jazz-pyke-aurora", searchAliases: { "lv8": ["牛牛阿萝拉"] }, boards: {
    "00000000-0000-4000-8000-000000001241": "lv8",
    "00000000-0000-4000-8000-000000001242": "lv9-rell",
  } },
  "sample-block-0235": { slug: "edm-zeri", boards: {
    "00000000-0000-4000-8000-000000000003": "95-lv8",
    "00000000-0000-4000-8000-000000000049": "lv9-miss-fortune",
    "00000000-0000-4000-8000-000000000105": "95-lv9",
    "00000000-0000-4000-8000-000000001275": "lv9-jazz",
  } },
  "sample-block-0251": { slug: "ocean-graves", searchAliases: { "4-jugg-graves": ["四主宰男枪"] }, boards: {
    "00000000-0000-4000-8000-000000000030": "lv9-ocean-pyke",
    "00000000-0000-4000-8000-000000000062": "lv7-zac",
    "00000000-0000-4000-8000-000000000075": "lv8-ashe",
    "00000000-0000-4000-8000-000000000076": "lv9-taliyah",
    "00000000-0000-4000-8000-000000000093": "lv9-pyke",
    "00000000-0000-4000-8000-000000000102": "lv9-ionic",
    "00000000-0000-4000-8000-000000000119": "lv8-pentakill-rock",
    "00000000-0000-4000-8000-000000001261": "4-jugg-graves",
    "00000000-0000-4000-8000-000000001262": "lv9-twisted-fate",
  } },
  "sample-block-0275": { slug: "jazz-smeech", boards: {
    "00000000-0000-4000-8000-000000000014": "lv8",
    "00000000-0000-4000-8000-000000000082": "lv9",
  } },
  "sample-block-0367": { slug: "kda-seraphine", boards: {
    "00000000-0000-4000-8000-000000000033": "lv5-early",
    "00000000-0000-4000-8000-000000000055": "lv6",
    "00000000-0000-4000-8000-000000000086": "lv5",
    "00000000-0000-4000-8000-000000000094": "lv7",
    "00000000-0000-4000-8000-000000000115": "lv6-early",
  } },
  "sample-block-0203": { slug: "ionic-yunara", boards: {
    "00000000-0000-4000-8000-000000000016": "lv5",
    "00000000-0000-4000-8000-000000000069": "lv5-no-kobuko",
    "f17f1c69-ba22-4477-9680-8fa09b4b6b66": "lv6-5-ionic",
    "b5bce8cb-2f60-45ac-a99c-35b3e44bfabe": "lv7-shyvana",
    "323e2a9e-0573-4d84-8389-846a29659e7e": "lv8-7-ionic",
  } },
  "sample-block-0020": { slug: "kda-lillia", boards: {
    "00000000-0000-4000-8000-000000000038": "lv8-6-bodyguard",
    "00000000-0000-4000-8000-000000000056": "lv5-4-guardian",
    "00000000-0000-4000-8000-000000000072": "lv5",
    "00000000-0000-4000-8000-000000000091": "lv8",
  } },
  "sample-block-0171": { slug: "lifeguard-renekton", searchAliases: { "lv8-ashe": ["救生员鳄鱼艾希"] }, boards: {
    "00000000-0000-4000-8000-000000000002": "lv8",
    "00000000-0000-4000-8000-000000000032": "lv6-seraphine",
    "00000000-0000-4000-8000-000000000079": "lv6",
    "00000000-0000-4000-8000-000000000100": "lv8-seraphine",
    "d78a44d5-edd8-4481-8efb-35333087cd33": "lv8-ashe",
  } },
  "sample-block-0466": { slug: "rider-annie", boards: {
    "00000000-0000-4000-8000-000000000035": "lv8",
    "00000000-0000-4000-8000-000000000088": "lv6",
  } },
  "sample-block-0273": { slug: "bite-elise", boards: {
    "00000000-0000-4000-8000-000000000073": "lv5",
    "00000000-0000-4000-8000-000000000103": "lv8",
  } },
  "sample-block-0064": { slug: "electric-kennen", boards: {
    "00000000-0000-4000-8000-000000000012": "lv8-6-bodyguard",
    "00000000-0000-4000-8000-000000000040": "lv5",
    "00000000-0000-4000-8000-000000000045": "lv8",
    "00000000-0000-4000-8000-000000000047": "lv5-no-ekko",
    "00000000-0000-4000-8000-000000000081": "lv5-4-guardian",
  } },
  "sample-block-0281": { slug: "ranged-olaf", boards: {
    "00000000-0000-4000-8000-000000000051": "lv5",
    "00000000-0000-4000-8000-000000000097": "lv8",
  } },
  "sample-block-0258": { slug: "haymaker-sett", boards: {
    "00000000-0000-4000-8000-000000000061": "lv8",
    "00000000-0000-4000-8000-000000000063": "lv5",
  } },
  "sample-block-0307": { slug: "ionic-jinx", boards: {
    "00000000-0000-4000-8000-000000000007": "lv8",
    "00000000-0000-4000-8000-000000000031": "lv9",
  } },
  "sample-block-0219": { slug: "pentakill-kayle", searchAliases: {
    "lv8-locke": ["三迅击鼓手三摇滚恶魔洛克", "三迅击洛克", "摇滚洛克", "洛克天使"],
    "lv9-locke": ["洛克补芮尔", "九级洛克"],
  }, boards: {
    "00000000-0000-4000-8000-000000000019": "lv9-swain",
    "00000000-0000-4000-8000-000000000064": "lv8",
    "00000000-0000-4000-8000-000000000106": "lv9-pyke-zeri",
    "00000000-0000-4000-8000-000000000120": "lv8-jugg-zeri",
    "19b143ef-e315-4b8e-8081-31e13a6ec3f0": "lv8-locke",
    "7f18bb65-1662-403f-b1e2-fff9634c755f": "lv9-locke",
  } },
  "sample-block-0051": { slug: "classical-jhin", boards: {
    "00000000-0000-4000-8000-000000000006": "lv8-6-classical",
    "00000000-0000-4000-8000-000000000034": "lv9-miss-fortune",
    "00000000-0000-4000-8000-000000000059": "lv8",
    "00000000-0000-4000-8000-000000000083": "lv9-mf-carry",
    "00000000-0000-4000-8000-000000000905": "lv7",
    "00000000-0000-4000-8000-000000001138": "lv9-smeech",
  } },
  "sample-block-0006": { slug: "kda-ahri", boards: {
    "00000000-0000-4000-8000-000000000067": "lv8-ekko",
  } },
  "sample-block-0338": { slug: "rock-vayne", boards: {
    "00000000-0000-4000-8000-000000000068": "lv10-nunu",
    "00000000-0000-4000-8000-000000000078": "lv9-pyke",
    "00000000-0000-4000-8000-000000001283": "lv8",
  } },
  "sample-block-0411": { slug: "heartsteel-yone", boards: {
    "00000000-0000-4000-8000-000000000095": "lv8",
  } },
  "sample-block-1004": { slug: "ocean-zoe", boards: {
    "00000000-0000-4000-8000-000000001085": "lv9",
    "00000000-0000-4000-8000-000000001094": "lv8-6-spellweaver",
    "00000000-0000-4000-8000-000000001122": "lv8",
    "00000000-0000-4000-8000-000000001126": "lv6-4-spellweaver",
  } },
  "sample-block-0988": { slug: "spellweaver-karthus", boards: {
    "00000000-0000-4000-8000-000000001121": "lv9-mel",
  } },
  "sample-block-0870": { slug: "headliner-alune-yuumi", boards: {
    "00000000-0000-4000-8000-000000001167": "95-lv9",
  } },
  "sample-block-1020": { slug: "hitmaker-draven", boards: {
    "00000000-0000-4000-8000-000000001158": "lv8-kaisa",
  } },
  "sample-block-0854": { slug: "choreo-ahri", searchAliases: {
    "lv8-flex": ["编舞狐狸", "双编舞阿狸", "阿狸盖伦", "阿狸梅尔", "编舞师阿狸Flex"],
    "lv9-smeech": ["编舞史密奇", "阿狸史密奇"],
  }, boards: {
    "b8f3e967-922d-4a3a-83c4-c62d111b208f": "lv8-flex",
    "1c6360bc-59b9-4134-98d3-3795b30cf53a": "lv9-smeech",
    "9e3202c6-84e7-4fbc-b092-24f2818bbc3b": "lv9-unlock",
    "2ebc0e10-00bd-415f-9ba9-5f7f888ccf61": "lv9-arcanists",
    "1808c76f-5fa3-4ccd-b1e3-8fdf6f5f03fe": "lv9-heartsteel",
    "00000000-0000-4000-8000-000000001146": "95-lv9",
  } },
  "sample-block-1180": { slug: "tango-twisted-fate", boards: {
    "752a22a6-a1e1-4c6a-b4ab-a66ae4fc3b80": "95-lv9",
    "9294d9e9-bdbd-42c3-ae67-d1884a0198d6": "95-lv8",
  } },
  "sample-block-1181": { slug: "heartsteel-aphelios", boards: {
    "83cebafb-502e-4f5d-8a17-db9871730b44": "95-lv9",
    "3f5c63e5-1ea1-4310-bbc0-9871308b936d": "95-lv8",
  } },
  "arcanist-taliyah-vladimir": { slug: "arcanist-taliyah-vladimir", searchAliases: { "lv8": ["隆吸水"], "lv9-nidalee": ["隆吸水九级"] }, boards: {
    "14d668d4-7d3a-4445-a5b5-bfcfc6aa555b": "lv8",
    "1c4768e0-686a-495f-96f4-cda4348c8fdc": "lv9-nidalee",
  } },
  "mosher-yasuo-yone": { slug: "mosher-yasuo-yone", boards: {
    "edad46b7-e909-4233-b0c5-79d6899db862": "lv8",
  } },
  "true-damage-akali": { slug: "true-damage-akali", boards: {
    "bace6643-9e7b-4b21-9ceb-36e58a535ee4": "lv9",
    "9ac0242d-2780-4c8e-856f-9d2a8c9a4bc7": "lv8",
  } },
  "arcanist-mel-vladimir": { slug: "arcanist-mel-vladimir", boards: {
    "1c424859-acec-469d-afda-be5244334c5d": "lv9",
    "86805d25-91a4-4fc1-89fc-ae4d92b5022d": "lv8",
  } },
  "renegade-qiyana-samira": { slug: "renegade-qiyana-samira", boards: {
    "9c60581e-2adb-400b-be09-8e04fb2bdef2": "lv6",
    "69b58664-27f4-4404-b4fb-1475fe1583ff": "lv8",
  } },
  "true-damage-senna": { slug: "true-damage-senna", searchAliases: { "lv7": ["真伤赛娜"] }, boards: {
    "cfd4c9e6-f92d-4fd6-819b-486ec2461c03": "lv7",
    "3f69e13a-ddcf-4d24-9a6d-1c0d5e1df4cb": "lv8",
  } },
  "jazz-bard": { slug: "jazz-bard", boards: {
    "adc7fda0-b310-467b-98dd-3bd0134610cf": "lv7",
    "6308c680-360d-4afe-8326-bdd5b4622582": "lv8",
  } },
  "ionic-prodigy-lux": { slug: "ionic-prodigy-lux", searchAliases: { "lv6": ["离子拉克丝"] }, boards: {
    "a281cc9a-3387-42fb-b9e6-0146139e1069": "lv6",
    "7ca75194-155a-4f65-9d18-c27d7c8738dd": "lv8",
  } },
};

const sectionIdsBySlug = new Map(Object.entries(guideSlugs).map(([id, guide]) => [guide.slug, id]));
const teamIdsBySlug = new Map(Object.entries(guideSlugs).map(([id, guide]) =>
  [id, new Map(Object.entries(guide.boards).map(([teamId, slug]) => [slug, teamId]))]));

function mappedSlug<T>(entries: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(entries, id) ? entries[id] : undefined;
}

export function guidePublicSlug(sectionId: string): string {
  return mappedSlug(guideSlugs, sectionId)?.slug ?? sectionId;
}

export function resolveGuideSectionId(idOrSlug: string): string {
  return sectionIdsBySlug.get(idOrSlug) ?? idOrSlug;
}

export function boardPublicSlug(sectionId: string, teamId: string): string {
  const guide = mappedSlug(guideSlugs, sectionId);
  return (guide && mappedSlug(guide.boards, teamId)) ?? teamId;
}

export function guideBoardSearchAliases(sectionId: string, teamId: string): readonly string[] {
  const aliases = mappedSlug(guideSlugs, sectionId)?.searchAliases;
  return (aliases && mappedSlug(aliases, boardPublicSlug(sectionId, teamId))) ?? [];
}

export function resolveBoardTeamId(sectionId: string, teamOrSlug: string | undefined): string | undefined {
  return teamOrSlug === undefined ? undefined : teamIdsBySlug.get(sectionId)?.get(teamOrSlug) ?? teamOrSlug;
}

export function canonicalGuidePath(sectionId: string, teamId?: string, params?: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  if (teamId) query.set("team", boardPublicSlug(sectionId, teamId));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (key !== "team" && value !== undefined) query.set(key, value);
  }
  const path = "/guides/" + encodeURIComponent(guidePublicSlug(sectionId));
  return path + (query.size ? "?" + query : "");
}
