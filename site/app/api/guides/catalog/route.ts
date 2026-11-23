import { guideCatalog } from "@/domain/guide-catalog";
import { publicGuidePublication } from "@/server/publication";

export const dynamic = "force-dynamic";
export async function GET() {
  const live = await publicGuidePublication();
  if (!live) return Response.json({ error:"暂无公开攻略" }, {status:503});
  return Response.json({ seasonId:live.season.id, publishedAt:live.publishedAt, boards:guideCatalog(live.sections, live.season) });
}
