import { hexPosition } from "./board-layout";
import { traitCounts } from "./team";
import type { BoardInstrumentId, Piece, Season, Team } from "./types";

export interface BoardInstrument {
  id: BoardInstrumentId;
  name: string;
  image: string;
}

export const BOARD_INSTRUMENT_NOTE = "乐器站位示意";
const idol: BoardInstrument = {
  id: "infernalIdol", name: "地狱偶像", image: "/assets/infernal-idol.webp",
};

export function boardMarkerNote(instruments: ReadonlyMap<number, BoardInstrument>) {
  if (![...instruments.values()].some(instrument => instrument.id === idol.id)) return BOARD_INSTRUMENT_NOTE;
  return instruments.size > 1 ? "乐器与地狱偶像站位示意" : "地狱偶像站位示意";
}

// 名称采用 PBE 简中，组合和位置用于示意。
const examples: readonly (BoardInstrument & { preferred: number })[] = [
  { id: "maracas", name: "砂槌", image: "/assets/ocean-maracas.png", preferred: 9 },
  { id: "rainstick", name: "雨棍", image: "/assets/ocean-rainstick.png", preferred: 15 },
];

function boardPosition(position?: number): position is number {
  return typeof position === "number" && Number.isInteger(position) && position >= 0 && position < 28;
}

export function boardInstruments(pieces: readonly Piece[], data: Season, positions?: Team["instrumentPositions"]): Map<number, BoardInstrument> {
  const traits = traitCounts([...pieces], data.units, data.traits, data.items);
  const level = traits.find(trait => trait.id === "beach-pop")?.level ?? 0;
  const result = new Map<number, BoardInstrument>();
  const occupied = new Set(pieces.map(piece => piece.position));
  const idolPosition = positions?.infernalIdol;
  if (boardPosition(idolPosition) && !occupied.has(idolPosition)
    && traits.some(trait => trait.id === "rock" && trait.level >= 3)) result.set(idolPosition, idol);
  const count = level >= 5 ? 2 : level >= 3 ? 1 : 0;
  if (!count) return result;

  const instruments = examples.slice(0, count);
  const placed = new Set<BoardInstrumentId>();
  for (const instrument of instruments) {
    const position = positions?.[instrument.id];
    if (!boardPosition(position) || occupied.has(position) || result.has(position)) continue;
    result.set(position, instrument);
    placed.add(instrument.id);
  }

  const available = Array.from({ length: 28 }, (_, position) => position)
    .filter(position => !occupied.has(position));
  for (const instrument of instruments) {
    if (placed.has(instrument.id)) continue;
    const preferred = positions?.[instrument.id];
    const target = hexPosition(boardPosition(preferred) ? preferred : instrument.preferred);
    let closest: number | undefined;
    let nearest = Infinity;
    for (const position of available) {
      if (result.has(position)) continue;
      const point = hexPosition(position);
      const distance = (point.x - target.x) ** 2 + (point.y - target.y) ** 2;
      if (distance < nearest) {
        closest = position;
        nearest = distance;
      }
    }
    if (closest !== undefined) result.set(closest, instrument);
  }
  return result;
}

export function moveBoardInstrument(team: Team, data: Season, id: BoardInstrumentId, position: number): Team {
  if (!boardPosition(position) || team.pieces.some(piece => piece.position === position)) return team;
  const instruments = boardInstruments(team.pieces, data, team.instrumentPositions);
  const source = [...instruments].find(([, instrument]) => instrument.id === id)?.[0];
  if (source === undefined || source === position) return team;

  const instrumentPositions = { ...team.instrumentPositions, [id]: position };
  const destination = instruments.get(position);
  if (destination) instrumentPositions[destination.id] = source;
  return { ...team, instrumentPositions };
}
