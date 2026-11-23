import type { PosterFormat } from "./poster.ts";

function configuredFeishuDocument() {
  const configured = process.env.NEXT_PUBLIC_FEISHU_DOCUMENT_URL;
  if (!configured) return;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || !/(^|\.)feishu\.cn$/.test(url.hostname) ||
      url.username || url.password || !/^\/(docx|wiki)\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) return;
    return url.origin + url.pathname;
  } catch {
    return;
  }
}
export const FEISHU_DOCUMENT = configuredFeishuDocument();
export function feishuSection(id?: string) {
  return FEISHU_DOCUMENT ? FEISHU_DOCUMENT + (id ? "#" + encodeURIComponent(id) : "") : undefined;
}
export const ownerEditorPath = "/editor/owner";
export function editorLink(teamId: string) { return ownerEditorPath + "?team=" + encodeURIComponent(teamId); }

export type PosterShare = { format?: PosterFormat; stageIds?: string[] };

export function readPosterShare(format: unknown, stages: unknown): PosterShare {
  return {
    format: format === "quick" || format === "full" ? format : undefined,
    stageIds: typeof stages === "string" ? stages.split(",").filter(Boolean) : undefined,
  };
}

export function posterShareLink(boardLink: string, format: PosterFormat, stageIds?: string[]) {
  const [path, search] = boardLink.split("?");
  const params = new URLSearchParams(search);
  params.set("poster", "1");
  params.set("posterFormat", format);
  if (stageIds !== undefined) params.set("posterStages", stageIds.join(","));
  return path + "?" + params;
}

const emblemPrefix = "emblem-";
export function emblemItemId(traitId: string) { return emblemPrefix + traitId; }
export function emblemLink(traitId?: string, unitId?: string, excludedUnitId?: string) {
  const params = new URLSearchParams({
    ...(traitId ? { trait: traitId } : {}),
    ...(unitId ? { unit: unitId } : {}),
    ...(excludedUnitId ? { exclude: excludedUnitId } : {}),
  });
  return "/emblems" + (params.size ? "?" + params : "");
}
export function itemLink(itemId: string, unitId?: string, from?: string) {
  if (itemId.startsWith(emblemPrefix)) return emblemLink(itemId.slice(emblemPrefix.length), unitId);
  return "/items?" + new URLSearchParams({ item: itemId, ...(unitId ? { unit: unitId } : {}), ...(from ? { from } : {}) });
}

const itemLibraryFilters = new Set(["item", "trait", "unit", "wearer", "view", "q", "order", "exclude"]);

export function validItemLibraryReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/(?:items|emblems)(?:\?|$)/.test(value) || /[\r\n\t\\]/.test(value)) return;
  const url = new URL(value, "https://tft.local");
  const keys = [...url.searchParams.keys()];
  if ((url.pathname === "/items" || url.pathname === "/emblems") && !url.hash && keys.length === new Set(keys).size &&
    keys.every(key => itemLibraryFilters.has(key))) return value;
}

export function itemGuideOrigin(value: unknown) {
  if (typeof value !== "string" || value.length > 1800 || /[\r\n\t\\]/.test(value)) return;
  const sectionId = /^\/guides\/([\w-]+)(?:\?|$)/.exec(value)?.[1];
  if (!sectionId) return;
  const url = new URL(value, "https://tft.local");
  if (url.pathname !== "/guides/" + sectionId || url.hash) return;
  const teamId = url.searchParams.get("team");
  if (!teamId || !/^[\w-]+$/.test(teamId)) return;
  return { href: value, sectionId, teamId };
}
export function manageLink(sectionId?: string) { return "/manage" + (sectionId ? "?section=" + encodeURIComponent(sectionId) : ""); }
