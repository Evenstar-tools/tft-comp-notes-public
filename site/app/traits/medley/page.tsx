import type { Metadata } from "next";
import { getMedleyFitsForCurrentPublication } from "@/server/medley-fits";
import { MedleyLibrary } from "./MedleyLibrary";
import "./medley.css";

export const metadata: Metadata = {
  title: "合奏组合",
  description: "S19 PBE 合奏搭档速查，随公开攻略库自动计算适配阵容、完整终盘头像、过渡留牌与主 C 接装。",
};

export const dynamic = "force-dynamic";

export default async function MedleyPage() {
  const { fitsByGroup, syncMeta } = await getMedleyFitsForCurrentPublication();
  return <MedleyLibrary fitsByGroup={fitsByGroup} syncMeta={syncMeta} />;
}
