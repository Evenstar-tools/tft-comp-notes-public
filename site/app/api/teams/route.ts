import { apiError, database, requireDatabase, requireOwner, ApiError, setting } from "@/server/access";
import { validateTeam } from "@/server/validate-team";
import { listTeams } from "@/server/teams";
import { sectionTeams } from "@/domain/document-flow";
import { publicGuidePublication, publishedSnapshot } from "@/server/publication";
import { includeRerollBoards } from "@/server/reroll-guides";
import { migrateS19GuideSnapshot } from "@/server/s19-guide-cleanup";
import { isEditorialSection, primaryFirst, readingNotes } from "@/domain/guide-reading";
import { sameEdition } from "@/domain/version-updates";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import { usedPopulation } from "@/domain/team";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { season } from "@/data";
import type { Publication } from "@/domain/document";

export async function GET(request: Request) {
  try {
    const user = await requireOwner();
    requireDatabase();
    const query = new URL(request.url).searchParams;
    if (query.has("catalog")) {
      const live = await publicGuidePublication();
      const forPivots = query.get("catalog") === "pivots";
      const choices = live?.sections.flatMap(section => {
        const appendable = section.kind === "guide" && !isEditorialSection(section);
        const data = section.gameData ?? live.season;
        if (forPivots && (section.kind === "note" || section.kind === "category" || isEditorialSection(section) || !sameEdition(data.id, season.id))) return [];
        return primaryFirst(sectionTeams(section), section.primaryTeamId).map(team => {
          const choice = { section: section.title, sectionId: section.id, appendable, team };
          if (!forPivots) return choice;
          const roles = readingNotes(section, team, data).roles;
          const carries = roles.filter(role => ["主C", "主输出", "前期输出"].includes(role.label)).flatMap(role => role.units);
          const geared = [...team.pieces].filter(piece => piece.items.length).sort((a, b) => b.items.length - a.items.length);
          const named = geared.filter(piece => {
            const unit = data.units.find(entry => entry.id === piece.unitId);
            return unit && unitSearchNames(unit).some(name => name && (section.title.includes(name) || team.name.includes(name)));
          });
          const cores = [...new Set([...carries, ...named.map(piece => piece.unitId),
            ...roles.filter(role => role.label === "主坦").flatMap(role => role.units)])];
          if (!cores.length) cores.push(...geared.filter(piece => piece.items.length === geared[0].items.length).map(piece => piece.unitId));
          const augment = section.category === heroAugmentCategory ? heroAugmentForGuide(section)?.label || "对应英雄专属强化" : undefined;
          return { ...choice, population: usedPopulation(team.pieces), cores, augment };
        });
      }) ?? [];
      return Response.json({ choices }, { headers: { "Cache-Control": "no-store" } });
    }
    if (query.has("copy")) {
      const requestedId = query.get("publication") ?? "";
      const row = await database().prepare("SELECT body FROM snapshots WHERE id=?").bind(requestedId).first<{ body: string }>();
      let snapshot: Publication | null = row ? JSON.parse(row.body) : null;
      if (!snapshot) {
        const current = await publishedSnapshot();
        if (current && current.id === requestedId) snapshot = current;
      }
      const publishedId = await setting("published_id");
      const active = snapshot && (!publishedId || snapshot.id === publishedId) ? includeRerollBoards(migrateS19GuideSnapshot(snapshot), season) : snapshot;
      const section = active?.sections.find(entry => entry.id === query.get("section"));
      const team = section && sectionTeams(section).find(entry => entry.id === query.get("copy"));
      if (!team) throw new ApiError(404, "这个发布版本中找不到该阵容");
      return Response.json({ team }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(
      { teams: await listTeams(user.userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await requireOwner(request);
    requireDatabase();
    const team = validateTeam(await request.json());
    const saved = {
      ...team,
      revision: team.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    const result =
      team.revision === 0
        ? await database()
            .prepare(
              "INSERT INTO teams (id,owner_id,body,revision,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
            )
            .bind(
              team.id,
              user.userId,
              JSON.stringify(saved),
              saved.revision,
              saved.updatedAt,
            )
            .run()
        : await database()
            .prepare(
              "UPDATE teams SET body=?,revision=?,updated_at=? WHERE id=? AND owner_id=? AND revision=?",
            )
            .bind(
              JSON.stringify(saved),
              saved.revision,
              saved.updatedAt,
              team.id,
              user.userId,
              team.revision,
            )
            .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "云端阵容已有新版本。请保留当前草稿为副本，或重新载入云端版本。",
      );
    return Response.json({ team: saved });
  } catch (error) {
    return apiError(error);
  }
}
