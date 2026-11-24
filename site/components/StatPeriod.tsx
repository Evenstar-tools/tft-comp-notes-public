"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import current from "@/data/current-patch.json";
import { getStatPeriod, statPeriods, type StatPeriod } from "@/domain/stat-periods";
import "./stat-period.css";

export function useStatPeriod() {
  const period = getStatPeriod(useSearchParams().get("stats"));
  function selectPeriod(id: string) {
    const url = new URL(window.location.href);
    if (getStatPeriod(id)) url.searchParams.set("stats", id);
    else url.searchParams.delete("stats");
    const state = { ...window.history.state };
    delete state.__NA;
    delete state._N;
    window.history.replaceState(state, "", url);
  }
  return { period, selectPeriod };
}

export function useStatArchive<T>(period: StatPeriod | undefined, dataset: "heroes" | "equipment") {
  const url = period && `/stats-history/${period.id}/${dataset}.json`;
  const [result, setResult] = useState<{ url: string; data?: T }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Archived stats unavailable");
      const data: T = await response.json();
      if (!controller.signal.aborted) setResult({ url, data });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ url });
    });
    return () => controller.abort();
  }, [url]);
  if (!url) return { status: "current" } as const;
  if (result?.url !== url) return { status: "loading" } as const;
  return result.data === undefined ? { status: "error" } as const : { status: "ready", data: result.data } as const;
}

export function StatPeriodSelect({ period, onChange }: {
  period: StatPeriod | undefined;
  onChange: (id: string) => void;
}) {
  return <label className="stat-period">
    <span>数据批次</span>
    <select aria-label="数据批次" value={period?.id ?? ""} onChange={event => onChange(event.target.value)}>
      <option value="">当前 · {current.label.split(" · ")[0]}</option>
      {statPeriods.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
    </select>
  </label>;
}
