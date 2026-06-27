# 设计：历史会话的子任务（子代理）查看与切换

日期：2026-06-27
状态：已确认，待落实现计划

## 1. 背景与问题

历史详情页（`src/ProjectHistory/index.vue`）目前只读取并渲染主会话 `<sessionId>.jsonl`。实际使用中暴露两个问题：

1. **task-notification 被误渲染为用户对话**：当主会话触发子任务（`Agent`/`Task` 工具）后，harness 会向主会话注入若干 `type:user` 的 `<task-notification>...</task-notification>` 消息（子任务完成通知）。`parseSession` 把所有 `type:user` 当成用户消息，于是这些系统通知被渲染成用户气泡。本会话实测有 9 条此类消息。
2. **子任务对话记录看不到**：Claude Code 把每个子代理的完整对话存为单独文件，位于 `<sessionId>/subagents/agent-<agentId>.jsonl`（另有同名 `.meta.json`）。主会话 jsonl 中 **不含** 这些内容（实测 `isSidechain:true` 行数为 0）。历史页 `listProjectSessions` 只列 `.jsonl` 文件、忽略子目录，因此子任务内容完全不可见。

目标：①修正 task-notification 渲染；②让用户能在历史详情页查看任意子任务的完整对话，并在主任务/子任务间切换。

非目标：
- 不改造 Claude Code 的子任务存储格式。
- 不做子任务的实时刷新（子任务运行结束才落盘，视为静态）。
- 不在主会话流里内联展开子任务内容（采用「切换器」而非内联）。

## 2. 数据模型（实测）

- 主会话：`<projectDir>/<sessionId>.jsonl`。
- 子任务目录：`<projectDir>/<sessionId>/subagents/`，每个子代理两份文件：
  - `agent-<agentId>.jsonl`：子代理完整对话，结构与主会话一致（`type` 为 `user`/`assistant`/`attachment` 等，`isSidechain:true`），可直接复用 `parseSession`。
  - `agent-<agentId>.meta.json`：`{ "agentType": "...", "description": "...", "toolUseId": "...", "spawnDepth": n }`。
- task-notification 消息：主会话中 `type:user`、文本以 `<task-notification>` 开头，内含 `<task-id>`（即 `agentId`，与子任务文件名 `agent-<agentId>` 对应）、`<summary>`、`<status>`、`<result>` 等标签。

## 3. 已确认的产品决策

- task-notification → 渲染为**紧凑、可点击的系统提示**；点击跳转到对应子任务，顶部切换器同步切换。
- 子任务列表为**扁平列表**，按生成顺序排列。
- 切换器按钮显示**当前视图名 + 下拉**；位于筛选条最左（用户胶囊左侧），仅当存在子任务时显示。
- 子任务下拉每条显示 **description + agentType + 时间**（时间取子任务 jsonl 的文件 mtime）。

## 4. 方案选型（前端如何切换视图）

选 **复用 `sessionDetail` 单一渲染模型**：用 `currentAgent`（`null`=主任务 / `agentId`=某子任务）决定数据来源，切换时只替换 `sessionDetail.value`。现有的 turns 分组、提问导航、查找、导出全部基于 `sessionDetail`，**零改动复用**。

否决：
- 为子任务另起组件/模板 → 重复那套庞大渲染逻辑。
- 把子任务内联进主会话流 → 违背「切换器」诉求且复杂。

## 5. 架构与模块边界

### 5.1 服务层（`public/preload/services.js`，复用 `parseSession`）

- `listSubagents(dirName, sessionId)`：
  - 读 `<projectDir>/<sessionId>/subagents/` 下全部 `agent-*.meta.json`；对每个解析出 `{ agentId, agentType, description, toolUseId, spawnDepth }`，并 `statSync` 对应 `.jsonl` 取 `mtime`。
  - 返回 `[{ agentId, agentType, description, toolUseId, spawnDepth, mtime }]`，按 `mtime` 升序（生成顺序）。
  - 目录不存在/坏文件安全降级：返回 `[]` / 跳过坏项。`isSafeSegment(sessionId)` 校验；`agentId` 由文件名截取并校验。
- `readSubagent(dirName, sessionId, agentId)`：
  - 校验 `isSafeSegment(sessionId)` 与 `isSafeSegment(agentId)`；读 `<...>/subagents/agent-<agentId>.jsonl` → `parseSession` → `{ blocks, meta }`；失败返回 `null`。
- 两者加入 `window.services` 导出。

### 5.2 task-notification 修复（`parseSession`）

- 新增判定 `isTaskNotification(text)`：`type:user` 文本 trim 后以 `<task-notification>` 开头。
- 命中时不产出 user 块，改产出：
  `{ kind: 'system', subtype: 'subtask_notice', text: <summary 文本>, agentId: <task-id>, ts }`，并 `meta.count++`。
  - `text` 取 `<summary>`（如 `Agent "Review Task 1 (spec + quality)" finished`），可附 `<status>`。
  - 归入 `system` 类（随「系统」筛选胶囊显隐、计数一致），但带 `subtype/agentId` 供前端特殊渲染。

### 5.3 前端（`src/ProjectHistory/index.vue`）

状态：
- `subagents = ref<any[]>([])`：当前会话子任务列表。
- `currentAgent = ref<string|null>(null)`：当前视图（null=主任务）。
- `showSubtasks = ref(false)`：切换器下拉开关。

加载与切换：
- `selectSession(s)`：原逻辑后追加 `subagents.value = window.services.listSubagents(dirName, s.sessionId) || []`；`currentAgent.value = null`；`showSubtasks.value = false`。
- `switchView(agentId | null)`：
  - 设 `currentAgent.value = agentId`；`showSubtasks.value = false`。
  - `sessionDetail.value = agentId ? window.services.readSubagent(dirName, sessionId, agentId) : window.services.readSession(dirName, sessionId)`。
  - 复位查找（`findClose()`）、滚动到顶、提问基线、`resetFilters()`、`mdCache.clear()`、清 `blockEls`。
  - 查看子任务时 `stopPoll()`（静态）；切回主任务按在线判定恢复（`startPoll()` 等，复用现有逻辑）。

切换器 UI：
- 位置：`.ph-filterbar` 最左（`.ph-chips` 之前）。仅 `subagents.length > 0` 显示。
- 按钮：图标 + 当前视图名（主任务显示「主任务」；子任务显示其 description，CSS 截断）+ caret。点击切换 `showSubtasks`。
- 下拉（复用「我的提问」面板的浮层/遮罩与定位，左对齐）：
  - 第 1 行「主任务」（显示主会话标题），点击 `switchView(null)`。
  - 其后每个子任务一行：description + agentType 小标签 + `formatTime(mtime)`；点击 `switchView(agentId)`。
  - 当前视图对应行高亮（`null`→主任务行，否则匹配 `agentId`）。

task-notification 渲染（可点击跳转）：
- `turns()` 增加分支：`b.kind==='system' && b.subtype==='subtask_notice'` → 作为独立项 `{ type:'subtask_notice', block:b, index:i }`（不并入 Claude 回合），并尊重「系统」筛选显隐（`chipVisible('system')`）。
- 模板渲染为整行紧凑通知：🔔 + 「子任务：<描述>」（描述优先用 `subagents` 里 `agentId` 对应的 description，回退 `block.text`）。
- 点击 → `switchView(block.agentId)`（若该 agentId 不在 `subagents` 列表则不可点/降级为纯展示）。因 `switchView` 改 `currentAgent`，切换器按钮与下拉高亮自动同步。

头部徽标：查看子任务时，标题旁加「子任务 · <description>」徽标（复用现有 chip 样式）。

导出：
- HTML 导出基于 DOM（`.ph-chat`），自动反映当前视图，无需改动。
- MD 导出：查看子任务时改用已加载模型 `window.services.sessionToMarkdown(sessionDetail.value, currentAgent.value)`，主任务维持原 `exportSessionToFile` 路径。

## 6. 数据流

`selectSession` → `listSubagents` + `readSession`(主) → `sessionDetail`。
切换器/点击通知 → `readSubagent`/`readSession` → 替换 `sessionDetail` → 既有渲染照常。

## 7. 测试

- **服务层单测**（沿用 `test/services-history.test.cjs` 等的迷你骨架）：
  - `parseSession` 喂含 `<task-notification>` 的 user 行 → 断言产出 `kind:'system', subtype:'subtask_notice'` 且 `agentId` 正确、**不是** user 块。
  - `listSubagents`/`readSubagent`：用临时 fixture 目录（含 `subagents/agent-x.jsonl` + `.meta.json`）→ 断言列表字段（含 mtime）与解析结果；无目录返回 `[]`；非法 `sessionId`/`agentId` 返回 `[]`/`null`。
- **手动验证**：打开本会话 → 切换器出现在最左；下拉显示主任务 + 6 个子任务（description/agentType/时间）；点子任务加载其内容、切换器同步、头部出现子任务徽标；主会话里 task-notification 不再是用户气泡而是可点击通知，点击跳到对应子任务；切回主任务恢复在线/实时；查找在子任务视图内正常工作。

## 8. 已知限制

- 子任务列表的「时间」用 jsonl 文件 mtime（最后写入≈完成时间），非精确启动时间。
- 不显示子任务运行结果/状态（避免逐个读全文）；如需可后续增强。
- 不处理子任务实时刷新（视为静态）。
- 仅识别以 `<task-notification>` 开头的注入消息；其它 harness 注入类型不在本期范围。
