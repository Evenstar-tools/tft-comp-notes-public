import { attachBoundRegions, duplicatePublishedTeam, isBoardCaption, readableSection, sectionTeams, splitSections } from "@/domain/document-flow";
import { itemMap, season, traitMap, unitMap } from "@/data";
import { allBlocks, authoredParagraphs, guideSectionWithCurrentNames, isEditorialSection } from "@/domain/guide-reading";
import { guideExecutionUnitIds } from "@/domain/guide-execution";
import { isS19LaunchUpgrade, isVersionUpdate, sameEdition } from "@/domain/version-updates";
import { getPublishedPatchRecommendations, sectionsAfterPartialPublish } from "@/domain/patch-recommendations";
import { boardContentVersion, publishedBoardContent, publishedBoardEdits, publishedBoardLayouts, type PublishedBoardOverride } from "@/domain/published-board-layout";
import { isRepositoryBoardRevision, publicationWithBoardRevision, type PublicationRecord } from "@/domain/publication-record";
import currentPatch from "@/data/current-patch.json";
import type {
  ContentBlock,
  DocumentDraft,
  Publication,
  Section,
} from "@/domain/document";
import type { Season, Team } from "@/domain/types";
import { database, setting, ApiError } from "./access";
import { includeWebDetails, refreshWebDetails } from "./guide-details";
import { includeRerollBoards } from "./reroll-guides";
import { migrateS19GuideSnapshot } from "./s19-guide-cleanup";
import {
  blockText,
  cacheMedia,
  documentId,
  documentInfo,
  readDocument,
  type FeishuBlock,
} from "./feishu";

let previewLiveCache: Promise<Publication> | null = null;
let previewPublicGuideCache: Promise<Publication> | null = null;
let dbPublicGuideCache: { id: string; value: Promise<Publication | null> } | null = null;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function bundlePreviewSnapshot(): Promise<Publication> {
  const { default: preview } = await import("@/data/public-preview.json");
  return structuredClone(preview) as Publication;
}

async function publishedSnapshotId(): Promise<string | null> {
  const row = await database()
    .prepare("SELECT value FROM settings WHERE key='published_id'")
    .first<{ value: string }>();
  return row?.value ?? null;
}

function legacyRepositoryOverrides(base: Publication, legacy: Publication): PublishedBoardOverride[] {
  if (!sameEdition(base.season.id, legacy.season.id) && !isS19LaunchUpgrade(legacy.season.id, base.season.id)) return [];
  const key = ({ sectionId, teamId }: { sectionId: string; teamId: string }) => JSON.stringify([sectionId, teamId]);
  const bundled = new Set([...(base.boardEdits ?? []), ...(base.boardLayouts ?? [])].map(key));
  const edits = publishedBoardEdits(base.sections, legacy.boardEdits).filter(change => !bundled.has(key(change)));
  const layouts = publishedBoardLayouts(base.sections, legacy.boardLayouts).filter(change => !bundled.has(key(change)));
  if (!edits.length && !layouts.length) return [];
  const original = includeRerollBoards(migrateS19GuideSnapshot(base), season);
  const changed = includeRerollBoards(migrateS19GuideSnapshot({
    ...base, boardEdits: [...(base.boardEdits ?? []), ...edits], boardLayouts: [...(base.boardLayouts ?? []), ...layouts],
  }), season);
  const affected = new Set([...edits, ...layouts].map(key));
  return original.sections.flatMap(section => {
    const updated = changed.sections.find(entry => entry.id === section.id);
    if (!updated) return [];
    return sectionTeams(section).flatMap(source => {
      if (!affected.has(key({ sectionId: section.id, teamId: source.id }))) return [];
      const team = sectionTeams(updated).find(entry => entry.id === source.id);
      return team && boardContentVersion(team) !== boardContentVersion(source) ? [{
        sectionId: section.id, teamId: source.id, edition: section.gameData?.id ?? original.season.id,
        source: publishedBoardContent(source), content: publishedBoardContent(team),
      }] : [];
    });
  });
}

type PublishedSource = { publication: Publication; repository: boolean };

async function storedPublication(id?: string): Promise<PublishedSource | null> {
  const row = await database().prepare(
    "SELECT body, EXISTS(SELECT 1 FROM settings WHERE key IN ('document_draft','edgeone_import_mode')) AS has_document FROM snapshots WHERE id=COALESCE(?, (SELECT value FROM settings WHERE key='published_id'))",
  ).bind(id ?? null).first<{ body: string; has_document: number }>();
  if (!row) return null;
  const record = JSON.parse(row.body) as PublicationRecord;
  if (isRepositoryBoardRevision(record)) {
    return { publication: publicationWithBoardRevision(await bundlePreviewSnapshot(), record), repository: true };
  }
  // Older board writes stored a complete copy, without the draft or archive used for document publications.
  if (!row.has_document && record.previousId && (record.boardEdits?.length || record.boardLayouts?.length)) {
    const base = await bundlePreviewSnapshot();
    const boardOverrides = legacyRepositoryOverrides(base, record);
    return { publication: publicationWithBoardRevision(base, {
      kind: "repository-board-revision", id: record.id, previousId: record.previousId, publishedAt: record.publishedAt, boardOverrides,
    }), repository: true };
  }
  return { publication: record, repository: false };
}

export async function publishedSnapshotSource(): Promise<PublishedSource> {
  const saved = hasDatabase() ? await storedPublication() : null;
  if (!saved) return { publication: await bundlePreviewSnapshot(), repository: true };
  const stored = saved.publication;
  const migratedOverrides = stored.boardOverrides?.map(edit => isS19LaunchUpgrade(edit.edition, season.id)
    ? { ...edit, edition: season.id } : edit);
  const publication = { ...stored, boardOverrides: migratedOverrides };
  if (!isS19LaunchUpgrade(publication.season.id, season.id)) return { ...saved, publication };
  const sections = publication.sections.map(section => {
    const previous = section.gameData ?? publication.season;
    if (!isS19LaunchUpgrade(previous.id, season.id)) return section;
    if (isVersionUpdate(section)) return { ...section, updateEdition: section.updateEdition ?? previous.id };
    const compatible = sectionTeams(section).every(board => board.pieces.every(piece =>
      [piece, piece.alternate].every(loadout => !loadout || unitMap.has(loadout.unitId) &&
        loadout.items.every(id => itemMap.has(id)))));
    return { ...section, gameData: compatible ? undefined : previous };
  });
  return { ...saved, publication: { ...publication, season, sections } };
}

// Index pages only need the published chapters and boards. Reading the full guide also restores legacy media bindings.
export async function publishedSnapshot(): Promise<Publication> {
  return (await publishedSnapshotSource()).publication;
}

export async function publicationById(id: string): Promise<Publication | null> {
  return (await storedPublication(id))?.publication ?? null;
}
export async function livePublication(): Promise<Publication | null> {
  if (!hasDatabase()) {
    previewLiveCache ??= publishedSnapshot().then(pub => prepareForReading(pub!));
    return previewLiveCache;
  }
  const publication = await publishedSnapshot();
  return publication ? prepareForReading(publication) : null;
}
async function buildPublicGuidePublication(): Promise<Publication | null> {
  const publication = await publishedSnapshot();
  if (!publication) return null;
  const prepared = await prepareForReading(includeRerollBoards(migrateS19GuideSnapshot(publication), season));
  return {
    ...prepared,
    sections: prepared.sections.map(section => (section.gameData?.id ?? prepared.season.id).startsWith("s19-") &&
      (section.kind === "guide" || sectionTeams(section).length) ? guideSectionWithCurrentNames(section) : section),
  };
}
export async function publicGuidePublication(): Promise<Publication | null> {
  if (!hasDatabase()) {
    previewPublicGuideCache ??= buildPublicGuidePublication().then(pub => pub!);
    return previewPublicGuideCache;
  }
  const id = await publishedSnapshotId();
  if (!id) {
    dbPublicGuideCache = null;
    previewPublicGuideCache ??= buildPublicGuidePublication().then(pub => pub!);
    return previewPublicGuideCache;
  }
  if (dbPublicGuideCache?.id === id) return dbPublicGuideCache.value;
  const value = buildPublicGuidePublication().catch(error => {
    if (dbPublicGuideCache?.id === id) dbPublicGuideCache = null;
    throw error;
  });
  dbPublicGuideCache = { id, value };
  return value;
}
async function prepareForReading<T extends DocumentDraft>(publication: T): Promise<T> {
  const legacyKeys = process.env.DATABASE_URL?.trim()
    ? [...new Set(publication.sections.filter(section => !section.generatedRegions)
      .flatMap(section => sectionTeams(section).map(team => "binding:" + team.id)))]
    : [];
  const legacyRows = legacyKeys.length ? await database()
    .prepare("SELECT key,value FROM settings WHERE key IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(legacyKeys))
    .all<{ key: string; value: string }>() : { results: [] };
  const legacyBindings = new Map(legacyRows.results.map(row => [row.key, row.value]));
  for (const section of publication.sections) {
    const teams = sectionTeams(section);
    if (!teams.length) continue;
    // Older snapshots stored their verified image bindings separately.
    if (!section.generatedRegions) {
      const blocks = new Map(allBlocks(section.blocks).map(block => [block.id, block]));
      for (const team of teams) {
        const raw = legacyBindings.get("binding:" + team.id);
        if (!raw) continue;
        const binding = JSON.parse(raw);
        const caption = blocks.get(binding.textId);
        if (team.id !== binding.team?.id || caption?.type !== "text" ||
          blocks.get(binding.imageId)?.type !== "image") continue;
        const text = caption.text ?? "";
        if (text.startsWith(`【阵容构建器 · ${team.id}】\n`) ||
          (typeof binding.expectedText === "string" && isBoardCaption(text, binding.expectedText, team.id))) {
          (section.generatedRegions ??= {})[team.id] = { textId: binding.textId, imageId: binding.imageId };
        }
      }
    }
    if (sameEdition((section.gameData ?? publication.season).id, season.id)) refreshWebDetails(section);
    section.gameData = withGameData(section, publication.season).gameData;
  }
  return publication;
}
export async function draftDocument(): Promise<DocumentDraft | null> {
  const value = await setting("document_draft");
  return value ? prepareForReading(JSON.parse(value) as DocumentDraft) : null;
}
function withGameData(section: Section, data: Season): Section {
  const teams = sectionTeams(section);
  if (!teams.length) return section;
  const snapshot = section.gameData ?? data;
  const pieces = teams.flatMap(team => [team, ...Object.values(team.stages ?? {})].flatMap(board => board.pieces))
    .flatMap(piece => piece.alternate ? [piece, piece.alternate] : [piece]);
  const conditions = teams.flatMap(team => (team.conditions ?? []).filter(rule => "itemId" in rule));
  const unitIds = new Set(pieces.map(piece => piece.unitId));
  const currentEdition = sameEdition(snapshot.id, season.id);
  const executionUnits = currentEdition ? guideExecutionUnitIds(section.id, teams) : [];
  const availableUnits = new Map(snapshot.units.map(unit => [unit.id, unit]));
  for (const id of [...unitIds, ...executionUnits, ...conditions.map(rule => rule.recipientId)]) {
    unitIds.add(id);
    const current = currentEdition && unitMap.get(id);
    if (current && !availableUnits.has(id)) availableUnits.set(id, current);
  }
  const units = [...availableUnits.values()].filter(unit => unitIds.has(unit.id)).map(unit => {
    const current = currentEdition && unitMap.get(unit.id);
    return current ? { ...unit, traits: current.traits, unlock: current.unlock, sourceUnlock: current.sourceUnlock } : unit;
  });
  const traitIds = new Set(units.flatMap((unit) => unit.traits));
  const itemIds = new Set(pieces.flatMap(piece => piece.items));
  const available = new Map((snapshot.sourceDate === data.sourceDate ? data.items : []).map(item => [item.id, item]));
  for (const item of snapshot.items) available.set(item.id, item);
  for (const rule of conditions) {
    for (const id of rule.replaces ? [rule.itemId, rule.replaces] : [rule.itemId]) {
      itemIds.add(id);
    }
  }
  for (const id of [...itemIds]) {
    const item = available.get(id) ?? (currentEdition ? itemMap.get(id) : undefined);
    if (item && !available.has(id)) available.set(id, item);
    if (item?.traitId) traitIds.add(item.traitId);
    for (const part of item?.components ?? []) itemIds.add(part);
  }
  const traits = currentEdition
    ? [...traitIds].flatMap(id => traitMap.get(id) ?? snapshot.traits.find(trait => trait.id === id) ?? [])
    : snapshot.traits.filter(trait => traitIds.has(trait.id));
  return { ...section, gameData: { ...snapshot, units, traits,
    items: [...available.values()].filter(item => itemIds.has(item.id)),
  } };
}
export function mediaInSections(sections: Section[]) {
  const result = new Set<string>();
  const visit = (blocks: ContentBlock[]) =>
    blocks.forEach((block) => {
      if (block.imageToken) result.add(block.imageToken);
      if (block.children) visit(block.children);
    });
  sections.forEach((section) => visit(section.blocks));
  return [...result];
}
async function saveDraft(draft: DocumentDraft, expected: string | null) {
  const value = JSON.stringify(draft);
  const result = expected === null
    ? await database().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('document_draft',?)").bind(value).run()
    : await database().prepare("UPDATE settings SET value=? WHERE key='document_draft' AND value=?").bind(value, expected).run();
  if (!result.meta.changes) throw new ApiError(409, "草稿已有新版本，请刷新预览后再试");
}

export async function editGuidePreview(draftId: string, sectionId: string, primaryTeamId: string, summaryBlockId?: string, stageTeamIds?: string[]) {
  const raw = await setting("document_draft");
  const draft: DocumentDraft | null = raw ? JSON.parse(raw) : null;
  if (!draft || draft.id !== draftId) throw new ApiError(409, "草稿已更新，请刷新预览");
  const section = draft.sections.find(entry => entry.id === sectionId);
  if (!section || !sectionTeams(section).some(team => team.id === primaryTeamId)) throw new ApiError(400, "所选阵容不在此章节");
  if (summaryBlockId && !authoredParagraphs(section).some(entry => entry.id === summaryBlockId)) throw new ApiError(400, "摘要段落已移动，请重新选择");
  const memberIds = new Set(sectionTeams(section).map(team => team.id));
  if (stageTeamIds?.some(id => !memberIds.has(id) || id === primaryTeamId)) throw new ApiError(400, "过渡棋盘须属于本章节并与主阵不同");
  section.stageTeamIds = [...new Set(stageTeamIds ?? section.stageTeamIds ?? [])].filter(id => id !== primaryTeamId);
  section.primaryTeamId = primaryTeamId;
  if (summaryBlockId) section.summaryBlockId = summaryBlockId; else delete section.summaryBlockId;
  draft.id = crypto.randomUUID();
  await saveDraft(draft, raw);
}

export async function synchronizeDocument() {
  const raw = await setting("document_draft");
  const previous: DocumentDraft | null = raw ? JSON.parse(raw) : await livePublication();
  const doc = await readDocument();
  const map = new Map(doc.blocks.map((block) => [block.block_id, block]));
  const warnings = new Set<string>();
  const normalize = (id: string, depth = 0): ContentBlock => {
    const block = map.get(id);
    if (!block || depth > 20) {
      warnings.add("有无法解析的嵌套内容");
      return {
        id,
        type: "unsupported",
        text: "此内容暂无法显示，请在飞书中查看",
      };
    }
    const common = {
      id,
      ...(block.children?.length
        ? {
            children: block.children.map((child) =>
              normalize(child, depth + 1),
            ),
          }
        : {}),
    };
    const textKeys: Record<number, string> = {
      2: "text",
      12: "bullet",
      13: "ordered",
      14: "code",
      15: "quote",
      17: "todo",
    };
    const textKey =
      block.block_type >= 3 && block.block_type <= 11
        ? `heading${block.block_type - 2}`
        : textKeys[block.block_type];
    if (textKey)
      return {
        ...common,
        type: textKey.startsWith("heading")
          ? "heading"
          : block.block_type === 17
            ? "text"
            : (textKey as ContentBlock["type"]),
        elements: block[textKey]?.elements ?? [],
        level: block.block_type - 2,
        text: blockText(block),
      };
    if (block.block_type === 27 && block.image?.token)
      return { ...common, type: "image", imageToken: block.image.token };
    if (block.block_type === 19) return { ...common, type: "quote" };
    if (block.block_type === 22) return { ...common, type: "divider" };
    if ([24, 25, 31, 32].includes(block.block_type))
      return {
        ...common,
        type: (
          { 24: "columns", 25: "column", 31: "table", 32: "cell" } as const
        )[block.block_type as 24 | 25 | 31 | 32],
        columnCount: block.table?.property?.column_size,
      };
    warnings.add(`未支持飞书块类型 ${block.block_type}`);
    return {
      ...common,
      type: "unsupported",
      text: `暂不支持此内容（类型 ${block.block_type}），请在飞书中查看`,
    };
  };
  const root = map.get(documentId());
  const ordered = (
    root?.children ??
    doc.blocks
      .filter((block) => block.parent_id === documentId())
      .map((block) => block.block_id)
  )
    .map((id) => map.get(id)!)
    .filter(Boolean);
  const sections = splitSections(ordered.map(block => ({
    id: block.block_id,
    level: block.block_type >= 3 && block.block_type <= 11 ? block.block_type - 2 : undefined,
    title: blockText(block),
    content: normalize(block.block_id),
  })));
  const bindingRows = await database()
    .prepare("SELECT settings.value, teams.body FROM teams JOIN settings ON settings.key='binding:' || teams.id")
    .all<{ value: string; body: string }>();
  const bindings: { sectionId: string; textId: string; imageId: string; team: Team }[] = [];
  for (const row of bindingRows.results) {
    const binding = JSON.parse(row.value);
    const team = JSON.parse(row.body) as Team;
    if (binding.team) bindings.push(team.conditions === undefined
      ? binding
      : { ...binding, team: { ...binding.team, conditions: team.conditions } });
  }
  const sectionIssues: NonNullable<DocumentDraft["sectionIssues"]> = [];
  attachBoundRegions(sections, bindings, issue => sectionIssues.push(issue)).forEach(warning => warnings.add(warning));
  const liveBlockIds = new Set(map.keys());
  for (const section of sections) {
    const prior = previous?.sections.find(entry => entry.id === section.id);
    includeWebDetails(section, liveBlockIds, prior?.summaryBlockId);
    const currentTeams = sectionTeams(section);
    if (prior?.primaryTeamId && currentTeams.some(team => team.id === prior.primaryTeamId)) section.primaryTeamId = prior.primaryTeamId;
    const known = new Set(prior ? sectionTeams(prior).map(team => team.id) : []);
    const configured = (prior?.stageTeamIds ?? []).filter(id => currentTeams.some(team => team.id === id));
    const addedStages = currentTeams.filter(team => team.sectionId === section.id && team.boardRole === "stage" && !known.has(team.id)).map(team => team.id);
    const stages = [...configured, ...addedStages].filter(id => id !== (section.primaryTeamId ?? section.team?.id));
    if (stages.length || prior?.stageTeamIds) section.stageTeamIds = stages;
    if (prior?.summaryBlockId && authoredParagraphs(section).some(block => block.id === prior.summaryBlockId)) section.summaryBlockId = prior.summaryBlockId;
  }
  const media = mediaInSections(sections);
  for (let start = 0; start < media.length; start += 4) {
    await Promise.all(media.slice(start, start + 4).map(cacheMedia));
  }
  if ((await documentInfo()).revision_id !== doc.revision_id)
    throw new ApiError(409, "读取期间飞书文档发生变化，请重新同步");
  const draft: DocumentDraft = {
    id: crypto.randomUUID(),
    title: doc.title,
    revision: doc.revision_id,
    syncedAt: new Date().toISOString(),
    sections: sections.map((section) => withGameData(section, season)),
    media,
    warnings: [...warnings],
    sectionIssues,
    season,
  };
  await saveDraft(draft, raw);
  return draft;
}
export async function publishSections(
  draftId: string,
  sectionIds: string[],
  removeIds: string[],
) {
  const draft = await draftDocument();
  if (!draft || draft.id !== draftId)
    throw new ApiError(409, "预览已更新，请重新检查后发布");
  if ((await documentInfo()).revision_id !== draft.revision)
    throw new ApiError(409, "飞书文档已更新，请先重新同步和预览");
  if (!sectionIds.length && !removeIds.length)
    throw new ApiError(400, "请选择要发布的章节");
  if (
    sectionIds.some(
      (id) => !draft.sections.some(section => section.id === id && readableSection(section) && !isEditorialSection(section)),
    )
  )
    throw new ApiError(400, "章节不存在");
  if (!sameEdition(season.id, draft.season.id) &&
      draft.sections.some(section => sectionIds.includes(section.id) && isVersionUpdate(section))) {
    throw new ApiError(409, "版本简报的赛季或服务器与本站不同，请重新同步。");
  }
  const previous = await livePublication();
  const selected = new Set(sectionIds);
  const combined = sectionsAfterPartialPublish(previous?.sections ?? [], draft.sections, sectionIds, removeIds)
    .map(section => {
      if (selected.has(section.id)) return isVersionUpdate(section) ? { ...section, updateEdition: draft.season.id } : section;
      return isVersionUpdate(section)
        ? { ...section, updateEdition: section.updateEdition ?? previous?.season.id ?? draft.season.id }
        : withGameData(section, previous?.season ?? draft.season);
    });
  const duplicate = duplicatePublishedTeam(combined);
  if (duplicate) throw new ApiError(409, duplicate);
  if (selected.has("introduction")) {
    const { issues } = getPublishedPatchRecommendations(combined, currentPatch.seasonId, currentPatch.build, currentPatch.effectiveAt);
    if (issues.length) throw new ApiError(400, issues.join(" "));
  }
  combined.sort(
    (a, b) =>
      draft.sections.findIndex((section) => section.id === a.id) -
      draft.sections.findIndex((section) => section.id === b.id),
  );
  const publication: Publication = {
    ...draft,
    id: crypto.randomUUID(),
    sections: combined,
    media: mediaInSections(combined),
    publishedAt: new Date().toISOString(),
    previousId: previous?.id,
  };
  const boardLayouts = publishedBoardLayouts(combined, previous?.boardLayouts);
  if (boardLayouts.length) publication.boardLayouts = boardLayouts;
  const boardEdits = publishedBoardEdits(combined, previous?.boardEdits);
  if (boardEdits.length) publication.boardEdits = boardEdits;
  const boardOverrides = previous?.boardOverrides?.filter(edit => combined.some(section => section.id === edit.sectionId));
  if (boardOverrides?.length) publication.boardOverrides = boardOverrides;
  await installPublication(publication, draftId);
  return publication;
}

export async function installPublication(publication: PublicationRecord, draftId?: string) {
  const db = database();
  const previousId = publication.previousId ?? null;
  const currentId = await publishedSnapshotId();
  const expectedPreviousId = currentId === null && previousId === (await bundlePreviewSnapshot()).id ? null : previousId;
  const [inserted] = await db.batch([
    db.prepare("INSERT INTO snapshots (id,body,created_at) SELECT ?,?,? WHERE (SELECT value FROM settings WHERE key='published_id') IS ? AND (? IS NULL OR json_extract((SELECT value FROM settings WHERE key='document_draft'),'$.id')=?)")
      .bind(publication.id, JSON.stringify(publication), publication.publishedAt, expectedPreviousId, draftId ?? null, draftId ?? null),
    db.prepare("INSERT INTO settings (key,value) SELECT 'published_id',id FROM snapshots WHERE id=? ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(publication.id),
  ]);
  if (!inserted.meta.changes) throw new ApiError(409, "发布内容已更新，请刷新预览后再发布");
  dbPublicGuideCache = null;
}
