"use client";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArrowRight, ChevronDown, ImageDown, Maximize2, X } from "lucide-react";
import { Board } from "./Board";
import { GuideEquipment } from "./GuideEquipment";
import { GuideEquipmentConditions } from "./GuideEquipmentConditions";
import { GuideEditorLink } from "./GuideEditorLink";
import { GuideBoardPositionEditor } from "./GuideBoardPositionEditor";
import { GuidePoster } from "./GuidePoster";
import { guideBoardKind, guideCorePlacement, guideStatsLaunch, teamPlacement } from "./GuidePlacement";
import { GuideMatchStats, guideMatchEvidence, type MatchStatsView } from "./GuideMatchStats";
import { ItemIcon } from "./ItemIcon";
import { GuideBoardZoom } from "./GuideBoardZoom";
import { UnitDetails } from "./UnitBrowser";
import { useOwnerSession } from "./OwnerSession";
import { findPlayerGuideTeam, isPlayerTeamStorageKey, readPlayerTeams, samePlayerBoard } from "./player-team-storage";
import { sectionTeams } from "@/domain/document-flow";
import { allBlocks, guideBoardName, guideEditorTitle, guideFacets, guideLink, guidePlaystyle, guideRoute, guideStrategyLabel, oceanGravesUnlockBoardId, primaryFirst, readingNotes, sourceSummary, type GuideRole } from "@/domain/guide-reading";
import { canonicalGuidePath, resolveBoardTeamId } from "@/domain/guide-slugs";
import { placementEvidenceKind } from "@/domain/guide-placement";
import placementBatch from "@/data/guide-placement.json";
import { compactGuideParagraph, compactUtilityCopy, hasGuideLinks, rememberGuideCopy } from "@/domain/guide-copy";
import { guideFlexPreview, reviewedGuidePhases } from "@/domain/guide-execution";
import { guideEquipmentConditions, guideReferenceConditions, sharedGuideEditorConditions } from "@/domain/guide-equipment-conditions";
import { rerollRoute } from "@/domain/reroll-stages";
import { boardTraitLink } from "@/domain/trait-performance";
import { editorLink, itemLink, ownerEditorPath, posterShareLink, readPosterShare, type PosterShare } from "@/domain/links";
import { posterStageTitle } from "@/domain/poster";
import { boardStages, readTeamStage, stageLabels } from "@/domain/team-stages";
import { traitCounts, traitGroup, usedPopulation } from "@/domain/team";
import { displayTraitNames } from "@/domain/trait-names.mjs";
import { heroAugmentForGuide, heroAugmentCategory, omitRepeatedHeroEntry } from "@/domain/hero-augments";
import familyData from "@/data/guide-family-stats.json";
import { guideFamilyRows, recommendationTier, type GuideFamilyBatch } from "@/domain/guide-family-stats";
import currentPatch from "@/data/current-patch.json";
import type { Section } from "@/domain/document";
import { boardRosterChange, familyVariants, groupGuides, type PosterVariant } from "@/domain/guide-families";
import { currentLaunchGuideFamily, guidePromotionRows, guideSameLevelSwaps, guideSystemDisplayBoards, guideSystemPhases, guideSystemSample, systemMeanTone, type GuideSystem } from "@/domain/guide-variant-strip";
import type { BoardStage, Season, Team } from "@/domain/types";
import { season } from "@/data";
import { sameEdition } from "@/domain/version-updates";
import "./guide-execution.css";

export type GuidePassage = { source: string; text: string; brief: boolean; blockId?: string; linked?: boolean };
export type GuidePatchAdvice = { teamId: string; note: string; label: string; href: string };

const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const familyStats = familyData as GuideFamilyBatch;
const sampleScopes = { fixed: "固定终盘", core: "核心样本", lineup: "名单共现", augment: "强化样本" };

function GuideVariantList({ id, overflow, children }: { id: string; overflow: boolean; children: ReactNode }) {
  const drag = useRef<{ pointerId: number; startX: number; startScroll: number } | null>(null);
  const dragged = useRef(false);

  function finishDrag(event: PointerEvent<HTMLUListElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
  }

  return <ul id={id} className="guide-variant-strip-list" role="list" data-overflow={overflow || undefined}
    onPointerDown={event => {
      dragged.current = false;
      const list = event.currentTarget;
      if (!overflow || event.pointerType !== "mouse" || event.button !== 0 || list.scrollWidth <= list.clientWidth) return;
      drag.current = { pointerId: event.pointerId, startX: event.clientX, startScroll: list.scrollLeft };
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (!start || start.pointerId !== event.pointerId || !(event.buttons & 1)) return;
      const list = event.currentTarget;
      const delta = event.clientX - start.startX;
      if (!dragged.current) {
        if (Math.abs(delta) < 6) return;
        dragged.current = true;
        list.dataset.dragging = "true";
        list.setPointerCapture(event.pointerId);
      }
      list.scrollLeft = start.startScroll - delta;
    }}
    onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={finishDrag}
    onDragStart={event => { if (drag.current) event.preventDefault(); }}
    onClickCapture={event => {
      if (!dragged.current || event.detail === 0) return;
      dragged.current = false;
      event.preventDefault();
      event.stopPropagation();
    }}>
    {children}
  </ul>;
}

export function GuideTeams({ section, data, initialTeam, defaultTeam, initialStage, initialFlex, publicationId, returnTo, renderHeader, renderNotes, variants, systems, openPoster, initialPosterShare, patchAdvice }: {
  section: Section; data: Season; initialTeam?: string; defaultTeam?: string; publicationId?: string; returnTo?: string; renderHeader?: (team: Team, performance?: ReactNode) => ReactNode;
  initialStage?: BoardStage; initialFlex?: string;
  renderNotes?: (team: Team, passages: GuidePassage[], roles: GuideRole[]) => ReactNode;
  variants?: Record<string, PosterVariant[]>; openPoster?: boolean; initialPosterShare?: PosterShare;
  systems?: GuideSystem[];
  patchAdvice?: GuidePatchAdvice[];
}) {
  const teams = primaryFirst(sectionTeams(section), section.primaryTeamId);
  const primary = teams[0];
  const defaultTeamId = defaultTeam ?? section.reroll?.entryTeamId ?? primary?.id;
  const [selectedTeam, setTeam] = useState(initialTeam ?? defaultTeamId);
  const [selectedStage, setSelectedStage] = useState(initialStage);
  const [selectedFlex, setSelectedFlex] = useState(initialFlex);
  const [selectedPiece, setPiece] = useState("");
  const [previousTeam, setPrevious] = useState("");
  const [showStage, setStage] = useState(false);
  const sampleId = useId();
  const variantOptionsId = useId();
  const [variantOpen, setVariantOpen] = useState(false);
  const variantTrigger = useRef<HTMLButtonElement>(null);
  const [sampleView, setSampleView] = useState<MatchStatsView>();
  const [routeNote, setRouteNote] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [showPoster, setShowPoster] = useState(!!openPoster);
  const [posterShare, setPosterShare] = useState(initialPosterShare);
  const [posterHistoryKey, setPosterHistoryKey] = useState(0);
  const [playerTeams, setPlayerTeams] = useState<Team[]>([]);
  const [officialView, setOfficialView] = useState<string>();
  const detailView = !!publicationId;
  const board = useRef<HTMLDivElement>(null);
  const matchDetails = useRef<HTMLDetailsElement>(null);
  const pieceTitle = useRef<HTMLHeadingElement>(null);
  const pieceOrigin = useRef<{ trigger: HTMLButtonElement; top: number } | null>(null);
  const { session, error: sessionError } = useOwnerSession();
  const cloudOwner = session?.isOwner && session.databaseConfigured;
  const canReadPlayerTeams = !!publicationId && sameEdition(data.id, season.id) && !cloudOwner && (!!session || !!sessionError);
  const team = teams.find(entry => entry.id === selectedTeam) ?? primary;
  useEffect(() => {
    if (!canReadPlayerTeams) return;
    function refreshPlayerTeams() {
      try { setPlayerTeams(readPlayerTeams()); }
      catch { setPlayerTeams([]); }
    }
    function refreshFromStorage(event: StorageEvent) {
      if (event.key === null || isPlayerTeamStorageKey(event.key)) refreshPlayerTeams();
    }
    refreshPlayerTeams();
    window.addEventListener("storage", refreshFromStorage);
    window.addEventListener("pageshow", refreshPlayerTeams);
    return () => {
      window.removeEventListener("storage", refreshFromStorage);
      window.removeEventListener("pageshow", refreshPlayerTeams);
    };
  }, [canReadPlayerTeams]);
  const localFamily = useMemo(() => variants ? undefined : groupGuides([section], data, teamPlacement)[0], [variants, section, data]);
  useEffect(() => {
    if (!publicationId) return;
    function navigate() {
      const params = new URL(window.location.href).searchParams;
      const wantsPoster = params.get("poster") === "1";
      setTeam(resolveBoardTeamId(section.id, params.get("team") ?? undefined) ?? defaultTeamId);
      setSelectedStage(boardStages.find(stage => stage === params.get("stage")));
      setSelectedFlex(params.get("flex") ?? undefined);
      setStage(false); setRouteNote(""); setPiece(""); setPrevious(""); setZoomed(false); setSampleView(undefined); setVariantOpen(false);
      setShowPoster(wantsPoster);
      setPosterShare(wantsPoster ? readPosterShare(params.get("posterFormat"), params.get("posterStages")) : undefined);
      setPosterHistoryKey(key => key + 1);
    }
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, [publicationId, defaultTeamId, section.id]);
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
  const launchStats = guideStatsLaunch(data.id);
  const currentSystem = systems?.find(system => system.sectionId === section.id && system.boardIds.includes(team.id));
  const systemBoards = currentSystem ? teams.filter(board => currentSystem.boardIds.includes(board.id)) : teams;
  const systemEntry = currentSystem && systemBoards.find(board => board.id === currentSystem.teamId);
  const displayedSystemBoards = currentSystem ? guideSystemDisplayBoards(section, systemBoards, team) : systemBoards;
  const formationId = rerollRoute(section, team)?.final.id ?? team.id;
  const siblings = variants?.[team.id] ?? variants?.[formationId] ?? (localFamily && familyVariants(localFamily, formationId));
  const mainStage = team.mainStage ?? "late";
  const authoredStages = boardStages.filter(stage => stage === mainStage || (stage !== "late" && team.stages?.[stage]?.pieces.length));
  const activeStage = selectedStage && authoredStages.includes(selectedStage) ? selectedStage : mainStage;
  const mainBoardActive = activeStage === mainStage;
  const flexPreview = mainBoardActive ? guideFlexPreview(section.id, team, data) : undefined;
  const showFlex = !!flexPreview && selectedFlex === flexPreview.id;
  const officialBoard = mainBoardActive ? showFlex ? flexPreview!.liveTeam : team
    : { ...readTeamStage(team, activeStage), id: team.id + "-" + activeStage };
  function boardViewLink(stage?: BoardStage, flex?: string) {
    return canonicalGuidePath(section.id, team.id, { from: returnTo, stage: stage === mainStage ? undefined : stage, flex });
  }
  const guideHref = publicationId ? boardViewLink(activeStage, showFlex ? flexPreview?.id : undefined) : undefined;
  const isVariantSystem = !!systems && systems.length >= 2 && !!currentSystem && currentSystem !== systems[0];
  const editorBoardName = guideBoardName(team);
  const editorTitle = guideEditorTitle(section.title, editorBoardName,
    isVariantSystem && !/变[种阵]/.test(editorBoardName) ? "变种" : "",
    !mainBoardActive ? stageLabels[activeStage] : "",
    showFlex && flexPreview ? flexPreview.incoming.name + "替" + flexPreview.outgoing.name : "");
  const sourceGuide = guideHref && { sectionId: section.id, teamId: team.id, href: guideHref, title: editorTitle };
  const localTeam = canReadPlayerTeams && sourceGuide ? findPlayerGuideTeam(playerTeams, sourceGuide) : undefined;
  const hasPlayerBoard = !!localTeam && !samePlayerBoard(localTeam, officialBoard);
  const showPlayerBoard = hasPlayerBoard && officialView !== guideHref;
  const shownBoard = showPlayerBoard && localTeam ? {
    ...officialBoard, pieces: localTeam.pieces, instrumentPositions: localTeam.instrumentPositions,
  } : officialBoard;
  const boardData = showPlayerBoard ? season : data;
  const posterBoard = showFlex || hasPlayerBoard ? shownBoard : team;
  const stageTeams = teams.filter(entry => guideBoardKind(section, entry, primary) === "过渡")
    .sort((a, b) => usedPopulation(a.pieces) - usedPopulation(b.pieces));
  const route = guideRoute(section, teams, team);
  const kind = guideBoardKind(section, team, primary);
  const mainRoute = !route && section.reroll && kind === "变阵" ? guideRoute(section, teams, primary) : undefined;
  const reviewedPhases = reviewedGuidePhases(section.id, teams, data);
  const authoredPhases = reviewedPhases ?? route?.phases;
  const fallbackPhases = (!currentSystem || systemBoards.includes(primary)) ? mainRoute?.phases.filter(step => step.team) : undefined;
  const sameLevelSwaps = guideSameLevelSwaps(section, displayedSystemBoards);
  const swapIds = new Set(sameLevelSwaps.map(({ board }) => board.id));
  const phaseBoards = displayedSystemBoards.filter(board => board.id === team.id || !swapIds.has(board.id));
  const phaseSteps = systemEntry ? guideSystemPhases(phaseBoards, systemEntry, team, authoredPhases ?? fallbackPhases ?? []) : authoredPhases;
  const linkedPhases = phaseSteps ?? fallbackPhases ?? [];
  const firstPhases = linkedPhases.length > 3 && linkedPhases.at(-1)?.team
    ? [...linkedPhases.slice(0, 2), linkedPhases.at(-1)!] : linkedPhases.slice(0, 3);
  const remainingPhases = linkedPhases.filter(step => !firstPhases.includes(step));
  const linkedChoices = route?.choices ?? mainRoute?.choices ?? [];
  const compactChoices = !detailView && linkedChoices.some(choice => choice.team?.boardRole === "variant");
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
  const equipmentConditions = guideEquipmentConditions(section, teams, data, undefined, team);
  const referenceConditions = guideReferenceConditions(section, teams, data, team);
  const inlineAugment = augment && equipmentConditions?.rows.some(row => row.id === augment.id);
  const augmentUnitName = inlineAugment ? data.units.find(unit => unit.id === augment.unitId)?.name : undefined;
  const heroGuide = !!augment || section.category === heroAugmentCategory;
  const familyRows = systems ? systems.flatMap(system => {
    const anchor = system.sectionId === section.id && teams.find(board => board.id === system.teamId);
    return anchor && system.stat ? [{ stat: system.stat, team: anchor, boards: teams.filter(board => system.boardIds.includes(board.id)) }] : [];
  }) : !launchStats || currentLaunchGuideFamily(familyStats, data.id, currentPatch)
    ? guideFamilyRows(familyStats, data.id, section.id, teams).filter(({ stat }) =>
      Boolean(stat.heroAugment) === heroGuide && (!launchStats || recommendationTier(stat) !== "review" && stat.games >= placementBatch.minGames))
    : [];
  const matchingFamily = familyRows.filter(row => row.boards.some(board => board.id === team.id));
  const overall = matchingFamily.length === 1 ? matchingFamily[0].stat : undefined;
  const showMatchStats = mainBoardActive && !showFlex;
  const placement = detailView && showMatchStats && !overall && !heroGuide
    ? guideCorePlacement(section, systemBoards, systemEntry?.id ?? team.id)
    : undefined;
  const overview = detailView && (showMatchStats ? overall ?? placement : undefined);
  const evidence = placement && placementEvidenceKind(placement);
  const scope = evidence ? sampleScopes[evidence] : "体系战绩";
  const patch = placement?.patch ?? familyStats.patch;
  const windowLabel = placement?.window ?? "近 " + familyStats.days + " 天";
  const mean = overview ? overview.mean : undefined;
  const meanLabel = overall ? "均名" : evidence === "core" ? "核心均名" : evidence === "lineup" ? "名单共现均名" : "均名";
  const topFour = overview && overview.topFourRate !== undefined && mean !== undefined
    ? percent.format(overview.topFourRate) : undefined;
  const win = overview && overview.winRate !== undefined && mean !== undefined
    ? percent.format(overview.winRate) : undefined;
  const tone = overall ? systemMeanTone(mean) : (placement?.tone ?? systemMeanTone(mean));
  function openMatchStats() {
    if (matchDetails.current) matchDetails.current.open = true;
    setSampleView(evidence === "core" || evidence === "lineup" ? "carry" : "family");
  }
  const performance = overall && <a className="guide-family-rating" href={showMatchStats ? "#" + sampleId : overall.url}
    onClick={() => setSampleView("family")} title={overall.sourceName + " · " + familyStats.patch + " · 近 " + familyStats.days + " 天"}>
    <span>均名</span><strong>{overall.mean.toFixed(2)}</strong><small>{overall.games.toLocaleString("zh-CN")} 场</small>
  </a>;
  const routeBoardIds = new Set([...linkedPhases, ...linkedChoices].map(step => step.team?.id));
  const otherStages = stageTeams.filter(option => !routeBoardIds.has(option.id) &&
    !section.reroll?.stages.some(stage => stage.teamId === option.id));
  const simpleStages = !systemEntry && !oceanBoards && !linkedPhases.length && !linkedChoices.length &&
    otherStages.length > 0 && otherStages.length < 3 && teams.length === otherStages.length + 1;
  const simpleBoards = [...otherStages, primary];
  const notes = readingNotes(section, team, data);
  const currentChoice = route?.choices?.find(choice => choice.team?.id === team.id);
  const openingText = currentChoice ? route?.opening || notes.opening : notes.opening;
  const introTeam = simpleStages ? primary : team;
  const introText = introTeam.id === team.id ? openingText : readingNotes(section, introTeam, data).opening;
  const boardPhaseIndex = phaseSteps?.findIndex(step => step.team?.id === team.id) ?? -1;
  const phaseIndex = routeNote ? (phaseSteps?.findIndex(step => step.label === routeNote) ?? -1) : boardPhaseIndex;
  const currentPhase = phaseIndex >= 0 ? phaseSteps?.[phaseIndex] : undefined;
  const nextPhase = currentPhase && phaseSteps?.[phaseIndex + 1];
  const nextBoard = nextPhase?.team;
  const advice = patchAdvice?.find(entry => entry.teamId === team.id);
  const entry = detailView ? sourceSummary(section) : undefined;
  const blocks = allBlocks(section.blocks);
  const passages: GuidePassage[] = [];
  const seenCopy = new Set<string>();
  for (const [raw, copyBoard] of [[entry, primary], [introText, introTeam], [openingText, team], [currentPhase?.text ?? currentChoice?.text, team]] as const) {
    const source = raw?.trim();
    if (!source || passages.some(passage => passage.source.includes(source))) continue;
    const separator = source.search(/[：:]/);
    const prefix = separator < 0 ? source : source.slice(0, separator).trim();
    const body = [copyBoard.name, guideBoardName(copyBoard), section.title].includes(prefix) ? source.slice(separator < 0 ? source.length : separator + 1).trim() : source;
    const block = blocks.find(block => block.type === "text" && !block.label && block.text?.trim() === source);
    const linked = block && hasGuideLinks(block);
    const visibleBody = inlineAugment ? omitRepeatedHeroEntry(body, augment, augmentUnitName) : body;
    const copyAdvice = copyBoard.id === team.id ? advice : patchAdvice?.find(entry => entry.teamId === copyBoard.id);
    const text = linked ? body : compactGuideParagraph(visibleBody, copyBoard, data, seenCopy, copyAdvice?.note);
    if (!text) continue;
    rememberGuideCopy(text, seenCopy);
    passages.push({ source, text, brief: !linked && !text.includes("\n") && text.length <= 90, blockId: block?.id, linked });
  }
  const otherVariants = alternatives.filter(option => !routeBoardIds.has(option.id));
  const separateVariants = otherVariants.filter(option => !siblings?.some(s => s.teamId === option.id));
  const stagedVariants = !!section.reroll && linkedPhases.length > 0 && !linkedChoices.length &&
    separateVariants.length > 0 && separateVariants.every(option => guideBoardKind(section, option, primary) === "变阵");
  const compactControls = compactChoices || stagedVariants;
  const otherSiblings = siblings?.filter(option => !routeBoardIds.has(option.teamId));
  const stageOptions = (routeBoardIds.has(primary.id) || separateVariants.some(option => option.id === primary.id)
    ? otherStages : [primary, ...otherStages]).filter(option => option.id !== team.id);
  const active = (entry: Team) => traitCounts(entry.pieces, boardData.units, boardData.traits, boardData.items).filter(trait => traitGroup(trait) === "已开常规");
  const counts = active(shownBoard);
  const name = (id: string) => boardData.units.find(unit => unit.id === id)?.name ?? id;
  const diff = (a: Pick<Team, "pieces">, b: Pick<Team, "pieces">) => {
    const remaining = b.pieces.map(piece => piece.unitId);
    return a.pieces.flatMap(piece => {
      const index = remaining.indexOf(piece.unitId);
      if (index === -1) return [piece];
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
  const comparisonBoard = showPlayerBoard ? shownBoard : team;
  const changed = prev ? Array.from({ length: 28 }, (_, i) => i).filter(pos => comparisonBoard.pieces.find(p => p.position === pos)?.unitId !== prev.pieces.find(p => p.position === pos)?.unitId) : [];
  const added = prev ? diff(comparisonBoard, prev).map(piece => name(piece.unitId)) : [];
  const removed = prev ? diff(prev, comparisonBoard).map(piece => name(piece.unitId)) : [];
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
    {!!nextAdded.length && <span><b>上</b> {nextAdded.map(piece => name(piece.unitId)).join("、")}</span>}
    {!!nextRemoved.length && <span><b>下</b> {nextRemoved.map(piece => name(piece.unitId)).join("、")}</span>}
  </div> : null;
  const region = section.generatedRegions?.[team.id];
  const picture = region && !section.reroll?.corrected.includes(team.id)
    ? blocks.find(block => block.id === region.imageId)
    : undefined;
  const piece = shownBoard.pieces.find(entry => entry.instanceId === selectedPiece);
  const unit = piece && boardData.units.find(entry => entry.id === piece.unitId);
  const shownRoles = showFlex && flexPreview
    ? notes.roles.map(role => ({ ...role, units: role.units.map(id => id === flexPreview.outgoing.id ? flexPreview.incoming.id : id) }))
    : mainBoardActive ? notes.roles : [];
  const mobileCoreRoles = shownRoles.filter(role => role.label === "主C" || role.label === "主坦")
    .map(role => ({ ...role, units: role.units.filter(id => shownBoard.pieces.some(piece => piece.unitId === id)) }))
    .filter(role => role.units.length > 0);
  const role = unit ? shownRoles.find(entry => entry.units.includes(unit.id)) : undefined;
  const pieceNote = role?.text && unit && augment?.unitId === unit.id
    ? compactUtilityCopy(role.text, unit.id, shownBoard, boardData)
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
  const parentId = section.reroll?.stages.find(stage => stage.teamId === team.id && stage.boardRole === "stage")?.parentTeamId;
  const stageParent = displayedSystemBoards.find(board => board.id === parentId);
  const capKind = stageParent ? guideBoardKind(section, team, stageParent) : kind;
  const cap = mainBoardActive && !swapIds.has(team.id) && (reviewedPhases ? reviewedPhases.at(-1)?.team.id === team.id
    : capKind === "上限" || currentPhase?.label.endsWith("级上限") ||
      (kind === "主阵" && formation && shownPopulation > Number(formation)));
  const boardTitle = cap ? shownPopulation + "级上限棋盘" : shownPopulation + " 人口棋盘";
  const selectedBoardLabel = mainBoardActive ? guideBoardName(team) : stageLabels[activeStage];
  const zoomTitle = showFlex && flexPreview ? `${selectedBoardLabel} · ${flexPreview.incoming.name}替${flexPreview.outgoing.name}` : selectedBoardLabel;
  const intro = passages[0]?.source === introText.trim() ? passages[0] : undefined;
  const phaseAdvice = passages.find(passage => passage !== intro && passage.brief && passage.text);
  const opening = intro?.brief && intro.text ? intro : undefined;
  const inStage = kind === "过渡";
  const canEditPositions = cloudOwner && publicationId && guideHref && mainBoardActive && !showFlex &&
    sameEdition(data.id, season.id) && !section.reroll?.added.includes(team.id);
  const openingUnderBoard = !simpleStages && (section.reroll || inStage || !!currentChoice);
  const stageCopy = [openingUnderBoard ? opening : undefined, phaseAdvice].filter(entry => entry !== undefined);
  const openingLine = mainBoardActive && !openingUnderBoard && opening && <p className="guide-opening" id={opening.blockId ? "note-" + opening.blockId : undefined}>{displayTraitNames(opening.text)}</p>;
  const tempoPassages = detailView && mainBoardActive ? passages.filter(passage => !passage.linked) : [];
  const nextStage = authoredStages[authoredStages.indexOf(activeStage) + 1];
  const nextSimpleBoard = simpleStages ? simpleBoards[simpleBoards.indexOf(team) + 1] : undefined;
  const nextTeam = nextBoard ?? nextSimpleBoard;
  const nextSetup = nextStage ? readTeamStage(team, nextStage) : mainBoardActive ? nextTeam : undefined;
  const nextLabel = nextStage ? stageLabels[nextStage] : mainBoardActive ? nextPhase?.label ?? (nextSimpleBoard && guideBoardName(nextSimpleBoard)) : undefined;
  const rosterChanges = detailView && nextSetup ? [
    { label: "上场", pieces: diff(nextSetup, shownBoard) },
    { label: "下场", pieces: diff(shownBoard, nextSetup) },
  ].filter(change => change.pieces.length > 0) : [];
  const nextStageCard = detailView && nextLabel && <div className="guide-next-stage">
    <div className="guide-next-stage-roster">
      <strong>下一阶段</strong>
      {rosterChanges.map(({ label, pieces }) =>
        <ul key={label} aria-label={label}>{pieces.map(piece => {
          const unit = boardData.units.find(unit => unit.id === piece.unitId);
          return <li key={piece.instanceId}><span>{label === "上场" ? "+" : "−"}</span>
            {unit?.image && <Image className={"cost-" + unit.cost} src={unit.image} width={26} height={26} alt="" unoptimized />}
            {unit?.name ?? piece.unitId}
          </li>;
        })}</ul>)}
    </div>
    <button type="button" aria-label={"切换到" + nextLabel} onClick={() => {
      if (nextStage) pickStage(nextStage);
      else if (nextTeam) pickTeam(nextTeam);
      else setRouteNote(nextLabel);
    }}>{nextLabel} <ArrowRight size={15} aria-hidden /></button>
  </div>;
  function stepLabel(label: string, index: number, detail?: string) {
    return <><span className="guide-step-number" aria-hidden>{index + 1}</span>
      <span className="guide-step-label">{label}{detail && <small>{detail}</small>}</span></>;
  }
  function currentStep(step: (typeof linkedPhases)[number]) {
    return routeNote || !step.team ? currentPhase?.label === step.label : step.team.id === team.id;
  }
  function phaseButton(step: (typeof linkedPhases)[number]) {
    const detail = "detail" in step && typeof step.detail === "string" ? step.detail : undefined;
    const label = compactChoices ? step.label.replace(/ · .*$/, "") : step.label;
    return <button type="button" key={step.team?.id ?? step.label} aria-label={compactChoices ? step.label : undefined}
      aria-pressed={currentStep(step)}
      onClick={() => step.team ? pickTeam(step.team) : setRouteNote(step.label)}>
      {detailView ? stepLabel(label, linkedPhases.indexOf(step), detail)
        : reviewedPhases ? <><strong>{step.label}</strong>{detail && <small>{detail}</small>}</> : label}
    </button>;
  }
  const phaseControls = !!firstPhases.length && <div className="stage-options guide-phases" role="group" aria-label="运营阶段">
    {firstPhases.map(phaseButton)}
  </div>;
  const simpleStageControls = simpleStages && <nav className="stage-options guide-phases guide-simple-stages" aria-label="棋盘阶段">
    {simpleBoards.map((board, index) => <button type="button" key={board.id} aria-pressed={board.id === team.id} onClick={() => pickTeam(board)}>
      {detailView ? stepLabel(guideBoardName(board), index) : guideBoardName(board)}
    </button>)}
  </nav>;
  const authoredStageControls = authoredStages.length > 1 && <div className="stage-options guide-phases" role="group" aria-label="棋盘阶段">
    {authoredStages.map((stage, index) => <button key={stage} type="button" aria-pressed={activeStage === stage} onClick={() => pickStage(stage)}>
      {detailView ? stepLabel(stageLabels[stage], index) : stageLabels[stage]}
    </button>)}
  </div>;
  const familyControls = !detailView && !!otherSiblings?.length && <details className="guide-family-fold"><summary>同套变种（{otherSiblings.length}）</summary>
    <ul className="guide-variant-links poster-variant-links">{otherSiblings.map(v => <li key={v.teamId}><a href={guideLink(v.sectionId, v.teamId, returnTo)}
      onClick={e => { const next = teams.find(t => t.id === v.teamId); if (next) { e.preventDefault(); pickTeam(next); } }}>
      <span>{v.title}{v.change && <small className="poster-change">{v.change}</small>}</span></a></li>)}</ul></details>;
  function optionStats(stat: ReturnType<typeof guideSystemSample>, scope?: string, source?: string, countOnly = false) {
    return <span className="guide-variant-option-stats" title={source}>
      {(!countOnly || scope) && <span className="guide-variant-mean-line">{scope && <small>{scope}</small>}
        {!countOnly && <strong data-tone={stat.tone} aria-label={stat.mean === "—" ? undefined : `均名 ${stat.mean}`}>{stat.mean}</strong>}
      </span>}
      <small>{stat.sample}</small>
    </span>;
  }
  function renderVariantStrip() {
    if (!systems || systems.length < 2) return null;
    return <nav className="guide-variant-strip" aria-label="同套变种" data-count={systems.length} data-mobile-open={variantOpen}>
      <div className="guide-variant-strip-head">
        <h3>同套变种（{systems.length}）</h3>
      </div>
      <button ref={variantTrigger} className="guide-mobile-variant-toggle" type="button" aria-expanded={variantOpen}
        aria-controls={variantOptionsId} onClick={() => setVariantOpen(open => !open)}>
        <span><small>当前变种</small><strong>{currentSystem?.title ?? selectedBoardLabel}</strong></span>
        <span>换变种 <ChevronDown size={16} aria-hidden /></span>
      </button>
      <GuideVariantList id={variantOptionsId} overflow={systems.length > 4}>{systems.map((system, index) => {
        const board = system.sectionId === section.id ? teams.find(option => option.id === system.teamId) : undefined;
        const current = system === currentSystem;
        const swap = !current && board ? boardRosterChange(systemEntry ?? team, board, data) : undefined;
        const change = swap?.describe() || system.change;
        const core = !system.stat && board && !heroGuide ? guideCorePlacement(section,
          teams.filter(option => system.boardIds.includes(option.id)), board.id, { boundOnly: true }) : undefined;
        const sample = guideSystemSample(system.stat ?? core);
        const source = system.stat ? `${system.stat.sourceName} · ${familyStats.patch} · 近 ${familyStats.days} 天`
          : core && [core.patch, core.window, core.sampleScope].filter(Boolean).join(" · ");
        const contents = <>
          <span className="guide-variant-option-copy">
            <strong>{system.title}</strong>
            {index > 0 && <small className="guide-variant-kind">变种</small>}
            {current && <small className="guide-variant-current">当前</small>}
            {change && <small className="guide-variant-change" title={change}>{swap?.describe(3) || change}</small>}
          </span>
          {(!launchStats || system.stat || core) && optionStats(sample,
            core && (placementEvidenceKind(core) === "lineup" ? "名单共现" : "核心均名"), source)}
        </>;
        return <li key={system.sectionId + ":" + system.teamId}>{board
          ? <button type="button" className="guide-variant-option" aria-pressed={current} onClick={() => {
            pickTeam(board);
            if (variantOpen) {
              setVariantOpen(false);
              variantTrigger.current?.focus({ preventScroll: true });
            }
          }}>{contents}</button>
          : <a className="guide-variant-option" href={guideLink(system.sectionId, system.teamId, returnTo)}>{contents}</a>}
        </li>;
      })}</GuideVariantList>
    </nav>;
  }
  function renderPromotionComparison() {
    if (!currentSystem) return null;
    const allRows = guidePromotionRows(displayedSystemBoards, board => teamPlacement(board, section, "fixed") ??
      (heroGuide ? teamPlacement(board, section, "augment") : undefined), placementBatch);
    const rows = launchStats ? allRows.filter(row => row.mean !== undefined) : allRows;
    const showComparison = allRows.length >= 2 && rows.some(row => row.games);
    const visibleIds = new Set(showComparison ? rows.map(row => row.board.id) : []);
    const fallbackChoices = [...new Set(sameLevelSwaps.filter(({ board, parent }) =>
      !visibleIds.has(board.id) || !visibleIds.has(parent.id)).flatMap(({ board, parent }) => [parent, board]))];
    const comparison = showComparison && <section className="guide-promotion-comparison" aria-label="上人口与补卡对照">
      <h3>上人口与补卡对照</h3>
      <p>同套棋盘停级和升人口后的结算名次，仅用于比较补卡。</p>
      <ul role="list">{rows.map(({ board, level, label, stat, scope, source, games, mean, note }) => {
        const current = mainBoardActive && !showFlex && board.id === team.id;
        return <li key={board.id}>
          <button type="button" className="guide-variant-option" aria-pressed={current}
            onClick={() => {
              if (board.id !== team.id) pickTeam(board);
              else if (showFlex) toggleFlex();
              else if (!mainBoardActive) pickStage(mainStage);
            }}>
            <span className="guide-variant-option-copy">
              <small className="guide-promotion-level">{swapIds.has(board.id) ? level + "级换卡" : label}</small>
              <strong>{guideBoardName(board)}</strong>{current && <small className="guide-variant-current">当前</small>}
              {note && <small className="guide-promotion-note">{note}</small>}
            </span>
            {optionStats(stat, scope, source, !!games && mean === undefined)}
          </button>
        </li>;
      })}</ul>
    </section>;
    return <>
      {comparison}
      {fallbackChoices.length > 0 && <div className="guide-flex-slot" role="group" aria-label="同级换卡">
        <strong className="guide-flex-label">同级换卡</strong>
        {fallbackChoices.map(option => <button key={option.id} type="button"
          aria-pressed={option.id === team.id} onClick={() => pickTeam(option)}>{guideBoardName(option)}</button>)}
      </div>}
    </>;
  }
  const boardActions = <div className="guide-board-actions">
    <button type="button" className="guide-zoom-trigger guide-board-zoom" aria-label="放大棋盘" title="放大棋盘" aria-haspopup="dialog" onClick={() => setZoomed(true)}>
      <Maximize2 size={16} aria-hidden />{detailView && <span>放大棋盘</span>}
    </button>
    <button type="button" className="guide-zoom-trigger guide-board-poster" aria-label="阵容一图流" aria-haspopup="dialog" onClick={() => setShowPoster(true)}>
      <ImageDown size={16} aria-hidden /><span>一图流</span>
    </button>
    {sourceGuide && sameEdition(data.id, season.id) && <GuideEditorLink team={officialBoard} title={editorTitle} href={sourceGuide.href}
      sourceGuide={sourceGuide}
      owner={cloudOwner} secondary={!!canEditPositions} focusUnit={shownRoles.find(role => role.label === "主C")?.units[0]}
      sharedConditions={sharedGuideEditorConditions(teams, section.id, canEditPositions || officialBoard.conditions ? team.id : undefined)}
      target={canEditPositions ? { publicationId, sectionId: section.id, teamId: team.id } : undefined} />}
    {canEditPositions && <GuideBoardPositionEditor key={team.id} publicationId={publicationId!}
      sectionId={section.id} teamId={team.id} title={editorTitle} href={guideHref!} />}
    {cloudOwner && mainBoardActive && (publicationId || !section.reroll?.added.includes(team.id)) && <details className="guide-owner-menu">
      <summary className="guide-zoom-trigger">更多</summary>
      <div className="guide-owner-menu-panel">
        {publicationId && <a href={ownerEditorPath + "?" + new URLSearchParams({ copy: team.id, publication: publicationId, section: section.id })}>复制到草稿</a>}
        {!section.reroll?.added.includes(team.id) && <a href={editorLink(team.id)}>修改原阵容</a>}
      </div>
    </details>}
  </div>;
  const strategy = detailView && !guidePlaystyle(section, team) ? guideFacets(section, team, data) : undefined;
  const style = strategy?.styleLabel ?? strategy?.style;
  const matchEvidence = showMatchStats ? guideMatchEvidence({
    team, teams: displayedSystemBoards, section, edition: data.id, augmentName: augment?.name, heroGuide, familyRows,
  }) : undefined;
  const matchStats = matchEvidence && (!launchStats || matchEvidence.populatedViews.length > 0) &&
    <GuideMatchStats key={team.id} id={sampleId} team={team} teams={displayedSystemBoards} section={section}
      stage={inStage} edition={data.id} heroGuide={heroGuide} evidence={matchEvidence}
      view={sampleView} onSelectView={setSampleView} onPickTeam={selectSampleTeam} />;
  const headerTools = <>
    {style && <span className="guide-playstyle-tag" title="打法">{style}</span>}
    {overview && mean !== undefined ? <div className="guide-title-stats">
      <a className="guide-title-mean" data-tone={tone} href={matchStats ? "#" + sampleId : overview.url}
        onClick={matchStats ? openMatchStats : undefined} target={matchStats ? undefined : "_blank"}
        rel={matchStats ? undefined : "noreferrer"} title={scope + " · " + patch + " · " + windowLabel}>
        {meanLabel} <strong>{mean.toFixed(2)}</strong>
      </a>
      {topFour && <span>前四率 <strong>{topFour}</strong></span>}
    </div> : performance}
    {boardActions}
  </>;
  const stageComparison = mainBoardActive && !showFlex && hasChanges && <details className="board-diff" key={"board-diff-" + team.id} aria-label="阶段变化">
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
  </details>;
  const conditions = <>
    {equipmentConditions && <GuideEquipmentConditions conditions={equipmentConditions} guideHref={guideHref} />}
    {referenceConditions && <GuideEquipmentConditions conditions={referenceConditions} guideHref={guideHref}
      anchored={!equipmentConditions} onViewBoard={() => pickTeam(referenceConditions.board)} />}
  </>;
  const tempo = (tempoPassages.length > 0 || mainBoardActive && (!!advice || !!notes.starHint) || !!equipmentConditions || !!referenceConditions) &&
    <section className="guide-tempo-card" aria-label="节奏与解锁要点">
      <h3>节奏与解锁要点</h3>
      {tempoPassages.map(passage => <p key={passage.source} id={passage.blockId ? "note-" + passage.blockId : undefined}>
        {passage.source === entry && <span className="guide-tempo-tag">进场</span>}{displayTraitNames(passage.text)}
      </p>)}
      {mainBoardActive && notes.starHint && <p className="star-hint">{notes.starHint}</p>}
      {mainBoardActive && advice && <p className="guide-patch-advice">
        <a className="guide-tempo-tag" href={advice.href}>{advice.label}</a>{displayTraitNames(advice.note)}
      </p>}
      {conditions}
    </section>;
  const stats = (overview || matchStats || stageComparison) && <section className="guide-overview-card" aria-label="对局表现">
    {overview && <>
      <div className="guide-overview-head">
        <h3>对局表现快览</h3>
        <a href={overview.url} target="_blank" rel="noreferrer" title={scope + " · " + windowLabel}>MetaTFT · {patch} ↗</a>
      </div>
      {mean !== undefined && <dl className="guide-overview-metrics">
        <div><dt>平均名次</dt><dd data-tone={tone}>{mean.toFixed(2)}</dd></div>
        <div><dt>前四率</dt><dd>{topFour ?? "—"}</dd></div>
        <div><dt>登顶率</dt><dd>{win ?? "—"}</dd></div>
      </dl>}
      <p className="guide-overview-source">
        {showPlayerBoard && "官方原盘 · "}{scope} · {windowLabel} · {overview.games.toLocaleString("zh-CN")} 场
        {placement && overview.games < placementBatch.minGames && " · 少量样本"}
      </p>
    </>}
    {!launchStats && inStage && showMatchStats && !overview && <p className="guide-overview-source">当前阶段暂无快览数据。</p>}
    {matchStats && (!inStage || overview ? <details className="guide-match-details" ref={matchDetails}>
      <summary>对局数据</summary>{matchStats}
    </details> : matchStats)}
    {stageComparison}
  </section>;
  return <>{renderHeader?.(team, detailView ? headerTools : performance)}<section className={`guide-reader${section.reroll ? " guide-reroll" : ""}`} aria-label="阵容棋盘与运营">
    {!detailView && simpleStageControls}
    {!detailView && openingLine}
    {!detailView && oceanBoards ? <div className="guide-board-options" role="group" aria-label="阵容方案">
      <div className="guide-variants guide-ocean-choices">{oceanBoards.map(board => {
        const name = guideBoardName(board);
        const stage = name.match(/^(\d+级[^·]*?)\s*·\s*(.+)$/);
        return <button key={board.id} type="button" aria-label={name} aria-pressed={board.id === team.id} onClick={() => pickTeam(board)}>
          {stage && <small>{stage[1].trim()}</small>}
          <span className="guide-variant-name">{stage?.[2] ?? name}</span>
        </button>;
      })}</div>
    </div> : <div className={`guide-board-options${compactControls ? " guide-board-options--compact" : ""}${reviewedPhases ? " guide-board-options--reviewed" : ""}`}>
      {detailView && simpleStageControls}
      {!detailView && phaseControls}
      {detailView && authoredStageControls}
      {!!remainingPhases.length && <details className="guide-extra-phases" open={detailView && remainingPhases.some(currentStep) || undefined}><summary>其他运营阶段</summary>
        <div className="stage-options">{remainingPhases.map(phaseButton)}</div>
      </details>}
      {!detailView && !!linkedChoices.length && <nav className="guide-variants guide-route-choices" aria-label="选择成型阵容">
        {linkedChoices.map(({label, team: option}) => option &&
          <button key={option.id} type="button" aria-label={compactChoices ? label : undefined} aria-pressed={option.id === team.id} onClick={() => pickTeam(option)}>
            <strong>{compactChoices ? label.replace(/^\d+级\s*·\s*/, "") : label}</strong>
          </button>)}
      </nav>}
      {!detailView && !simpleStages && separateVariants.some(option => option.id !== team.id) && <nav className={stagedVariants ? "guide-variants guide-route-choices" : "guide-variants"} aria-label="选择阵容方案">{separateVariants.map(option =>
        <button key={option.id} type="button" aria-pressed={option.id === team.id} onClick={() => pickTeam(option)}>
          {!stagedVariants && <span className="guide-variant-kind">{guideBoardKind(section, option, primary)}</span>}
          <span className="guide-variant-name">{guideBoardName(option)}</span>
        </button>)}</nav>}
      {familyControls}
    </div>}
    {detailView && renderVariantStrip()}
    <div className="reader-layout">
      <div className="reader-play">
        {!detailView && authoredStageControls}
        <div className="reader-board-title guide-board-head"><h3>{boardTitle}</h3>
          {detailView ? phaseControls : boardActions}
        </div>
        {detailView && mobileCoreRoles.length > 0 && <div className="guide-mobile-core" aria-label="棋盘核心">
          {mobileCoreRoles.map(role => <span key={role.label + ":" + role.units.join(",")}>
            <b>{role.label}</b> {role.units.map(name).join("、")}
          </span>)}
        </div>}
        {hasPlayerBoard && <div className="guide-player-board">
          <span>{showPlayerBoard ? "当前显示你的本机站位" : "当前显示官方原盘"}</span>
          <button type="button" className="guide-zoom-trigger" onClick={() => {
            setOfficialView(showPlayerBoard ? guideHref : undefined);
            setPiece(""); setZoomed(false);
          }}>{showPlayerBoard ? "查看官方原盘" : "切回我的站位"}</button>
        </div>}
        <div className="read-board" data-guide-team-id={team.id} ref={board}><Board data={boardData} pieces={shownBoard.pieces} instrumentPositions={shownBoard.instrumentPositions} targeting={null} selectedId={selectedPiece} changedPositions={showFlex && flexPreview ? [flexPreview.position] : mainBoardActive ? changed : undefined}
          onCell={(_, picked, trigger) => selectPiece(picked?.instanceId === selectedPiece ? "" : picked?.instanceId ?? "", trigger)} /></div>
        <div className="guide-board-footer">
          <ul className="read-traits" aria-label="已激活常规羁绊">{counts.map(trait => {
            const label = <><b>{trait.level}{trait.countMode === "stars" && "星"}</b>{trait.name}</>;
            return <li key={trait.id}>{publicationId && !showFlex && !showPlayerBoard
              ? <a href={boardTraitLink(trait.id, trait.level, section.id, team.id)} title={"查看" + trait.name + "各档战绩"}>{label}</a>
              : label}</li>;
          })}</ul>
        </div>
        {nextStageCard}
        {detailView && renderPromotionComparison()}
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
        {!detailView && mainBoardActive && (stageCopy.length > 0 || advice || nextPhase || notes.starHint) && <div className="guide-phase-workflow">
          {stageCopy.map((passage, index) => <p key={passage.source} id={passage.blockId ? "note-" + passage.blockId : undefined}>
            {index === 0 && advice && <a className="guide-patch-advice-chip" href={advice.href} title={displayTraitNames(advice.note)}>{advice.label}</a>}
            {displayTraitNames(passage.text)}
          </p>)}
          {notes.starHint && <p className="star-hint">{notes.starHint}</p>}
          {advice && !stageCopy.length && <p className="guide-patch-advice"><a href={advice.href}>{advice.label}</a> {displayTraitNames(advice.note)}</p>}
          {nextPhase && <div className="guide-next-phase">
            {nextRoster && <details className="guide-next-changes" key={nextBoard?.id ?? nextPhase.label}><summary>下一阶段换人</summary>{nextRoster}</details>}
            <button type="button" onClick={() => nextBoard ? pickTeam(nextBoard) : setRouteNote(nextPhase.label)}>
              {nextPhase.label} <ArrowRight size={15} aria-hidden />
            </button>
          </div>}
        </div>}
        {!detailView && stageComparison}
        {!route && notes.stage && !stageTeams.length && <button className="guide-stage-toggle" type="button" aria-expanded={showStage} onClick={() => setStage(!showStage)}>八人口过渡</button>}
        {!currentSystem && !oceanBoards && !simpleStages && !!otherStages.length && stageOptions.length === 1 && <button type="button" className="guide-stage-toggle"
          onClick={() => pickTeam(stageOptions[0])}>{guideBoardName(stageOptions[0])}</button>}
        {!currentSystem && !oceanBoards && !simpleStages && !!otherStages.length && stageOptions.length > 1 && <details className="guide-stage-list">
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
            const item = boardData.items.find(entry => entry.id === id);
            return item ? <a className="guide-item-link" href={itemLink(id, unit.id, guideHref)} key={i}><ItemIcon item={item} size={30} />{item.name}</a> : <span key={i}>{id}</span>;
          })}</div>}
          {pieceNote && <p>{pieceNote}</p>}
          {unit.id === "teemo" && notes.shortcuts.some(link => link.label === "热力与提莫") &&
            <a href={"#note-" + notes.shortcuts.find(link => link.label === "热力与提莫")!.blockId}>热力与提莫</a>}
          <UnitDetails embedded unit={unit} traits={boardData.traits} seasonId={boardData.id}
            defaultAugmented={augment?.unitId === unit.id} wornItems={piece.items} />
        </section>}
      </div>
      <aside className="guide-sidebar" aria-label={detailView ? "配装、运营与战绩" : "配装与进场条件"}>
        <GuideEquipment key={team.id + activeStage} team={shownBoard} data={boardData} roles={shownRoles} selectedPiece={selectedPiece}
          onSelectPiece={selectPiece} guideHref={guideHref} sectionId={section.id} guideStats={!showFlex && !showPlayerBoard} detailView={detailView} />
        {detailView ? <>{tempo}{stats}</> : conditions}
      </aside>
      <div className="reader-support">
        {mainBoardActive && renderNotes?.(team, detailView ? passages.map(passage => ({ ...passage, brief: !passage.linked })) : passages, notes.roles)}
        {!detailView && matchStats}
        {mainBoardActive && picture?.imageToken && <div className="reader-links">
        <div className="guide-actions">
          <a href={"/api/media/" + encodeURIComponent(picture.imageToken)} target="_blank" rel="noreferrer">飞书原图</a>
        </div>
        </div>}
      </div>
    </div>
    {showPoster && <GuidePoster key={posterHistoryKey} section={section} team={posterBoard} data={boardData} variants={posterVariants} initialShare={posterShare}
      boardLink={publicationId ? boardViewLink(activeStage, showFlex ? flexPreview?.id : undefined) : undefined}
      pickVariant={(v, format) => { const next = teams.find(t => t.id === v.teamId);
        if (next && v.sectionId === section.id) pickTeam(next);
        else window.location.assign(posterShareLink(guideLink(v.sectionId, v.teamId, returnTo), format));
      }} close={() => setShowPoster(false)} />}
    {zoomed && <GuideBoardZoom title={detailView ? zoomTitle : section.title} stage={boardTitle} team={shownBoard} data={boardData} roles={shownRoles}
      initialPiece={selectedPiece} guideHref={guideHref} changedPositions={showFlex && flexPreview ? [flexPreview.position] : mainBoardActive ? changed : undefined}
      onClose={() => setZoomed(false)} onInspect={picked => {
        setZoomed(false);
        selectPiece(picked.instanceId, board.current?.querySelectorAll<HTMLButtonElement>(".board-hex")[picked.position]);
        if (picked.instanceId === selectedPiece) requestAnimationFrame(() => pieceTitle.current?.focus());
      }} />}
  </section>
  </>;
}
