import type { CSSProperties } from "react";
import { heroArtworkFocus } from "@/domain/hero-artwork";
import type { Unit } from "@/domain/types";
import "./hero-artwork.css";

export function HeroArtwork({ unit, className, eager = false }: {
  unit: Unit;
  className: string;
  eager?: boolean;
}) {
  if (!unit.splashImage) return null;
  const focus = heroArtworkFocus(unit);
  const style = focus ? { "--art-x": focus.x, "--art-y": focus.y } as CSSProperties : undefined;
  return <span className={className + " hero-artwork"} data-unit={unit.id} data-focused={focus ? "" : undefined}
    style={style} aria-hidden="true">
    <img src={unit.splashImage} alt="" width={720} height={427} loading={eager ? "eager" : "lazy"} decoding="async" />
  </span>;
}
