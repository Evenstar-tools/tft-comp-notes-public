import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default async function config(phase: string) {
  if (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_DEVELOPMENT_SERVER) {
    const { prepareEditorArt } = await import("./scripts/prepare-editor-art.mjs");
    await prepareEditorArt();
  }
  return nextConfig;
}
