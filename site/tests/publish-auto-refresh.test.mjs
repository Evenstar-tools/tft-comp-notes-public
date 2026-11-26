import assert from "node:assert/strict";
import test from "node:test";
import { hasSuccessfulRequiredCheck } from "../scripts/publish-auto-refresh.mjs";

const head = "candidate-head";
const run = {
  headSha: head,
  event: "pull_request",
  status: "completed",
  conclusion: "success",
  url: "https://github.com/Evenstar-tools/tft-comp-notes-public/actions/runs/99",
};
const check = {
  name: "domain-tests",
  status: "COMPLETED",
  conclusion: "SUCCESS",
  detailsUrl: `${run.url}/job/123`,
};
const pull = { headRefOid: head, statusCheckRollup: [check] };

test("auto-refresh requires a successful domain check from the candidate's PR workflow", () => {
  assert.equal(hasSuccessfulRequiredCheck(pull, run, head), true);
  assert.equal(hasSuccessfulRequiredCheck(pull, undefined, head), false);
  assert.equal(hasSuccessfulRequiredCheck(pull, { ...run, event: "workflow_dispatch" }, head), false);
  assert.equal(hasSuccessfulRequiredCheck(pull, { ...run, headSha: "earlier-head" }, head), false);
  assert.equal(hasSuccessfulRequiredCheck({ ...pull, headRefOid: "later-head" }, run, head), false);
  assert.equal(hasSuccessfulRequiredCheck({
    ...pull,
    statusCheckRollup: [{ ...check, detailsUrl: check.detailsUrl.replace("/99/", "/98/") }],
  }, run, head), false);
  assert.equal(hasSuccessfulRequiredCheck({
    ...pull,
    statusCheckRollup: [{ ...check, conclusion: "SKIPPED" }],
  }, run, head), false);
});
