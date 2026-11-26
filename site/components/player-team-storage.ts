import type { BoardSetup, BoardStage, PieceLoadout, SourceGuide, Team } from "@/domain/types";
import { createId } from "../domain/id.ts";
import { copyBoard } from "../domain/roster-import.ts";
import { checkedGuideBoardSource, checkedSourceGuide, type GuideBoardSource } from "./guide-board-transfer.ts";

const prefix = "tft-player-team-v1:";
const backupFormat = "tft-player-teams-v1";
const draftKey = "tft-player-editor-draft-v1";

type PlayerEditorDraft = { team: Team; stage: BoardStage; guideBoardSource: GuideBoardSource | null };

class PlayerTeamStorageError extends Error {}

export function isPlayerTeamStorageKey(key: string | null): boolean {
  return key?.startsWith(prefix) === true && key.length > prefix.length;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boardPosition(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 28;
}

function isLoadout(value: unknown): boolean {
  return record(value) && typeof value.instanceId === "string" && typeof value.unitId === "string" &&
    (value.stars === 1 || value.stars === 2 || value.stars === 3) &&
    Array.isArray(value.items) && value.items.every(item => typeof item === "string");
}

function isBoard(value: unknown): value is BoardSetup {
  return record(value) && Array.isArray(value.pieces) && value.pieces.every(piece =>
    record(piece) && isLoadout(piece) && boardPosition(piece.position) &&
    (piece.alternate === undefined || isLoadout(piece.alternate)),
  ) && (value.instrumentPositions === undefined || (
    record(value.instrumentPositions) && Object.values(value.instrumentPositions).every(boardPosition)
  ));
}

function isStage(value: unknown): value is BoardStage {
  return value === "early" || value === "mid" || value === "late";
}

function checkedTeam(team: unknown, key?: string): Team | undefined {
  if (!record(team) || typeof team.id !== "string" || !team.id || (key !== undefined && prefix + team.id !== key) ||
      typeof team.name !== "string" || typeof team.category !== "string" ||
      typeof team.notes !== "string" || typeof team.revision !== "number" ||
      !Number.isSafeInteger(team.revision) || team.revision < (key === undefined ? 0 : 1) ||
      typeof team.updatedAt !== "string" || !Number.isFinite(Date.parse(team.updatedAt)) ||
      (team.mainStage !== undefined && !isStage(team.mainStage)) ||
      !isBoard(team)) return;
  if (team.stages !== undefined && (!record(team.stages) ||
    !Object.values(team.stages).every(isBoard))) return;
  return withCheckedSourceGuide(team as unknown as Team);
}

function withCheckedSourceGuide(team: Team): Team {
  if (team.sourceGuide === undefined) return team;
  const { sourceGuide, ...rest } = team;
  const source = checkedSourceGuide(sourceGuide);
  return source ? { ...rest, sourceGuide: source } : rest;
}

function readTeam(raw: string | null, key: string): Team | undefined {
  if (raw === null) return;
  try {
    return checkedTeam(JSON.parse(raw), key);
  } catch {
    return;
  }
}

async function withPlayerStorage<T>(action: (storage: Storage) => T): Promise<T> {
  const perform = () => action(window.localStorage);
  const locks = window.navigator.locks;
  return locks ? await locks.request(prefix + "write", perform) : perform();
}

export function readPlayerTeams(): Team[] {
  try {
    const storage = window.localStorage;
    const teams: Team[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === null || !isPlayerTeamStorageKey(key)) continue;
      const team = readTeam(storage.getItem(key), key);
      if (team) teams.push(team);
    }
    return teams.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
  } catch {
    throw new PlayerTeamStorageError("无法读取本机阵容，请检查浏览器的站点存储设置。");
  }
}

export function readPlayerEditorDraft(): PlayerEditorDraft | null {
  const raw = window.localStorage.getItem(draftKey);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !isStage(value.stage)) return null;
    const team = checkedTeam(value.team);
    if (!team) return null;
    const source = checkedGuideBoardSource(value.guideBoardSource, team.id);
    const guideBoardSource = source && {
      draftId: source.draftId, title: source.title, href: source.href, sourceGuide: source.sourceGuide,
      officialBoard: isBoard(source.officialBoard) ? source.officialBoard : undefined,
      restoredPlayerTeam: source.restoredPlayerTeam === true,
      sharedConditions: Array.isArray(source.sharedConditions) ? source.sharedConditions : undefined,
    };
    return { team, stage: value.stage, guideBoardSource };
  } catch {
    return null;
  }
}

export function writePlayerEditorDraft(draft: PlayerEditorDraft) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

function guideView(href: string) {
  const start = href.indexOf("?");
  const query = new URLSearchParams(start < 0 ? "" : href.slice(start + 1));
  return [query.get("stage"), query.get("flex")].join("|");
}

export function findPlayerGuideTeam(teams: Team[], source: SourceGuide) {
  const view = guideView(source.href);
  // readPlayerTeams puts the most recent copy first. Stages and flex previews
  // share a team ID, but each transfers its own official board.
  return teams.find(team => team.sourceGuide?.sectionId === source.sectionId &&
    team.sourceGuide.teamId === source.teamId && guideView(team.sourceGuide.href) === view) ??
    teams.find(team => !team.sourceGuide && (team.name === source.title || team.name === source.title.slice(0, 80)));
}

export function samePlayerBoard(left: BoardSetup, right: BoardSetup) {
  const loadout = (piece: PieceLoadout) => [piece.unitId, piece.stars, piece.items];
  const pieces = (board: BoardSetup) => [...board.pieces].sort((a, b) => a.position - b.position)
    .map(piece => [piece.position, loadout(piece), piece.alternate && loadout(piece.alternate)]);
  return JSON.stringify(pieces(left)) === JSON.stringify(pieces(right)) &&
    (["maracas", "rainstick", "infernalIdol"] as const).every(id =>
      left.instrumentPositions?.[id] === right.instrumentPositions?.[id]);
}

export function resetPlayerGuideBoard(team: Team, official: BoardSetup): Team {
  return { ...team, instrumentPositions: undefined, ...copyBoard(official) };
}

export async function savePlayerTeam(current: Team): Promise<Team> {
  const key = prefix + current.id;
  try {
    return await withPlayerStorage(storage => {
      const raw = storage.getItem(key);
      const previous = readTeam(raw, key);
      if (raw !== null && !previous) {
        throw new PlayerTeamStorageError("这份本机阵容的保存记录已损坏，请把当前棋盘另存为副本。");
      }
      if ((previous?.revision ?? 0) !== current.revision) {
        throw new PlayerTeamStorageError("这份阵容已在另一页更新或移除，请重新打开本机版本，或将当前棋盘另存为副本。");
      }
      const saved = withCheckedSourceGuide({ ...current, revision: current.revision + 1, updatedAt: new Date().toISOString() });
      storage.setItem(key, JSON.stringify(saved));
      return saved;
    });
  } catch (error) {
    if (error instanceof PlayerTeamStorageError) throw error;
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new PlayerTeamStorageError("浏览器存储空间不足，当前棋盘还在这页，可以先导出。");
    }
    throw new PlayerTeamStorageError("无法保存到本机，请检查浏览器的站点存储设置，或先导出当前棋盘。");
  }
}

export function exportPlayerTeams(): string {
  const teams = readPlayerTeams();
  if (!teams.length) throw new PlayerTeamStorageError("此浏览器还没有已保存的阵容。");
  return JSON.stringify({ format: backupFormat, teams }, null, 2);
}

export async function importPlayerTeams(
  raw: string,
  currentId: string,
  isCompatible: (team: Team) => boolean,
): Promise<{ added: number; copies: number }> {
  let backup: unknown;
  try {
    backup = JSON.parse(raw);
  } catch {
    throw new PlayerTeamStorageError("无法读取此文件，请选择从「我的阵容」导出的 JSON 备份。");
  }
  if (!record(backup) || backup.format !== backupFormat || !Array.isArray(backup.teams) || !backup.teams.length) {
    throw new PlayerTeamStorageError("此文件不是有效的本机阵容备份。");
  }
  const teams = backup.teams.map((value: unknown) => {
    const team = record(value) && typeof value.id === "string" && value.id
      ? checkedTeam(value, prefix + value.id) : undefined;
    if (!team) throw new PlayerTeamStorageError("备份中有格式无效的阵容。");
    if (!isCompatible(team)) throw new PlayerTeamStorageError(`「${team.name}」的棋盘与当前赛季不兼容。`);
    return team;
  });
  try {
    return await withPlayerStorage(storage => {
      const written: { key: string; value: string }[] = [];
      let copies = 0;
      const updatedAt = new Date().toISOString();
      try {
        for (const source of teams) {
          let id = source.id;
          while (id === currentId || storage.getItem(prefix + id) !== null) id = createId();
          const copy = id !== source.id;
          if (copy) copies++;
          const imported: Team = {
            id, name: copy ? source.name.slice(0, 75) + " · 副本" : source.name,
            category: source.category, notes: source.notes, pieces: source.pieces,
            instrumentPositions: source.instrumentPositions, mainStage: source.mainStage,
            stages: source.stages, revision: 1, updatedAt,
          };
          if (source.posterFormat === "full" || source.posterFormat === "quick") imported.posterFormat = source.posterFormat;
          if (typeof source.webTitle === "string") imported.webTitle = source.webTitle;
          if (source.sourceGuide) imported.sourceGuide = source.sourceGuide;
          const key = prefix + id;
          const value = JSON.stringify(imported);
          storage.setItem(key, value);
          written.push({ key, value });
        }
      } catch (error) {
        for (const { key, value } of written) {
          if (storage.getItem(key) === value) storage.removeItem(key);
        }
        throw error;
      }
      return { added: teams.length, copies };
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new PlayerTeamStorageError("浏览器存储空间不足，原有阵容已保留。");
    }
    throw new PlayerTeamStorageError("无法导入备份，请检查浏览器的站点存储设置。");
  }
}
