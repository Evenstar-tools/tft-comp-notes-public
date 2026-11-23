import type { DocumentDraft, Section } from "./document";

export const updatesCategory = "版本更新";
export const officialPatchNotes = "https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/";

export function isOfficialEdition(edition: string) {
  return /^s\d+-live(?:-|$)/i.test(edition);
}

export function editionScope(edition: string) {
  return edition.toLowerCase().match(/^(s\d+-(?:live|pbe))(?:-|$)/)?.[1];
}

export function sameEdition(first: string, second: string) {
  const scope = editionScope(first);
  return Boolean(scope && scope === editionScope(second));
}

/** A mixed-use introduction remains ordinary prose. Only dedicated, filled callouts are patch notes. */
export function isPatchIntroduction(section: Section) {
  if (section.id !== "introduction") return false;
  const blocks = section.blocks.filter(block => block.type !== "divider" && (block.type !== "text" || block.text?.trim()));
  return blocks.length > 0 && blocks.every(block => block.type === "quote" &&
    ["更新预览", "环境观察"].includes(block.children?.[0]?.text?.trim() ?? "")) &&
    blocks.some(block => block.children?.slice(1).some(child => child.text?.trim() && !/^[（(]?待编辑[)）]?$/.test(child.text.trim())));
}

export function isVersionUpdate(section: Section) {
  return section.category === updatesCategory || isPatchIntroduction(section);
}

export function versionUpdateLink(sectionId: string, { query, category, anchor }: {
  query?: string;
  category?: string;
  anchor?: string;
} = {}) {
  const params = new URLSearchParams({ entry: sectionId });
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  return "/updates?" + params + (anchor ? "#" + anchor : "");
}

export function publishedVersionUpdates(edition: string, publication: DocumentDraft | null) {
  if (!publication || !sameEdition(edition, publication.season.id)) return [];
  return publication.sections.filter(section => ((section.category === updatesCategory && section.kind === "guide") || isPatchIntroduction(section)) &&
    section.blocks.length && sameEdition(edition, section.updateEdition ?? publication.season.id));
}
