import type { ContentBlock, Section } from "./document";
import { readableSection, sectionTeams } from "./document-flow";
import { isEditorialSection } from "./guide-reading";
import { isVersionUpdate, sameEdition } from "./version-updates";

export type PatchRecommendation = {
  sectionId: string;
  teamId: string;
  status: "recommended" | "conditional" | "avoid" | "review";
  note: string;
  sources?: string[];
};

export type PatchRecommendationBatch = {
  seasonId: string;
  build: string;
  reviewedAt: string;
  window?: { start: string; end: string };
  summary?: string;
  displayOrder?: string[];
  entries: PatchRecommendation[];
};

export type PatchRecommendationRead = { declared: boolean; batch?: PatchRecommendationBatch; issues: string[] };

export const patchRecommendationLabels = {
  recommended: "推荐", conditional: "有条件", avoid: "次选阵容", review: "待复核",
} satisfies Record<PatchRecommendation["status"], string>;
const statusFromText = new Map<string, PatchRecommendation["status"]>([
  ["推荐", "recommended"], ["条件", "conditional"], ["有条件", "conditional"],
  ["避开", "avoid"], ["别硬玩", "avoid"], ["暂不推荐", "avoid"], [patchRecommendationLabels.avoid, "avoid"],
  ["复核", "review"], ["待复核", "review"],
]);
const origin = "https://tft.example.com";
const guidePath = /^\/guides\/([A-Za-z0-9_-]{1,100})\/?$/;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const marker = "阵容推荐", endMarker = "阵容推荐结束";
type Field = { text: string; links: string[] };

/** One clause per line, whether pasted as plain URLs or as Feishu hyperlinks. */
function lines(block: ContentBlock): Field[][] {
  const runs = block.elements?.flatMap(element => element.text_run
    ? [{ text: element.text_run.content, url: element.text_run.text_element_style?.link?.url }]
    : element.mention_doc ? [{ text: element.mention_doc.title, url: element.mention_doc.url }] : []);
  const parts = runs?.length && runs.map(run => run.text).join("") === block.text
    ? runs : [{ text: block.text ?? "", url: undefined }];
  const result: Field[][] = [[{ text: "", links: [] }]];
  for (const run of parts) for (const chunk of run.text.split(/(\r\n|\n|\r|[|｜])/)) {
    if (/^[|｜]$/.test(chunk)) result.at(-1)!.push({ text: "", links: [] });
    else if (/^[\r\n]+$/.test(chunk)) result.push([{ text: "", links: [] }]);
    else if (chunk) {
      const field = result.at(-1)!.at(-1)!;
      field.text += chunk;
      if (run.url && !field.links.includes(run.url)) field.links.push(run.url);
    }
  }
  return result.map(row => row.map(field => ({ ...field, text: field.text.trim() })));
}

function observations(intro?: Section) {
  return intro?.id === "introduction" ? intro.blocks.filter(block =>
    block.type === "quote" && block.children?.[0]?.text?.trim() === "环境观察") : [];
}

function isDeclaration(row: Field[]) {
  return row[0].text === marker && row.length > 1;
}

function timestamp(value: string) {
  const match = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/);
  const parsed = Date.parse(value);
  if (!match || !Number.isFinite(parsed)) return;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59) return;
  return parsed;
}

function urlField(field: Field) {
  return field.links.length === 1 ? field.links[0] : !field.links.length ? field.text : "";
}

function guideTarget(field: Field) {
  const text = urlField(field);
  if (!text.startsWith("/") && !text.startsWith("https://")) return;
  try {
    const url = new URL(text, origin);
    const path = url.pathname.match(guidePath);
    const teams = url.searchParams.getAll("team");
    if (url.origin === origin && !url.username && !url.password && path && teams.length === 1 && uuid.test(teams[0]))
      return { sectionId: path[1], teamId: teams[0] };
  } catch { /* bad link */ }
}

function sourceUrl(field: Field) {
  try {
    const url = new URL(urlField(field));
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch { /* bad link */ }
}

/** Compose precisely the selected draft sections and the unmodified public sections. */
export function sectionsAfterPartialPublish(live: Section[], draft: Section[], selectedIds: string[], removeIds: string[]) {
  const replace = new Set(selectedIds), remove = new Set([...selectedIds, ...removeIds]);
  return [...live.filter(section => !remove.has(section.id)), ...draft.filter(section => replace.has(section.id))];
}

/** Explicit, versioned Feishu entries; ordinary environment notes are not recommendations. */
export function getPublishedPatchRecommendations(
  sections: Section[], seasonId: string, build: string, effectiveAt?: string,
): PatchRecommendationRead {
  const quotes = observations(sections.find(section => section.id === "introduction"));
  const children = quotes.map(quote => (quote.children ?? []).slice(1).flatMap(lines));
  const declarations = children.flatMap((rows, i) => rows.flatMap((row, index) =>
    isDeclaration(row) ? [{ row, i, index }] : []));
  if (!declarations.length) return { declared: false, issues: [] };
  if (declarations.length !== 1)
    return { declared: true, issues: ["「环境观察」只保留一处阵容推荐声明。"] };
  const [{ row: header, i, index }] = declarations;
  const issues: string[] = [];
  const [, edition, editorBuild, reviewedAt, start, end] = header.map(field => field.text);
  if ((header.length !== 4 && header.length !== 6) || !edition || !editorBuild || !reviewedAt)
    return { declared: true, issues: ["阵容推荐声明应填写赛季、构建号、复盘时间；样本开始和结束时间须同时填写。"] };
  if (edition !== seasonId || editorBuild !== build)
    issues.push(`推荐声明为 ${edition} / ${editorBuild}；本站当前为 ${seasonId} / ${build}，请按当前构建复核。`);
  const reviewedTime = timestamp(reviewedAt), activated = effectiveAt ? timestamp(effectiveAt) : undefined;
  if (reviewedTime === undefined || (activated !== undefined && reviewedTime < activated))
    issues.push("复盘时间须带时区，且不早于当前构建生效时间。");
  let window: PatchRecommendationBatch["window"];
  if (header.length === 6) {
    const a = timestamp(start), b = timestamp(end);
    if (a === undefined || b === undefined || a >= b || (activated !== undefined && a < activated) ||
        (reviewedTime !== undefined && b > reviewedTime)) {
      issues.push("样本窗口必须带时区，开始应在构建生效后，结束应晚于开始且不晚于复盘。");
    } else window = { start, end };
  }
  const entries: PatchRecommendation[] = [];
  const missingTargets: string[] = [];
  let summary: string | undefined;
  const seen = new Set<string>();
  const published = new Map(sections.map(section => [section.id, section]));
  for (const [offset, fields] of children[i].slice(index + 1).entries()) {
    const [first, route, advice, ...references] = fields;
    if (first.text === endMarker && fields.length === 1) break;
    if (fields.every(field => !field.text && !field.links.length)) continue;
    const line = `推荐区第 ${offset + 1} 行`;
    if (first.text === "摘要") {
      if (summary !== undefined || fields.length !== 2 || !route?.text)
        issues.push(`${line}：摘要只写一行，格式为「摘要 | 内容」。`);
      else summary = route.text;
      continue;
    }
    const status = statusFromText.get(first.text);
    if (!status || !route?.text || !advice?.text) {
      issues.push(`${line}：请填写「状态 | 攻略棋盘链接 | 一句建议」。段落正文请移到声明前或「阵容推荐结束」之后。`);
      continue;
    }
    const target = guideTarget(route);
    if (!target) {
      issues.push(`${line}：请使用本站带 team 参数的攻略链接，指向具体棋盘。`);
      continue;
    }
    const key = `${target.sectionId}:${target.teamId}`;
    if (seen.has(key)) {
      issues.push(`${line}：同一棋盘只能写一次。`);
      continue;
    }
    seen.add(key);
    const sources = references.map(sourceUrl);
    if (sources.some(value => !value)) {
      issues.push(`${line}：来源请逐列填写 HTTPS 链接；没有来源可省略。`);
      continue;
    }
    const section = published.get(target.sectionId);
    const team = section && sectionTeams(section).find(team => team.id === target.teamId);
    if (!section || !team?.pieces.length || !readableSection(section) || isVersionUpdate(section) || isEditorialSection(section) ||
        (section.gameData && !sameEdition(section.gameData.id, seasonId))) {
      missingTargets.push(`${line}：该棋盘不在本次发布后的同赛季攻略中；检查链接，或同时发布对应攻略。`);
      continue;
    }
    entries.push({ ...target, status, note: advice.text, ...(sources.length ? { sources: [...new Set(sources as string[])] } : {}) });
  }
  const warnings = [...issues, ...missingTargets];
  if (issues.length || missingTargets.length && !entries.length) return { declared: true, issues: warnings };
  return {
    declared: true, issues: warnings,
    batch: {
      seasonId, build, reviewedAt, ...(window && { window }),
      ...(summary && !missingTargets.length && { summary }), entries,
    },
  };
}

/** Keeps human environment notes, never the import syntax, in public briefs. */
export function readablePatchIntroduction(intro: Section, summary?: string): Section {
  const quotes = new Set(observations(intro));
  let addedSummary = false;
  return { ...intro, blocks: intro.blocks.map(block => {
    if (!quotes.has(block)) return block;
    let hiding = false;
    const children = (block.children ?? []).flatMap((child, index): ContentBlock[] => {
      if (index === 0) return [child];
      const original = lines(child);
      let needsCleaning = hiding;
      const kept = original.flatMap(row => {
        if (isDeclaration(row)) {
          needsCleaning = true;
          hiding = true;
          if (summary && !addedSummary) {
            addedSummary = true;
            return [summary];
          }
          return [];
        }
        if (hiding && row[0].text === endMarker && row.length === 1) {
          hiding = false;
          return [];
        }
        return hiding ? [] : [row.map(field => field.text).join(" | ")];
      });
      if (!needsCleaning) return [child];
      const text = kept.join("\n").trim();
      return text ? [{ ...child, text, elements: undefined }] : [];
    });
    return { ...block, children };
  }) };
}
