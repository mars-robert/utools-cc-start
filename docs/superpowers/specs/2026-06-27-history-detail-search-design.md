# 设计：历史详情页内查找（VS Code 风格）

日期：2026-06-27
状态：已确认，待落实现计划

## 1. 背景与目标

历史详情页（`src/ProjectHistory/index.vue`）右侧把一个会话渲染成对话流（markdown → `v-html`）。会话动辄数十上百条消息，目前只能靠「提问导航」在用户提问间跳转，**无法在正文里按关键词查找**。

目标：在详情页加入 **VS Code 风格的页内查找**——
- `Ctrl/Cmd+F` 打开，或点击「提问上下按钮左侧」的搜索图标打开；
- 浮于详情区右上角的查找框：输入框 · `当前/总数` 计数 · 上一个/下一个 · `Aa` 区分大小写 · 全字匹配 · `.*` 正则 · 关闭；
- 高亮全部匹配、当前项强调、可逐个跳转并居中滚入视口。

非目标：
- 不做「替换」。
- 不改动会话解析、记忆、导出、实时刷新等既有逻辑（仅复用/接线）。
- 不跨会话/跨项目搜索（仅当前打开的会话）。

## 2. 关键约束（源于代码现状）

1. **折叠内容不在 DOM 中**：`思考`、`工具调用` 详情用 `v-if="isOpen(...)"`，折叠时未渲染。要高亮折叠块内的匹配，必须先展开它进 DOM。
2. **正文是 `v-html` 渲染的 markdown**：Vue 不 diff `v-html` 内部，但绑定字符串变化时会整体重设 `innerHTML`，抹掉注入的高亮 → 选用不改 DOM 的高亮方案。
3. **实时刷新会重渲染**：轮询命中变更后 `sessionDetail` 更新，高亮/Range 失效，需重新应用。
4. **筛选胶囊隐藏整类块**（`visibleKinds`，亦 `v-if`）：被隐藏的类别不在 DOM 中。
5. **已有全局快捷键**（`onKeydown`, index.vue:865）：`Esc`→返回列表、`↑/↓`→切换列表项。查找框打开时必须拦截，并新接 `Ctrl/Cmd+F`。

## 3. 已确认的产品决策

- **折叠命中**：跳转到某匹配时，若它在折叠的思考/工具块内，**自动展开该块**。
- **功能完整版**：含区分大小写、全字匹配、正则三个开关。
- **查找框位置**：浮于详情区右上角（VS Code 位置）。
- **关闭即复原**：关闭查找时，把「仅为搜索而自动展开的块」**复原折叠**，搜索不永久改变视图。
- **尊重筛选**：被筛选胶囊隐藏的类别**不参与搜索**（需先取消隐藏才可搜）。

## 4. 高亮机制选型

选 **CSS Custom Highlight API**：用 `Range` 框住匹配文本节点，注册 `Highlight` 对象，靠 `::highlight(ph-find)` / `::highlight(ph-find-current)` 上色。**不改 DOM**，与 `v-html` 零冲突；大会话性能好。需 Chromium ≥105，uTools/Electron 满足。

被否方案：
- `<mark>` 包裹——要往 `v-html` 内部插节点，清理/重应用脆弱，重渲染即被抹。
- 仅数据层匹配 + 滚动到块（复用 `blk-flash`）——无逐词高亮与块内计数，不符合「类似 VS Code」。

兜底：运行时检测 `typeof CSS !== 'undefined' && CSS.highlights && window.Highlight`；不支持则查找图标隐藏、`Ctrl+F` 不拦截（交还浏览器原生查找）。预期 Electron 环境恒支持，此分支仅为防御。

## 5. 架构与模块边界

为避免再撑大 2453 行的 `index.vue`，按职责拆三层：

- **`src/ProjectHistory/find-core.cjs`（纯函数，可单测）**
  - `compileQuery(query, { caseSensitive, wholeWord, useRegex }) → { re: RegExp|null, error: string }`：字面量转义 / 正则编译 + 大小写、全字（`\b…\b`）标志；非法正则返回 `error`。
  - `findInText(text, re) → Array<[start, end]>`：对单段文本求所有匹配区间（处理零宽匹配防死循环）。
  - 采用 CommonJS，沿用 `public/preload/active-sessions.cjs` 同款模式，使 `node --test` 能直接 `require`。
- **`src/ProjectHistory/useFind.ts`（composable，DOM/交互）**
  - 入参：`{ scrollEl, getBlocks, isKindVisible, ensureExpanded, collapse }`。
    - `getBlocks()`：返回当前 `sessionDetail.value?.blocks`。
    - `isKindVisible(kind)`：复用组件 `visibleKinds`，过滤被筛选隐藏的类别。
    - `ensureExpanded(blockIndex)` / `collapse(blockIndex)`：组件提供，按块类型映射展开键（`'t'+i` / `'tu'+i`）并增删 `expandedKeys`，同时由 composable 记录 `autoExpandedKeys` 以便复原。
  - 出参（reactive）：`visible, query, caseSensitive, wholeWord, useRegex, count, current, invalid`。
  - 方法：`open(prefill?)、close()、next()、prev()、refresh()`。
- **`index.vue`**：仅接线——`Ctrl/Cmd+F` → `find.open()`；`.ph-qnav` 左侧搜索图标 → `find.open()`；渲染查找框并绑定 composable 状态；在 `onKeydown` 顶部按 `find.visible` 拦截 `Esc`/方向键并新增 `Ctrl/Cmd+F` 分支；`refreshSession` 成功重渲染后调 `find.refresh()`。

## 6. 搜索流程

输入/选项变化 → 防抖 ~120ms → `run()`：
1. `compileQuery`；非法正则置 `invalid=true`、清空高亮、计数 0、输入框标红。
2. **数据层预扫**：遍历 `getBlocks()`，跳过 `!isKindVisible(block.kind)` 的块；对块的可搜文本（正文 `text`；工具块含 `name`/`input` 摘要/`result.text`）用 `re` 测试，得命中块下标集合 `hitBlocks`。
3. **同步展开状态**：`hitBlocks` 中折叠的块 → `ensureExpanded` 并记入 `autoExpandedKeys`；`autoExpandedKeys` 中已不在 `hitBlocks` 的 → `collapse` 复原。
4. `await nextTick()`（命中块内容已入 DOM）。
5. **建 Range**：以 `scrollEl` 为根做 `TreeWalker` 遍历文本节点（天然只含 DOM 中存在、即可见且已展开的内容），对每个文本节点 `findInText` 建 `Range`，按文档序收集到 `ranges`。
6. **注册高亮**：`CSS.highlights.set('ph-find', new Highlight(...nonCurrent))` 与 `'ph-find-current'`（当前项）。`count = ranges.length`，`current` 夹紧到 `[0, count)`，滚动当前项居中。

`next()/prev()`：仅改 `current` 与两个 Highlight 的成员、滚动居中，**不重建 Range**（DOM 未变时有效）。

滚动居中：`const r = range.getBoundingClientRect(), c = scrollEl.getBoundingClientRect(); scrollEl.scrollTop += (r.top - c.top) - (c.height - r.height)/2`，对零尺寸 Range 跳过。

## 7. 交互细节

- **打开**：`Ctrl/Cmd+F` 拦截默认行为，`open()` 置 `visible=true` 并聚焦输入框；若窗口有选区文本则预填并全选。
- **键盘**（输入框聚焦时）：`Enter`→`next()`，`Shift+Enter`→`prev()`，`Esc`→`close()`。
- **全局 `onKeydown` 改造**：函数体顶部 `if (find.visible.value) { 仅处理 Esc=close，吞掉 ↑/↓ ; return }`；并在选区外新增 `if ((e.ctrlKey||e.metaKey) && e.key==='f') { e.preventDefault(); find.open(); return }`。仅当 `selected.type==='session'` 时启用查找（记忆详情不接）。
- **关闭**：清空两个 Highlight、`collapse` 掉所有 `autoExpandedKeys`、`visible=false`。
- **实时刷新**：`refreshSession` 重渲染后若 `find.visible` 为真则 `find.refresh()`（重跑 2–6 步），尽量保留 `current`（按序号夹紧）。
- **切换会话**：`selectSession` 中 `find.close()` 复位。
- **空查询**：清高亮、计数 `0/0`、复原 auto-expand。

## 8. 查找框 UI

浮层 `.ph-find`，`position:absolute` 于 `.ph-right`（或详情滚动区）右上，`z-index` 高于内容、不遮挡滚动。结构：
- 输入框（`invalid` 时标红）；
- 计数 `current+1/count`（`count===0` 显 `0/0` 或「无结果」）；
- 上一个 / 下一个（复用现有 caret 图标）；
- 三个切换：`Aa`（区分大小写）、全字、`.*`（正则），`on` 态高亮；
- 关闭 `✕`。
配色复用现有 CSS 变量（`--border-color`、`--card-bg`、`--text-*` 等）。`::highlight` 颜色：全部匹配淡黄、当前项橙色，深浅色主题各给一档。

搜索图标按钮加在 `.ph-qnav` 内、两个 `.ph-qbtn` 左侧，复用 `.ph-qbtn` 样式 + 放大镜图标，`title="查找 (Ctrl+F)"`。

## 9. 测试

- **单测**（`test/history-find-core.test.cjs`，沿用迷你骨架 `test()/assertEquals()`）：
  - `compileQuery`：字面量转义（`a.b` 不当通配）、大小写标志、`wholeWord` 加 `\b`、正则模式直通、非法正则返回 `error`。
  - `findInText`：多匹配区间、大小写敏感/不敏感、全字边界、零宽/空匹配不死循环、无匹配返回空。
- **手动验证**（`npm run build` 后实际运行）：打开会话 `Ctrl+F`；输入关键词看全部高亮 + 计数；上一个/下一个居中跳转；命中折叠块时自动展开；关闭后该块复原折叠；切到正则/全字/大小写开关行为正确；非法正则标红；实时刷新会话搜索态不丢；筛选隐藏的类别搜不到。

## 10. 已知限制

- 源文本（markdown 标记）与渲染后可见文本可能不一致：高亮以**渲染后可见文本**为准（用户所见即所搜）；预扫用源文本，偶发「预扫判命中但 DOM 无对应高亮」→ 仅多展开一个块，无害。
- 跨多个 DOM 文本节点（被 `<code>`、`<strong>` 等切断）的匹配不跨节点拼接，可能漏掉横跨行内标签的极少数匹配（与浏览器原生查找同等局限）。
- 依赖 CSS Custom Highlight API；不支持的环境降级为浏览器原生查找（见 §4 兜底）。
