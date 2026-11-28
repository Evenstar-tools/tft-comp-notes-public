import { guideLink, repeatsFormationLabel } from "@/domain/guide-reading";
import { guideConditionName, guideConditionsAnchor, type GuideCondition } from "@/domain/guide-equipment-conditions";
import { formatRecommendationMean, recommendationGroups, type GuideFamilyBatch, type HomeRecommendationRating, type RecommendationGroup } from "@/domain/guide-family-stats";
import type { Team, Unit } from "@/domain/types";
import { beijingDateTime } from "@/lib/beijing-time";
import { homeGuideReturn } from "@/lib/home-position";
import { GuideConditionIcon } from "./GuideEquipmentConditions";
import { OwnerInlineEdit } from "./OwnerPageEditor";

export type RecommendationCard = {
  group: RecommendationGroup;
  rating: HomeRecommendationRating;
  team: Team;
  title: string;
  opening: string;
  timing?: string;
  upgrade?: string;
  manualBadge?: string;
  manualReason?: string;
  avatars: { unit: Unit; role?: "主C" | "主坦" | "副C"; context?: { label: string; title: string } }[];
  entryTeamId?: string;
  stages: { team: Team; label: string }[];
  conditions?: GuideCondition[];
  strategy?: string;
  badgeLabel: string;
  hit?: string;
};

export function PatchRecommendationList({ stats, cards, home, previousBuild, quietUnrated, onEdit, selectedEntry }: {
  stats?: Pick<GuideFamilyBatch, "patch" | "queue" | "days" | "updatedAt" | "spansBuilds">;
  cards: RecommendationCard[];
  home: string;
  previousBuild?: boolean;
  quietUnrated?: boolean;
  onEdit?: (sectionId: string, teamId: string) => void;
  selectedEntry?: string;
}) {
  if (!cards.length) return null;
  const groups = recommendationGroups.map(group => ({
    ...group, entries: cards.filter(card => card.group === group.id),
  })).filter(group => group.entries.length > 0);
  const showJumps = groups.length > 1;
  const showMeta = showJumps || Boolean(previousBuild && stats);
  const updatedSample = stats?.updatedAt && <p className="home-patch-sample">
    {previousBuild ? <>上一版参考 · {stats.queue} {stats.patch} · </> : "数据更新 "}
    <time dateTime={stats.updatedAt} title="北京时间">{beijingDateTime.format(new Date(stats.updatedAt))}</time>
    {stats.spansBuilds && " · 采样窗口跨热补"}
  </p>;

  return <div className="home-patch-recommendations">
    {showMeta && <div className="home-patch-meta">
      {updatedSample}
      {showJumps && <nav className="home-patch-jumps" aria-label="跳到推荐分组">
        {groups.map(({ id, label }) => <a key={id} href={"#home-patch-" + id}>{id === "reroll" ? "赌狗" : label}</a>)}
      </nav>}
    </div>}
    {groups.map(({ id: group, label, entries }, index) => {
      const heading = "home-patch-" + group;
      return <section key={group} className="home-patch-group" aria-labelledby={heading}>
        <div className="home-patch-group-head">
          <h2 id={heading}>{label}</h2>
          {!showMeta && index === 0 && updatedSample}
        </div>
        <div className="home-patch-cards">
          {entries.map(({ rating, team, title, opening, timing, upgrade, manualBadge, manualReason, avatars, entryTeamId, stages, conditions, strategy, badgeLabel, hit }, cardIndex) => {
            const cardId = "patch-" + rating.sectionId + "-" + team.id;
            const id = "guide-card-" + cardId;
            const back = homeGuideReturn(home, cardId, team.id);
            const href = guideLink(rating.sectionId, entryTeamId ?? team.id, back);
            const note = opening || (!strategy ? badgeLabel : "");
            const hasAdvice = Boolean(timing || upgrade);
            const ratingId = rating.mean === undefined && quietUnrated ? undefined : id + (rating.mean === undefined ? "-manual" : "-mean");
            let placement;
            if (rating.mean === undefined) {
              const label = manualBadge?.trim() || "站主推荐";
              placement = !quietUnrated && <span id={ratingId} className="home-patch-manual-badge" role="group" title={manualReason}
                aria-label={manualReason ? label + " · " + manualReason : label}>{label}</span>;
            } else {
              const tone = rating.mean < 4.5 ? "strong" : rating.mean > 4.5 ? "weak" : "middle";
              const mean = formatRecommendationMean(rating.mean);
              const [topFour, winRate] = [rating.topFourRate, rating.winRate].map(rate =>
                rate != null && Number.isFinite(rate) && rate >= 0 && rate <= 1 ? (rate * 100).toFixed(1) + "%" : undefined);
              const sample = ["平均排名 " + mean, topFour && "前四 " + topFour, winRate && "夺冠率 " + winRate,
                rating.games.toLocaleString("zh-CN") + " 场",
                stats && `${stats.queue} ${stats.patch} · 近 ${stats.days} 天体系样本`, rating.sampleScope,
              ].filter(Boolean).join(" · ");
              placement = <span id={ratingId} className={"home-patch-mean guide-placement " + tone} role="group" title={sample} aria-label={sample}>
                <span className="home-patch-mean-row"><span className="home-patch-mean-label">均名</span> <b>{mean}</b></span>
                {winRate && <span className="home-patch-win-rate">夺冠率 <b>{winRate}</b></span>}
              </span>;
            }
            const shownStrategy = repeatsFormationLabel(label, strategy) ? undefined : strategy;
            return <article key={id} id={id} className="home-patch-card" data-owner-editing={!!onEdit || undefined}
              data-owner-selected={!!onEdit && selectedEntry === rating.sectionId + ":" + team.id || undefined}>
              <a href={href} data-home-board={team.id} className="home-patch-card-link"
                aria-labelledby={id + "-title"} aria-describedby={[id + "-roles", shownStrategy && id + "-strategy",
                  (hasAdvice || note) && id + "-note", ratingId].filter(Boolean).join(" ")}>
                <div className="home-patch-avatars" id={id + "-roles"}>
                  {avatars.map(({ unit, role, context }) => <span key={unit.id} className="home-patch-avatar" data-core={role}>
                    <img className={"cost-" + unit.cost} src={unit.image} alt="" title={unit.name}
                      width={32} height={32} decoding="async" loading={index === 0 && cardIndex < 4 ? "eager" : "lazy"} />
                    {role && <small><span className="sr-only">{unit.name} </span>{role}
                      {context && <span className="home-patch-avatar-context" title={context.title}> · {context.label}</span>}
                    </small>}
                  </span>)}
                </div>
                <div className="home-patch-card-copy">
                  <div className="home-patch-title">
                    <h3 id={id + "-title"}>{title}</h3>
                    {shownStrategy && <span id={id + "-strategy"} className="home-patch-strategy">{shownStrategy}</span>}
                  </div>
                  {hasAdvice ? <dl id={id + "-note"} className="home-patch-advice">
                    {timing && <><dt>时机</dt><dd>{timing}</dd></>}
                    {upgrade && <><dt>升等</dt><dd>{upgrade}</dd></>}
                  </dl> : note && <p id={id + "-note"}>{note}</p>}
                  {hit && <p className="home-patch-hit">{hit}</p>}
                </div>
                {placement}
              </a>
              {onEdit && <div className="owner-home-card-action"><OwnerInlineEdit label={"调整" + title + "的推荐"}
                onClick={() => onEdit(rating.sectionId, team.id)} /></div>}
              {!!conditions?.length && <div className="guide-featured-conditions home-patch-conditions" aria-label="定阵条件">
                <span>定阵条件</span>
                {conditions.map(condition => <a key={condition.id + ":" + (condition.recipient?.id ?? "")}
                  href={guideLink(rating.sectionId, team.id, back) + "#" + guideConditionsAnchor} data-home-board={team.id}>
                  <GuideConditionIcon condition={condition} size={20} />{guideConditionName(condition)}
                </a>)}
              </div>}
              {stages.length > 0 && <nav className="home-patch-steps" aria-label={title + "的运营阶段"}>
                {stages.map(({ team: board, label }) => <a key={board.id} data-home-board={board.id}
                  href={guideLink(rating.sectionId, board.id, homeGuideReturn(home, cardId, board.id))}>{label}</a>)}
              </nav>}
            </article>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
