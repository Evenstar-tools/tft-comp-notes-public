import batch from "@/data/guide-placement.json";
import { season } from "@/data";
import { findPlacement, type PlacementBatch, type PlacementRating } from "@/domain/guide-placement";
import { traitCounts, usedPopulation } from "@/domain/team";
import { heroAugmentCategory, heroAugmentForGuide } from "@/domain/hero-augments";
import type { Section } from "@/domain/document";
import type { Team } from "@/domain/types";

const frequency = new Intl.NumberFormat("zh-CN");
const placementBatch = batch as PlacementBatch;
const coreBatch: PlacementBatch = {
  ...placementBatch,
  records: placementBatch.records.filter(record => record.conditions?.kind === "core" && !record.referencesAugment),
};
const completedCategories = new Set(["completed", "artifact", "radiant", "support"]);
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 });

export function teamPlacement(team: Team, section: Section, scope?: "core" | "guide") {
  const augment = heroAugmentForGuide(section);
  if (section.category === heroAugmentCategory && !augment) return;
  const data = section.gameData ?? season;
  const traitLevels = Object.fromEntries(traitCounts(team.pieces, data.units, data.traits, data.items).map(({ id, level }) => [id, level]));
  return findPlacement(scope === "core" ? coreBatch : placementBatch, team.pieces.map(piece => piece.unitId), usedPopulation(team.pieces), {
    edition: data.id,
    augmentId: augment?.name,
    teamId: team.id,
    requireBoundFull: section.reroll?.added.includes(team.id),
    preferBoundCore: scope === "guide",
    traitLevels,
    completedItems: augment ? new Set(data.items.filter(item => completedCategories.has(item.category ?? "") &&
      !/ThiefsGloves/i.test(item.id)).map(item => item.id)) : undefined,
    pieces: team.pieces,
  });
}

export { guideBoardKind } from "@/domain/team";

export function PlacementBadge({ rating, id }: { rating?: PlacementRating; id?: string }) {
  if (!rating?.games) return null;
  const games = frequency.format(rating.games) + " 场";
  const limited = rating.mean === undefined;
  const core = rating.conditions?.kind === "core";
  const description = rating.referencesAugment ? "按主 C 实际出装识别的棋盘样本" : limited ? "样本不足"
    : core ? [rating.patch, rating.window, rating.date, rating.sampleScope].filter(Boolean).join(" · ") : undefined;
  return <span id={id} className={"guide-placement " + rating.tone + (rating.referencesAugment ? " is-reference" : "")}
    title={description}>
    {rating.mean === undefined ? <span>{games}</span> : <><span>{rating.referencesAugment ? "同装均名" : core ? "核心均名" : "棋盘均名"}</span> <strong>{rating.mean.toFixed(2)}</strong><small>{games}</small></>}
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
  const scope = rating.sampleScope || (rating.conditions?.kind === "core" ? "指定核心棋子同场结算" : `${rating.population} 人口结算 · 固定本盘名单`);
  return <div className="placement-method">
    <p>{scope}</p>
    <a href={rating.url} target="_blank" rel="noreferrer">MetaTFT ↗</a>
    <span> · {rating.patch} · {rating.referencesAugment ? "按主 C 出装识别" : rating.window} · {rating.date}</span>
  </div>;
}
