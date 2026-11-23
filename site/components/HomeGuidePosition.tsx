"use client";

import { useLayoutEffect } from "react";
import { homeCardTarget, validHomeReturn } from "@/lib/home-position";

const storageKey = "tft-home-position";
type Position = { source: string; from: string; top: number; scroll: number; folds: Record<string, boolean> };

function currentPage() {
  return location.pathname + location.search + location.hash;
}

function pageFolds() {
  return document.querySelectorAll<HTMLDetailsElement>(".home-guide-library details[data-home-fold]");
}

function rememberCard(card: HTMLElement, from: string) {
  const position: Position = {
    source: currentPage(), from, top: card.getBoundingClientRect().top, scroll: window.scrollY,
    folds: Object.fromEntries(Array.from(pageFolds(), fold => [fold.dataset.homeFold!, fold.open])),
  };
  history.replaceState({ ...history.state, homeGuideVisit: position }, "");
  try { sessionStorage.setItem(storageKey, JSON.stringify(position)); } catch {}
}

function savedPosition(): Position | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (value && validHomeReturn(value.from) && Number.isFinite(value.top)) return value;
  } catch {
    // An unavailable session still supports return anchors.
  }
}

export function HomeGuidePosition() {
  useLayoutEffect(() => {
    function remember(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[data-home-board], a.guide-result-main");
      const card = link?.closest<HTMLElement>("[id^='guide-card-']");
      if (!link || !card) return;
      const from = validHomeReturn(new URL(link.href).searchParams.get("from"));
      if (!from) return;
      rememberCard(card, from);
    }

    function rememberDeparture() {
      const entry: Position | undefined = history.state?.homeGuideVisit;
      if (entry?.source !== currentPage()) return;
      const target = homeCardTarget(new URL(entry.from, location.origin).hash);
      const card = target && document.getElementById(target.card);
      if (card) rememberCard(card, entry.from);
    }

    function restore() {
      const current = currentPage();
      const entry: Position | undefined = history.state?.homeGuideVisit;
      // The guide's own return link creates a fresh entry with an explicit card anchor.
      const explicit = location.hash && document.referrer.startsWith(location.origin + "/guides/") ? savedPosition() : undefined;
      const saved = entry?.source === current ? entry : explicit?.from === current ? explicit : undefined;
      const target = homeCardTarget(saved ? new URL(saved.from, location.origin).hash : location.hash);
      const card = target && document.getElementById(target.card);
      if (!card) return;
      if (saved?.folds) {
        for (const fold of pageFolds()) {
          const value = saved.folds[fold.dataset.homeFold!];
          if (typeof value === "boolean") fold.open = value;
        }
      }
      const link = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[data-home-board]"))
        .find(anchor => anchor.dataset.homeBoard === target.board) ?? card.querySelector<HTMLAnchorElement>("a.guide-result-main");
      let focus: HTMLElement | null = link;
      for (let fold = link?.closest("details"); fold; fold = fold.parentElement?.closest("details")) {
        if (!saved?.folds) fold.open = true;
        else if (!fold.open) focus = fold.querySelector("summary");
      }
      if (saved && card.closest("details:not([open])") && Number.isFinite(saved.scroll)) window.scrollTo({ top: saved.scroll, behavior: "instant" });
      else if (saved) window.scrollBy({ top: card.getBoundingClientRect().top - saved.top, behavior: "instant" });
      else card.scrollIntoView({ block: "start" });
      focus?.focus({ preventScroll: true });
    }

    let frame = requestAnimationFrame(restore);
    const afterNavigation = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(restore);
    };
    const onShow = (event: PageTransitionEvent) => { if (event.persisted) afterNavigation(); };

    document.addEventListener("click", remember, true);
    window.addEventListener("pagehide", rememberDeparture);
    window.addEventListener("pageshow", onShow);
    window.addEventListener("popstate", afterNavigation);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", remember, true);
      window.removeEventListener("pagehide", rememberDeparture);
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("popstate", afterNavigation);
    };
  }, []);
  return null;
}
