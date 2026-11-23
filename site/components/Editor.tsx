"use client";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  CircleCheck,
  Copy,
  CopyPlus,
  Eraser,
  FileText,
  ImageDown,
  Library,
  LoaderCircle,
  PanelTopClose,
  PanelTopOpen,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
  ChevronDown,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { equipItem, indexRecipes, wornCombinations, type EquipmentChoice } from "@/domain/equipment";
import { feishuBoardIssue } from "@/domain/document-flow";
import { guideLink } from "@/domain/guide-reading";
import { moveBoardInstrument } from "@/domain/board-instruments";
import type { HeroItemSample, HeroItemSource } from "@/domain/hero-insights";
import { unlockText } from "@/domain/unlocks";
import { feishuSection, manageLink } from "@/domain/links";
import { itemMap, season, unitLabel, unitMap } from "@/data";
import { itemReference } from "@/data/item-library";
import { akaliForms, conflictingForm, emptyTeam, equippedTraitIds, mixedForms, movePiece, relatedUnitIds, splitAlternate, stackPiece, switchAlternate, switchForm, teamFromCombo, teamText, traitCounts, usedPopulation } from "@/domain/team";
import { independentDraft } from "@/domain/roster-import";
import { boardStages, stageLabels, readTeamStage, writeTeamStage } from "@/domain/team-stages";
import type { BoardInstrumentId, BoardStage, Item, Piece, Team } from "@/domain/types";
import { QuickImport } from "./QuickImport";
import { BoardPivots } from "./BoardPivots";
import { Board } from "./Board";
import { EditorGearRecommendations } from "./EditorGearRecommendations";
import { EditorUnitDetails } from "./EditorUnitDetails";
import { MatrixDialog } from "./MatrixDetails";
import { ItemIcon } from "./ItemIcon";
import { Popover } from "./Popover";
import { Stars } from "./Glyphs";
import { TeamStrip } from "./TeamStrip";
import { TraitTracker } from "./TraitTracker";
import { SelectionSheet, UnitBrowser, UnitDetails, type BrowserFilters } from "./UnitBrowser";
import { request } from "./api";
import { downloadBlob, exportTeamImage } from "./export-team";
import { GuidePoster } from "./GuidePoster";
import { exportPlayerTeams, importPlayerTeams, isPlayerTeamStorageKey, readPlayerTeams, savePlayerTeam } from "./player-team-storage";
import "./editor-workspace.css";

const LOCAL_KEY = "tft-s19-unsynced-team-v1";
const equipmentRecipes = indexRecipes(season.items);
const CATEGORIES = ["待分类", "连胜", "连败", "次选", "条件定阵", "非常规构筑"];
const ITEM_GROUPS: { id: string; label: string }[] = [
  { id: "component", label: "基础散件" },
  { id: "completed", label: "合成装备" },
  { id: "emblem", label: "转职纹章" },
  { id: "team-size", label: "人口道具" },
  { id: "artifact", label: "神器" },
  { id: "support", label: "辅助装" },
  { id: "radiant", label: "光明装" },
];
type Toast = { kind: "ok" | "info" | "error"; text: string };
type Section = { id: string; title: string; level: number; category?: string };

function compatiblePlayerBackup(team: Team) {
  return boardStages.every(stage => {
    const { pieces } = readTeamStage(team, stage);
    const loadouts = pieces.flatMap(piece => piece.alternate ? [piece, piece.alternate] : [piece]);
    return pieces.length <= 28 &&
      new Set(pieces.map(piece => piece.position)).size === pieces.length &&
      new Set(loadouts.map(piece => piece.instanceId)).size === loadouts.length &&
      !mixedForms(pieces) &&
      loadouts.every(piece => unitMap.has(piece.unitId) && piece.items.length <= 3 && piece.items.every(id => itemMap.has(id)));
  });
}

/** 有内容才算草稿：有棋子、写了备注或改过名字。空阵容不提示恢复。 */
function meaningful(team: Team) {
  return (
    team.pieces.length > 0 ||
    !!team.notes.trim() ||
    team.name.trim() !== "未命名阵容" || team.category !== "待分类" || !!team.sectionId
  );
}
const same = (a?: Team, b?: Team) =>
  !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return (
    !!el &&
    (el.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
  );
}
const cellName = (position: number) =>
  `第${Math.floor(position / 7) + 1}排第${(position % 7) + 1}格`;

export function Editor({ ownerMode = false, initialTeams, commonItems, gearSource }: {
  ownerMode?: boolean;
  initialTeams?: Team[];
  commonItems: Record<string, HeroItemSample[]>;
  gearSource: HeroItemSource;
}) {
  const params = useSearchParams();
  const [quickOpen, setQuickOpen] = useState(params.get("import") === "roster");
  const [pivotsOpen, setPivotsOpen] = useState(false);
  const pivotTrigger = useRef<HTMLButtonElement>(null);
  const [previousImport, setPreviousImport] = useState<Team>();
  const quickTrigger = useRef<HTMLButtonElement>(null);
  const copyId = params.get("copy");
  const publicationId = params.get("publication");
  const sectionId = params.get("section");
  const copyQuery = ownerMode && copyId && publicationId && sectionId ? new URLSearchParams({ copy: copyId, publication: publicationId, section: sectionId }).toString() : "";
  const [sourceCopy, setSourceCopy] = useState<{ query: string; team: Team } | null>(null);
  const [copyError, setCopyError] = useState("");
  const [retryCopy, setRetryCopy] = useState(0);
  useEffect(() => {
    if (!copyQuery) return;
    let cancelled = false;
    setCopyError("");
    request<{ team: Team }>("/api/teams?" + copyQuery).then(({ team }) => {
      if (!cancelled) setSourceCopy({ query: copyQuery, team: {
        ...independentDraft(team, emptyTeam()), webTitle: team.webTitle,
        name: team.name.slice(0, 75) + " · 副本",
      } });
    }).catch(error => { if (!cancelled) setCopyError(error.message); });
    return () => { cancelled = true; };
  }, [copyQuery, retryCopy]);
  const incomingCombo = params.get("combo");
  const comboDraft = useMemo(() => incomingCombo ? teamFromCombo(incomingCombo, season.units, season.traits) : null, [incomingCombo]);
  const importKey = copyQuery || incomingCombo;
  const incomingDraft = copyQuery ? (sourceCopy?.query === copyQuery ? sourceCopy.team : null) : comboDraft;
  const handledCombo = useRef<string | null>(null);
  const [comboOrigin, setComboOrigin] = useState("");
  const [wantedForm, setWantedForm] = useState<string | null>(null);
  const incomingTeamId = ownerMode ? params.get("team") : null;
  const incomingUnitId = params.get("unit");
  const handledTeam = useRef<string | null>(null);
  const teamNeedsChoice = useRef<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<{ team: Team; message: string } | null>(null);
  const [receipt, setReceipt] = useState<Team | null>(null);
  const [draftTeam, setDraftTeam] = useState<Team>(emptyTeam);
  const backupInput = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<BoardStage>("late");
  const team = useMemo(() => readTeamStage(draftTeam, stage), [draftTeam, stage]);
  const [showPoster, setShowPoster] = useState(false);
  const [saved, setSaved] = useState<Team[] | null>(initialTeams ?? null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pieceSelection, setPieceSelection] = useState<{ id: string; highlightRelated?: boolean } | null>(null);
  const pieceId = pieceSelection?.id ?? null;
  const highlightRelated = pieceSelection?.highlightRelated === true;
  const [rightPane, setRightPane] = useState<"equipment" | "details">("equipment");
  const [notesOpen, setNotesOpen] = useState(false);
  const [mobileTool, setMobileTool] = useState<"units" | "gear" | "traits">("units");
  const workspaceSide = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!quickOpen && mobileTool === "gear" && window.matchMedia("(max-width: 760px)").matches) {
      workspaceSide.current?.scrollIntoView({ block: "nearest" });
    }
  }, [mobileTool, quickOpen, rightPane]);
  const [mobileReplace, setMobileReplace] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const commandRoot = useRef<HTMLDivElement>(null);
  const commandButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!commandsOpen) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !commandRoot.current?.contains(event.target)) setCommandsOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setCommandsOpen(false);
      commandButton.current?.focus();
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [commandsOpen]);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "export" | "writeback" | "import">(
    null,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [restore, setRestore] = useState<Team | null>(null);
  const [draftChecked, setDraftChecked] = useState(!ownerMode);
  const [history, setHistory] = useState<Team[]>([]);
  const [future, setFuture] = useState<Team[]>([]);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [sectionsError, setSectionsError] = useState("");
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [listBoardCollapsed, setListBoardCollapsed] = useState(false);
  const [gridBoardCollapsed, setGridBoardCollapsed] = useState(true);
  const [browserFilters, setBrowserFilters] = useState<BrowserFilters>({ query: "", cost: 0, traitIds: [], unlock: false, view: "cards" });
  const toggleTrait = useCallback((id: string) => {
    setBrowserFilters(current => ({
      ...current,
      traitIds: current.traitIds.includes(id)
        ? current.traitIds.filter(traitId => traitId !== id)
        : [...current.traitIds, id],
    }));
    setMobileTool("units");
  }, []);
  const busyRef = useRef(false);

  // 稳定回调读最新阵容用的引用（回调给 memo 组件，不随每次渲染变化）。
  const draftRef = useRef(draftTeam);
  const stageRef = useRef(stage);
  const teamRef = useRef(team);
  const showDraft = useCallback((next: Team, selectedStage: BoardStage = next.mainStage ?? "late") => {
    draftRef.current = next;
    stageRef.current = selectedStage;
    teamRef.current = readTeamStage(next, selectedStage);
    setDraftTeam(next);
    setStage(selectedStage);
  }, []);
  const pieceRef = useRef(pieceId);
  pieceRef.current = pieceId;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const notify = useCallback((next: Toast) => setToast(next), []);
  useEffect(() => {
    if (!toast || toast.kind === "error") return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const commit = useCallback((change: (prev: Team) => Team) => {
    const prev = teamRef.current;
    const next = change(prev);
    if (next === prev) return;
    const draft = draftRef.current;
    setHistory((values) => [...values.slice(-39), draft]);
    setFuture([]);
    showDraft(writeTeamStage(draft, stageRef.current, next), stageRef.current);
  }, [showDraft]);

  function selectStage(next: BoardStage) {
    if (stageRef.current === next) return;
    showDraft(draftRef.current, next);
    setHistory([]); setFuture([]);
    setSelectedId(null); setPieceSelection(null);
    setReplacement(null); setWantedForm(null); setMobileReplace(false);
    setMobileTool("units");
  }

  useEffect(() => {
    if (!ownerMode) {
      function refreshPlayerTeams() {
        try {
          setSaved(readPlayerTeams());
        } catch (error) {
          setSaved([]);
          notify({ kind: "error", text: error instanceof Error ? error.message : "暂时无法读取此浏览器保存的阵容。" });
        }
      }
      function refreshFromStorage(event: StorageEvent) {
        if (event.key === null || isPlayerTeamStorageKey(event.key)) refreshPlayerTeams();
      }
      refreshPlayerTeams();
      window.addEventListener("storage", refreshFromStorage);
      return () => window.removeEventListener("storage", refreshFromStorage);
    }
    if (initialTeams) return;
    request<{ teams: Team[] }>("/api/teams")
      .then((data) => setSaved(data.teams))
      .catch((error) => {
        setSaved([]);
        notify({ kind: "error", text: error.message });
      });
  }, [initialTeams, notify, ownerMode]);

  // 本地草稿：云端阵容到位后只判断一次。与某个云端阵容完全一致就静默打开。
  useEffect(() => {
    if (!ownerMode || !saved || draftChecked) return;
    setDraftChecked(true);
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Team;
      if (!meaningful(draft)) return localStorage.removeItem(LOCAL_KEY);
      if (saved.some((entry) => same(entry, draft))) {
        showDraft(draft);
        return;
      }
      setRestore(draft);
    } catch {
      notify({ kind: "error", text: "本地草稿无法读取；云端阵容仍可打开。" });
    }
  }, [saved, draftChecked, notify, ownerMode, showDraft]);

  useEffect(() => {
    if (!ownerMode || !draftChecked || restore) return;
    try {
      if (meaningful(draftTeam)) localStorage.setItem(LOCAL_KEY, JSON.stringify(draftTeam));
      else localStorage.removeItem(LOCAL_KEY);
    } catch {
      notify({
        kind: "error",
        text: "浏览器没能保存本地草稿，请及时保存到云端。",
      });
    }
  }, [draftTeam, restore, draftChecked, notify, ownerMode]);

  const known = saved?.find((entry) => entry.id === team.id);
  const dirty = known ? !same(known, draftTeam) : meaningful(draftTeam);
  const initializingPlayer = !ownerMode && saved === null;
  const incomingTeam = saved?.find((entry) => entry.id === incomingTeamId);
  useEffect(() => {
    if (incomingUnitId && unitMap.has(incomingUnitId)) {
      setSelectedId(incomingUnitId);
      setPieceSelection(null);
    }
  }, [incomingUnitId]);
  useEffect(() => {
    if (!incomingTeamId || handledTeam.current === incomingTeamId || !saved || !draftChecked) return;
    if (restore || dirty) { teamNeedsChoice.current = incomingTeamId; return; }
    if (teamNeedsChoice.current === incomingTeamId) return;
    handledTeam.current = incomingTeamId;
    if (incomingTeam) {
      showDraft(incomingTeam);
      setHistory([]);
      setFuture([]);
      setPieceSelection(null);
    }
  }, [incomingTeamId, incomingTeam, saved, draftChecked, restore, dirty, showDraft]);
  const finishCombo = useCallback((draft: Team | null) => {
    handledCombo.current = importKey;
    const url = new URL(window.location.href);
    for (const key of ["combo", "copy", "publication", "section"]) url.searchParams.delete(key);
    const origin = url.searchParams.get("from");
    url.searchParams.delete("from");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    if (!draft) return;
    setComboOrigin(copyQuery && sectionId && copyId ? guideLink(sectionId, copyId) : origin?.startsWith("/combos?") ? origin : "/combos");
    setRestore(null);
    showDraft(draft);
    setReplacement(null); setMobileReplace(false);
    setHistory([]); setFuture([]); setWantedForm(null);
    const focus = draft.pieces.find(p => p.stars === 2) ?? draft.pieces[0];
    setSelectedId(focus?.unitId ?? null);
    setPieceSelection(focus ? { id: focus.instanceId } : null);
    notify({ kind: "ok", text: copyQuery ? "棋盘已复制到新草稿" : "八人口组合已带入新草稿" });
  }, [importKey, copyQuery, sectionId, copyId, notify, showDraft]);
  useEffect(() => {
    if (!importKey || handledCombo.current === importKey || !draftChecked || !saved) return;
    if (copyQuery && !incomingDraft) return;
    if (!incomingDraft) {
      finishCombo(null);
      notify({ kind: "error", text: "组合链接无效或与当前赛季不符，请从八人口组合重新选择。" });
    } else if (!restore && !dirty) finishCombo(incomingDraft);
  }, [importKey, copyQuery, incomingDraft, draftChecked, saved, restore, dirty, finishCombo, notify]);
  const pendingTeam = incomingTeamId && handledTeam.current !== incomingTeamId;
  const writeIssue = feishuBoardIssue(draftTeam);
  const writableSections = sections?.filter((entry) => entry.level === 2 || entry.id === known?.sectionId) ?? [];
  const selected = selectedId ? unitMap.get(selectedId) : undefined;
  const piece = team.pieces.find((entry) => entry.instanceId === pieceId);
  const pieceUnit = piece && unitMap.get(piece.unitId);
  const matrixMode = browserFilters.view === "grid";
  const traitFocus = useMemo(() => {
    if (!highlightRelated || !piece || !pieceUnit || mobileReplace || matrixMode) return;
    const emblemTraits = equippedTraitIds(piece, itemMap);
    const traitIds = new Set([...pieceUnit.traits, ...emblemTraits]);
    const trayUnitIds = relatedUnitIds(piece.unitId, season.units, emblemTraits);
    const pieceIds = new Set(team.pieces.filter(entry =>
      trayUnitIds.has(entry.unitId) || equippedTraitIds(entry, itemMap).some(id => traitIds.has(id)),
    ).map(entry => entry.instanceId));
    return { traitIds, trayUnitIds, pieceIds };
  }, [highlightRelated, mobileReplace, matrixMode, piece, pieceUnit, team.pieces]);
  useEffect(() => {
    if (pieceId && !team.pieces.some((entry) => entry.instanceId === pieceId)) {
      setPieceSelection(null);
    }
  }, [team.pieces, pieceId]);
  const collapsed = matrixMode ? gridBoardCollapsed : listBoardCollapsed;
  const setCollapsed = matrixMode ? setGridBoardCollapsed : setListBoardCollapsed;
  const teamStars = useMemo(() => {
    const stars = new Map<string, number>();
    for (const entry of team.pieces) stars.set(entry.unitId, Math.max(stars.get(entry.unitId) ?? 0, entry.stars));
    return stars;
  }, [team.pieces]);
  const inTeam = useMemo(
    () => new Set(team.pieces.map((entry) => entry.unitId)),
    [team.pieces],
  );
  const counts = useMemo(
    () => traitCounts(team.pieces, season.units, season.traits, season.items),
    [team.pieces],
  );

  const place = useCallback(
    (position: number, unitId: string) => {
      if (!unitMap.has(unitId) || teamRef.current.pieces.some(p => p.position === position)) return;
      if (conflictingForm(teamRef.current.pieces, unitId)) {
        setWantedForm(unitId);
        return;
      }
      const added: Piece = { instanceId: crypto.randomUUID(), unitId, position, stars: 1, items: [] };
      commit(prev => ({ ...prev, pieces: [...prev.pieces, added] }));
      setSelectedId(unitId);
      setPieceSelection({ id: added.instanceId });
      setRightPane("equipment");
      setReplacement(null);
    },
    [commit],
  );
  const dropUnit = useCallback((position: number, unitId: string) => {
    const pieces = teamRef.current.pieces;
    if (!pieces.some(piece => piece.position === position)) return place(position, unitId);
    if (!unitMap.has(unitId)) return;
    const incoming: Piece = { instanceId: crypto.randomUUID(), unitId, position, stars: 1, items: [] };
    const next = stackPiece(pieces, incoming, position);
    if (next !== pieces) commit(current => ({ ...current, pieces: next }));
  }, [commit, place]);
  const addUnit = useCallback(
    (unitId: string) => {
      const pieces = teamRef.current.pieces;
      if (conflictingForm(pieces, unitId)) { setWantedForm(unitId); return; }
      const position = Array.from({ length: 28 }, (_, index) => index).find(
        (index) => !pieces.some((entry) => entry.position === index),
      );
      if (position === undefined) { setReplacement(unitId); return; }
      place(position, unitId);
    },
    [place],
  );
  function resolveForm(id: string) {
    const instance = teamRef.current.pieces.find(p => akaliForms.some(form => form === p.unitId));
    commit(prev => ({ ...prev, pieces: switchForm(prev.pieces, id) }));
    setWantedForm(null); setSelectedId(id);
    setPieceSelection(instance ? { id: instance.instanceId } : null);
    notify({ kind: "ok", text: "已切换形态，保留原站位、星级和装备。" });
  }
  const selectUnit = useCallback((id: string) => {
    setPieceSelection(null);
    setSelectedId((current) => (current === id ? null : id));
  }, []);
  const pickFromTray = useCallback((unitId: string) => {
    if (mobileReplace) {
      const current = teamRef.current.pieces;
      const target = current.find(entry => entry.instanceId === pieceRef.current);
      if (!target) { notify({ kind: "info", text: "先点棋盘上要换下的棋子。" }); return; }
      if (target.unitId === unitId) return;
      const conflict = conflictingForm(current, unitId);
      if (!conflict) setReplacement(unitId);
      else if (conflict.instanceId === target.instanceId) {
        setWantedForm(unitId);
        setMobileReplace(false);
      } else {
        notify({ kind: "info", text: "场上已有另一形态的阿卡丽，先选中她再切换。" });
      }
      return;
    }
    const placed = teamRef.current.pieces.find(entry => entry.unitId === unitId);
    if (!placed) { addUnit(unitId); return; }
    setPieceSelection({ id: placed.instanceId });
    setSelectedId(unitId);
    setRightPane("equipment");
  }, [addUnit, mobileReplace, notify]);
  const showUnlock = useCallback((unitId: string) => {
    setMobileReplace(false);
    setReplacement(null);
    setPieceSelection(null);
    setSelectedId(unitId);
    setRightPane("details");
    setMobileTool("gear");
  }, []);
  const selectInstrument = useCallback(() => {
    setPieceSelection(null);
    setSelectedId(null);
  }, []);
  const replaceSelected = useCallback(() => {
    const id = pieceRef.current;
    const current = teamRef.current;
    const previous = current.pieces.find(entry => entry.instanceId === id);
    if (!replacement || !previous || previous.unitId === replacement || conflictingForm(current.pieces, replacement)) return;
    const pieces = current.pieces.map(entry => entry.instanceId === id ? { ...entry, unitId: replacement, stars: 1 as const, items: [] } : entry);
    commit(prev => ({ ...prev, pieces }));
    setSelectedId(replacement);
    setRightPane("equipment");
    setMobileTool("gear");
    setReplacement(null);
    setMobileReplace(false);
  }, [commit, replacement]);
  const removePiece = useCallback(
    (instanceId: string) => {
      const pieces = teamRef.current.pieces;
      const current = pieces.find(entry => entry.instanceId === instanceId);
      if (!current) return;
      const { alternate, position } = current;
      const remaining = pieces.filter(entry => entry !== current);
      if (alternate && conflictingForm(remaining, alternate.unitId)) {
        notify({ kind: "info", text: "替补与场上阿卡丽形态冲突，请先调整形态。" });
        return;
      }
      const next = alternate
        ? pieces.map(entry => entry === current ? { ...alternate, position } : entry)
        : remaining;
      commit(prev => ({ ...prev, pieces: next }));
      if (pieceRef.current === instanceId) {
        setPieceSelection(null);
        setSelectedId(null);
      }
    },
    [commit, notify],
  );
  const movePieceTo = useCallback(
    (instanceId: string, position: number) => {
      const pieces = teamRef.current.pieces;
      const source = pieces.find(entry => entry.instanceId === instanceId);
      if (!source) return;
      const target = pieces.find(entry => entry.position === position);
      const next = target ? stackPiece(pieces, source, position) : movePiece(pieces, instanceId, position);
      if (next === pieces) return;
      commit(current => ({ ...current, pieces: next }));
      if (target) {
        setPieceSelection({ id: target.instanceId });
        setSelectedId(target.unitId);
        setRightPane("equipment");
      }
    },
    [commit],
  );
  const switchBoardAlternate = useCallback((instanceId: string) => {
    const pieces = teamRef.current.pieces;
    const alternate = pieces.find(piece => piece.instanceId === instanceId)?.alternate;
    if (!alternate) return;
    const next = switchAlternate(pieces, instanceId);
    if (next === pieces) {
      notify({ kind: "info", text: "场上已有另一形态的阿卡丽，无法换上这个替补。" });
      return;
    }
    commit(current => ({ ...current, pieces: next }));
    setPieceSelection({ id: alternate.instanceId });
    setSelectedId(alternate.unitId);
    setRightPane("equipment");
    setReplacement(null);
    setMobileReplace(false);
  }, [commit, notify]);
  const splitBoardAlternate = useCallback((instanceId: string, position: number) => {
    const pieces = teamRef.current.pieces;
    const next = splitAlternate(pieces, instanceId, position);
    if (next !== pieces) commit(current => ({ ...current, pieces: next }));
    else notify({ kind: "info", text: "场上已有另一形态的阿卡丽，无法拆出这个替补。" });
  }, [commit, notify]);
  const moveInstrumentTo = useCallback((id: BoardInstrumentId, position: number) => {
    if (!busyRef.current) commit(current => moveBoardInstrument(current, season, id, position));
  }, [commit]);
  // 点格子：点棋子 = 选中 / 取消；已选棋子时点空格 = 移动；只选了英雄时点空格 = 放置。
  const onCell = useCallback(
    (position: number, target?: Piece) => {
      if (mobileReplace) {
        if (!target) return;
        setPieceSelection({ id: target.instanceId });
        setSelectedId(target.unitId);
        return;
      }
      if (target) {
        if (pieceRef.current === target.instanceId && !replacement && (matrixMode || highlightRelated)) {
          setPieceSelection(null);
          setSelectedId(null);
        } else {
          setPieceSelection({ id: target.instanceId, highlightRelated: !matrixMode });
          setSelectedId(target.unitId);
          setRightPane("equipment");
          setMobileTool(current => matrixMode || current === "gear" ? "gear" : "units");
        }
        return;
      }
      if (replacement) return;
      if (pieceRef.current) return movePieceTo(pieceRef.current, position);
      if (selectedRef.current) return place(position, selectedRef.current);
      notify({ kind: "info", text: matrixMode ? "从羁绊网选棋子加入阵容。" : "拖到空格调整站位，拖到另一枚棋子上可叠放替补。" });
    },
    [highlightRelated, matrixMode, mobileReplace, movePieceTo, notify, place, replacement],
  );
  const changePiece = useCallback(
    (change: Partial<Piece>) => {
      const id = pieceRef.current;
      if (!id) return;
      commit((prev) => ({
        ...prev,
        pieces: prev.pieces.map((entry) =>
          entry.instanceId === id ? { ...entry, ...change } : entry,
        ),
      }));
    },
    [commit],
  );
  const historyRef = useRef(history);
  historyRef.current = history;
  const futureRef = useRef(future);
  futureRef.current = future;
  // 撤销 / 重做不回退云端版本号，避免保存时被当成旧版本冲突。
  const undo = useCallback(() => {
    const prev = historyRef.current.at(-1);
    if (!prev) return;
    const current = draftRef.current;
    setHistory(historyRef.current.slice(0, -1));
    setFuture([current, ...futureRef.current]);
    showDraft({ ...prev, revision: current.revision }, stageRef.current);
  }, [showDraft]);
  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    const current = draftRef.current;
    setFuture(futureRef.current.slice(1));
    setHistory([...historyRef.current, current]);
    showDraft({ ...next, revision: current.revision }, stageRef.current);
  }, [showDraft]);

  async function run(kind: "save" | "export" | "writeback" | "import", work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    try {
      await work();
    } catch (error) {
      notify({
        kind: "error",
        text: error instanceof Error ? error.message : "操作没有完成，草稿已保留。",
      });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  async function save(current = draftRef.current) {
    for (const option of boardStages) {
      if (mixedForms(readTeamStage(current, option).pieces))
        throw new Error(`请先选择${stageLabels[option]}棋盘保留的阿卡丽形态`);
    }
    const existing = saved?.find((entry) => entry.id === current.id);
    if (ownerMode && existing && same(existing, current)) return current;
    const savedTeam = ownerMode ? (await request<{ team: Team }>("/api/teams", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current),
      })).team : await savePlayerTeam(current);
    const openDraft = draftRef.current;
    if (openDraft.id === current.id) {
      const next = openDraft === current ? savedTeam : {
        ...openDraft, revision: savedTeam.revision, updatedAt: savedTeam.updatedAt,
      };
      showDraft(next, stageRef.current);
    }
    setSaved((prev) => [
      savedTeam,
      ...(prev ?? []).filter((entry) => entry.id !== savedTeam.id),
    ]);
    return savedTeam;
  }
  const saveNow = () =>
    run("save", async () => {
      if (!teamRef.current.name.trim())
        throw new Error("先给阵容起个名字再保存。");
      await save();
      notify({ kind: "ok", text: ownerMode ? "本次修改已保存" : "已保存到此浏览器" });
    });
  function activate(next: Team, message: string) {
    setPendingOpen(null);
    if (next.id === incomingTeamId) handledTeam.current = next.id;
    showDraft(next);
    setWantedForm(null);
    setComboOrigin("");
    setSelectedId(null);
    setPieceSelection(null);
    setReplacement(null);
    setMobileReplace(false);
    setCommandsOpen(false);
    setMobileTool("units");
    setHistory([]);
    setFuture([]);
    setRestore(null);
    notify({ kind: "info", text: message });
  }
  function open(next: Team, message: string) {
    if (dirty) {
      setPendingOpen({ team: next, message });
      return false;
    }
    activate(next, message);
    return true;
  }
  function clearBoard() {
    commit((current) => current.pieces.length ? { ...current, pieces: [], instrumentPositions: undefined } : current);
    setSelectedId(null);
    setPieceSelection(null);
    setWantedForm(null);
    notify({ kind: "info", text: `${stageLabels[stage]}棋盘已清空，可撤销。` });
  }

  async function loadSections(force = false) {
    if ((sections && !force) || sectionsLoading) return;
    setSectionsLoading(true);
    setSectionsError("");
    try {
      const data = await request<{ sections: Section[] }>("/api/document");
      setSections(data.sections);
    } catch (error) {
      setSectionsError(error instanceof Error ? error.message : "读取飞书章节失败");
    } finally {
      setSectionsLoading(false);
    }
  }

  // 快捷键；焦点在输入框里时不生效（Ctrl+S 除外）。
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (busyRef.current || (event.target instanceof Element && event.target.closest("dialog[open]"))) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
        return;
      }
      if (typing(event.target)) return;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        return event.shiftKey ? redo() : undo();
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        return redo();
      }
      if (mod || event.altKey) return;
      if (event.key === "Escape") {
        if (event.target instanceof Node && commandRoot.current?.contains(event.target)) return;
        setPieceSelection(null);
        setSelectedId(null);
        setReplacement(null);
        setMobileReplace(false);
        return;
      }
      const id = pieceRef.current;
      if (!id) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removePiece(id);
      } else if (["1", "2", "3"].includes(event.key)) {
        changePiece({ stars: Number(event.key) as 1 | 2 | 3 });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changePiece, redo, removePiece, undo]);

  const removeSelected = useCallback(() => {
    if (pieceRef.current) removePiece(pieceRef.current);
  }, [removePiece]);
  const confirmCraft = useCallback((name: string) =>
    notify({ kind: "ok", text: `已合成${name}` }), [notify]);

  const dossier = <>
    {piece && !matrixMode && <div className="editor-detail-tabs" role="group" aria-label="所选棋子">
      <button type="button" aria-pressed={rightPane === "equipment"} onClick={() => setRightPane("equipment")}>配装</button>
      <button type="button" aria-pressed={rightPane === "details"} onClick={() => setRightPane("details")}>资料</button>
    </div>}
    {piece && pieceUnit && (
      <div hidden={!matrixMode && rightPane !== "equipment"}>
      <PieceEditor
        key={piece.instanceId}
        piece={piece}
        commonItems={commonItems[piece.unitId]}
        gearSource={matrixMode ? undefined : gearSource}
        onChange={changePiece}
        onCraft={confirmCraft}
        onRemove={removeSelected}
      />
      </div>
    )}
    {(!piece || matrixMode || rightPane === "details") && (
      !matrixMode && selected
        ? <EditorUnitDetails key={selected.id} unit={selected}
            onAdd={!piece && !inTeam.has(selected.id) ? () => addUnit(selected.id) : undefined} />
        : <UnitDetails unit={selected} embedded={!!pieceUnit} inTeam={!!selected && inTeam.has(selected.id)} />
    )}
    {!matrixMode && <div className="editor-dossier-actions">
      {piece && rightPane === "equipment" && <button type="button" className="btn ghost sm" onClick={() => addUnit(piece.unitId)}>
        <CopyPlus size={14} aria-hidden />加入同名棋子
      </button>}
      <button type="button" className="btn ghost sm editor-notes-trigger" aria-haspopup="dialog" onClick={() => setNotesOpen(true)}>
        <FileText size={14} aria-hidden />阵容备注
      </button>
    </div>}
  </>;
  const noteField = (
    <label className="field">
      <span className="sr-only">阵容备注</span>
      <textarea
        value={team.notes}
        rows={4}
        maxLength={10000}
        onChange={(event) =>
          commit((prev) => ({ ...prev, notes: event.target.value }))
        }
        placeholder="主 C、替换位、过渡要点…"
      />
    </label>
  );

  const targeting = pieceId ? "move" : selectedId ? "place" : null;
  const population = usedPopulation(team.pieces);
  const replacementUnit = replacement ? unitMap.get(replacement) : undefined;
  const replacementBlocked = !piece || piece.unitId === replacement || (!!replacement && !!conflictingForm(team.pieces, replacement));
  const hint = mobileReplace
    ? (pieceUnit ? `选一张棋子替换${unitLabel(pieceUnit).base}` : "点要换下的棋子")
    : pieceUnit
    ? `点空格移动${unitLabel(pieceUnit).base}`
    : selected
      ? `点空格放置${unitLabel(selected).base}`
      : "";
  function toggleReplace() {
    setCommandsOpen(false);
    setReplacement(null);
    if (mobileReplace) { setMobileReplace(false); return; }
    setMobileReplace(true);
    setListBoardCollapsed(false);
    setPivotsOpen(false);
    setQuickOpen(false);
    setMobileTool("units");
    setBrowserFilters(current => ({ ...current, view: "cards" }));
  }
  const clearAction = <button type="button" className="btn ghost tb-stage-clear" disabled={!team.pieces.length}
    onClick={clearBoard} title={`清空${stageLabels[stage]}棋盘，可撤销`}>
    <Eraser size={15} aria-hidden />清空棋盘
  </button>;
  const sheetSummary: ReactNode = pieceUnit ? (
    <>
      <img src={pieceUnit.image} alt="" width={32} height={32} decoding="async" />
      <span>
        <strong>{pieceUnit.name}</strong>
        <small>
          {cellName(piece!.position)}
        </small>
      </span>
      <Stars count={piece!.stars} />
    </>
  ) : selected ? (
    <>
      <img src={selected.image} alt="" width={32} height={32} decoding="async" />
      <span>
        <strong>{selected.name}</strong>
        <small>{selected.cost} 费</small>
      </span>
    </>
  ) : undefined;

  return (
    <div className="editor">
      {!ownerMode && <input
        ref={backupInput}
        type="file"
        accept=".json,application/json"
        aria-label="本机阵容备份文件"
        hidden
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void run("import", async () => {
            const { added, copies } = await importPlayerTeams(await file.text(), draftRef.current.id, compatiblePlayerBackup);
            setSaved(readPlayerTeams());
            notify({ kind: "ok", text: `已导入 ${added} 套阵容到此浏览器${copies ? `，其中 ${copies} 套保存为副本` : ""}。` });
          });
        }}
      />}
      {showPoster && <GuidePoster team={draftTeam} data={season} close={() => setShowPoster(false)}
        setDefault={posterFormat => commit(prev => ({...prev, posterFormat}))} />}
      <h1 className="sr-only">阵容构建器</h1>
      {copyQuery && copyError && <div className="banner" role="alert">{copyError}<button onClick={() => setRetryCopy(v => v + 1)}>重新读取棋盘</button></div>}
      {copyQuery && !incomingDraft && !copyError && <p role="status">正在读取所选发布棋盘…</p>}
      {importKey && incomingDraft && handledCombo.current !== importKey && draftChecked && (restore || dirty) && (
        <div className="banner flow-banner" role="status">
          <span>有未保存的阵容「{(restore ?? team).name}」。带入后会另建一份草稿。</span>
          <button type="button" className="btn secondary sm" disabled={!!busy} onClick={() => run("save", async () => { await save(restore ?? draftTeam); finishCombo(incomingDraft); })}>保存当前并带入{copyQuery ? "棋盘" : "组合"}</button>
          <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => finishCombo(null)}>留在当前阵容</button>
        </div>
      )}
      {comboOrigin && <div className="flow-actions editor-entry"><a href={comboOrigin}>{comboOrigin.startsWith("/guides/") ? "返回所读棋盘" : "返回凑羁绊"}</a></div>}
      {pendingOpen && <div className="banner flow-banner" role="status">
        <span>「{team.name}」尚未保存。要切换到「{pendingOpen.team.name}」吗？</span>
        <button type="button" className="btn secondary sm" disabled={!!busy} onClick={() => run("save", async () => {
          await save(); activate(pendingOpen.team, pendingOpen.message);
        })}>保存当前并切换</button>
        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => activate(pendingOpen.team, pendingOpen.message)}>放弃当前修改并切换</button>
        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => setPendingOpen(null)}>继续编辑当前阵容</button>
      </div>}
      {restore && (
        <div className="banner">
          <span>
            发现上次没保存的本地草稿「{restore.name}」
            <small>{usedPopulation(restore.pieces)} 人口</small>
          </span>
          <button type="button" className="btn secondary sm" onClick={() => {
            if (open(restore, "已恢复本地草稿") && incomingUnitId && unitMap.has(incomingUnitId)) setSelectedId(incomingUnitId);
          }}>
            恢复草稿
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setRestore(null);
              localStorage.removeItem(LOCAL_KEY);
            }}
          >
            丢弃
          </button>
        </div>
      )}
      {incomingTeamId && saved && !incomingTeam && <p className="inline-error" role="alert">原阵容已删除或当前账号无权查看。</p>}
      {pendingTeam && incomingTeam && (
        <div className="banner flow-banner">
          <span>待打开「{incomingTeam.name}」{restore || dirty ? "，请先恢复并保存草稿，或明确丢弃当前修改。" : ""}</span>
          <button type="button" className="btn secondary sm" disabled={!!restore || !!busy} onClick={() => {
            if (open(incomingTeam, "已打开原阵容")) handledTeam.current = incomingTeamId;
          }}>打开原阵容</button>
        </div>
      )}
      {incomingUnitId && selectedId === incomingUnitId && selected && (
        <div className="flow-actions editor-entry">
          <a href={params.get("from")?.startsWith("/heroes?") ? params.get("from")! : "/heroes?unit=" + encodeURIComponent(selected.id)}>返回英雄资料</a>
        </div>
      )}
      {receipt && same(receipt, draftTeam) && (
        <div className="banner flow-banner" role="status">
          <span>飞书已写入并核验</span>
          <a href={feishuSection(receipt.sectionId)} target="_blank" rel="noreferrer">查看飞书</a>
          <a href={manageLink(receipt.sectionId)}>发布预览</a>
        </div>
      )}
      {(wantedForm || mixedForms(team.pieces)) && <div className="banner form-choice" role="alert">
        <span>{mixedForms(team.pieces) ? "这份旧阵容含两种阿卡丽，请选定一种形态。" : "阿卡丽已有另一形态。切换会保留场上阿卡丽的站位、星级和装备。"}</span>
        {(wantedForm ? [wantedForm] : akaliForms).map(id => <button type="button" className="btn secondary sm" key={id} disabled={!!busy || !!restore} onClick={() => resolveForm(id)}>使用{unitMap.get(id)?.name.split(" · ")[1]}</button>)}
        {wantedForm && <button type="button" className="btn ghost sm" onClick={() => setWantedForm(null)}>取消</button>}
      </div>}
      <fieldset className="editor-lock" disabled={initializingPlayer || !!busy || !!restore || !!pendingOpen} aria-busy={initializingPlayer || !!busy}>
      <div className="editor-toolbar">
        <div className="tb-group tb-identity">
          <input
            className="team-name-input"
            aria-label="阵容名称"
            value={team.name}
            maxLength={80}
            onChange={(event) =>
              commit((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <span className="select-field">
            <select
              aria-label="阵容分类"
              value={team.category}
              onChange={(event) =>
                commit((prev) => ({ ...prev, category: event.target.value }))
              }
            >
              {CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden />
          </span>
          <SaveState busy={busy === "save"} dirty={dirty} saved={!!known && !dirty} />
        </div>
        <div className="tb-commands" ref={commandRoot}>
        <button ref={commandButton} type="button" className="btn secondary tb-mobile-menu"
          aria-expanded={commandsOpen} aria-controls="editor-commands" onClick={() => setCommandsOpen(!commandsOpen)}>
          阵容菜单 <ChevronDown size={14} aria-hidden />
        </button>
        <div className="tb-command-panel" id="editor-commands" data-open={commandsOpen || undefined}
          onClick={event => {
            if (event.target instanceof Element && event.target.closest(".tb-board-actions button,.tb-menu-redo")) setCommandsOpen(false);
          }}>
        <div className="tb-group tb-board-actions">
          <button type="button" className="btn secondary" onClick={() => open(emptyTeam(), "已新建空阵容")}>
            <Plus size={15} aria-hidden />
            新建
          </button>
          {clearAction}
        </div>
        <div className="tb-group tb-menus">
          <Popover label={ownerMode ? "阵容库" : "我的阵容"} icon={<Library size={15} aria-hidden />}>
            {(close) => (
              <div className="menu">
                <div className="menu-actions">
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={() => {
                      close();
                      const current = draftRef.current;
                      open(
                        {
                          ...independentDraft(current, emptyTeam()),
                          webTitle: current.webTitle,
                          name: current.name.slice(0, 75) + " · 变种",
                        },
                          "已复制为变种，保存后成为新阵容",
                      );
                    }}
                  >
                    <CopyPlus size={14} aria-hidden />
                    复制为变种
                  </button>
                </div>
                {!ownerMode && <div className="menu-actions">
                  <button type="button" className="btn secondary sm" disabled={!!busy || !saved?.length}
                    onClick={() => void run("export", async () => {
                      downloadBlob(new Blob([exportPlayerTeams()], { type: "application/json" }), "云顶阵容备份.json");
                      close();
                      setCommandsOpen(false);
                      notify({ kind: "ok", text: "已导出此浏览器保存的阵容。" });
                    })}>
                    导出备份
                  </button>
                  <button type="button" className="btn secondary sm" disabled={!!busy}
                    onClick={() => {
                      backupInput.current?.click();
                      close();
                      setCommandsOpen(false);
                    }}>
                    导入备份
                  </button>
                </div>}
                <p className="menu-label">{ownerMode ? "云端阵容" : "此浏览器的阵容"} {saved ? saved.length : "…"}</p>
                {saved === null ? (
                  <p className="menu-empty">正在读取…</p>
                ) : saved.length ? (
                  <ul className="menu-list">
                    {saved.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={entry.id === team.id ? "is-current" : undefined}
                          onClick={() => {
                            close();
                            if (entry.id !== team.id) open(entry, `已打开「${entry.name}」`);
                          }}
                        >
                          <span className="menu-avatars">
                            {entry.pieces.slice(0, 4).map((p) => {
                              const unit = unitMap.get(p.unitId);
                              return unit && (
                                <img key={p.instanceId} src={unit.image} alt="" width={20} height={20} decoding="async" />
                              );
                            })}
                          </span>
                          <span className="menu-text">
                            <strong>{entry.name}</strong>
                            <small>
                              {entry.category} · {usedPopulation(entry.pieces)} 人口
                            </small>
                          </span>
                          {entry.id === team.id && <Check size={14} aria-label="当前" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="menu-empty">还没有保存过阵容。</p>
                )}
              </div>
            )}
          </Popover>
          <Popover label="导出" icon={<ImageDown size={15} aria-hidden />}>
            {(close) => (
              <div className="menu">
                <button type="button" className="menu-item" disabled={!!busy || !draftTeam.pieces.length || mixedForms(draftTeam.pieces)}
                  onClick={() => { close(); setCommandsOpen(false); setShowPoster(true); }}>
                  <ImageDown size={16} aria-hidden />
                  <span className="menu-text"><strong>阵容一图流</strong></span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!!busy || !team.pieces.length}
                  onClick={() =>
                    run("export", async () => {
                      const current = teamRef.current;
                      if (mixedForms(current.pieces)) throw new Error("请先为阿卡丽选择一种形态");
                      downloadBlob(await exportTeamImage(current), `${current.name}-${stageLabels[stageRef.current]}.png`);
                      close();
                      notify({ kind: "ok", text: "已下载棋盘图" });
                    })
                  }
                >
                  {busy === "export" ? <LoaderCircle size={16} className="spin" aria-hidden /> : <ImageDown size={16} aria-hidden />}
                  <span className="menu-text">
                    <strong>下载棋盘原图</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  disabled={!team.pieces.length || mixedForms(team.pieces)}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        teamText(teamRef.current, season.units, season.traits, season.items),
                      );
                      close();
                      notify({ kind: "ok", text: "阵容文字已复制。" });
                    } catch {
                      notify({ kind: "error", text: "浏览器没有允许写入剪贴板。" });
                    }
                  }}
                >
                  <Copy size={16} aria-hidden />
                  <span className="menu-text">
                    <strong>复制阵容文字</strong>
                  </span>
                </button>
              </div>
            )}
          </Popover>
          {ownerMode && <Popover
            label="飞书"
            icon={<FileText size={15} aria-hidden />}
            align="end"
            onOpen={() => void loadSections()}
          >
            {() => (
              <div className="menu feishu-menu">
                <p className="menu-label">
                  飞书章节
                  <button
                    type="button"
                    className="btn ghost icon sm"
                    aria-label="重新读取章节"
                    title="重新读取章节"
                    disabled={sectionsLoading}
                    onClick={() => void loadSections(true)}
                  >
                    <RefreshCw size={13} className={sectionsLoading ? "spin" : undefined} aria-hidden />
                  </button>
                </p>
                {sectionsError ? (
                  <p className="inline-error">{sectionsError}</p>
                ) : (
                  <span className="select-field block">
                    <select
                      aria-label="写入飞书章节"
                      value={team.sectionId ?? ""}
                      disabled={!sections}
                      onChange={(event) =>
                        commit((prev) => ({
                          ...prev,
                          sectionId: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">
                        {sections ? "选择章节" : "正在读取…"}
                      </option>
                      {writableSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.level !== 2 ? "原章节 · " : section.category + " / "}{section.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} aria-hidden />
                  </span>
                )}
                {sections && team.sectionId && !sections.some(entry => entry.id === team.sectionId) && <p className="inline-error">原章节已不存在。请在飞书恢复标题，或复制为变种后选择新章节。</p>}
                <p className="menu-note"><a href={feishuSection()} target="_blank" rel="noreferrer">在飞书添加二级标题</a></p>
                <button
                  type="button"
                  className="btn secondary block"
                  disabled={!!busy || !!writeIssue || mixedForms(team.pieces) || !team.sectionId || !writableSections.some((entry) => entry.id === team.sectionId)}
                  onClick={() =>
                    run("writeback", async () => {
                      const latest = await save();
                      const form = new FormData();
                      form.set("teamId", latest.id);
                      form.set("revision", String(latest.revision));
                      form.set("sectionId", latest.sectionId ?? "");
                      const {guidePoster} = await import("./guide-poster");
                      form.set("image", await guidePoster({team: latest, data: season}), "team.png");
                      const result = await request<{unchanged?: boolean}>("/api/writeback", { method: "POST", body: form });
                      setReceipt(latest);
                      notify({ kind: "ok", text: result.unchanged ? "飞书已是当前版本" : "飞书棋盘图已更新" });
                    })
                  }
                >
                  {busy === "writeback" ? (
                    <LoaderCircle size={15} className="spin" aria-hidden />
                  ) : (
                    <Send size={15} aria-hidden />
                  )}
                  保存并更新飞书
                </button>
                <p className="menu-note">
                  {writeIssue}
                  <a href={manageLink(team.sectionId)}>
                    发布管理
                    <ArrowUpRight size={12} aria-hidden />
                  </a>
                </p>
              </div>
            )}
          </Popover>}
        </div>
        <button type="button" className="btn ghost tb-menu-redo" onClick={redo} disabled={!future.length}>
          <Redo2 size={16} aria-hidden />重做
        </button>
        </div>
        </div>
        <button type="button" className="btn secondary tb-mobile-swap" disabled={!population} aria-pressed={mobileReplace}
          onClick={toggleReplace}>
          {mobileReplace ? "取消换人" : "换人"}
        </button>
        <div className="tb-group tb-history">
          <button type="button" className="btn ghost icon" disabled={!history.length} onClick={undo}
            title="撤销（Ctrl+Z）" aria-label="撤销">
            <Undo2 size={16} aria-hidden /><span>撤销</span>
          </button>
          <button type="button" className="btn ghost icon tb-desktop-redo" disabled={!future.length} onClick={redo}
            title="重做（Ctrl+Shift+Z）" aria-label="重做">
            <Redo2 size={16} aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="btn primary tb-save"
          disabled={!!busy || !team.name.trim() || mixedForms(team.pieces)}
          onClick={saveNow}
          title={ownerMode ? "保存到云端（Ctrl+S）" : "保存到此浏览器（Ctrl+S）"}
        >
          {busy === "save" ? (
            <LoaderCircle size={16} className="spin" aria-hidden />
          ) : (
            <Save size={16} aria-hidden />
          )}
          保存
        </button>
      </div>

      <div className={"workspace" + (matrixMode ? " matrix-workspace" : "") + (quickOpen ? " has-quick-import" : "")}
        data-editor-tool={mobileTool} data-replacing={mobileReplace || undefined}>
        <div className="workspace-main">
          <section className={`board-panel${collapsed ? " is-collapsed" : ""}`}>
            <header className="panel-head">
              <h2>
                站位
                <span className="count">{population} 人口</span>
                {population !== team.pieces.length && <small className="piece-count">{team.pieces.length} 枚</small>}
              </h2>
              <div className="editor-stages" role="group" aria-label="棋盘阶段">
                {boardStages.map(option => {
                  const size = usedPopulation(readTeamStage(draftTeam, option).pieces);
                  return <button key={option} type="button" aria-pressed={stage === option}
                    aria-label={stageLabels[option]} title={size ? `${stageLabels[option]} · ${size} 人口` : `${stageLabels[option]} · 空棋盘`}
                    onClick={() => selectStage(option)}>
                    {stageLabels[option]}{size > 0 && <span aria-hidden="true">{size}</span>}
                  </button>;
                })}
              </div>
              <button ref={quickTrigger} type="button" className="btn secondary sm quick-trigger" aria-expanded={quickOpen} aria-controls="quick-import" onClick={() => {
                setPivotsOpen(false);
                setQuickOpen(!quickOpen);
                if (!quickOpen) requestAnimationFrame(() => {
                  const panel = document.getElementById("quick-import");
                  panel?.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true });
                  panel?.scrollIntoView({ block: "nearest" });
                });
              }}>快速导入</button>
              {ownerMode && <button ref={pivotTrigger} type="button" className="btn secondary sm pivot-trigger" aria-controls="board-pivots" aria-expanded={pivotsOpen}
                onClick={() => {
                  if (!pivotsOpen) { setCollapsed(false); setQuickOpen(false); }
                  setPivotsOpen(!pivotsOpen);
                }}>找转阵</button>}
              <span className="panel-hint">{hint}</span>
              <div className="editor-stage-actions" role="group" aria-label="当前阶段操作">
                <button type="button" className="btn ghost sm stage-swap" disabled={!population}
                  aria-pressed={mobileReplace} onClick={toggleReplace}>{mobileReplace ? "取消换人" : "换人"}</button>
                {clearAction}
              </div>
              <button
                type="button"
                className="btn ghost icon sm"
                onClick={() => { setCollapsed(!collapsed); setPivotsOpen(false); }}
                aria-label={collapsed ? "展开棋盘" : "收起棋盘"}
                title={collapsed ? "展开棋盘" : "收起棋盘"}
              >
                {collapsed ? <PanelTopOpen size={15} aria-hidden /> : <PanelTopClose size={15} aria-hidden />}
              </button>
            </header>
            {previousImport && previousImport.id !== team.id && <button type="button" className="btn ghost sm quick-previous"
              onClick={() => open(previousImport, "已打开上一草稿")}>打开上一草稿</button>}
            {collapsed ? (
              <TeamStrip pieces={team.pieces} selectedId={pieceId} relatedPieceIds={traitFocus?.pieceIds} onSelect={onCell} />
            ) : (
              <div className={"board-layout" + (pivotsOpen ? " with-pivots" : "")}>
                {pivotsOpen ? <BoardPivots pieces={team.pieces} onClose={() => {
                  setPivotsOpen(false); pivotTrigger.current?.focus({ preventScroll: true });
                }} /> : <div className="tracker-col">
                  <TraitTracker counts={counts} selectedTraitIds={browserFilters.traitIds}
                    focusTraitIds={traitFocus?.traitIds} onToggleTrait={toggleTrait} compact />
                </div>}
                <div className="board-col">
                  <Board
                    key={team.id + stage}
                    pieces={team.pieces}
                    instrumentPositions={team.instrumentPositions}
                    selectedId={pieceId}
                    relatedPieceIds={traitFocus?.pieceIds}
                    targeting={targeting}
                    onCell={onCell}
                    onMove={movePieceTo}
                    onSwitchAlternate={switchBoardAlternate}
                    onSplitAlternate={splitBoardAlternate}
                    onMoveInstrument={moveInstrumentTo}
                    onSelectInstrument={selectInstrument}
                    onDropUnit={mobileReplace ? undefined : dropUnit}
                    onRemove={removePiece}
                  />
                </div>
              </div>
            )}
          </section>
          {replacementUnit && <section className="editor-replace" aria-label="替换棋子">
            <div><strong>{mobileReplace ? "换下" : "棋盘已满，可替换"}{pieceUnit ? unitLabel(pieceUnit).base : "棋盘上的棋子"}</strong>
            <p>{replacementUnit.name}{unlockText(replacementUnit) && ` · 解锁：${unlockText(replacementUnit)}`}</p></div>
            <button type="button" className="btn secondary sm" disabled={replacementBlocked} onClick={replaceSelected}>确认替换</button>
            <button type="button" className="btn ghost sm" onClick={() => { setReplacement(null); setMobileReplace(false); }}>取消</button>
          </section>}
          {!matrixMode && <div className="editor-mobile-tools" role="group" aria-label="编辑面板">
            <button type="button" aria-pressed={mobileTool === "units"} onClick={() => setMobileTool("units")}>棋子</button>
            <button type="button" aria-pressed={mobileTool === "gear"} onClick={() => { setMobileTool("gear"); setMobileReplace(false); setReplacement(null); }}>配装</button>
            <button type="button" aria-pressed={mobileTool === "traits"} onClick={() => { setCollapsed(false); setMobileTool("traits"); setMobileReplace(false); setReplacement(null); }}>羁绊</button>
          </div>}
          <UnitBrowser
            selectedId={selectedId}
            relatedTrayUnitIds={traitFocus?.trayUnitIds}
            onSelect={selectUnit}
            onAdd={addUnit}
            onTrayPick={pickFromTray}
            onTrayDetails={showUnlock}
            inTeam={inTeam}
            starsInTeam={teamStars}
            filters={browserFilters}
            multiTrait
            onFiltersChange={setBrowserFilters}
            matrixDetails={matrixMode ? dossier : null}
            matrixDetailLabel={piece ? "星级 / 配装" : "查看资料"}
          />
        </div>
        <aside className="workspace-side" ref={workspaceSide}>
          {quickOpen ? <QuickImport activeStage={stageLabels[stage]} hasStagePieces={team.pieces.length > 0} allowCatalog={ownerMode}
            onFillStage={source => {
              commit(prev => ({ ...prev, pieces: source.pieces, instrumentPositions: source.instrumentPositions }));
              setPieceSelection(null); setSelectedId(null); setWantedForm(null); setReplacement(null); setMobileReplace(false);
              setQuickOpen(false); quickTrigger.current?.focus({ preventScroll: true });
              notify({ kind: "ok", text: `已填入${stageLabels[stage]}棋盘，可撤销。` });
            }}
            dirty={dirty} busy={!!busy} onClose={() => {
            setQuickOpen(false);
            quickTrigger.current?.focus({ preventScroll: true });
          }} onImport={draft => {
            void run("save", async () => {
              const current = draftRef.current;
              const prior = dirty ? await save(current) : current;
              setPreviousImport(meaningful(prior) ? prior : undefined);
              activate(draft, "已建立草稿");
              setQuickOpen(false); setReceipt(null);
              quickTrigger.current?.focus({ preventScroll: true });
            });
          }} /> : <>
          {!matrixMode && <SelectionSheet
            key={piece ? piece.instanceId : "unit"}
            expandLabel={piece ? "星级 / 配装" : "查看资料"}
            summary={sheetSummary}
            action={
              !pieceUnit && selected ? (
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => addUnit(selected.id)}
                >
                  <Plus size={14} aria-hidden />
                  加入
                </button>
              ) : undefined
            }
            onClose={() => {
              setPieceSelection(null);
              setSelectedId(null);
            }}
          >
            {dossier}
          </SelectionSheet>}
          {matrixMode && <section className="team-notes"><details><summary>阵容备注</summary>{noteField}</details></section>}
          </>}
        </aside>
      </div>
      {notesOpen && <MatrixDialog title="阵容备注" closeLabel="关闭阵容备注" className="editor-notes-dialog" onClose={() => setNotesOpen(false)}>
        {noteField}
      </MatrixDialog>}
      <details className="editor-shortcuts">
        <summary>快捷键</summary>
        <ul>
          <li><kbd>Ctrl+S</kbd> 保存</li>
          <li><kbd>Ctrl+Z</kbd> 撤销</li>
          <li><kbd>Ctrl+Shift+Z</kbd> 重做</li>
          <li><kbd>Esc</kbd> 取消选择</li>
          <li><kbd>1</kbd>–<kbd>3</kbd> 改星级</li>
          <li><kbd>Delete</kbd> 或右键移除</li>
        </ul>
      </details>
      </fieldset>
      {toast && (
        <div
          className={`toast is-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          {toast.kind === "error" ? (
            <TriangleAlert size={16} aria-hidden />
          ) : (
            <CircleCheck size={16} aria-hidden />
          )}
          <span>{toast.text}</span>
          <button
            type="button"
            className="btn ghost icon sm"
            aria-label="关闭提示"
            onClick={() => setToast(null)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function SaveState({
  busy,
  dirty,
  saved,
}: {
  busy: boolean;
  dirty: boolean;
  saved: boolean;
}) {
  if (busy)
    return (
      <span className="save-state is-busy">
        <LoaderCircle size={12} className="spin" aria-hidden />
        保存中
      </span>
    );
  if (dirty)
    return (
      <span className="save-state is-dirty" title="修改已留在本浏览器，保存后写入云端">
        <i aria-hidden />
        未保存
      </span>
    );
  if (saved)
    return (
      <span className="save-state is-saved">
        <Check size={12} aria-hidden />
        已保存
      </span>
    );
  return null;
}

const PieceEditor = memo(function PieceEditor({
  piece,
  commonItems,
  gearSource,
  onChange,
  onCraft,
  onRemove,
}: {
  piece: Piece;
  commonItems?: HeroItemSample[];
  gearSource?: HeroItemSource;
  onChange: (change: Partial<Piece>) => void;
  onCraft: (name: string) => void;
  onRemove: () => void;
}) {
  const [itemQuery, setItemQuery] = useState("");
  const [itemTab, setItemTab] = useState<"recommendations" | "component" | "completed" | "special">();
  const tab = itemTab ?? (gearSource ? "recommendations" : "component");
  const [inspectItem, setInspectItem] = useState<Item>();
  const [replaceItem, setReplaceItem] = useState<Item>();
  const unit = unitMap.get(piece.unitId)!;
  const needle = itemQuery.trim();
  const available = useMemo(() => season.items.map(item => ({
    item, choice: equipItem(piece.items, item, equipmentRecipes),
  })), [piece.items]);
  const groups = ITEM_GROUPS.map(group => ({
    ...group,
    items: available.filter(({ item, choice }) => item.category === group.id &&
      (needle ? (item.name.includes(needle) || choice?.result?.name.includes(needle)) :
        tab === "special" ? !["component", "completed"].includes(group.id) : group.id === tab)),
  })).filter(group => group.items.length);
  const wornRecipes = wornCombinations(piece.items, equipmentRecipes);
  function applyChoice(choice: EquipmentChoice) {
    setReplaceItem(undefined);
    onChange({ items: choice.items });
    if (choice.result) onCraft(choice.result.name);
  }
  function pickEquipment(item: Item, choice = equipItem(piece.items, item, equipmentRecipes)) {
    if (choice) applyChoice(choice);
    else setReplaceItem(item);
  }
  const preview = inspectItem ? equipItem(piece.items, inspectItem, equipmentRecipes)?.result : undefined;
  const recipe = (item: Item) =>
    item.components?.length
      ? item.components.map((id) => itemMap.get(id)?.name ?? id).join(" + ")
      : "基础散件";
  return (
    <section className={`piece-editor cost-${unit.cost}`} aria-label="棋盘上的棋子">
      <header className="piece-head">
        <img src={unit.image} alt="" width={40} height={40} decoding="async" />
        <span>
          <strong>{unit.name}</strong>
          <small>{cellName(piece.position)}</small>
        </span>
        <button type="button" className="btn danger ghost sm" onClick={onRemove} title="移除（Delete）">
          <Trash2 size={14} aria-hidden />
          移除
        </button>
      </header>
      <div className="segmented stars-control" role="group" aria-label="星级">
        {([1, 2, 3] as const).map((stars) => (
          <button
            type="button"
            key={stars}
            aria-pressed={piece.stars === stars}
            aria-label={`${stars} 星`}
            onClick={() => onChange({ stars })}
          >
            <Stars count={stars} size={16} />
          </button>
        ))}
      </div>
      <div className="item-slots" role="group" aria-label={`${unit.name}的装备`}>
        {[0, 1, 2].map((index) => {
          const id = piece.items[index];
          const item = id ? itemMap.get(id) : undefined;
          return id ? (
            <button
              type="button"
              key={index}
              className="item-slot is-filled"
              aria-label={replaceItem ? `用${replaceItem.name}替换${item?.name ?? id}` : `卸下${item?.name ?? id}`}
              title={replaceItem ? `替换${item?.name ?? id}` : `卸下${item?.name ?? id}`}
              onClick={() => replaceItem
                ? applyChoice({ items: piece.items.map((worn, i) => i === index ? replaceItem.id : worn) })
                : onChange({ items: piece.items.filter((_, i) => i !== index) })}
            >
              <ItemIcon item={item} size={28} />
              <span>{item?.name ?? id}</span>
              {!replaceItem && <X size={12} className="slot-x" aria-hidden />}
            </button>
          ) : (
            <span key={index} className="item-slot">
              空槽
            </span>
          );
        })}
      </div>
      <div className="editor-equip-preview" role="status">
        {replaceItem ? <>
          <ItemIcon item={replaceItem} size={19} /><span>用{replaceItem.name}替换哪个装备？</span>
          <button type="button" className="btn ghost sm" onClick={() => setReplaceItem(undefined)}>取消</button>
        </> : preview && <>
          <ItemIcon item={preview} size={19} /><span>合成{preview.name}</span>
        </>}
      </div>
      {wornRecipes.length > 0 && (
        <div className="worn-recipes" role="group" aria-label="已装备散件可合成">
          {wornRecipes.map(choice => (
            <button type="button" key={choice.result.id} className="btn secondary sm"
              title={itemReference.items[choice.result.id]?.description || recipe(choice.result)} onClick={() => applyChoice(choice)}>
              <ItemIcon item={choice.result} size={20} />
              合成{choice.result.name}
            </button>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="item-picker">
          <label className="search-field sm">
            <Search size={14} aria-hidden />
            <input
              type="search"
              aria-label="搜索装备"
              placeholder="搜索装备"
              value={itemQuery}
              onChange={(event) => setItemQuery(event.target.value)}
            />
          </label>
          {!needle && <div className="editor-item-tabs" role="group" aria-label="装备分类">
            {gearSource && <button type="button" aria-pressed={tab === "recommendations"}
              onClick={() => setItemTab("recommendations")}>推荐</button>}
            {([["component", "散件"], ["completed", "成装"], ["special", "特殊装"]] as const).map(([id, name]) =>
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setItemTab(id)}>{name}</button>)}
          </div>}
          {tab === "recommendations" && !needle && gearSource
            ? <EditorGearRecommendations unit={unit} items={commonItems ?? []} gearSource={gearSource}
                onEquip={pickEquipment} onApplyBuild={ids => applyChoice({ items: [...ids] })} />
            : <div className="item-groups">
            {groups.map((group) => (
              <div key={group.id}>
                {(needle || tab === "special") && <p className="menu-label">{group.label}</p>}
                <div className="item-options">
                  {group.items.map(({ item, choice }) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-label={choice?.result ? `${item.name}，合成${choice.result.name}` : item.name}
                      title={`${item.name}${choice?.result ? " → " + choice.result.name : ""}：${itemReference.items[(choice?.result ?? item).id]?.description || recipe(choice?.result ?? item)}`}
                      onPointerEnter={() => setInspectItem(item)}
                      onPointerLeave={() => setInspectItem(undefined)}
                      onFocus={() => setInspectItem(item)}
                      onBlur={() => setInspectItem(undefined)}
                      onClick={() => pickEquipment(item, choice)}
                    >
                      <ItemIcon item={item} size={24} />
                      <span className="item-option-copy">
                        <span>{item.name}</span>
                        {choice?.result && <small>→ {choice.result.name}</small>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && <p className="menu-empty">没有匹配的装备。</p>}
          </div>}
        </div>
      )}
    </section>
  );
});
