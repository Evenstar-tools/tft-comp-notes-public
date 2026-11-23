import { constants } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const usage = "用法  node scripts/export-guide-poster.mjs <攻略链接> [--board 棋盘名] [--format quick|full] [--stage 阶段名] [--out 文件路径] [--channel msedge]";
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function uniqueChoice(choices, requested) {
  const exact = choices.filter(option => option.id === requested || option.name === requested);
  const matching = exact.length ? exact : choices.filter(option => option.name.includes(requested));
  if (matching.length === 1) return matching[0];
  throw new Error("找不到唯一的「" + requested + "」。可选项 " + choices.map(option => option.name).join("、"));
}

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      board: { type: "string" }, format: { type: "string" }, stage: { type: "string", multiple: true },
      out: { type: "string" }, channel: { type: "string" }, help: { type: "boolean" },
    },
  });
  if (values.help) { console.log(usage); return; }
  if (positionals.length !== 1) throw new Error(usage);
  const url = new URL(positionals[0]);
  if (!["http:", "https:"].includes(url.protocol) || !/^\/guides\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error("请输入已发布的阵容攻略链接");
  }
  const stages = values.stage ?? [];
  const format = values.format ?? (stages.length ? "full" : undefined);
  if (format && format !== "quick" && format !== "full") throw new Error("版式可选 quick 或 full");
  if (stages.length > 2 || (stages.length && format === "quick")) throw new Error("完整攻略最多可加两张过渡棋盘");
  url.searchParams.set("poster", "1");
  if (format) url.searchParams.set("posterFormat", format);
  const byId = values.board && uuid.test(values.board);
  if (byId) url.searchParams.set("team", values.board);

  const browser = await chromium.launch({ channel: values.channel, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN", acceptDownloads: true });
    page.setDefaultTimeout(18000);
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 35000 });
    if (!response?.ok()) throw new Error("攻略无法打开");
    const dialog = page.getByRole("dialog", { name: /^阵容一图流/ });
    const preview = dialog.locator(".guide-poster-image");
    const downloadLink = dialog.getByRole("link", { name: "下载图片", exact: true });
    await preview.waitFor({ state: "visible" });
    if (values.board && !byId) {
      const selector = dialog.getByRole("combobox", { name: "阵容方案", exact: true });
      const choices = await selector.locator("option").evaluateAll(options => options.map(option => ({ id: option.value, name: option.text })));
      const next = uniqueChoice(choices, values.board);
      await selector.selectOption(next.id);
      await page.waitForFunction(id => document.querySelector(".guide-poster-image")?.getAttribute("data-poster-team") === id, next.id);
    }
    if (stages.length) {
      const field = dialog.getByRole("group", { name: /^(?:加入)?过渡棋盘$/ });
      const choices = await field.locator("label").evaluateAll(labels => labels.map(label => ({
        id: label.querySelector("input").value, name: label.textContent.trim(),
      })));
      const wanted = new Set(stages.map(requested => uniqueChoice(choices, requested).id));
      for (const choice of choices.filter(option => !wanted.has(option.id))) {
        await field.getByRole("checkbox", { name: choice.name, exact: true }).uncheck();
      }
      for (const choice of choices.filter(option => wanted.has(option.id))) {
        await field.getByRole("checkbox", { name: choice.name, exact: true }).check();
      }
      await page.waitForFunction(ids => {
        const image = document.querySelector(".guide-poster-image");
        const selected = image?.getAttribute("data-poster-stages")?.split(",").filter(Boolean);
        return selected?.length === ids.length && ids.every(id => selected.includes(id));
      }, [...wanted]);
    }

    const image = await preview.evaluate(async element => {
      await element.decode();
      return {
        team: element.getAttribute("data-poster-team"),
        stages: (element.getAttribute("data-poster-stages") ?? "").split(",").filter(Boolean),
        description: element.alt,
        width: element.naturalWidth,
        height: element.naturalHeight,
      };
    });
    const expectedTeam = byId ? values.board : values.board ? undefined : url.searchParams.get("team");
    if (expectedTeam && image.team !== expectedTeam) throw new Error("找不到指定棋盘");
    const imageFormat = await dialog.getByRole("group", { name: /^(?:一图流)?版式$/ }).locator('[aria-pressed="true"]').innerText();
    const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()]);
    const file = path.resolve(values.out ?? path.basename(download.suggestedFilename()));
    await mkdir(path.dirname(file), { recursive: true });
    await copyFile(await download.path(), file, constants.COPYFILE_EXCL);
    console.log(JSON.stringify({ file, bytes: (await stat(file)).size, format: imageFormat, guide: page.url(), ...image }));
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
