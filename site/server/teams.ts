import type { Team } from "@/domain/types";
import { season } from "@/data";
import { editionScope } from "@/domain/version-updates";
import { correctRerollStars } from "./reroll-stars";
import { database } from "./access";

export function readSavedTeam(row: { body: string; revision: number }): Team {
  const team: Team = { ...JSON.parse(row.body), revision: row.revision };
  return team.sectionId && editionScope(season.id) === "s19-pbe"
    ? correctRerollStars(team, season.units, team.sectionId)
    : team;
}

/** 站主的云端阵容，按更新时间倒序。API 与编辑器页面服务端渲染共用。 */
export async function listTeams(ownerId: string): Promise<Team[]> {
  const result = await database()
    .prepare(
      "SELECT body,revision FROM teams WHERE owner_id=? ORDER BY updated_at DESC",
    )
    .bind(ownerId)
    .all<{ body: string; revision: number }>();
  return result.results.map(readSavedTeam);
}
