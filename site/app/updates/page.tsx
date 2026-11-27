import { notFound } from "next/navigation";
import { DocumentView } from "@/components/DocumentView";
import { PatchExplorer } from "@/components/PatchExplorer";
import { PatchReadingLink } from "@/components/PatchReadingLink";
import { LobbyObservation } from "@/components/LobbyObservation";
import lobbySample from "@/data/lobby-sample.json";
import { season, unitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augmentCatalog from "@/data/augment-catalog.json";
import bundledItems from "@/data/item-art.json";
import { patchReferences } from "@/data/patch-notes";
import { chapterMatchesPatch, patchGuideImpactLabels, publishedPatchCallouts, splitHighlightLine, type PatchReference } from "@/domain/patch-reference";
import { readablePatchIntroduction } from "@/domain/patch-recommendations";
import { recommendationBoardTitle } from "@/domain/guide-families";
import { sectionTeams } from "@/domain/document-flow";
import { guideLink, guideRoster, readingNotes } from "@/domain/guide-reading";
import { currentPatchRecommendations } from "@/server/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import { isOfficialEdition, isPatchIntroduction, isVersionUpdate, officialPatchNotes, publishedVersionUpdates, sameEdition, versionUpdateLink } from "@/domain/version-updates";
import { publishedSnapshot } from "@/server/publication";
import { currentOwner } from "@/server/access";
import placement from "@/data/guide-placement.json";
import { PlacementBadge } from "@/components/GuidePlacement";
import type { PlacementBatch } from "@/domain/guide-placement";
import "./patch-notes.css";

export const metadata = { title: "版本更新" };
export const dynamic = "force-dynamic";

function patchTitle(title: string, date?: string) {
  const cleaned = title.replace(/\s*·\s*\d{7,}\s*$/, "").trim();
  const dated = /^PBE (\d{1,2})\/(\d{1,2}) 更新\s*·\s*(.+)$/.exec(cleaned);
  if (!dated || !date) return cleaned;
  const [, month, day, subject] = dated;
  return date.slice(5) === `${month.padStart(2, "0")}-${day.padStart(2, "0")}` ? subject : cleaned;
}

function patchImages(patch: PatchReference) {
  const icons: Record<string, string> = {};
  for (const [category, rows] of Object.entries(patch.groups)) {
    for (const row of rows) {
      let src = row.unit && unitMap.get(row.unit)?.image;
      if (category === "羁绊") {
        const aliases = [row.name, ...(row.aliases ?? [])];
        src = (season.traits.find(trait => aliases.includes(trait.name) || aliases.includes(trait.nameEn)) ??
          season.traits.find(trait => trait.aliases?.some(alias => aliases.includes(alias))))?.image;
      } else if (category === "海克斯") {
        const augment = augmentCatalog.rows.find(entry => entry.name === row.name || row.aliases?.includes(entry.english));
        if (augment) src = augmentArtPath(augment);
      } else if (category === "装备") {
        const item = season.items.find(entry => entry.name === row.name);
        if (item) src = bundledItems.includes(item.id) ? "/assets/items/" + item.id + ".webp" : item.image;
      }
      if (src) icons[category + row.name] = src;
    }
  }
  return icons;
}

export default async function VersionUpdates({ searchParams }: { searchParams: Promise<{ entry?: string; q?: string; category?: string; lobby?: string }> }) {
  const [publication, { entry, q, category, lobby }, owner] = await Promise.all([publishedSnapshot(), searchParams, currentOwner()]);
  const references = patchReferences.filter(patch => sameEdition(patch.edition, season.id));
  const chapters = publishedVersionUpdates(season.id, publication);
  const intro = chapters.find(isPatchIntroduction);
  const catalog = references.map(reference => {
    const chapter = chapters.find(section => section !== intro && chapterMatchesPatch(section, reference));
    return { id: chapter?.id ?? reference.id, title: chapter?.title ?? reference.title, chapter, reference };
  });
  const introReference = intro && references.find(patch => chapterMatchesPatch(intro, patch));
  const versions = [
    ...chapters.filter(chapter => !(chapter === intro && introReference) && !catalog.some(version => version.chapter === chapter))
      .map(chapter => ({ id: chapter.id, title: chapter === intro ? "更新预览与环境观察" : chapter.title, chapter, reference: undefined })),
    ...catalog,
  ];
  const requested = entry === "introduction" && introReference ? introReference.id : entry;
  const current = requested ? versions.find(version => version.id === requested || version.reference?.id === requested)
    : versions.find(version => version.reference?.id === currentPatch.updateId) ?? versions[0];
  if (entry && !current) notFound();
  const patch = current?.reference;
  const samePublication = publication && sameEdition(season.id, publication.season.id) ? publication : undefined;
  const sameBuild = patch?.id === currentPatch.updateId;
  const recommendation = sameBuild || current?.chapter === intro && intro
    ? currentPatchRecommendations(samePublication ?? null)
    : undefined;
  const callouts = patch && publishedPatchCallouts(intro && readablePatchIntroduction(intro), patch);
  const highlights = callouts?.highlights.length ? callouts.highlights : patch?.highlights;
  const patchObservations = Array.isArray(patch?.observation) ? patch.observation : patch?.observation ? [patch.observation] : [];
  const observations = callouts?.observation.length ? callouts.observation : patchObservations;
  const impacts = patch?.impacts ?? [];
  const placementBatch = placement as PlacementBatch;
  const sampledBoards = placementBatch.records.flatMap(row => {
    const note = row.boardObservation;
    const mean = row.mean;
    return note && note.patchId === patch?.id && row.games > 100 && mean !== undefined ? [{ row, note, mean }] : [];
  }).sort((a, b) => a.mean - b.mean);
  const guideTitles = Object.fromEntries((samePublication?.sections ?? [])
    .filter(section => section.kind !== "category" && !isVersionUpdate(section) && (section.team || section.teams?.length))
    .map(section => [section.id, section.title]));
  const hasChanges = patch && Object.keys(patch.groups).length > 0;
  const observationStats = patch?.observationStats;
  const showObservation = !current?.chapter && (observations.length > 0 || !!observationStats?.length);
  const hasDetails = showObservation || impacts.length > 0 || sampledBoards.length > 0;
  const sections = [
    ...(hasChanges ? [{ anchor: "patch-changes", label: "改动明细" }] : []),
    ...(showObservation ? [{ anchor: "patch-environment", label: "环境观察" }] : []),
    ...(sampledBoards.length ? [{ anchor: "eight-board-samples", label: "八级棋盘实测" }] : []),
    ...(impacts.length ? [{ anchor: "patch-recommendations", label: "阵容观察" }] : []),
  ];
  const source = (patch || isOfficialEdition(season.id)) && <div className="patch-edition-line">
    {patch && <time dateTime={patch.date} title={patch.dateLabel + " · " + patch.build}>{patch.date}</time>}
    <a className="patch-source" href={patch?.source.url ?? officialPatchNotes} target="_blank" rel="noreferrer">
      {patch?.source.name ?? "Riot 公告"}
    </a>
  </div>;
  const sectionLinks = (sections.length > 1 || sections.length === 1 && (hasChanges || current?.chapter)) &&
    <nav className="patch-section-nav" aria-label="版本页章节">
    {sections.map(({ anchor, label }) => <a key={anchor} href={"#" + anchor}>{label}</a>)}
  </nav>;
  const leadTools = (source || sectionLinks) && <div className="patch-lead-tools">{source}{sectionLinks}</div>;
  return <div className="patch-page">
    {current ? <div className="patch-layout">
      <aside className="patch-index">
        <h1>版本更新</h1>
        <nav className="patch-editions" aria-label="版本列表">{versions.map(version => <PatchReadingLink key={version.id}
          href={versionUpdateLink(version.id, { query: q, category })} aria-current={version.id === current.id ? "page" : undefined}>
          {version.reference && <time dateTime={version.reference.date}>{version.reference.date.slice(5).replace("-", ".")}</time>}
          <span>{patchTitle(version.title, version.reference?.date)}</span>
        </PatchReadingLink>)}</nav>
      </aside>
      <div className="patch-content">
        <section id="patch-announcement" aria-label="公告与导读">
          {current.chapter ? <>
            <DocumentView section={{
              ...(current.chapter === intro ? readablePatchIntroduction(current.chapter, recommendation?.summary) : current.chapter),
              title: patchTitle(current.title, patch?.date),
            }} showCategory={false} />
            {leadTools}
          </> : <>
            <h2>{patchTitle(current.title, patch?.date)}</h2>
            {leadTools}
            {!!highlights?.length && <ul className="patch-summary">{highlights.map(line => {
              const { label, text } = splitHighlightLine(line);
              return <li key={line}>{label && <><strong>{label}</strong>：</>}{text}</li>;
            })}</ul>}
          </>}
        </section>
        {owner && patch && sameEdition(patch.edition, "s19-pbe") && <LobbyObservation key={patch.id + (lobby ?? "")}
          initialTarget={lobby} lobbies={lobbySample.filter(game => game.build === patch.build).sort((a, b) => b.at - a.at)} />}
        <div className={hasChanges && hasDetails ? "patch-reading has-sidebar" : "patch-reading"}>
          {hasChanges && <PatchExplorer key={patch.id} patch={patch} guides={guideTitles} icons={patchImages(patch)}
            initialQuery={q ?? ""} initialCategory={category ?? ""} />}
          {hasDetails && <div className="patch-details">
            {showObservation && <section className="patch-observation" id="patch-environment">
              <h3>环境观察</h3>
              {!!observationStats?.length && <table className="patch-environment-stats">
                <caption>热补后首批体系战绩</caption>
                <thead><tr><th scope="col">阵容</th><th scope="col">场数</th><th scope="col">均名</th></tr></thead>
                <tbody>{observationStats.map(({ name, games, mean }) => <tr key={name}>
                  <th scope="row">{name}</th><td>{games.toLocaleString("zh-CN")}</td><td>{mean.toFixed(2)}</td>
                </tr>)}</tbody>
              </table>}
              {observations.map(line => <p key={line}>{line}</p>)}</section>}
            {!!impacts.length && <section className="patch-board-observation patch-recommendations" id="patch-recommendations">
              <h3>阵容观察</h3>
              <ul>{impacts.map(record => {
                const guide = samePublication?.sections.find(section => section.id === record.sectionId);
                const teams = guide ? sectionTeams(guide) : [];
                const team = record.teamId ? teams.find(board => board.id === record.teamId) : teams[0];
                if (!guide || !team) return null;
                const data = guide.gameData ?? season;
                const lead = guideRoster(team, data, readingNotes(guide, team, data).roles)[0]?.unit;
                const title = recommendationBoardTitle(guide, team, lead?.name);
                const familyPrefix = guide.title + " · ";
                const familyVariant = title.startsWith(familyPrefix);
                const [formation, ...boardDetails] = familyVariant ? title.slice(familyPrefix.length).split(" · ") : [];
                const population = formation?.match(/^([一二三四五六七八九十\d]+(?:级|人口))(.+)$/);
                const boardLabel = [population && guide.title.startsWith(population[2]) ? population[1] : formation,
                  ...boardDetails].filter(Boolean).join(" · ");
                const titleLabel = familyVariant ? guide.title : title;
                const from = versionUpdateLink(current.id, { query: q, category, anchor: "patch-recommendations" });
                return <li className="patch-recommendation" key={record.sectionId + ":" + team.id}>
                  <div className="patch-recommendation-heading">
                    {lead && <img className={"patch-recommendation-portrait cost-" + lead.cost}
                      src={lead.image} width={34} height={34} alt="" />}
                    <div className="patch-recommendation-title">
                      <h4><PatchReadingLink href={guideLink(guide.id, team.id, from)} aria-label={boardLabel ? titleLabel + " · " + boardLabel : undefined}>
                        {titleLabel}
                      </PatchReadingLink></h4>
                      <span className="patch-status" data-status={record.direction}>{patchGuideImpactLabels[record.direction]}</span>
                      {boardLabel && <small className="patch-board-variant">{boardLabel}</small>}
                    </div>
                  </div>
                  <p>{record.note}</p>
                </li>;
              })}</ul>
            </section>}
            {!!sampledBoards.length && <section className="patch-board-observation" id="eight-board-samples">
              <h3>八级棋盘实测</h3>
              <p>MetaTFT · PBE 19.1 近三天 · <span title="固定八人，排除纹章和冠冕">固定八人无纹章<span className="sr-only">、无冠冕</span></span></p>
              <ul>
                {sampledBoards.map(({ row, note, mean }) => {
                  const tone = mean <= placementBatch.greenThrough ? "strong" : mean >= placementBatch.redFrom ? "weak" : "middle";
                  const guide = note.guide && new URL(note.guide, "https://site.invalid");
                  if (guide) guide.searchParams.set("from", versionUpdateLink(current.id, { query: q, category, anchor: "eight-board-samples" }));
                  return <li key={row.url}>
                    <div className="patch-board-heading">
                      <h4>{guide ? <PatchReadingLink href={guide.pathname + guide.search}>{note.title}</PatchReadingLink> : note.title}</h4>
                      <PlacementBadge rating={{ ...row, tone, patch: placementBatch.patch, window: placementBatch.window, date: row.observedOn ?? placementBatch.date }} />
                      <a className="patch-source patch-sample-links" href={row.url} target="_blank" rel="noreferrer">查对局</a>
                    </div>
                    <p>{note.play}</p>
                    {!guide && <p className="patch-board-roster">{[...new Set([...(note.cores ?? []), ...row.roster])].map(id => unitMap.get(id)?.name).filter(Boolean).join("、")}</p>}
                  </li>;
                })}
              </ul>
            </section>}
          </div>}
        </div>
      </div>
    </div> : <><h1>版本更新</h1><p className="muted">本赛季暂无版本更新。<a className="patch-source" href={officialPatchNotes}>Riot 公告</a></p></>}
  </div>;
}
