import assert from "node:assert/strict";
import test from "node:test";
import { decodeHomeGuideIndex } from "../lib/home-guide-index.ts";
import { packedHomeGuideIndex } from "../server/home-guide-index.ts";

test("the compressed index round-trips the public payload and invalidates with its publication", () => {
  const guide = {
    id: "sample-block-0051",
    title: "四古典乐烬 🎵",
    category: "高费阵容",
    blocks: [{ id: "intro", type: "text", text: "保留中文、引号「沉醉」与换行\n先做装备。" }],
    teams: [{ id: "main", pieces: [{ instanceId: "0", position: 26, stars: 2, unitId: "jhin", items: ["rageblade"] }] }],
  };
  const index = { sections: [guide], heroSections: [], trends: { scope: "测试服", days: [], tracks: [], patches: [], discoveries: [] } };
  const current = { id: "published", revision: 7 };
  const packed = packedHomeGuideIndex(current, () => index);
  assert.deepEqual(decodeHomeGuideIndex(packed), index);
  assert.equal(packedHomeGuideIndex(current, () => assert.fail("same snapshot should reuse its payload")), packed);

  const edited = { ...index, sections: [{ ...guide, title: "新版四古典乐烬" }] };
  const next = { ...current, revision: 8 };
  assert.deepEqual(decodeHomeGuideIndex(packedHomeGuideIndex(next, () => edited)), edited);
});
