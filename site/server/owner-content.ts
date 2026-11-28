import currentPatch from "@/data/current-patch.json";
import type { ContentBlock, Publication, Section } from "@/domain/document";
import { sectionTeams } from "@/domain/document-flow";
import { authoredParagraphs, guideBoardName, isEditorialSection, readingNotes, sourceSummary } from "@/domain/guide-reading";
import {
  guideContentBlocks, homeContentBlocks,
  type GuideFields, type HomeFields, type OwnerContentMutation, type OwnerContentState, type OwnerContentTarget,
} from "@/domain/owner-content";
import type { Team } from "@/domain/types";
import { isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { ApiError, database } from "./access";
import { currentPatchRecommendations } from "./patch-recommendations";

type GuideEdits = Partial<Pick<GuideFields, "title" | "opening">> & {
  boards?: Record<string, Partial<Pick<GuideFields, "boardTitle" | "notes" | "blocks">>>;
};
type HomeEdits = Partial<Omit<HomeFields, "recommendations">> & {
  recommendations?: { build: string; rows: NonNullable<HomeFields["recommendations"]> };
};
type ContentRow = { revision: number; published: string; drafts: string };
type PublishedRow = Pick<ContentRow, "published"> & { scope: string; target: string };
const homeTarget = "home";
const homeScope = () => JSON.stringify([currentPatch.seasonId]);
// An editor opened under a prior build must refresh before saving season-wide content.
const homeRevisionBase = () => Number(currentPatch.build) * 1_000_000;

function editableGuide(section: Section) {
  return !isEditorialSection(section) && !isVersionUpdate(section) && sectionTeams(section).length > 0;
}

function activeHomeFields(publication: Publication): HomeFields {
  const recommendations = currentPatchRecommendations(publication)?.entries.filter(entry => entry.override)
    .sort((a, b) => (a.pinOrder ?? Infinity) - (b.pinOrder ?? Infinity))
    .map(({ sectionId, teamId, timing, override }) => ({ sectionId, teamId, timing, override })) ?? [];
  return { introTitle: "", intro: "", blocks: [...homeContentBlocks], recommendations };
}

function guideFields(publication: Publication, section: Section, board: Team): GuideFields {
  const primary = sectionTeams(section).find(team => team.id === section.primaryTeamId) ??
    section.team ?? sectionTeams(section)[0] ?? board;
  return {
    title: section.title,
    boardTitle: guideBoardName(board) || board.name,
    opening: sourceSummary(section) ?? readingNotes(section, primary, section.gameData ?? publication.season).opening,
    notes: board.notes ?? "",
    blocks: [...guideContentBlocks],
  };
}

function targetHome(publication: Publication) {
  if (!sameEdition(publication.season.id, currentPatch.seasonId))
    throw new ApiError(409, "首页版本已更新，请刷新");
  return { scope: homeScope(), target: homeTarget, draftKey: homeTarget, baseline: activeHomeFields(publication),
    revisionBase: homeRevisionBase() };
}

function targetGuide(publication: Publication, target: Exclude<OwnerContentTarget, { home: true }>) {
  const section = publication.sections.find(entry => entry.id === target.sectionId && editableGuide(entry));
  const board = section && sectionTeams(section).find(entry => entry.id === target.teamId && entry.pieces.length);
  if (!section || !board) throw new ApiError(404, "未找到可编辑的攻略棋盘");
  const edition = (section.gameData ?? publication.season).id;
  if (!sameEdition(edition, publication.season.id)) throw new ApiError(409, "该攻略属于其他赛季");
  return { scope: edition, target: section.id, draftKey: board.id, baseline: guideFields(publication, section, board) };
}

async function readRow(scope: string, target: string) {
  return await database().prepare("SELECT revision, published, drafts FROM owner_content WHERE scope=? AND target=?")
    .bind(scope, target).first<ContentRow>();
}
function fieldEdits<T extends object>(base: T, submitted: T): Partial<T> {
  return Object.fromEntries(Object.entries(submitted).filter(([name, value]) =>
    value !== undefined && JSON.stringify(value) !== JSON.stringify(base[name as keyof T])
  )) as Partial<T>;
}
function guideEditsForBoard({ title, opening, boards }: GuideEdits, teamId: string): Partial<GuideFields> {
  return { ...(title !== undefined && { title }), ...(opening !== undefined && { opening }), ...boards?.[teamId] };
}
function guidePublishedFields(baseline: GuideFields, edits: GuideEdits, teamId: string): GuideFields {
  return { ...baseline, ...guideEditsForBoard(edits, teamId) };
}
function activeHomeEdits({ recommendations, ...fields }: HomeEdits): Partial<HomeFields> {
  return { ...fields, ...(recommendations?.build === currentPatch.build && { recommendations: recommendations.rows }) };
}
function homeEditsForStorage({ recommendations, ...fields }: Partial<HomeFields>): HomeEdits {
  return { ...fields, ...(recommendations && { recommendations: { build: currentPatch.build, rows: recommendations } }) };
}
function storedDraft<T extends object>(row: ContentRow | null, key: string): Partial<T> {
  return (JSON.parse(row?.drafts ?? "{}") as Record<string, Partial<T>>)[key] ?? {};
}
function contentState<T extends GuideFields | HomeFields>(row: ContentRow | null, published: T, draft: Partial<T>, revisionBase = 0): OwnerContentState {
  return {
    revision: revisionBase + (row?.revision ?? 0),
    published,
    ...(Object.keys(draft).length && { draft: { ...published, ...draft } }),
  };
}
function homeContentState(row: ContentRow | null, published: HomeFields) {
  return contentState(row, published, activeHomeEdits(storedDraft<HomeEdits>(row, homeTarget)), homeRevisionBase());
}

export async function readOwnerContent(publication: Publication, target: OwnerContentTarget): Promise<OwnerContentState> {
  if ("home" in target) {
    const context = targetHome(publication);
    const row = await readRow(context.scope, context.target);
    return homeContentState(row, { ...context.baseline, ...activeHomeEdits(JSON.parse(row?.published ?? "{}")) });
  }
  const context = targetGuide(publication, target);
  const row = await readRow(context.scope, context.target);
  return contentState(row, guidePublishedFields(context.baseline, JSON.parse(row?.published ?? "{}"), context.draftKey),
    storedDraft<GuideFields>(row, context.draftKey));
}

async function saveRow(
  context: { scope: string; target: string; draftKey: string; revisionBase?: number },
  row: ContentRow | null, mutation: OwnerContentMutation, published: object, draft: object,
): Promise<ContentRow> {
  const revision = row?.revision ?? 0;
  if (revision + (context.revisionBase ?? 0) !== mutation.revision)
    throw new ApiError(409, "编辑内容已有新版本，请重新打开后再保存");
  const drafts = JSON.parse(row?.drafts ?? "{}") as Record<string, object>;
  if (mutation.publish || !Object.keys(draft).length) delete drafts[context.draftKey];
  else drafts[context.draftKey] = draft;
  const proposed: ContentRow = {
    revision: revision + 1,
    published: mutation.publish ? JSON.stringify(published) : row?.published ?? "{}",
    drafts: JSON.stringify(drafts),
  };
  const result = await database().prepare(
    `INSERT INTO owner_content (scope, target, revision, published_revision, published, drafts)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE ?=0 OR EXISTS (SELECT 1 FROM owner_content WHERE scope=? AND target=?)
      ON CONFLICT(scope, target) DO UPDATE SET
        revision=excluded.revision,
        published_revision=owner_content.published_revision + CASE WHEN owner_content.published<>excluded.published THEN 1 ELSE 0 END,
        published=excluded.published, drafts=excluded.drafts
      WHERE owner_content.revision=?`,
  ).bind(context.scope, context.target, proposed.revision, proposed.published === "{}" ? 0 : 1, proposed.published,
    proposed.drafts, revision, context.scope, context.target, revision).run();
  if (!result.meta.changes) throw new ApiError(409, "编辑内容已有新版本，请重新打开后再保存");
  return proposed;
}

function validateRecommendationTargets(publication: Publication, rows: HomeFields["recommendations"]) {
  if (!rows?.length) return;
  const eligible = new Map(publication.sections.filter(editableGuide).map(section =>
    [section.id, new Set(sectionTeams(section).filter(team => team.pieces.length).map(team => team.id))]));
  if (rows.some(row => !eligible.get(row.sectionId)?.has(row.teamId)))
    throw new ApiError(400, "推荐名单包含不可用的阵容棋盘");
}

export async function saveOwnerContent(publication: Publication, mutation: OwnerContentMutation): Promise<OwnerContentState> {
  if ("home" in mutation.target) {
    const context = targetHome(publication);
    const row = await readRow(context.scope, context.target);
    const current = { ...context.baseline, ...activeHomeEdits(JSON.parse(row?.published ?? "{}")) };
    const next = { ...current, ...mutation.fields } as HomeFields;
    validateRecommendationTargets(publication, next.recommendations);
    const overrides = homeEditsForStorage(fieldEdits(context.baseline, next));
    const draft = homeEditsForStorage(fieldEdits(current, next));
    const saved = await saveRow(context, row, mutation, overrides, draft);
    return homeContentState(saved, mutation.publish ? next : current);
  }
  const context = targetGuide(publication, mutation.target);
  const row = await readRow(context.scope, context.target);
  const savedEdits: GuideEdits = JSON.parse(row?.published ?? "{}");
  const current = guidePublishedFields(context.baseline, savedEdits, context.draftKey);
  const next = { ...current, ...mutation.fields } as GuideFields;
  const { title, opening, ...board } = fieldEdits(context.baseline, next);
  const boards = { ...savedEdits.boards };
  if (Object.keys(board).length) boards[context.draftKey] = board;
  else delete boards[context.draftKey];
  const overrides = { title, opening, ...(Object.keys(boards).length && { boards }) };
  const saved = await saveRow(context, row, mutation, overrides, fieldEdits(current, next));
  return contentState(saved, mutation.publish ? next : current, storedDraft<GuideFields>(saved, context.draftKey));
}

function replaceSummary(blocks: ContentBlock[], summaryId: string, opening: string): ContentBlock[] {
  return blocks.map(block => block.id === summaryId ? { ...block, text: opening, elements: undefined } :
    block.children ? { ...block, children: replaceSummary(block.children, summaryId, opening) } : block);
}

function applyGuideEdits(section: Section, edits: GuideEdits): Section {
  const edited: Section = { ...section };
  if (edits.title !== undefined) edited.title = edited.ownerTitle = edits.title;
  if (edits.opening !== undefined) {
    const summary = authoredParagraphs(section).find(block => block.id === section.summaryBlockId);
    edited.ownerOpening = edits.opening;
    if (summary) edited.blocks = replaceSummary(section.blocks, summary.id, edits.opening);
    else if (edits.opening) {
      const id = `web-owner-opening-${section.id}`;
      edited.summaryBlockId = id;
      edited.blocks = [{ id, type: "text", text: edits.opening }, ...section.blocks];
    }
  }
  const editBoard = (team: Team) => {
    const update = edits.boards?.[team.id];
    if (!update) return team;
    return {
      ...team,
      ...(update.boardTitle !== undefined && { webTitle: update.boardTitle, ownerBoardTitle: update.boardTitle }),
      ...(update.notes !== undefined && { notes: update.notes, ownerNotes: update.notes }),
      ...(update.blocks && { ownerBlocks: update.blocks }),
    };
  };
  if (section.team) edited.team = editBoard(section.team);
  if (section.teams) edited.teams = section.teams.map(editBoard);
  return edited;
}

export async function applyPublishedOwnerContent(publication: Publication): Promise<Publication> {
  const { results } = await database()
    .prepare("SELECT scope, target, published FROM owner_content WHERE published_revision>0 AND published<>'{}'")
    .all<PublishedRow>();
  if (!results.length) return publication;
  const rows = new Map(results.map(row => [JSON.stringify([row.scope, row.target]), row.published]));
  const sections = publication.sections.map(section => {
    if (!editableGuide(section)) return section;
    const row = rows.get(JSON.stringify([(section.gameData ?? publication.season).id, section.id]));
    return row ? applyGuideEdits(section, JSON.parse(row)) : section;
  });
  const home = sameEdition(publication.season.id, currentPatch.seasonId) && rows.get(JSON.stringify([homeScope(), homeTarget]));
  if (!home) return { ...publication, sections };
  const ownerHome: HomeFields = { introTitle: "", intro: "", blocks: [...homeContentBlocks], ...activeHomeEdits(JSON.parse(home)) };
  const eligible = new Set(sections.filter(editableGuide).flatMap(section => sectionTeams(section).map(team => JSON.stringify([section.id, team.id]))));
  if (ownerHome.recommendations) ownerHome.recommendations = ownerHome.recommendations
    .filter(row => eligible.has(JSON.stringify([row.sectionId, row.teamId])));
  return { ...publication, sections, ownerHome };
}
