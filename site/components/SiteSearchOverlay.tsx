"use client";

import { Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { SiteSearchResults, useSiteSearch } from "./SiteSearchResults";

const examples = [
  { label: "鱼骨头给谁", query: "鱼骨头给谁？" },
  { label: "五杀转阵容", query: "五杀转能玩什么？" },
  { label: "K/DA 转阵容", query: "K/DA 转能玩什么？" },
];
type SearchVisit = { query: string; exclude?: string; top: number; resultTop?: number; href?: string };

export function SiteSearchOverlay() {
  const [visit, setVisit] = useState<SearchVisit>();
  const open = !!visit;
  const search = useSiteSearch(visit?.query ?? "", visit?.exclude);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const restore = useRef<SearchVisit | undefined>(undefined);
  const originTop = useRef(0);
  const composing = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    function readHistory() {
      const saved: SearchVisit | undefined = history.state?.siteSearchVisit;
      closing.current = false;
      if (saved) originTop.current = saved.top;
      restore.current = saved;
      setVisit(saved);
    }
    readHistory();
    window.addEventListener("popstate", readHistory);
    window.addEventListener("pageshow", readHistory);
    return () => {
      window.removeEventListener("popstate", readHistory);
      window.removeEventListener("pageshow", readHistory);
    };
  }, []);

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
    if (!saved || !list || search.phase !== "ready" || search.result?.query !== saved.query.trim()) return;
    restore.current = undefined;
    if (saved.resultTop !== undefined) list.scrollTop = saved.resultTop;
    if (saved.href) Array.from(list.querySelectorAll<HTMLAnchorElement>("[data-search-result]"))
      .find(link => link.href === saved.href)?.focus({ preventScroll: true });
  }, [search]);

  function show() {
    if (open) return;
    const next = { query: "", top: window.scrollY };
    originTop.current = next.top;
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
    const next = { ...visit, ...changes, resultTop: undefined, href: undefined };
    history.replaceState({ ...history.state, siteSearchVisit: next }, "");
    setVisit(next);
    if (results.current) results.current.scrollTop = 0;
  }

  function rememberResult(event: MouseEvent<HTMLDivElement>) {
    if (!visit || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[data-search-result]");
    if (!link || (link.target && link.target !== "_self")) return;
    history.replaceState({ ...history.state, siteSearchVisit: {
      ...visit, href: link.href, resultTop: results.current?.scrollTop ?? 0,
    } }, "");
  }

  function handleSearchKeys(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.isDefaultPrevented() || event.nativeEvent.isComposing || event.keyCode === 229 || composing.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    const links = Array.from(results.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") ?? []);
    if (!links.length) return;
    if (event.key === "Enter") {
      if (event.target === input.current) {
        event.preventDefault();
        const primary = links.find(link => link.hasAttribute("data-search-primary"));
        (primary ?? links[0]).click();
      }
      return;
    }
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

  return (
    <>
      <button ref={trigger} className="site-search-trigger" aria-label="站内搜索" title="站内搜索" aria-haspopup="dialog"
        aria-expanded={open} type="button" onClick={show}><Search size={19} aria-hidden /></button>
      <dialog ref={dialog} className="site-search-dialog" aria-label="站内搜索"
        onCancel={event => { event.preventDefault(); if (!composing.current) close(); }}
        onClick={event => { if (event.target === event.currentTarget) close(); }}
        onKeyDown={handleSearchKeys}>
        <div className="site-search-inner">
          <div className="site-search-bar">
            <label>
              <Search size={19} aria-hidden />
              <input ref={input} type="search" value={visit?.query ?? ""} maxLength={100} autoComplete="off"
                aria-label="搜索英雄、阵容、装备与羁绊" placeholder="搜阵容、英雄或装备"
                onChange={event => refine({ query: event.target.value, exclude: undefined })}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={() => { composing.current = false; }} />
            </label>
            <button type="button" aria-label="关闭搜索" title="关闭搜索" onClick={close}><X size={21} aria-hidden /></button>
          </div>
          <div ref={results} className="site-search-dialog-results" onClickCapture={rememberResult}>
            {search.phase === "idle" ? <div className="site-search-examples" aria-label="搜索示例">
              {examples.map(({ label, query }) => <button key={query} type="button" onClick={() => {
                refine({ query, exclude: undefined });
                input.current?.focus({ preventScroll: true });
              }}>{label}</button>)}
            </div> : <SiteSearchResults search={search} onToggleExclusion={exclude => refine({ exclude })} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
