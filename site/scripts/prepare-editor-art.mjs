import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { editorArtColumns, editorArtSources } from "../domain/editor-art-sources.mjs";

export async function prepareEditorArt() {
  const { default: sharp } = await import("sharp");
  const readData = async name => JSON.parse(await readFile(path.join("data", name + ".json"), "utf8"));
  const sheets = editorArtSources(await readData("season"), await readData("item-art"));
  await mkdir(".editor-art", { recursive: true });
  for (const [name, sources] of Object.entries(sheets)) {
    const size = name === "portraits" ? 96 : 64;
    const columns = editorArtColumns;
    const rows = Math.max(1, Math.ceil(sources.length / columns));
    const tiles = await Promise.all(sources.map(async (src, index) => ({
      input: await sharp(path.join("public", src)).resize(size, size, { fit: "cover" }).png().toBuffer(),
      left: index % columns * size,
      top: Math.floor(index / columns) * size,
    })));
    const image = await sharp({ create: {
      width: columns * size, height: rows * size, channels: 4, background: "#00000000",
    } }).composite(tiles).webp({ quality: 84, effort: 5 }).toBuffer();
    const file = path.join(".editor-art", name + ".webp");
    const previous = await readFile(file).catch(() => undefined);
    if (!previous?.equals(image)) await writeFile(file, image);
  }
}
