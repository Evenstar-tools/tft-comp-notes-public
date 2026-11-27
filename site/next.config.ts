import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants.js";

export default async function config(phase: string): Promise<NextConfig> {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    const { prepareEditorArt } = await import("./scripts/prepare-editor-art.mjs");
    await prepareEditorArt();
  }
  // Next freezes each loaded config. EdgeOne injects its image loader on each load.
  return {
    agentRules: false,
    serverExternalPackages: ["@libsql/client", "libsql"],
  };
}
