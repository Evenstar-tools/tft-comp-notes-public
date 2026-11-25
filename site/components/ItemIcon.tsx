"use client";
import { useState } from "react";
import type { Item } from "@/domain/types";
import { bundledItemImage } from "@/domain/item-art";

/** The bundled, verified art also covers equipment in earlier published snapshots. */
export function ItemIcon({
  item,
  size = 24,
  className = "",
}: {
  item?: Item;
  size?: number;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const style = { width: size, height: size };
  const local = bundledItemImage(item);
  const source = local && (!failedSource || (failedSource !== local && failedSource !== item?.image)) ? local : item?.image;
  const radiant = item?.category === "radiant";
  const iconClassName = radiant ? "item-icon" : `item-icon ${className}`;
  const iconSize = radiant ? undefined : style;
  const icon = !source || failedSource === source ? (
    <span
      className={`${iconClassName} is-fallback`}
      style={{ ...iconSize, fontSize: Math.max(12, Math.round(size * 0.46)) }}
      aria-hidden
    >
      {(item?.name ?? "?").slice(0, 1)}
    </span>
  ) : (
    <img
      className={iconClassName}
      src={source}
      alt=""
      width={size}
      height={size}
      style={iconSize}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailedSource(source)}
    />
  );
  return radiant ? <span className={`item-icon item-icon-radiant ${className}`} style={style}>{icon}</span> : icon;
}
