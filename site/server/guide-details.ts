import type { ContentBlock, Section } from "../domain/document";
import details from "./s19-guide-details.json" with { type: "json" };

interface GuideDetails {
  previousText?: Record<string, string | string[]>;
  summaryId: string;
  groups: { afterImage: string | null; blocks: ContentBlock[] }[];
}

// Web-only paragraphs from S19 revision 373. Image IDs keep each passage with
// its original board. Live images and their Feishu captions remain authoritative.
const guides = details as Record<string, GuideDetails>;

// Update exact copies of old web-only paragraphs kept in already published snapshots.
export function refreshWebDetails(section: Section) {
  const guide = guides[section.id];
  if (!guide?.previousText) return;
  const existing = new Map(section.blocks.map(block => [block.id, block]));
  for (const { blocks } of guide.groups) {
    for (const source of blocks) {
      const block = existing.get(source.id);
      const prior = guide.previousText[source.id];
      const before = block?.text;
      if (!before || !source.text || block?.type !== "text" || (Array.isArray(prior) ? !prior.includes(before) : prior !== before)) continue;
      if (block.elements?.length) {
        const run = block.elements[0].text_run;
        if (block.elements.length !== 1 || run?.content !== before) continue;
        run.content = source.text;
      }
      block.text = source.text;
    }
  }
}

function isGuideLink(block: ContentBlock, url: string) {
  if (block.type !== "text" || block.text?.trim() !== "网页详解" || block.children?.length) return false;
  const runs = block.elements?.filter(element => element.mention_doc || element.text_run?.content.trim());
  return !!runs?.length && runs.every(element => element.text_run?.text_element_style?.link?.url === url);
}

export function includeWebDetails(section: Section, liveIds: ReadonlySet<string>, previousSummaryId?: string) {
  const guide = guides[section.id];
  if (section.kind !== "guide" || !guide) return;
  const url = "https://tft.example.com/guides/" + section.id;
  const links = section.blocks.filter(block => isGuideLink(block, url));
  if (!links.length) return;

  const linkIds = new Set(links.map(block => block.id));
  const base = section.blocks.filter(block => !linkIds.has(block.id));
  const imageIds = new Set(base.filter(block => block.type === "image").map(block => block.id));
  const localTexts = new Set(base.filter((block, i) => block.type === "text" && base[i + 1]?.type !== "image")
    .map(block => block.text?.trim()).filter(Boolean));
  const after = new Map<string, ContentBlock[]>();
  let anchor = links[0].id;
  for (const group of guide.groups) {
    if (group.afterImage && imageIds.has(group.afterImage)) anchor = group.afterImage;
    const addition = group.blocks.filter(block => !liveIds.has(block.id) && !localTexts.has(block.text?.trim()));
    after.set(anchor, [...(after.get(anchor) ?? []), ...addition]);
  }
  if (!previousSummaryId || previousSummaryId === guide.summaryId) {
    const first = base.find((block, i) => block.type === "text" && !block.label && block.text?.trim() && base[i + 1]?.type !== "image");
    if (first) section.summaryBlockId = first.id;
  }
  section.blocks = section.blocks.flatMap(block => [
    ...(!linkIds.has(block.id) ? [block] : []),
    ...(after.get(block.id) ?? []),
  ]);
}
