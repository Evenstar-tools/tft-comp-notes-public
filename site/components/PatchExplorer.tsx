"use client";

import { Fragment, useEffect, useState } from "react";
import { Check, Link, Search } from "lucide-react";
import { unitMap } from "@/data";
import { guideLink } from "@/domain/guide-reading";
import { findPatchObjects, type PatchReference } from "@/domain/patch-reference";
import { versionUpdateLink } from "@/domain/version-updates";

export function PatchExplorer({ patch, guides, icons, initialQuery, initialCategory }: {
  patch: PatchReference;
  guides: Record<string, string>;
  icons: Record<string, string>;
  initialQuery: string;
  initialCategory: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(Object.hasOwn(patch.groups, initialCategory) ? initialCategory : "");
  const [copied, setCopied] = useState<{ anchor: string; fallback?: string }>();
  const results = findPatchObjects(patch, category, query, unitMap);
  const returnTo = versionUpdateLink(patch.id, { query, category, anchor: "patch-changes" });
  useEffect(() => {
    if (!window.location.hash.startsWith("#change-")) return;
    try {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    } catch {
      // Malformed fragments have no matching change.
    }
  }, [patch.id]);
  function filter(nextQuery: string, nextCategory: string) {
    setQuery(nextQuery);
    setCategory(nextCategory);
    setCopied(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("entry", patch.id);
    for (const [key, value] of [["q", nextQuery], ["category", nextCategory]]) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.hash.startsWith("#change-")) url.hash = "";
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }
  async function copyChange(anchor: string, group: string) {
    const path = versionUpdateLink(patch.id, { query, category: group, anchor: encodeURIComponent(anchor) });
    const link = new URL(path, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(link);
      setCopied({ anchor });
    } catch {
      setCopied({ anchor, fallback: link });
    }
  }
  return <section className="patch-explorer" id="patch-changes" aria-labelledby="patch-changes-title">
    <div className="patch-search-row">
      <h3 id="patch-changes-title">改动明细 <small aria-live="polite">{results.length} 项</small></h3>
      <label className="patch-search"><Search size={16} aria-hidden="true" />
        <input type="search" aria-label="搜索本版改动" placeholder="搜棋子、羁绊、海克斯或装备" value={query}
          onChange={event => filter(event.target.value, category)} /></label>
    </div>
    <div className="patch-filters" role="group" aria-label="改动分类">
      {["", ...Object.keys(patch.groups)].map(value => <button key={value} type="button" aria-pressed={category === value}
        onClick={() => filter(query, value)}>{value || "全部"}</button>)}
    </div>
    {results.length === 0 && <div className="patch-empty">
      <p>没有匹配的改动</p><button className="button secondary" type="button" onClick={() => filter("", "")}>清除筛选</button>
    </div>}
    <div className="patch-objects">{results.map(({ category: group, object }, index) => {
      const links = object.guides?.filter(id => guides[id]);
      return <Fragment key={group + object.name}>
        {!category && results[index - 1]?.category !== group && <h4 className="patch-group">{group}</h4>}
        <article className="patch-object" aria-label={object.name}>
          <header>
            {icons[group + object.name] && <img src={icons[group + object.name]} className={group === "羁绊" ? "patch-trait-icon" : undefined}
              width={36} height={36} loading="lazy" alt="" onError={event => { event.currentTarget.hidden = true; }} />}
            <strong>{object.name}</strong>
          </header>
          <div className="patch-values">
            {object.values.map(([label, before, after]) => {
              const anchor = ["change", group, object.unit ?? object.name, label]
                .map(part => part.normalize("NFKC").replace(/\s+/g, "-")).join("-");
              const copiedHere = copied?.anchor === anchor;
              return <div className="patch-value" key={anchor} id={anchor}>
                <span>{label}</span>
                <div className="patch-value-end">
                  <p><span>{before}</span><span aria-label="改为"> → </span><strong>{after}</strong></p>
                  <button type="button" className="patch-copy-change" title="复制此条改动的链接"
                    aria-label={`复制${object.name} · ${label}的链接`} onClick={() => void copyChange(anchor, group)}>
                    {copiedHere && !copied.fallback ? <Check size={15} aria-hidden /> : <Link size={15} aria-hidden />}
                  </button>
                </div>
                {copiedHere && (copied.fallback
                  ? <input className="patch-copy-fallback" aria-label="改动链接" autoFocus readOnly value={copied.fallback}
                      onFocus={event => event.currentTarget.select()} />
                  : <span className="sr-only" role="status">已复制改动链接</span>)}
              </div>;
            })}
            {!!links?.length && <nav className="patch-guides" aria-label={object.name + "相关阵容"}>
              {links.map(id => <a key={id} href={guideLink(id, undefined, returnTo)}>{guides[id]}</a>)}
            </nav>}
          </div>
        </article>
      </Fragment>;
    })}</div>
  </section>;
}
