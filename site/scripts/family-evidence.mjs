function isLink(value) {
  try {return new URL(value).protocol === "https:";} catch {return false;}
}

export function crossCheck(evidence, group, observation) {
  const to = Date.parse(observation.updatedAt), from = to-observation.days*86400000;
  const record = evidence.filter(r=>String(r.id) === group.id && r.set === observation.set && r.queue === observation.queue &&
    r.patch === observation.patch && r.model === observation.model && Date.parse(r.sourceUpdatedAt) >= from && Date.parse(r.sourceUpdatedAt) <= to)
    .sort((a,b)=>Date.parse(b.sourceUpdatedAt)-Date.parse(a.sourceUpdatedAt))[0];
  const secondary = record?.secondSource;
  const buildChecked = isLink(secondary?.url) && !/(^|\.)metatft\.com$/i.test(new URL(secondary.url).hostname) &&
    !!secondary?.finding && secondary.matchesBuild === true;
  const player = record?.player;
  const rankChecked = isLink(player?.rankUrl) && !!player?.rank && !/unknown|未知|未定级|unranked/i.test(player.rank) && !!player?.name;
  const byCarry = new Map();
  for (const row of player?.matches ?? []) {
    if (row.patch !== observation.patch || row.queue !== observation.queue || row.playerName !== player.name || !row.sameBuild ||
        !isLink(row.url) || !row.id || row.placement < 1 || row.placement > 8 || !Number.isInteger(row.placement) || !row.carry || !row.items?.length) continue;
    if (!byCarry.has(row.carry)) byCarry.set(row.carry,new Set());
    byCarry.get(row.carry).add(row.id);
  }
  const playerChecked = rankChecked && [...byCarry.values()].some(ids=>ids.size>=2);
  return {observedAt:record?.sourceUpdatedAt ?? null,secondSource:secondary ?? null,player:player ?? null,
    secondBuildChecked:buildChecked,secondSourceChecked:buildChecked && secondary.patch === observation.patch,
    playerHistoryChecked:!!playerChecked,
    status:buildChecked && secondary.patch === observation.patch && playerChecked ? "可人工决定收录" : "待交叉核对"};
}
