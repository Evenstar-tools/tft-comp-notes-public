import { gzipSync } from "node:zlib";
import type { Publication } from "../domain/document";
import type { HomeGuideIndex } from "../lib/home-guide-index";

// Published snapshots are replaced when the publication changes. Cache the
// public payload by snapshot object so a new publication is encoded immediately.
const packedIndexes = new WeakMap<Publication, string>();

export function packedHomeGuideIndex(publication: Publication, build: () => HomeGuideIndex): string {
  let packed = packedIndexes.get(publication);
  if (packed === undefined) {
    packed = gzipSync(JSON.stringify(build())).toString("base64");
    packedIndexes.set(publication, packed);
  }
  return packed;
}
