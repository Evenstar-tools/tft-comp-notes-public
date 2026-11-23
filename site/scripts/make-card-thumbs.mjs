// 从 DataTFT 720×427 原画生成英雄列表用的小图（WebP）。
// 列表卡片显示宽度约 120px，按 2 倍屏生成 256×152，单张约 6–10KB。
// 原画仍保留给详情区头图与“查看高清原画”。
// 用法：在 web 目录运行 node scripts/make-card-thumbs.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.resolve("public/assets/datatft");
const files = fs.readdirSync(dir).filter((name) => name.endsWith("-splash.jpg"));
let total = 0;
for (const name of files) {
  const output = path.join(dir, name.replace(/-splash\.jpg$/, "-card.webp"));
  // 原画主体普遍偏右，裁切时略向右取景，和棋盘、详情的观感一致。
  const info = await sharp(path.join(dir, name))
    .resize(256, 152, { fit: "cover", position: "right" })
    .webp({ quality: 74, effort: 6 })
    .toFile(output);
  total += info.size;
}
console.log(
  `${files.length} card thumbnails, ${(total / 1024).toFixed(0)} KB total, avg ${(total / 1024 / files.length).toFixed(1)} KB`,
);
