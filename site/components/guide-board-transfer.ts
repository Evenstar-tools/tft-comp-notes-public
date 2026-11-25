import type { Team, TeamCondition } from "@/domain/types";

export const guideBoardTransferKey = "tft-guide-board-transfer-v1";

export type GuideBoardTarget = { publicationId: string; sectionId: string; teamId: string };
export type GuideBoardSource = {
  draftId: string; title: string; href: string; target?: GuideBoardTarget; published?: string; sharedConditions?: TeamCondition[];
};

function guideHref(href: unknown): href is string {
  return typeof href === "string" && /^\/guides\/[\w-]+(?:\?|$)/.test(href);
}

export function readGuideBoardTransfer(id: string): { team: Team; title: string; href: string; focusUnit?: string; target?: GuideBoardTarget; sharedConditions?: TeamCondition[] } | null {
  try {
    const raw = sessionStorage.getItem(guideBoardTransferKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.id !== id) return null;
    const { team, title, href, focusUnit, target, sharedConditions } = payload;
    if (!team || !Array.isArray(team.pieces) || !team.pieces.length || typeof title !== "string" ||
        !guideHref(href)) return null;
    return { team, title, href, target, sharedConditions: Array.isArray(sharedConditions) ? sharedConditions : undefined,
      focusUnit: typeof focusUnit === "string" ? focusUnit : undefined };
  } catch {
    return null;
  }
}

const sourceKey = "tft-guide-board-source-v1:";

export function readGuideBoardSource(draftId: string): GuideBoardSource | null {
  try {
    const source = JSON.parse(sessionStorage.getItem(sourceKey + draftId) ?? "null");
    return source?.draftId === draftId && typeof source.title === "string" && guideHref(source.href) ? source : null;
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
