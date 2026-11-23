# 云顶之弈阵容笔记

[在线工具](https://evenstar-tft-library.zhangzeyu99.chatgpt.site) · [公开版本](https://github.com/Evenstar-tools/tft-comp-notes-public/releases) · [问题反馈](https://github.com/Evenstar-tools/tft-comp-notes-public/issues)

这是一个社区阵容工具，包含棋盘编辑器、英雄图鉴、羁绊与装备速查，以及按需配置的飞书发布集成。普通阵容编辑器支持匿名使用，阵容保存在当前浏览器。代码位于 `site/`，当前源码快照对应已发布的 v163。

公开快照带有供运行的赛季资料，运营文档标识和棋盘引用使用示例 ID。发布设施和飞书集成在自己的环境中配置。

## 本地运行

需要 Node.js 22.13 或以上。在仓库根目录执行：

```sh
cd site
npm ci
npm run dev -- --port 5173 --host 127.0.0.1
```

打开 [本地编辑器](http://127.0.0.1:5173/editor) 或[英雄图鉴](http://127.0.0.1:5173/heroes)。构建与校验：

```sh
node --experimental-strip-types --test tests/*.test.mjs
npm run build
```

若要使用站主存储和发布功能，需为自己的部署初始化 `site/drizzle/` 中的 D1 迁移，并配置 R2。飞书集成读取运行环境中的 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_DOCUMENT_ID`。如需配置可在浏览器中分享的文档跳转，可选用构建环境变量 `NEXT_PUBLIC_FEISHU_DOCUMENT_URL`。应用凭据和本地状态由自己的开发或部署环境管理。

## 仓库维护

- `main` 保留已验证的公开源码。提交 PR 通过 `domain-tests` 后合入。
- `sites-vN` 对应一次已发布版本的公开源码快照，可在 Releases 查看。
- 更新从已发布源码重新提取，复核对应版本和本地测试后进入 PR。通过同源快照保留可复现的发布版本。
- 问题反馈请带上版本、入口和复现步骤。涉及安全漏洞时使用仓库的私密报告入口。

## 素材说明

云顶之弈阵容笔记是独立的社区项目，使用 Riot Games 的素材。Riot Games 未认可或赞助本项目。素材使用参见 [Riot Games 社区项目说明](https://www.riotgames.com/en/legal)。第三方代码和资源保留各自的声明。
