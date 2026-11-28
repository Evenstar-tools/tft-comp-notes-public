/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the verified production Vinext Link prefetch failure. */
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import "./interface.css";
import "./library-flows.css";
import "./guide-reading.css";
import "./season.css";
import "./task-navigation.css";
import { OwnerSession } from "@/components/OwnerSession";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { BrandMark } from "@/components/Glyphs";
import { season } from "@/data";
import { isOfficialEdition } from "@/domain/version-updates";

const siteName = "云顶之弈阵容笔记";
const brandIcon = "/favicon.svg?v=hex-eight";
const editionLabel = isOfficialEdition(season.id) ? "正式服" : "PBE";
export const metadata: Metadata = {
  title: { default: `${siteName} · S19 ${editionLabel}`, template: `%s · ${siteName} · S19 ${editionLabel}` },
  description: "S19 英雄与解锁资料、个人阵容笔记及羁绊构建器。",
  icons: { icon: { url: brandIcon, type: "image/svg+xml", sizes: "any" } },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="data-theme" storageKey="tft-color-theme" defaultTheme="light" enableSystem={false} enableColorScheme={false}>
          <SiteAnalytics />
          <OwnerSession>
            <a className="skip-link" href="#main">
              跳到主要内容
            </a>
            <header className="site-header">
              <div className="masthead-inner">
                <a className="wordmark" href="/" aria-label={`${siteName}首页`}>
                  <BrandMark size={42} src={brandIcon} />
                  <span className="masthead-identity">
                    <strong className="masthead-name">{siteName}</strong>
                    <span className="masthead-season"><b>S19</b><span aria-hidden="true">·</span>{editionLabel}</span>
                  </span>
                </a>
                <SiteNav />
              </div>
            </header>
            <main id="main" className="page-shell">
              {children}
            </main>
            <SiteFooter siteName={siteName} brandIcon={brandIcon} />
          </OwnerSession>
        </ThemeProvider>
      </body>
    </html>
  );
}
