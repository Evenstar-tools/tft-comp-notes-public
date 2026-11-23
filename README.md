# 云顶之弈阵容笔记

[公开版本](https://github.com/Evenstar-tools/tft-comp-notes-public/releases) · [问题反馈](https://github.com/Evenstar-tools/tft-comp-notes-public/issues)

本分支用于在 EdgeOne Makers 预览公开站。构建根目录为 `site`，框架预设为 Next，Node.js 使用 22.17.1，安装命令为 `npm ci`，构建命令为 `npm run build`，输出目录为 `.next`。

这是一个社区阵容工具，包含棋盘编辑器、英雄图鉴、羁绊与装备速查，以及按需配置的飞书发布集成。普通阵容编辑器支持匿名使用，阵容保存在当前浏览器。代码位于 `site/`。

未配置数据库时，攻略使用随构建发布的脱敏快照。快照保留已发布的正文和交互棋盘，运营文档标识和棋盘引用使用公开专用 ID。

## 本地运行

需要 Node.js 22.13 或以上。在仓库根目录执行：

```sh
cd site
npm ci
npm run dev -- --port 5173 --hostname 127.0.0.1
```

打开 [本地编辑器](http://127.0.0.1:5173/editor) 或[英雄图鉴](http://127.0.0.1:5173/heroes)。构建与校验：

```sh
npm test
npm run build
```

站主跨设备编辑需要初始化 libSQL 数据库和图片存储，并配置站主登录。所需环境变量见 `site/.env.example`。部署凭据通过 Makers 项目环境变量管理。

## 仓库维护

- `main` 保留已验证的公开源码。提交 PR 通过 `domain-tests` 后合入。
- `sites-vN` 对应一次已发布版本的公开源码快照，可在 Releases 查看。
- 更新从已发布源码重新提取，复核对应版本和本地测试后进入 PR。通过同源快照保留可复现的发布版本。
- 问题反馈请带上版本、入口和复现步骤。涉及安全漏洞时使用仓库的私密报告入口。

## 素材说明

云顶之弈阵容笔记是独立的社区项目，使用 Riot Games 的素材。Riot Games 未认可或赞助本项目。素材使用参见 [Riot Games 社区项目说明](https://www.riotgames.com/en/legal)。第三方代码和资源保留各自的声明。
