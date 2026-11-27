import { season, unitMap } from "@/data";
import { traitCounts, traitLines, usedPopulation } from "@/domain/team";
import type { Team } from "@/domain/types";
import { boardInstruments, boardMarkerNote, type BoardInstrument } from "@/domain/board-instruments";
import { BOARD_WIDTH, HEX_WIDTH, HEX_HEIGHT, HEX_POINTS, STAR_PATH, hexPosition } from "@/domain/board-layout";
import { preferredItemImage } from "@/domain/item-art";
const colors: Record<number, string> = {
  1: "#9ba4b7",
  2: "#52b987",
  3: "#55aaff",
  4: "#bf89f2",
  5: "#ecc263",
  7: "#ee8a67",
};
export async function loadImage(url: string, timeoutMs?: number) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    if (new URL(url, document.baseURI).origin !== window.location.origin) image.crossOrigin = "anonymous";
    const timer = timeoutMs && setTimeout(() => resolve(null), timeoutMs);
    const finish = (value: HTMLImageElement | null) => {
      if (timer) clearTimeout(timer);
      resolve(value);
    };
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = url;
  });
}
export function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  HEX_POINTS.forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(x + px * w, y + py * h);
    else ctx.lineTo(x + px * w, y + py * h);
  });
  ctx.closePath();
}

export function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number,
  focus?: { x: number; y: number }) {
  const { naturalWidth: iw, naturalHeight: ih } = image;
  const scale = Math.max(width / iw, height / ih);
  const sw = width / scale, sh = height / scale;
  const sx = Math.max(0, Math.min(iw - sw, iw * (focus?.x ?? .5) - sw * (focus ? .65 : .5)));
  const sy = Math.max(0, Math.min(ih - sh, ih * (focus?.y ?? .5) - sh * (focus ? .45 : .5)));
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}
export function drawBoardStars(ctx: CanvasRenderingContext2D, count: number, x: number, y: number, width: number, height: number) {
  const size = width * .22;
  const path = new Path2D(STAR_PATH);
  ctx.save();
  ctx.translate(x + (width - count * size) / 2, y + height * .03);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = "#272026";
  ctx.fillStyle = "#ffdf73";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  for (let index = 0; index < count; index++) {
    ctx.stroke(path);
    ctx.fill(path);
    ctx.translate(24, 0);
  }
  ctx.restore();
}
function drawBoardAlternate(ctx: CanvasRenderingContext2D, image: HTMLImageElement | null | undefined,
  x: number, y: number, width: number, height: number, border: string) {
  if (!image) return;
  const radius = width * .21;
  const cx = x + radius + width * .06, cy = y + radius + height * .04;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, image, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = border;
  ctx.lineWidth = Math.max(1.5, width * .04);
  ctx.stroke();
  ctx.restore();
}

export function drawBoardInstrument(ctx: CanvasRenderingContext2D, instrument: BoardInstrument, image: HTMLImageElement | null | undefined, x: number, y: number, width: number, height: number) {
  const summon = instrument.id === "infernalIdol";
  ctx.save();
  hexPath(ctx, x, y, width, height);
  ctx.fillStyle = "#243942";
  ctx.fill();
  const center = x + width / 2;
  if (image && summon) {
    ctx.save();
    ctx.clip();
    drawCover(ctx, image, x - width * .24, y - height * .08, width * 1.32, height * 1.32);
    ctx.restore();
  } else if (image) {
    const scale = Math.min(width * .68 / image.naturalWidth, height * .48 / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, center - w / 2, y + height * .43 - h / 2, w, h);
  }
  ctx.lineWidth = Math.max(1, width * (summon ? .034 : .019));
  ctx.strokeStyle = "#78b8b3";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(10, width * .175)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.fillStyle = "#effaf7";
  const nameY = y + height * (image ? .73 : .5);
  if (summon) {
    ctx.strokeStyle = "rgba(10, 13, 20, .92)";
    ctx.lineWidth = Math.max(2, width * .032);
    ctx.lineJoin = "round";
    ctx.strokeText(instrument.name, center, nameY, width * .9);
  }
  ctx.fillText(instrument.name, center, nameY, width * .9);
  ctx.restore();
}

export async function exportTeamImage(team: Team): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  const groups = traitLines(traitCounts(team.pieces, season.units, season.traits, season.items));
  canvas.height = Math.max(1010, 870 + groups.reduce((n, row) => n + Math.ceil(row.length / 7), 0) * 40);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#11151c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f0f1f4";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(team.name.slice(0, 35), 48, 65);
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#9faaba";
  ctx.fillText(
    `S19 · ${usedPopulation(team.pieces)} 人口 / ${team.pieces.length} 枚 · 解锁资料 PBE ${season.unlockRelease?.date ?? season.sourceDate}`,
    48,
    103,
  );
  const scale = 1250 / BOARD_WIDTH;
  const width = HEX_WIDTH * scale, height = HEX_HEIGHT * scale;
  const instruments = boardInstruments(team.pieces, season, team.instrumentPositions);
  if (instruments.size) ctx.fillText(boardMarkerNote(instruments), 48, 128);
  const urls = team.pieces.flatMap((piece) => [
    unitMap.get(piece.unitId)?.image,
    piece.alternate && unitMap.get(piece.alternate.unitId)?.image,
    ...piece.items.map((id) => preferredItemImage(season.items.find((item) => item.id === id))),
  ]);
  urls.push(...[...instruments.values()].map(entry => entry.image));
  const imageUrls = [...new Set(urls.filter((url): url is string => !!url))];
  const images = new Map(await Promise.all(imageUrls.map(async (url) => [url, await loadImage(url)] as const)));
  for (let position = 0; position < 28; position++) {
    const point = hexPosition(position);
    const x = 75 + point.x * scale, y = 140 + point.y * scale;
    const instrument = instruments.get(position);
    if (instrument) {
      drawBoardInstrument(ctx, instrument, images.get(instrument.image), x, y, width, height);
      continue;
    }
    hexPath(ctx, x, y, width, height);
    ctx.fillStyle = "#202936";
    ctx.fill();
    ctx.strokeStyle = "#455267";
    ctx.lineWidth = 2;
    ctx.stroke();
    const piece = team.pieces.find((p) => p.position === position);
    if (!piece) continue;
    const unit = unitMap.get(piece.unitId)!;
    const image = images.get(unit.image);
    ctx.save();
    ctx.clip();
    if (image) drawCover(ctx, image, x, y, width, height);
    ctx.restore();
    ctx.save();
    const center = x + width / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(10, 13, 20, .82)";
    ctx.font = "bold 22px sans-serif";
    ctx.lineWidth = 4;
    const nameY = y + height * (piece.items.length ? .63 : .70);
    ctx.strokeText(unit.name, center, nameY, width * .86);
    ctx.fillStyle = "#fff";
    ctx.fillText(unit.name, center, nameY, width * .86);
    piece.items.forEach((id, index) => {
      const item = season.items.find((entry) => entry.id === id);
      const itemUrl = preferredItemImage(item);
      const itemImage = itemUrl && images.get(itemUrl);
      const itemX = x + width / 2 - (piece.items.length * 30 - 2) / 2 + index * 30;
      const itemY = y + height * 0.74;
      if (itemImage) {
        ctx.drawImage(itemImage, itemX, itemY, 28, 28);
      } else {
        ctx.fillStyle = "#151a23";
        ctx.fillRect(itemX, itemY, 28, 28);
        ctx.fillStyle = "#fff";
        ctx.font = "16px sans-serif";
        ctx.fillText(item?.name[0] ?? "?", itemX + 14, itemY + 14);
      }
    });
    ctx.restore();
    hexPath(ctx, x, y, width, height);
    ctx.strokeStyle = colors[unit.cost];
    ctx.lineWidth = 4;
    ctx.stroke();
    drawBoardStars(ctx, piece.stars, x, y, width, height);
    const alternate = piece.alternate && unitMap.get(piece.alternate.unitId);
    if (alternate) drawBoardAlternate(ctx, images.get(alternate.image), x, y, width, height, colors[alternate.cost] ?? "#fff");
  }
  ctx.font = "22px sans-serif";
  ctx.fillStyle = "#ced8e6";
  let y = 815;
  for (const [label, ...entries] of groups) {
    let line = label;
    for (const entry of entries) {
      if (ctx.measureText(line + entry).width > 1280) {
        ctx.fillText(line, 48, y);
        y += 34;
        line = "";
      }
      line += entry + "    ";
    }
    ctx.fillText(line, 48, y);
    y += 38;
  }
  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#929db0";
  ctx.fillText(
    "解锁条件请查看 S19 英雄资料。",
    48,
    canvas.height - 40,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片生成失败"))),
      "image/png",
    ),
  );
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
