## 背景与动机（Why）

使用 Claude Code 的开发者会在 `~/.claude/projects` 下积累大量项目会话，但如今在它们之间切换需要手动打开终端、`cd` 进入正确目录、再重新输入启动命令。这个流程缓慢且容易出错，项目越多越明显。一个 uTools 插件可以把所有 Claude Code 项目按最近使用时间排序展示出来，并通过一次按键就在终端中启动任意项目。

## 变更内容（What Changes）

- 新增一个 uTools 功能（`ccstart` 指令），列出 `~/.claude/projects` 下发现的所有 Claude Code 项目。
- 将每个项目的 uTools/Claude 编码目录名解码为真实文件系统路径，并解析出便于阅读的显示名称。
- 按最近使用时间排序，时间取自每个项目目录中最新会话文件的修改时间。
- 提供即时搜索/过滤，以及完整的键盘导航（方向键 + 回车）。
- 选中后，在项目工作目录打开系统终端并运行可配置的启动命令（默认：`claude`）。
- 通过预加载脚本（`window.services`）暴露 Node.js 能力，用于扫描目录、解码路径、读取修改时间，以及跨 Windows/macOS/Linux 启动终端。
- 新增独立的配置功能（`ccstartconf` 指令），支持配置 PowerShell 可执行文件路径与自定义启动命令，并通过 uTools `dbStorage` 持久化。

## 能力（Capabilities）

### 新增能力（New Capabilities）
- `project-launcher`：从 `~/.claude/projects` 发现 Claude Code 项目（`ccstart` 指令），按最近使用时间排序并支持搜索与键盘导航，选中后在运行可配置命令的终端中启动该项目；并提供独立的配置功能（`ccstartconf` 指令）以配置 PowerShell 路径与自定义命令。

### 修改能力（Modified Capabilities）
<!-- 无：openspec/specs/ 下没有已存在的规格。 -->

## 影响（Impact）

- **plugin.json**：新增 `ccstart` 与 `ccstartconf` 两个功能项及其指令关键字。
- **渲染层（Vue）**：新增 `ProjectLauncher` 与 `LauncherConfig` 视图组件，并在 `App.vue` 中按 `action.code` 增加对应路由分支。
- **预加载层（`public/preload/services.js`）**：新增用于列出项目、解码路径、读取时间戳、启动终端的 Node.js 服务函数；依赖 `node:fs`、`node:path`、`node:os`、`node:child_process`。
- **持久化**：使用 uTools `dbStorage`（或 `utools.db`）保存用户设置（PowerShell 路径、自定义启动命令）。
- **平台**：终端启动逻辑因操作系统而异（Windows / macOS / Linux），需要按平台分别处理并提供优雅降级；Windows 使用用户配置的 PowerShell 路径。
- 对现有 `hello`、`read`、`write` 功能无破坏性变更。
