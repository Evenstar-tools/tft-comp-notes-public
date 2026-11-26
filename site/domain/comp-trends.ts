import { familyPickRate } from "./guide-family-stats.ts";
import type { Season } from "./types";
import { displayGuideName, displayTraitNames } from "./trait-names.mjs";

export type TrendPoint = {
  at: string; games: number; mean: number; topFourRate: number; winRate: number;
  strength: number; winShare: number | null; top4Share: number | null;
  pickRate: number | null; totalFinishes?: number | null;
  patch: string; build?: string; sourceUrl?: string; segment?: string; board?: { name: string; href?: string };
};
export type TrendMetric = keyof Pick<TrendPoint, "strength" | "mean" | "winShare" | "top4Share" | "pickRate">;
export type TrendTrack = {
  id: string; name: string; href?: string; image?: string; cost?: number;
  recommended: boolean; recommendedKey?: string; delta?: number; points: TrendPoint[];
};
export type TrendPatch = { at: string; label: string; href?: string };
export type TrendDiscovery = {
  id: string; name: string; at: string; kind: "新阵容" | "打法变化";
  patch: string; reason: string; status?: string; href?: string; games?: number; mean?: number;
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
  families?: { name: string; members: string[] }[];
};
const dayMs = 86_400_000;
const trendDay = (date: string) => Math.floor(Date.parse(date) / dayMs);

export function selectTrendWindow(tracks: TrendTrack[], filter: string, days: string[], metric: TrendMetric) {
  const latest = days.at(-1);
  const higherIsBetter = metric !== "mean";
  const threshold = metric === "strength" ? 0.025 : 0.005;
  const latestValue = (track: TrendTrack) => track.points.at(-1)?.[metric] ?? null;
  const change = (track: TrendTrack) => {
    const last = track.points.at(-1)!;
    const recent = track.points.slice(-4).filter(point =>
      point[metric] !== null && (metric !== "mean" || point.board?.name === last.board?.name));
    if (recent.length < 2) return 0;
    const raw = (last[metric] as number) - (recent[0][metric] as number);
    return higherIsBetter ? raw : -raw;
  };
  const candidates = tracks.filter(track => {
    const point = track.points.at(-1);
    if (!point || point.at !== latest || point[metric] === null) return false;
    if (filter === "up") return change(track) > threshold;
    if (filter === "down") return change(track) < -threshold;
    if (filter === "recommended") return track.recommended;
    if (filter.startsWith("cost:")) return track.cost !== undefined && Math.min(track.cost, 5) === Number(filter.slice(5));
    return true;
  });
  if (filter === "up") candidates.sort((a, b) => change(b) - change(a));
  else if (filter === "down") candidates.sort((a, b) => change(a) - change(b));
  else if (filter === "top" && higherIsBetter) {
    candidates.sort((a, b) => (latestValue(b) ?? -Infinity) - (latestValue(a) ?? -Infinity));
  }
  const limit = filter === "recommended" ? 6 : 10;
  const dates = new Set(days);
  const multiDay: TrendTrack[] = [], singleDay: TrendTrack[] = [];
  for (const track of candidates) {
    const hasEarlier = track.points.some(point => point.at !== latest && dates.has(point.at) && point[metric] !== null);
    (hasEarlier ? multiDay : singleDay).push(track);
  }
  return { tracks: [...multiDay, ...singleDay].slice(0, limit), days };
}

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

function impactTotals(batchId: string, series: ReadonlyMap<string, HistoryTrack["points"][number]>[]) {
  const totals = { wins: 0, top4s: 0, maxWins: 0, maxTop4s: 0 };
  const seen = new Set<string>();
  for (const samples of series) {
    const sample = samples.get(batchId);
    if (!sample || !qualified(sample)) continue;
    // One source sample can be linked to multiple guide boards.
    if (sample.clusterId !== undefined) {
      const key = [sample.clusterId, sample.games, sample.winRate, sample.topFourRate, sample.mean].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const wins = sample.games * sample.winRate;
    const top4s = sample.games * sample.topFourRate;
    totals.wins += wins;
    totals.top4s += top4s;
    totals.maxWins = Math.max(totals.maxWins, wins);
    totals.maxTop4s = Math.max(totals.maxTop4s, top4s);
  }
  return totals;
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

function impactMetrics(sample: RankSample, totals: ReturnType<typeof impactTotals>) {
  const wins = sample.games * sample.winRate;
  const top4s = sample.games * sample.topFourRate;
  const winShare = totals.wins > 0 ? wins / totals.wins : null;
  const top4Share = totals.top4s > 0 ? top4s / totals.top4s : null;
  // The daily denominator cancels when dividing a share by the largest share.
  const wsNorm = totals.maxWins > 0 ? (wins / totals.maxWins) ** 0.65 : 0;
  const t4Norm = totals.maxTop4s > 0 ? (top4s / totals.maxTop4s) ** 0.65 : 0;
  const avpNorm = clampUnit((5 - sample.mean) / (5 - 3));
  const strength = clampUnit(0.35 * wsNorm + 0.30 * t4Norm + 0.35 * avpNorm);
  return { strength, winShare, top4Share };
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
  const batches = [...new Map(archive.map(batch => [trendDay(batch.capturedAt), batch])).values()];
  if (!batches.length) return;
  const batchIndex = new Map(archive.map((batch, index) => [batch.id, { batch, index }]));
  const latest = batches[batches.length - 1];
  const unitIndex = new Map(season.units.map(unit => [unit.id, unit]));
  const seriesSamples = history.series.map(series => new Map(series.points.map(point => [point.batchId, point])));
  const observations = batches.map(batch => ({ batch, totals: impactTotals(batch.id, seriesSamples) }));
  const tracks = history.series.flatMap<TrendTrack>((series, seriesIndex) => {
    const href = guideHref(series.sectionId, series.teamId, boards);
    if (!href) return [];
    const pointIndex = seriesSamples[seriesIndex];
    const points: TrendPoint[] = [];
    let previousIndex = -2;
    let previousDay = -2;
    let previousScope = "";
    let segment = 0;
    for (const [index, { batch, totals }] of observations.entries()) {
      const sample = pointIndex.get(batch.id);
      if (!sample || !qualified(sample)) continue;
      const day = trendDay(batch.capturedAt);
      const scope = [batch.patch, batch.build, batch.model, batch.windowDays, sample.clusterId].join("|");
      const adjacent = index === previousIndex + 1 && day === previousDay + 1;
      if (!adjacent || scope !== previousScope) segment += 1;
      previousIndex = index;
      previousDay = day;
      previousScope = scope;
      points.push({
        at: batch.capturedAt, games: sample.games, mean: sample.mean, topFourRate: sample.topFourRate, winRate: sample.winRate,
        ...impactMetrics(sample, totals),
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
      id: series.id, name: displayGuideName(series.name), href, image: carry?.image, cost: carry?.cost, points, delta,
      recommended: current && active?.build === latest.build && now.mean <= 4.5,
      recommendedKey: currentPoint?.clusterId === undefined ? undefined : String(currentPoint.clusterId),
    }];
  });
  for (const family of history.families ?? []) {
    // Members are explicitly curated variants. Each day retains one real board and its own sample.
    const members = family.members.flatMap(id => tracks.find(track => track.id === id) ?? []);
    if (members.length < 2) continue;
    const daily = new Map<string, TrendPoint>();
    for (const member of members) {
      for (const point of member.points) {
        if (!daily.has(point.at)) daily.set(point.at, { ...point, board: { name: member.name, href: member.href } });
      }
    }
    const points = [...daily.values()].sort((a, b) => a.at.localeCompare(b.at));
    const last = points.at(-1)!;
    const current = members.find(member => member.points.some(point => point.at === last.at))!;
    for (const member of members) tracks.splice(tracks.indexOf(member), 1);
    const previous = points.at(-2);
    tracks.push({ ...current, id: family.members[0], name: family.name, points,
      delta: previous?.board?.href === last.board?.href && previous?.at === current.points.at(-2)?.at ? current.delta : undefined });
  }
  tracks.sort((a, b) => {
    const ap = a.points[a.points.length - 1], bp = b.points[b.points.length - 1];
    return Date.parse(bp.at) - Date.parse(ap.at) || ap.mean - bp.mean || bp.games - ap.games || a.id.localeCompare(b.id);
  });
  const verifiedPatches = new Map<string, TrendPatch>();
  const verifiedLabels = new Set<string>();
  const observedLabels = new Map<string, HistoryBatch>();
  for (const batch of archive) {
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
    batch === archive[0] || verifiedLabels.has(batch.patch) ? [] : [{
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
      id: event.id, name: displayGuideName(event.name), at: entry.batch.capturedAt,
      kind: event.kind === "change" ? "打法变化" : "新阵容",
      patch: entry.batch.patch,
      reason: displayTraitNames(event.reason ?? "")
        .replace("尚未关联攻略，核对是否补变阵", "未收录")
        .replace("历史攻略关联待复核", "旧攻略关联")
        .replaceAll("代表棋盘有变", "代表棋盘变化")
        .replaceAll("代表配装分工有变", "配装变化")
        .replaceAll("搜牌节奏有变", "搜牌节奏变化"),
      status: event.status === "待交叉核对" ? "待复核" : event.status,
      games: event.games, mean: event.mean,
      href: local || event.href || entry.batch.sourceUrl || history.sourceUrl,
    }];
  });
  const scope = [history.source, currentEra.replace("-", " ").toUpperCase(), "近 " + latest.windowDays + " 天滚动样本"].join(" · ");
  return {
    scope, days: batches.map(batch => batch.capturedAt), tracks, patches, discoveries,
    note: "每天取归档的最后一批滚动样本。各阵容从首个实测日开始，缺少样本的日期留空。古典乐烬按当日构筑取样。涨跌比较近四个观测日内同构筑的均名。",
  };
}
