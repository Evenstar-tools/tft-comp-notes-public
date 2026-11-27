"use client";
import { augmentHref } from "@/domain/augment-library";
import { guideEquipmentConditions } from "@/domain/guide-equipment-conditions";
import { canonicalGuideHref } from "@/domain/links";
import { GuideTeams, type GuidePassage, type GuidePatchAdvice } from "./GuideTeams";
import { sectionTeams } from "@/domain/document-flow";
import { boardTitle } from "@/domain/guide-families";
import { allBlocks, boardLoadoutHeading, guideBoardName, guideBody, guidePlaystyle, guideTitleWithoutPlaystyle, isBoardLoadout, primaryFirst, type GuideRole } from "@/domain/guide-reading";
import { compactGuideParagraph, guideCopyKey, hasGuideLinks, rememberGuideCopy } from "@/domain/guide-copy";
import { rerollRoute } from "@/domain/reroll-stages";
import { sourceSectionTitle } from "@/domain/source-category-display";
import { heroAugmentCategory, heroAugmentForGuide, heroAugmentLabel, heroAugmentLibrary } from "@/domain/hero-augments";
import { displayTraitNames } from "@/domain/trait-names.mjs";
import type { BoardStage, Season, Team } from "@/domain/types";
import type { ContentBlock, RichElement, Section } from "@/domain/document";
import { trackGuideView } from "@/lib/analytics";
import { useEffect, useRef, type ReactNode } from "react";

const legacyHeroAugmentPlacement = /^棋盘均名 · [^\r\n]+。主C三星三件成装，战绩未公开强化选择。$/;
const placementTableHeaders = ["阵容", "场数", "均名", "前四", "登顶"];

function safeUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin === "https://tft.example.com"
      && !parsed.username && !parsed.password
      && /^\/(?:guides\/[A-Za-z0-9_-]+|emblems)\/?$/.test(parsed.pathname)) {
      return canonicalGuideHref(parsed.pathname + parsed.search + parsed.hash);
    }
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}
function Elements({ elements = [], start = 0 }: { elements?: RichElement[]; start?: number }) {
  let remaining = start;
  const children: ReactNode[] = [];
  for (const [index, element] of elements.entries()) {
    const run = element.text_run;
    const content = run?.content ?? element.mention_doc?.title ?? "[此行内内容暂不支持]";
    let child: ReactNode = content.slice(remaining).replace(/^【阵容构建器 · [0-9a-f-]{36}】\r?\n/i, "");
    remaining = Math.max(0, remaining - content.length);
    if (!child) continue;
    const style = run?.text_element_style;
    if (style?.bold) child = <strong>{child}</strong>;
    if (style?.italic) child = <em>{child}</em>;
    if (style?.underline) child = <u>{child}</u>;
    if (style?.strikethrough) child = <s>{child}</s>;
    const url = style?.link?.url ?? element.mention_doc?.url;
    const href = url ? safeUrl(url) : undefined;
    if (href) child = <a href={href} target="_blank" rel="noreferrer">{child}</a>;
    children.push(<span key={index}>{child}</span>);
  }
  return <>{children}</>;
}
function Block({ block, folded, start = 0, replacement }: { block: ContentBlock; folded: Set<string>; start?: number; replacement?: string }) {
  const children = block.children?.map((child) => (
    <Block key={child.id} block={child} folded={folded} />
  ));
  if (folded.has(block.id)) return <>{children}</>;
  const anchor = "note-" + block.id;
  const text = replacement ?? (block.elements?.length ? <Elements elements={block.elements} start={start} /> : block.text?.slice(start));
  switch (block.type) {
    case "image":
      return (
        <figure>
          <a
            href={"/api/media/" + block.imageToken}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={"/api/media/" + block.imageToken}
              alt="飞书文档中的阵容或说明图片"
              loading="lazy"
            />
          </a>
          {children}
        </figure>
      );
    case "heading":
      return (
        <section>
          <h3 id={anchor}>{text}</h3>
          {children}
        </section>
      );
    case "text":
      return (
        <div>
          <p id={anchor}>{text}</p>
          {children}
        </div>
      );
    case "bullet":
      return (
        <div className="doc-bullet">
          • {text}
          {children}
        </div>
      );
    case "ordered":
      return (
        <div className="doc-ordered">
          {text}
          {children}
        </div>
      );
    case "quote":
      return (
        <blockquote>
          {text}
          {children}
        </blockquote>
      );
    case "code":
      return (
        <pre>
          {text}
          {children}
        </pre>
      );
    case "divider":
      return <hr />;
    case "columns":
      return <div className="doc-columns">{children}</div>;
    case "column":
      return <div>{children}</div>;
    case "table": {
      const columns = block.columnCount ?? 1;
      const cells = block.children ?? [];
      const isPlacementTable = columns === placementTableHeaders.length && cells.length >= columns &&
        cells.length % columns === 0 && cells.every(cell => cell.type === "cell" && !folded.has(cell.id)) &&
        placementTableHeaders.every((label, index) =>
          allBlocks(cells[index].children ?? []).map(child => child.text?.trim() ?? "").join("") === label);
      if (isPlacementTable) {
        const [head, ...rows] = Array.from({ length: cells.length / columns }, (_, index) =>
          cells.slice(index * columns, (index + 1) * columns));
        return <div className="doc-table-scroll doc-placement-scroll">
          <table className="doc-placement-table">
            <thead><tr>{head.map((cell, index) =>
              <th scope="col" key={cell.id}>{placementTableHeaders[index]}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row[0].id}>{row.map((cell, index) => {
              const content = cell.children?.map(child => <Block key={child.id} block={child} folded={folded} />);
              return index === 0
                ? <th scope="row" key={cell.id}>{content}</th>
                : <td key={cell.id}>{content}</td>;
            })}</tr>)}</tbody>
          </table>
        </div>;
      }
      return (
        <div className="doc-table-scroll">
          <div
            className="doc-table"
            style={{
              gridTemplateColumns:
                "repeat(" + columns + ",minmax(150px,1fr))",
            }}
          >
            {children}
          </div>
        </div>
      );
    }
    case "cell":
      return <div className="doc-cell">{children}</div>;
    default:
      return (
        <div className="notice">
          {block.text}
          {children}
        </div>
      );
  }
}
export function DocumentView({ section, gameData, publicationId, initialTeam, defaultTeam, initialStage, initialFlex, variants, systems, openPoster, initialPosterShare, returnTo, showCategory = true, patchAdvice }: {
  section: Section; gameData?: Season; publicationId?: string; initialTeam?: string; defaultTeam?: string; initialStage?: BoardStage; initialFlex?: string; returnTo?: string;
  variants?: Record<string, import("@/domain/guide-families").PosterVariant[]>; openPoster?: boolean; initialPosterShare?: import("@/domain/links").PosterShare;
  systems?: import("@/domain/guide-variant-strip").GuideSystem[];
  showCategory?: boolean;
  patchAdvice?: GuidePatchAdvice[];
}) {
  const reportedGuide = useRef<string | null>(null);
  useEffect(() => {
    if (!publicationId || reportedGuide.current === section.id) return;
    reportedGuide.current = section.id;
    trackGuideView({ guideId: section.id, mode: "detail", returnTo });
  }, [publicationId, section.id, returnTo]);
  const folded = new Set(gameData ? Object.values(section.generatedRegions ?? {}).flatMap(region => [region.textId, region.imageId]) : []);
  const augment = heroAugmentForGuide(section);
  const primary = gameData && primaryFirst(sectionTeams(section), section.primaryTeamId)[0];
  const augmentAtBoard = augment && gameData && primary && guideEquipmentConditions(section, [primary], gameData)?.rows.some(row => row.id === augment.id);
  if (primary) for (const block of allBlocks(section.blocks)) {
    if (isBoardLoadout(block) || ((block.type === "heading" || block.label) && block.text === boardLoadoutHeading)) folded.add(block.id);
  }
  if (augment) for (const block of section.blocks) {
    if (block.type !== "text") continue;
    if (block.text === heroAugmentLabel + augment.name ||
        block.text?.trim() === "棋盘按 S19 PBE 强化机制构筑。" ||
        (publicationId && legacyHeroAugmentPlacement.test(block.text?.trim() ?? ""))) folded.add(block.id);
  }
  if (primary) for (const block of allBlocks(section.blocks)) {
    if (block.type === "text" && /^(?:打法|运营类型)[：:]\s*(?:低费慢搜|三费慢搜|[五六七567]级慢搜|速[八九89]运营|84|95)[。.]?\s*$/.test(block.text?.trim() ?? "")) folded.add(block.id);
  }
  const Title = publicationId ? "h1" : "h2";
  const category = section.category.trim();
  function selectedText(team: Team, passages: GuidePassage[], roles: GuideRole[]) {
    const { current, remaining } = guideBody(section, team);
    const patchNote = patchAdvice?.find(entry => entry.teamId === team.id)?.note;
    const visibleIds = new Set(allBlocks(current).filter(block => !folded.has(block.id)).map(block => block.id));
    const below = passages.filter(passage => !passage.brief && passage.text &&
      (passage.text !== passage.source || !passage.blockId || !visibleIds.has(passage.blockId)));
    const displayed = new Set([...passages.filter(passage => passage.brief), ...below].map(passage => passage.source));
    const hidden = new Set(folded);
    const blocks = allBlocks(section.blocks);
    for (const block of blocks) {
      if (block.type === "text" && !block.label && block.text && !hasGuideLinks(block) && displayed.has(block.text.trim())) hidden.add(block.id);
    }
    const seen = new Set<string>();
    for (const passage of passages.filter(passage => passage.brief || below.includes(passage))) rememberGuideCopy(passage.text, seen);
    const replacements = new Map<string, string>();
    for (const block of current) {
      if (hidden.has(block.id) || block.label || !block.text || !["text", "bullet", "ordered"].includes(block.type) || hasGuideLinks(block)) continue;
      const utility = block.text.match(/^功能装[：:]\s*([^。]+)。\s*(.+)$/);
      if (utility && roles.some(role => role.label === "功能装" && role.units.length === 1 &&
        gameData?.units.some(unit => unit.id === role.units[0] && unit.name === utility[1].trim()) &&
        guideCopyKey(role.text) === guideCopyKey(utility[2]))) {
        hidden.add(block.id);
        continue;
      }
      const text = gameData ? compactGuideParagraph(block.text, team, gameData, seen, patchNote) : block.text;
      if (!text && block.text.trim()) hidden.add(block.id);
      else if (text !== block.text) replacements.set(block.id, text);
      rememberGuideCopy(text, seen);
    }
    const boardLabels = new Set(sectionTeams(section).map(board => guideCopyKey(board.name)));
    const isHeading = (block: ContentBlock) => block.type === "heading" || block.label === true ||
      (block.type === "text" && !!block.text && boardLabels.has(guideCopyKey(block.text)) && !hasGuideLinks(block));
    function hasContent(block: ContentBlock): boolean {
      return !!block.children?.some(hasContent) || (!hidden.has(block.id) && !!(block.text?.trim() || block.imageToken));
    }
    function visibleBlocks(blocks: ContentBlock[]) {
      const shown = blocks.filter(block => hasContent(block) || block.type === "divider" && !hidden.has(block.id));
      return shown.filter((block, index) => {
        if (!isHeading(block) || block.children?.some(hasContent) || hasGuideLinks(block)) return true;
        const next = shown.slice(index + 1).find(entry => entry.type !== "divider");
        return next && !isHeading(next);
      });
    }
    const visible = visibleBlocks(current);
    const remainingIds = new Set(remaining.map(block => block.id));
    const original = section.reroll?.added.includes(team.id) ? [] : visibleBlocks(section.blocks.filter(block => remainingIds.has(block.id)));
    if (!visible.length && !original.length && !below.length) return null;
    return <div className="guide-authored">
      {(visible.length > 0 || below.length > 0) && <section aria-label="当前棋盘的运营">
        {below.map(passage => {
          const block = blocks.find(entry => entry.id === passage.blockId);
          if (block?.text && !folded.has(block.id) && passage.source.endsWith(passage.text)) {
            const start = block.text.length - block.text.trimStart().length + passage.source.length - passage.text.length;
            return <Block key={passage.source} block={block} folded={folded} start={start} />;
          }
          return <p key={passage.source} id={passage.blockId ? "note-" + passage.blockId : undefined}>{displayTraitNames(passage.text)}</p>;
        })}
        {visible.map(block => <Block key={block.id} block={block} folded={hidden} replacement={replacements.get(block.id)} />)}
      </section>}
      {original.length > 0 && <details className="guide-original-text">
        <summary>其他阶段</summary>
        {original.map(block => <Block key={block.id} block={block} folded={hidden} />)}
      </details>}
    </div>;
  }
  const returnPath = returnTo?.split(/[?#]/, 1)[0];
  const returnLabel = returnPath === "/updates" ? "返回版本更新"
    : returnPath === "/augments" ? "返回海克斯"
      : returnPath === "/heroes" ? "返回英雄图鉴"
        : returnPath === "/items" ? "返回装备"
          : returnPath === "/emblems" ? "返回转职"
            : returnTo ? "返回阵容列表" : augment ? "英雄强化" : "全部阵容";
  function header(title: string, guideName?: string, performance?: ReactNode, team?: Team) {
    const playstyle = guidePlaystyle(section, team);
    const showFolder = !augment && category === heroAugmentCategory;
    const context = guideName ? guideTitleWithoutPlaystyle(guideName, playstyle)
      : showCategory && showFolder && category !== section.title.trim() ? "英雄强化" : "";
    return <>
      {(publicationId || context) && <div className="guide-header-meta">
        {publicationId && <a href={returnTo ?? (augment ? heroAugmentLibrary : "/?sort=category")}>{returnLabel}</a>}
        {context && <span>{context}</span>}
      </div>}
      <div className="guide-page-heading">
        <Title className="guide-page-title">{guideTitleWithoutPlaystyle(title, playstyle)}</Title>
        {playstyle && <span className="guide-playstyle-tag" title="打法">{playstyle}</span>}
        {performance}
      </div>
      {augment && !augmentAtBoard && <p className="guide-hero-augment"><strong><a href={augmentHref(augment.id)} title={augment.name}>{augment.label} ↗</a></strong> <span>{augment.round} {augment.rarity} · {augment.role}</span></p>}
    </>;
  }
  function teamHeader(team: Team, performance?: ReactNode) {
    const stage = section.reroll?.stages.find(entry => entry.teamId === team.id);
    const formation = stage && stage.boardRole !== "variant" ? rerollRoute(section, team)?.final ?? team : team;
    if (section.stageTeamIds?.includes(team.id) && !section.reroll) return header(section.title, undefined, performance, team);
    const title = boardTitle(section, formation);
    if (formation.id !== primary?.id && title !== section.title && !title.startsWith(section.title + " · ")) return header(title, section.title, performance, team);
    const name = publicationId && formation.id !== primary?.id
      ? guideBoardName(formation).match(/^[一二三四五六七八九十\d]+(?:级|人口)\s*·\s*(.+)$/)?.[1].trim()
      : undefined;
    if (name && name !== section.title && !/^(主阵|过渡|成型|上限|稳血|变阵)$/.test(name)) return header(name, section.title, performance, team);
    return header(title, undefined, performance, team);
  }
  return (
    <article className={primary ? "document-view with-guide-board" : "document-view"}>
      {primary && gameData ? <GuideTeams key={section.id + (section.primaryTeamId ?? "")} section={section} data={gameData} initialTeam={initialTeam} defaultTeam={defaultTeam}
        initialStage={initialStage} initialFlex={initialFlex} publicationId={publicationId} returnTo={returnTo} renderHeader={teamHeader} renderNotes={selectedText}
        variants={variants} systems={systems} openPoster={openPoster} initialPosterShare={initialPosterShare} patchAdvice={patchAdvice} /> : header(sourceSectionTitle(section))}
      {!primary && section.blocks.map((block) => (
        <Block key={block.id} block={block} folded={folded} />
      ))}
      {!section.blocks.length && <p className="muted">此章节暂无正文。</p>}
    </article>
  );
}
