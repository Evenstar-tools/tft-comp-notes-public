import currentPatch from "@/data/current-patch.json";
import initialRecommendations from "@/data/patch-recommendations.json";
import type { Publication } from "@/domain/document";
import { sectionTeams } from "@/domain/document-flow";
import { getPublishedPatchRecommendations, type PatchRecommendationBatch } from "@/domain/patch-recommendations";
import { sameEdition } from "@/domain/version-updates";

export function currentPatchRecommendations(publication: Publication | null): PatchRecommendationBatch | undefined {
  const patch = currentPatch;
  if (!publication || !sameEdition(publication.season.id, patch.seasonId)) return;
  const published = getPublishedPatchRecommendations(publication.sections, patch.seasonId, patch.build, patch.effectiveAt);
  if (published.declared) return published.batch;
  const initial = initialRecommendations as PatchRecommendationBatch | null;
  if (!initial || initial.seasonId !== patch.seasonId || initial.build !== patch.build ||
    !(Date.parse(initial.reviewedAt) >= Date.parse(patch.effectiveAt))) return;
  const boardsByGuide = new Map(publication.sections.map(guide => [guide.id, new Set(sectionTeams(guide).map(team => team.id))]));
  const entries = initial.entries.filter(record => boardsByGuide.get(record.sectionId)?.has(record.teamId));
  return { ...initial, entries, ...(entries.length !== initial.entries.length && { summary: undefined }) };
}
