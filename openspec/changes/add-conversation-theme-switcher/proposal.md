## Why

历史会话详情目前只有一套固定的默认风格：它由全局 CSS 变量（`--card-bg`/`--text-primary`/`--primary-color` 等）、组件内大量**硬编码配色**，以及 `@media (prefers-color-scheme: dark)` 的自动明暗共同拼成。用户希望像「阅读器换肤」一样，在会话详情里自由切换多种配色风格，以适配不同光线、护眼与个人偏好。

现有唯一的「主题」能力是全局主色取色（`theme-config`），只改 `--primary-color` / `--primary-hover`，无法满足「整套阅读皮肤」的诉求。

## What Changes

- 在会话详情的筛选/搜索条（`ph-filterbar`）右侧、查找与提问导航（`ph-qnav`）之后，新增一个**主题图标按钮**。
- 点击弹出**主题下拉**：纵向预览行——每行是该主题**真实配色的迷你对话预览** + 主题名 + 当前选中标识（不是纯文字选项）。
- 内置 **6 个主题**：跟随系统（默认）、经典浅色、暗夜、护眼·米黄、海洋·靛青、森林·墨绿。切换**即时重渲染**。
- 作用域限定在**右侧详情面板**（`.ph-right`，含详情头、筛选条、对话/记忆滚动区）：通过 `data-theme` 属性驱动，**顶栏与左列不变**。
- 每个主题以一组 **CSS 变量种子**（~13 个 seeds）定义；其余颜色（各类型 tint、diff、行内代码底、表格斑马纹、选中软底等）用 `color-mix` 从种子**派生**，并据此**移除** `@media dark` 中整段 tint 覆盖。
- 「跟随系统」**不设任何变量** → 继承 `:root` + `@media` 自动明暗；其预览按 `matchMedia` 解析为浅/深。
- 选择**持久化**（`utools.dbStorage` 独立键），重进插件自动恢复；默认「跟随系统」→ **老用户外观零变化**。

## Capabilities

### New Capabilities
- `conversation-theme`: 会话详情阅读皮肤——主题按钮 + 配色预览下拉 + 6 套以 CSS 变量种子定义的皮肤，作用于右侧详情面板，支持即时切换与持久化；「跟随系统」随 OS 明暗自适应，命名皮肤对 OS 暗色绝对优先。

### Modified Capabilities
- `project-history-viewer`: 会话详情筛选条新增主题入口按钮；右侧详情面板 `.ph-right` 承载 `data-theme`；详情内一批硬编码配色提升为 CSS 变量种子并由 `color-mix` 派生。

## Impact

- **修改组件**：`src/ProjectHistory/index.vue`——filterbar 增加主题按钮与下拉预览；`<style>` 内硬编码色 → 变量种子 + `color-mix` 派生；新增 6 套 `[data-theme]` 规则；`.ph-right` 绑定 `data-theme`。
- **主题工具**：新增 `src/theme-skins.ts`（皮肤清单 `{id,name}` + 读写封装），与现有 `src/theme.ts`（全局主色）并列、互不干涉。
- **预加载层**：`public/preload/services.js` 新增 `getReadingSkin()` / `setReadingSkin(id)`，使用**独立 dbStorage 键**，不与 `primaryColor` 相互覆盖。
- **运行时前提**：依赖 `color-mix()`（Chromium ≥111）——已确认本仓库 `ThemeConfig`/`LauncherConfig`/`CommandManage` 在产线使用，无需回退方案。
- **兼容性**：默认「跟随系统」继承现有 `:root` + `@media`，对既有用户外观零变化；经典浅色 = 今日 `:root`，暗夜 = 今日 `@media dark` 固化为显式可选项。
- **测试**：为 `getReadingSkin`/`setReadingSkin` 的校验与默认值补单元测试（Node `--test`）。

## Non-goals

- 不做主题的自定义编辑/取色（沿用现有全局主色 `theme-config` 作为独立轴）。
- 不为每套命名皮肤再分明暗变体（仅「跟随系统」随 OS）。
- 不改顶栏、左列、终端按钮等作用域外的配色。
- 不引入主题切换的动画/过渡（即时切换）。
