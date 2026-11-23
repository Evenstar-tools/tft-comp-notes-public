import type { Unit } from "./types";

export function unlockText(unit: Unit) {
  return unit.unlock?.text.trim() || unit.sourceUnlock?.text.trim() || "";
}

export function hasUnlockCondition(unit: Unit) {
  return !!unlockText(unit);
}
