"use client";

import { useEffect, useState } from "react";
import { Pencil, SquarePen } from "lucide-react";
import type { SourceGuide, Team, TeamCondition } from "@/domain/types";
import { createId } from "@/domain/id";
import { ownerEditorPath } from "@/domain/links";
import { extractPublicGuideIdFromHref } from "@/domain/analytics";
import { trackToolAction } from "@/lib/analytics";
import { guideBoardTransferKey, type GuideBoardTarget } from "./guide-board-transfer";

export function GuideEditorLink({ team, title, href, focusUnit, secondary = false, owner = false, target, sourceGuide, sharedConditions, conditions }: {
  team: Team; title: string; href: string; focusUnit?: string; secondary?: boolean; owner?: boolean; target?: GuideBoardTarget;
  sourceGuide?: SourceGuide;
  sharedConditions?: TeamCondition[];
  conditions?: boolean;
}) {
  const label = conditions ? "编辑定阵条件" : !owner ? "带入编辑器" : target ? "带入工作区" : "另存到工作区";
  const help = !owner ? "带入编辑器，在此浏览器保存副本"
    : target ? "在站主工作区编辑，可发布到当前公开棋盘" : "带入站主工作区，可保存为独立草稿";
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
      const params = new URLSearchParams({ guideBoard: id });
      if (conditions) params.set("conditions", "1");
      window.location.assign((owner ? ownerEditorPath : "/editor") + "?" + params);
    } catch {
      setError("无法带入棋盘，请检查浏览器的站点存储设置。");
    }
  }

  if (conditions) return <>
    <button className="owner-page-pencil" type="button" onClick={openEditor} disabled={!ready} aria-label={label} title={label}>
      <Pencil size={15} aria-hidden />
    </button>
    {error && <span className="guide-editor-error" role="alert">{error}</span>}
  </>;
  return <div className="guide-editor-action">
    <button type="button" className={secondary ? "guide-zoom-trigger" : "guide-zoom-trigger guide-editor-link"} onClick={openEditor} disabled={!ready}
      aria-label={label} title={help}>
      <SquarePen size={16} aria-hidden /><span>{label}</span>
    </button>
    {error && <span className="guide-editor-error" role="alert">{error}</span>}
  </div>;
}
