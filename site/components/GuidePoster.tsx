"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Link2, LocateFixed, Maximize2, Minimize2, Share2 } from "lucide-react";
import type { Section } from "@/domain/document";
import type { PosterVariant } from "@/domain/guide-families";
import { posterShareLink, type PosterShare } from "@/domain/links";
import { defaultPosterFormat, maxPosterStages, posterFormats, posterLayout, posterOperationTitle, posterStageOptions, posterStages, posterStageTitle, posterTitle, type PosterFormat } from "@/domain/poster";
import type { Season, Team } from "@/domain/types";
import { trackToolAction } from "@/lib/analytics";
import { MatrixDialog } from "./MatrixDetails";
import "./guide-poster-view.css";

export function GuidePoster({ section, team, data, variants, pickVariant, setDefault, initialShare, boardLink, close }: {
  section?: Section; team: Team; data: Season; variants?: PosterVariant[];
  pickVariant?: (variant: PosterVariant, format: PosterFormat) => void;
  setDefault?: (format: PosterFormat) => void; initialShare?: PosterShare; boardLink?: string; close: () => void;
}) {
  const [format, setFormat] = useState<PosterFormat>(() => initialShare?.format ?? defaultPosterFormat(team, section));
  const [selection, setSelection] = useState<{ teamId: string; ids: string[] } | undefined>(() =>
    initialShare?.stageIds ? { teamId: team.id, ids: initialShare.stageIds } : undefined);
  const [attempt, retry] = useState(0);
  const [fitQuick, setFitQuick] = useState(false);
  const options = useMemo(() => posterStageOptions(section, team), [section, team]);
  const stageIds = selection?.teamId === team.id ? selection.ids : undefined;
  const { stages: chosen, boards, operations, filename } = useMemo(
    () => posterLayout(section, team, data, format, stageIds),
    [section, team, data, format, stageIds],
  );
  const job = useMemo(() => ({ section, team, data, format, stageIds, attempt }),
    [section, team, data, format, stageIds, attempt]);
  const [result, setResult] = useState<{ job: typeof job; url?: string; file?: File; positions?: ReadonlyMap<string, number>; error?: string }>();
  const [shareError, setShareError] = useState<{ job: typeof job; message: string }>();
  const [copiedShare, setCopiedShare] = useState<{ link: string; fallback?: string }>();
  const preview = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    trackToolAction({ action: "poster_open", guideId: section?.id, surface: "poster" });
  }, [section?.id]);

  useEffect(() => {
    let active = true;
    let url: string | undefined;
    (async () => {
      const { guidePoster } = await import("./guide-poster");
      let positions: ReadonlyMap<string, number> | undefined;
      const blob = await guidePoster(job, offsets => { positions = offsets; });
      if (active) {
        url = URL.createObjectURL(blob);
        setResult({ job, url, file: new File([blob], filename, { type: blob.type }), positions });
      }
    })().catch(error => {
      if (active) setResult({ job, error: error instanceof Error ? error.message : "图片生成失败" });
    });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [job, filename]);

  const ready = result?.job === job ? result : undefined;
  const { title, subtitle } = posterTitle(section, team);
  const attachment = ready?.file ? { files: [ready.file] } : undefined;
  const canShare = attachment && typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.(attachment);
  const shareLink = boardLink && posterShareLink(boardLink, format, posterStages(section, team, stageIds).map(stage => stage.id));
  const previewBoards = [...boards, ...operations.flatMap(step => step.board ?? [])].map(board => {
    const name = posterStageTitle(board);
    return { id: board.id, name, level: name.match(/^\d+级/)?.[0] };
  });

  function jumpToBoard(id: string) {
    const offset = ready?.positions?.get(id);
    const pane = preview.current;
    const image = pane?.querySelector(".guide-poster-image");
    const scroll = pane && (getComputedStyle(pane).overflowY === "auto" ? pane : pane.closest<HTMLElement>(".matrix-dialog-body"));
    if (offset === undefined || !pane || !image || !scroll) return;
    const imageRect = image.getBoundingClientRect();
    const navHeight = pane.querySelector(".poster-preview-nav")?.getBoundingClientRect().height ?? 0;
    scroll.scrollTo({ top: scroll.scrollTop + imageRect.top - scroll.getBoundingClientRect().top + imageRect.height * offset - navHeight - 8 });
  }
  async function shareImage() {
    if (!attachment) return;
    trackToolAction({ action: "poster_share", guideId: section?.id, surface: "poster" });
    try {
      await navigator.share(attachment);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareError({ job, message: "可打开原图后长按保存" });
    }
  }
  async function copyPosterLink() {
    if (!shareLink) return;
    trackToolAction({ action: "poster_copy_link", guideId: section?.id, surface: "poster" });
    const url = new URL(shareLink, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShare({ link: shareLink });
    } catch {
      setCopiedShare({ link: shareLink, fallback: url });
    }
  }

  const downloadLabel = <><Download size={16} aria-hidden />下载图片</>;
  const canSetDefault = setDefault && format !== defaultPosterFormat(team, section);
  const hasBoardChoice = !!pickVariant && variants?.some(variant => variant.teamId !== team.id);
  const stageRows = team.stages || team.mainStage ? [...options, team] : [team, ...options];
  const boardNavigation = previewBoards.length > 1 && <div className="poster-preview-nav" role="group" aria-label="跳到预览棋盘">
    <span aria-hidden="true">跳到棋盘</span>
    {previewBoards.map(({ id, name, level }) => <button key={id} type="button" title={name}
      aria-label={"预览 " + name} disabled={!ready?.positions?.has(id)} onClick={() => jumpToBoard(id)}>
        {level && previewBoards.filter(board => board.level === level).length === 1 ? level : name}
      </button>)}
  </div>;
  return <MatrixDialog
    title="阵容一图流"
    onClose={close} className="guide-poster-dialog" closeLabel="关闭一图流"
    action={<div className="poster-save">
      {ready?.url ? <>
        <a className="poster-download" href={ready.url} download={ready.file?.name}
          onClick={() => trackToolAction({ action: "poster_download", guideId: section?.id, surface: "poster" })}>{downloadLabel}</a>
        <a className="poster-original" aria-label="打开原图" href={ready.url} target="_blank" rel="noreferrer"
          onClick={() => trackToolAction({ action: "poster_open_original", guideId: section?.id, surface: "poster" })}>原图</a>
      </> : <>
        <button type="button" className="poster-download" disabled>{downloadLabel}</button>
        <button type="button" className="poster-original" aria-label="打开原图" disabled>原图</button>
      </>}
    </div>}>
    <div className={`poster-workspace poster-workspace-${format}`}>
      <section className="poster-options" aria-label="一图流选项">
        {hasBoardChoice ? <label className="poster-board-select">
          <span>当前棋盘</span>
          <select aria-label="阵容方案" value={team.id} onChange={event => {
            const next = variants?.find(variant => variant.teamId === event.target.value);
            if (next) pickVariant?.(next, format);
          }}>
            {!variants?.some(variant => variant.teamId === team.id) &&
              <option value={team.id}>{title === team.name ? title : posterStageTitle(team)}</option>}
            {variants?.map(variant => <option key={variant.teamId} value={variant.teamId}>{variant.title}</option>)}
          </select>
        </label> : <p className="poster-board-caption">{subtitle || title}</p>}
        <fieldset className="poster-format-options">
          <legend className="sr-only">版式</legend>
          <div className="poster-formats">
            {(Object.keys(posterFormats) as PosterFormat[]).map(key => <button type="button" key={key} aria-pressed={format === key}
              onClick={() => setFormat(key)}>{posterFormats[key]}</button>)}
          </div>
        </fieldset>
        {format === "full" && !!options.length && <fieldset className="poster-stage-options" aria-label="过渡棋盘">
          <legend>导出棋盘</legend>
          {stageRows.map(board => {
            const main = board.id === team.id;
            const checked = main || chosen.some(stage => stage.id === board.id);
            const name = posterStageTitle(board);
            return <div key={board.id} className="poster-stage-line">
              {main ? <span className="poster-main-stage"><small>主图</small>{name}</span> : <label>
                <input type="checkbox" value={board.id} checked={checked}
                disabled={!checked && chosen.length >= maxPosterStages}
                onChange={event => {
                  const visibleStageIds = chosen.map(stage => stage.id);
                  setSelection({ teamId: team.id,
                    ids: event.target.checked ? [...visibleStageIds, board.id] : visibleStageIds.filter(id => id !== board.id) });
                }} />
                <span>{name}</span>
              </label>}
              {checked && <button type="button" className="poster-stage-locate" title={"在预览中查看" + name}
                aria-label={"预览 " + name} disabled={!ready?.positions?.has(board.id)} onClick={() => jumpToBoard(board.id)}>
                <LocateFixed size={16} aria-hidden />
              </button>}
            </div>;
          })}
        </fieldset>}
        {(canSetDefault || shareLink || canShare || !!operations.length) && <div className="poster-side-tools">
          {(canSetDefault || shareLink || canShare) && <div className="poster-secondary">
            {shareLink && <button type="button" className="poster-default" onClick={copyPosterLink}>
              <Link2 size={16} aria-hidden />复制链接
            </button>}
            {canShare && <button className="poster-default" type="button" onClick={shareImage}>
              <Share2 size={16} aria-hidden />分享图片
            </button>}
            {canSetDefault && <button type="button" className="poster-default" onClick={() => setDefault(format)}>设为默认版式</button>}
          </div>}
          {!!operations.length && <details className="poster-export-order">
            <summary>运营顺序</summary>
            <p className="poster-step-order">{operations.map(posterOperationTitle).join(" → ")}</p>
          </details>}
        </div>}
        {format === "quick" && <button type="button" className="poster-quick-fit" aria-pressed={fitQuick}
          onClick={() => { setFitQuick(!fitQuick); preview.current?.scrollTo(0, 0); }}>
          {fitQuick ? <Maximize2 size={15} aria-hidden /> : <Minimize2 size={15} aria-hidden />}
          {fitQuick ? "放大看" : "看全图"}
        </button>}
        {copiedShare && copiedShare.link === shareLink && (copiedShare.fallback
          ? <input className="poster-board-link" aria-label="一图流分享链接" value={copiedShare.fallback} readOnly onFocus={event => event.currentTarget.select()} />
          : <small className="poster-copy-status" role="status">已复制一图流链接</small>)}
        {shareError?.job === job && <p className="poster-share-error" role="alert">{shareError.message}</p>}
      </section>
      <div ref={preview} className={`poster-preview poster-preview-${format}${format === "quick" && fitQuick ? " poster-preview-fit" : ""}`} role="region" aria-label="一图流预览" tabIndex={0}>
        {boardNavigation && <div className="poster-reader-nav">{boardNavigation}</div>}
        {ready?.url ? <img className="guide-poster-image" src={ready.url}
          alt={[title, posterFormats[format], ...(boards.length > 1 ? boards.map(posterStageTitle)
            : [subtitle, ...chosen.map(posterStageTitle)])].join("，")}
          data-poster-team={team.id} data-poster-stages={chosen.map(stage => stage.id).join(",")} /> :
          <div className="poster-preview-message">{ready?.error
            ? <p role="alert">{ready.error} <button type="button" onClick={() => retry(n => n + 1)}>重试</button></p>
            : <p role="status">正在生成图片…</p>}
          </div>}
      </div>
    </div>
  </MatrixDialog>;
}
