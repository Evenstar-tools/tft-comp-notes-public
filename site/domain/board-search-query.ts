import { splitGuideConditions } from "./guide-search.ts";
import { searchLevelToken, siteSearchLevel, type SearchStrategy, type SiteSearchContext } from "./site-search.ts";

export type BoardSearchQuery = NonNullable<SiteSearchContext["boardLookup"]> & {
  level?: number; name?: string; inherited?: boolean;
};

const strategies: Record<string, SearchStrategy> = {
  赌狗: "reroll", 慢搜: "reroll", 低费慢搜: "reroll", 追三: "reroll", 84: "fast8", 速八: "fast8", 速8: "fast8",
  95: "fast9", 速九: "fast9", 速9: "fast9",
};
const strategy = /^(赌狗|低费慢搜|慢搜|追三|84|95|速[八8]|速[九9])(?=$|\s|阵容|路线|攻略|推荐|玩法)/;
const levelOnly = new RegExp(`^(${searchLevelToken})(?:的?(?:棋盘|终盘|阵容|结算))?$`);
const rollLevel = new RegExp(`^停?(${searchLevelToken})\\s*(?:D(?:牌)?|慢搜|搜牌|追三)$`, "i");
const levelSuffix = new RegExp(`^(.+?)\\s*(${searchLevelToken})(?:的?(?:棋盘|终盘|阵容|结算|怎么变阵|有更好的变阵吗|有哪些变阵))?$`);
const evidenceSuffix = /(?:的)?(?:检索|筛选|查数|取样|战绩)(?:条件|口径)$/;

function dimensions(text: string) {
  if (levelOnly.test(text)) return { level: siteSearchLevel(text) };
  if (rollLevel.test(text)) return { rollLevel: siteSearchLevel(text) };
}

export function boardSearchQuery(input: string, previous?: SiteSearchContext): BoardSearchQuery | undefined {
  const text = input.normalize("NFKC").trim().replace(/[？?！!。]+$/, "");
  if (!text) return;
  const parts = splitGuideConditions(text);
  if (parts.length > 1) {
    const base = boardSearchQuery(parts[0]);
    const query: BoardSearchQuery = base ?? {};
    const terms = base ? parts.slice(1) : parts;
    query.terms = [];
    for (const term of terms) {
      const scope = dimensions(term);
      if (scope) Object.assign(query, scope);
      else query.terms.push(term);
    }
    return query;
  }

  const compact = text.replace(/^(?:推荐|找|搜|看看|想看)(?:一下)?\s*/, "").replace(evidenceSuffix, "").trim();
  const tag = strategy.exec(compact)?.[1];
  if (tag) {
    const tail = compact.slice(tag.length).trim().replace(/^(?:阵容|路线|攻略|推荐|玩法)\s*/, "");
    const scope = dimensions(tail);
    if (!tail || scope) return { group: strategies[tag], ...scope };
  }

  const followup = compact.replace(/^(?:那(?:就|只看|看|再看)?|再看|接着看|只看|看)\s*/, "").replace(/(?:呢|吗)$/, "");
  const scope = dimensions(followup);
  if (previous?.boardLookup && /^(?:排除|剔除|不含|不看)\s*\S+$/.test(followup)) {
    const terms = [...new Set([...(previous.boardLookup.terms ?? []), followup])].slice(-5);
    return { ...previous.boardLookup, terms, level: previous.level, inherited: true };
  }
  if (previous?.boardLookup && (scope || evidenceSuffix.test(text))) {
    return { ...previous.boardLookup, level: previous.level, ...scope, inherited: true };
  }
  if (scope) return previous?.item || previous?.augmentId ? undefined : scope;
  const named = levelSuffix.exec(compact);
  if (named) return { name: named[1].trim(), level: siteSearchLevel(named[2]) };
  if (compact && compact !== text && evidenceSuffix.test(text)) return { name: compact };
}
