"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { itemMap, season, unitMap } from "@/data";
import { augmentArtPath } from "@/data/augment-art";
import augmentCatalog from "@/data/augment-catalog.json";
import { conditionEquipmentCategories, conditionItemCategory, conditionKey } from "@/domain/guide-equipment-conditions";
import type { Team, TeamCondition } from "@/domain/types";
import { ItemIcon } from "./ItemIcon";
import { MatrixDialog } from "./MatrixDetails";

const tabs = [
  ["artifact", conditionEquipmentCategories.artifact],
  ["augment", "海克斯"],
  ["emblem", conditionEquipmentCategories.emblem],
  ["radiant", conditionEquipmentCategories.radiant],
] as const;
type Category = (typeof tabs)[number][0];

const augments = new Map(augmentCatalog.rows.map(augment => [augment.id, augment]));
const choices = {
  augment: augmentCatalog.rows,
  artifact: season.items.filter(item => item.category === "artifact"),
  emblem: season.items.filter(item => item.category === "emblem"),
  radiant: season.items.filter(item => item.category === "radiant"),
};

function ConditionIcon({ id, augment, size = 26 }: { id: string; augment: boolean; size?: number }) {
  if (!augment) return <ItemIcon item={itemMap.get(id)} size={size} />;
  const entry = augments.get(id);
  const art = entry && augmentArtPath(entry);
  return art ? <img src={art} width={size} height={size} alt="" loading="lazy" />
    : <span className="item-icon is-fallback" aria-hidden style={{ width: size, height: size }}>{entry?.name.slice(0, 1) ?? "?"}</span>;
}

export function EditorConditions({ team, rows, sharedRows, onChange, onClose }: {
  team: Team;
  rows: TeamCondition[];
  sharedRows: TeamCondition[];
  onChange: (conditions: TeamCondition[]) => void;
  onClose: () => void;
}) {
  const roster = new Map<string, Set<string>>();
  for (const board of [team, team.stages?.early, team.stages?.mid]) {
    for (const piece of board?.pieces ?? []) {
      for (const loadout of piece.alternate ? [piece, piece.alternate] : [piece]) {
        const items = roster.get(loadout.unitId) ?? new Set();
        for (const id of loadout.items) items.add(id);
        roster.set(loadout.unitId, items);
      }
    }
  }
  const [tab, setTab] = useState<Category>("artifact");
  const [kind, setKind] = useState<TeamCondition["kind"]>("required");
  const [choice, setChoice] = useState("");
  const [recipient, setRecipient] = useState(roster.size === 1 ? roster.keys().next().value ?? "" : "");
  const [replaces, setReplaces] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const needle = query.trim().toLocaleLowerCase();
  const results = choices[tab].filter(option => !needle || option.name.toLocaleLowerCase().includes(needle)).slice(0, 12);
  const isAugment = tab === "augment";
  const label = tabs.find(([key]) => key === tab)?.[1];
  const choiceName = isAugment ? augments.get(choice)?.name : itemMap.get(choice)?.name;
  const replacementIds = [...(roster.get(recipient) ?? [])].filter(id => id !== choice && itemMap.has(id));
  if (replaces && replaces !== choice && !replacementIds.includes(replaces)) replacementIds.push(replaces);
  const next: TeamCondition | undefined = !choiceName ? undefined : isAugment
    ? { augmentId: choice, kind } : recipient ? { itemId: choice, recipientId: recipient, replaces: replaces || undefined, kind } : undefined;
  const duplicate = next && rows.some((row, index) => index !== editing && conditionKey(row) === conditionKey(next));

  function finishEdit() {
    setEditing(null);
    setChoice("");
    setQuery("");
    setReplaces("");
  }
  function edit(row: TeamCondition, index: number) {
    setEditing(index);
    setKind(row.kind);
    setQuery("");
    if ("augmentId" in row) {
      setTab("augment");
      setChoice(row.augmentId);
      setReplaces("");
    } else {
      setTab(conditionItemCategory(itemMap.get(row.itemId)) ?? "artifact");
      setChoice(row.itemId);
      setRecipient(row.recipientId);
      setReplaces(row.replaces ?? "");
    }
  }

  function renderRows(list: TeamCondition[], shared = false) {
    return list.map((row, index) => {
      const augment = "augmentId" in row;
      const id = augment ? row.augmentId : row.itemId;
      const name = (augment ? augments.get(id)?.name : itemMap.get(id)?.name) ?? id;
      const wearer = !augment && unitMap.get(row.recipientId)?.name;
      const replacement = !augment && row.replaces && itemMap.get(row.replaces)?.name;
      return <li key={conditionKey(row)} data-editing={!shared && editing === index || undefined}>
        <ConditionIcon id={id} augment={augment} />
        <div><strong>{name}</strong>{wearer && <small>{wearer}{replacement && ` · 替换${replacement}`}</small>}</div>
        <span className="editor-condition-kind" data-required={row.kind === "required" || undefined}>{row.kind === "required" ? "必选" : "可选"}</span>
        {!shared && <>
          <button type="button" className="btn ghost icon sm" aria-label={`编辑${name}`} onClick={() => edit(row, index)}><Pencil size={15} aria-hidden /></button>
          <button type="button" className="btn ghost icon sm" aria-label={`移除${name}`} onClick={() => {
            onChange(rows.filter((_, current) => current !== index));
            if (editing === index) finishEdit();
            else if (editing !== null && index < editing) setEditing(editing - 1);
          }}><Trash2 size={15} aria-hidden /></button>
        </>}
      </li>;
    });
  }

  return <MatrixDialog title="定阵条件" className="editor-conditions-dialog" closeLabel="关闭定阵条件" onClose={onClose}>
    <div className="editor-conditions">
      <div className="editor-conditions-board">{team.name}</div>
      {sharedRows.length > 0 && <div>
        <div className="editor-conditions-board">攻略共用</div>
        <ul className="editor-condition-list" data-shared aria-label="攻略共用条件">{renderRows(sharedRows, true)}</ul>
      </div>}
      {rows.length > 0 && <ul className="editor-condition-list" aria-label="已添加的条件">{renderRows(rows)}</ul>}
      <form className="editor-condition-form" onSubmit={event => {
        event.preventDefault();
        if (!next || duplicate) return;
        onChange(editing === null ? [...rows, next] : rows.map((row, index) => index === editing ? next : row));
        finishEdit();
      }}>
        <div className="editor-condition-types" role="group" aria-label="条件类型">
          {tabs.map(([category, name]) => <button key={category} type="button" className="btn secondary sm" aria-pressed={tab === category}
            onClick={() => {
              if (category === tab) return;
              setTab(category);
              setChoice("");
              setQuery("");
            }}>{name}</button>)}
        </div>
        {choiceName ? <div className="editor-condition-selected">
          <ConditionIcon id={choice} augment={isAugment} />
          <strong>{choiceName}</strong>
          <button className="btn ghost sm" type="button" onClick={() => { setChoice(""); setQuery(""); }}>更换</button>
        </div> : <div>
          <label className="search-field sm">
            <Search size={15} aria-hidden />
            <input type="search" aria-label={`搜索${label}`} placeholder={`搜索${label}`} value={query} onChange={event => setQuery(event.target.value)} />
          </label>
          <div className="editor-condition-results" aria-label={`${label}选项`}>
            {results.map(option => <button key={option.id} type="button" className="btn secondary sm" onClick={() => {
              setChoice(option.id);
              if (replaces === option.id) setReplaces("");
            }}>
              <ConditionIcon id={option.id} augment={isAugment} size={22} /><span>{option.name}</span>
            </button>)}
            {!results.length && <span className="menu-empty">没有匹配结果</span>}
          </div>
        </div>}
        {!isAugment && <div className="editor-condition-fields">
          <label>给谁
            <select value={recipient} onChange={event => { setRecipient(event.target.value); setReplaces(""); }}>
              <option value="">{roster.size ? "选择棋子" : "棋盘无棋子"}</option>
              {recipient && !roster.has(recipient) && <option value={recipient}>{unitMap.get(recipient)?.name ?? recipient}</option>}
              {[...roster.keys()].map(id => <option key={id} value={id}>{unitMap.get(id)?.name ?? id}</option>)}
            </select>
          </label>
          <label>替换装备
            <select value={replaces} disabled={!replacementIds.length} onChange={event => setReplaces(event.target.value)}>
              <option value="">不替换</option>
              {replacementIds.map(id => <option key={id} value={id}>{itemMap.get(id)?.name ?? id}</option>)}
            </select>
          </label>
        </div>}
        <div className="editor-condition-actions">
          <div className="editor-condition-kinds" role="group" aria-label="是否必选">
            <button type="button" className="btn secondary sm" aria-pressed={kind === "required"} onClick={() => setKind("required")}>必选</button>
            <button type="button" className="btn secondary sm" aria-pressed={kind === "option"} onClick={() => setKind("option")}>可选</button>
          </div>
          {duplicate && <small role="status">这个条件已添加</small>}
          {editing !== null && <button type="button" className="btn ghost sm" onClick={finishEdit}>取消编辑</button>}
          <button type="submit" className="btn primary sm" disabled={!next || !!duplicate}>
            {editing === null ? <><Plus size={15} aria-hidden />添加条件</> : "应用修改"}
          </button>
        </div>
      </form>
    </div>
  </MatrixDialog>;
}
