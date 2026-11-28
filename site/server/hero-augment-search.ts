import { season } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augments from "@/data/augment-catalog.json";
import currentPatch from "@/data/current-patch.json";
import carryData from "@/data/guide-carry-stats.json";
import placements from "@/data/guide-placement.json";
import { readableSection, sectionTeams } from "@/domain/document-flow";
import type { Publication } from "@/domain/document";
import { itemName } from "@/domain/gear-library";
import { carryPeriod, guideCarryRows } from "@/domain/guide-carry-stats";
import { guideBoardName, guideLink, primaryFirst } from "@/domain/guide-reading";
import { heroAugmentForGuide, heroAugmentForUnit, heroAugmentProfileLink, type HeroAugment } from "@/domain/hero-augments";
import type { HeroAugmentSearchQuery } from "@/domain/hero-augment-search";
import { augmentLoadout, heroAugmentSortingMinGames, type PlacementBatch, type PlacementRecord } from "@/domain/guide-placement";
import { itemLink } from "@/domain/links";
import type { SearchHeroAugmentDetail, SiteSearchHit } from "@/domain/site-search";
import { traitCounts, usedPopulation } from "@/domain/team";
import { tierPerformance } from "@/domain/trait-performance";
import { isLiveLaunchTransition, sameEdition } from "@/domain/version-updates";

const placementBatch = placements as PlacementBatch;
const duringLaunch = isLiveLaunchTransition(currentPatch);
const augmentSamplesMatch = sameEdition(placementBatch.edition ?? "", currentPatch.seasonId) && placementBatch.build === currentPatch.build;
const catalog = new Map(augments.rows.map(entry => [entry.id, entry]));
const referencePages: Record<string, string> = {
  annie: "tibbers_i_cant_see_the_stage", kennen: "hes_electric", lillia: "dancin_n_prancin",
  olaf: "axe_crescendo", sett: "punch_line", elise: "bite_marks", renekton: "lifeguard_on_duty",
};

function sampleEvidence(record: PlacementRecord) {
  const historical = record.sourcePeriod || (record.build && record.build !== currentPatch.build);
  return { label: historical ? "历史同装样本" : "同装样本", games: record.games,
    mean: record.games >= heroAugmentSortingMinGames ? record.mean : undefined };
}

const gearIdentity = (items: string[]) => items.toSorted().join(",");

export function heroAugmentSearchHit(augment: HeroAugment, live: Publication | null, request: HeroAugmentSearchQuery): SiteSearchHit | undefined {
  const edition = live?.season ?? season;
  if (heroAugmentForUnit(augment.unitId, edition.id)?.id !== augment.id) return;
  const hero = edition.units.find(unit => unit.id === augment.unitId);
  if (!hero) return;
  const entry = catalog.get(augment.id);
  const guide = live?.sections.find(section => readableSection(section) && heroAugmentForGuide(section)?.id === augment.id &&
    sameEdition((section.gameData ?? edition).id, edition.id) && sectionTeams(section).length);
  const data = guide?.gameData ?? edition;
  const teams = guide ? primaryFirst(sectionTeams(guide), guide.primaryTeamId) : [];
  const team = request.level === undefined ? teams[0] : teams.find(board => usedPopulation(board.pieces) === request.level);
  const profileHref = heroAugmentProfileLink(augment);
  const href = guide && team ? guideLink(guide.id, team.id) : profileHref;
  const hit: SiteSearchHit = { id: augment.id, name: augment.label, href, image: (entry && augmentArtPath(entry)) ?? hero.image,
    detail: [hero.name, augment.round, augment.rarity].join(" · ") };
  if (request.browse) return hit;

  const traits = team ? traitCounts(team.pieces, data.units, data.traits, data.items).filter(trait => trait.active) : [];
  const board: SearchHeroAugmentDetail["board"] = team && {
    name: guideBoardName(team), href, population: usedPopulation(team.pieces),
    units: team.pieces.flatMap(piece => {
      const unit = data.units.find(candidate => candidate.id === piece.unitId);
      return unit ? [{ id: piece.instanceId, name: unit.name, image: unit.image, cost: unit.cost, carry: unit.id === augment.unitId }] : [];
    }).sort((a, b) => Number(b.carry) - Number(a.carry)),
    traits: traits.toSorted((a, b) => b.level - a.level).slice(0, 4).map(trait => ({
      id: trait.id, name: trait.gameName ?? trait.name, image: trait.image, level: trait.level,
    })),
  };
  const roster = team?.pieces.map(piece => piece.unitId).sort() ?? [];
  const samples = team && !request.picksOnly ? placementBatch.records.filter(record => {
    if (duringLaunch && (!augmentSamplesMatch || record.sourcePeriod || (record.build && record.build !== currentPatch.build) ||
        record.games < heroAugmentSortingMinGames)) return false;
    if (record.referencesAugment !== augment.name || record.augmentBuild?.teamId !== team.id ||
        augmentLoadout(record)?.unitId !== hero.id || record.population !== board?.population) return false;
    const required = record.conditions?.trait;
    if (required && !traits.some(trait => trait.id === required.id && trait.level === required.level)) return false;
    return record.conditions?.kind === "core" ? record.conditions.coreRoster?.every(id => roster.includes(id))
      : record.roster.toSorted().join(",") === roster.join(",");
  }) : [];
  const source = samples.find(record => record.augmentBuild?.kind === "guide") ?? samples[0];
  const picked = guide && team && carryData.build === currentPatch.build
    ? guideCarryRows(data.id, guide.id, team.id).find(row => row.kind === "augment" && row.carryId === hero.id &&
      row.games >= (duringLaunch ? heroAugmentSortingMinGames : 1) &&
      row.withAugments >= row.games && row.anchorIds.every(id => roster.includes(id))) : undefined;
  const pickStats = picked && tierPerformance(picked.placementCounts);
  const verifiedPick = picked && pickStats?.games === picked.games ? {
    label: "近期实选核对", games: picked.games, mean: picked.games >= heroAugmentSortingMinGames ? pickStats.mean : undefined,
    href: picked.url, source: "MetaTFT · " + carryPeriod,
  } : undefined;

  const options: { label: string; items: string[]; note?: string }[] = [];
  const main = team?.pieces.find(piece => piece.unitId === hero.id);
  if (main?.items.length) options.push({ label: "棋盘配装", items: main.items });
  const presets = augment.gear as ReadonlyArray<{ label: string; items: string[]; note?: string; trait?: { id: string; level: number } }>;
  for (const preset of presets) {
    if ((!preset.trait || traits.some(trait => trait.id === preset.trait?.id && trait.level === preset.trait.level)) &&
        !options.some(option => gearIdentity(option.items) === gearIdentity(preset.items))) options.push(preset);
  }
  for (const sample of samples) {
    const items = augmentLoadout(sample)?.itemIds;
    if (items && sample.games > 0 && !options.some(option => gearIdentity(option.items) === gearIdentity(items))) {
      options.push({ label: "同装配法", items });
    }
  }
  const loadouts = options.flatMap(option => {
    const sample = samples.find(row => gearIdentity(augmentLoadout(row)?.itemIds ?? []) === gearIdentity(option.items));
    const items = option.items.flatMap(id => {
      const item = data.items.find(item => item.id === id) ?? season.items.find(item => item.id === id);
      return item ? [{ id, name: itemName(item), image: item.image ?? "", href: itemLink(id, hero.id) }] : [];
    });
    return items.length === option.items.length && items.length ? [{ label: option.label, note: option.note, items,
      evidence: sample && sample.games > 0 ? sampleEvidence(sample) : undefined }] : [];
  }).slice(0, 3);
  const reference = referencePages[augment.unitId];
  const period = source?.sourcePeriod ?? placementBatch;
  return { ...hit, heroAugment: {
    hero: hero.name, role: augment.role, round: augment.round, rarity: augment.rarity, effect: entry?.effect,
    board, boardNote: !team && request.level !== undefined ? `攻略暂无 ${request.level} 级棋盘。` : undefined,
    openConditions: request.showConditions || request.picksOnly, loadouts, profileHref,
    conditions: verifiedPick ? [picked!.scope, "按近期对局公开的强化字段核对"] : [
      ...(source ? [source.sampleScope ?? `${source.population} 级结算 · ${hero.name}实戴三件成装`] : []),
      "本版暂无可核实的强化实选战绩",
    ],
    evidence: verifiedPick ?? (source && { ...sampleEvidence(source), href: source.url, source: `MetaTFT · ${period.patch} · ${period.window}` }),
    reference: reference ? { href: `https://tftable.cc/${reference}`, label: "TFTable 阵容与装备" } : undefined,
  } };
}
