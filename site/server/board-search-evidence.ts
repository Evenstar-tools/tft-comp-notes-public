import currentPatch from "@/data/current-patch.json";
import families from "@/data/guide-family-stats.json";
import placementData from "@/data/guide-placement.json";
import { teamPlacement } from "@/components/GuidePlacement";
import type { Section } from "@/domain/document";
import type { GuideFamilySmallSample } from "@/domain/guide-family-stats";
import { fixedBoardPlacementDetail, formationComparisonFor, placementEvidenceKind, type PlacementBatch } from "@/domain/guide-placement";
import type { BoardSearchCondition } from "@/domain/site-search";
import { usedPopulation } from "@/domain/team";
import { tierPerformance } from "@/domain/trait-performance";
import type { Team } from "@/domain/types";
import { sameEdition } from "@/domain/version-updates";

const placement = placementData as PlacementBatch;

export function currentSearchPlacements(edition: string) {
  return placement.build === currentPatch.build && sameEdition(placement.edition ?? "", edition) && sameEdition(edition, currentPatch.seasonId);
}

export function fixedSearchSample(section: Section, board: Team, edition: string) {
  if (!currentSearchPlacements(edition)) return;
  const population = usedPopulation(board.pieces);
  const roster = board.pieces.map(piece => piece.unitId).sort();
  const groups = (placement.formationComparisons ?? []).filter(group => group.build === currentPatch.build);
  const comparison = formationComparisonFor(groups, edition, roster, population);
  const sample = comparison?.board.sample;
  const stats = sample && tierPerformance(sample.placementCounts);
  if (comparison && sample && stats) return {
    ...stats, winRate: stats.win, href: sample.url, note: comparison.group.condition,
    source: `MetaTFT · ${comparison.group.patch} · ${comparison.group.window ?? `滚动 ${comparison.group.windowHours} 小时`}`,
    scope: `formation:${groups.indexOf(comparison.group)}`, roster: roster.join(","),
  };

  const record = teamPlacement(board, section, "fixed");
  if (!record || record.sourcePeriod || (record.build && record.build !== currentPatch.build) ||
      placementEvidenceKind(record) !== "fixed" || record.population !== population ||
      record.roster.toSorted().join(",") !== roster.join(",")) return;
  const { games, mean, winRate, url, sampleScope, patch, window } = fixedBoardPlacementDetail(record);
  const params = new URL(url).searchParams;
  const units = params.getAll("unit");
  if (params.get("level") !== String(population) || units.length !== roster.length ||
      !["set", "queue", "patch", "days"].every(key => params.get(key)) || units.some(unit => !/-1(?:_|$)/.test(unit))) return;
  params.delete("unit");
  params.sort();
  const rules = record.conditions?.units?.toSorted((a, b) => a.unitId.localeCompare(b.unitId));
  const scope = JSON.stringify([patch, window, record.observedOn ?? record.date, params.toString(), units.filter(unit => !unit.endsWith("-1")).sort(),
    rules, record.conditions?.trait, record.conditions?.traits]);
  return { games, mean, winRate, href: url, note: sampleScope, source: `MetaTFT · ${patch} · ${window}`, scope, roster: roster.join(",") };
}

export function boardSearchEvidence(section: Section, board: Team, edition: string, family?: GuideFamilySmallSample): BoardSearchCondition[] {
  const evidence: BoardSearchCondition[] = [];
  if (family) evidence.push({ label: "体系样本", games: family.games, mean: family.mean ?? undefined, href: family.url,
    source: `MetaTFT · ${families.patch} · 近 ${families.days} 天${families.spansBuilds ? " · 跨热补" : ""}` });
  if (!currentSearchPlacements(edition)) return evidence;

  const fixed = fixedSearchSample(section, board, edition);
  if (fixed) evidence.push({ label: `${usedPopulation(board.pieces)} 级固定整盘`, games: fixed.games, mean: fixed.mean,
    href: fixed.href, note: fixed.note, source: fixed.source });
  for (const kind of ["core", "lineup"] as const) {
    const sample = teamPlacement(board, section, kind);
    if (!sample || sample.sourcePeriod || (sample.build && sample.build !== currentPatch.build)) continue;
    evidence.push({ label: kind === "core" ? "核心共现" : "名单共现", games: sample.games,
      mean: sample.games >= placement.minGames ? sample.mean : undefined, href: sample.url,
      note: sample.sampleScope, source: `MetaTFT · ${sample.patch} · ${sample.window}` });
  }
  return evidence;
}
