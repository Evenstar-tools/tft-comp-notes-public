import assert from "node:assert/strict";
import { test } from "node:test";
import { buildS19LaunchChanges } from "../scripts/prepare-s19-live-launch.mjs";
import { hasHomeRecommendationSample, selectRecommendationRoutes } from "../domain/guide-family-stats.ts";
import { isLiveLaunchTransition } from "../domain/version-updates.ts";

const teamId = "00000000-0000-4000-8000-000000000001";
const sectionId = "jazz-jinx";
const board = { id: teamId, pieces: [{ unitId: "jinx", items: ["guinsoo"] }] };
const sourceUrl = "https://www.metatft.com/explorer?tab=comps&set=TFTSet19&level=8&queue=PBE&patch=19.1&b_patch=c&days=3";
const previous = {
  patch: { seasonId: "s19-pbe", build: "6045507", effectiveAt: "2026-11-27T22:35:38Z" },
  publication: { season: { id: "s19-pbe-19.1.0.6045507" }, sections: [{
    id: sectionId, teams: [board], blocks: [{ id: "intro", text: "弓开先做羊刀。" }], summaryBlockId: "intro",
  }] },
  recommendations: { entries: [{ teamId, note: "PBE 实测 200 场，均名 3.95。" }] },
  placement: {
    minGames: 100,
    records: [
      { conditions: { teamId }, roster: ["jinx"], population: 8, games: 200, mean: 3.95, placementCounts: [1], url: sourceUrl },
      { conditions: { teamId }, sourcePeriod: { patch: "PBE 19.1b" }, games: 250, url: sourceUrl },
    ],
    renataNasusReference: { url: sourceUrl, placementCounts: [100] },
  },
};
const inputs = {
  patch: { seasonId: "s19-live", build: "6049999", effectiveAt: "2026-11-28T12:00:00Z",
    metaTftPatch: { patch: "19.1", bPatch: "" }, updateId: "live-19-1",
    sourceUrl: "https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/" },
  season: { id: "s19-live-19.1.0.6049999", units: [{ id: "jinx" }], traits: [{ id: "jazz" }], items: [{ id: "guinsoo" }] },
  homeHtml: `<section class="home-patch-group" aria-labelledby="home-patch-fast8"><article id="guide-card-patch-${sectionId}-${teamId}" class="home-patch-card">`,
  itemIds: new Set(["guinsoo"]),
};

test("launch keeps the published recommendations and boards while replacing the active PBE samples", () => {
  const changes = buildS19LaunchChanges(previous, inputs, Date.parse("2026-11-28T12:01:00Z"));
  assert.equal(isLiveLaunchTransition(changes["current-patch.json"]), true);
  assert.equal(isLiveLaunchTransition({ seasonId: "s19-pbe", launchTransition: true }), false);
  assert.deepEqual(changes["public-preview.json"].sections[0].teams, [board]);
  assert.deepEqual(changes["patch-recommendations.json"].entries, [
    { sectionId, teamId, group: "fast8", status: "recommended", override: "include", launchEntry: true, note: "弓开先做羊刀。" },
  ]);
  const placement = changes["guide-placement.json"];
  assert.equal(placement.records.length, 1);
  const [pending] = placement.records;
  assert.equal(pending.games, 0);
  assert.equal(pending.mean, undefined);
  assert.equal(pending.placementCounts, undefined);
  assert.equal(new URL(pending.url).searchParams.get("queue"), "1100");
  assert.equal(new URL(pending.url).searchParams.get("b_patch"), "");
  assert.deepEqual(changes["guide-family-stats.json"].rows, []);
  assert.throws(() => buildS19LaunchChanges(previous, inputs, Date.parse("2026-11-28T11:59:00Z")), /已经生效/);
});

test("an opening board stays on the homepage and a qualified board gets its own rating", () => {
  const retained = { group: "fast8", familyId: "seed", override: "include", launchOrder: 0,
    rating: { sectionId, teamId, name: "爵士金克丝" } };
  const sampled = { group: "fast8", familyId: "other", override: "include", launchOrder: 1,
    rating: { sectionId: "classical-jhin", teamId: "2", name: "四古典烬", mean: 4.3, games: 100 } };
  const otherVariation = { group: "fast8", familyId: "new", rating: {
    sectionId, teamId: "3", name: "另一套金克丝", mean: 3.8, games: 120,
  } };
  assert.equal(hasHomeRecommendationSample({ games: 99, mean: 4.0 }), false);
  assert.deepEqual(selectRecommendationRoutes([otherVariation, retained, sampled]).map(route => [
    route.rating.teamId, hasHomeRecommendationSample(route.rating),
  ]), [["2", true], [teamId, false]]);
});
