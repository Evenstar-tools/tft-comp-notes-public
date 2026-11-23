const heroFilters = new Set(["q", "cost", "trait", "tier", "unit", "unlock", "view", "tab", "augment"]);

export function validHeroReturn(value: unknown) {
  if (typeof value !== "string" || value.length > 1024 || !/^\/heroes(?:\?|$)/.test(value) || /[\r\n\t\\]/.test(value)) return;
  const url = new URL(value, "https://tft.local");
  const keys = [...url.searchParams.keys()];
  if (url.pathname === "/heroes" && !url.hash && keys.length === new Set(keys).size && keys.every(key => heroFilters.has(key))) return value;
}

export function traitLibraryLink(traitId: string, tier?: number, grid = false) {
  const params = new URLSearchParams({ trait: traitId, ...(tier ? { tier: String(tier) } : {}), ...(grid ? { view: "grid" } : {}) });
  return (grid ? "/heroes?" : "/traits?") + params;
}
