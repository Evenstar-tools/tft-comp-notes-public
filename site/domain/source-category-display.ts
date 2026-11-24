const storedDraftCategories = new Map([
  ["次选成熟阵容", "次选"],
  ["连胜成型阵容", "连胜"],
  ["连败成型阵容", "连败"],
  ["条件定阵阵容", "条件定阵"],
]);

export function draftCategoryValue(category: string) {
  return storedDraftCategories.get(category) ?? category;
}

export function draftCategoryLabel(category: string) {
  const value = draftCategoryValue(category);
  if (value === "次选") return "草稿备选";
  if (value === "连胜" || value === "连败") return value + "开局";
  if (value === "非常规构筑") return "其他打法";
  return value === "条件定阵" ? "条件开局" : value;
}

export function sourceSectionTitle({ title, level, kind, category: folder }: {
  title: string; level?: number; kind?: string; category?: string;
}) {
  if (level !== 1 && title !== folder && kind !== "category") return title;
  const name = title.trim().replace(/^\d+\s*[.．、]\s*/, "");
  const category = storedDraftCategories.get(name);
  if (!category) return title;
  return category === "次选" ? "阵容目录" : draftCategoryLabel(category);
}
