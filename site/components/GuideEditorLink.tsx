"use client";

import { useEffect, useState } from "react";
import { SquarePen } from "lucide-react";
import type { SourceGuide, Team, TeamCondition } from "@/domain/types";
import { createId } from "@/domain/id";
import { ownerEditorPath } from "@/domain/links";
import { extractPublicGuideIdFromHref } from "@/domain/analytics";
import { trackToolAction } from "@/lib/analytics";
import { guideBoardTransferKey, type GuideBoardTarget } from "./guide-board-transfer";

export function GuideEditorLink({ team, title, href, focusUnit, secondary = false, owner = false, target, sourceGuide, sharedConditions }: {
  team: Team; title: string; href: string; focusUnit?: string; secondary?: boolean; owner?: boolean; target?: GuideBoardTarget;
  sourceGuide?: SourceGuide;
  sharedConditions?: TeamCondition[];
}) {
  const label = owner ? "带入工作区" : "带入编辑器";
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  function openEditor() {
    try {
      const id = createId();
      sessionStorage.setItem(guideBoardTransferKey, JSON.stringify({ id, team, title, href, focusUnit, target, sourceGuide, sharedConditions }));
      setError("");
      if (!owner) {
        trackToolAction({
          action: "editor_import_guide",
          guideId: sourceGuide?.sectionId ?? extractPublicGuideIdFromHref(href),
          surface: "guide",
        });
      }
      window.location.assign((owner ? ownerEditorPath : "/editor") + "?" + new URLSearchParams({ guideBoard: id }));
    } catch {
      setError("无法带入棋盘，请检查浏览器的站点存储设置。");
    }
  }

  return <div className="guide-editor-action">
    <button type="button" className={secondary ? "guide-zoom-trigger" : "guide-zoom-trigger guide-editor-link"} onClick={openEditor} disabled={!ready}
      aria-label={label} title={target ? "带入站主工作区，可发布原棋盘" : owner ? "带入站主工作区，保存云端副本" : "带入编辑器，在此浏览器保存副本"}>
      <SquarePen size={16} aria-hidden /><span>{label}</span>
    </button>
    {error && <span className="guide-editor-error" role="alert">{error}</span>}
  </div>;
}
