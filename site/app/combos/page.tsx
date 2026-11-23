import { Suspense } from "react";
import { ComboLibrary } from "@/components/ComboLibrary";
export const metadata = { title: "八人口羁绊组合" };
export default function CombosPage() {
  return (
    <Suspense fallback={<p>正在读取八人口组合…</p>}>
      <ComboLibrary />
    </Suspense>
  );
}
