"use client";

import { useEffect, useState } from "react";
import { SquarePen } from "lucide-react";
import type { Team } from "@/domain/types";
import { ownerEditorPath } from "@/domain/links";
import { guideBoardTransferKey } from "./guide-board-transfer";

export function GuideEditorLink({ team, title, href, focusUnit, secondary = false, owner = false }: { team: Team; title: string; href: string; focusUnit?: string; secondary?: boolean; owner?: boolean }) {
  const label = owner ? "带入工作区" : "带入编辑器";
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  function openEditor() {
    try {
      const id = crypto.randomUUID();
      sessionStorage.setItem(guideBoardTransferKey, JSON.stringify({ id, team, title, href, focusUnit }));
      setError("");
      window.location.assign((owner ? ownerEditorPath : "/editor") + "?" + new URLSearchParams({ guideBoard: id }));
    } catch {
      setError("无法带入棋盘，请检查浏览器的站点存储设置。");
    }
  }

  return <div className="guide-editor-action">
    <button type="button" className={secondary ? "guide-zoom-trigger" : "guide-zoom-trigger guide-editor-link"} onClick={openEditor} disabled={!ready}
      aria-label={label} title={owner ? "带入站主工作区，可保存到云端" : "带入编辑器，在此浏览器保存副本"}>
      <SquarePen size={16} aria-hidden /><span>{label}</span>
    </button>
    {error && <span className="guide-editor-error" role="alert">{error}</span>}
  </div>;
}
