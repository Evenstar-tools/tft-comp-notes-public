"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { findSection, readableSection, reviewIssues, sectionChanges, sectionTeams } from "@/domain/document-flow";
import { sourceSectionTitle } from "@/domain/source-category-display";
import { editorLink, feishuSection } from "@/domain/links";
import { authoredParagraphs, isEditorialSection } from "@/domain/guide-reading";
import { orderPosterStages, posterStageTitle } from "@/domain/poster";
import { usedPopulation } from "@/domain/team";
import { isVersionUpdate, versionUpdateLink } from "@/domain/version-updates";
import { getPublishedPatchRecommendations, patchRecommendationLabels, readablePatchIntroduction, sectionsAfterPartialPublish } from "@/domain/patch-recommendations";
import currentPatch from "@/data/current-patch.json";
import type { DocumentDraft, Publication, Section } from "@/domain/document";
import { DocumentView } from "./DocumentView";
import { request, jsonPost } from "./api";
interface State {
  draft: DocumentDraft | null;
  live: Publication | null;
  history: { id: string; created_at: string }[];
  jobs: { id: string; kind: string; status: string; updated_at: string }[];
}
function PreviewChoices({ section, busy, save }: { section: Section; busy: boolean; save: (teamId: string, blockId: string, stages: string[]) => void }) {
  const teams = sectionTeams(section);
  const [teamId, setTeam] = useState(section.primaryTeamId ?? teams[0]?.id ?? "");
  const [blockId, setBlock] = useState(section.summaryBlockId ?? "");
  const [stages, setStages] = useState(section.stageTeamIds ?? []);
  if (!teams.length) return null;
  const chosen = orderPosterStages(teams, stages).filter(team => team.id !== teamId);
  const choices = [...chosen, ...teams.filter(team => team.id !== teamId && !chosen.some(stage => stage.id === team.id))];
  function moveStage(id: string, direction: -1 | 1) {
    const ids = chosen.map(team => team.id);
    const index = ids.indexOf(id);
    const other = index + direction;
    if (!chosen[other] || usedPopulation(chosen[index].pieces) !== usedPopulation(chosen[other].pieces)) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    setStages(ids);
  }
  return <details className="preview-choices"><summary>主阵容与首页摘要</summary>
    <label>默认阵容<select value={teamId} onChange={event => setTeam(event.target.value)}>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    {choices.length > 0 && <fieldset><legend>主线过渡棋盘</legend>{choices.map(team => {
      const index = chosen.findIndex(stage => stage.id === team.id);
      return <div className="stage-choice-row" key={team.id}>
        <label className="stage-choice"><input type="checkbox" checked={index >= 0}
          onChange={event => setStages(ids => event.target.checked ? [...ids, team.id] : ids.filter(id => id !== team.id))} />{posterStageTitle(team)}</label>
        {index >= 0 && ([-1, 1] as const).filter(direction => {
          const neighbor = chosen[index + direction];
          return neighbor && usedPopulation(neighbor.pieces) === usedPopulation(team.pieces);
        }).map(direction => <button key={direction} className="stage-reorder" type="button"
          aria-label={(direction < 0 ? "上移 " : "下移 ") + posterStageTitle(team)}
          onClick={() => moveStage(team.id, direction)}>{direction < 0 ? "上移" : "下移"}</button>)}
      </div>;
    })}</fieldset>}
    <label>引用飞书原段落<select value={blockId} onChange={event => setBlock(event.target.value)}>
      <option value="">使用默认摘要</option>{authoredParagraphs(section).map(block => <option key={block.id} value={block.id}>{block.text?.slice(0, 90)}</option>)}</select></label>
    <button type="button" disabled={busy} onClick={() => save(teamId, blockId, chosen.map(stage => stage.id))}>保存到本次预览</button>
  </details>;
}
export function PublicationManager() {
  const requested = useSearchParams().get("section");
  const [published, setPublished] = useState<string[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [rollback, setRollback] = useState("");
  async function refresh() {
    const next = await request<State>("/api/publication");
    setState(next);
    return next;
  }
  useEffect(() => {
    refresh().catch((error) => setError(error.message));
  }, []);
  async function action(body: unknown, message: string) {
    setBusy(true);
    setError("");
    setStatus("");
    setPublished([]);
    try {
      await request("/api/publication", jsonPost(body));
      const next = await refresh();
      setSelected((ids) => ids.filter(id => {
        const current = next.draft?.sections.find(entry => entry.id === id && readableSection(entry) && !isEditorialSection(entry));
        const previous = state?.draft?.sections.find(entry => entry.id === id);
        return current && previous && !sectionChanges(current, previous).length;
      }));
      setRemoved([]);
      setStatus(message);
      return next;
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const sections = state?.draft?.sections.filter(entry => readableSection(entry) && !isEditorialSection(entry)) ?? [];
  const liveSections = state?.live?.sections ?? [];
  const previousById = new Map(liveSections.map(entry => [entry.id, entry]));
  const differences = new Map(sections.map(entry => [entry.id, sectionChanges(entry, previousById.get(entry.id))]));
  const changed = sections.filter(entry => differences.get(entry.id)?.length);
  const current = sections.filter(entry => !differences.get(entry.id)?.length);
  useEffect(() => {
    if (!state?.draft) return;
    const target = requested && findSection(sections, requested);
    setPreview(previous => target ? target.id : sections.some(entry => entry.id === previous) ? previous : changed[0]?.id ?? "");
  }, [state?.draft, requested]);
  const section = sections.find(entry => entry.id === preview);
  const issues = state?.draft ? reviewIssues(state.draft, liveSections) : undefined;
  function relevantIssues(id: string) {
    return (issues?.bySection.get(id) ?? []).filter(message =>
      !message.includes("· 旧棋盘存档」") || differences.get(id)?.length);
  }
  const pending = sections.filter(entry => selected.includes(entry.id));
  const previewIssues = section ? relevantIssues(section.id) : [];
  const requestedMissing = requested && state?.draft && !findSection(sections, requested);
  const missing = state?.draft ? liveSections.filter(entry => !sections.some(next => next.id === entry.id)) : [];
  const hasIntro = sections.some(entry => entry.id === "introduction");
  const recommendedSections = hasIntro
    ? sectionsAfterPartialPublish(liveSections, sections, [...new Set([...selected, "introduction"])], removed)
    : [];
  const recommendation = hasIntro
    ? getPublishedPatchRecommendations(recommendedSections, currentPatch.seasonId, currentPatch.build, currentPatch.effectiveAt)
    : undefined;
  const recommendationBlocked = selected.includes("introduction") && !!recommendation?.issues.length;
  const chapterTitle = (entry: Section) => entry.id === "introduction" && recommendation?.declared ? "环境观察与阵容推荐" : sourceSectionTitle(entry);
  function chapter(entry: Section) {
    const changes = differences.get(entry.id) ?? [];
    const count = relevantIssues(entry.id).length;
    return <div className="publish-section" key={entry.id}>
      <input type="checkbox" disabled={busy} aria-label={"发布 " + chapterTitle(entry)} checked={selected.includes(entry.id)}
        onChange={event => setSelected(values => event.target.checked ? [...values, entry.id] : values.filter(id => id !== entry.id))} />
      <button type="button" className={preview === entry.id ? "active" : ""} onClick={() => {
        setPreview(entry.id);
        if (window.matchMedia("(max-width: 760px)").matches) document.getElementById("draft-preview")?.scrollIntoView({ block: "start" });
      }}>
        <strong>{chapterTitle(entry)}</strong>
        {(changes.length > 0 || count > 0) && <small>{changes.join("、")}
          {count > 0 && <span className="publish-issue-count">{changes.length > 0 && " · "}{count} 项待核</span>}
        </small>}
      </button>
    </div>;
  }
  return (
    <>
      <div className="page-heading">
        <h1>发布管理</h1>
        {!section && <a
          className="button"
          href={feishuSection(requested ?? undefined)}
          target="_blank"
          rel="noreferrer"
        >
          打开飞书文档
        </a>}
      </div>
      <div className="publish-toolbar">
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            action({ action: "sync" }, "飞书草稿已同步")
          }
        >
          {busy ? "处理中…" : "同步飞书草稿"}
        </button>
        <span className="helper">
          {state?.draft
            ? "草稿同步于 " +
              new Date(state.draft.syncedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
            : "尚未同步"}
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && !published.length && (
        <p role="status" className="notice">
          {status}
        </p>
      )}
      {requestedMissing && <p className="notice">此章节未列入当前发布草稿。</p>}
      {!!published.length && <div className="flow-actions publication-result" role="status">
        <strong>{status}</strong>
        {published.map(id => {
          const entry = liveSections.find(section => section.id === id);
          return <a key={id} href={entry && isVersionUpdate(entry) ? versionUpdateLink(id) : "/guides/" + id}>{entry ? chapterTitle(entry) : "查看攻略"}</a>;
        })}
      </div>}
      <div className="publication-columns">
        <section id="publish-selection">
          <div className="section-heading">
            <h2>待发布章节</h2>
            <button type="button" disabled={busy || !changed.length} onClick={() => setSelected(changed.map(entry => entry.id))}>
              全选变更
            </button>
          </div>
          {changed.map(chapter)}
          {state?.draft && !changed.length && <p className="empty-inline">暂无待发布变更</p>}
          {!!current.length && <details className="published-chapters"
            open={current.some(entry => entry.id === requested || selected.includes(entry.id)) || undefined}>
            <summary>已发布（{current.length}）</summary>
            {current.map(chapter)}
          </details>}
          {missing.map((entry) => (
            <label key={entry.id} className="check">
              <input
                type="checkbox"
                checked={removed.includes(entry.id)}
                onChange={(event) =>
                  setRemoved((values) =>
                    event.target.checked
                      ? [...values, entry.id]
                      : values.filter((id) => id !== entry.id),
                  )
                }
              />
              从网站移除「{chapterTitle(entry)}」{isEditorialSection(entry) ? "（编辑资料）" : "（飞书已删除）"}
            </label>
          ))}
          {!!issues?.general.length && <details className="publish-review"><summary>其他同步提醒</summary>
            <ul>{issues.general.map(message => <li key={message}>{message}</li>)}</ul>
          </details>}
          {!!(pending.length || removed.length) && <section className="publish-review" aria-label="本次发布范围">
            <h3>本次发布</h3>
            <ul>{pending.map(entry => <li key={entry.id}>{chapterTitle(entry)}</li>)}
              {missing.filter(entry => removed.includes(entry.id)).map(entry => <li key={entry.id}>下线 {chapterTitle(entry)}</li>)}</ul>
          </section>}
          {recommendationBlocked && <p className="error" role="alert">{recommendation?.issues[0]}</p>}
          <button
            className="primary wide"
            disabled={busy || recommendationBlocked || (!selected.length && !removed.length)}
            onClick={async () => {
              const ids = [...selected];
              const next = await action(
                {
                  action: "publish",
                  draftId: state?.draft?.id,
                  sectionIds: selected,
                  removeIds: removed,
                },
                selected.length ? removed.length ? "已发布并下线所选条目" : "已发布所选章节" : "已移除所选条目",
              );
              if (next) {
                setPublished(ids.filter((id) => next.live?.sections.some((entry) => entry.id === id)));
                setSelected([]);
              }
            }}
          >
            {selected.length && removed.length ? `发布 ${selected.length} 项、下线 ${removed.length} 项` :
              selected.length ? `发布到公开站（${selected.length}）` : removed.length ? `确认下线（${removed.length}）` : "发布到公开站"}
          </button>
        </section>
        <section id="draft-preview" className="preview-panel">
          {section ? (
            <>
              <div className="flow-actions preview-actions">
                <a className="preview-back" href="#publish-selection">↑ 返回发布列表</a>
                <a href={feishuSection(section.id)} target="_blank" rel="noreferrer">编辑飞书正文 ↗</a>
                {sectionTeams(section).map(team => <a key={team.id} href={editorLink(team.id)}>
                  {team.name === section.title ? "修改阵容" : "修改：" + team.name}
                </a>)}
                {state?.live?.sections.some((entry) => entry.id === section.id) && <a href={isVersionUpdate(section) ? versionUpdateLink(section.id) : "/guides/" + section.id}>查看已发布版本</a>}
              </div>
              {section.id === "introduction" && recommendation?.declared && <section className="publish-review" aria-label="本版阵容推荐预览">
                <h3>本版阵容推荐</h3>
                {recommendation.issues.length > 0 ? <ul>{recommendation.issues.map(message => <li key={message}>{message}</li>)}</ul>
                  : recommendation.batch && <>
                    <p>{currentPatch.label} · {recommendation.batch.entries.length ? `${recommendation.batch.entries.length} 条` : "已清空，待复核"}</p>
                    {recommendation.batch.summary && <p>{recommendation.batch.summary}</p>}
                    {!!recommendation.batch.entries.length && <ol>{recommendation.batch.entries.map(entry => {
                      const target = recommendedSections.find(section => section.id === entry.sectionId)!;
                      const team = sectionTeams(target).find(team => team.id === entry.teamId)!;
                      return <li key={entry.sectionId + ":" + entry.teamId}>
                        <strong>{patchRecommendationLabels[entry.status]} · {chapterTitle(target)} / {team.name}</strong>：{entry.note}
                      </li>;
                    })}</ol>}
                  </>}
              </section>}
              {(!!differences.get(section.id)?.some(label => label !== "新增章节") || previewIssues.length > 0) && <section className="publish-review" aria-label="章节变更">
                <div className="publish-difference">{differences.get(section.id)?.filter(label => label !== "新增章节").map(label => <span key={label}>{label}</span>)}</div>
                {previewIssues.length > 0 && <ul>{previewIssues.map(message => <li key={message}>{message}</li>)}</ul>}
              </section>}
              <PreviewChoices key={state?.draft?.id + section.id} section={section} busy={busy} save={(primaryTeamId, summaryBlockId, stageTeamIds) => action({
                action: "preview", draftId: state?.draft?.id, sectionId: section.id, primaryTeamId, stageTeamIds, summaryBlockId: summaryBlockId || undefined,
              }, "预览已保存，发布所选章节后生效")} />
              <DocumentView section={section.id === "introduction" && recommendation?.declared ? readablePatchIntroduction(section) : section}
                gameData={section.gameData ?? state?.draft?.season} />
            </>
          ) : (
            <div className="empty-state">
              <h2>选择章节预览</h2>
            </div>
          )}
        </section>
      </div>
      <section className="history-panel">
        <h2>发布历史与回退</h2>
        <select
          aria-label="选择回退版本"
          value={rollback}
          onChange={(event) => setRollback(event.target.value)}
        >
          <option value="">选择已发布版本</option>
          {state?.history.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {new Date(entry.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
              {entry.id === state.live?.id ? " · 当前线上" : ""}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !rollback || rollback === state?.live?.id}
          onClick={() =>
            action(
              { action: "rollback", id: rollback },
              "网站已回退，飞书原文保持不变",
            )
          }
        >
          恢复此发布版本
        </button>
        <details>
          <summary>最近飞书写回记录</summary>
          {state?.jobs.map((job) => (
            <p key={job.id}>
              {new Date(job.updated_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} ·{" "}
              {job.status === "success"
                ? "写回已核验"
                : job.status === "failed"
                  ? "写回失败，可返回编辑器重试"
                  : "待恢复 / 执行中"}
            </p>
          ))}
        </details>
      </section>
    </>
  );
}
