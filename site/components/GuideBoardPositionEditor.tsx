"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Move, Send, X } from "lucide-react";
import { season } from "@/data";
import { boardInstruments, moveBoardInstrument } from "@/domain/board-instruments";
import { boardContentVersion, boardLayout, sameBoardLayout } from "@/domain/published-board-layout";
import { movePiece } from "@/domain/team";
import type { BoardInstrumentId, Team } from "@/domain/types";
import { Board } from "./Board";
import { jsonPost, request } from "./api";
import "./guide-board-position-editor.css";

type Target = { publicationId: string; sectionId: string; teamId: string; title: string; href: string };

export function GuideBoardPositionEditor(target: Target) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="guide-zoom-trigger guide-position-trigger" aria-haspopup="dialog"
      title="修改当前公开棋盘站位" onClick={() => setOpen(true)}>
      <Move size={16} aria-hidden />改站位
    </button>
    {open && <PositionDialog {...target} onClose={() => setOpen(false)} />}
  </>;
}

function PositionDialog({ publicationId, sectionId, teamId, title, href, onClose }: Target & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [saved, setSaved] = useState<Team>();
  const [draft, setDraft] = useState<Team>();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const dirty = !!(saved && draft && !sameBoardLayout(boardLayout(saved), boardLayout(draft)));
  const endpoint = "/api/publication/board";

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const load = new AbortController();
    const query = new URLSearchParams({ publication: publicationId, section: sectionId, team: teamId });
    request<{ team: Team }>(endpoint + "?" + query, { signal: load.signal }).then(({ team }) => {
      setSaved(team);
      setDraft(team);
    }).catch(reason => {
      if (!load.signal.aborted) setError(reason.message);
    });
    return () => load.abort();
  }, [publicationId, sectionId, teamId]);

  function move(instanceId: string, position: number) {
    if (busy || published) return;
    setDraft(team => {
      if (!team || Object.values(team.instrumentPositions ?? {}).includes(position)) return team;
      const pieces = movePiece(team.pieces, instanceId, position);
      return pieces === team.pieces ? team : { ...team, pieces };
    });
    setSelected(null);
  }

  function moveInstrument(id: BoardInstrumentId, position: number) {
    if (busy || published) return;
    setDraft(team => team && moveBoardInstrument(team, season, id, position));
  }

  function close() {
    if (published) window.location.assign(href);
    else dialog.current?.close();
  }

  async function publish() {
    if (!saved || !draft || !dirty || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ team: Team }>(endpoint, jsonPost({
        publicationId, sectionId, team: draft, expectedBoard: boardContentVersion(saved),
      }));
      setSaved(result.team);
      setDraft(result.team);
      setSelected(null);
      setPublished(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "棋盘发布失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return <dialog ref={dialog} className="guide-position-dialog" aria-labelledby={heading} onClose={onClose}
    onCancel={event => {
      if (busy || dirty || published) event.preventDefault();
      if (published) close();
    }}>
    <header>
      <div><h2 id={heading}>修改攻略站位</h2><p>{title}</p></div>
      {!dirty && !published && <button type="button" className="btn ghost icon" aria-label="关闭" onClick={close}>
        <X size={18} aria-hidden />
      </button>}
    </header>
    {draft ? <div className="read-board">
      <Board pieces={draft.pieces} instrumentPositions={draft.instrumentPositions}
        targeting={selected ? "move" : null} selectedId={selected} readOnly={busy || published}
        onCell={(position, piece) => {
          if (selected && selected !== piece?.instanceId) move(selected, position);
          else setSelected(piece && !selected ? piece.instanceId : null);
        }}
        onMove={move}
        onMoveInstrument={boardInstruments(draft.pieces, season, draft.instrumentPositions).size ? moveInstrument : undefined}
        onSelectInstrument={() => setSelected(null)} />
    </div> : !error && <p role="status">正在读取公开棋盘…</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {published ? <p className="guide-position-hint" role="status">站位已发布，读者刷新即可看到。</p>
      : draft && <p className="guide-position-hint">拖动棋子，或点棋子再点目标格。发布只更新当前攻略的这张棋盘。</p>}
    <footer>
      <button type="button" className="btn secondary" disabled={busy} onClick={close}>{published ? "查看公开棋盘" : dirty ? "放弃修改" : "取消"}</button>
      {!published && <button type="button" className="btn primary" disabled={!dirty || busy} onClick={() => void publish()}>
        <Send size={15} aria-hidden />{busy ? "发布中…" : "保存并发布"}
      </button>}
    </footer>
  </dialog>;
}
