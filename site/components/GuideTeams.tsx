"use client";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ImageDown, Maximize2, X } from "lucide-react";
import { Board } from "./Board";
import { GuideEquipment } from "./GuideEquipment";
import { GuideEditorLink } from "./GuideEditorLink";
import { GuidePoster } from "./GuidePoster";
import { guideBoardKind, teamPlacement } from "./GuidePlacement";
import { GuideMatchStats, type MatchStatsView } from "./GuideMatchStats";
import { ItemIcon } from "./ItemIcon";
import { MatrixDialog } from "./MatrixDetails";
import { UnitDetails } from "./UnitBrowser";
import { useOwnerSession } from "./OwnerSession";
import { sectionTeams } from "@/domain/document-flow";
import { allBlocks, guideBoardName, guideLink, guideRoute, guideStrategyLabel, oceanGravesUnlockBoardId, primaryFirst, readingNotes, type GuideRole } from "@/domain/guide-reading";
import { compactGuideParagraph, compactUtilityCopy, hasGuideLinks, rememberGuideCopy } from "@/domain/guide-copy";
import { guideFlexPreview, reviewedGuidePhases } from "@/domain/guide-execution";
import { rerollRoute } from "@/domain/reroll-stages";
import { boardTraitLink } from "@/domain/trait-performance";
import { editorLink, itemLink, ownerEditorPath, posterShareLink, readPosterShare, type PosterShare } from "@/domain/links";
import { posterStageTitle } from "@/domain/poster";
import { boardStages, readTeamStage, stageLabels } from "@/domain/team-stages";
import { traitCounts, traitGroup, usedPopulation } from "@/domain/team";
import { displayTraitNames } from "@/domain/trait-names.mjs";
import { heroAugmentForGuide, heroAugmentCategory } from "@/domain/hero-augments";
import familyStats from "@/data/guide-family-stats.json";
import { guideFamilyRows } from "@/domain/guide-family-stats";
import type { Section } from "@/domain/document";
import { familyVariants, groupGuides, type PosterVariant } from "@/domain/guide-families";
import type { BoardStage, Season, Team } from "@/domain/types";
import { season } from "@/data";
import { sameEdition } from "@/domain/version-updates";
import "./guide-execution.css";

export type GuidePassage = { source: string; text: string; brief: boolean; blockId?: string };
export type GuidePatchAdvice = { teamId: string; note: string; label: string; href: string };

export function GuideTeams({ section, data, initialTeam, initialStage, initialFlex, publicationId, returnTo, renderHeader, renderNotes, variants, openPoster, initialPosterShare, patchAdvice }: {
  section: Section; data: Season; initialTeam?: string; publicationId?: string; returnTo?: string; renderHeader?: (team: Team, performance?: ReactNode) => ReactNode;
  initialStage?: BoardStage; initialFlex?: string;
  renderNotes?: (team: Team, passages: GuidePassage[], roles: GuideRole[]) => ReactNode;
  variants?: Record<string, PosterVariant[]>; openPoster?: boolean; initialPosterShare?: PosterShare;
  patchAdvice?: GuidePatchAdvice[];
}) {
  const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
  const primary = teams[0];
  const defaultTeamId = section.reroll?.entryTeamId ?? primary?.id;
  const [selectedTeam, setTeam] = useState(initialTeam ?? defaultTeamId);
  const [selectedStage, setSelectedStage] = useState(initialStage);
  const [selectedFlex, setSelectedFlex] = useState(initialFlex);
  const [selectedPiece, setPiece] = useState("");
  const [previousTeam, setPrevious] = useState("");
  const [showStage, setStage] = useState(false);
  const sampleId = useId();
  const [sampleView, setSampleView] = useState<MatchStatsView>();
  const [routeNote, setRouteNote] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [showPoster, setShowPoster] = useState(!!openPoster);
  const [posterShare, setPosterShare] = useState(initialPosterShare);
  const [posterHistoryKey, setPosterHistoryKey] = useState(0);
  const board = useRef<HTMLDivElement>(null);
  const pieceTitle = useRef<HTMLHeadingElement>(null);
  const pieceOrigin = useRef<{ trigger: HTMLButtonElement; top: number } | null>(null);
  const { session } = useOwnerSession();
  const team = teams.find(entry => entry.id === selectedTeam) ?? primary;
  const localFamily = useMemo(() => variants ? undefined : groupGuides([section], data, teamPlacement)[0], [variants, section, data]);
  const siblings = useMemo(() => {
    if (!team) return;
    const formation = rerollRoute(section, team)?.final ?? team;
    return variants?.[team.id] ?? variants?.[formation.id] ??
      (localFamily ? familyVariants(localFamily, formation.id) : undefined);
  }, [section, variants, localFamily, team]);
  useEffect(() => {
    if (!publicationId) return;
    function navigate() {
      const params = new URL(window.location.href).searchParams;
      const wantsPoster = params.get("poster") === "1";
      setTeam(params.get("team") ?? defaultTeamId);
      setSelectedStage(boardStages.find(stage => stage === params.get("stage")));
      setSelectedFlex(params.get("flex") ?? undefined);
      setStage(false); setRouteNote(""); setPiece(""); setPrevious(""); setZoomed(false); setSampleView(undefined);
      setShowPoster(wantsPoster);
      setPosterShare(wantsPoster ? readPosterShare(params.get("posterFormat"), params.get("posterStages")) : undefined);
      setPosterHistoryKey(key => key + 1);
    }
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, [publicationId, defaultTeamId]);
  const closePiece = useCallback(() => {
    const origin = pieceOrigin.current;
    setPiece("");
    pieceOrigin.current = null;
    if (!origin) return;
    requestAnimationFrame(() => {
      if (!origin.trigger.isConnected) return;
      origin.trigger.focus({ preventScroll: true });
      window.scrollBy({ top: origin.trigger.getBoundingClientRect().top - origin.top, behavior: "instant" });
    });
  }, []);
  useEffect(() => {
    if (!selectedPiece) return;
    pieceTitle.current?.focus({ preventScroll: true });
    pieceTitle.current?.scrollIntoView({ block: "nearest" });
    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      event.preventDefault();
      closePiece();
    }
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [selectedPiece, closePiece]);
  if (!team) return null;
  const mainStage = team.mainStage ?? "late";
  const authoredStages = boardStages.filter(stage => stage === mainStage || (stage !== "late" && team.stages?.[stage]?.pieces.length));
  const activeStage = selectedStage && authoredStages.includes(selectedStage) ? selectedStage : mainStage;
  const mainBoardActive = activeStage === mainStage;
  const flexPreview = mainBoardActive ? guideFlexPreview(section.id, team, data) : undefined;
  const showFlex = !!flexPreview && selectedFlex === flexPreview.id;
  const shownBoard = mainBoardActive ? showFlex ? flexPreview!.liveTeam : team
    : { ...readTeamStage(team, activeStage), id: team.id + "-" + activeStage };
  const stageTeams = teams.filter(entry => guideBoardKind(section, entry, primary) === "过渡")
    .sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
  const route = guideRoute(section, teams, team);
  const kind = guideBoardKind(section, team, primary);
  const mainRoute = !route && section.reroll && kind === "变阵" ? guideRoute(section, teams, primary) : undefined;
  const reviewedPhases = reviewedGuidePhases(section.id, teams, data);
  const phaseSteps = reviewedPhases ?? route?.phases;
  const linkedPhases = phaseSteps ?? mainRoute?.phases.filter(step => step.team) ?? [];
  const firstPhases = linkedPhases.length > 3 && linkedPhases.at(-1)?.team
    ? [...linkedPhases.slice(0, 2), linkedPhases.at(-1)!] : linkedPhases.slice(0, 3);
  const remainingPhases = linkedPhases.filter(step => !firstPhases.includes(step));
  const linkedChoices = route?.choices ?? mainRoute?.choices ?? [];
  const compactChoices = linkedChoices.some(choice => choice.team?.boardRole === "variant");
  const alternatives = teams.filter(option => !stageTeams.includes(option));
  const oceanBoards = teams.some(board => board.id === oceanGravesUnlockBoardId)
    ? teams.filter(board => board.id !== oceanGravesUnlockBoardId) : undefined;
  const posterVariants = oceanBoards ? oceanBoards.map(board => ({
    sectionId: section.id, teamId: board.id, change: "", pooled: false, title: guideBoardName(board),
  })) : [...new Map([
    ...[...(section.reroll ? route?.phases.flatMap(step => step.team ?? []) ?? [] : []), ...alternatives]
      .filter(option => option.id !== team.id).map(option => ({
      sectionId: section.id, teamId: option.id, title: posterStageTitle(option), change: "", pooled: false,
    })),
    ...(siblings ?? []),
  ].map(variant => [variant.teamId, variant])).values()];
  const augment = heroAugmentForGuide(section);
  const heroGuide = !!augment || section.category === heroAugmentCategory;
  const familyRows = heroGuide ? [] : guideFamilyRows(familyStats, data.id, section.id, teams);
  const matchingFamily = familyRows.filter(row => row.boards.some(board => board.id === team.id));
  const overall = matchingFamily.length === 1 ? matchingFamily[0].stat : undefined;
  const performance = overall && <a className="guide-family-rating" href={mainBoardActive && !showFlex ? "#" + sampleId : overall.url}
    onClick={() => setSampleView("family")} title={overall.sourceName + " · " + familyStats.patch + " · 近 " + familyStats.days + " 天"}>
    <span>体系均名</span><strong>{overall.mean.toFixed(2)}</strong><small>{overall.games.toLocaleString("zh-CN")} 场</small>
  </a>;
  const notes = readingNotes(section, team, data);
  const currentChoice = route?.choices?.find(choice => choice.team?.id === team.id);
  const openingText = currentChoice ? route?.opening || notes.opening : notes.opening;
  const boardPhaseIndex = phaseSteps?.findIndex(step => step.team?.id === team.id) ?? -1;
  const phaseIndex = routeNote ? (phaseSteps?.findIndex(step => step.label === routeNote) ?? -1) : boardPhaseIndex;
  const currentPhase = phaseIndex >= 0 ? phaseSteps?.[phaseIndex] : undefined;
  const nextPhase = currentPhase && phaseSteps?.[phaseIndex + 1];
  const nextBoard = nextPhase?.team;
  const advice = patchAdvice?.find(entry => entry.teamId === team.id);
  const blocks = allBlocks(section.blocks);
  const boardNames = [team.name, guideBoardName(team), section.title];
  const passages: GuidePassage[] = [];
  const seenCopy = new Set<string>();
  for (const raw of [openingText, currentPhase?.text ?? currentChoice?.text]) {
    const source = raw?.trim();
    if (!source || passages.some(passage => passage.source.includes(source))) continue;
    const separator = source.search(/[：:]/);
    const prefix = separator < 0 ? source : source.slice(0, separator).trim();
    const body = boardNames.includes(prefix) ? source.slice(separator < 0 ? source.length : separator + 1).trim() : source;
    const block = blocks.find(block => block.type === "text" && !block.label && block.text?.trim() === source);
    const linked = block && hasGuideLinks(block);
    const text = linked ? body : compactGuideParagraph(body, team, data, seenCopy, advice?.note);
    if (!text) continue;
    rememberGuideCopy(text, seenCopy);
    passages.push({ source, text, brief: !linked && !text.includes("\n") && text.length <= 90, blockId: block?.id });
  }
  const routeBoardIds = new Set([...linkedPhases, ...linkedChoices].map(step => step.team?.id));
  const otherVariants = alternatives.filter(option => !routeBoardIds.has(option.id) && !siblings?.some(s => s.teamId === option.id));
  const stagedVariants = !!section.reroll && linkedPhases.length > 0 && !linkedChoices.length &&
    otherVariants.length > 0 && otherVariants.every(option => guideBoardKind(section, option, primary) === "变阵");
  const compactControls = compactChoices || stagedVariants;
  const otherSiblings = siblings?.filter(option => !routeBoardIds.has(option.teamId));
  const otherStages = stageTeams.filter(option => !routeBoardIds.has(option.id) &&
    !section.reroll?.stages.some(stage => stage.teamId === option.id));
  const stageOptions = (routeBoardIds.has(primary.id) || otherVariants.some(option => option.id === primary.id)
    ? otherStages : [primary, ...otherStages]).filter(option => option.id !== team.id);
  const active = (entry: Team) => traitCounts(entry.pieces, data.units, data.traits, data.items).filter(trait => traitGroup(trait) === "已开常规");
  const counts = active(shownBoard);
  const name = (id: string) => data.units.find(unit => unit.id === id)?.name ?? id;
  const diff = (a: Team, b: Team) => {
    const remaining = b.pieces.map(piece => piece.unitId);
    return a.pieces.flatMap(piece => {
      const index = remaining.indexOf(piece.unitId);
      if (index === -1) return [name(piece.unitId)];
      remaining.splice(index, 1);
      return [];
    });
  };
  const nextAdded = nextBoard ? diff(nextBoard, team) : [];
  const nextRemoved = nextBoard ? diff(team, nextBoard) : [];
  const earlierPhase = boardPhaseIndex > 0
    ? phaseSteps?.slice(0, boardPhaseIndex).findLast(step => step.team && step.team.id !== team.id &&
      (!oceanBoards || step.team.id !== oceanGravesUnlockBoardId))
    : undefined;
  const visited = teams.find(entry => entry.id === previousTeam);
  const prev = earlierPhase?.team ?? (boardPhaseIndex < 0 ? visited : undefined)
    ?? (kind === "变阵" || kind === "上限" ? primary : undefined);
  const comparisonFrom = prev && (earlierPhase?.label ?? (prev.id === primary.id ? "主阵" : guideBoardName(prev)));
  const comparisonTo = phaseSteps?.[boardPhaseIndex]?.label ?? guideBoardName(team);
  const changed = prev ? Array.from({ length: 28 }, (_, i) => i).filter(pos => team.pieces.find(p => p.position === pos)?.unitId !== prev.pieces.find(p => p.position === pos)?.unitId) : [];
  const added = prev ? diff(team, prev) : [];
  const removed = prev ? diff(prev, team) : [];
  const traitDiff = {
    开出: [] as string[],
    升档: [] as string[],
    降档: [] as string[],
    失去效果: [] as string[],
  };
  if (prev) {
    const before = active(prev);
    const tierLabel = (trait: (typeof counts)[number]) =>
      `${trait.level}${trait.countMode === "stars" ? " 星" : ""} ${trait.name}`;
    for (const next of counts) {
      const old = before.find(trait => trait.id === next.id);
      if (!old) traitDiff.开出.push(tierLabel(next));
      else if (next.level > old.level) traitDiff.升档.push(`${tierLabel(old)}升到 ${tierLabel(next)}`);
      else if (next.level < old.level) traitDiff.降档.push(`${tierLabel(old)}降到 ${tierLabel(next)}`);
    }
    for (const old of before) {
      if (!counts.some(trait => trait.id === old.id)) traitDiff.失去效果.push(old.name);
    }
  }
  const traitRows = Object.entries(traitDiff).filter(([, values]) => values.length > 0);
  const hasChanges = !!comparisonFrom && !!(added.length || removed.length || traitRows.length);
  const nextRoster = (nextAdded.length || nextRemoved.length) ? <div className="guide-next-roster">
    {!!nextAdded.length && <span><b>上</b> {nextAdded.join("、")}</span>}
    {!!nextRemoved.length && <span><b>下</b> {nextRemoved.join("、")}</span>}
  </div> : null;
  const region = section.generatedRegions?.[team.id];
  const picture = region && !section.reroll?.corrected.includes(team.id)
    ? blocks.find(block => block.id === region.imageId)
    : undefined;
  const piece = shownBoard.pieces.find(entry => entry.instanceId === selectedPiece);
  const unit = piece && data.units.find(entry => entry.id === piece.unitId);
  const shownRoles = showFlex && flexPreview
    ? notes.roles.map(role => ({ ...role, units: role.units.map(id => id === flexPreview.outgoing.id ? flexPreview.incoming.id : id) }))
    : mainBoardActive ? notes.roles : [];
  const role = unit ? shownRoles.find(entry => entry.units.includes(unit.id)) : undefined;
  const pieceNote = role?.text && unit && augment?.unitId === unit.id
    ? compactUtilityCopy(role.text, unit.id, shownBoard, data)
    : role?.text;
  function pickTeam(next: Team, view?: MatchStatsView) {
    setRouteNote("");
    if (next.id === team.id) return;
    setSelectedStage(undefined); setSelectedFlex(undefined);
    setPrevious(team.id); setTeam(next.id); setPiece(""); setStage(false); setZoomed(false); setSampleView(view);
    if (publicationId) window.history.pushState(window.history.state, "", guideLink(section.id, next.id, returnTo));
  }
  function selectPiece(id: string, trigger?: HTMLButtonElement) {
    if (!id) { closePiece(); return; }
    if (trigger) pieceOrigin.current = { trigger, top: trigger.getBoundingClientRect().top };
    setPiece(id);
  }
  function selectSampleTeam(next: Team, view: MatchStatsView) {
    pickTeam(next, view);
    requestAnimationFrame(() => {
      const activeTab = document.getElementById(sampleId)?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      activeTab?.focus({ preventScroll: true });
      activeTab?.scrollIntoView({ block: "nearest" });
    });
  }
  function boardViewLink(stage?: BoardStage, flex?: string) {
    const params = new URLSearchParams({ team: team.id });
    if (returnTo) params.set("from", returnTo);
    if (stage && stage !== mainStage) params.set("stage", stage);
    if (flex) params.set("flex", flex);
    return guideLink(section.id) + "?" + params;
  }
  function pickStage(stage: BoardStage) {
    setSelectedStage(stage); setSelectedFlex(undefined); setPiece(""); setZoomed(false);
    if (publicationId) window.history.pushState(window.history.state, "", boardViewLink(stage));
  }
  function toggleFlex() {
    const flex = showFlex ? undefined : flexPreview?.id;
    setSelectedFlex(flex); setPiece(""); setZoomed(false);
    if (publicationId) window.history.replaceState(window.history.state, "", boardViewLink(activeStage, flex));
  }
  const shownPopulation = usedPopulation(shownBoard.pieces);
  const formation = guideStrategyLabel(section, team, data, primary)?.match(/^(\d+)级成型$/)?.[1];
  const cap = mainBoardActive && (reviewedPhases ? reviewedPhases.at(-1)?.team.id === team.id
    : kind === "上限" || currentPhase?.label.endsWith("级上限") ||
      (kind === "主阵" && formation && shownPopulation > Number(formation)));
  const boardTitle = cap ? shownPopulation + "级上限棋盘" : shownPopulation + " 人口棋盘";
  const guideHref = publicationId ? boardViewLink(activeStage, showFlex ? flexPreview?.id : undefined) : undefined;
  const editorTitle = [...new Set([section.title, guideBoardName(team), !mainBoardActive ? stageLabels[activeStage] : "",
    showFlex && flexPreview ? flexPreview.incoming.name + "替" + flexPreview.outgoing.name : ""].filter(Boolean))].join(" · ");
  const intro = passages[0]?.source === openingText.trim() ? passages[0] : undefined;
  const phaseAdvice = passages.find(passage => passage !== intro && passage.brief && passage.text);
  const opening = intro?.brief && intro.text ? intro : undefined;
  const inStage = kind === "过渡";
  const openingUnderBoard = section.reroll || inStage || !!currentChoice;
  const stageCopy = [openingUnderBoard ? opening : undefined, phaseAdvice].filter(entry => entry !== undefined);
  const openingLine = mainBoardActive && !openingUnderBoard && opening && <p className="guide-opening" id={opening.blockId ? "note-" + opening.blockId : undefined}>{displayTraitNames(opening.text)}</p>;
  function phaseButton(step: (typeof linkedPhases)[number]) {
    const detail = "detail" in step && typeof step.detail === "string" ? step.detail : undefined;
    return <button type="button" key={step.label} aria-label={compactChoices ? step.label : undefined}
      aria-pressed={routeNote ? currentPhase?.label === step.label : step.team ? step.team.id === team.id : currentPhase?.label === step.label}
      onClick={() => step.team ? pickTeam(step.team) : setRouteNote(step.label)}>
      {reviewedPhases ? <><strong>{step.label}</strong>{detail && <small>{detail}</small>}</>
        : compactChoices ? step.label.replace(/ · .*$/, "") : step.label}
    </button>;
  }
  return <>{renderHeader?.(team, performance)}<section className={`guide-reader${section.reroll ? " guide-reroll" : ""}`} aria-label="阵容棋盘与运营">
    {openingLine}
    {oceanBoards ? <div className="guide-board-options" role="group" aria-label="阵容方案">
      <div className="guide-variants guide-ocean-choices">{oceanBoards.map(board =>
        <button key={board.id} type="button" aria-pressed={board.id === team.id} onClick={() => pickTeam(board)}>
          <span className="guide-variant-name">{guideBoardName(board)}</span>
        </button>)}</div>
    </div> : <div className={`guide-board-options${compactControls ? " guide-board-options--compact" : ""}${reviewedPhases ? " guide-board-options--reviewed" : ""}`}>
      {!!firstPhases.length && <div className="stage-options guide-phases" role="group" aria-label="运营阶段">{firstPhases.map(phaseButton)}</div>}
      {!!remainingPhases.length && <details className="guide-extra-phases"><summary>其他运营阶段</summary>
        <div className="stage-options">{remainingPhases.map(phaseButton)}</div>
      </details>}
      {!!linkedChoices.length && <nav className="guide-variants guide-route-choices" aria-label="选择成型阵容">
        {linkedChoices.map(({label, team: option}) => option &&
          <button key={option.id} type="button" aria-label={compactChoices ? label : undefined} aria-pressed={option.id === team.id} onClick={() => pickTeam(option)}>
            <strong>{compactChoices ? label.replace(/^\d+级\s*·\s*/, "") : label}</strong>
          </button>)}
      </nav>}
      {otherVariants.some(option => option.id !== team.id) && <nav className={stagedVariants ? "guide-variants guide-route-choices" : "guide-variants"} aria-label="选择阵容方案">{otherVariants.map(option =>
        <button key={option.id} type="button" aria-pressed={option.id === team.id} onClick={() => pickTeam(option)}>
          {!stagedVariants && <span className="guide-variant-kind">{guideBoardKind(section, option, primary)}</span>}
          <span className="guide-variant-name">{guideBoardName(option)}</span>
        </button>)}</nav>}
      {!!otherSiblings?.length && <details className="guide-family-fold"><summary>同套变种（{otherSiblings.length}）</summary>
        <ul className="guide-variant-links poster-variant-links">{otherSiblings.map(v => <li key={v.teamId}><a href={guideLink(v.sectionId, v.teamId, returnTo)}
          onClick={e => { if (!publicationId) { const next = teams.find(t => t.id === v.teamId); if (next) { e.preventDefault(); pickTeam(next); } } }}>
          <span>{v.title}{v.change && <small className="poster-change">{v.change}</small>}</span></a></li>)}</ul></details>}
    </div>}
    <div className="reader-layout">
      <div className="reader-play">
        {authoredStages.length > 1 && <div className="stage-options guide-phases" role="group" aria-label="棋盘阶段">
          {authoredStages.map(stage => <button key={stage} type="button" aria-pressed={activeStage === stage}
            onClick={() => pickStage(stage)}>{stageLabels[stage]}</button>)}
        </div>}
        <div className="reader-board-title guide-board-head"><h3>{boardTitle}</h3>
          <div className="guide-board-actions">
            <button type="button" className="guide-zoom-trigger guide-board-zoom" aria-label="放大棋盘" title="放大棋盘" aria-haspopup="dialog" onClick={() => setZoomed(true)}>
              <Maximize2 size={16} aria-hidden />
            </button>
            <button type="button" className="guide-zoom-trigger guide-board-poster" aria-label="阵容一图流" aria-haspopup="dialog" onClick={() => setShowPoster(true)}>
              <ImageDown size={16} aria-hidden /><span>一图流</span>
            </button>
            {guideHref && sameEdition(data.id, season.id) && <GuideEditorLink team={shownBoard} title={editorTitle} href={guideHref}
              focusUnit={shownRoles.find(role => role.label === "主C")?.units[0]} />}
          </div>
        </div>
        <div className="read-board" ref={board}><Board data={data} pieces={shownBoard.pieces} instrumentPositions={shownBoard.instrumentPositions} targeting={null} selectedId={selectedPiece} changedPositions={showFlex && flexPreview ? [flexPreview.position] : mainBoardActive ? changed : undefined}
          onCell={(_, picked, trigger) => selectPiece(picked?.instanceId === selectedPiece ? "" : picked?.instanceId ?? "", trigger)} /></div>
        <div className="guide-board-footer">
          <ul className="read-traits" aria-label="已激活常规羁绊">{counts.map(trait => {
            const label = <><b>{trait.level}{trait.countMode === "stars" && "星"}</b>{trait.name}</>;
            return <li key={trait.id}>{publicationId && !showFlex
              ? <a href={boardTraitLink(trait.id, trait.level, section.id, team.id)} title={"查看" + trait.name + "各档战绩"}>{label}</a>
              : label}</li>;
          })}</ul>
        </div>
        {flexPreview && <div className="guide-flex-slot" aria-label="灵活位">
          <strong className="guide-flex-label">{showFlex ? "替换预览" : "灵活位"}</strong>
          <span className="guide-flex-swap">
            <span><img src={flexPreview.outgoing.image} width={24} height={24} alt="" />{flexPreview.outgoing.name}{flexPreview.condition}</span>
            <ArrowRight size={14} aria-hidden />
            <span><img src={flexPreview.incoming.image} width={24} height={24} alt="" />{flexPreview.incoming.name}先顶</span>
          </span>
          <span className="guide-flex-reason">{flexPreview.reason}</span>
          <button type="button" aria-pressed={showFlex} onClick={toggleFlex}>{showFlex ? "恢复原阵容" : "预览替换"}</button>
        </div>}
        {mainBoardActive && (stageCopy.length > 0 || advice || nextPhase || notes.starHint) && <div className="guide-phase-workflow">
          {stageCopy.map(passage => <p key={passage.source} id={passage.blockId ? "note-" + passage.blockId : undefined}>{displayTraitNames(passage.text)}</p>)}
          {notes.starHint && <p className="star-hint">{notes.starHint}</p>}
          {advice && <p className="guide-patch-advice"><a href={advice.href}>{advice.label}</a> {displayTraitNames(advice.note)}</p>}
          {nextPhase && <div className="guide-next-phase">
            {nextRoster && <details className="guide-next-changes" key={nextBoard?.id ?? nextPhase.label}><summary>下一阶段换人</summary>{nextRoster}</details>}
            <button type="button" onClick={() => nextBoard ? pickTeam(nextBoard) : setRouteNote(nextPhase.label)}>
              {nextPhase.label} <ArrowRight size={15} aria-hidden />
            </button>
          </div>}
        </div>}
        {mainBoardActive && !showFlex && hasChanges && <details className="board-diff" key={"board-diff-" + team.id} aria-label="阶段变化">
          <summary aria-label={comparisonFrom + "到" + comparisonTo + "的换人和羁绊"}>与{comparisonFrom}对比</summary>
          {!!(added.length || removed.length) && <dl className="board-diff-roster">
            {!!added.length && <><dt>上场</dt><dd>{added.join("、")}</dd></>}
            {!!removed.length && <><dt>下场</dt><dd>{removed.join("、")}</dd></>}
          </dl>}
          {!!traitRows.length && <details className="board-diff-traits">
            <summary>羁绊变化（{traitRows.reduce((count, [, values]) => count + values.length, 0)}）</summary>
            <dl>{traitRows.map(([label, values]) => (
              <Fragment key={label}><dt>{label}</dt><dd>{values.join("、")}</dd></Fragment>
            ))}</dl>
          </details>}
        </details>}
        {!route && notes.stage && !stageTeams.length && <button className="guide-stage-toggle" type="button" aria-expanded={showStage} onClick={() => setStage(!showStage)}>八人口过渡</button>}
        {!oceanBoards && !!otherStages.length && stageOptions.length === 1 && <button type="button" className="guide-stage-toggle"
          onClick={() => pickTeam(stageOptions[0])}>{guideBoardName(stageOptions[0])}</button>}
        {!oceanBoards && !!otherStages.length && stageOptions.length > 1 && <details className="guide-stage-list">
          <summary>其他过渡棋盘</summary>
          <div className="stage-options">{stageOptions.map(step => <button type="button" key={step.id} onClick={() => pickTeam(step)}>{step.id === primary.id ? "主阵" : guideBoardName(step)}</button>)}</div>
        </details>}
        {showStage && <div className="stage-excerpt">{notes.stage}</div>}
        {unit && piece && <section className="guide-inspector" id="guide-piece-detail" aria-labelledby="guide-piece-title">
          <div className="reader-board-title guide-piece-head">
            <img src={unit.image} width={52} height={52} alt="" className={"guide-piece-portrait cost-" + unit.cost} />
            <div>
              <h3 id="guide-piece-title" ref={pieceTitle} tabIndex={-1}>{unit.name}</h3>
              <p className="piece-slot">{role && <>{role.label} · </>}{piece.stars} 星 · {unit.cost} 费</p>
            </div>
            <button type="button" aria-label="关闭棋子详情" onClick={closePiece}><X size={18} aria-hidden /></button>
          </div>
          {!!piece.items.length && <div className="read-items">{piece.items.map((id,i) => {
            const item = data.items.find(entry => entry.id === id);
            return item ? <a className="guide-item-link" href={itemLink(id, unit.id, guideHref)} key={i}><ItemIcon item={item} size={30} />{item.name}</a> : <span key={i}>{id}</span>;
          })}</div>}
          {pieceNote && <p>{pieceNote}</p>}
          {unit.id === "teemo" && notes.shortcuts.some(link => link.label === "热力与提莫") &&
            <a href={"#note-" + notes.shortcuts.find(link => link.label === "热力与提莫")!.blockId}>热力与提莫</a>}
          <UnitDetails embedded unit={unit} traits={data.traits} seasonId={data.id}
            defaultAugmented={augment?.unitId === unit.id} wornItems={piece.items} />
        </section>}
      </div>
      <GuideEquipment key={team.id + activeStage} team={shownBoard} data={data} roles={shownRoles} selectedPiece={selectedPiece}
        onSelectPiece={selectPiece} guideHref={guideHref} sectionId={section.id} guideStats={!showFlex} />
      <div className="reader-support">
        {mainBoardActive && renderNotes?.(team, passages, notes.roles)}
        {mainBoardActive && !showFlex && <GuideMatchStats key={team.id} id={sampleId} team={team} teams={teams} section={section}
          stage={inStage} edition={data.id} augmentName={augment?.name}
          heroGuide={heroGuide} familyRows={familyRows} view={sampleView} onSelectView={setSampleView} onPickTeam={selectSampleTeam} />}
        {mainBoardActive && (picture?.imageToken || session?.isOwner) && <div className="reader-links">
        <div className="guide-actions">
          {picture?.imageToken && <a href={"/api/media/" + encodeURIComponent(picture.imageToken)} target="_blank" rel="noreferrer">飞书原图</a>}
          {session?.isOwner && publicationId && <a href={ownerEditorPath + "?" + new URLSearchParams({ copy: team.id, publication: publicationId, section: section.id })}>复制到草稿</a>}
          {session?.isOwner && !section.reroll?.added.includes(team.id) && <a href={editorLink(team.id)}>修改原阵容</a>}
        </div>
        </div>}
      </div>
    </div>
    {showPoster && <GuidePoster key={posterHistoryKey} section={section} team={showFlex ? shownBoard : team} data={data} variants={posterVariants} initialShare={posterShare}
      boardLink={publicationId ? boardViewLink(activeStage, showFlex ? flexPreview?.id : undefined) : undefined}
      pickVariant={(v, format) => { const next = teams.find(t => t.id === v.teamId);
        if (next && v.sectionId === section.id) pickTeam(next);
        else window.location.assign(posterShareLink(guideLink(v.sectionId, v.teamId, returnTo), format));
      }} close={() => setShowPoster(false)} />}
    {zoomed && <MatrixDialog title={boardTitle} className="guide-board-dialog" closeLabel="关闭棋盘" onClose={() => setZoomed(false)}>
      <p className="guide-swipe-hint">横滑查看两侧站位，点棋子看配装</p>
      <div className="read-board read-board-large" tabIndex={0} aria-label="可横向滚动的放大棋盘" role="region">
        <Board data={data} pieces={shownBoard.pieces} instrumentPositions={shownBoard.instrumentPositions} targeting={null} selectedId={selectedPiece}
          onCell={(position, picked) => {
            if (!picked) return;
            setZoomed(false);
            selectPiece(picked.instanceId, board.current?.querySelectorAll<HTMLButtonElement>(".board-hex")[position]);
          }} />
      </div>
    </MatrixDialog>}
  </section>
  </>;
}
