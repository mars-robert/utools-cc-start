## Context

会话详情组件 `src/ProjectHistory/index.vue`（master-detail，右侧 `.ph-right` 为详情头 + 筛选条 `ph-filterbar` + 滚动区 `ph-detail-scroll`）。其视觉风格目前由三层拼成：

1. 全局调色板 `src/styles/variables.css`：`:root` 定义 `--card-bg`/`--text-*`/`--primary-color`/`--border-color`/`--bg-hover` 等，并有 `@media (prefers-color-scheme: dark)` 覆盖（即「自动暗色」）。
2. 组件内 `<style>`（约 1130 行）：大量**硬编码**配色——对话气泡、各类型胶囊 `--k-accent`/`--k-bg`、diff、行内代码、表格斑马纹、ask 卡片、工具报错红等；并在末尾用 `@media dark` 再覆盖一遍 tint。
3. 现有「主题」能力 `theme-config`：仅经 `src/theme.ts` 覆盖 `--primary-color`，持久化于 `services.js` 的 `getThemeSettings/setThemeColor`（`utools.dbStorage`，键 `THEME_KEY`，对象 `{ primaryColor }`）。

关键既有事实（已核实）：
- AI 气泡 `.chat-bubble-claude` = `var(--card-bg)`/`var(--border-color)`，markdown 代码块 `.ph-md pre` = `var(--bg-hover)`，工具结果 `.blk-pre` = `var(--card-bg)` —— **已是变量驱动，换肤免改**。
- 用户气泡 `.chat-bubble-user`、头像/名字（user 蓝 / ai 绿）、`.k-*` tint、diff、行内代码底、表格斑马纹等 —— **硬编码，需提升**。
- `.ph-detail-scroll` 无背景（透明，透出 app 底色）。
- `color-mix()` 已在 `ThemeConfig`/`LauncherConfig`/`CommandManage` 产线使用 → 运行时 Chromium ≥111，**可直接依赖**。
- `setThemeColor` 会整体改写 `THEME_KEY` 对象 → 在其上挂 `readingSkin` 会被覆盖。

## Goals / Non-Goals

**Goals:**
- 会话详情可在 ≥5 套阅读皮肤 + 「跟随系统」间切换。
- 下拉为**配色预览**（迷你对话 mock），非纯文字。
- 切换**即时**、可**持久化**、重进**恢复**。
- 作用域**仅右侧详情**，不动顶栏/左列。
- 默认「跟随系统」，OS 明暗自适应；老用户外观零变化。

**Non-Goals:**
- 不做主题自定义/取色（全局主色 `theme-config` 为独立轴，保留）。
- 命名皮肤不分明暗变体；仅「跟随系统」随 OS，命名皮肤对 OS 暗色**绝对优先**。
- 不改顶栏、左列、终端按钮等域外配色。
- 不做主题切换过渡动画。

## Decisions

### 1. 作用机制：`data-theme` 挂 `.ph-right`，属性选择器单一来源
皮肤定义为 `[data-theme="<id>"] { --seed: …; }`（**仅属性、不带 `.ph-right` 前缀**），使同一规则既作用于真实面板，也作用于下拉里的迷你预览 mock —— 零重复、预览与真实永不漂移。`.ph-right` 上 `data-theme` 由响应式 ref 绑定：`system` 时**不设属性** → 继承 `:root` + `@media`。
- 备选：`.ph-right[data-theme]` 带前缀（否决：预览 mock 在 `.ph-right` 内，需另写一套）；改 documentElement（否决：会污染顶栏/左列，违反作用域）。

### 2. 变量种子契约 + `color-mix` 派生
每个主题只声明 ~13 个**种子**实色；其余由 `color-mix(in srgb, <accent> N%, var(--card-bg))` 从种子派生。据此**删除** `@media dark` 中整段 tint 覆盖与 7 行 `.k-*` 硬编码 tint。

```
种子（每主题声明）                派生（全主题各写一次，不在主题里重复）
  --page-bg                         --k-bg          = mix(--k-accent 12%, --card-bg)
  --card-bg                         --bubble-user-bg= mix(--user-color 10%, --card-bg)
  --text-primary/secondary/tertiary --diff-add-bg   = mix(--success-color 14%, --card-bg)
  --border-color  --bg-hover        --diff-del-bg   = mix(--error-color 12%, --card-bg)
  --primary-color                   --code-inline-bg= mix(--text-primary 8%, --card-bg)
  --user-color  --ai-color          --table-stripe  = mix(--text-primary 4%, --card-bg)
  --success-color --error-color     --primary-soft  = mix(--primary-color 12%, --card-bg)
  --warn-color                      --glass-bg      = mix(--card-bg 60%, transparent)
```
`--k-accent`（7 个语义线色：蓝/绿/紫/橙/青/灰/棕）**全主题保持不变**，仅其 tint 背景随 `--card-bg` 重派生。
- 备选：每主题手写明/暗两套 tint（否决：行数爆炸、易漂移；且 color-mix 已确认可用）。

### 3. 六套皮肤色值

**中性色**

| 主题 | page-bg | card-bg | text-pri | text-sec | text-ter | border | bg-hover |
|---|---|---|---|---|---|---|---|
| 跟随系统 | *(不设 → 继承 :root / @media)* |||||||
| 经典浅色 | `#ffffff` | `#ffffff` | `#333333` | `#666666` | `#999999` | `#e0e0e0` | `#f5f5f5` |
| 暗夜 | `#1e1f23` | `#2a2a2a` | `#e0e0e0` | `#aaaaaa` | `#888888` | `#3a3a3a` | `#333333` |
| 护眼·米黄 | `#f1e7d0` | `#faf3e3` | `#5b4636` | `#7a6552` | `#a08c75` | `#e3d4b5` | `#efe4cb` |
| 海洋·靛青 | `#0e2230` | `#143042` | `#cfe6e3` | `#93b8bb` | `#6b8f93` | `#234a55` | `#1b3c49` |
| 森林·墨绿 | `#e9f0e5` | `#f6faf4` | `#2f3a2f` | `#54614f` | `#859184` | `#d6e0d0` | `#e4ece0` |

**强调/身份色**

| 主题 | primary | user | ai | success | error | warn |
|---|---|---|---|---|---|---|
| 经典浅色 | `#4f8cff` | `#4f8cff` | `#20bf6b` | `#20bf6b` | `#e53935` | `#fa8231` |
| 暗夜 | `#5b9cff` | `#6fa3f5` | `#5fcf8d` | `#5fcf8d` | `#ff6b66` | `#e0a153` |
| 护眼·米黄 | `#b6794a` | `#8a5a2b` | `#4f7a4f` | `#4f7a4f` | `#b5443a` | `#c2792a` |
| 海洋·靛青 | `#2bb3c0` | `#56b6e6` | `#45c8b0` | `#45c8b0` | `#ef6f6f` | `#e0a153` |
| 森林·墨绿 | `#3f7d52` | `#3a73b0` | `#2f7d52` | `#2f7d52` | `#b5443a` | `#c2792a` |

经典浅色 = 今日 `:root`；暗夜 = 今日 `@media dark` 固化 → 两者对既有用户零回归。

### 4. 「跟随系统」与预览
`system` 主题不设变量。其下拉预览 mock 按 `window.matchMedia('(prefers-color-scheme: dark)')` 解析为 `data-theme="dark"|"light"` 复用既有种子；监听 `change` 事件，OS 明暗切换时预览实时翻转，标签注明「跟随系统（当前：深色/浅色）」。

### 5. 持久化：独立 dbStorage 键，正交于主色
`services.js` 新增 `getReadingSkin()`（默认 `'system'`，对未知值降级为 `'system'`）/ `setReadingSkin(id)`（按已知集合校验后写**独立键** `READING_SKIN_KEY`）。不复用 `THEME_KEY`，避免与 `setThemeColor` 整体改写互相覆盖。
- 备选：挂在 `THEME_KEY.readingSkin`（否决：`setThemeColor` 会 clobber）。

### 6. 下拉布局与作用域细节
- 布局：**纵向预览行**，复用本文件已有 `ph-export-wrap`（按钮 + 遮罩 backdrop + 菜单）的下拉模式，不引入新原语。
- 背景：命名主题在 `.ph-right` 绘制 `--page-bg`；`system` 不绘制（保持透明 = 今日）。
- 身份色 **theme-tuned**（如米黄 user=棕）：身份另由头像「我/AI」与名字「用户/Claude」承载，不靠颜色单独区分，故重染安全且更具皮肤一致性。
- 记忆详情同处 `.ph-right`，主题一并生效；主题按钮仅出现在会话筛选条（记忆视图无筛选条），符合现状。

## UI 效果与主题差异

**可视产物**：`preview.html`（与本设计同目录，自含；`! start openspec/changes/add-conversation-theme-switcher/preview.html` 或双击打开）。它用真实 `color-mix` + 种子，把同一段对话在 6 套皮肤下并排渲染——已用 headless Chromium 实测，5 套皮肤表现一致。

**线框**（右侧详情面板 = 主题作用域；🎨 为新增入口）：

```
┌─ .ph-right（data-theme 作用域） ───────────────────────────┐
│ 重构会话详情主题切换            ⎇ master · v1.2 · 42 条     │ detail head
│ [7 用户][12 助手][3 思考][8 工具][8 结果]      🔍  🎨▾     │ filterbar
│                                              └ 下拉预览 ─┐  │
│ (我) 用户                                     ╔══╗跟随系统✓│  │
│   ┌─ 用户气泡 = mix(--user-color, --card-bg) ╚══╝经典/暗夜│  │
│   └──────────────────────────────────┘        ╔══╗护眼…   │  │
│ (AI) Claude                                                │
│   ┌─ AI 气泡 = --card-bg / --border ─────────────────────┐ │
│   │ 行内 code · 代码块=--bg-hover                          │ │
│   │ diff： −红底 / +绿底（mix 派生）· 表格斑马纹            │ │
│   │ ✕ 工具报错 = --error                                  │ │
│   └───────────────────────────────────────────────────────┘ │
│ ⊘ 用户已取消（notice = --warn）                             │
└─────────────────────────────────────────────────────────────┘
```

**逐主题视觉特征**（已实测渲染）：

| 主题 | 基调 | 气泡/卡片 | 身份/强调 | 适用 |
|---|---|---|---|---|
| 经典浅色 | 纯白亮 | 白卡 + 蓝调用户气泡 | 蓝 / 绿 | 默认日间 |
| 暗夜 | 近黑深 | 深灰卡 + 提亮气泡 | 提亮蓝 / 绿 | 夜间、暗环境 |
| 护眼·米黄 | 暖米纸 | 米黄卡 + 棕用户气泡 | 棕 / 橄榄绿 | 长时间阅读护眼 |
| 海洋·靛青 | 深青墨 | 靛青卡 + 天青 accent | 天蓝 / 青绿 | 暗色但更柔、不死黑 |
| 森林·墨绿 | 柔绿亮 | 浅绿卡 + 湖蓝用户气泡 | 湖蓝 / 墨绿 | 浅色但低蓝光偏暖 |

**关键**：chip 底、diff、行内码、斑马纹、报错底等全部从 `--card-bg` 派生，换肤时自动协调——浅色（米黄/森林）与深色（暗夜/海洋）共用同一套派生公式，无需各写明暗两份。这正是删除 `@media dark` tint 块的依据。

## Refactor map（硬编码 → 种子，按行）

| 行 | 选择器 | → |
|---|---|---|
| 2321-2322, 2754 | `.chat-bubble-user` | `--bubble-user-bg/border`（派生） |
| 2303-04, 2314-15, 2755-56 | 头像 + 名字 | `--user-color` / `--ai-color` |
| 2281-2287, **2737-2743** | `.k-*` accent/tint | accent 保留；tint → `color-mix`（删暗色块） |
| 2419-2424, **2771-2774** | `.diff-*` | `--diff-add/del-bg/fg`（派生 + fg 种子化） |
| 2700, 2759 | 行内 `code` | `--code-inline-bg/fg`（派生） |
| 2722, 2760 | 表格斑马纹 | `--table-stripe`（派生） |
| 2402-03, 2763-64, 2800, 2264, 2435 | 工具报错 / invalid / err 边 | `--error-color`（+ 错误边派生） |
| 2156-2166, 2518-2526, 2897, 2127 | 绿色 CTA / ask-chosen / 完成 / live 点 | `--success-color` |
| 2350, 2575-76 | notice / grep | `--warn-color` |
| 2072, 2748 | `.ph-qitem.active` | `--primary-soft`（派生） |
| 2141, 2777 | `.ph-jump-bottom` 玻璃底 | `--glass-bg`（派生） |
| 2207-2218, 2649-2652 | mem accent + 头边 | `--mem-accent`（每类型，按主题） |

**域外不动**（顶栏/左列）：`.ph-terminal`（`#1e2128/#4ec9b0`）、`.ph-item` 左列 hover（`#2b2b2b/#3d434f`，1928-1958）、`.ph-back`、`.ph-list-toggle`。

## 运行时接线

```
SKINS = [{id:'system',name:'跟随系统'},{id:'light',name:'经典浅色'},{id:'dark',name:'暗夜'},
         {id:'sepia',name:'护眼·米黄'},{id:'ocean',name:'海洋·靛青'},{id:'forest',name:'森林·墨绿'}]
skin   = ref(services.getReadingSkin())            // 默认 'system'
osDark = ref(matchMedia('(prefers-color-scheme: dark)').matches)  // change 监听更新

.ph-right :data-theme = skin==='system' ? null : skin            // system → 无属性 → 继承
菜单行    : <mock data-theme="skin==='system' ? (osDark?'dark':'light') : id"/> + 名 + (skin===id ? ✓)
select(id): skin.value = id; services.setReadingSkin(id)         // 响应式 → 即时重渲染
```
