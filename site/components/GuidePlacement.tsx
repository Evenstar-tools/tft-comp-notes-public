import batch from "@/data/guide-placement.json";
import { season } from "@/data";
import { findPlacement, placementEvidenceKind, type PlacementBatch, type PlacementRating } from "@/domain/guide-placement";
import { oceanGravesGuideId, oceanGravesUnlockBoardId } from "@/domain/guide-reading";
import { traitCounts, usedPopulation } from "@/domain/team";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import type { Section } from "@/domain/document";
import type { Team } from "@/domain/types";

const frequency = new Intl.NumberFormat("zh-CN");
const placementBatch = batch as PlacementBatch;
const placementScopes = ["fixed", "core", "lineup", "augment"] as const;
type PlacementScope = typeof placementScopes[number];
const scopedBatches = new Map(placementScopes.map(scope => [scope, {
  ...placementBatch,
  records: placementBatch.records.filter(record => placementEvidenceKind(record) === scope && (scope !== "core" || !record.detailOnly)),
}]));
const completedCategories = new Set(["completed", "artifact", "radiant", "support"]);
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

export function teamPlacement(team: Team, section: Section, scope?: PlacementScope) {
  const augment = heroAugmentForGuide(section);
  if (section.category === heroAugmentCategory && !augment) return;
  const data = section.gameData ?? season;
  const traitLevels = Object.fromEntries(traitCounts(team.pieces, data.units, data.traits, data.items).map(({ id, level }) => [id, level]));
  return findPlacement((scope && scopedBatches.get(scope)) || placementBatch, team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces), {
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

export { guideBoardKind } from "@/domain/team";

export function rankedOceanBoards(teams: Team[], section: Section) {
  if (section.id !== oceanGravesGuideId) return;
  return teams.filter(board => board.id !== oceanGravesUnlockBoardId).map(board => {
    const sample = teamPlacement(board, section, "fixed");
    const exact = sample?.conditions?.kind === "full" && sample.conditions.teamId === board.id;
    return { board, sample: exact ? sample : undefined };
  }).sort((a, b) => (a.sample?.mean ?? Infinity) - (b.sample?.mean ?? Infinity)
    || (b.sample?.games ?? 0) - (a.sample?.games ?? 0));
}

export function PlacementBadge({ rating, id }: { rating?: PlacementRating; id?: string }) {
  if (!rating?.games) return null;
  const games = frequency.format(rating.games) + " 场";
  const limited = rating.mean === undefined;
  const kind = placementEvidenceKind(rating);
  const label = { fixed: "棋盘均名", core: "核心均名", lineup: "名单共现均名", augment: "强化样本均名" }[kind];
  const description = rating.referencesAugment ? "按主 C 实际出装识别的棋盘样本" : limited ? "样本不足"
    : kind !== "fixed" || rating.sampleLabel ? [rating.patch, rating.window, rating.date, rating.sampleScope].filter(Boolean).join(" · ") : undefined;
  return <span id={id} className={"guide-placement " + rating.tone + (rating.referencesAugment ? " is-reference" : "")}
    title={description}>
    {rating.mean === undefined ? <span>{games}{kind === "augment" ? "" : " · 少量样本"}</span> : <><span>{rating.referencesAugment ? "同装均名" : kind === "lineup" ? label : rating.sampleLabel ?? label}</span> <strong>{rating.mean.toFixed(2)}</strong><small>{games}</small></>}
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
  const scope = kind === "lineup" ? "结算时包含这张棋盘的名单，可能有额外棋子。"
    : rating.sampleScope || (kind === "core" ? "只筛指定核心和查询条件，其余棋子可变。" : `${rating.population} 级结算 · 固定本盘名单`);
  return <div className="placement-method">
    <p>{scope}</p>
    <a href={rating.url} target="_blank" rel="noreferrer">MetaTFT ↗</a>
    <span> · {rating.patch} · {rating.referencesAugment ? "按主 C 出装识别" : rating.window} · {rating.date}</span>
  </div>;
}
