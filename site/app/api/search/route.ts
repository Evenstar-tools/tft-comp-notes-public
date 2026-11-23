import { performSiteSearch } from "@/server/site-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await performSiteSearch(params.get("q") ?? "", params.get("exclude") ?? undefined);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
