import { z } from "zod";
import type { PatchRecommendation, PatchRecommendationBatch } from "./patch-recommendations.ts";

export const guideContentBlocks = ["equipment", "body", "conditions", "stats"] as const;
export const homeContentBlocks = ["intro", "recommendations"] as const;
export type GuideContentBlock = typeof guideContentBlocks[number];
export type HomeContentBlock = typeof homeContentBlocks[number];

const sectionId = z.string().min(1).max(100);
const teamId = z.string().uuid();
const guideTarget = z.strictObject({ sectionId, teamId });
const homeTarget = z.strictObject({ home: z.literal(true) });
export const ownerContentTarget = z.union([guideTarget, homeTarget]);
export type OwnerContentTarget = z.infer<typeof ownerContentTarget>;

const guideBlocks = z.array(z.enum(guideContentBlocks)).length(guideContentBlocks.length)
  .refine(blocks => new Set(blocks).size === guideContentBlocks.length);
const homeBlocks = z.array(z.enum(homeContentBlocks)).length(homeContentBlocks.length)
  .refine(blocks => new Set(blocks).size === homeContentBlocks.length);
const recommendation = z.strictObject({
  sectionId, teamId,
  timing: z.string().trim().max(240).optional(),
  override: z.enum(["pin", "include", "exclude"]).optional(),
});
const guideFields = z.strictObject({
  title: z.string().trim().min(1).max(120),
  boardTitle: z.string().trim().min(1).max(120),
  opening: z.string().trim().max(1800),
  notes: z.string().trim().max(6000),
  blocks: guideBlocks.optional(),
});
const homeFields = z.strictObject({
  introTitle: z.string().trim().max(120),
  intro: z.string().trim().max(1800),
  blocks: homeBlocks.optional(),
  recommendations: z.array(recommendation).max(500).refine(rows =>
    new Set(rows.map(row => JSON.stringify([row.sectionId, row.teamId]))).size === rows.length
  ).optional(),
});
export type GuideFields = z.infer<typeof guideFields>;
export type HomeFields = z.infer<typeof homeFields>;
export type OwnerContentState = { revision: number; published: GuideFields | HomeFields; draft?: GuideFields | HomeFields };

const mutation = { revision: z.number().int().nonnegative(), publish: z.boolean() };
export const ownerContentMutation = z.union([
  z.strictObject({ ...mutation, target: guideTarget, fields: guideFields }),
  z.strictObject({ ...mutation, target: homeTarget, fields: homeFields }),
]);
export type OwnerContentMutation = z.infer<typeof ownerContentMutation>;

export function applyOwnerHomeRecommendations(
  base: PatchRecommendationBatch | undefined,
  rows: HomeFields["recommendations"],
  patch: { seasonId: string; build: string; effectiveAt?: string },
): PatchRecommendationBatch | undefined {
  if (!rows) return base;
  const batch = base?.seasonId === patch.seasonId && base.build === patch.build ? base : undefined;
  if (!batch && !rows.length) return;
  const key = ({ sectionId, teamId }: { sectionId: string; teamId: string }) => JSON.stringify([sectionId, teamId]);
  const entries = new Map<string, PatchRecommendation>();
  for (const entry of batch?.entries ?? []) {
    const { override, pinOrder, ...data } = entry;
    entries.set(key(entry), data);
  }
  rows.forEach((row, index) => {
    if (!row.override && row.timing === undefined) return;
    const id = key(row);
    const entry = entries.get(id) ?? { sectionId: row.sectionId, teamId: row.teamId, status: "recommended", note: "" };
    entries.set(id, {
      ...entry,
      ...(row.timing !== undefined && { timing: row.timing }),
      ...(row.override && { override: row.override }),
      ...(row.override === "pin" && { pinOrder: index }),
    });
  });
  return {
    ...batch,
    seasonId: patch.seasonId,
    build: patch.build,
    reviewedAt: batch?.reviewedAt ?? patch.effectiveAt ?? "1970-01-01T00:00:00.000Z",
    entries: [...entries.values()],
  };
}
