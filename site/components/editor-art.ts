/// <reference types="next/image-types/global" />
import season from "@/data/season.json";
import bundledItemIds from "@/data/item-art.json";
import { editorArtColumns, editorArtSources } from "@/domain/editor-art-sources.mjs";
import portraits from "../.editor-art/portraits.webp";
import items from "../.editor-art/items.webp";

const sources = editorArtSources(season, bundledItemIds);
const sheets = { portraits, items };
const columns = editorArtColumns;
export const editorArt = new Map(
  (Object.keys(sheets) as (keyof typeof sheets)[]).flatMap(name => {
    const urls: string[] = sources[name];
    const rows = Math.ceil(urls.length / columns);
    return urls.map((url, index) => [url, {
      image: sheets[name].src, x: index % columns, y: Math.floor(index / columns), columns, rows,
    }] as const);
  }),
);
