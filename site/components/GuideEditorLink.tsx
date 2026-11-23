"use client";

import { useEffect, useState } from "react";
import { SquarePen } from "lucide-react";
import type { Team } from "@/domain/types";
import { guideBoardTransferKey } from "./guide-board-transfer";

export function GuideEditorLink({ team, title, href, focusUnit }: { team: Team; title: string; href: string; focusUnit?: string }) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  function openEditor() {
    try {
      const id = crypto.randomUUID();
      sessionStorage.setItem(guideBoardTransferKey, JSON.stringify({ id, team, title, href, focusUnit }));
      setError("");
      window.location.assign("/editor?" + new URLSearchParams({ guideBoard: id }));
    } catch {
      setError("无法带入棋盘，请检查浏览器的站点存储设置。");
    }
  }

  return <div className="guide-editor-action">
    <button type="button" className="guide-zoom-trigger guide-editor-link" onClick={openEditor} disabled={!ready}
      aria-label="带入编辑器" title="带入编辑器">
      <SquarePen size={16} aria-hidden /><span>带入编辑器</span>
    </button>
    {error && <span className="guide-editor-error" role="alert">{error}</span>}
  </div>;
}
