"use client";

import { ChevronDown, ClipboardList, Moon, PanelsTopLeft, SquarePen, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { currentGuideNavigation, guideNavigationChange } from "@/domain/guide-navigation";
import { ownerEditorPath } from "@/domain/links";
import { useOwnerSession } from "./OwnerSession";
import { SiteSearchOverlay } from "./SiteSearchOverlay";

const referenceLinks = [
  ["/heroes", "英雄"], ["/traits", "羁绊"], ["/augments", "海克斯"],
  ["/items", "装备"], ["/emblems", "转职"], ["/updates", "更新"],
] as const;
const referenceGroups = [
  { label: "棋子与羁绊", links: [referenceLinks[0], referenceLinks[1], ["/heroes?view=grid", "羁绊网"]] },
  { label: "装备与强化", links: [referenceLinks[3], referenceLinks[4], referenceLinks[2]] },
];

function subscribeToGuideNavigation(listener: () => void) {
  window.addEventListener(guideNavigationChange, listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener(guideNavigationChange, listener);
    window.removeEventListener("popstate", listener);
  };
}
const guideQuery = () => window.location.search;
const initialGuideQuery = () => "";

function ThemeToggle() {
  const { setTheme } = useTheme();
  function toggle() {
    setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }
  return (
    <button type="button" className="theme-toggle" onClick={toggle} title="切换明暗主题">
      <span className="sr-only">切换到</span>
      <span className="to-dark"><Moon size={17} aria-hidden /><span>深色</span></span>
      <span className="to-light"><Sun size={17} aria-hidden /><span>浅色</span></span>
    </button>
  );
}

export function SiteNav() {
  const { session } = useOwnerSession();
  const ownerAccessLabel = session && !session.signedIn ? "站主登录" : "站主工作区";
  const pathname = usePathname() ?? "/";
  const search = useSyncExternalStore(subscribeToGuideNavigation, guideQuery, initialGuideQuery);
  const current = { pathname, search };
  const navigation = useRef<HTMLElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      navigation.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach(menu => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  function isCurrent(href: string) {
    if (href === "/") return pathname === "/" || pathname === "/find" || pathname.startsWith("/guides/");
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <nav ref={navigation} className="section-nav task-nav" aria-label="主要导航" onKeyDown={event => {
        if (event.key !== "Escape") return;
        const menu = (event.target as HTMLElement).closest<HTMLDetailsElement>("details[open]");
        if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
      }}>
        <a className="task-notes-link" href={currentGuideNavigation("/", current)} aria-current={isCurrent("/") ? "page" : undefined}>阵容笔记</a>
        {referenceLinks.map(([href, label]) => (
          <a key={href} className="task-reference-link" href={href} aria-current={isCurrent(href) ? "page" : undefined}>{label}</a>
        ))}
        <details className="task-menu task-reference" data-current={referenceLinks.some(([href]) => isCurrent(href)) || undefined}>
          <summary>资料<ChevronDown size={13} aria-hidden /></summary>
          <div className="task-menu-panel">
            {referenceGroups.map(group => <div key={group.label}><strong>{group.label}</strong>{group.links.map(([href, label]) => (
              <a key={href} href={href} aria-current={!href.includes("?") && isCurrent(href) ? "page" : undefined}>{label}</a>
            ))}</div>)}
            <div className="task-mobile-tools">
              <a href="/updates" aria-current={isCurrent("/updates") ? "page" : undefined}>版本更新</a>
              <a href={ownerEditorPath} aria-current={isCurrent(ownerEditorPath) ? "page" : undefined}>{ownerAccessLabel}</a>
              {session?.isOwner && <a href="/manage">发布管理</a>}
              <ThemeToggle />
            </div>
          </div>
        </details>
        <a className="combo-tool-link" href="/combos" aria-current={isCurrent("/combos") ? "page" : undefined}>凑羁绊</a>
        <a className="task-editor-link" href="/editor" aria-label="阵容编辑器" aria-current={pathname === "/editor" ? "page" : undefined}>编辑器</a>
      </nav>
      <div className="masthead-tools">
        <SiteSearchOverlay />
        <nav className="studio-nav" data-owner={session?.isOwner || undefined} aria-label="编辑工具">
          <a className="studio-primary" href="/editor" aria-label="阵容编辑器" aria-current={pathname === "/editor" ? "page" : undefined}>
            <SquarePen size={16} aria-hidden /><span className="studio-action-label">编辑器</span>
          </a>
          <a href={ownerEditorPath} aria-label={ownerAccessLabel} title={ownerAccessLabel}
            aria-current={isCurrent(ownerEditorPath) ? "page" : undefined}>
            <PanelsTopLeft size={16} aria-hidden />
          </a>
          {session?.isOwner && <a href="/manage" aria-label="发布管理" title="发布管理" aria-current={isCurrent("/manage") ? "page" : undefined}>
            <ClipboardList size={16} aria-hidden />
          </a>}
        </nav>
        <ThemeToggle />
      </div>
    </>
  );
}
