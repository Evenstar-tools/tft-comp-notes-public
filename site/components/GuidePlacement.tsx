import batch from "@/data/guide-placement.json";
import coreStats from "@/data/patch-recommendation-stats.json";
import currentPatch from "@/data/current-patch.json";
import { season } from "@/data";
import { canRankRecommendations } from "@/domain/guide-family-stats";
import { findPlacement, placementEvidenceKind, type PlacementBatch, type PlacementRating } from "@/domain/guide-placement";
import { guideHeaderCoreSample, systemMeanTone } from "@/domain/guide-variant-strip";
import { primaryFirst } from "@/domain/guide-reading";
import { AD_GRAVES_BOARD_IDS } from "@/domain/guide-identities";
import { oceanGravesGuideId, oceanGravesUnlockBoardId } from "@/domain/guide-reading";
import { traitCounts, usedPopulation } from "@/domain/team";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import type { Section } from "@/domain/document";
import type { Team } from "@/domain/types";
import { isLiveLaunchTransition, isOfficialEdition, sameEdition } from "@/domain/version-updates";

const frequency = new Intl.NumberFormat("zh-CN");
const placementBatch = batch as PlacementBatch;
const metaTftPatch: { patch: string; bPatch?: string } = currentPatch.metaTftPatch;
const placementScopes = ["fixed", "core", "lineup", "augment"] as const;
type PlacementScope = typeof placementScopes[number];
const scopedBatches = new Map(placementScopes.map(scope => [scope, {
  ...placementBatch,
  records: placementBatch.records.filter(record => placementEvidenceKind(record) === scope && (scope !== "core" || !record.detailOnly)),
}]));
const completedCategories = new Set(["completed", "artifact", "radiant", "support"]);
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });
const boardSampleTeams = new Set([
  "00000000-0000-4000-8000-000000001251",
  "00000000-0000-4000-8000-000000001252",
  "00000000-0000-4000-8000-000000001253",
  "00000000-0000-4000-8000-000000000105",
  "00000000-0000-4000-8000-000000000082",
  "752a22a6-a1e1-4c6a-b4ab-a66ae4fc3b80",
  "83cebafb-502e-4f5d-8a17-db9871730b44",
  ...AD_GRAVES_BOARD_IDS,
]);

export function guideStatsLaunch(edition: string) {
  return isLiveLaunchTransition(currentPatch) && sameEdition(edition, currentPatch.seasonId);
}

export function currentGuidePlacementBatch(edition: string) {
  return sameEdition(edition, currentPatch.seasonId) && placementBatch.build === currentPatch.build &&
    placementBatch.patch === "Ranked " + metaTftPatch.patch + (metaTftPatch.bPatch ?? "");
}

export function teamPlacement(team: Team, section: Section, scope?: PlacementScope) {
  const augment = heroAugmentForGuide(section);
  if (section.category === heroAugmentCategory && !augment) return;
  const data = section.gameData ?? season;
  const traitLevels = Object.fromEntries(traitCounts(team.pieces, data.units, data.traits, data.items).map(({ id, level }) => [id, level]));
  const samples = (scope && scopedBatches.get(scope)) || placementBatch;
  if (isOfficialEdition(data.id) && sameEdition(data.id, currentPatch.seasonId) && !currentGuidePlacementBatch(data.id)) return;
  const visibleSamples = guideStatsLaunch(data.id) ? {
    ...samples,
    records: samples.records.filter(record => !record.sourcePeriod && record.games >=
      (placementEvidenceKind(record) === "augment" ? 1 : samples.minGames)),
  } : samples;
  return findPlacement(visibleSamples, team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces), {
    edition: data.id,
    augmentId: augment?.name,
    teamId: team.id,
    requireBoundFull: section.reroll?.added.includes(team.id),
    preferBoundCore: scope === "core",
    traitLevels,
    completedItems: augment ? new Set(data.items.filter(item => completedCategories.has(item.category ?? "") &&
      !/ThiefsGloves/i.test(item.id)).map(item => item.id)) : undefined,
    pieces: team.pieces,
  });
}

export type GuideCorePlacement = Pick<PlacementRating,
  "games" | "mean" | "topFourRate" | "winRate" | "conditions" | "referencesAugment" |
  "patch" | "window" | "url" | "sampleScope" | "tone">;

export function guideCorePlacement(section: Section, boards: Team[], entryId: string | undefined): GuideCorePlacement | undefined {
  const ordered = primaryFirst(boards, entryId);
  const placement = placementBatch.build === currentPatch.build && guideHeaderCoreSample(ordered,
    board => teamPlacement(board, section, "core") ?? teamPlacement(board, section, "lineup"), placementBatch.minGames);
  if (placement) return placement;
  if (!canRankRecommendations(coreStats, (section.gameData ?? season).id, currentPatch)) return;
  for (const board of ordered) {
    const row = coreStats.rows.find(entry => entry.sectionId === section.id && entry.teamId === board.id);
    if (!row || row.games < placementBatch.minGames) continue;
    return {
      ...row, conditions: { kind: "core" },
      patch: coreStats.patch, window: `近 ${coreStats.hours} 小时`,
      tone: systemMeanTone(row.mean),
    };
  }
}

export function recommendationBoardSample(team: Team, section: Section, scope: "fixed" | "core", build?: string) {
  if (!boardSampleTeams.has(team.id) || placementBatch.build !== build) return;
  const sample = teamPlacement(team, section, scope);
  if (sample?.conditions?.teamId !== team.id || sample.sourcePeriod || sample.mean === undefined ||
    sample.topFourRate === undefined || sample.winRate === undefined) return;
  return {
    sectionId: section.id, teamId: team.id, name: section.title, url: sample.url, games: sample.games,
    mean: sample.mean, topFourRate: sample.topFourRate, winRate: sample.winRate,
    label: scope === "core" ? "核心样本" : "固定盘",
    sampleScope: [sample.patch, sample.window, sample.sampleScope].filter(Boolean).join(" · "),
  };
}

export { guideBoardKind } from "@/domain/team";

export function rankedOceanBoards(teams: Team[], section: Section) {
  if (section.id !== oceanGravesGuideId) return;
  return teams.filter(board => board.id !== oceanGravesUnlockBoardId).map(board => {
    const sample = teamPlacement(board, section, "fixed");
    const exact = !sample?.sourcePeriod && sample?.conditions?.kind === "full" && sample.conditions.teamId === board.id;
    return { board, sample: exact ? sample : undefined };
  }).sort((a, b) => (a.sample?.mean ?? Infinity) - (b.sample?.mean ?? Infinity)
    || (b.sample?.games ?? 0) - (a.sample?.games ?? 0));
}

export function PlacementBadge({ rating, id }: { rating?: PlacementRating; id?: string }) {
  if (!rating?.games) return null;
  const games = frequency.format(rating.games) + " 场";
  const limited = rating.mean === undefined;
  const kind = placementEvidenceKind(rating);
  const smallFixedSample = kind === "fixed" && rating.games < placementBatch.minGames;
  const label = { fixed: "棋盘均名", core: "核心均名", lineup: "名单共现均名", augment: "强化样本均名" }[kind];
  const description = rating.referencesAugment ? "按主 C 实际出装识别的棋盘样本" : limited ? "样本不足"
    : kind !== "fixed" || rating.sampleLabel ? [rating.patch, rating.window, rating.date, rating.sampleScope].filter(Boolean).join(" · ") : undefined;
  return <span id={id} className={"guide-placement " + rating.tone + (rating.referencesAugment ? " is-reference" : "")}
    title={description}>
    {rating.sourcePeriod && <span>历史 · </span>}
    {rating.mean === undefined ? <span>{games}{kind === "augment" ? "" : " · 少量样本"}</span> : <><span>{rating.referencesAugment ? "同装均名" : kind === "lineup" ? label : rating.sampleLabel ?? label}</span> <strong>{rating.mean.toFixed(2)}</strong><small>{games}{smallFixedSample && " · 少量样本"}</small></>}
  </span>;
}

export function PlacementRates({ rating, stage }: { rating?: PlacementRating; stage: boolean }) {
  if (!rating) return null;
  const rates = rating.mean !== undefined && !rating.referencesAugment && rating.topFourRate !== undefined && rating.winRate !== undefined
    ? [["前四", percent.format(rating.topFourRate)], ["登顶", percent.format(rating.winRate)]]
    : [];
  if (!stage && !rates.length) return null;
  return <p className="guide-placement-rates">
    {stage && <span>过渡盘结算</span>}
    {rates.map(([label, value]) => <span key={label}>{label} <b>{value}</b></span>)}
  </p>;
}

export function PlacementMethod({ rating }: { rating?: PlacementRating }) {
  if (!rating?.games) return null;
  const kind = placementEvidenceKind(rating);
  const scope = kind === "lineup" ? "含本盘名单"
    : rating.sampleScope || (kind === "core" ? "仅限核心与条件" : `${rating.population} 级结算 · 固定本盘名单`);
  return <div className="placement-method">
    <p>{scope}</p>
    <a href={rating.url} target="_blank" rel="noreferrer">MetaTFT ↗</a>
    <span> · {rating.patch} · {rating.referencesAugment ? "按主 C 出装识别" : rating.window}{rating.date && " · " + rating.date}</span>
  </div>;
}
