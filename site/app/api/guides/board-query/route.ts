import currentPatch from "@/data/current-patch.json";
import placement from "@/data/guide-placement.json";
import unitLookup from "@/data/conditional-gear-unit-ids.json";
import { sameEdition } from "@/domain/version-updates";
import type { PlacementBatch } from "@/domain/guide-placement";
import { publishedBoardRefreshPlan } from "@/domain/owner-board-query";
import { publicGuidePublication } from "@/server/publication";

export const dynamic = "force-dynamic";

export async function GET() {
  const publication = await publicGuidePublication();
  if (!publication || !sameEdition(publication.season.id, currentPatch.seasonId)) return Response.json({ error: "暂无当前赛季攻略" }, { status: 503 });
  const refreshPlan = publishedBoardRefreshPlan(publication, placement as PlacementBatch, currentPatch.build, unitLookup.units);
  return Response.json({ seasonId: currentPatch.seasonId, edition: publication.season.id, build: currentPatch.build, ...refreshPlan },
    { headers: { "Cache-Control": "no-store" } });
}
