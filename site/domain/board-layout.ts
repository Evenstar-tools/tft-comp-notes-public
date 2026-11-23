// Pointy-top hexes: adjacent rows move half a column and sqrt(3)/2 of a column down.
// A small inset leaves a consistent gap between neighbouring hex edges.
export const HEX_WIDTH = 94;
export const HEX_HEIGHT = HEX_WIDTH * 2 / Math.sqrt(3);
export const COLUMN_PITCH = 100;
export const ROW_PITCH = COLUMN_PITCH * Math.sqrt(3) / 2;
export const BOARD_WIDTH = COLUMN_PITCH * 6.5 + HEX_WIDTH;
export const BOARD_HEIGHT = ROW_PITCH * 3 + HEX_HEIGHT;
export const HEX_POINTS = [[0.5, 0], [1, 0.25], [1, 0.75], [0.5, 1], [0, 0.75], [0, 0.25]] as const;
// 24 × 24 artwork shared by the board's SVG and canvas exports.
export const STAR_PATH = "M12 2.6l2.83 5.73 6.33.92-4.58 4.46 1.08 6.3L12 17.04l-5.66 2.97 1.08-6.3L2.84 9.25l6.33-.92z";

export function hexPosition(position: number) {
  const row = Math.floor(position / 7);
  return {
    x: (position % 7) * COLUMN_PITCH + (row % 2) * COLUMN_PITCH / 2,
    y: row * ROW_PITCH,
  };
}

export function boardNeighbors(position: number) {
  const origin = hexPosition(position);
  return Array.from({ length: 28 }, (_, n) => n).filter(n => {
    if (n === position) return false;
    const point = hexPosition(n);
    return Math.hypot(point.x - origin.x, point.y - origin.y) <= COLUMN_PITCH + 0.001;
  });
}
