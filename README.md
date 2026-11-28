# 云顶之弈阵容笔记

[公开版本](https://github.com/Evenstar-tools/tft-comp-notes-public/releases) · [问题反馈](https://github.com/Evenstar-tools/tft-comp-notes-public/issues)

本仓库是项目后续开发、代码评审和 EdgeOne 发布的入口。Makers 生产分支为 `main`，`deploy/edgeone-preview` 用于预览。构建根目录为 `site`，框架预设为 Next，Node.js 使用 22.17.1，安装命令为 `npm ci`，构建命令为 `npm run build`，输出目录为 `.next`。

这是一个社区阵容工具，包含棋盘编辑器、英雄图鉴、羁绊与装备速查，以及按需配置的飞书发布集成。普通阵容编辑器支持匿名使用，阵容保存在当前浏览器。代码位于 `site/`。

未配置数据库时，攻略使用随构建发布的脱敏快照。快照保留已发布的正文和交互棋盘，运营文档标识和棋盘引用使用公开专用 ID。

## 本地运行

需要 Node.js 22.13 或以上。在仓库根目录执行：

```sh
cd site
npm ci
npm run dev -- --port 5173 --hostname 127.0.0.1
```

打开 [本地编辑器](http://127.0.0.1:5173/editor) 或[英雄图鉴](http://127.0.0.1:5173/heroes)。完整验收覆盖 TypeScript、单测、公开发布与数据完整性门禁，以及生产构建。

```sh
npm run check
npm run build
```

站主跨设备编辑需要初始化 libSQL 数据库和图片存储，并配置站主登录。所需环境变量见 `site/.env.example`。部署凭据通过 Makers 项目环境变量管理。

## 仓库维护（单源开发）

- **本仓库 `main` 是唯一代码真源**：新功能、UI 优化、战绩与清理改动统一从 `main` 新建功能分支，开 PR 并在 `Project checks` 全绿后合入。GitHub Releases 用于保留已验证的公开版本。
- EdgeOne 的正式域名为 [tftnotes.com](https://tftnotes.com/)。合并后按[单源发布与验收](site/docs/双站发布.md)确认正式站。GPTsite 留作历史归档。
- 公开仓库仅保存可公开的内容，原始快照、私有 ID 映射与部署凭据始终放在私有目录或 Makers 项目环境变量中。
- 问题反馈请带上版本、入口和复现步骤。涉及安全漏洞时使用仓库的私密报告入口。

## 数据更新与归档

在 `site/` 运行 `npm run data:status` 查看 11 个模块的基线，运行 `npm run data:verify` 执行离线完整性门禁。日更、版本切换和归档统一走 `npm run data:refresh --`，参数、样本口径和回退流程见[数据更新规范](site/docs/数据更新规范.md)。数据维护需要 Python 3 和项目要求的 Node.js 版本。

在 `site/` 运行 `npm run guides:audit` 巡检合并后的主打攻略及其阶段、变阵。追加 `-- --strict --json` 可导出结构化报告，并将站位提示计入退出状态。用 `-- --guide sample-block-0243` 可指定攻略，可重复传入。特殊摆法可以通过 `--overrides` 读取本地 JSON 数组，每条填写 `sectionId`、`teamId`、`rule`、`reason`，也可用 `unitId` 限定棋子。豁免仅用于巡检的站位规则。

## 素材说明

云顶之弈阵容笔记是独立的社区项目，使用 Riot Games 的素材。Riot Games 未认可或赞助本项目。素材使用参见 [Riot Games 社区项目说明](https://www.riotgames.com/en/legal)。第三方代码和资源保留各自的声明。
