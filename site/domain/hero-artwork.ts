import sourceFocus from "../data/hero-artwork-focus.json";
import type { Unit } from "./types";

type Focus = { x: number; y: number };
const focusByUnit: Record<string, number[]> = sourceFocus;

/** Focus coordinates measured against the S19 720 × 427 splash images. */
export function heroArtworkFocus(unit: Pick<Unit, "id" | "splashImage">): Focus | undefined {
  if (unit.splashImage !== "/assets/datatft/" + unit.id + "-splash.jpg") return;
  const mark = focusByUnit[unit.id];
  if (mark) return { x: mark[0] / 100, y: mark[1] / 100 };
}
