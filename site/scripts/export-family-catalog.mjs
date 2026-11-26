import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = new URL("../", import.meta.url);
const resolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!context.parentURL?.startsWith(root.href)) return nextResolve(specifier, context);
    const projectAlias = specifier.startsWith("@/");
    const target = projectAlias ? new URL(specifier.slice(2), root).href : specifier;
    if (target.endsWith(".json")) {
      return { ...nextResolve(target, context), importAttributes: { ...context.importAttributes, type: "json" } };
    }
    try {
      return nextResolve(target, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !(projectAlias || specifier.startsWith("."))) throw error;
      return nextResolve(target + ".ts", context);
    }
  },
});
const [
  { season }, { sectionTeams }, { guideCatalog }, { guideSectionWithCurrentNames }, { sameEdition },
  { refreshWebDetails }, { includeRerollBoards }, { migrateS19GuideSnapshot },
] = await Promise.all([
  import("../data/index.ts"), import("../domain/document-flow.ts"), import("../domain/guide-catalog.ts"),
  import("../domain/guide-reading.ts"), import("../domain/version-updates.ts"), import("../server/guide-details.ts"),
  import("../server/reroll-guides.ts"), import("../server/s19-guide-cleanup.ts"),
]).finally(() => resolver.deregister());

export function buildFamilyCatalog(snapshot) {
  if (snapshot?.season?.id !== season.id || !Array.isArray(snapshot.sections) ||
      !Number.isFinite(Date.parse(snapshot.publishedAt))) {
    throw new Error("公开快照与 season.json 的赛季不一致或缺少发布时间");
  }
  const publication = includeRerollBoards(migrateS19GuideSnapshot(structuredClone(snapshot)), season);
  const sections = publication.sections.map(section => {
    const hasTeams = sectionTeams(section).length > 0;
    const edition = (section.gameData ?? publication.season).id;
    if (hasTeams && sameEdition(edition, season.id)) refreshWebDetails(section);
    return edition.startsWith("s19-") && (section.kind === "guide" || hasTeams)
      ? guideSectionWithCurrentNames(section) : section;
  });
  const boards = guideCatalog(sections, publication.season);
  if (!boards.some(board => board.edition === season.id)) throw new Error("公开快照缺少同版攻略棋盘");
  return { seasonId: publication.season.id, publishedAt: publication.publishedAt, boards };
}

async function main() {
  const { values } = parseArgs({ options: { output: { type: "string" } } });
  const path = values.output ? resolve(values.output) : fileURLToPath(new URL("outputs/family-review/catalog.json", root));
  const preview = JSON.parse(await readFile(new URL("data/public-preview.json", root), "utf8"));
  const catalog = buildFamilyCatalog(preview);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  console.log(`已导出 ${catalog.boards.length} 个公开棋盘 · ${catalog.seasonId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
