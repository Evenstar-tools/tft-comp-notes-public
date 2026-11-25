import { publicGuidePublication } from "@/server/publication";
import { GUIDE_SECTION_IDS } from "@/domain/guide-identities";
import { sectionTeams, readableSection } from "@/domain/document-flow";
import { guideLink, guideBoardName, primaryFirst, isEditorialSection } from "@/domain/guide-reading";
import { traitCounts, usedPopulation } from "@/domain/team";
import { compatibleTraitBatch, traitScopeKey, type TraitBoardIndex, type TraitScope, type TraitContext } from "@/domain/trait-performance";
import { heroAugmentCategory } from "@/domain/hero-augments";
import { teamPlacement } from "@/components/GuidePlacement";
import { season, traitMap } from "@/data";
import batch from "@/data/trait-stats.json";
import placements from "@/data/guide-placement.json";
import { TraitsLibrary } from "@/components/TraitsLibrary";

export const dynamic = "force-dynamic";
type Query = { q?: string; trait?: string; tier?: string; guide?: string; team?: string };

export default async function Traits({ searchParams }: { searchParams: Promise<Query> }) {
  const [live, query] = await Promise.all([publicGuidePublication(), searchParams]);
  const trait = season.traits.find(t => t.id === query.trait);
  const links: TraitBoardIndex = {};
  const allScopes: Record<string, TraitScope> = batch.scopes;
  const compatible = (edition: string) => compatibleTraitBatch(edition, batch.season, batch.queue, batch.patch);
  let context: TraitContext | undefined;
  for (const section of live?.sections ?? []) {
    const data = section.gameData ?? live!.season;
    if (!compatible(data.id) || !readableSection(section) || isEditorialSection(section)) continue;
    for (const board of primaryFirst(sectionTeams(section), section.primaryTeamId)) {
      const boardName = guideBoardName(board);
      const url = guideLink(section.id, board.id);
      for (const entry of traitCounts(board.pieces, data.units, data.traits, data.items)) {
        if (!entry.active || !entry.level) continue;
        const group = links[entry.id] ??= {};
        (group[entry.level] ??= []).push({ sectionId: section.id, title: section.title, board: boardName, url });
      }
      if (section.id !== query.guide || board.id !== query.team) continue;
      const roster = board.pieces.map(p => p.unitId).sort();
      const level = usedPopulation(board.pieces);
      const heroAugment = section.category === heroAugmentCategory;
      const rating = teamPlacement(board, section);
      const fallback = !heroAugment && placements.edition && compatible(placements.edition) ? placements.records.find(r =>
        r.population === level && r.roster.join(",") === roster.join(",") && !r.conditions && !r.referencesAugment && !r.sampleScope) : undefined;
      const source = rating?.url ?? fallback?.url;
      const key = traitScopeKey(source);
      const compared: Record<string, TraitScope> = {};
      const pins: string[] = [];
      for (const pin of source ? new URL(source).searchParams.getAll("trait") : []) {
        for (const [id, thresholds] of Object.entries(batch.sources)) {
          const match = Object.entries(thresholds).find(([, ids]) => ids.includes(pin));
          if (!match) continue;
          const released = traitScopeKey(source, Object.values(thresholds).flat());
          if (released && allScopes[released]) compared[id] = allScopes[released];
          pins.push(match[0] + (traitMap.get(id)?.name ?? id));
        }
      }
      // Both eight-unit Renata branches share the guide's documented tank/carry comparison.
      if (section.id === GUIDE_SECTION_IDS.bodyguardRenata && level === 8 && roster.includes("renata-glasc") && roster.includes("nasus")) {
        compared.bodyguard = allScopes["8,DA_Nasus19-1,DA_RenataGlasc19-1_3_3"];
      }
      context = { title: section.title + " · " + boardName, back: url, stats: key ? allScopes[key] : undefined, pins, compared, heroAugment };
    }
  }
  const wantedTier = Number(query.tier);
  return <TraitsLibrary initialQuery={query.q ?? trait?.name ?? ""} initialTrait={trait?.id}
    initialTier={trait?.thresholds.includes(wantedTier) ? wantedTier : undefined}
    meta={{ patch: batch.patch, on: batch.asOf, days: batch.days, url: batch.metaUrl, current: compatible(season.id) }}
    overall={compatible(season.id) ? batch.rows : {}} context={context} links={links} comparison={batch.comparison} />;
}
