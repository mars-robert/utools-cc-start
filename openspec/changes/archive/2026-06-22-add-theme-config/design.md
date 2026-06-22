## Context

主题色目前在 `src/styles/variables.css` 中以静态 CSS 自定义属性硬编码：`--primary-color: #4f8cff` 与 `--primary-hover: #3d7ae8`。这两个变量被全局组件引用——导航激活态（`UnifiedConfig`）、主按钮（`main.css` 的 `.btn-primary`）、列表选中态与单选控件（`LauncherConfig`）、聚焦边框等。当前没有任何运行时主题机制，颜色无法由用户调整。

持久化基础设施已经存在：渲染层通过 `window.services`（`public/preload/services.js`）访问 uTools `dbStorage`，现有启动器/命令配置均沿用此模式。应用入口为 `src/App.vue`，根据 uTools `onPluginEnter` 的 `action.code` 路由到不同页面。

约束：
- 主题必须对所有插件页面（ccstart / ccstartconf / ccrun）生效，而非仅配置页。因此主色必须在应用挂载早期写入 `:root`。
- 不引入第三方依赖（项目仅依赖 vue + vite）。
- 暗色模式由 `@media (prefers-color-scheme: dark)` 驱动；主色在明暗模式下共用同一值（与现状一致，现状下 `--primary-color` 在暗色模式未被覆盖）。

## Goals / Non-Goals

**Goals:**
- 用户可在预设蓝色系配色中一键切换主色。
- 用户可通过原生色彩盘自定义任意主色。
- 主色变更即时反映到全部引用主色的界面元素。
- 选择持久化，重进插件自动恢复；支持恢复默认。

**Non-Goals:**
- 不做整套配色系统的可配置化（文字色、背景色、边框色等不在范围内）。
- 不做明暗模式的独立主色配置（明暗共用一个主色）。
- 不做多套命名主题的保存/管理（仅「当前主色 + 预设快捷选择」）。
- 不引入颜色处理库；派生悬停色用最小内联算法。

## Decisions

### 决策 1：以运行时覆盖 `:root` 上的 `--primary-color` 实现主题应用
在应用启动时（`App.vue` 的 `onMounted`，早于任何页面渲染）从持久化读取主色，若存在则通过 `document.documentElement.style.setProperty('--primary-color', color)` 写入；同时派生并写入 `--primary-hover`。`variables.css` 保留默认值作为未覆盖时的回退。

- **为什么**：所有组件已经引用 `var(--primary-color)`，覆盖根变量即可零侵入地让全部引用点联动更新，无需改动各组件。
- **备选**：为每个组件传 prop 或注入 class——侵入性大、易遗漏，否决。

### 决策 2：硬编码引用点统一收敛到变量
现有代码存在少量硬编码主色字面量（如 `LauncherConfig` 的 `.radio-item.selected` 用 `rgba(79, 140, 255, 0.08)`、`.badge` 用 `#e8f0ff`，`main.css` 的 `--blue: rgb(88, 164, 246)`）。这些不会随主色变化。

- **决定**：将明显属于「主色派生」的硬编码（选中底色、badge 底色）改为基于 `--primary-color` 的 `color-mix()` 或半透明叠加，使其跟随主题；`main.css` 的 `--blue`（仅作用于裸 `button` 默认背景，配置页未使用）本次不动，避免扩大改动面，仅在 design 中记录。
- **为什么**：保证「列表选中、按钮」这两个用户明确点名的目标确实整体换色。
- **权衡**：`color-mix()` 需较新内核；uTools 基于 Electron/Chromium，版本足够新，可用。若担心兼容，回退方案是用固定透明度的 `rgba` 叠加在主色上（通过额外变量 `--primary-soft`）。

### 决策 3：悬停色自动派生，不让用户单独设置
`--primary-hover` 由主色按固定比例加深得到（例如在 HSL 上降低亮度约 8%，或与黑色 `color-mix` 约 12%）。

- **为什么**：用户点名的是「主题颜色」，单一主色输入体验最简单；双色输入属于过度配置（违反简洁优先）。
- **实现**：preload 或渲染层提供一个纯函数 `deriveHover(hex)`，便于单元测试。

### 决策 4：预设色取自蓝色同色域
默认主色 `#4f8cff` 的 HSL 约为 H=219°。预设取同一/邻近色相、不同明度与饱和度的若干蓝，外加默认色本身，形成「同色域下不同颜色」的预设组。具体取值在 tasks 实现时定为一个常量数组（约 5–6 个）。

- **为什么**：满足「按照当前主题同色域下的不同颜色设置为默认主题」的要求。

### 决策 5：持久化结构与接口
在 `services.js` 新增独立存储键（如 `cctheme.settings`），结构 `{ primaryColor: string | null }`，`null`/缺省表示用默认。新增 `window.services.getThemeSettings()` / `setThemeColor(hex)` / `resetTheme()`。

- **为什么**：与现有 `ccstart.settings`、`ccrun.*` 键并列，模式一致，互不耦合。
- **校验**：写入前校验 `hex` 为合法 `#RRGGBB`，非法则忽略。

## Risks / Trade-offs

- [启动闪烁：默认色先渲染再被覆盖] → 在 `App.vue` 挂载早期（`onMounted` 顶部，渲染页面前）同步读取并应用；uTools `dbStorage` 为同步 API，读取开销极小，肉眼基本不可见。
- [`color-mix()` 兼容性] → uTools Chromium 版本支持；若不支持则回退到预生成的半透明叠加变量方案（design 决策 2 已备）。
- [硬编码主色残留导致换色不彻底] → 实现阶段全局检索主色字面量（`4f8cff` / `79, 140, 255` / `e8f0ff` / `3d7ae8`）逐一收敛或记录豁免，纳入 tasks 验证步骤。
- [明暗模式下自定义浅色主色对比度不足] → 属用户自选范围，不做强制约束；保持与现状一致（不干预可读性）。

## Migration Plan

无数据迁移。新增存储键，缺省即默认主题，对既有用户透明。无需回滚策略；如需回滚，移除 `App.vue` 的应用逻辑后界面回到静态默认色。

## Open Questions

- 预设颜色的最终取值与数量（5 个还是 6 个）——在 tasks 实现时确定，不阻塞设计。
- 是否在面板内额外提供十六进制手动输入框（除色彩盘外）——倾向提供，作为色彩盘的补充展示/编辑，最终在实现时定。
