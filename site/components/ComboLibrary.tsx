"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { traitMap, unitLabel, unitMap } from "@/data";
import meta from "@/data/combos-s19-meta.json";
import tiers from "@/data/combo-tiers-s19.json";
import { comboStarMask, comboTierCounts } from "@/domain/combo-tiers";
import { unlockText } from "@/domain/unlocks";
import { unitSearchNames } from "@/domain/unit-search.mjs";
import { trackToolAction } from "@/lib/analytics";
type Purpose = "all" | "jazz" | "bronze";

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
const smeechMinimum = 9;
const modes = [
  { purpose: "all", minimum: smeechMinimum, label: "解锁史密奇 (≥9 羁绊)" },
  { purpose: "all", minimum: 8, label: "常规 8+ 羁绊" },
  { purpose: "jazz", minimum: null, label: "爵士乐" },
  { purpose: "bronze", minimum: null, label: "终身黄铜" },
] as const;
const heroes = meta.units;
// The combo archive only includes countable, non-unique traits.
const traits = meta.traits.map(trait => ({ ...trait, siteName: traitMap.get(trait.id)?.name ?? trait.siteName }));
const byId = new Map(heroes.map((u, index) => [u.id, index]));
const unlockConditions = heroes.map(({ id }) => {
  const unit = unitMap.get(id);
  return unit ? unlockText(unit) : "";
});
const quickUnits = ["ziggs", "neeko", "lucian", "tristana", "jax", "alune", "mel", "leona", "zoe", "kobuko"]
  .flatMap(id => {
    const index = byId.get(id);
    const unit = unitMap.get(id);
    return index !== undefined && unit ? [{ index, unit }] : [];
  });
const number = (value: number) => value.toLocaleString("zh-CN");
function activeTraits(
  indices: number[],
  mask: number,
  source: "siteTraits" | "dataTraits",
) {
  const counts = new Map<string, number>();
  indices.forEach((id, position) =>
    heroes[id][source].forEach(trait =>
      counts.set(
        trait,
        (counts.get(trait) ?? 0) +
          (trait === "k-da" && mask & (1 << position) ? 2 : 1),
      ),
    ),
  );
  return traits.flatMap(trait => {
    const count = counts.get(trait.id) ?? 0;
    return count >= trait.threshold ? [{ ...trait, count }] : [];
  });
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
  const site = activeSite.length;
  const data = activeData.length;
  const nonUniqueCount = Math.min(site, data);
  const siteIds = new Set(activeSite.map(trait => trait.id));
  const dataIds = new Set(activeData.map(trait => trait.id));
  const common = activeSite.filter(trait => dataIds.has(trait.id));
  const siteOnly = activeSite.filter(trait => !dataIds.has(trait.id));
  const dataOnly = activeData.filter(trait => !siteIds.has(trait.id));
  const names = common.filter(trait => trait.name !== trait.siteName);
  const bronzeMode = purpose === "bronze";
  const bronzeIds = new Set(bronzeMode ? currentTier.bronze : []);
  const listedTraits = [
    ...activeSite.filter(trait => bronzeIds.has(trait.id)),
    ...activeSite.filter(trait => !bronzeIds.has(trait.id)),
  ];
  const code = indices
    .map((id, i) => heroes[id].id + (mask & (1 << i) ? ":2" : ""))
    .join(".");
  return (
    <article className="combos-result">
      <header className="combos-result-head">
        <div className="combos-result-meta">
          <h2 className="combos-count">
            {purpose === "jazz" ? <><strong>{jazzCount}</strong> 爵士乐</> :
              bronzeMode ? <><strong>{currentTier.bronze.length}</strong> 铜档</> :
                <><strong>{nonUniqueCount}</strong> 羁绊</>}
          </h2>
          {purpose === "jazz" && <span>{currentTier.activeCount} 羁绊</span>}
          {nonUniqueCount >= smeechMinimum && <span className="combos-smeech" title="升到 9 级后触发解锁">✓ 解锁史密奇</span>}
          <span>{needed.length ? <>需补 <b>{needed.length}</b> 张</> : <b>手牌已齐</b>}{" · "}<span title="每名棋子按一张计价">共 <b>{cost} 金</b></span></span>
        </div>
        <a
          className="combos-import"
          onClick={() => trackToolAction({ action: "editor_import_combo", surface: "combos" })}
          href={"/editor?combo=" + encodeURIComponent(code) + "&from=" + encodeURIComponent(from)}
        >
          带入编辑器 <ArrowUpRight size={14} aria-hidden />
        </a>
      </header>
      <div className="combos-roster">
        {indices.map((id, i) => {
          const unit = unitMap.get(heroes[id].id)!;
          const label = unitLabel(unit);
          const inHand = hand.includes(id);
          const unlock = unlockConditions[id];
          return (
            <div
              className={`combos-piece cost-${unit.cost}${inHand ? " in-hand" : ""}`}
              key={unit.id}
              title={`${unit.name} · ${unit.cost}费`}
            >
              <div className="combos-piece-tags">
                {inHand && <span className="combos-hand-tag">手牌</span>}
                {unlock && <a className="combos-unlock-tag" href={"/heroes?unit=" + encodeURIComponent(unit.id)} title={unlock} aria-label={`${unit.name}解锁条件`}>解锁</a>}
              </div>
              <div className="combos-portrait">
                <Image
                  src={unit.image}
                  width={48}
                  height={48}
                  alt=""
                  unoptimized
                />
                {!!(mask & (1 << i)) && (
                  <b className="combos-stars" role="img" aria-label={pending & (1 << i) ? "需两星" : "已两星"}>★★</b>
                )}
              </div>
              <span className="combos-piece-name">
                {label.base}
                {label.form && <small>{label.form}</small>}
              </span>
            </div>
          );
        })}
      </div>
      {upgradesNeeded.length > 0 && <p className="combos-upgrades">{upgradesNeeded.map(id => heroes[id].name).join("、")}需两星</p>}
      <footer className="combos-result-foot">
        <ul className="combos-traits" aria-label="激活羁绊">
          {listedTraits.map(trait => {
            const isBronze = bronzeIds.has(trait.id);
            const notes = [isBronze && "铜档", !dataIds.has(trait.id) && "仅本站口径激活"];
            return (
              <li key={trait.id} className={isBronze ? "is-bronze" : undefined} title={notes.filter(Boolean).join(" · ") || undefined}>
                <b>{trait.count}</b> {trait.siteName}
              </li>
            );
          })}
        </ul>
        {(siteOnly.length > 0 || dataOnly.length > 0 || names.length > 0) && (
          <details className="combos-comparison">
            <summary>口径与名称对照</summary>
            {(siteOnly.length > 0 || dataOnly.length > 0) && <p><b>口径差异</b> 本站 {site} · DataTFT {data}</p>}
            {!!siteOnly.length && <p><b>仅本站</b> {siteOnly.map(trait => trait.siteName).join("、")}</p>}
            {!!dataOnly.length && <p><b>仅 DataTFT</b> {dataOnly.map(trait => trait.name).join("、")}</p>}
            {!!names.length && <p><b>名称对照</b> {names.map(trait => `${trait.siteName} / ${trait.name}`).join("、")}</p>}
          </details>
        )}
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
  const [excludeUnlocks, setExcludeUnlocks] = useState(params.get("noUnlock") === "1");
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
  const [userActionCount, setUserActionCount] = useState(0);
  const reportedFirstResult = useRef(false);
  const markUserAction = () => setUserActionCount(count => count + 1);
  const rows = data[group];
  useEffect(() => {
    if (rows) return;
    const controller = new AbortController();
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
      (allOne ? Math.min(row[3], row[4]) : Math.min(row[1], row[2])) >= limit &&
      requiredIds.every(id => row[0].includes(id)) &&
      (!excludeUnlocks || !row[0].some(id => unlockConditions[id])));
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
  }, [rows, limit, requiredIds, heldIds, heldAtTwo, allOne, purpose, minimumBronze, excludeUnlocks]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = rows ? Math.min(page, pages) : page;
  const url = new URLSearchParams();
  if (purpose !== "all") url.set("purpose", purpose);
  if (purpose === "bronze" && minimumBronze) url.set("bronze", String(minimumBronze));
  if (group === "high") url.set("group", group);
  if (limit > 8) url.set("min", String(limit));
  if (allOne) url.set("stars", "1");
  if (excludeUnlocks) url.set("noUnlock", "1");
  if (heldIds.length) url.set("hand", heldIds.map(id => heroes[id].id + (hand[id].stars === 2 ? ":2" : "")).join("."));
  const optionalIds = heldIds.filter(id => !hand[id].required);
  if (optionalIds.length) url.set("optional", optionalIds.map(id => heroes[id].id).join("."));
  if (current > 1) url.set("p", String(current));
  const from = "/combos" + (url.size ? "?" + url.toString() : "");
  useEffect(() => {
    window.history.replaceState(window.history.state, "", from);
  }, [from]);
  useEffect(() => {
    if (userActionCount <= 0 || reportedFirstResult.current) return;
    if (!rows || !filtered.length) return;
    reportedFirstResult.current = true;
    trackToolAction({ action: "combo_first_result", surface: "combos" });
  }, [userActionCount, rows, filtered.length]);
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
  function selectHero(id: number, keepSearching = true) {
    markUserAction();
    setHand(held => ({ ...held, [id]: { stars: 1, required: true } }));
    setPage(1);
    setQuery("");
    if (keepSearching) searchInput.current?.focus();
  }
  function removeHero(id: number) {
    markUserAction();
    setHand(held => {
      const next = { ...held };
      delete next[id];
      return next;
    });
    setPage(1);
  }
  function clearHand() {
    markUserAction();
    setHand({});
    setQuery("");
    setPage(1);
  }
  function reset() {
    clearHand();
    setLimit(8);
    setMinimumBronze(0);
    setAllOne(false);
    setExcludeUnlocks(false);
  }
  return (
    <>
      <header className="combos-heading">
        <div>
          <h1>凑羁绊工作台</h1>
          <p>
            <span>8 人口极速算高羁绊组合</span>
            <span className="combos-goal">热补 6035832 · 9 个非唯一羁绊解锁史密奇</span>
          </p>
        </div>
        <div className="combos-modes" role="group" aria-label="组合用途">
          {modes.map(mode => (
            <button
              type="button"
              key={mode.label}
              aria-pressed={purpose === mode.purpose && (mode.minimum === null || (limit >= smeechMinimum ? smeechMinimum : 8) === mode.minimum)}
              onClick={() => {
                markUserAction();
                setPurpose(mode.purpose);
                if (mode.minimum !== null) setLimit(mode.minimum);
                setPage(1);
              }}
            >{mode.label}</button>
          ))}
        </div>
      </header>
      <section className="combos-workbench" aria-label="手牌与组合筛选">
        <div className="combos-workbench-top">
          <div className="combos-hand">
            <strong>本局手牌 <span>{heldIds.length}/{size}</span></strong>
            {!heldIds.length && <span className="combos-hand-empty">搜索棋子或从下方加入</span>}
            {heldIds.map(id => {
              const { name, cost } = heroes[id];
              const { required, stars } = hand[id];
              return (
                <div className={`combos-held cost-${cost}`} key={id}>
                  <Image src={unitMap.get(heroes[id].id)!.image} alt="" width={24} height={24} unoptimized />
                  <span>{name}</span>
                  <button type="button" aria-label={`${name}必上`} aria-pressed={required} onClick={() => {
                    markUserAction();
                    setHand(held => ({ ...held, [id]: { ...held[id], required: !held[id].required } }));
                    setPage(1);
                  }}>{required ? "必上" : "可用"}</button>
                  <button type="button" aria-label={`${name}二星`} aria-pressed={stars === 2} onClick={() => {
                    markUserAction();
                    setHand(held => ({ ...held, [id]: { ...held[id], stars: stars === 2 ? 1 : 2 } }));
                    if (stars === 1) setAllOne(false);
                    setPage(1);
                  }}>{stars}★</button>
                  <button type="button" aria-label={`移除${name}`} onClick={() => removeHero(id)}><X size={13} aria-hidden /></button>
                </div>
              );
            })}
            {!!heldIds.length && <button type="button" className="combos-clear" onClick={clearHand}>清空</button>}
          </div>
          <div className="combos-filters">
            <div className="combos-picker">
              <label className="combos-search">
                <Search size={15} aria-hidden />
                <input
                  ref={searchInput}
                  type="search"
                  aria-label="添加手中已有英雄"
                  placeholder="搜索棋子，加入手牌"
                  value={query}
                  disabled={heldIds.length >= size}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches.length === 1)
                      selectHero(matches[0].i);
                    if (e.key === "Escape") setQuery("");
                  }}
                />
              </label>
              {needle && (
                <div className="combos-options">
                  {matches.length ? (
                    matches.map(({ hero, i }) => {
                      const unit = unitMap.get(hero.id)!;
                      return <button key={i} type="button" onClick={() => selectHero(i)} className={"cost-" + hero.cost}>
                      <Image src={unit.image} alt="" width={28} height={28} unoptimized />
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
            <label className="combos-select">
              <select aria-label="费用范围" value={group} onChange={event => {
                markUserAction();
                setFailure("");
                setGroup(event.target.value as Group);
                setPage(1);
              }}>
                <option value="default">四费及以下（含解锁五费）</option>
                <option value="high">含常规五费或七费</option>
              </select>
            </label>
            <label className="combos-select">
              <select
                aria-label="最低羁绊数"
                value={limit}
                onChange={(e) => {
                  markUserAction();
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
            {purpose === "bronze" && <label className="combos-select"><select aria-label="最低铜色羁绊数" value={minimumBronze} onChange={e => { markUserAction(); setMinimumBronze(Number(e.target.value)); setPage(1); }}>
              <option value={0}>铜档不限</option>{[1,2,3,4,5,6,7,8,9,10,11].map(n => <option key={n} value={n}>{n} 个铜档起</option>)}
            </select></label>}
            <label className="combos-check" title={heldAtTwo.size ? "手牌已有二星棋子" : undefined}>
              <input
                type="checkbox"
                checked={allOne}
                disabled={!!heldAtTwo.size}
                onChange={(e) => {
                  markUserAction();
                  setAllOne(e.target.checked);
                  setPage(1);
                }}
              />
              全员一星
            </label>
            <label className="combos-check">
              <input type="checkbox" checked={excludeUnlocks} onChange={event => {
                markUserAction();
                setExcludeUnlocks(event.target.checked);
                setPage(1);
              }} />
              排除需解锁弈子
            </label>
            {purpose === "bronze" && <a className="combos-text-link" href="/augments?q=终身黄铜">强化效果</a>}
          </div>
        </div>
        {!!quickUnits.length && (
          <div className="combos-quick" role="group" aria-label="高频多羁绊拼图">
            <span>高频多羁绊拼图（一键加手牌）</span>
            {quickUnits.map(({ index, unit }) => (
              <button
                key={unit.id}
                className={`cost-${unit.cost}`}
                type="button"
                aria-pressed={!!hand[index]}
                disabled={!hand[index] && heldIds.length >= size}
                onClick={() => hand[index] ? removeHero(index) : selectHero(index, false)}
              >
                <Image src={unit.image} width={20} height={20} alt="" unoptimized />
                {unit.name}
              </button>
            ))}
          </div>
        )}
      </section>
      <div className="combos-list-head">
        <strong aria-live="polite">
          {rows
            ? number(filtered.length) + " 套候选"
            : failure || "正在读取组合…"}
        </strong>
        <details className="combos-rules">
          <summary>计算规则</summary>
          <div className="combos-rule-content">
            <p>{purpose === "bronze" ? "铜档按棋盘星级计算，合奏与额外纹章另计。" : "专属和动态羁绊不计，K/DA 每人最多两星。"}</p>
            <p>费用按每人一张计。8–9 羁绊仅收录部分已验证组合。</p>
            <p>升到 9 级并激活至少 9 个非唯一羁绊可解锁史密奇。</p>
            <a href={tiers.localizedLookupUrl} target="_blank" rel="noreferrer" title={tiers.build}>档位来源</a>
          </div>
        </details>
      </div>
      {failure && !rows ? (
        <button type="button" onClick={() => { setFailure(""); setRetry(count => count + 1); }}>
          重新读取
        </button>
      ) : rows && !filtered.length ? (
        <section className="combos-empty">
          <h2>暂无匹配组合</h2>
          <p>{excludeUnlocks ? "可取消排除需解锁弈子。" : requiredIds.length ? "可减少必上牌或降低羁绊数。" : "可降低羁绊数或放宽费用。"}</p>
          <button type="button" onClick={reset}>
            重置筛选
          </button>
        </section>
      ) : (
        <div className="combos-list">
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
        <nav className="combos-pages" aria-label="组合翻页">
          <button
            disabled={current === 1}
            onClick={() => {
              setPage(current - 1);
              document
                .querySelector(".combos-list-head")
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
                .querySelector(".combos-list-head")
                ?.scrollIntoView({ block: "start" });
            }}
          >
            下一页
            <ChevronRight size={15} />
          </button>
        </nav>
      )}
    </>
  );
}
