import type { ContentBlock, Section } from "./document";
import type { Unit } from "./types";
import { unitSearchNames } from "./unit-search.mjs";

export type PatchCategory = "弈子" | "羁绊" | "解锁" | "海克斯" | "装备" | "修复";

export interface PatchObject {
  name: string;
  aliases?: string[];
  unit?: string;
  guides?: string[];
  values: [label: string, before: string, after: string][];
}

export interface PatchReference {
  id: string;
  edition: string;
  title: string;
  date: string;
  dateLabel: string;
  build: string;
  source: { name: string; url: string; rolling?: boolean };
  highlights: string[];
  observation?: string;
  groups: Partial<Record<PatchCategory, PatchObject[]>>;
}

const searchText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s/·_-]+/g, "");

export function findPatchObjects(
  reference: PatchReference,
  category: string,
  query: string,
  units?: ReadonlyMap<string, Unit>,
) {
  const needle = searchText(query.trim());
  return Object.entries(reference.groups).filter(([name]) => !category || name === category)
    .flatMap(([name, objects]) => (objects ?? [])
      .filter(object => {
        if (!needle) return true;
        const unit = object.unit ? units?.get(object.unit) : undefined;
        return [object.name, object.unit ?? "", ...(object.aliases ?? []), ...object.values.map(([label]) => label),
          ...(unit ? unitSearchNames(unit) : [])].some(value => searchText(value).includes(needle));
      })
      .map(object => ({ category: name, object })));
}

function containsSource(block: ContentBlock, url: string): boolean {
  return Boolean(block.elements?.some(element => element.text_run?.text_element_style?.link?.url === url) ||
    block.children?.some(child => containsSource(child, url)));
}

export function chapterMatchesPatch(section: Section, patch: PatchReference) {
  return section.title.trim() === patch.title || section.title.includes(patch.build) ||
    (!patch.source.rolling && section.blocks.some(block => containsSource(block, patch.source.url)));
}

/** Only the paired, published top callouts with this patch's announcement belong to it. */
export function publishedPatchCallouts(intro: Section | undefined, patch: PatchReference) {
  if (!intro || intro.id !== "introduction" || patch.source.rolling) return;
  const quotes = intro.blocks.filter(block => block.type === "quote");
  const preview = quotes.find(block => block.children?.[0]?.text?.trim() === "更新预览" && containsSource(block, patch.source.url));
  if (!preview) return;
  const observation = quotes.find(block => block.children?.[0]?.text?.trim() === "环境观察");
  const text = (block?: ContentBlock) => block?.children?.slice(1)
    .filter(child => child.text?.trim() && child.text.trim() !== "待编辑" && !containsSource(child, patch.source.url))
    .map(child => child.text!.trim()) ?? [];
  return { highlights: text(preview), observation: text(observation) };
}
