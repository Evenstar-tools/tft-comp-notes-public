import type { Metadata } from "next";
import { MedleyLibrary } from "./MedleyLibrary";
import "./medley.css";

export const metadata: Metadata = {
  title: "合奏组合",
  description: "S19 PBE 的 40 组预设合奏搭档，支持按弈子或组号速查。",
};

export default function MedleyPage() {
  return <MedleyLibrary />;
}
