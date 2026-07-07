## Context

本插件是面向 Claude Code 的 uTools 插件，已注册 `ccstart`（启动器）、`ccstartconf`（统一配置中心）、`ccrun`（命令运行器）三个 feature。UI 为 Vue 3 `<script setup>` 单文件组件，`App.vue` 按 `action.code` 路由到对应组件；Node 能力集中在预加载层 `public/preload/services.js`，通过 `window.services.*` 暴露给渲染层，持久化用 `window.utools.dbStorage`。终端/进程启动已有成熟的 `spawn` 封装（`launchProject` 等）。

Claude Code 的插件生态状态是**真实存在的本地文件**，经调研确认：

- `~/.claude/plugins/known_marketplaces.json`：`{ "<mp>": { source: { source: 'github'|'git', repo|url }, installLocation, lastUpdated } }`
- `~/.claude/plugins/installed_plugins.json`：`{ version: 2, plugins: { "<plugin>@<mp>": [{ scope, installPath, version, installedAt, lastUpdated, gitCommitSha }] } }`
- `~/.claude/plugins/marketplaces/<mp>/.claude-plugin/marketplace.json`：`{ name, description, owner, plugins: [{ name, description, author, category, source }] }`（官方商城含 255 个插件）
- `~/.claude/settings.json`：`enabledPlugins`（`"<plugin>@<mp>": bool`）、`extraKnownMarketplaces`（`"<mp>": { source }`）

关键设施：PATH 上的 `claude` CLI 提供**非交互**的插件子命令族——`claude plugin install|uninstall|enable|disable|update|list|details` 与 `claude plugin marketplace (add|remove|list)`。这意味着变更操作可直接复用 CC 官方逻辑，无需自行实现 git clone / cache / 版本 SHA 管理。

「热门商城 / 插件推荐」无官方 API；社区数据分散在各仓库。

## Goals / Non-Goals

**Goals:**
- 新增 `ccplugin` 独立命令与「插件中心」页面，三分区：已装插件 / 商城管理 / 热门发现。
- 浏览类操作直接读取上述 JSON，快速、离线可用、只读安全（坏文件降级）。
- 变更类操作（安装/卸载/启停/更新/增删商城）统一经 `claude plugin …` 子命令执行。
- 从互联网获取热门榜单，具备缓存与离线兜底；对已知/已装项去重标记。
- 复用现有交互范式（子输入框搜索、方向键导航、暗色主题、`window.services` 分层）。

**Non-Goals:**
- 不自行实现插件的下载/克隆/缓存/版本管理（交给 `claude` CLI）。
- 不直接改写 `~/.claude` 下的 CC 配置文件（避免与 CC 内部状态不一致）。
- 不引入新的第三方依赖（网络用 Node 内置 `https`，进程用现有 `spawn`）。
- 不做插件配置项编辑、不做私有/鉴权商城的凭据管理（后续变更）。

## Decisions

### 决策 1：读写分离——浏览读 JSON，变更调 CLI

浏览用直接读取 `~/.claude/plugins/*.json` 与各商城 `marketplace.json`（纯 `fs` 只读，坏文件 try/catch 降级为空）；所有变更经 `spawn('claude', ['plugin', …])`，用退出码 + stdout/stderr 判定结果，完成后重新读取 JSON 刷新视图。

- **理由**：读 JSON 快且离线可用；变更复用 CC 官方 git/cache/版本逻辑，避免与 CC 内部状态漂移。
- **备选**：① 全部经 CLI（含 list）——被否，浏览慢且强依赖 CLI 在线；② 全部自行实现（含 clone/cache/写 installed_plugins）——被否，复杂且极易与 CC 内部逻辑不一致。

### 决策 2：`claude plugin` 调用封装与结果解析

在 services.js 新增薄封装 `runClaudePlugin(args): { success, code, stdout, stderr }`，非交互执行、捕获输出、设置超时；对外提供语义化服务：`installPlugin(plugin, mp)`、`uninstallPlugin(id)`、`enablePlugin(id)`、`disablePlugin(id)`、`updatePlugin(id)`、`addMarketplace(source)`、`removeMarketplace(name)`。启动时 `detectClaudeCli()` 探测可执行文件是否存在，结果注入渲染层用于降级。

- **理由**：渲染层不接触 `process`/`spawn`，与既有分层一致（参见 `launchProject`）。
- **备选**：渲染层直接拼命令——被否，破坏分层且不安全。

### 决策 3：热门发现数据源 = GitHub 实时抓取（无内置假数据）

> 修订：初版采用「内置精选常量 + 待托管远程清单」，实测被判定为「假数据」。改为**全部从 GitHub 实时获取**：

- **插件推荐** = 官方目录 `anthropics/claude-plugins-official` 的 `marketplace.json`（raw.githubusercontent 拉取，无限流，255 款真实插件，含 category/author/description）。
- **热门商城** = GitHub 仓库搜索（`sort=stars`）→ 逐个用 contents API 校验 `.claude-plugin/marketplace.json` 存在 → 仅保留**真商城**（读取其真实 name/pluginCount）。过滤掉 `awesome`、`prompts.chat` 等噪声。
- 两路并发拉取，成功写 `dbStorage['ccplugin.cache']`（数据 + 时间戳）；`getHotList()` 同步读缓存，`refreshHotList()` 强制联网；返回 `source: 'live'|'cache'|'offline'` 供 UI 标注。
- **失败/离线**：回退到缓存；无缓存则返回**诚实空态**（提示「需要联网获取热门内容」+ 重试），**绝不塞硬编码假数据**。

- **理由**：满足「自己从互联网获取」；contents-API 校验解决了 GitHub 搜索的噪声问题；raw 官方目录规避限流并提供丰富真实内容。
- **速率限制**：未认证 core API 60/时；单次刷新 ≈ 1 搜索 + ~12 contents ≈ 13 次调用，配合缓存足够；限流时静默回退缓存。
- **备选**：① 内置精选常量——被否（假数据）；② 纯 GitHub 搜索不校验——被否（噪声大，混入非商城仓库）。

### 决策 4：页面结构与交互

新增 `src/PluginCenter/index.vue`，`activeTab` 切换三分区（可将「已装插件」「商城」「热门」拆为子组件或单文件内分段，规模允许时先单文件）。沿用：`App.vue` 中 `route === 'ccplugin'` 分支渲染；进入时 `setSubInput` 提供搜索、按当前分区过滤；方向键导航 + 回车执行主操作（复用 `scrollIntoView` 惯例）；变更操作用行内按钮 + 危险操作二次确认弹窗（复用 `ProjectLauncher` 的确认弹窗交互模式）；执行中显示 loading、结果用 toast/notification 反馈。列表项对已装/已知做角标标记。

- **plugin.json**：新增 feature `ccplugin`，`cmds: ["ccplugin","ccp","插件"]`。
- **App.vue**：新增 `route === 'ccplugin'` → `<PluginCenter :enterAction>`。

> 视觉修订（多轮反馈后定稿）：**黑白极简 + 主题色单一强调**。整体走中性灰阶（白卡 / 黑灰字 / 细描边），唯一的彩色来自**主题设置的 `--primary-color`**（激活标签下划线、开关开启态、能力计数、主按钮、链接、悬停描边均随主题色变化）——避免了早期「浅色模板卡」与「霓虹深色」两版的问题。
> - **已装插件**：卡片网格（一行多张），操作全部置于卡片**右上角**——启用/停用为**开关（switch）**，更新/卸载为图标按钮；点击卡片打开**详情弹窗**。
> - **能力指纹**仍为签名：功能描述 + 一排 `技能/命令/agents/hooks/MCP` 计数 chips（本地扫描，见决策 6）。
> - **详情弹窗**（内容加法）：完整描述 + 元信息栅格（版本/范围/安装时间/作者/许可证/主页）+ 该插件**技能/命令/子代理的名称清单** + 弹窗内启停/更新/卸载。

### 决策 5：`<plugin>@<marketplace>` 作为统一插件标识

以 CC 原生的 `installed_plugins.plugins` 键与 `enabledPlugins` 键（`名称@商城`）为主键在三分区间做匹配与去重。启停状态 = `enabledPlugins[id]`；安装态 = `installed_plugins.plugins[id]` 存在。

- **理由**：与 CC 内部标识一致，跨分区/榜单去重可靠。

### 决策 6：能力指纹本地提取（不调用 CLI）

`listInstalledPlugins()` 对每个插件读取其 `installPath`：描述取自 `.claude-plugin/plugin.json`（缺失时回退到所属商城 `marketplace.json` 的条目描述）；组件计数由目录扫描得到——`skills/` 子目录数、`commands/`&`agents/` 下 `.md` 计数、`hooks/hooks.json` 与 `.mcp.json`/manifest `mcpServers` 判定 hooks/MCP。

- **理由**：`claude plugin details` 能给组件清单但每插件一次 CLI 调用（~1-2s×N，太慢）；本地目录扫描即时且离线可用，信息足够回答「插件能干什么」。
- **备选**：`claude plugin details` 逐个调用——被否（慢）；只显示名称——被否（正是被反馈的问题）。

## Risks / Trade-offs

- **强依赖 `claude` CLI 的非交互行为** → 启动时探测；缺失/失败时降级为只读并提示；变更后以重新读 JSON 校验实际结果，不盲信退出码。
- **`claude plugin` 命令可能有交互提示/耗时较长** → 调用设超时、捕获输出、执行中显示 loading；必要时追加非交互标志（实现期核对各子命令 `--help`）。
- **变更后 CC 侧需重启会话才完全生效**（`update` 明确提示 restart required）→ UI 文案提示「重启 Claude Code 会话后生效」。
- **远程榜单地址未定 / 维护成本** → 内置兜底常量保证可用；清单结构版本化，拉取失败静默回退不影响主流程。
- **读取大文件**（官方 `marketplace.json` 255 项 / `plugin-catalog-cache.json` 350KB）→ 商城插件列表按需（展开时）读取与懒渲染，避免进入即全量解析。
- **跨平台路径**（Windows `installPath` 为反斜杠）→ 展示用规格化处理；匹配以 `名称@商城` 键为准，不依赖路径。

## Migration Plan

- 纯新增能力，无数据迁移、无破坏性变更。新增 `dbStorage` 键 `ccplugin.cache` 首次为空、自动填充。
- 回滚：从 `plugin.json` 移除 `ccplugin` feature、从 `App.vue` 移除路由分支、删除 `src/PluginCenter/` 与 services 新增函数即可，无残留副作用（本插件从不改写 `~/.claude`）。

## Open Questions

- 热门商城搜索的排序目前用 GitHub star，个别单插件仓库（star 高但内容轻）会靠前；后续可按 `pluginCount`/更新时间加权。
- 是否需要在「热门发现」直接调用 `claude plugin details` 展示插件的组件清单与 token 估算（增强信息，但增加一次 CLI 调用）？默认不做，作为后续增强。
- 各 `claude plugin` 子命令在当前版本是否**完全非交互**（尤其 `uninstall`/`marketplace remove` 是否有确认提示需 `--yes` 之类标志）？实现期以 `--help` 逐一核对。
