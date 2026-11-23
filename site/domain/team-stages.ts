import type { BoardSetup, BoardStage, Team } from "./types";

export type { BoardStage } from "./types";
export const boardStages = ["early", "mid", "late"] as const;
export const stageLabels = { early: "前期", mid: "中期", late: "后期" } as const;

function boardSetup({ pieces, instrumentPositions }: BoardSetup): BoardSetup {
  return instrumentPositions ? { pieces, instrumentPositions } : { pieces };
}

function stageBoard(team: Team, stage: BoardStage): BoardSetup | undefined {
  if (stage === (team.mainStage ?? "late")) return team;
  return stage === "late" ? undefined : team.stages?.[stage];
}

function singleBoard(team: Team, setup: BoardSetup): Team {
  const result = { ...team, pieces: setup.pieces };
  delete result.mainStage;
  delete result.stages;
  if (setup.instrumentPositions) result.instrumentPositions = setup.instrumentPositions;
  else delete result.instrumentPositions;
  return result;
}

// Project only the chosen board so consumers that operate on a single board
// cannot accidentally export or copy sibling stages.
export function readTeamStage(team: Team, stage: BoardStage): Team {
  if (stage === "late" && !team.mainStage && !team.stages) return team;
  return singleBoard(team, stageBoard(team, stage) ?? { pieces: [] });
}

export function writeTeamStage(team: Team, stage: BoardStage, edited: Team): Team {
  const populated: Partial<Record<BoardStage, BoardSetup>> = {};
  let latest: BoardStage | undefined;
  for (const key of boardStages) {
    const board = key === stage ? edited : stageBoard(team, key);
    if (board?.pieces.length) {
      populated[key] = boardSetup(board);
      latest = key;
    }
  }
  if (!latest) return singleBoard(edited, { pieces: [] });
  const result = singleBoard(edited, populated[latest]!);
  delete populated[latest];
  if (latest !== "late") result.mainStage = latest;
  if (Object.keys(populated).length) result.stages = populated;
  return result;
}
