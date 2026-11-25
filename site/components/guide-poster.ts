import { BOARD_HEIGHT, BOARD_WIDTH, HEX_HEIGHT, HEX_WIDTH, hexPosition } from "@/domain/board-layout";
import { boardInstruments, boardMarkerNote } from "@/domain/board-instruments";
import type { Section } from "@/domain/document";
import { sectionTeams } from "@/domain/document-flow";
import { guideConditionName, guideConditionTag, guideEquipmentConditions, guideReferenceConditions } from "@/domain/guide-equipment-conditions";
import { guideRoster, readingNotes } from "@/domain/guide-reading";
import { heroArtworkFocus } from "@/domain/hero-artwork";
import { preferredItemImage } from "@/domain/item-art";
import { defaultPosterFormat, posterGear, posterLayout, posterOperationTitle, posterRequirements, posterStageTitle, posterTitle, type PosterFormat } from "@/domain/poster";
import { traitCounts, traitGroup } from "@/domain/team";
import type { Season, Team } from "@/domain/types";
import { drawBoardInstrument, drawBoardStars, drawCover, hexPath, loadImage } from "./export-team";

const W = 440, pad = 16, inner = W - 2 * pad;
const ink = "#252637", muted = "#585867", accent = "#564276", paper = "#faf8f3";
const border: Record<number, string> = { 1: "#afbacb", 2: "#55c99a", 3: "#65bafa", 4: "#cd91ff", 5: "#f3be58", 7: "#ff956e" };
const unitNames: Record<string, string> = {
  "厄运小姐": "女枪", "烈娜塔·戈拉斯克": "烈娜塔", "努努和威朗普": "努努", "蒙多医生": "蒙多",
  "萨勒芬妮": "芬妮", "崔丝塔娜": "小炮", "弗拉基米尔": "吸血鬼",
};
const itemNames: Record<string, string> = {
  "朔极之矛": "青龙刀", "无尽之刃": "无尽", "最后的轻语": "轻语", "鬼索的狂暴之刃": "羊刀",
  "海克斯科技枪刃": "科技枪", "珠光护手": "法爆", "莫雷洛秘典": "鬼书", "石像鬼石板甲": "石像鬼",
  "斯特拉克的挑战护手": "血手", "泰坦的坚决": "泰坦", "强袭者的链枷": "链枷", "日炎斗篷": "日炎",
  "灭世者的死亡之帽": "帽子", "窃贼手套": "偷偷", "振奋盔甲": "振奋", "狂徒铠甲": "狂徒",
  "大天使之杖": "大天使", "适应性头盔": "适应头盔",
};
const roleNames: Record<string, string> = { 主输出: "主C", 前期输出: "主C", 后期输出: "副C", 物理输出: "副C" };
type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, size: number, weight = 500) {
  ctx.font = weight + " " + size + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
}

function wrap(ctx: Ctx, text: string, width: number) {
  const result: string[] = [];
  for (const paragraph of text.trim().split(/\n+/)) {
    let row = "";
    for (const character of paragraph) {
      if (row && ctx.measureText(row + character).width > width) {
        const glyphs = Array.from(row);
        const carry = glyphs.length > 1 && /^[，。、；：！？）】,.!?%]/u.test(character) ? glyphs.pop()! : "";
        result.push(glyphs.join(""));
        row = carry;
      }
      row += character;
    }
    if (row) result.push(row);
  }
  return result;
}

function block(ctx: Ctx, text: string, x: number, y: number, width: number, size: number, color: string, step: number, weight = 500) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  for (const line of wrap(ctx, text, width)) {
    ctx.fillText(line, x, y);
    y += step;
  }
  return y;
}

function rule(ctx: Ctx, y: number) {
  ctx.fillStyle = "#dcd8d1";
  ctx.fillRect(pad, y, inner, 1);
}

export async function guidePoster({ section, team, data, format = defaultPosterFormat(team), stageIds }: {
  section?: Section; team: Team; data: Season; format?: PosterFormat; stageIds?: string[];
}, onBoardPositions?: (positions: ReadonlyMap<string, number>) => void): Promise<Blob> {
  if (!team.pieces.length) throw new Error("先把棋子放上棋盘");
  const { stages, boards, operations } = posterLayout(section, team, data, format, stageIds);
  const { title, subtitle } = posterTitle(section, team);
  const requirements = posterRequirements(section, team, data);
  const sectionBoards = section ? sectionTeams(section) : [];
  const conditions = section && guideEquipmentConditions(section, sectionBoards, data, undefined, team);
  const reference = section && guideReferenceConditions(section, sectionBoards, data, team);
  const rows = conditions?.rows ?? [];
  const namedConditions = [
    ...rows.map(row => ({ row, context: undefined })),
    ...(reference?.rows ?? []).filter(row => !rows.some(local => local.id === row.id && local.recipient?.id === row.recipient?.id))
      .map(row => ({ row, context: reference?.label })),
  ].filter(({ row }) => row.category === "海克斯" || row.recipient);
  const teams = [team, ...stages];
  const instrumentsByBoard = new Map(teams.map(board => [board.id, boardInstruments(board.pieces, data, board.instrumentPositions)]));
  const teamMembers = new Map(teams.map(board => [board.id, guideRoster(board, data, section ? readingNotes(section, board, data).roles : [])]));
  const gear = new Map(teams.map(board => [board.id, posterGear(section, board, data)]));
  const items = new Map(data.items.map(item => [item.id, item]));
  const itemImages = new Map(data.items.map(item => [item.id, preferredItemImage(item)]));
  const coverUnit = gear.get(team.id)?.[0]?.unit ?? teamMembers.get(team.id)?.[0]?.unit;
  const coverUrl = coverUnit?.splashImage || coverUnit?.image;
  const coverFocus = coverUnit && heroArtworkFocus(coverUnit);
  const urls = new Set([
    coverUrl,
    ...namedConditions.map(({ row }) => preferredItemImage(row.item) ?? row.image),
    ...[...teamMembers.values()].flatMap(members => members.map(member => member.unit.image)),
    ...teams.flatMap(board => board.pieces.flatMap(piece => piece.items.map(id => itemImages.get(id)))),
    ...[...instrumentsByBoard.values()].flatMap(entries => [...entries.values()].map(entry => entry.image)),
  ]);
  const images = new Map(await Promise.all([...urls].filter((url): url is string => !!url)
    .map(async url => [url, await loadImage(url, 15000)] as const)));
  if ([...instrumentsByBoard.values()].some(entries =>
    [...entries.values()].some(instrument => instrument.id === "infernalIdol" && !images.get(instrument.image)))) {
    throw new Error("地狱偶像头像尚未加载，请重试。");
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前浏览器无法生成图片");

  function drawBoard(c: Ctx, board: Team, y: number) {
    const members = new Map((teamMembers.get(board.id) ?? []).map(member => [member.piece.position, member]));
    const instruments = instrumentsByBoard.get(board.id);
    const scale = (inner - 14) / BOARD_WIDTH;
    const boardHeight = BOARD_HEIGHT * scale + 14;
    const field = c.createLinearGradient(pad, y, pad + inner, y + boardHeight);
    field.addColorStop(0, "#2b293c");
    field.addColorStop(1, "#1c2030");
    c.fillStyle = field;
    c.beginPath();
    c.roundRect(pad, y, inner, boardHeight, 8);
    c.fill();
    for (let index = 0; index < 28; index++) {
      const pos = hexPosition(index);
      const x = pad + 7 + pos.x * scale, top = y + 7 + pos.y * scale;
      const w = HEX_WIDTH * scale, h = HEX_HEIGHT * scale;
      const instrument = instruments?.get(index);
      if (instrument) {
        drawBoardInstrument(c, instrument, images.get(instrument.image), x, top, w, h);
        continue;
      }
      const member = members.get(index);
      hexPath(c, x, top, w, h);
      c.fillStyle = member ? "#54475f" : "#2e3042";
      c.fill();
      if (member) {
        c.save();
        c.clip();
        const image = images.get(member.unit.image);
        if (image) drawCover(c, image, x, top, w, h);
        const name = unitNames[member.unit.name] ?? member.unit.name;
        const center = x + w / 2;
        c.textAlign = "center";
        c.textBaseline = "middle";
        font(c, 12, 700);
        const nameWidth = Math.min(c.measureText(name).width, w - 6);
        const nameY = top + h * (member.piece.items.length ? .63 : .70);
        c.fillStyle = "rgba(15,17,26,.88)";
        c.beginPath();
        c.roundRect(center - nameWidth / 2 - 2, nameY - 6.5, nameWidth + 4, 13, 2);
        c.fill();
        c.fillStyle = "#fff";
        c.fillText(name, center, nameY, nameWidth);

        c.restore();
      }
      hexPath(c, x, top, w, h);
      c.strokeStyle = member ? border[member.unit.cost] ?? "#fff" : "#404455";
      c.lineWidth = member ? 2 : .65;
      c.stroke();
      if (member) {
        drawBoardStars(c, member.piece.stars, x, top, w, h);
        const equipped = member.piece.items.flatMap(id => {
          const src = itemImages.get(id);
          const icon = src && images.get(src);
          return icon ? [icon] : [];
        });
        const size = w * .235;
        const gap = 1;
        const start = x + (w - equipped.length * size - (equipped.length - 1) * gap) / 2;
        equipped.forEach((icon, slot) => {
          const left = start + slot * (size + gap);
          const itemTop = top + h * .78;
          c.fillStyle = "#141525";
          c.fillRect(left - .5, itemTop - .5, size + 1, size + 1);
          c.drawImage(icon, left, itemTop, size, size);
        });
      }
    }
    y += boardHeight + 7;
    if (instruments?.size) y = block(c, boardMarkerNote(instruments), pad, y, inner, 12.5, muted, 18);
    const traits = traitCounts(board.pieces, data.units, data.traits, data.items).filter(trait => traitGroup(trait) === "已开常规");
    font(c, 14, 650);
    c.fillStyle = accent;
    let x = pad;
    for (const trait of traits) {
      const label = trait.level + " " + trait.name;
      const width = c.measureText(label).width;
      if (x > pad && x + width > pad + inner) {
        x = pad;
        y += 19;
      }
      c.fillText(label, x, y);
      x += width + 14;
    }
    return traits.length ? y + 19 : y;
  }

  function drawGear(c: Ctx, board: Team, y: number, alreadyShown: Set<string>) {
    const rows = (gear.get(board.id) ?? []).filter(({ piece }) => {
      const key = piece.unitId + ":" + [...piece.items].sort().join(",");
      if (alreadyShown.has(key)) return false;
      alreadyShown.add(key);
      return true;
    });
    if (!rows.length) return y;
    y = block(c, "配装", pad, y + 7, inner, 18, ink, 24, 750);
    for (const { piece, unit, role } of rows) {
      rule(c, y);
      y += 6;
      let base = block(c, unitNames[unit.name] ?? unit.name, pad, y, 88, 16, ink, 19, 725);
      if (role) base = block(c, roleNames[role] ?? role, pad, base, 88, 12.5, accent, 15, 650);
      for (const [index, id] of piece.items.entries()) {
        const item = items.get(id);
        const x = pad + 93 + 103 * index;
        const url = itemImages.get(id);
        const icon = url && images.get(url);
        if (icon) {
          c.save();
          c.beginPath();
          c.roundRect(x, y + 2, 24, 24, 4);
          c.clip();
          c.drawImage(icon, x, y + 2, 24, 24);
          c.restore();
        }
        const name = item ? itemNames[item.name] ?? item.name : "装备";
        base = Math.max(base, y + 28, block(c, name, x + (icon ? 28 : 0), y + 3, icon ? 72 : 99, 14.5, ink, 19, 600));
      }
      y = base + 6;
    }
    return y;
  }

  function stageHeading(c: Ctx, label: string, y: number) {
    font(c, 16, 750);
    const height = wrap(c, label, inner - 18).length * 20 + 8;
    c.fillStyle = "#eae3f0";
    c.beginPath();
    c.roundRect(pad, y, inner, height, 4);
    c.fill();
    c.fillStyle = "#9674bc";
    c.fillRect(pad, y + 4, 2, height - 8);
    return block(c, label, pad + 9, y + 4, inner - 18, 16, accent, 20, 750) + 8;
  }

  function paint(c: Ctx, height: number, positions?: Map<string, number>) {
    c.textBaseline = "top";
    c.textAlign = "left";
    c.fillStyle = paper;
    c.fillRect(0, 0, W, height);
    font(c, 26, 750);
    const titleHeight = wrap(c, title, inner).length * 32;
    font(c, 15, 650);
    const headerHeight = 30 + titleHeight + (boards.length === 1 ? wrap(c, subtitle, inner).length * 19 : 0);
    c.fillStyle = "#252033";
    c.fillRect(0, 0, W, headerHeight);
    const cover = coverUrl && images.get(coverUrl);
    if (cover) {
      drawCover(c, cover, W - 152, 0, 152, headerHeight, coverFocus);
      const shade = c.createLinearGradient(W - 153, 0, W, 0);
      shade.addColorStop(0, "#252033");
      shade.addColorStop(1, "rgba(37,32,51,.56)");
      c.fillStyle = shade;
      c.fillRect(W - 153, 0, 153, headerHeight);
    }
    c.fillStyle = "#bca7e7";
    c.fillRect(0, 0, W, 3);
    const titleEnd = block(c, title, pad, 14, inner, 26, "#fff", 32, 750);
    if (boards.length === 1) block(c, subtitle, pad, titleEnd + 6, inner, 15, "#eee4fb", 19, 650);
    let y = headerHeight + 10;
    for (const { row, context } of namedConditions) {
      const image = preferredItemImage(row.item) ?? row.image;
      const icon = image && images.get(image);
      const x = pad + (icon ? 29 : 0);
      if (icon) c.drawImage(icon, pad, y, 23, 23);
      const label = row.category === "海克斯" ? (row.kind === "required" ? "必选海克斯" : "可选海克斯") : guideConditionTag(row);
      const detail = row.category === "海克斯" && row.kind === "required" ? row.detail?.split(" · ", 1)[0] : row.detail;
      const top = y;
      y = block(c, [context, label, guideConditionName(row)].filter(Boolean).join(" · "), x, y + 2, W - pad - x, 15.5, accent, 21, 650);
      if (detail) y = block(c, detail, x, y, W - pad - x, 13.5, muted, 18);
      y = Math.max(y, top + 25) + 4;
    }
    for (const condition of requirements) y = block(c, condition, pad, y, inner, 15.5, accent, 21, 650);
    const alreadyShown = new Set<string>();
    for (const board of boards) {
      positions?.set(board.id, (y + (boards.length > 1 ? 6 : 4)) / height);
      if (boards.length > 1) y = stageHeading(c, posterStageTitle(board), y + 6);
      y = drawGear(c, board, drawBoard(c, board, y + 4), alreadyShown);
    }
    if (operations.length) {
      rule(c, y + 7);
      y = block(c, "运营", pad, y + 16, inner, 20, ink, 26, 750);
      for (const step of operations) {
        if (step.board) positions?.set(step.board.id, (y + 5) / height);
        y = stageHeading(c, posterOperationTitle(step), y + 5);
        for (const line of step.lines) {
          const levelPrefix = step.level + "级";
          const text = step.level && line.startsWith(levelPrefix) ? line.slice(levelPrefix.length).trimStart() : line;
          y = block(c, text, pad, y, inner, 16.5, ink, 23) + 3;
        }
        if (step.board) y = drawGear(c, step.board, drawBoard(c, step.board, y + 4), alreadyShown);
        y += 8;
      }
    }
    rule(c, y + 5);
    return block(c, "S19 PBE · 资料 " + data.sourceDate, pad, y + 13, inner, 12.5, muted, 17) + 10;
  }

  const height = Math.ceil(paint(ctx, 1));
  const resolution = Math.min(3, Math.sqrt(10_000_000 / (W * height)));
  canvas.width = Math.ceil(W * resolution);
  canvas.height = Math.ceil(height * resolution);
  ctx.scale(resolution, resolution);
  const positions = onBoardPositions ? new Map<string, number>() : undefined;
  paint(ctx, height, positions);
  if (positions) onBoardPositions?.(positions);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("图片生成失败，点重试再试一次")), "image/png");
  });
}
