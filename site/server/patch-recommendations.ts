import currentPatch from "@/data/current-patch.json";
import initialRecommendations from "@/data/patch-recommendations.json";
import type { Publication } from "@/domain/document";
import { recommendationTier } from "@/domain/guide-family-stats";
import { sectionTeams } from "@/domain/document-flow";
import { applyOwnerHomeRecommendations } from "@/domain/owner-content";
import { applyHomeRecommendationOverrides, getPublishedPatchRecommendations, type PatchRecommendationBatch } from "@/domain/patch-recommendations";
import { isLiveLaunchTransition, sameEdition } from "@/domain/version-updates";

export function currentPatchRecommendations(publication: Publication | null): PatchRecommendationBatch | undefined {
  const patch = currentPatch;
  if (!publication || !sameEdition(publication.season.id, patch.seasonId)) return;
  const initial = initialRecommendations as PatchRecommendationBatch | null;
  const published = getPublishedPatchRecommendations(publication.sections, patch.seasonId, patch.build, patch.effectiveAt);
  const patchStart = Date.parse(patch.effectiveAt);
  const defaults = initial && initial.seasonId === patch.seasonId && initial.build === patch.build &&
    Date.parse(initial.reviewedAt) >= patchStart ? initial : undefined;
  const batch = published.batch ?? (!published.declared || isLiveLaunchTransition(patch) ? defaults : undefined);
  if (!batch) return applyOwnerHomeRecommendations(undefined, publication.ownerHome?.recommendations, patch);
  const boardsByGuide = new Map(publication.sections.map(guide => [guide.id, new Set(sectionTeams(guide).map(team => team.id))]));
  const configured = batch === defaults ? batch.entries : applyHomeRecommendationOverrides(batch, defaults);
  const entries = configured.filter(record => boardsByGuide.get(record.sectionId)?.has(record.teamId));
  const fixedBoardRecommendations = defaults?.fixedBoardRecommendations?.filter(record =>
    boardsByGuide.get(record.sectionId)?.has(record.teamId) &&
    Date.parse(record.checkedAt) >= patchStart && recommendationTier(record) === "recommended" &&
    !entries.some(entry => entry.sectionId === record.sectionId && entry.teamId === record.teamId &&
      (entry.status === "avoid" || entry.status === "review")));
  const recommendations = { ...batch, reviewedRollingPatch: batch.reviewedRollingPatch ?? defaults?.reviewedRollingPatch,
    fixedBoardRecommendations, entries, ...(entries.length !== configured.length && { summary: undefined }) };
  return applyOwnerHomeRecommendations(recommendations, publication.ownerHome?.recommendations, patch);
}
