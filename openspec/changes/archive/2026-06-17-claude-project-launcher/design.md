## 背景（Context）

这是一个使用 Vue 3 + Vite 构建的 uTools 插件。uTools 插件通过挂载在 `window.services` 上的 CommonJS 预加载脚本（`public/preload/services.js`）向渲染层暴露 Node.js 能力；渲染层处于沙箱中，只能通过该桥接以及 `window.utools` API 访问文件系统和操作系统。功能在 `public/plugin.json` 中声明，`src/App.vue` 依据 `utools.onPluginEnter` 返回的 `action.code` 路由到对应视图组件。

Claude Code 将每个项目的会话数据存储在 `~/.claude/projects/<encoded>` 下，其中 `<encoded>` 是把项目工作目录的路径分隔符与盘符冒号替换为 `-` 后得到的名称（实测：`D:\code\utools\claudecode\claude` → `D--code-utools-claudecode-claude`）。每个项目目录内是会话文件（`*.jsonl`），每个会话一份。该编码是**有损的**：原始路径段中若本身包含 `-`，则与分隔符无法区分，因此仅靠字符串替换无法可靠地从编码目录名还原真实路径。

## 目标 / 非目标（Goals / Non-Goals）

**目标（Goals）：**
- 列出 `~/.claude/projects` 下的每个 Claude Code 项目，并按最近使用时间排序。
- 可靠地解析出每个项目的真实工作目录路径与便于阅读的显示名称。
- 快速搜索 + 完整键盘导航（方向键、回车）。
- 一键启动：在项目目录打开终端并运行可配置命令（默认 `claude`），在 Windows、macOS、Linux 上均可工作。
- 在多次会话间持久化用户设置（启动命令、终端偏好）。

**非目标（Non-Goals）：**
- 编辑、创建或删除 Claude Code 项目/会话。
- 解析或预览会话内容/历史。
- 管理 Claude Code 的安装或认证。
- 在插件内嵌入终端（我们启动的是系统终端）。

## 决策（Decisions）

### 决策：从会话文件内容解析工作目录，而非解码目录名
由于目录名编码有损，项目真实路径的可靠来源是其会话 `*.jsonl` 文件内部记录的 `cwd` 字段。我们读取最新会话文件的首行 JSON 并使用其中的 `cwd`。仅当没有任何会话文件能给出可用的 `cwd` 时，才退回到对目录名的尽力解码（启发式替换 `-`），并将此类条目标记为低置信度。
- *已考虑的替代方案*：纯字符串解码目录名 —— 因路径含连字符时存在歧义、不可靠而被否决。

### 决策：以最新会话文件的修改时间作为最近使用时间
将每个项目的最近使用时间计算为其会话文件 `mtimeMs` 的最大值（对每个文件执行 `fs.statSync`）。若项目没有会话文件，则退回到目录自身的 `mtimeMs`。按降序排序。
- *已考虑的替代方案*：解析会话 JSON 中的时间戳 —— 更精确，但更慢且需读取文件正文；修改时间已足够，且成本低。我们只需读取最新文件的正文（用于获取 `cwd`），其余文件仅 stat 即可。

### 决策：预加载服务接口
在 `window.services` 中新增函数：
- `listClaudeProjects()` → 返回 `[{ id, dirName, cwd, displayName, recency, available }]`，在预加载（Node）层完成解析与排序，让渲染层保持简单。
- `launchProject(cwd, command, options)` → 在 `cwd` 处启动操作系统终端并运行 `command`，`options` 含 Windows 的 `powershellPath` 等启动参数。
理由：将所有 `node:fs`/`node:os`/`node:child_process` 访问集中在 CommonJS 预加载层（唯一可用 Node API 的地方），向 Vue 仅返回可序列化的纯数据。

### 决策：按操作系统区分终端启动策略
- **Windows**：使用用户配置的 PowerShell 可执行文件路径（`powershellPath`，默认探测 `pwsh.exe`/`powershell.exe`）启动终端，先 `Set-Location` 进入 `cwd` 再运行命令；未配置时回退到系统默认 PowerShell。
- **macOS**：通过 `osascript` 调用 AppleScript 打开 Terminal.app（或所选的 iTerm），在 `cwd` 运行命令。
- **Linux**：按顺序尝试常见终端模拟器（如 `x-terminal-emulator`、`gnome-terminal`、`konsole`），配合相应的 `--working-directory` / `-e` 参数。
使用 `child_process.spawn` 并传入参数数组（而非字符串拼接），同时做好引号处理，以避免来自项目路径的命令注入。将 spawn 错误回传给渲染层。
- *已考虑的替代方案*：使用单一跨平台终端库依赖 —— 为保持插件依赖精简而否决；原生命令已覆盖目标平台。

### 决策：新增 Vue 视图 + 插件功能，沿用既有结构
新增 `src/ProjectLauncher/index.vue`（`ccstart` 功能）与 `src/LauncherConfig/index.vue`（`ccstartconf` 配置功能），在 `plugin.json` 中分别注册，并在 `App.vue` 中按 `action.code === 'ccstart'` / `=== 'ccstartconf'` 增加路由分支。这与既有的 `read`/`write`/`hello` 模式一致，使本次变更与代码库保持协调。

### 决策：通过独立配置功能 + uTools 存储持久化设置
配置入口为独立的 `ccstartconf` 功能（而非内嵌在启动器列表里），使用 `utools.dbStorage`（或 `utools.db`）存储 `{ launchCommand, powershellPath }`。默认值：`launchCommand = "claude"`，`powershellPath = 平台默认 PowerShell（仅 Windows 使用）`。启动器在启动时读取这些设置。
- *已考虑的替代方案*：把设置内嵌在启动器界面 —— 改为独立指令，便于直接呼出配置且让启动器界面保持专注。

## 风险 / 权衡（Risks / Trade-offs）

- **目录名编码有损** → 缓解：从会话文件的 `cwd` 字段推导工作目录；仅在必要时退回启发式解码并标记低置信度。
- **终端启动因操作系统/模拟器未安装而不同（尤其 Linux）** → 缓解：按优先级探测一组模拟器，允许用户配置终端，全部失败时给出清晰错误而非静默失败。
- **通过构造的项目路径/命令进行命令注入** → 缓解：使用 `spawn` 配合参数数组与适配操作系统的引号处理；绝不将原始路径插入 shell 字符串。
- **项目/会话文件过多导致列表变慢** → 缓解：仅 stat 文件而不读正文（只读取最新一个文件正文以获取 `cwd`）；相关工作在预加载层执行，不在渲染路径上。
- **`claude` 不在所启动终端的 PATH 中** → 缓解：启动命令可由用户配置；文档说明它必须能在终端 shell 中被解析到。

## 迁移方案（Migration Plan）

纯增量变更 —— 无需迁移。新增的 `ccstart` 与 `ccstartconf` 功能独立于既有的 `hello`/`read`/`write` 功能。回滚只需移除这两个功能项、视图组件、`App.vue` 中的分支以及新增的预加载函数。

## 待解决问题（Open Questions）

- Windows 上是否需要在 `pwsh.exe`（PowerShell 7+）与 `powershell.exe`（Windows PowerShell 5.1）之间自动探测优先级，还是完全交由用户在 `ccstartconf` 中配置路径？
- 对于 Linux，首个版本可接受支持的终端模拟器最小集合是什么？
- 不可用项目（工作目录缺失）默认应隐藏，还是灰显展示？（当前规格为标记为不可用并展示。）
