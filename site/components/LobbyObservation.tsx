"use client";

import { useState } from "react";
import families from "@/data/lobby-families.json";
import { observeLobbies, type LobbyRecord } from "@/domain/lobby-observation";

const familyNames = new Map(families.map(family => [family.id, family.name]));
const lobbyScope = "纳入普通对局及同局玩家的近期战绩，均名按整局结算。";

export function LobbyObservation({ lobbies, initialTarget }: { lobbies: LobbyRecord[]; initialTarget?: string }) {
  const direct = initialTarget && familyNames.has(initialTarget) ? initialTarget : undefined;
  const [target, setTarget] = useState(direct ?? families[0].id);
  const [open, setOpen] = useState(Boolean(direct));
  const family = families.find(entry => entry.id === target)!;
  const result = observeLobbies(lobbies, target);
  return <details id="lobby-observation" className="lobby-observation" open={open}
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>同场表现</summary>
    <div className="lobby-panel">
      {lobbies.length === 0 ? <p>这个版本还没有完整的八人结算记录。</p> : <>
        <div className="lobby-heading">
          <label>观察阵容 <select value={target} onChange={event => setTarget(event.target.value)}>
            {families.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>
          <small>{lobbies.length} 局 · {new Intl.DateTimeFormat("zh-CN", {month: "numeric", day: "numeric", timeZone: "Asia/Shanghai"}).format(lobbies[0].at)} 最近结算</small>
        </div>
        <p className="lobby-rule">{family.rule}。其余棋子不限。</p>
        {result.mean === null ? <p>这批对局里还没有符合条件的棋盘。</p> : <>
          <p className="lobby-mean">本批均名 <b>{result.mean.toFixed(2)}</b><span>{result.games} 个棋盘{result.games < 100 && " · 小样本"}</span></p>
          {result.rows.length ? <table><thead><tr><th scope="col">同局其他玩家的阵容</th><th scope="col">目标均名</th><th scope="col">较本批</th><th scope="col">棋盘数</th></tr></thead>
            <tbody>{result.rows.map(row => <tr key={row.id}>
              <td>{familyNames.get(row.id)}{row.id === target && "（同行）"}</td><td>{row.mean.toFixed(2)}</td>
              <td>{Math.abs(row.delta) < .005 ? "持平" : (row.delta > 0 ? "差 " : "好 ") + Math.abs(row.delta).toFixed(2)}</td><td>{row.games}</td>
            </tr>)}</tbody></table> : <p>同局其他七人均未命中已收录阵容。</p>}
          <details className="lobby-sources"><summary>原始对局（{result.examples.length} 局）</summary>
            <ul>{result.examples.map((game, index) => <li key={game.id}><a href={"https://matches3.metatft.com/" + game.id + ".json"} target="_blank" rel="noreferrer" title={game.id}>第 {index + 1} 局</a><span>第 {game.placements.join("、")} 名</span></li>)}</ul>
          </details>
        </>}
        <p className="lobby-rule" title={lobbyScope}>MetaTFT 近期 PBE 对局去重统计<span className="sr-only">。{lobbyScope}</span></p>
      </>}
    </div>
  </details>;
}
