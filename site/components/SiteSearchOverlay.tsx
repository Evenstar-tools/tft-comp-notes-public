"use client";

import { Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { extractPublicGuideIdFromHref } from "@/domain/analytics";
import { requiresSearchSubmit, searchQueryLimit, searchStrategies, type SiteSearchContext } from "@/domain/site-search";
import { rememberGuideEntry, trackSearchResultOpen, trackSearchResults } from "@/lib/analytics";
import { SiteSearchResults, useSiteSearch } from "./SiteSearchResults";

const examples = [
  { label: "我合了羊刀", query: "我合了羊刀" },
  { label: "84 + 八级 + 金克丝", query: "84 + 八级 + 金克丝" },
  { label: "救生员", query: "救生员" },
];
type SearchVisit = { query: string; exclude?: string; top: number; resultTop?: number; href?: string; index?: number;
  includeSeven?: boolean; submission?: { context?: SiteSearchContext; attempt: number } };

export function SiteSearchOverlay({ inlineQuery }: { inlineQuery?: string } = {}) {
  const inline = inlineQuery !== undefined;
  const [visit, setVisit] = useState<SearchVisit | undefined>(() => inline ? { query: inlineQuery, top: 0,
    submission: requiresSearchSubmit(inlineQuery) ? { attempt: 0 } : undefined } : undefined);
  const [isComposing, setIsComposing] = useState(false);
  const open = !!visit;
  const pending = isComposing || (!!visit && !visit.submission && requiresSearchSubmit(visit.query));
  const search = useSiteSearch(visit?.query ?? "", visit?.exclude, undefined, undefined, true,
    { pending, includeSeven: visit?.includeSeven, submission: visit?.submission });
  const priorContext = useRef<SiteSearchContext | undefined>(undefined);
  const attempt = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const restore = useRef<SearchVisit | undefined>(undefined);
  const restoredSearchKey = useRef<string | null>(null);
  const lastReportedSearchKey = useRef<string | null>(null);
  const originTop = useRef(0);
  const composing = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    function readHistory() {
      const saved: SearchVisit | undefined = history.state?.[inline ? "findSearchVisit" : "siteSearchVisit"];
      closing.current = false;
      if (saved) originTop.current = saved.top;
      restore.current = saved;
      restoredSearchKey.current = saved?.query.trim() ? `${saved.query.trim()}\0${saved.exclude ?? ""}` : null;
      if (saved || !inline) setVisit(saved);
    }
    readHistory();
    window.addEventListener("popstate", readHistory);
    window.addEventListener("pageshow", readHistory);
    return () => {
      window.removeEventListener("popstate", readHistory);
      window.removeEventListener("pageshow", readHistory);
    };
  }, [inline]);

  useEffect(() => {
    if (search.phase === "ready" && !search.refreshing) priorContext.current = search.result.context;
  }, [search]);

  useLayoutEffect(() => {
    const layer = dialog.current;
    if (!layer) return;
    if (open && !layer.open) {
      const bottom = trigger.current?.closest("header")?.getBoundingClientRect().bottom ?? 0;
      layer.style.setProperty("--site-search-top", Math.max(bottom + 12, 20) + "px");
      layer.showModal();
      input.current?.focus({ preventScroll: true });
    } else if (!open && layer.open) {
      layer.close();
      trigger.current?.focus({ preventScroll: true });
      window.scrollTo({ top: originTop.current, behavior: "instant" });
    }
  }, [open]);

  useLayoutEffect(() => {
    const saved = restore.current;
    const list = results.current;
    if (!saved || !list || search.phase !== "ready" || search.refreshing || search.result.query !== saved.query.trim()) return;
    restore.current = undefined;
    if (saved.resultTop !== undefined) {
      if (inline) window.scrollTo({ top: saved.resultTop, behavior: "instant" });
      else list.scrollTop = saved.resultTop;
    }
    if (saved.href) {
      const links = Array.from(list.querySelectorAll<HTMLAnchorElement>("a[data-search-result]"));
      const prior = links[saved.index ?? -1];
      const link = prior?.href === saved.href ? prior : links.find(link => link.href === saved.href);
      (link ?? input.current)?.focus({ preventScroll: true });
    }
  }, [inline, search]);

  useEffect(() => {
    if (!open) {
      lastReportedSearchKey.current = null;
      return;
    }
    if (isComposing || composing.current) return;
    const term = visit?.query.trim() ?? "";
    if (!term || search.phase !== "ready" || search.refreshing || search.result.query !== term) return;
    const queryKey = `${term}\0${visit?.exclude ?? ""}`;
    if (restoredSearchKey.current === queryKey) {
      restoredSearchKey.current = null;
      lastReportedSearchKey.current = queryKey;
      return;
    }
    if (lastReportedSearchKey.current === queryKey) return;
    const timer = window.setTimeout(() => {
      if (composing.current || lastReportedSearchKey.current === queryKey) return;
      lastReportedSearchKey.current = queryKey;
      const hasResults = search.result.groups.some(group => group.hits.length > 0);
      trackSearchResults(hasResults ? "has_results" : "no_results", inline ? "find" : "overlay");
    }, 120);
    return () => window.clearTimeout(timer);
  }, [open, inline, isComposing, visit?.query, visit?.exclude, search]);

  function show() {
    if (open) return;
    const next = { query: "", top: window.scrollY };
    originTop.current = next.top;
    priorContext.current = undefined;
    restoredSearchKey.current = null;
    lastReportedSearchKey.current = null;
    history.pushState({ ...history.state, siteSearchVisit: next }, "");
    setVisit(next);
  }

  function close() {
    if (!open || closing.current) return;
    closing.current = true;
    history.back();
  }

  function refine(changes: Partial<SearchVisit>) {
    if (!visit) return;
    restore.current = undefined;
    restoredSearchKey.current = null;
    const next = { ...visit, ...changes, resultTop: undefined, href: undefined, index: undefined };
    const key = inline ? "findSearchVisit" : "siteSearchVisit";
    const url = inline && (next.submission || !requiresSearchSubmit(next.query)) ? "/find" + (next.query.trim() ? "?" + new URLSearchParams({ q: next.query.trim() }) : "") : undefined;
    history.replaceState({ ...history.state, [key]: next }, "", url);
    setVisit(next);
    if (results.current) results.current.scrollTop = 0;
  }

  function changeQuery(query: string) {
    if (!query.trim()) priorContext.current = undefined;
    refine({ query, exclude: undefined, includeSeven: undefined, submission: undefined });
  }

  function submit(query: string) {
    if (!query.trim() || composing.current) return;
    if (query === visit?.query && (search.phase === "loading" || search.phase === "ready" && !search.refreshing)) return;
    refine({ query, exclude: undefined, includeSeven: undefined,
      submission: { context: priorContext.current, attempt: ++attempt.current } });
  }

  function rememberResult(event: MouseEvent<HTMLDivElement>) {
    if (!visit || event.defaultPrevented) return;
    const link = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[data-search-result]");
    if (!link) return;
    const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") ?? []);
    const index = links.indexOf(link);
    const resultType = link.getAttribute("data-search-result-type") || link.getAttribute("href") || "other";
    trackSearchResultOpen({
      resultType,
      positionOneBased: index >= 0 ? index + 1 : 1,
      surface: inline ? "find" : "overlay",
    });
    const guideId = extractPublicGuideIdFromHref(link.getAttribute("href"));
    if (guideId) rememberGuideEntry(guideId, "site_search");

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;
    history.replaceState({ ...history.state, [inline ? "findSearchVisit" : "siteSearchVisit"]: {
      ...visit, href: link.href, index, resultTop: inline ? window.scrollY : results.current?.scrollTop ?? 0,
    } }, "");
  }

  function handleSearchKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.isDefaultPrevented() || event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) return;
    if (event.key === "Escape" && !inline) {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") ?? []);
    if (!links.length) return;
    const index = links.findIndex(link => link === event.target);
    if (event.target !== input.current && index < 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) {
      input.current?.focus({ preventScroll: true });
      return;
    }
    const next = event.key === "ArrowDown" ? Math.min(index + 1, links.length - 1) : index < 0 ? links.length - 1 : index - 1;
    links[next]?.focus();
  }

  const active = search.phase === "ready" ? search.result : undefined;
  const conditions = active?.conditions ?? [];
  const currentContext = active?.context;
  const hasConditions = conditions.length > 1 || Boolean(currentContext?.boardLookup && conditions.length);

  function clearConditions() {
    const base = currentContext?.item || currentContext?.augmentId ? conditions[0] :
      currentContext?.boardLookup?.group ? searchStrategies[currentContext.boardLookup.group] : "";
    priorContext.current = undefined;
    changeQuery(base ?? "");
    input.current?.focus({ preventScroll: true });
  }

  const body = <div className="site-search-inner">
    <form className="site-search-bar" role="search" onSubmit={event => { event.preventDefault(); submit(visit?.query ?? ""); }}>
      <label>
        <Search size={19} aria-hidden />
        <input ref={input} type="search" value={visit?.query ?? ""} maxLength={searchQueryLimit} autoComplete="off"
          aria-label="搜索英雄、阵容、装备与羁绊" placeholder="搜阵容、英雄或装备"
          onChange={event => changeQuery(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }}
          onCompositionStart={() => { composing.current = true; setIsComposing(true); }}
          onCompositionEnd={() => { composing.current = false; setIsComposing(false); }} />
      </label>
      <button type="submit" className="site-search-submit" aria-label="搜索">搜索</button>
      {!inline && <button type="button" aria-label="关闭搜索" title="关闭搜索" onClick={close}><X size={21} aria-hidden /></button>}
    </form>
    <div ref={results} className="site-search-dialog-results" onClickCapture={rememberResult}>
      {hasConditions && <div className="site-search-conditions" aria-label="当前检索条件">
        {conditions.map(condition => <span key={condition}>{condition}</span>)}
        {(conditions.length > 1 || currentContext?.boardLookup && !currentContext.boardLookup.group) &&
          <button type="button" onClick={clearConditions}>清除条件</button>}
      </div>}
      {search.phase === "idle" ? <div className="site-search-examples" aria-label="搜索示例">
        {examples.map(({ label, query }) => <button key={query} type="button" onClick={() => {
          submit(query);
          input.current?.focus({ preventScroll: true });
        }}>{label}</button>)}
      </div> : <SiteSearchResults search={search} onToggleSeven={includeSeven => refine({ includeSeven })} />}
    </div>
  </div>;

  if (inline) return <div className="site-search-page" onKeyDown={handleSearchKeys}>{body}</div>;

  return (
    <>
      <button ref={trigger} className="site-search-trigger" aria-label="站内搜索" title="站内搜索" aria-haspopup="dialog"
        aria-expanded={open} type="button" onClick={show}><Search size={19} aria-hidden /></button>
      <dialog ref={dialog} className="site-search-dialog" aria-label="站内搜索"
        onCancel={event => { event.preventDefault(); if (!composing.current) close(); }}
        onClick={event => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={handleSearchKeys}>
        {body}
      </dialog>
    </>
  );
}
