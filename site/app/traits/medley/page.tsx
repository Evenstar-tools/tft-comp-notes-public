import type { Metadata } from "next";
import { season } from "@/data";
import catalog from "@/data/medley-groups.json";
import { buildMedleyFits } from "@/domain/medley-fit";
import { medleyGuideRoutes } from "@/domain/medley-guide-routes";
import { publicGuidePublication } from "@/server/publication";
import { MedleyLibrary } from "./MedleyLibrary";
import "./medley.css";

export const metadata: Metadata = {
  title: "合奏组合",
  description: "S19 PBE 合奏搭档速查，查看适配攻略、过渡留牌和主 C 装备交接。",
};

export const dynamic = "force-dynamic";

export default async function MedleyPage() {
  const publication = await publicGuidePublication();
  const routes = publication ? medleyGuideRoutes(publication.sections, publication.season, season) : [];
  const fitsByGroup = buildMedleyFits(catalog.groups, routes, season.units, season.items, catalog.fixedUnit);
  return <MedleyLibrary fitsByGroup={fitsByGroup} />;
}
