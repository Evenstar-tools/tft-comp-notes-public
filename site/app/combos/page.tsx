import { Suspense } from "react";
import { ComboLibrary } from "@/components/ComboLibrary";
import "./combos.css";

export const metadata = { title: "凑羁绊工作台" };
export default function CombosPage() {
  return (
    <div className="combos-page">
      <Suspense fallback={<p role="status">正在读取八人口组合…</p>}>
        <ComboLibrary />
      </Suspense>
    </div>
  );
}
