"use client";

import { createContext, useContext, useState, type ComponentPropsWithoutRef } from "react";

type Tile = { image: string; x: number; y: number; columns: number; rows: number };
export const EditorArtContext = createContext<ReadonlyMap<string, Tile> | null>(null);

export function GameIconImage(props: ComponentPropsWithoutRef<"img">) {
  const tiles = useContext(EditorArtContext);
  const tile = typeof props.src === "string" && tiles?.get(props.src);
  const [failedSheet, setFailedSheet] = useState<string>();
  if (!tile || failedSheet === tile.image) return <img {...props} />;

  return <svg aria-hidden="true" focusable="false" className={`editor-icon-art ${props.className ?? ""}`}
    width={props.width} height={props.height} style={props.style}
    viewBox={`${tile.x} ${tile.y} 1 1`} preserveAspectRatio="xMidYMid slice" overflow="hidden">
    <image href={tile.image} width={tile.columns} height={tile.rows}
      preserveAspectRatio="none" onError={() => setFailedSheet(tile.image)} />
  </svg>;
}
