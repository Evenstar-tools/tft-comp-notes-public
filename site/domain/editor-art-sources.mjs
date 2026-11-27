// Used by the image packer and the editor so that every tile keeps the same source URL.
export const editorArtColumns = 10;

export function editorArtSources(season, bundledItemIds) {
  const bundled = new Set(bundledItemIds);
  return {
    portraits: [...new Set(season.units.map(unit => unit.image)
      .filter(src => typeof src === "string" && src.startsWith("/assets/datatft/")))],
    items: season.items.filter(item => bundled.has(item.id))
      .map(item => "/assets/items/" + item.id + ".webp"),
  };
}
