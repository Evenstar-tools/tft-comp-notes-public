import type { BoardSetup, SourceGuide, Team, TeamCondition } from "@/domain/types";

export const guideBoardTransferKey = "tft-guide-board-transfer-v1";

export type GuideBoardTarget = { publicationId: string; sectionId: string; teamId: string };
export type GuideBoardSource = {
  draftId: string; title: string; href: string; target?: GuideBoardTarget; published?: string; sharedConditions?: TeamCondition[];
  sourceGuide?: SourceGuide; officialBoard?: BoardSetup; restoredPlayerTeam?: boolean;
};

function guideHref(href: unknown): href is string {
  return typeof href === "string" && /^\/guides\/[\w-]+(?:\?[^\r\n]*)?$/.test(href);
}

export function checkedSourceGuide(value: unknown): SourceGuide | undefined {
  if (!value || typeof value !== "object") return;
  const { sectionId, teamId, href, title } = value as Partial<SourceGuide>;
  if (typeof sectionId === "string" && sectionId.trim() && typeof teamId === "string" && teamId.trim() &&
      guideHref(href) && typeof title === "string" && title.trim()) {
    return { sectionId, teamId, href, title };
  }
}

export function readGuideBoardTransfer(id: string): { team: Team; title: string; href: string; focusUnit?: string; target?: GuideBoardTarget; sharedConditions?: TeamCondition[]; sourceGuide?: SourceGuide } | null {
  try {
    const raw = sessionStorage.getItem(guideBoardTransferKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.id !== id) return null;
    const { team, title, href, focusUnit, target, sharedConditions, sourceGuide } = payload;
    if (!team || !Array.isArray(team.pieces) || !team.pieces.length || typeof title !== "string" ||
        !guideHref(href)) return null;
    return { team, title, href, target, sourceGuide: checkedSourceGuide(sourceGuide),
      sharedConditions: Array.isArray(sharedConditions) ? sharedConditions : undefined,
      focusUnit: typeof focusUnit === "string" ? focusUnit : undefined };
  } catch {
    return null;
  }
}

const sourceKey = "tft-guide-board-source-v1:";

export function checkedGuideBoardSource(value: unknown, draftId: string): GuideBoardSource | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<GuideBoardSource>;
  if (source.draftId !== draftId || typeof source.title !== "string" || !guideHref(source.href)) return null;
  return { ...source, draftId, title: source.title, href: source.href, sourceGuide: checkedSourceGuide(source.sourceGuide) };
}

export function readGuideBoardSource(draftId: string): GuideBoardSource | null {
  try {
    return checkedGuideBoardSource(JSON.parse(sessionStorage.getItem(sourceKey + draftId) ?? "null"), draftId);
  } catch {
    return null;
  }
}

export function storeGuideBoardSource(source: GuideBoardSource) {
  try {
    sessionStorage.setItem(sourceKey + source.draftId, JSON.stringify(source));
  } catch {
    // The open editor still has the source in memory.
  }
}

export function clearGuideBoardTransfer(id: string) {
  try {
    const raw = sessionStorage.getItem(guideBoardTransferKey);
    if (raw && JSON.parse(raw)?.id === id) sessionStorage.removeItem(guideBoardTransferKey);
  } catch {
    // Leave any newer transfer untouched.
  }
}
