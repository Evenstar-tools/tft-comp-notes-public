"use client";

import { useLayoutEffect, useRef } from "react";

export function EmblemEntryPosition({ traitId, holderId }: { traitId?: string; holderId?: string }) {
  const entry = useRef({ traitId, holderId });

  useLayoutEffect(() => {
    const { traitId: trait, holderId: holder } = entry.current;
    if (!trait || history.state?.emblemLibraryVisit?.url === location.href) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.name === location.href && navigation.type !== "navigate") return;

    const detail = document.getElementById("wearers-" + trait);
    const row = detail?.closest(".emblem-result")?.querySelector(".emblem-row");
    if (!detail || !row) return;

    const frame = requestAnimationFrame(() => {
      const wearer = holder ? detail.querySelector("tr[data-highlight]")?.getBoundingClientRect() : undefined;
      const headerHeight = document.querySelector(".emblem-column-head")?.getBoundingClientRect().height ?? 0;
      const top = headerHeight + 8;
      const bottom = innerHeight - 16;
      const rowBounds = row.getBoundingClientRect();
      const targetBottom = wearer?.bottom ?? rowBounds.bottom;
      if (rowBounds.top >= top && targetBottom <= bottom) return;
      const fitsTogether = targetBottom - rowBounds.top <= bottom - top;
      const offset = !fitsTogether && wearer ? wearer.top - innerHeight / 3 : rowBounds.top - top;
      window.scrollBy({ top: offset, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return null;
}
