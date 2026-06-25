## Context

uTools 插件,Vue 3 + TS(`<script setup>`),**无前端路由**:`App.vue` 仅按 uTools 入口码(`ccstart`/`ccstartconf`/`ccrun`)切换顶层组件。渲染层无 Node 能力,一切文件/进程操作走 `public/preload/services.js` 暴露的 `window.services.*`。

会话与记忆数据位于 `~/.claude/projects/<dir>/`:
- `*.jsonl`:每个文件一次会话,逐行 JSON。已探明的记录类型有 `user` / `assistant` / `system` / `mode` / `permission-mode` / `attachment` / `file-history-snapshot` / `last-prompt` / `ai-title` / `queue-operation`;`message.content` 内的内容块有 `text` / `thinking` / `tool_use` / `tool_result`。`ai-title` 记录含 `aiTitle`(AI 生成的会话标题,会话推进时追加多条,**最后一条为当前标题**)。记录普遍带 `cwd`/`gitBranch`/`version`/`timestamp`/`uuid`/`parentUuid`/`isSidechain`/`isMeta`。
- `memory/`:`MEMORY.md`(索引)+ 若干 `*.md` 条目,每条含 frontmatter(`name`/`description`/`metadata.type`/`metadata.originSessionId`)与 markdown 正文。

现有基建可复用:`launchProject(cwd, command, opts)`(终端启动,已含 Win/mac/Linux 分支)、`getLauncherSettings()`(派生终端运行时配置)、`deleteClaudeProject` 中的 `dirName` 路径越界校验、`listClaudeProjects` 中的逐行 jsonl 扫描思路。项目此前仅依赖 `vue`。

## Goals / Non-Goals

**Goals:**
- 项目列表每行提供时间图标入口,进入该项目的"历史"页面。
- 历史页面左右布局:左侧分组展示该项目的**记忆**与**历史会话**并可搜索;右侧按所选节点类型分样式渲染。
- 会话渲染按记录/内容块类型区分样式(用户、助手正文、思考、工具调用、工具结果、系统),元数据记录默认隐藏。
- 选中会话支持**恢复会话**(终端 `claude --resume <id>`)与**导出**(Markdown 对话稿)。
- 全程只读访问用户数据,不改写会话与记忆文件。

**Non-Goals(v1 明确不做):**
- 不还原会话线程树(`parentUuid`/sidechain 嵌套),v1 按文件顺序线性渲染,子链仅以标记提示。
- 不做记忆的编辑/删除(只读渲染)。
- 不做长列表虚拟滚动(以"默认折叠重内容"替代,留二期)。
- 不做会话内全文检索(左列搜索仅匹配标题/描述)。
- 不新增 uTools 入口码。

## Decisions

### 1. 导航:`ProjectLauncher` 内视图切换,抽出 `ProjectHistory.vue` 子组件
`ProjectLauncher` 增加 `view: 'list' | 'history'` 与 `selectedProject` 状态;`view==='history'` 时渲染 `<ProjectHistory :project>`。🕐 按钮设置 `selectedProject` 并切到 history;`←`/`Esc` 返回 list。
- **理由**:历史页是"某个项目"的子视图,必须携带项目上下文;uTools 入口码从主搜索框触发、无法携带"哪个项目",故不适合用新入口码。视图状态切换与现有"单组件持有自身状态"的风格一致。
- **备选**:新增 `ccsessions` 入口码(否决:无法携带项目)、全屏 Modal 覆盖(否决:内容是一个完整页面而非弹窗)。

### 2. uTools 搜索框生命周期随视图切换
进入 history 时 `setSubInput` 改占位符为"搜索记忆或会话…"并过滤左列;返回 list 时恢复为项目搜索。两个视图各自维护 query。
- **理由**:搜索框是共享单例资源,当前仅在 `onMounted` 设置一次;视图切换必须重设回调与占位符,否则会串味。

### 3. 左列数据:两组,廉价加载
预加载新增两个只读接口:
- `listProjectMemories(dirName)` → `[{ name, description, type, originSessionId, fileName }]`,解析 `memory/*.md` 的 frontmatter(小文件,可全量)。
- `listProjectSessions(dirName)` → `[{ sessionId, title, mtime, gitBranch? }]`。标题取**最后一条 `ai-title`**;为避免全量读大文件,采用"反向/分段扫描尾部若干 KB 找最后的 `ai-title`"。标题回退链:`ai-title` → 首条真实 user 文本(过滤 `command-*`/caveat 包装)→ `会话 + 时间`。
- **理由**:列表只需摘要;会话文件可达数 MB,全量解析会卡。`mtime` 免费且与现有排序口径一致。

### 4. 右侧渲染:可读子集,类型→样式映射,点选才解析
选中会话时调用 `readSession(dirName, sessionId)` 懒加载并解析为有序消息块。渲染映射:

| 记录 / 内容块 | 样式 |
|---|---|
| `user` 消息 | 用户气泡(主色调) |
| `assistant` 的 `text` | 正文,markdown |
| `thinking` | 💭 暗色/斜体,默认折叠 |
| `tool_use` | 代码卡片:工具名 + 入参 |
| `tool_result` | 输出卡片,等宽,默认折叠 |
| `system` | 居中淡色提示 |
| `attachment`/`file-history-snapshot`/`mode`/`permission-mode`/`last-prompt`/`ai-title`/`queue-operation` | 元数据,默认隐藏 |

`tool_use` 与 `tool_result` 按 `tool_use_id` 配对呈现;`isSidechain` 记录以"↳ 子任务"标记线性插入,不做嵌套树。
- **理由**:目标是"可读回看"而非调试器;子集化大幅降低工作量且更易读。重内容默认折叠以控体量。
- **备选**:全保真还原(否决:工作量大、可读性差,留二期)。

### 5. Markdown 渲染:引入 `marked` + 输出转义
记忆正文与助手 `text` 用 `marked` 渲染;对工具结果/未知文本默认按纯文本(`<pre>`/转义)呈现。渲染 HTML 前对内容做转义/最小净化,避免 jsonl 中混入的 HTML/脚本被执行。
- **理由**:右侧是 markdown 密集场景,`marked` 体积小、API 简单。
- **备选**:手写极简渲染(否决:维护成本高、效果差)、纯文本(否决:体验差)。**权衡**:这是项目引入的唯一新运行时依赖。

### 6. 恢复会话:复用现有终端启动
渲染层调用 `getLauncherSettings()` 取终端配置,再 `launchProject(project.cwd, 'claude --resume ' + sessionId, opts)`;成功后 `outPlugin()`。
- **理由**:`sessionId` 即文件名;从项目 `cwd` 以 `--resume <id>` 启动可精确命中该会话。完全复用现有 Win/mac/Linux 启动逻辑,零新增进程代码。

### 7. 导出:Markdown 对话稿,剪贴板 + 另存
预加载 `exportSession(dirName, sessionId)` 复用右侧的"记录→Markdown"格式化逻辑,返回 markdown 字符串。渲染层提供两路出口:`utools.copyText`(复制)与 `utools.showSaveDialog` + 写文件(另存)。默认动作为复制。
- **理由**:复制零摩擦;另存满足留档。两者共用同一格式化器,无重复逻辑。

### 8. 路径安全
所有接口的 `dirName`/`sessionId`/`fileName` 复用 `deleteClaudeProject` 的越界校验(禁止 `/`、`\`、`..`,且解析后须仍位于目标目录内);`sessionId` 限定为 `*.jsonl` 文件名,记忆限定为 `memory/*.md`。

## Risks / Trade-offs

- **大会话渲染卡顿**(3MB / 2700+ 行) → 仅点选时懒解析单文件;`tool_result`/`thinking`/`attachment` 默认折叠;虚拟滚动留二期。
- **jsonl schema 跨版本漂移**(`version` 各异、老会话无 `ai-title`) → 防御式解析:未知记录类型直接跳过,标题走回退链,字段缺失不报错。
- **`marked` 渲染外部内容的 XSS** → 渲染前转义/最小净化;工具结果等不可信文本默认按纯文本呈现。
- **线程被拍平**(忽略 `parentUuid`/sidechain 嵌套) → v1 接受线性顺序 + 子链标记;若顺序错乱再引入按 `timestamp`/`uuid` 链重排。
- **800px 窗口下双栏偏窄** → 左列固定窄宽(~240–280px)+ 右侧自适应;窗口可由用户拉伸。
- **搜索框单例串味** → 在视图切换处严格重设/恢复 `setSubInput`,卸载时 `removeSubInput`。

## Open Questions

- 导出默认动作定为"复制到剪贴板",另存为次级动作——是否需要可配置默认?(暂不做)
- 记忆是否需要在二期支持就地编辑/删除?(v1 只读)
