import { guideLink, repeatsFormationLabel } from "@/domain/guide-reading";
import type { ReactNode } from "react";
import { formatRecommendationMean, recommendationGroups, type GuideFamilyBatch, type RecommendationGroup, type RecommendationStat } from "@/domain/guide-family-stats";
import type { Team, Unit } from "@/domain/types";
import { homeGuideReturn } from "@/lib/home-position";

export type RecommendationCard = {
  group: RecommendationGroup;
  rating: RecommendationStat;
  team: Team;
  title: string;
  opening: string;
  conditional: boolean;
  avatars: { unit: Unit; role?: "主C" | "主坦" | "副C"; context?: { label: string; title: string } }[];
  entryTeamId?: string;
  stages: { team: Team; label: string }[];
  strategy?: string;
  badgeLabel: string;
  hit?: string;
};

export function PatchRecommendationList({ stats, cards, home, previousBuild, featured }: {
  stats: Pick<GuideFamilyBatch, "patch" | "queue" | "updatedAt">;
  cards: RecommendationCard[];
  home: string;
  previousBuild?: boolean;
  featured?: ReactNode;
}) {
  if (!cards.length) return featured;
  const date = stats.updatedAt.slice(5, 10).replace("-", "/");
  const time = stats.updatedAt.slice(11, 16);
  const groups = recommendationGroups.map(group => ({
    ...group, entries: cards.filter(card => card.group === group.id),
  })).filter(group => group.entries.length > 0);

  return <div className="home-patch-recommendations">
    <div className="home-patch-overview">
      <div className="home-patch-meta">
        <p className="home-patch-sample">
          {previousBuild ? <>上一版参考 · {stats.queue} {stats.patch} · </> : "数据更新 "}
          <time dateTime={stats.updatedAt}>{date} {time} UTC</time>
        </p>
        {groups.length > 1 && <nav className="home-patch-jumps" aria-label="跳到推荐分组">
          {groups.map(({ id, label }) => <a key={id} href={"#home-patch-" + id}>{id === "reroll" ? "赌狗" : label}</a>)}
        </nav>}
      </div>
      {featured}
    </div>
    {groups.map(({ id: group, label, entries }) => {
      const heading = "home-patch-" + group;
      return <section key={group} className="home-patch-group" aria-labelledby={heading}>
        <h2 id={heading}>{label}</h2>
        <div className="home-patch-cards">
          {entries.map(({ rating, team, title, opening, conditional, avatars, entryTeamId, stages, strategy, badgeLabel, hit }) => {
            const cardId = "patch-" + rating.sectionId + "-" + team.id;
            const id = "guide-card-" + cardId;
            const href = guideLink(rating.sectionId, entryTeamId ?? team.id, homeGuideReturn(home, cardId, team.id));
            const tone = rating.mean < 4.5 ? "strong" : rating.mean > 4.5 ? "weak" : "middle";
            const note = opening || (!strategy ? badgeLabel : "");
            const shownStrategy = repeatsFormationLabel(label, strategy) ? undefined : strategy;
            return <article key={id} id={id} className="home-patch-card">
              <a href={href} data-home-board={team.id} className="home-patch-card-link"
                aria-labelledby={id + "-title"} aria-describedby={[id + "-roles", shownStrategy && id + "-strategy", note && id + "-note", id + "-mean"].filter(Boolean).join(" ")}>
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
                  {note && <p id={id + "-note"}>{note}</p>}
                  {hit && <p className="home-patch-hit">{hit}</p>}
                </div>
                <span id={id + "-mean"} className={"home-patch-mean guide-placement " + tone}>
                  <span><span className="home-patch-mean-label" aria-hidden="true">均名</span><span className="sr-only">平均排名</span> <b>{formatRecommendationMean(rating.mean)}</b></span>
                  <small>{rating.games.toLocaleString("zh-CN")} 场</small>
                </span>
              </a>
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
