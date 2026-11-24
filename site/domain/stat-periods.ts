import history from "../data/stats-history.json";

export type StatPeriod = {
  id: string;
  label: string;
  description: string;
  channel: "pbe" | "ranked";
  season: string;
  date: string;
  metaTft?: { patch: string; bPatch: string };
};

export const statPeriods = history as StatPeriod[];

export function getStatPeriod(id: string | null | undefined) {
  return statPeriods.find(period => period.id === id);
}

export function withStatPeriod(href: string, id: string | undefined) {
  if (!id) return href;
  const [path, fragment] = href.split("#", 2);
  const [pathname, query] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("stats", id);
  return pathname + "?" + params + (fragment ? "#" + fragment : "");
}
