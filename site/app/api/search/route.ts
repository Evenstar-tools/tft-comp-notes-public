import { performSiteSearch } from "@/server/site-search";
import { searchQueryLimit } from "@/domain/site-search";
import { z } from "zod";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const level = z.number().int().min(1).max(12);
const identifier = z.string().min(1).max(100);
const searchInput = z.object({
  query: z.string().trim().min(1).max(searchQueryLimit),
  exclude: identifier.optional(),
  includeSeven: z.boolean().optional(),
  context: z.object({
    item: identifier.optional(), augmentId: identifier.optional(), level: level.optional(),
    exclude: identifier.optional(), lowCosts: z.boolean().optional(), includeSeven: z.boolean().optional(),
    boardLookup: z.object({ group: z.enum(["reroll", "fast8", "fast9"]).optional(), sectionId: identifier.optional(),
      rollLevel: level.optional(), terms: z.array(z.string().max(searchQueryLimit)).max(5).optional() }).optional(),
  }).optional(),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await performSiteSearch(params.get("q") ?? "", params.get("exclude") ?? undefined, undefined,
    { includeSeven: params.get("seven") === "1" });
  return Response.json(result, { headers });
}

export async function POST(request: Request) {
  const parsed = searchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `请输入 ${searchQueryLimit} 字以内的搜索内容和有效的筛选条件。` }, { status: 400, headers });
  const { query, context, exclude, includeSeven } = parsed.data;
  const result = await performSiteSearch(query, exclude, undefined, { previous: context, includeSeven });
  return Response.json(result, { headers });
}
