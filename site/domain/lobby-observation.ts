export type LobbyRecord = {
  id: string;
  build: string;
  at: number;
  /** Sorted by final placement, starting at first. A seat may qualify for several families. */
  seats: string[][];
};

export function observeLobbies(lobbies: readonly LobbyRecord[], target: string) {
  const groups = new Map<string, { games: number; sum: number }>();
  const examples: { id: string; placements: number[] }[] = [];
  let games = 0;
  let sum = 0;
  for (const lobby of lobbies) {
    const placements: number[] = [];
    for (const [index, seat] of lobby.seats.entries()) {
      if (!seat.includes(target)) continue;
      const place = index + 1;
      games++;
      sum += place;
      placements.push(place);
      // Multiple players on the same opposing comp count as one exposure per target player.
      const opponents = new Set(lobby.seats.filter((_, i) => i !== index).flat());
      for (const opponent of opponents) {
        const record = groups.get(opponent) ?? { games: 0, sum: 0 };
        record.games++;
        record.sum += place;
        groups.set(opponent, record);
      }
    }
    if (placements.length) examples.push({ id: lobby.id, placements });
  }
  const mean = games ? sum / games : null;
  const rows = [...groups].map(([id, group]) => ({
    id, games: group.games, mean: group.sum / group.games, delta: group.sum / group.games - (mean ?? 0),
  })).sort((a, b) => b.games - a.games || a.id.localeCompare(b.id));
  return { games, mean, rows, examples };
}
