import { season } from "@/data";
import catalog from "@/data/medley-groups.json";
import { buildMedleyFits, type MedleyGuideFit, type MedleySyncMeta } from "@/domain/medley-fit";
import { medleyEligibleGuideCount, medleyGuideRoutes } from "@/domain/medley-guide-routes";
import { editionScope } from "@/domain/version-updates";
import { publicGuidePublication } from "./publication";

export type MedleyComputation = {
  key: string;
  fitsByGroup: Record<number, MedleyGuideFit[]>;
  syncMeta: MedleySyncMeta;
};

let cachedComputation: MedleyComputation | null = null;

export async function getMedleyFitsForCurrentPublication(): Promise<MedleyComputation> {
  const catalogEdition = `s${catalog.set}-${catalog.environment.toLowerCase()}`;
  const editionMatched = editionScope(season.id) === catalogEdition;
  const publication = editionMatched ? await publicGuidePublication() : null;
  const key = `${season.id}:${publication?.id ?? "none"}:${publication?.publishedAt ?? ""}`;

  if (cachedComputation?.key === key) return cachedComputation;

  const routes = publication ? medleyGuideRoutes(publication.sections, publication.season, season) : [];
  const guideCount = publication ? medleyEligibleGuideCount(publication.sections, publication.season, season) : 0;
  const fitsByGroup = buildMedleyFits(catalog.groups, routes, season.units, season.items, catalog.fixedUnit, 5);
  cachedComputation = {
    key,
    fitsByGroup,
    syncMeta: {
      guideCount,
      routeCount: routes.length,
      publishedAt: publication?.publishedAt,
      editionMatched,
    },
  };
  return cachedComputation;
}
