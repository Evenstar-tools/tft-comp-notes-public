import { guideLink, repeatsFormationLabel } from "@/domain/guide-reading";
import { guideConditionName, guideConditionsAnchor, type GuideCondition } from "@/domain/guide-equipment-conditions";
import { formatRecommendationMean, recommendationGroups, type GuideFamilyBatch, type RecommendationGroup, type RecommendationStat } from "@/domain/guide-family-stats";
import type { Team, Unit } from "@/domain/types";
import { beijingDateTime } from "@/lib/beijing-time";
import { homeGuideReturn } from "@/lib/home-position";
import { GuideConditionIcon } from "./GuideEquipmentConditions";

export type RecommendationCard = {
  group: RecommendationGroup;
  rating: RecommendationStat;
  team: Team;
  title: string;
  opening: string;
  timing?: string;
  upgrade?: string;
  conditional: boolean;
  sampleLabel?: string;
  avatars: { unit: Unit; role?: "主C" | "主坦" | "副C"; context?: { label: string; title: string } }[];
  entryTeamId?: string;
  stages: { team: Team; label: string }[];
  conditions?: GuideCondition[];
  strategy?: string;
  badgeLabel: string;
  hit?: string;
};

export function PatchRecommendationList({ stats, cards, home, previousBuild }: {
  stats: Pick<GuideFamilyBatch, "patch" | "queue" | "updatedAt">;
  cards: RecommendationCard[];
  home: string;
  previousBuild?: boolean;
}) {
  if (!cards.length) return null;
  const groups = recommendationGroups.map(group => ({
    ...group, entries: cards.filter(card => card.group === group.id),
  })).filter(group => group.entries.length > 0);
  const showJumps = groups.length > 1;
  const showMeta = previousBuild || showJumps;
  const hasCurrentCore = cards.some(card => card.sampleLabel === "核心样本");
  const updatedSample = <p className="home-patch-sample">
    {previousBuild ? <>{hasCurrentCore ? "含上一版参考" : "上一版参考"} · {stats.queue} {stats.patch} · </> : "数据更新 "}
    <time dateTime={stats.updatedAt} title="北京时间">{beijingDateTime.format(new Date(stats.updatedAt))}</time>
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
          {entries.map(({ rating, team, title, opening, timing, upgrade, conditional, sampleLabel, avatars, entryTeamId, stages, conditions, strategy, badgeLabel, hit }) => {
            const cardId = "patch-" + rating.sectionId + "-" + team.id;
            const id = "guide-card-" + cardId;
            const back = homeGuideReturn(home, cardId, team.id);
            const href = guideLink(rating.sectionId, entryTeamId ?? team.id, back);
            const tone = rating.mean < 4.5 ? "strong" : rating.mean > 4.5 ? "weak" : "middle";
            const note = opening || (!strategy ? badgeLabel : "");
            const hasAdvice = Boolean(timing || upgrade);
            const topFour = rating.topFourRate != null && Number.isFinite(rating.topFourRate) &&
              rating.topFourRate >= 0 && rating.topFourRate <= 1 ? (rating.topFourRate * 100).toFixed(1) + "%" : undefined;
            const shownStrategy = repeatsFormationLabel(label, strategy) ? undefined : strategy;
            return <article key={id} id={id} className="home-patch-card">
              <a href={href} data-home-board={team.id} className={"home-patch-card-link" +
                (sampleLabel === "核心样本" ? " home-patch-card-link--core" : "")}
                aria-labelledby={id + "-title"} aria-describedby={[id + "-roles", shownStrategy && id + "-strategy",
                  (hasAdvice || note) && id + "-note", id + "-mean"].filter(Boolean).join(" ")}>
                <div className="home-patch-avatars" id={id + "-roles"}>
                  {avatars.map(({ unit, role, context }) => <span key={unit.id} className="home-patch-avatar" data-core={role}>
                    <img className={"cost-" + unit.cost} src={unit.image} alt="" title={unit.name}
                      width={32} height={32} decoding="async" />
                    {role && <small><span className="sr-only">{unit.name} </span>{role}
                      {context && <span className="home-patch-avatar-context" title={context.title}> · {context.label}</span>}
                    </small>}
                  </span>)}
                </div>
                <div className="home-patch-card-copy">
                  <div className="home-patch-title">
                    <h3 id={id + "-title"}>{title}</h3>
                    {shownStrategy && <span id={id + "-strategy"} className="home-patch-strategy">{shownStrategy}</span>}
                    {conditional && <span>有条件</span>}
                  </div>
                  {hasAdvice ? <dl id={id + "-note"} className="home-patch-advice">
                    {timing && <><dt>时机</dt><dd>{timing}</dd></>}
                    {upgrade && <><dt>提档</dt><dd>{upgrade}</dd></>}
                  </dl> : note && <p id={id + "-note"}>{note}</p>}
                  {hit && <p className="home-patch-hit">{hit}</p>}
                </div>
                <span id={id + "-mean"} className={"home-patch-mean guide-placement " + tone}>
                  <span><span className="home-patch-mean-label" aria-hidden="true">均名</span><span className="sr-only">平均排名</span> <b>{formatRecommendationMean(rating.mean)}</b></span>
                  {topFour !== undefined && <small className="home-patch-top-four">前四 {topFour}</small>}
                  <small>{rating.games.toLocaleString("zh-CN")} 场{sampleLabel && " · " + sampleLabel}</small>
                </span>
              </a>
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
