"use client";
import { useState } from "react";
import type { Item } from "@/domain/types";
import bundledIds from "@/data/item-art.json";
const bundled = new Set(bundledIds);

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
  const local = item && bundled.has(item.id) ? "/assets/items/" + item.id + ".webp" : undefined;
  const source = local && (!failedSource || (failedSource !== local && failedSource !== item?.image)) ? local : item?.image;
  if (!source || failedSource === source)
    return (
      <span
        className={`item-icon is-fallback ${className}`}
        style={{ ...style, fontSize: Math.max(12, Math.round(size * 0.46)) }}
        aria-hidden
      >
        {(item?.name ?? "?").slice(0, 1)}
      </span>
    );
  return (
    <img
      className={`item-icon ${className}`}
      src={source}
      alt=""
      width={size}
      height={size}
      style={style}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailedSource(source)}
    />
  );
}
