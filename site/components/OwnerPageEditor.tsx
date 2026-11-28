"use client";

import { ChevronDown, ChevronUp, LayoutList, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { guideContentBlocks, homeContentBlocks, type GuideFields, type HomeFields, type OwnerContentTarget } from "@/domain/owner-content";
import { request } from "./api";
import "./owner-page-editor.css";

type Fields = GuideFields | HomeFields;
type ContentSnapshot<T extends Fields> = { revision: number; published: T; draft?: T };
type RecordState<T extends Fields> = ContentSnapshot<T> & { working: T };
type Panel = "identity" | "board" | "copy" | "layout" | "intro" | "recommendations" | "review";
export type RecommendationChoice = { sectionId: string; teamId: string; label: string };
type Recommendation = NonNullable<HomeFields["recommendations"]>[number];

const guideBlocks = { equipment: "核心配装", body: "节奏与解锁要点", conditions: "定阵条件", stats: "对局表现" } as const;
const homeBlocks = { intro: "首页介绍", recommendations: "本版推荐" } as const;
const headings = {
  identity: "攻略名称", board: "棋盘名称", copy: "攻略文案", layout: "区块顺序",
  intro: "首页介绍", recommendations: "本版推荐", review: "发布本页",
};

function targetKey(target?: OwnerContentTarget) {
  return !target ? "" : "home" in target ? "home" : target.sectionId + ":" + target.teamId;
}

export function useOwnerPageEditor<T extends Fields>(target?: OwnerContentTarget) {
  const router = useRouter();
  const key = targetKey(target);
  const query = !target ? "" : "home" in target ? "home=1" : new URLSearchParams({ section: target.sectionId, team: target.teamId }).toString();
  const [mode, setMode] = useState<"read" | "edit" | "preview">("read");
  const [records, setRecords] = useState<Record<string, RecordState<T>>>({});
  const [panel, setPanel] = useState<{ key: string; kind: Panel; entry?: string }>();
  const [feedback, setFeedback] = useState<{ key: string; error?: string; status?: string }>();
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const enabled = mode !== "read" && !!key;
  const editing = mode === "edit" && !!key;
  const record = records[key];
  const needsLoad = enabled && !record;
  const localError = feedback?.key === key ? feedback.error : undefined;
  const localStatus = feedback?.key === key ? feedback.status : undefined;
  const active = editing && panel?.key === key ? panel : undefined;

  useEffect(() => {
    if (!needsLoad) return;
    const controller = new AbortController();
    request<ContentSnapshot<T>>("/api/owner/content?" + query, { signal: controller.signal, cache: "no-store" })
      .then(result => setRecords(previous => ({ ...previous, [key]: { ...result, working: result.draft ?? result.published } })))
      .catch(error => {
        if (!controller.signal.aborted) setFeedback({ key, error: error.message });
      });
    return () => controller.abort();
  }, [key, needsLoad, query, retry]);

  function open(kind: Panel, entry?: string) {
    if (editing && !busy) setPanel({ key, kind, entry });
  }

  function change(fields: Partial<T>) {
    if (!record || busy) return;
    setRecords(previous => ({ ...previous, [key]: { ...previous[key], working: { ...previous[key].working, ...fields } } }));
    setFeedback(undefined);
  }

  async function persist(publish: boolean) {
    if (!target || !record || saving.current) return;
    saving.current = true;
    setBusy(true);
    setFeedback(undefined);
    try {
      const result = await request<ContentSnapshot<T>>("/api/owner/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, revision: record.revision, fields: record.working, publish }),
      });
      setRecords(previous => ({ ...previous, [key]: { ...result, working: result.draft ?? result.published } }));
      setFeedback({ key, status: publish ? "已发布" : "草稿已保存" });
      if (publish) {
        setPanel(undefined);
        router.refresh();
      }
    } catch (error) {
      setFeedback({ key, error: error instanceof Error ? error.message : "保存失败" });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const working = record?.working;
  const changed = Boolean(record && JSON.stringify(record.published) !== JSON.stringify(record.working));
  const unsaved = Boolean(record && JSON.stringify(record.draft ?? record.published) !== JSON.stringify(record.working));
  const previewFields = mode === "preview" && record && key ? Object.fromEntries(Object.keys(record.working).flatMap(field => {
    const name = field as keyof T;
    return JSON.stringify(record.published[name]) === JSON.stringify(record.working[name]) ? [] : [[field, record.working[name]]];
  })) as Partial<T> : undefined;
  return {
    available: !!key, enabled, editing, previewing: mode === "preview" && !!key, active, working, changed, unsaved,
    previewFields, authoringMode: mode === "edit",
    busy, error: localError, status: localStatus, open, change, persist,
    retry: () => { setFeedback(undefined); setRetry(value => value + 1); },
    close: () => setPanel(undefined),
    toggle: () => { setMode(enabled ? "read" : "edit"); setPanel(undefined); },
    preview: () => { setMode(mode === "preview" ? "edit" : "preview"); setPanel(undefined); },
  };
}

type Editor<T extends Fields> = ReturnType<typeof useOwnerPageEditor<T>>;

export function OwnerEditFlag<T extends Fields>({ editor }: { editor: Editor<T> }) {
  if (!editor.available) return null;
  const label = editor.enabled ? "退出页面编辑" : "编辑页面";
  return <button type="button" className="owner-page-flag" title={label} aria-label={label}
    aria-pressed={editor.enabled} disabled={editor.busy} onClick={editor.toggle}>
    {editor.enabled ? <X size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
  </button>;
}

export function OwnerInlineEdit({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="owner-page-pencil" title={label} aria-label={label} onClick={onClick}>
    <Pencil size={15} aria-hidden />
  </button>;
}

export function OwnerEditBar<T extends Fields>({ editor }: { editor: Editor<T> }) {
  if (!editor.enabled) return null;
  return <div className="owner-page-bar" aria-label="页面编辑操作">
    <span role="status">{editor.previewing ? "草稿预览" : editor.status ?? (editor.unsaved ? "草稿未保存" : "编辑模式")}</span>
    {editor.error && <span role="alert" className="owner-page-error">{editor.error}</span>}
    {!editor.working && editor.error && <button type="button" onClick={editor.retry}>重试</button>}
    {editor.editing && <button type="button" className="owner-page-layout" title="调整区块" aria-label="调整区块"
      disabled={!editor.working} onClick={() => editor.open("layout")}><LayoutList size={16} aria-hidden /></button>}
    <button type="button" disabled={!editor.working || editor.busy} onClick={editor.preview}>{editor.previewing ? "返回编辑" : "预览草稿"}</button>
    {editor.editing && <>
      <button type="button" disabled={!editor.unsaved || editor.busy} onClick={() => void editor.persist(false)}>保存草稿</button>
      <button type="button" className="owner-page-primary" disabled={!editor.changed || editor.busy} onClick={() => editor.open("review")}>发布</button>
    </>}
  </div>;
}

function OrderFields({ order, labels, onChange }: { order: string[]; labels: Record<string, string>; onChange: (order: string[]) => void }) {
  return <ol className="owner-page-order">{order.map((id, index) => <li key={id}>
    <span>{labels[id]}</span>
    {([-1, 1] as const).map(step => {
      const adjacent = index + step;
      const direction = step === -1 ? "上移" : "下移";
      const Icon = step === -1 ? ChevronUp : ChevronDown;
      return <button type="button" key={step} aria-label={direction + labels[id]} title={direction + labels[id]}
        disabled={adjacent < 0 || adjacent >= order.length}
        onClick={() => {
          const next = [...order];
          [next[index], next[adjacent]] = [next[adjacent], next[index]];
          onChange(next);
        }}><Icon size={16} aria-hidden /></button>;
    })}
  </li>)}</ol>;
}

function RecommendationFields({ fields, choices, selected, select, update }: {
  fields: HomeFields; choices: RecommendationChoice[]; selected?: string; select: (id: string) => void;
  update: (fields: Partial<HomeFields>) => void;
}) {
  const id = (row: Pick<Recommendation, "sectionId" | "teamId">) => row.sectionId + ":" + row.teamId;
  const choice = choices.find(item => id(item) === selected);
  const rows = fields.recommendations ?? [];
  const current = rows.find(row => id(row) === selected);
  function edit(patch: Partial<Recommendation>) {
    if (!choice) return;
    const next: Recommendation = { sectionId: choice.sectionId, teamId: choice.teamId, ...current, ...patch };
    const revised = next.override || next.timing?.trim() ?
      (current ? rows.map(row => row === current ? next : row) : [...rows, next]) : rows.filter(row => row !== current);
    update({ recommendations: revised });
  }
  return <>
    <label>攻略棋盘<select value={choice ? selected : ""} onChange={event => select(event.target.value)}>
      <option value="">选择棋盘</option>
      {choices.map(option => <option key={id(option)} value={id(option)}>{option.label}</option>)}
    </select></label>
    {choice && <>
      <label>本版推荐<select value={current?.override ?? ""} onChange={event => edit({ override: (event.target.value || undefined) as Recommendation["override"] })}>
        <option value="">自动</option><option value="pin">置顶</option><option value="include">手动补入</option><option value="exclude">撤下</option>
      </select></label>
      <label>进场时机<textarea rows={3} maxLength={240} value={current?.timing ?? ""}
        onChange={event => edit({ timing: event.target.value || undefined })} /></label>
    </>}
  </>;
}

function OwnerDrawer({ label, close, children, footer }: { label: string; close: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="owner-page-drawer" aria-labelledby={heading} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={heading}>{label}</h2><button type="button" aria-label="关闭编辑面板" onClick={close}><X size={20} aria-hidden /></button></header>
    <div className="owner-page-fields">{children}</div>
    <footer>{footer}</footer>
  </dialog>;
}

export function OwnerPageDrawer({ editor, ...props }: ({ editor: Editor<GuideFields>; kind: "guide"; scope: string } |
  { editor: Editor<HomeFields>; kind: "home"; scope: string; choices: RecommendationChoice[] })) {
  const panel = editor.active;
  if (!panel || !editor.working) return null;
  let body: ReactNode;
  if (panel.kind === "review") {
    body = <><p>{props.scope}</p><p>确认将草稿应用到公开页面。</p></>;
  } else if (props.kind === "guide") {
    const fields = editor.working as GuideFields;
    const change = editor.change as (fields: Partial<GuideFields>) => void;
    if (panel.kind === "identity") body = <label>攻略名称<input maxLength={120} value={fields.title} onChange={event => change({ title: event.target.value })} /></label>;
    if (panel.kind === "board") body = <label>棋盘名称<input maxLength={120} value={fields.boardTitle} onChange={event => change({ boardTitle: event.target.value })} /></label>;
    if (panel.kind === "copy") body = <>
      <label>全攻略进场说明<textarea rows={4} maxLength={1800} value={fields.opening} onChange={event => change({ opening: event.target.value })} /></label>
      <label>当前棋盘的运营<textarea rows={7} maxLength={6000} value={fields.notes} onChange={event => change({ notes: event.target.value })} /></label>
    </>;
    if (panel.kind === "layout") body = <OrderFields order={fields.blocks ?? [...guideContentBlocks]} labels={guideBlocks}
      onChange={blocks => change({ blocks: blocks as GuideFields["blocks"] })} />;
  } else {
    const fields = editor.working as HomeFields;
    const change = editor.change as (fields: Partial<HomeFields>) => void;
    if (panel.kind === "intro") body = <>
      <label>标题<input maxLength={120} value={fields.introTitle} onChange={event => change({ introTitle: event.target.value })} /></label>
      <label>首页介绍<textarea rows={6} maxLength={1800} value={fields.intro} onChange={event => change({ intro: event.target.value })} /></label>
    </>;
    if (panel.kind === "recommendations") body = <RecommendationFields fields={fields} choices={props.choices}
      selected={panel.entry} select={entry => editor.open("recommendations", entry)} update={change} />;
    if (panel.kind === "layout") body = <OrderFields order={fields.blocks ?? [...homeContentBlocks]} labels={homeBlocks}
      onChange={blocks => change({ blocks: blocks as HomeFields["blocks"] })} />;
  }
  return <OwnerDrawer key={panel.key + panel.kind} label={headings[panel.kind]} close={editor.close} footer={
    panel.kind === "review" ? <>
      <button type="button" disabled={editor.busy} onClick={editor.close}>返回</button>
      <button type="button" className="owner-page-primary" disabled={editor.busy} onClick={() => void editor.persist(true)}>发布到公开站</button>
    </> : <>
      <button type="button" onClick={editor.close}>完成</button>
      <button type="button" className="owner-page-primary" disabled={!editor.unsaved || editor.busy} onClick={() => void editor.persist(false)}>保存草稿</button>
    </>
  }>
    {body}
    {editor.error && <p className="owner-page-error" role="alert">{editor.error}</p>}
    {editor.status && panel.kind !== "review" && <small role="status">{editor.status}</small>}
  </OwnerDrawer>;
}
