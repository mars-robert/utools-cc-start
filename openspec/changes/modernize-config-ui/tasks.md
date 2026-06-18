## 1. 存储层扩展（services.js）

- [x] 1.1 新增 `terminalPathOverrides: { [builtinId]: string }` 到 `defaultPersisted()` 与 `readPersisted()`
- [x] 1.2 修改 `getTerminalList()`：合并时优先使用 `terminalPathOverrides[t.id]` 覆盖 `resolveTerminal()` 的默认路径
- [x] 1.3 新增服务方法：`setTerminalPathOverride(id, path)` / `clearTerminalPathOverride(id)` 并挂载到 `window.services`
- [x] 1.4 `getLauncherSettings()` 返回的 `terminals` 列表中每项包含 `resolvedPath` 字段（合并后的最终路径）；派生运行时 `powershellPath` 也优先使用覆盖路径

## 2. 全局样式变量

- [x] 2.1 新增 `src/styles/variables.css`：定义卡片变量（`--card-bg`、`--card-radius`、`--card-shadow`、`--card-padding`）与主题颜色（`--primary-color`、`--text-primary`、`--text-secondary`、`--border-color`），含暗色主题 `@media (prefers-color-scheme: dark)`
- [x] 2.2 在 `src/main.js` 引入 `variables.css`

## 3. UnifiedConfig 左右布局

- [x] 3.1 `UnifiedConfig/index.vue`：改为 `display: flex; flex-direction: row;`，左侧 `.sidebar` 固定宽度 180px，右侧 `.content` flex-grow
- [x] 3.2 左侧导航改为纵向按钮列表：每个按钮含图标（📦 / ⚡）+ 文字，`.active` 高亮；移除顶部 `.tabs` 横向布局
- [x] 3.3 右侧 `.content` 设置 `overflow-y: auto`，内容超出时滚动

## 4. LauncherConfig 单选列表与路径编辑

- [x] 4.1 启动命令改为 radio 单选列表：移除 `<select>`，用 `<div class="radio-item">` + `<input type="radio">` + `<label>` 实现，样式隐藏原生 radio 并用伪元素绘制；选中项卡片高亮
- [x] 4.2 终端改为 radio 单选列表：每个终端项旁显示路径输入框 `<input v-model="terminalPaths[t.id]">`，默认值为 `t.resolvedPath`
- [x] 4.3 终端列表底部新增「保存路径」按钮：遍历 `terminalPaths`，对比默认值，有修改则调用 `setTerminalPathOverride(id, path)`
- [x] 4.4 每个预设终端项旁加「恢复默认」按钮：调用 `clearTerminalPathOverride(id)` 并重新加载
- [x] 4.5 应用卡片样式：`.radio-item` 圆角、边框、hover/选中态

## 5. 卡片样式应用

- [x] 5.1 `LauncherConfig` 的启动命令列表与终端列表外层包裹 `.card` 容器（`.section.card`）
- [x] 5.2 `CommandManage` 的命令列表改为卡片式：每个命令项边框 + hover 阴影高亮
- [x] 5.3 按钮样式统一：圆角 6px、主色调按钮用 `background: var(--primary-color)`、次要按钮用边框 + 白底

## 6. 验证与文档

- [x] 6.1 `npm run build` 构建通过
- [x] 6.2 手动测试：左右布局正常、radio 选中生效、预设终端路径可编辑并保存、暗色主题适配（用户实机截图确认）；新增 services 测试覆盖路径覆盖逻辑（8/8 通过）
- [x] 6.3 更新 README：说明新 UI 特性（单选列表、路径编辑）
