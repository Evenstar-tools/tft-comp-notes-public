"use client";

import { createContext, useContext, useEffect, useState, type ComponentPropsWithoutRef, type CSSProperties } from "react";

type Tile = { image: string; x: number; y: number; columns: number; rows: number };
export const EditorArtContext = createContext<ReadonlyMap<string, Tile> | null>(null);

const sheetStatus = new Map<string, Promise<boolean>>();

function loadSheet(source: string) {
  let result = sheetStatus.get(source);
  if (!result) {
    result = new Promise<boolean>(resolve => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = source;
    });
    sheetStatus.set(source, result);
  }
  return result;
}

function imageLength(size: string | number | undefined) {
  return typeof size === "number" ? size + "px" : size;
}

export function GameIconImage(props: ComponentPropsWithoutRef<"img">) {
  const tiles = useContext(EditorArtContext);
  const tile = typeof props.src === "string" ? tiles?.get(props.src) : undefined;
  const source = tile?.image;
  const [failedSheet, setFailedSheet] = useState<string>();

  useEffect(() => {
    if (!source) return;
    let current = true;
    loadSheet(source).then(loaded => {
      if (!loaded && current) setFailedSheet(source);
    });
    return () => { current = false; };
  }, [source]);

  if (!tile || failedSheet === source) return <img {...props} />;

  const style = {
    "--editor-icon-width": imageLength(props.width),
    "--editor-icon-height": imageLength(props.height),
    backgroundImage: "url(" + tile.image + ")",
    backgroundSize: tile.columns * 100 + "% " + tile.rows * 100 + "%",
    backgroundPosition: (tile.columns > 1 ? 100 * tile.x / (tile.columns - 1) : 0) + "% " +
      (tile.rows > 1 ? 100 * tile.y / (tile.rows - 1) : 0) + "%",
    ...props.style,
  } as CSSProperties;
  return <span aria-hidden="true" className={"editor-icon-art " + (props.className ?? "")} style={style} />;
}
