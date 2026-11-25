import type { CSSProperties } from "react";
import { cardImage } from "@/data";
import { heroArtworkFocus } from "@/domain/hero-artwork";
import type { Unit } from "@/domain/types";
import "./hero-artwork.css";

export function HeroArtwork({ unit, className, eager = false, size = "card" }: {
  unit: Unit;
  className: string;
  eager?: boolean;
  size?: "card" | "splash";
}) {
  if (!unit.splashImage) return null;
  const src = size === "splash" ? unit.splashImage : cardImage(unit);
  const [width, height] = size === "splash" ? [720, 427] : [256, 152];
  const focus = heroArtworkFocus(unit);
  const style = focus ? { "--art-x": focus.x, "--art-y": focus.y } as CSSProperties : undefined;
  return <span className={className + " hero-artwork"} data-unit={unit.id} data-focused={focus ? "" : undefined}
    style={style} aria-hidden="true">
    <img src={src} alt="" width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" />
  </span>;
}
