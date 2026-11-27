import { guideSearchKey } from "./guide-search.ts";
import { heroAugmentsById, type HeroAugment } from "./hero-augments.ts";
import { searchLevelToken, siteSearchLevel, type SiteSearchContext } from "./site-search.ts";
import type { Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

const aliases: Record<string, string[]> = {
  annie: ["骑熊安妮", "骑熊", "举高点", "提伯斯我看不到舞台"],
  elise: ["咬痕伊莉丝", "咬痕"], kennen: ["电能凯南", "电能"], lillia: ["毒舞莉莉娅", "毒舞"],
  olaf: ["远程奥拉夫"], renekton: ["救生员鳄鱼", "救生员雷克顿", "救生员"], sett: ["飞拳瑟提", "飞拳"],
};
const key = (text: string) => guideSearchKey(text).replace(/[，,！!？?「」]/g, "");
const followup = new RegExp(`^(?:那)?(?:再看|只看|看|换到|改到)?\\s*(?:${searchLevelToken}(?:的?(?:阵容|棋盘|配装|出装))?|阵容|棋盘|检索条件|筛选条件|配装|出装|战绩|样本|(?:强化)?实选(?:战绩)?)(?:呢|吗)?[?？。]*$`);

export type HeroAugmentSearchQuery = {
  augments: HeroAugment[]; level?: number; inherited?: boolean; browse?: boolean;
  showConditions?: boolean; picksOnly?: boolean;
};

export function heroAugmentSearchQuery(query: string, units: readonly Unit[], previous?: SiteSearchContext): HeroAugmentSearchQuery | undefined {
  const term = key(query);
  if (!term) return;
  const catalog = [...heroAugmentsById.values()];
  if (/^(?:s19|本版|当前)?英雄强化(?:阵容|攻略|推荐|有哪些)?$/.test(term)) return { augments: catalog, browse: true };
  const level = siteSearchLevel(query);
  const evidence = { showConditions: /(?:过滤|检索|筛选|统计)条件|样本|战绩/.test(term), picksOnly: /实选|实际选取/.test(term) };
  const prefixBrowse = /强化|专属|海克斯/.test(term);
  const named = catalog.filter(augment => {
    if ([augment.label, augment.name, ...(aliases[augment.unitId] ?? [])].some(name => term.includes(key(name)))) return true;
    const unit = units.find(row => row.id === augment.unitId);
    return unit && unitSearchNames(unit).some(name => {
      const alias = key(name);
      return alias && (term === alias || (prefixBrowse && alias.length >= 2 && term.includes(alias)));
    });
  });
  if (named.length) return { augments: named, level, ...evidence };
  const inherited = previous?.augmentId && heroAugmentsById.get(previous.augmentId);
  if (inherited && followup.test(query.trim())) return { augments: [inherited], level: level ?? previous.level, inherited: true, ...evidence };
}
