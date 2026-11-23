import { apiError, requireOwner } from "@/server/access";
import { documentId } from "@/server/feishu";

export async function GET(request: Request) {
  try {
    await requireOwner();
    const section = new URL(request.url).searchParams.get("section");
    const target = new URL("https://my.feishu.cn/docx/" + encodeURIComponent(documentId()));
    if (section && section.length <= 100) target.hash = encodeURIComponent(section);
    return new Response(null, { status: 302, headers: { Location: target.href, "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
