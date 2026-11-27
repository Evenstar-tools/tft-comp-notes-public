import assert from "node:assert/strict";
import test from "node:test";
import { PHASE_PRODUCTION_SERVER } from "next/constants.js";
import configure from "../next.config.ts";

test("EdgeOne can inject its image loader after Next.js has frozen an earlier config", async () => {
  const images = { loader: "custom", loaderFile: "./.edgeone/image-loader.mjs" };
  const first = await configure(PHASE_PRODUCTION_SERVER);
  first.images = images;
  Object.freeze(first);

  const second = await configure(PHASE_PRODUCTION_SERVER);
  second.images = images;

  assert.notEqual(second, first);
  assert.deepEqual(second.images, images);
});
