import { gunzipSync } from "fflate";
import type { CompTrendModel } from "../domain/comp-trends";
import type { Section } from "../domain/document";

export type HomeGuideIndex = {
  sections: Section[];
  heroSections: Section[];
  trends?: CompTrendModel;
};

export function decodeHomeGuideIndex(encoded: string): HomeGuideIndex {
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as HomeGuideIndex;
}
