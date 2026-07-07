## Why

当前 uTools 插件已能启动项目、统一配置、运行常用命令，但用户对 Claude Code 的**插件生态**（商城 marketplace 与已安装插件）仍只能在 `claude` 交互式 `/plugin` 界面里管理，无法在 uTools 中一站式浏览、发现与增删。同时用户缺少「有哪些值得装的商城/插件」的发现入口——现有信息散落在各仓库，没有热门与推荐视角。新增 `ccplugin` 命令补齐这一环：把 Claude Code 的插件商城与插件管理搬进 uTools，并提供从互联网获取的热门商城与插件推荐。

## What Changes

- 新增 `ccplugin` 功能命令（关键词：`ccplugin`、`ccp`、`插件`），进入独立的「插件中心」页面。
- **插件中心** 采用标签式布局，包含三个分区：
  - **已装插件**：读取 Claude Code 真实状态（`~/.claude/plugins/installed_plugins.json` + `settings.json` 的 `enabledPlugins`），展示每个插件的商城归属、版本、启/停状态；支持**启用 / 停用 / 更新 / 卸载**。
  - **商城管理**：读取 `~/.claude/plugins/known_marketplaces.json` 与已克隆的 `marketplaces/<mp>/.claude-plugin/marketplace.json`，列出已知商城及其可安装插件；支持**添加商城（GitHub repo / git URL）/ 移除商城 / 从商城安装插件**。
  - **热门发现**：从互联网拉取「热门商城」与「插件推荐」榜单，展示名称、简介、分类、star 等元信息，一键添加商城或安装其推荐插件；已安装/已知项做去重标记。
- 所有**变更类操作**（安装/卸载/启停/更新/增删商城）通过 shell 调用 `claude plugin …` 子命令完成，复用 Claude Code 官方的 git/版本/缓存逻辑；**浏览类操作**直接读取上述 JSON，快速且离线可用。
- 热门发现数据**实时来自 GitHub**：插件推荐取自官方目录 `anthropics/claude-plugins-official`，热门商城由 GitHub 仓库搜索（按 Star）经 `.claude-plugin/marketplace.json` 校验得到；结果本地缓存，断网回退缓存或诚实空态，**不含硬编码假数据**。
- 沿用现有交互范式：uTools 子输入框搜索、方向键导航、回车执行、暗色主题与主色变量、`window.services` 预加载层。

> 说明：变更操作经 `claude` CLI 执行。热门数据源初版曾用「内置精选常量」，因反馈「假数据」已改为上述 GitHub 实时抓取。

## Capabilities

### New Capabilities
- `ccplugin-manager`: 在 uTools 内管理 Claude Code 插件生态的能力——已装插件的增删启停、商城的浏览与增删、以及从互联网获取的热门商城与插件推荐发现，含页面布局、搜索/键盘交互与网络降级行为的规格。

### Modified Capabilities
<!-- 无：新增独立功能命令与页面，不改变 project-launcher / command-runner / theme-config 的既有需求。plugin.json 与 App.vue 仅新增 ccplugin 路由分支，属新增而非对现有能力需求的修改。 -->

## Impact

- **受影响代码**：`public/plugin.json`（新增 `ccplugin` feature）、`src/App.vue`（新增 `ccplugin` 路由分支）、`src/PluginCenter/`（新增页面组件及子分区）、`public/preload/services.js`（新增插件/商城读取、`claude plugin` 调用、远程榜单拉取与缓存等服务）。
- **受影响的外部状态（只读或经 CLI 写）**：`~/.claude/plugins/installed_plugins.json`、`~/.claude/plugins/known_marketplaces.json`、`~/.claude/plugins/marketplaces/<mp>/.claude-plugin/marketplace.json`、`~/.claude/settings.json`（`enabledPlugins` / `extraKnownMarketplaces`）。本插件不直接改写这些文件，统一经 `claude plugin` 命令变更。
- **新增本地存储**：`ccplugin.cache`（热门榜单缓存与拉取时间戳）。
- **依赖**：无新增第三方依赖；网络请求用 Node 内置 `https`，进程调用复用现有 `spawn` 模式。运行期前置依赖为 PATH 上存在 `claude` CLI（缺失时降级为只读浏览并提示）。
- **受影响 specs**：新增 `ccplugin-manager`；不修改现有 specs。
- **用户影响**：新增 `ccplugin`/`ccp`/`插件` 关键词入口；无破坏性变更。
