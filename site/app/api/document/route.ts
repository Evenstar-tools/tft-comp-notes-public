import { categoryLabel, isBoardScratchTitle } from "@/domain/document-flow";
import { apiError, requireOwner } from "@/server/access";
import { updatesCategory } from "@/domain/version-updates";
import { blockText, documentId, readDocument } from "@/server/feishu";
export async function GET() {
  try {
    await requireOwner();
    const doc = await readDocument();
    let category = "资料说明";
    const sections: { id: string; title: string; level: number; category: string }[] = [];
    for (const block of doc.blocks) {
      const title = blockText(block);
      if (block.block_type === 3) category = title;
      if (block.block_type === 2) category = categoryLabel(block.text?.elements) ?? category;
      if (category !== updatesCategory && [3, 4, 5].includes(block.block_type) && !isBoardScratchTitle(title))
        sections.push({ id: block.block_id, title, level: block.block_type - 2, category });
    }
    return Response.json(
      {
        revision: doc.revision_id,
        url: `https://my.feishu.cn/docx/${documentId()}`,
        sections,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
