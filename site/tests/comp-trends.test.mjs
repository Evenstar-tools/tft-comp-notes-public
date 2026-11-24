import assert from "node:assert/strict";
import test from "node:test";
import { buildCompTrendModel } from "../domain/comp-trends.ts";

// Fixed samples keep the scope and continuity checks stable as production archives roll forward.
const oldBatches = [
  ["nov21-evening", "2026-11-21T19:57:31.642Z", 294403],
  ["nov22-morning", "2026-11-22T07:55:47.908Z", 525732],
  ["nov22-evening", "2026-11-22T19:53:33.408Z", 848975],
  ["nov23-early", "2026-11-23T03:04:47.927Z", 967308],
  ["nov23-morning", "2026-11-23T09:31:13.852Z", 1098469],
].map(([id, capturedAt, totalFinishes]) => ({ id, capturedAt, totalFinishes, patch: "19.1 Nov-20", build: null, model: 427, windowDays: 3 }));
const hotfix = {
  id: "nov24-hotfix", capturedAt: "2026-11-24T01:07:09.092Z", totalFinishes: 47328,
  patch: "19.1b", build: "6018196", model: 428, windowDays: 3, effectiveAt: "2026-11-23T19:41:35.000Z",
};
const classical = {
  id: "classical-jhin", sectionId: "sample-block-0051", teamId: "00000000-0000-4000-8000-000000000059",
  name: "四古典烬", carryIds: ["jhin"],
  points: [
    { batchId: "nov21-evening", clusterId: "427021", games: 12493, mean: 4.383, topFourRate: 0.519, winRate: 0.135 },
    { batchId: "nov22-morning", clusterId: "427021", games: 23442, mean: 4.294, topFourRate: 0.532, winRate: 0.153 },
    { batchId: "nov22-evening", clusterId: "427021", games: 41824, mean: 4.190, topFourRate: 0.550, winRate: 0.168 },
    { batchId: "nov23-early", clusterId: "427021", games: 48646, mean: 4.179, topFourRate: 0.552, winRate: 0.170 },
    { batchId: "nov23-morning", clusterId: "427021", games: 58140, mean: 4.144, topFourRate: 0.557, winRate: 0.174 },
    { batchId: hotfix.id, clusterId: "428004", games: 1888, mean: 4.032, topFourRate: 0.576, winRate: 0.189 },
  ],
};
const archive = {
  version: 1, seasonId: "s19-pbe", set: "TFTSet19", queue: "PBE", scope: "PBE", source: "MetaTFT",
  sourceUrl: "https://www.metatft.com/pbe-comps", batches: [...oldBatches, hotfix], series: [classical],
  discoveries: [
    { id: "jazz-kayle", batchId: "nov23-morning", clusterId: "427003", name: "爵士天使", kind: "change", reason: "历史攻略关联待复核", status: "待交叉核对" },
    { id: "jhin-miss-fortune", batchId: "nov23-morning", clusterId: "427032", name: "烬、厄运小姐", kind: "new", reason: "尚未关联攻略，核对是否补变阵", status: "待交叉核对" },
  ],
};
const season = { id: archive.seasonId, units: [{ id: "jhin", cost: 4, image: "/assets/datatft/jhin-portrait.jpg" }] };
const boards = new Map([[classical.sectionId, new Set([classical.teamId])]]);
const build = (history, edition = season, active) => buildCompTrendModel(history, edition, boards, active);

test("the archived Classical Jhin track opens its board and breaks across the 427 to 428 change", () => {
  const first428 = archive.batches.findIndex(batch => Number(batch.model) === 428);
  assert.ok(first428 > 0);
  const batches = archive.batches.slice(0, first428 + 1);
  const earlier = batches.at(-2);
  const latest = batches.at(-1);
  assert.equal(Number(earlier.model), 427);
  const trend = build({ ...archive, batches }, season, {
    build: latest.build, effectiveAt: latest.effectiveAt, updateId: "pbe-6018196",
  });
  const track = trend.tracks.find(track => track.id === classical.id);
  assert.ok(track);
  assert.equal(track.href, `/guides/${classical.sectionId}?team=${classical.teamId}`);
  assert.equal(track.points.at(-2).at, earlier.capturedAt);
  assert.equal(track.points.at(-1).at, latest.capturedAt);
  assert.notEqual(track.points.at(-2).segment, track.points.at(-1).segment);
  assert.equal(track.delta, undefined);
  assert.ok(trend.patches.some(patch => patch.at === latest.effectiveAt && patch.href === "/updates?entry=pbe-6018196"));
  assert.ok(trend.patches.every(patch => patch.label !== earlier.patch + " 首批"));
  const revisit = { ...latest, id: "same-patch", build: null, effectiveAt: undefined,
    capturedAt: new Date(Date.parse(latest.capturedAt) + 3_600_000).toISOString() };
  assert.deepEqual(build({ ...archive, batches: [...batches, revisit] }).patches.map(patch => patch.label), [latest.patch + " 实装"]);
});

test("a missing sample starts a new segment and the following comparable batch resumes the delta", () => {
  const batches = archive.batches.filter(batch => Number(batch.model) === 427).slice(0, 4).map((batch, index) => ({
    ...batch, capturedAt: new Date(Date.UTC(2026, 10, 18 + index, 12)).toISOString(),
  }));
  assert.equal(batches.length, 4);
  const series = { ...classical, points: classical.points.filter(point => point.batchId !== batches[1].id) };
  const partial = build({ ...archive, batches: batches.slice(0, 3), series: [series] }).tracks[0];
  assert.deepEqual(partial.points.map(point => point.at), [batches[0].capturedAt, batches[2].capturedAt]);
  assert.notEqual(partial.points[0].segment, partial.points[1].segment);
  assert.equal(partial.delta, undefined);

  const resumed = build({ ...archive, batches, series: [series] }).tracks[0];
  const [previous, current] = resumed.points.slice(-2);
  assert.equal(previous.segment, current.segment);
  assert.equal(resumed.delta, current.mean - previous.mean);
});

test("each UTC day uses its latest batch for every track without filling back a missing sample", () => {
  const dates = ["2026-11-20T09:00:00Z", "2026-11-20T23:00:00Z", "2026-11-21T10:00:00Z"];
  const batches = archive.batches.slice(0, 3).map((batch, i) => ({ ...batch, capturedAt: dates[i] }));
  const history = { ...archive, batches, series: [classical] };
  const trend = build(history);
  assert.deepEqual(trend.days, dates.slice(1));
  assert.deepEqual(trend.tracks[0].points.map(point => point.at), dates.slice(1));
  const series = { ...classical, points: classical.points.filter(point => point.batchId !== batches[1].id) };
  assert.deepEqual(build({ ...history, series: [series] }).tracks[0].points.map(point => point.at), [dates[2]]);
});

test("trend pick rate uses only the total player finishes of the same batch", () => {
  const [before, after] = archive.batches;
  const batches = [
    { ...before, capturedAt: "2026-11-20T12:00:00Z", totalFinishes: 294403 },
    { ...after, capturedAt: "2026-11-21T12:00:00Z", totalFinishes: null },
  ];
  const history = { ...archive, batches, series: [classical] };
  const track = build(history).tracks[0];
  assert.equal(track.points[0].pickRate, track.points[0].games / batches[0].totalFinishes);
  assert.equal(track.points[1].pickRate, null);
  assert.equal(build({ ...history, batches: [{ ...batches[0], totalFinishes: 1 }] }).tracks[0].points[0].pickRate, null);
});

test("a skipped date or a changed cluster leaves a break even when the patch is unchanged", () => {
  const [before, after] = archive.batches;
  const history = { ...archive, batches: [before, { ...after, capturedAt: "2026-11-25T01:00:00Z" }] };
  const gap = build(history).tracks[0];
  assert.notEqual(gap.points[0].segment, gap.points[1].segment);
  assert.equal(gap.delta, undefined);

  const series = { ...classical, points: classical.points.map(point =>
    point.batchId === after.id ? { ...point, clusterId: "reassigned" } : point) };
  const changed = build({ ...history, batches: [before, { ...after, capturedAt: "2026-11-22T01:00:00Z" }], series: [series] }).tracks[0];
  assert.notEqual(changed.points[0].segment, changed.points[1].segment);
});

test("a different edition or incompatible queue cannot appear as current trends", () => {
  const live = { ...season, id: "s19-live" };
  assert.ok(build(archive));
  assert.equal(build(archive, { ...season, id: "s18-pbe" }), undefined);
  assert.equal(build(archive, live), undefined);
  assert.equal(build({ ...archive, queue: "1100" }), undefined);

  const ranked = { ...archive, seasonId: live.id, scope: "international", queue: "1100" };
  assert.ok(build(ranked, live));
  for (const queue of ["PBE", "1090", "6080"]) {
    assert.equal(build({ ...ranked, queue }, live), undefined);
  }
  assert.equal(build({ ...ranked, scope: "CN" }, live), undefined);
});

test("discoveries keep their observed batch dates and omit events without an archived batch", () => {
  const trend = build({ ...archive, discoveries: [...archive.discoveries, {
    id: "no-matching-batch", batchId: "not-in-history", name: "未入库", kind: "new", reason: "test fixture",
  }] });
  const events = new Map(archive.discoveries.map(event => [event.id, event]));
  const batches = new Map(archive.batches.map(batch => [batch.id, batch]));
  assert.ok(trend.discoveries.some(event => event.kind === "新阵容"));
  assert.ok(trend.discoveries.some(event => event.kind === "打法变化"));
  assert.ok(trend.discoveries.every(event => event.id !== "no-matching-batch"));
  for (const [index, event] of trend.discoveries.entries()) {
    const source = events.get(event.id);
    assert.equal(event.at, batches.get(source.batchId).capturedAt);
    assert.equal(event.note, [batches.get(source.batchId).patch, source.reason, source.status].filter(Boolean).join(" · "));
    if (index > 0) assert.ok(Date.parse(event.at) <= Date.parse(trend.discoveries[index - 1].at));
  }
});

test("a repeated discovery from one model is shown once with its most recent observed date", () => {
  const [older, latest] = archive.batches.filter(batch => Number(batch.model) === 427);
  const discovery = { clusterId: "test-comp", name: "待核体系", kind: "new", reason: "需核定棋盘", status: "待交叉核对" };
  const trend = build({
    ...archive,
    batches: [older, latest],
    discoveries: [
      { ...discovery, id: "older-event", batchId: older.id },
      { ...discovery, id: "latest-event", batchId: latest.id },
    ],
  });
  assert.deepEqual(trend.discoveries.map(event => [event.id, event.at]), [["latest-event", latest.capturedAt]]);
});
