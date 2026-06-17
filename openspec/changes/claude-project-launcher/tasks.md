## 1. 插件功能注册

- [x] 1.1 在 `public/plugin.json` 中新增 `ccstart` 功能项，设置 `code: "ccstart"`、`explain` 及指令关键字（如 `ccstart`、`cc`、`项目`）
- [x] 1.2 在 `public/plugin.json` 中新增 `ccstartconf` 配置功能项，设置 `code: "ccstartconf"`、`explain` 及指令关键字（如 `ccstartconf`、`配置`）
- [ ] 1.3 在 uTools 开发模式中验证两个新功能均出现，且不破坏既有的 `hello`/`read`/`write` 功能

## 2. 预加载服务（Node 层）

- [x] 2.1 在 `public/preload/services.js` 中新增解析项目目录的辅助函数：`path.join(os.homedir(), '.claude', 'projects')`，并在目录不存在时安全返回空结果
- [x] 2.2 实现从最新会话 `*.jsonl` 文件读取项目工作目录 `cwd`（解析首行 JSON 的 `cwd` 字段），并以启发式目录名解码作为带标记的回退方案
- [x] 2.3 实现最近使用时间计算：取会话文件 `mtimeMs` 的最大值，无会话文件时回退到项目目录自身的 `mtimeMs`
- [x] 2.4 实现 `listClaudeProjects()`，返回排序后的 `{ id, dirName, cwd, displayName, recency, available }` 数组（available = 工作目录存在），按最近使用时间降序排序
- [x] 2.5 实现 `launchProject(cwd, command, options)`，按操作系统分派终端启动，使用 `child_process.spawn` 配合参数数组（不做 shell 字符串拼接）
- [x] 2.6 新增 Windows 终端启动：使用 `options.powershellPath`（默认探测 `pwsh.exe`/`powershell.exe`）打开 PowerShell，先 `Set-Location` 进入 `cwd` 再运行命令
- [x] 2.7 新增 macOS 终端启动，通过 `osascript`（Terminal.app，可选 iTerm）在 `cwd` 运行命令
- [x] 2.8 新增 Linux 终端启动，按优先级探测模拟器列表（如 `x-terminal-emulator`、`gnome-terminal`、`konsole`），配合工作目录 + 执行参数
- [x] 2.9 确保 `launchProject` 返回成功/错误结果，使渲染层能报告失败而非静默失败

## 3. 设置持久化

- [x] 3.1 使用 `utools.dbStorage` 新增 `{ launchCommand, powershellPath }` 的加载/保存辅助函数
- [x] 3.2 首次使用时应用默认值（`launchCommand = "claude"`、Windows 默认 PowerShell 路径）

## 4. 启动器视图（ccstart）

- [x] 4.1 创建 `src/ProjectLauncher/index.vue`，接收 `enterAction` prop，沿用既有组件模式
- [x] 4.2 挂载时调用 `window.services.listClaudeProjects()`，渲染包含显示名称 + 工作目录路径的列表
- [x] 4.3 按规格渲染空状态与“目录未找到”提示
- [x] 4.4 新增搜索框，按显示名称或路径过滤，同时保持最近使用时间排序
- [x] 4.5 新增键盘导航（上/下移动高亮，回车启动）及鼠标点击启动
- [x] 4.6 将不可用项目（工作目录缺失）灰显，并阻止其启动且给出说明
- [x] 4.7 激活时读取已保存设置并调用 `window.services.launchProject(cwd, launchCommand, { powershellPath })`，呈现任何返回的错误

## 5. 配置视图（ccstartconf）

- [x] 5.1 创建 `src/LauncherConfig/index.vue`，加载并展示当前的 PowerShell 路径与自定义命令设置
- [x] 5.2 提供编辑 PowerShell 可执行文件路径与自定义启动命令的输入项，并通过存储辅助函数保存
- [x] 5.3 保存后给出成功提示；为 PowerShell 路径提供基本校验（如文件是否存在）

## 6. 路由

- [x] 6.1 在 `src/App.vue` 中导入 `ProjectLauncher` 与 `LauncherConfig`，并新增 `v-if="route === 'ccstart'"` 与 `v-if="route === 'ccstartconf'"` 分支传入 `enterAction`

## 7. 验证

- [x] 7.1 运行 `npm run build`，确认无错误编译通过
- [ ] 7.2 在 uTools 开发模式中打开 `ccstart` 功能，确认项目列表、按最近使用时间排序、搜索/键盘导航均正常
- [ ] 7.3 在 `ccstartconf` 中配置 PowerShell 路径与自定义命令并保存，确认持久化生效
- [ ] 7.4 确认启动项目时使用配置的 PowerShell 路径在正确目录打开终端并运行自定义命令
- [ ] 7.5 确认关闭并重新打开插件后设置仍然保留
- [ ] 7.6 确认在 `~/.claude/projects` 缺失/为空以及项目工作目录已不存在时均能优雅处理
