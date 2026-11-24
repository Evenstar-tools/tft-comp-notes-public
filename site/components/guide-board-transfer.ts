import type { Team } from "@/domain/types";

export const guideBoardTransferKey = "tft-guide-board-transfer-v1";

export function readGuideBoardTransfer(id: string): { team: Team; title: string; href: string; focusUnit?: string } | null {
  try {
    const raw = sessionStorage.getItem(guideBoardTransferKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.id !== id) return null;
    const { team, title, href, focusUnit } = payload;
    if (!team || !Array.isArray(team.pieces) || !team.pieces.length || typeof title !== "string" ||
        typeof href !== "string" || !/^\/guides\/[\w-]+(?:\?|$)/.test(href)) return null;
    return { team, title, href, focusUnit: typeof focusUnit === "string" ? focusUnit : undefined };
  } catch {
    return null;
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
