import { conditionalGearAvailable, conditionalGearBuilds, readGearQuery } from "@/server/conditional-gear";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!conditionalGearAvailable) {
    return Response.json({ error: "当前赛季暂无配装战绩来源。" }, { status: 503 });
  }
  const query = readGearQuery(new URL(request.url).searchParams);
  if (!query) {
    return Response.json({ error: "请选择棋子和星级，最多锁定两件不同的常规成装。" }, { status: 400 });
  }
  try {
    return Response.json(await conditionalGearBuilds(query), {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch {
    return Response.json({ error: "暂时读不到 MetaTFT 配装数据，请重试。" }, { status: 502 });
  }
}
