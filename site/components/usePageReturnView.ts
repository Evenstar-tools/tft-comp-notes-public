import { useEffect, useLayoutEffect, useState } from "react";

type Visit<T> = { url: string; view: T; top: number; panels: number[]; left?: number[]; link?: string };
const noPanels: readonly string[] = [];

/** Keeps a library's filters and scroll positions on the history entry that owns them. */
export function usePageReturnView<T>(key: string | undefined, initial: T, panels: readonly string[] = noPanels) {
  const [view, setView] = useState(initial);
  const [visit, setVisit] = useState<Visit<T>>();
  useLayoutEffect(() => {
    if (!key) return;
    const saved: Visit<T> | undefined = history.state?.[key];
    if (saved?.url === location.href) {
      setView(saved.view);
      setVisit(saved);
    }
  }, [key]);

  useLayoutEffect(() => {
    if (!visit) return;
    // The restored sort and filters must be on screen before positioning the lists.
    function position() {
      if (!visit) return;
      for (const [index, selector] of panels.entries()) {
        const panel = document.querySelector<HTMLElement>(selector);
        if (panel) {
          panel.scrollTop = visit.panels[index] ?? 0;
          if (visit.left?.[index] !== undefined) panel.scrollLeft = visit.left[index];
        }
      }
      window.scrollTo({ top: visit.top, behavior: "instant" });
    }
    if (visit.link) Array.from(document.links).find(link => link.href === visit.link)?.focus({ preventScroll: true });
    position();
    const frame = requestAnimationFrame(position);
    return () => cancelAnimationFrame(frame);
  }, [visit, panels]);

  useEffect(() => {
    if (!key) return;
    const stateKey = key;
    function remember(link?: string) {
      const nodes = panels.map(selector => document.querySelector(selector));
      const saved: Visit<T> = { url: location.href, view, top: scrollY, link,
        panels: nodes.map(panel => panel?.scrollTop ?? 0), left: nodes.map(panel => panel?.scrollLeft ?? 0) };
      history.replaceState({ ...history.state, [stateKey]: saved }, "");
    }
    function leave(event: MouseEvent) {
      const link = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[href]");
      if (link && link.target !== "_blank" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) remember(link.href);
    }
    const hide = () => remember(document.activeElement?.closest("a")?.href);
    document.addEventListener("click", leave, true);
    window.addEventListener("pagehide", hide);
    return () => {
      document.removeEventListener("click", leave, true);
      window.removeEventListener("pagehide", hide);
    };
  }, [key, view, panels]);
  return [view, setView] as const;
}
