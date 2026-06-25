## Why

项目列表目前只能"启动"项目,无法回看该项目积累的上下文。Claude Code 已在每个项目的 `~/.claude/projects/<dir>/` 下沉淀了大量资产——历史会话(`*.jsonl`)与项目记忆(`memory/*.md`),但用户只能去文件系统里翻原始 jsonl,既看不懂也用不上。我们要把这些资产在插件里可视化,并支持一键回到终端恢复会话、导出会话内容。

## What Changes

- 项目列表每一行右侧新增一个**时间图标按钮**,点击进入该项目的"历史"页面(列表视图与历史视图在 `ProjectLauncher` 内切换,不新增 uTools 入口码)。
- 新增**历史页面**,采用左右(master-detail)布局:
  - **左侧列表**分两组展示该项目的全部资产:**记忆**(来自 `memory/MEMORY.md` 与 `memory/*.md`)与**历史会话**(来自 `*.jsonl`),可经 uTools 搜索框过滤。
  - **右侧内容**按所选节点渲染:选中记忆→渲染该 markdown;选中会话→**按记录类型分样式**重建对话(用户、助手正文、思考、工具调用、工具结果、系统提示等各有样式,元数据记录默认隐藏)。
- 选中会话时,右侧提供 **恢复会话**(在终端执行 `claude --resume <sessionId>`)与 **导出会话**(导出为 Markdown 对话稿)。
- 预加载层(`window.services`)新增只读数据接口:列举/读取项目会话与记忆、解析单个会话、恢复会话、导出会话。所有接口复用现有的 `dirName` 路径越界校验。

## Capabilities

### New Capabilities
- `project-history-viewer`: 项目历史页面——左右布局浏览某项目的记忆与历史会话,右侧按会话记录类型分样式渲染对话,并支持恢复会话与导出会话内容。

### Modified Capabilities
- `project-launcher`: 项目列表每行新增时间图标入口按钮,点击进入该项目的历史页面;并管理"列表↔历史"视图切换与 uTools 搜索框在两种视图下的复用。

## Impact

- **新增组件**:`src/ProjectHistory/index.vue`(历史页面,master-detail)。
- **修改组件**:`src/ProjectLauncher/index.vue`(增加 🕐 按钮、视图状态切换、搜索框生命周期管理)。
- **预加载层**:`public/preload/services.js` 新增只读接口 `listProjectSessions` / `listProjectMemories` / `readSession` / `readMemory` / `resumeSession` / `exportSession`(复用 `launchProject`、`getLauncherSettings` 与路径校验)。
- **依赖**:新增一个运行时依赖 `marked` 用于 markdown 渲染(项目此前仅依赖 `vue`)。
- **数据**:全部**只读**访问 `~/.claude/projects/<dir>/` 下的 `*.jsonl` 与 `memory/`,不修改用户的会话与记忆文件。
- **测试**:`test/` 下为新增预加载接口补充解析/格式化的单元测试(Node `--test`)。
