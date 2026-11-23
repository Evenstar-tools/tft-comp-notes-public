import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";

const filename = fileURLToPath(import.meta.url);
const siteRoot = path.resolve(path.dirname(filename), "..");

export function researchRoot() {
  const candidates = [
    process.env.TFT_RESEARCH_ROOT,
    path.resolve(siteRoot, "../research"),
    path.resolve(siteRoot, "../../tft-personal-site/research"),
  ].filter(Boolean);
  const directory = candidates.find(p => fs.existsSync(path.join(p, "2026-11-16", "units-source.json")));
  if (!directory) throw new Error("Set TFT_RESEARCH_ROOT to the TFT project research directory.");
  return directory;
}

export function updateUnlocks(season, snapshot) {
  const byId = new Map(snapshot.units.map(unit => [unit.id, unit]));
  if (byId.size !== season.units.length || byId.size !== snapshot.units.length)
    throw new Error("The PBE shop roster must match every site form exactly once.");
  const traitIds = new Set(season.traits.map(t => t.id));
  let active = 0;
  for (const unit of season.units) {
    const current = byId.get(unit.id);
    if (!current || current.cost !== unit.cost || typeof current.locked !== "boolean")
      throw new Error("Invalid PBE roster match for " + unit.id);
    if (current.locked !== !!current.condition?.text || current.locked !== !!current.condition?.raw)
      throw new Error("The shop flag and the condition disagree for " + unit.id);
    delete unit.sourceUnlock;
    delete unit.unlock;
    if (current.condition) {
      const { text, raw, note = "", traitIds: related = [] } = current.condition;
      if (related.some(id => !traitIds.has(id))) throw new Error("Unknown unlock trait for " + unit.id);
      unit.unlock = { text, raw, note, source: { label: (snapshot.sourceLabel ?? "Riot PBE") + " " + snapshot.build, url: snapshot.conditionUrl ?? snapshot.releaseUrl } };
      if (related.length) unit.unlock.traitIds = related;
      active++;
    }
    if (current.displayName && current.displayName !== unit.name) {
      const names = [unit.name, current.displayName, pinyin(current.displayName, {toneType:"none", separator:""}), pinyin(current.displayName, {pattern:"first",toneType:"none",separator:""})];
      unit.aliases = [...new Set([...unit.aliases, ...names])];
      unit.name = current.displayName;
    }
  }
  if (active !== snapshot.lockedCount) throw new Error("Incomplete PBE unlock list.");
  for (const trait of season.traits) {
    const aliases = snapshot.traitAliases[trait.id]?.filter(alias => alias !== trait.name);
    if (aliases?.length) trait.aliases = [...new Set([...(trait.aliases ?? []), ...aliases])];
  }
  season.id = "s19-pbe-" + snapshot.build;
  season.sourceDate = snapshot.date;
  season.unlockRelease = { build: snapshot.build, date: snapshot.date, guideUrl: snapshot.guideUrl };
  season.sources = [...new Set([...(season.sources ?? []), snapshot.releaseUrl, snapshot.guideUrl])];
  season.notes = [...(season.notes ?? []).filter(note => !/解锁阈值仍为 X|^PBE 解锁/.test(note)), "PBE 解锁条件以当前构建的商店标记与任务为准。"];
  return season;
}

export function currentUnlocks() {
  const root = researchRoot();
  const file = fs.readdirSync(root).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()
    .map(date => path.join(root, date, "pbe-unlocks", "任务清单.json")).find(candidate => fs.existsSync(candidate));
  if (!file) throw new Error("No verified PBE unlock snapshot in " + root);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) {
  const target = path.join(siteRoot, "data", "season.json");
  const original = fs.readFileSync(target, "utf8");
  const season = updateUnlocks(JSON.parse(original), currentUnlocks());
  const json = JSON.stringify(season, null, 2) + "\n";
  fs.writeFileSync(target, original.includes("\r\n") ? json.replaceAll("\n", "\r\n") : json, "utf8");
  console.log(season.id, season.units.length + " forms", season.units.filter(u => u.unlock).length + " unlocks");
}
