"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { resolvePublicPage } from "@/domain/analytics";
import { guideNavigationChange } from "@/domain/guide-navigation";
import { syncAnalyticsIgnoreFlag, trackPageView } from "@/lib/analytics";

const HERO_QUERY_CHANGE_EVENT = "hero-library-query-change";

export function SiteAnalytics() {
  const pathname = usePathname() ?? "/";
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    syncAnalyticsIgnoreFlag();

    function reportIfChanged(force = false) {
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const page = resolvePublicPage(currentPath, currentSearch);
      if (!page) {
        lastKey.current = null;
        return;
      }
      if (!force && lastKey.current === page.key) return;
      lastKey.current = page.key;
      trackPageView(currentPath, currentSearch);
    }

    reportIfChanged(false);

    const onNavigationChange = () => reportIfChanged(false);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reportIfChanged(true);
    };

    window.addEventListener("popstate", onNavigationChange);
    window.addEventListener(guideNavigationChange, onNavigationChange);
    window.addEventListener(HERO_QUERY_CHANGE_EVENT, onNavigationChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onNavigationChange);
      window.removeEventListener(guideNavigationChange, onNavigationChange);
      window.removeEventListener(HERO_QUERY_CHANGE_EVENT, onNavigationChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname]);

  return null;
}
