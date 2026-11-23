import type { Team } from "@/domain/types";

const prefix = "tft-player-team-v1:";

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

function isBoard(value: Record<string, unknown>): boolean {
  return Array.isArray(value.pieces) && value.pieces.every(piece =>
    record(piece) && typeof piece.instanceId === "string" && typeof piece.unitId === "string" &&
    boardPosition(piece.position) && (piece.stars === 1 || piece.stars === 2 || piece.stars === 3) &&
    Array.isArray(piece.items) && piece.items.every(item => typeof item === "string"),
  ) && (value.instrumentPositions === undefined || (
    record(value.instrumentPositions) && Object.values(value.instrumentPositions).every(boardPosition)
  ));
}

function readTeam(raw: string | null, key: string): Team | undefined {
  if (raw === null) return;
  let team: unknown;
  try {
    team = JSON.parse(raw);
  } catch {
    return;
  }
  if (!record(team) || typeof team.id !== "string" || prefix + team.id !== key ||
      typeof team.name !== "string" || typeof team.category !== "string" ||
      typeof team.notes !== "string" || typeof team.revision !== "number" ||
      !Number.isSafeInteger(team.revision) || team.revision < 1 ||
      typeof team.updatedAt !== "string" || !Number.isFinite(Date.parse(team.updatedAt)) ||
      (team.mainStage !== undefined && team.mainStage !== "early" && team.mainStage !== "mid" && team.mainStage !== "late") ||
      !isBoard(team)) return;
  if (team.stages !== undefined && (!record(team.stages) ||
    !Object.values(team.stages).every(stage => record(stage) && isBoard(stage)))) return;
  return team as unknown as Team;
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

export async function savePlayerTeam(current: Team): Promise<Team> {
  const key = prefix + current.id;
  const persist = () => {
    const storage = window.localStorage;
    const raw = storage.getItem(key);
    const previous = readTeam(raw, key);
    if (raw !== null && !previous) {
      throw new PlayerTeamStorageError("这份本机阵容的保存记录已损坏，请把当前棋盘另存为副本。");
    }
    if ((previous?.revision ?? 0) !== current.revision) {
      throw new PlayerTeamStorageError("这份阵容已在另一页更新或移除，请重新打开本机版本，或将当前棋盘另存为副本。");
    }
    const saved = { ...current, revision: current.revision + 1, updatedAt: new Date().toISOString() };
    storage.setItem(key, JSON.stringify(saved));
    return saved;
  };
  try {
    const locks = window.navigator.locks;
    return locks ? await locks.request(key, persist) : persist();
  } catch (error) {
    if (error instanceof PlayerTeamStorageError) throw error;
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new PlayerTeamStorageError("浏览器存储空间不足，当前棋盘还在这页，可以先导出。");
    }
    throw new PlayerTeamStorageError("无法保存到本机，请检查浏览器的站点存储设置，或先导出当前棋盘。");
  }
}
