"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Search, SquarePen, X } from "lucide-react";
import { TraitBadge } from "@/components/Glyphs";
import meta from "@/data/combos-s19-meta.json";
import tiers from "@/data/combo-tiers-s19.json";
import { comboStarMask, comboTierCounts } from "@/domain/combo-tiers";
import { hasUnlockCondition } from "@/domain/unlocks";
import { unitSearchNames } from "@/domain/unit-search.mjs";
type Purpose = "all" | "jazz" | "bronze";
import { traitMap, unitLabel, unitMap } from "@/data";

type Row = [
  number[],
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
type Group = "default" | "high";
type HeldUnit = { stars: 1 | 2; required: boolean };
const size = 8;
const heroes = meta.units;
const traits = meta.traits.map(trait => ({ ...trait, siteName: traitMap.get(trait.id)?.name ?? trait.siteName }));
const byId = new Map(heroes.map((u, index) => [u.id, index]));
const number = (value: number) => value.toLocaleString("zh-CN");
function activeTraits(
  indices: number[],
  mask: number,
  source: "siteTraits" | "dataTraits",
) {
  const counts = new Map<string, number>();
  indices.forEach((id, position) =>
    heroes[id][source].forEach((trait) =>
      counts.set(
        trait,
        (counts.get(trait) ?? 0) +
          (trait === "k-da" && mask & (1 << position) ? 2 : 1),
      ),
    ),
  );
  return traits.filter((t) => (counts.get(t.id) ?? 0) >= t.threshold);
}
function ComboResult({
  row,
  purpose,
  hand,
  heldAtTwo,
  from,
  allOne,
}: {
  row: Row;
  purpose: Purpose;
  hand: number[];
  heldAtTwo: ReadonlySet<number>;
  from: string;
  allOne: boolean;
}) {
  const [indices, , , , , cost, , , upgrades] = row;
  const { mask, pending } = comboStarMask(indices, allOne ? 0 : upgrades, heldAtTwo, heroes);
  const currentTier = comboTierCounts(indices, mask, heroes, tiers.traits);
  const jazzCount = purpose === "jazz" ? indices.filter(id => heroes[id].siteTraits.includes("jazz")).length : 0;
  const needed = indices.filter((id) => !hand.includes(id));
  const upgradesNeeded = indices.filter((_, i) => pending & (1 << i));
  const activeSite = activeTraits(indices, mask, "siteTraits");
  const activeData = activeTraits(indices, mask, "dataTraits");
  const site = activeSite.length, data = activeData.length;
  const locked = needed.map(id => unitMap.get(heroes[id].id)!).filter(hasUnlockCondition);
  const common = activeSite.filter((t) =>
    activeData.some((other) => other.id === t.id),
  );
  const siteOnly = activeSite.filter((t) => !common.includes(t));
  const dataOnly = activeData.filter((t) => !common.includes(t));
  const bronzeMode = purpose === "bronze";
  const previewTraits = (bronzeMode ? currentTier.bronze : common.map(trait => trait.id))
    .flatMap(id => {
      const trait = traitMap.get(id);
      return trait ? [trait] : [];
    });
  const listedTraits = bronzeMode
    ? common.filter(trait => !previewTraits.some(preview => preview.id === trait.id))
    : common;
  const code = indices
    .map((id, i) => heroes[id].id + (mask & (1 << i) ? ":2" : ""))
    .join(".");
  return (
    <article className="combo-result">
      <header>
        <h2>
          {purpose === "jazz" ? <><strong>{jazzCount}</strong> 爵士乐 <small>{currentTier.activeCount} 羁绊</small></> :
            bronzeMode ? <><strong>{currentTier.bronze.length}</strong> 铜档</> :
              <><strong>{Math.min(site, data)}</strong> 羁绊</>}
        </h2>
        <div className="combo-result-actions">
          {hand.length > 0 && <strong className="combo-missing">{needed.length ? "缺 " + needed.length + " 张" : "手牌已齐"}</strong>}
          <span title="每名棋子按一张计价">{cost} 金</span>
          <a
            className="button combo-import"
            aria-label="带入编辑器"
            href={
              "/editor?combo=" +
              encodeURIComponent(code) +
              "&from=" +
              encodeURIComponent(from)
            }
          >
            <SquarePen size={15} aria-hidden /> 带入编辑器
          </a>
        </div>
      </header>
      <div className="combo-roster">
        {indices.map((id, i) => {
          const unit = unitMap.get(heroes[id].id)!;
          const label = unitLabel(unit);
          return (
            <div
              className={`combo-piece cost-${unit.cost}${hand.includes(id) ? " in-hand" : ""}`}
              key={unit.id}
              title={unit.name + " · " + unit.cost + "费"}
            >
              <div>
                <img
                  src={unit.image}
                  width={48}
                  height={48}
                  alt=""
                  loading="lazy"
                />
                {!!(mask & (1 << i)) && <b aria-label={pending & (1 << i) ? "需两星" : "已两星"}>★★</b>}
                {hand.includes(id) && <Check size={13} aria-label="手中已有" />}
              </div>
              <span>
                {label.base}
                {label.form && <small>{label.form}</small>}
              </span>
            </div>
          );
        })}
      </div>
      <div className="combo-requirements">
        {upgradesNeeded.length > 0 && <p>{upgradesNeeded.map(id => heroes[id].name).join("、")}需两星</p>}
        {locked.length > 0 && <p>需解锁{locked.map(unit => <a key={unit.id} href={"/heroes?unit=" + encodeURIComponent(unit.id)}>{unit.name}</a>)}</p>}
      </div>
      <footer>
        <details>
          <summary>
            <span>羁绊明细</span>
            {!!previewTraits.length && <span className="combo-trait-preview" aria-hidden="true">
              {previewTraits.map(trait => <span key={trait.id} title={trait.name}><TraitBadge trait={trait} size={19} tone="active" /></span>)}
            </span>}
          </summary>
          {bronzeMode && !!previewTraits.length && <p><b>铜档</b> {previewTraits.map(trait => trait.name).join("、")}</p>}
          {!!listedTraits.length && <p>{bronzeMode && <b>其他羁绊</b>} {listedTraits.map(trait => trait.siteName).join("、")}</p>}
          {(siteOnly.length > 0 || dataOnly.length > 0) && <p><b>口径差异</b> 本站 {site} · DataTFT {data}</p>}
          {!!siteOnly.length && (
            <p><b>仅本站</b> {siteOnly.map((t) => t.siteName).join("、")}</p>
          )}
          {!!dataOnly.length && (
            <p><b>仅 DataTFT</b> {dataOnly.map((t) => t.name).join("、")}</p>
          )}
          {common.some((t) => t.name !== t.siteName) && (
            <p>
              <b>名称对照</b>{" "}
              {common
                .filter((t) => t.name !== t.siteName)
                .map((t) => t.siteName + " / " + t.name)
                .join("、")}
            </p>
          )}
        </details>
      </footer>
    </article>
  );
}
export function ComboLibrary() {
  const params = useSearchParams();
  const [group, setGroup] = useState<Group>(
    params.get("group") === "high" ? "high" : "default",
  );
  const requestedPurpose = params.get("purpose");
  const [purpose, setPurpose] = useState<Purpose>(requestedPurpose === "bronze" || requestedPurpose === "jazz" ? requestedPurpose : "all");
  const [limit, setLimit] = useState(
    [9, 10].includes(Number(params.get("min"))) ? Number(params.get("min")) : 8,
  );
  const [minimumBronze, setMinimumBronze] = useState(() => {
    const value = Number(params.get("bronze"));
    return Number.isInteger(value) && value >= 0 && value <= 11 ? value : 0;
  });
  const [hand, setHand] = useState(() => {
    const held: Record<number, HeldUnit> = {};
    const optional = new Set((params.get("optional") ?? "").split("."));
    for (const token of (params.get("hand") ?? "").split(".").slice(0, 8)) {
      const [unit, stars] = token.split(":");
      const id = byId.get(unit);
      if (id !== undefined) held[id] = { stars: stars === "2" ? 2 : 1, required: !optional.has(unit) };
    }
    return held;
  });
  const [oneStarOnly, setAllOne] = useState(params.get("stars") === "1");
  const heldIds = useMemo(() => Object.keys(hand).map(Number), [hand]);
  const requiredIds = useMemo(() => heldIds.filter(id => hand[id].required), [heldIds, hand]);
  const heldAtTwo = useMemo(() => new Set(heldIds.filter(id => hand[id].stars === 2)), [heldIds, hand]);
  const allOne = oneStarOnly && !heldAtTwo.size;
  const [page, setPage] = useState(
    Math.min(
      10000,
      Math.max(1, Number.parseInt(params.get("p") ?? "", 10) || 1),
    ),
  );
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Partial<Record<Group, Row[]>>>({});
  const [failure, setFailure] = useState("");
  const [retry, setRetry] = useState(0);
  const rows = data[group];
  useEffect(() => {
    if (rows) return;
    const controller = new AbortController();
    setFailure("");
    fetch("/combos/s19-" + group + ".json", { signal: controller.signal })
      .then(async (reply) => {
        if (!reply.ok) throw new Error();
        const result = (await reply.json()) as Row[];
        if (!controller.signal.aborted)
          setData((old) => ({ ...old, [group]: result }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure("组合数据读取失败");
      });
    return () => controller.abort();
  }, [rows, group, retry]);
  const filtered = useMemo(() => {
    const candidates = (rows ?? []).filter(row =>
      (allOne ? Math.min(row[3], row[4]) : Math.min(row[1], row[2])) >= limit && requiredIds.every(id => row[0].includes(id)));
    if (purpose === "all" && !heldIds.length) return candidates;
    return candidates.flatMap(row => {
      const { mask, pending } = comboStarMask(row[0], allOne ? 0 : row[8], heldAtTwo, heroes);
      const upgrades = row[0].filter((_, i) => pending & (1 << i)).length;
      const held = heldIds.filter(id => row[0].includes(id)).length;
      if (purpose === "all") return [{ row, score: allOne ? Math.min(row[3], row[4]) : Math.min(row[1], row[2]), upgrades, held }];
      const current = comboTierCounts(row[0], mask, heroes, tiers.traits);
      const score = purpose === "jazz" ? current.activeCount : current.bronze.length;
      return (purpose === "jazz" ? current.jazz : score >= minimumBronze) ? [{ row, score, upgrades, held }] : [];
    }).sort((a, b) => b.held - a.held || (heldIds.length ? a.upgrades - b.upgrades : 0) || b.score - a.score || a.row[5] - b.row[5]).map(entry => entry.row);
  }, [rows, limit, requiredIds, heldIds, heldAtTwo, allOne, purpose, minimumBronze]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = rows ? Math.min(page, pages) : page;
  const url = new URLSearchParams();
  if (purpose !== "all") url.set("purpose", purpose);
  if (purpose === "bronze" && minimumBronze) url.set("bronze", String(minimumBronze));
  if (group === "high") url.set("group", group);
  if (limit > 8) url.set("min", String(limit));
  if (allOne) url.set("stars", "1");
  if (heldIds.length) url.set("hand", heldIds.map(id => heroes[id].id + (hand[id].stars === 2 ? ":2" : "")).join("."));
  const optionalIds = heldIds.filter(id => !hand[id].required);
  if (optionalIds.length) url.set("optional", optionalIds.map(id => heroes[id].id).join("."));
  if (current > 1) url.set("p", String(current));
  const from = "/combos" + (url.size ? "?" + url.toString() : "");
  useEffect(() => {
    window.history.replaceState(window.history.state, "", from);
  }, [from]);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? heroes
        .map((hero, i) => ({ hero, i }))
        .filter(({ hero, i }) => {
          const unit = unitMap.get(hero.id)!;
          return (
            !hand[i] &&
            unitSearchNames(unit).some(name => name.toLowerCase().includes(needle))
          );
        })
        .slice(0, 8)
    : [];
  function selectHero(id: number) {
    setHand(held => ({ ...held, [id]: { stars: 1, required: true } }));
    setPage(1);
    setQuery("");
    searchInput.current?.focus();
  }
  function clearHand() {
    setHand({});
    setQuery("");
    setPage(1);
  }
  function reset() {
    clearHand();
    setLimit(8);
    setMinimumBronze(0);
    setAllOne(false);
  }
  return (
    <div className="combo-library">
      <div className="page-heading combo-heading">
        <h1>八人口羁绊组合</h1>
        <div className="combo-purpose" role="group" aria-label="组合用途">
          {([["all","常规羁绊"],["jazz","爵士乐"],["bronze","终身黄铜"]] as const).map(([id, label]) =>
            <button type="button" key={id} aria-pressed={purpose === id} onClick={() => { setPurpose(id); setPage(1); }}>{label}</button>)}
        </div>
      </div>
      <section className="combo-controls" aria-label="组合筛选">
        <div className="combo-filterline">
          <div className="combo-picker">
            <label className="search-field">
              <Search size={15} aria-hidden />
              <input
                ref={searchInput}
                type="search"
                aria-label="添加手中已有英雄"
                placeholder="搜索棋子，加入手牌"
                value={query}
                disabled={heldIds.length >= 8}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches.length === 1)
                    selectHero(matches[0].i);
                  if (e.key === "Escape") setQuery("");
                }}
              />
            </label>
            {needle && (
              <div className="combo-options">
                {matches.length ? (
                  matches.map(({ hero, i }) => {
                    const unit = unitMap.get(hero.id)!;
                    return <button key={i} type="button" onClick={() => selectHero(i)} className={"cost-" + hero.cost}>
                      <img src={unit.image} alt="" width={28} height={28} />
                      <span>{hero.name}</span>
                      <small>{hero.cost}费</small>
                    </button>;
                  })
                ) : (
                  <p>没有匹配的英雄</p>
                )}
              </div>
            )}
          </div>
          <label className="combo-select">
            <select aria-label="费用范围" value={group} onChange={event => {
              setGroup(event.target.value as Group);
              setPage(1);
            }}>
              <option value="default">四费及以下（含解锁五费）</option>
              <option value="high">含常规五费或七费</option>
            </select>
          </label>
          <label className="combo-select">
            <select
              aria-label="最低羁绊数"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 个常规羁绊起
                </option>
              ))}
            </select>
          </label>
          {purpose === "bronze" && <label className="combo-select"><select aria-label="最低铜色羁绊数" value={minimumBronze} onChange={e => { setMinimumBronze(Number(e.target.value)); setPage(1); }}>
            <option value={0}>铜档不限</option>{[1,2,3,4,5,6,7,8,9,10,11].map(n => <option key={n} value={n}>{n} 个铜档起</option>)}
          </select></label>}
          <label className="check" title={heldAtTwo.size ? "手牌已有二星棋子" : undefined}>
            <input
              type="checkbox"
              checked={allOne}
              disabled={!!heldAtTwo.size}
              onChange={(e) => {
                setAllOne(e.target.checked);
                setPage(1);
              }}
            />
            全员一星
          </label>
          {purpose === "bronze" && <a className="text-link" href="/augments?q=终身黄铜">强化效果</a>}
        </div>
        {!!heldIds.length && <div className="combo-hand">
          <span className="combo-hand-label">手牌 <small>{heldIds.length}/8</small></span>
          {heldIds.map(id => <span className={"combo-held cost-" + heroes[id].cost} key={id}>
            <img src={unitMap.get(heroes[id].id)!.image} alt="" width={25} height={25} />
            {heroes[id].name}
            <select aria-label={heroes[id].name + "上阵要求"} value={hand[id].required ? "required" : "optional"} onChange={event => {
              const required = event.target.value === "required";
              setHand(held => ({ ...held, [id]: { ...held[id], required } }));
              setPage(1);
            }}><option value="required">必上</option><option value="optional">可用</option></select>
            <select aria-label={heroes[id].name + "星级"} value={hand[id].stars} onChange={event => {
              const stars = event.target.value === "2" ? 2 : 1;
              setHand(held => ({ ...held, [id]: { ...held[id], stars } }));
              if (stars === 2) setAllOne(false);
              setPage(1);
            }}><option value="1">1 星</option><option value="2">2 星</option></select>
            <button type="button" aria-label={"移除" + heroes[id].name} onClick={() => {
              setHand(held => {
                const next = { ...held };
                delete next[id];
                return next;
              });
              setPage(1);
            }}><X size={12} /></button>
          </span>)}
          <button type="button" className="text-link combo-clear-hand" onClick={clearHand}>清空</button>
        </div>}
      </section>
      <div className="combo-list-head">
        <strong aria-live="polite">
          {rows
            ? number(filtered.length) + " 套候选"
            : failure || "正在读取组合…"}
        </strong>
        <details className="combo-rules">
          <summary>计算规则</summary>
          <div className="combo-rule-content">
            <p>{purpose === "bronze" ? "铜档按棋盘星级计算，合奏与额外纹章另计。" : "专属和动态羁绊不计，K/DA 每人最多两星。"}</p>
            <p>费用按每人一张计。8–9 羁绊仅收录部分已验证组合。</p>
            <a href={tiers.localizedLookupUrl} target="_blank" rel="noreferrer" title={tiers.build}>档位来源</a>
          </div>
        </details>
      </div>
      {failure && !rows ? (
        <button className="button" onClick={() => setRetry(retry + 1)}>
          重新读取
        </button>
      ) : rows && !filtered.length ? (
        <section className="empty-state">
          <h2>暂无匹配组合</h2>
          <p>{requiredIds.length ? "可减少必上牌或降低羁绊数。" : "可降低羁绊数或放宽费用。"}</p>
          <button className="button" onClick={reset}>
            重置筛选
          </button>
        </section>
      ) : (
        <div className="combo-list">
          {filtered
            .slice((current - 1) * size, current * size)
            .map(row => (
              <ComboResult
                key={row[0].join(".")}
                row={row}
                purpose={purpose}
                hand={heldIds}
                heldAtTwo={heldAtTwo}
                from={from}
                allOne={allOne}
              />
            ))}
        </div>
      )}
      {!!filtered.length && (
        <nav className="combo-pages" aria-label="组合翻页">
          <button
            disabled={current === 1}
            onClick={() => {
              setPage(current - 1);
              document
                .querySelector(".combo-list-head")
                ?.scrollIntoView({ block: "start" });
            }}
          >
            <ChevronLeft size={15} />
            上一页
          </button>
          <span>
            {current} / {number(pages)}
          </span>
          <button
            disabled={current === pages}
            onClick={() => {
              setPage(current + 1);
              document
                .querySelector(".combo-list-head")
                ?.scrollIntoView({ block: "start" });
            }}
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
