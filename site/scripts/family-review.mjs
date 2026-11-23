// Items here only identify representative output and tank builds. Mixed, utility and unknown builds stay unclassified.
const damage = new Set("ArchangelsStaff Bloodthirster BlueBuff Deathblade GiantSlayer GuinsoosRageblade HandOfJustice HextechGunblade InfinityEdge JeweledGauntlet KrakensFury LastWhisper NashorsTooth RabadonsDeathcap SpearOfShojin StrikersFlail".split(" "));
const defense = new Set("BrambleVest DragonsClaw Evenshroud GargoyleStoneplate ProtectorsVow SpiritVisage SunfireCape WarmogsArmor".split(" "));

export function sourceProfile(group, sourceIds) {
  const units = (group?.units_string ?? "").split(/,\s*/).filter(Boolean);
  const builds = [];
  for (const row of group?.builds ?? []) {
    if (!units.includes(row.unit) || row.num_items !== 3 || row.buildName?.length !== 3) continue;
    const items = row.buildName.map(name => name.replace(/^DA_/, ""));
    const role = items.filter(item => damage.has(item)).length >= 2 ? "输出" :
      items.filter(item => defense.has(item)).length >= 2 ? "坦克" : null;
    if (role) builds.push({ unitId:sourceIds.get(row.unit), apiId:row.unit, role, items, games:row.count });
  }
  const roll = /^lvl ([567])$/i.exec(group?.levelling ?? "");
  return { units:units.map(id => sourceIds.get(id) ?? id), builds, rollLevel:roll ? Number(roll[1]) : null,
    tempo:group?.levelling ?? null, unmapped:units.filter(id => !sourceIds.has(id)) };
}

function roleIds(board, label) {
  return board.roles.filter(role => role.label === label || (label === "主C" && role.label === "主输出"))
    .flatMap(role => role.units).filter(id => board.units.includes(id));
}

export function compareBoards(source, boards) {
  const unique = key => new Set(source.builds.filter(b => b.role === key).map(b => b.unitId).filter(Boolean));
  const damageDealers = unique("输出"), tanks = unique("坦克");
  return boards.filter(board => !board.stage).flatMap(board => {
    const same = board.units.filter(id => source.units.includes(id)).length;
    const carries = roleIds(board,"主C"), frontline = roleIds(board,"主坦");
    const matchedCarries = carries.filter(id => damageDealers.has(id));
    const matchedTanks = frontline.filter(id => tanks.has(id));
    const roleConflict = carries.some(id => tanks.has(id) && !damageDealers.has(id)) ||
      frontline.some(id => damageDealers.has(id) && !tanks.has(id));
    const rollConflict = !!(source.rollLevel && board.rollLevel && source.rollLevel !== board.rollLevel);
    if (same < Math.min(4,board.units.length) || (!matchedCarries.length && same < 6)) return [];
    return [{guide:board.guide,board:board.board,sectionId:board.sectionId,teamId:board.teamId,
      special:board.special,sameUnits:same,matchedCarries,matchedTanks,guideCarries:carries,guideTanks:frontline,
      guideRollLevel:board.rollLevel,roleConflict,rollConflict,
      // Shared membership may surface a candidate even when its carry or roll plan differs.
      fit:(matchedCarries.length ? 10 : 0) + (matchedTanks.length ? 3 : 0) + same - (roleConflict ? 14 : 0) - (rollConflict ? 12 : 0)}];
  }).sort((a,b)=>b.fit-a.fit || b.sameUnits-a.sameUnits || a.teamId.localeCompare(b.teamId));
}

export function changeSignals(before, observation) {
  if (!before || !Array.isArray(before.allGroups)) return {comparison:"首次记录",signals:[]};
  if (!["set","queue","patch","model","days"].every(k => before[k] === observation[k])) {
    return {comparison:"版本、队列、窗口或分组模型已换，重新建立基线",signals:[]};
  }
  if (!(Date.parse(before.updatedAt) < Date.parse(observation.updatedAt))) return {comparison:"同一来源批次",signals:[]};
  const old = new Map(before.allGroups.map(g=>[g.id,g]));
  const signals = [];
  for (const now of observation.allGroups) {
    const last = old.get(now.id);
    old.delete(now.id);
    if (!last) { signals.push({id:now.id, reasons:["新增分组"], after:now}); continue; }
    const reasons = [];
    if (last.roster !== now.roster) reasons.push("代表棋盘有变");
    if (last.tempo && last.tempo !== now.tempo) reasons.push("搜牌节奏有变");
    if (last.equipmentRoles && JSON.stringify(last.equipmentRoles) !== JSON.stringify(now.equipmentRoles)) reasons.push("代表配装分工有变");
    if (now.games >= 100 && last.games >= 100) {
      const mean = now.mean-last.mean, pick = now.playersPerLobby-last.playersPerLobby;
      if (Math.abs(mean) >= .25) reasons.push(mean < 0 ? "均名变好" : "均名变差");
      if (Math.abs(pick) >= .10) reasons.push(pick > 0 ? "登场上涨" : "登场下降");
    }
    if (reasons.length) signals.push({id:now.id,reasons,before:last,after:now});
  }
  for (const entry of old.values()) signals.push({id:entry.id,reasons:["原分组不再出现"],before:entry});
  return {comparison:"同补丁同模型",comparedTo:before.updatedAt,signals};
}

export function makeReviewQueue(observation, catalog, groups, unitIds, bindings, signals, reviewedRows) {
  const indexed = new Map(signals.map(signal => [signal.id,signal.reasons]));
  const bindingsById = new Map(bindings.map(b=>[b.clusterId,b]));
  const alerts = new Map(reviewedRows.map(r=>[r.id,r.reason]));
  const normal = [], conditional = new Map();
  for (const entry of observation.allGroups) {
    const binding = bindingsById.get(entry.id);
    if (binding && !indexed.has(entry.id) && !alerts.has(entry.id)) continue;
    const source = sourceProfile(groups[entry.id],unitIds);
    const matches = compareBoards(source,catalog);
    const neighbors = matches.filter(m=>!m.special).slice(0,3);
    const viable = neighbors.find(m => m.matchedCarries.length && !m.roleConflict && !m.rollConflict);
    normal.push({id:entry.id,reasons:indexed.get(entry.id) ?? [alerts.get(entry.id) ?? "未收录"],games:entry.games,
      sourceKey:entry.sourceKey,mean:entry.mean,playersPerLobby:entry.playersPerLobby,
      proposal:binding ? "复核已收体系" : viable ? "核对是否补变阵" : "核对是否单开",
      binding:binding && {guide:binding.name,sectionId:binding.sectionId,teamId:binding.teamId},
      source,neighbors});
    for (const near of matches.filter(m => m.special && m.matchedCarries.length && !m.roleConflict && !m.rollConflict)) {
      const key=near.sectionId+"/"+near.teamId;
      const links=conditional.get(key) ?? [];
      links.push(entry.id); conditional.set(key,links);
    }
  }
  // Dedicated board queries are required even when a conditional guide has no similar ordinary cluster.
  const special = catalog.filter(b=>b.special && !b.stage).map(board=>({guide:board.guide,board:board.board,
    sectionId:board.sectionId,teamId:board.teamId,kind:board.special,augment:board.augment,emblems:board.emblems,
    relatedGroups:conditional.get(board.sectionId+"/"+board.teamId) ?? [],
    requires:board.special==="英雄强化" ? "对应强化实际选取、指定主C三星及实装" : "实际纹章与持有者"}));
  const sightings = [];
  for (const entry of observation.allGroups) {
    const group = groups[entry.id];
    for (const row of group?.builds ?? []) {
      for (const item of row.buildName ?? []) {
        if (!/_Emblem$/i.test(item)) continue;
        sightings.push({id:entry.id,kind:"转职",unitId:unitIds.get(row.unit) ?? row.unit,emblem:item,
          exampleGames:row.count,scope:"来源代表配装，另查实际佩戴者对局"});
      }
    }
    for (const raw of group?.top_augments ?? []) {
      const id = typeof raw === "string" ? raw : (raw?.apiName ?? raw?.augment);
      if (id && /HeroAugment/i.test(id)) sightings.push({id:entry.id,kind:"英雄强化",augment:id,scope:"单独查实际选取及主C实装"});
    }
  }
  return {normal,special,conditionalSightings:sightings};
}
