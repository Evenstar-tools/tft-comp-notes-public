import { familyPickRate } from "./guide-family-stats.ts";
import type { Season } from "./types";

export type TrendPoint = {
  at: string; games: number; mean: number; topFourRate: number; winRate: number;
  pickRate: number | null; totalFinishes?: number | null;
  patch: string; build?: string; sourceUrl?: string; segment?: string;
};
export type TrendTrack = {
  id: string; name: string; href?: string; image?: string; cost?: number;
  recommended: boolean; recommendedKey?: string; delta?: number; points: TrendPoint[];
};
export type TrendPatch = { at: string; label: string; href?: string };
export type TrendDiscovery = {
  id: string; name: string; at: string; kind: "新阵容" | "打法变化";
  note: string; href?: string; games?: number; mean?: number;
};
export type CompTrendModel = {
  scope: string; note?: string; days: string[]; tracks: TrendTrack[]; patches: TrendPatch[]; discoveries: TrendDiscovery[];
};

type RankSample = Pick<TrendPoint, "games" | "mean" | "topFourRate" | "winRate">;
type HistoryBatch = {
  id: string; capturedAt: string; patch: string; build: string | null; model?: number | string;
  windowDays: number; windowStart: string | null; windowEnd: string | null; effectiveAt?: string;
  totalFinishes?: number | null;
  patchUrl?: string; sourceUrl?: string; statsUrl?: string;
};
type HistoryTrack = {
  id: string; sectionId: string; teamId?: string; name: string; carryIds: string[];
  points: (RankSample & { batchId: string; clusterId?: string | number })[];
};
type HistoryDiscovery = {
  id: string; batchId: string; name: string; kind: string; reason: string;
  clusterId?: string | number; status?: string;
  sectionId?: string; teamId?: string; href?: string; games?: number; mean?: number;
};
export type CompTrendHistory = {
  version: number; seasonId: string; set: string; queue: string; scope: string; source: string; sourceUrl: string;
  batches: HistoryBatch[]; series: HistoryTrack[]; discoveries: HistoryDiscovery[];
};
const dayMs = 86_400_000;
const trendDay = (date: string) => Math.floor(Date.parse(date) / dayMs);

function era(edition: string) {
  return /^s\d+-(?:pbe|live)(?=-|$)/i.exec(edition)?.[0]?.toLowerCase();
}

function guideHref(sectionId: string, teamId: string | undefined, boards: ReadonlyMap<string, ReadonlySet<string>>) {
  const teams = boards.get(sectionId);
  if (!teams) return;
  const query = teamId && teams.has(teamId) ? "?" + new URLSearchParams({ team: teamId }) : "";
  return "/guides/" + encodeURIComponent(sectionId) + query;
}

function qualified(point: RankSample) {
  return Number.isSafeInteger(point.games) && point.games >= 100 && Number.isFinite(point.mean) && point.mean >= 1 && point.mean <= 8 &&
    [point.topFourRate, point.winRate].every(rate => Number.isFinite(rate) && rate >= 0 && rate <= 1);
}

export function buildCompTrendModel(history: CompTrendHistory, season: Season, boards: ReadonlyMap<string, ReadonlySet<string>>,
  active?: { build: string; effectiveAt: string; updateId: string },
): CompTrendModel | undefined {
  // An explicit edition and queue keep historical PBE lines out of the live view.
  const currentEra = era(season.id);
  if (!currentEra || history.version !== 1 || era(history.seasonId) !== currentEra ||
      (currentEra.endsWith("-pbe") ? history.queue !== "PBE" || history.scope !== "PBE"
        : history.scope !== "international" || !["1100", "RANKED", "RANKED_TFT"].includes(history.queue))) return;
  const archive = history.batches.filter(batch => Number.isFinite(Date.parse(batch.capturedAt)))
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const batches = [...new Map(archive.map(batch => [trendDay(batch.capturedAt), batch])).values()].slice(-20);
  if (!batches.length) return;
  const firstDay = trendDay(batches[0].capturedAt);
  const recentArchive = archive.filter(batch => trendDay(batch.capturedAt) >= firstDay);
  const batchIndex = new Map(recentArchive.map((batch, index) => [batch.id, { batch, index }]));
  const latest = batches[batches.length - 1];
  const unitIndex = new Map(season.units.map(unit => [unit.id, unit]));
  const tracks = history.series.flatMap<TrendTrack>(series => {
    const href = guideHref(series.sectionId, series.teamId, boards);
    if (!href) return [];
    const pointIndex = new Map(series.points.map(point => [point.batchId, point]));
    const points: TrendPoint[] = [];
    let previousIndex = -2;
    let previousDay = -2;
    let previousScope = "";
    let segment = 0;
    for (const [index, batch] of batches.entries()) {
      const sample = pointIndex.get(batch.id);
      if (!sample || !qualified(sample)) continue;
      const day = trendDay(batch.capturedAt);
      const scope = [batch.patch, batch.build, batch.model, batch.windowDays, sample.clusterId].join("|");
      if (index !== previousIndex + 1 || day !== previousDay + 1 || scope !== previousScope) segment += 1;
      previousIndex = index;
      previousDay = day;
      previousScope = scope;
      points.push({
        at: batch.capturedAt, games: sample.games, mean: sample.mean, topFourRate: sample.topFourRate, winRate: sample.winRate,
        pickRate: familyPickRate(sample.games, batch.totalFinishes), totalFinishes: batch.totalFinishes,
        patch: batch.patch, build: batch.build ?? undefined, sourceUrl: batch.sourceUrl ?? history.sourceUrl, segment: String(segment),
      });
    }
    const now = points[points.length - 1];
    if (!now) return [];
    const before = points[points.length - 2];
    const current = previousIndex === batches.length - 1;
    const delta = current && before && now.segment === before.segment ? now.mean - before.mean : undefined;
    const currentPoint = current ? pointIndex.get(latest.id) : undefined;
    const carry = series.carryIds.map(id => unitIndex.get(id)).find(unit => unit !== undefined);
    return [{
      id: series.id, name: series.name, href, image: carry?.image, cost: carry?.cost, points, delta,
      recommended: current && active?.build === latest.build && now.mean <= 4.5,
      recommendedKey: currentPoint?.clusterId === undefined ? undefined : String(currentPoint.clusterId),
    }];
  }).sort((a, b) => {
    const ap = a.points[a.points.length - 1], bp = b.points[b.points.length - 1];
    return Date.parse(bp.at) - Date.parse(ap.at) || ap.mean - bp.mean || bp.games - ap.games || a.id.localeCompare(b.id);
  });
  const verifiedPatches = new Map<string, TrendPatch>();
  const verifiedLabels = new Set<string>();
  const observedLabels = new Map<string, HistoryBatch>();
  for (const batch of recentArchive) {
    if (!observedLabels.has(batch.patch)) observedLabels.set(batch.patch, batch);
    const effectiveAt = batch.effectiveAt ?? (active?.build === batch.build ? active?.effectiveAt : undefined);
    if (!effectiveAt) continue;
    verifiedLabels.add(batch.patch);
    const localPatch = active && active.build === batch.build ? "/updates?entry=" + encodeURIComponent(active.updateId) : undefined;
    verifiedPatches.set(batch.build ?? effectiveAt, {
      at: effectiveAt, label: batch.patch + " 实装",
      href: localPatch ?? batch.patchUrl,
    });
  }
  const patches = [...verifiedPatches.values(), ...[...observedLabels.values()].flatMap(batch =>
    batch === recentArchive[0] || verifiedLabels.has(batch.patch) ? [] : [{
      at: batch.capturedAt, label: batch.patch + " 首批", href: batch.patchUrl,
    }],
  )].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const seenEvents = new Set<string>();
  const discoveries = [...history.discoveries].sort((left, right) =>
    (batchIndex.get(right.batchId)?.index ?? -1) - (batchIndex.get(left.batchId)?.index ?? -1) ||
    Number(right.kind === "new") - Number(left.kind === "new"),
  ).flatMap<TrendDiscovery>(event => {
    const entry = batchIndex.get(event.batchId);
    if (!entry || !["new", "change"].includes(event.kind)) return [];
    const key = [entry.batch.model, event.clusterId ?? event.id, event.kind, event.reason].join("|");
    if (seenEvents.has(key)) return [];
    seenEvents.add(key);
    const local = event.sectionId && guideHref(event.sectionId, event.teamId, boards);
    return [{
      id: event.id, name: event.name, at: entry.batch.capturedAt,
      kind: event.kind === "change" ? "打法变化" : "新阵容",
      note: [entry.batch.patch, event.reason, event.status].filter(Boolean).join(" · "), games: event.games, mean: event.mean,
      href: local || event.href || entry.batch.sourceUrl || history.sourceUrl,
    }];
  });
  const scope = [history.source, currentEra.replace("-", " ").toUpperCase(), "近 " + latest.windowDays + " 天滚动样本"].join(" · ");
  return {
    scope, days: batches.map(batch => batch.capturedAt), tracks, patches, discoveries,
    note: "每天取最后一批快照。滚动样本可能重叠，换补丁、分组或缺数时断开。",
  };
}
