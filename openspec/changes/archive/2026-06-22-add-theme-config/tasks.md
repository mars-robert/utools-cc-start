## 1. 持久化与工具函数

- [x] 1.1 在 `public/preload/services.js` 新增主题存储键 `cctheme.settings`，结构 `{ primaryColor: string | null }`，默认 `null`
- [x] 1.2 实现并导出 `deriveHover(hex)` 纯函数：对合法 `#RRGGBB` 返回同色相加深版本（HSL 降亮度约 8% 或与黑色 color-mix 约 12%），非法输入原样返回/返回默认
- [x] 1.3 实现 `isValidHex(hex)` 校验 `#RRGGBB` 格式
- [x] 1.4 在 `window.services` 暴露 `getThemeSettings()` / `setThemeColor(hex)` / `resetTheme()`；`setThemeColor` 写入前用 `isValidHex` 校验，非法则忽略
- [x] 1.5 定义内置默认主色常量 `DEFAULT_PRIMARY = '#4f8cff'` 与预设色数组 `PRESET_PRIMARIES`（蓝色同色域 5–6 个不同明度/饱和度），并导出供测试

## 2. 主色应用逻辑

- [x] 2.1 在 `src/App.vue` 的 `onMounted` 早期（渲染页面前）读取 `getThemeSettings()`，若有 `primaryColor` 则通过 `documentElement.style.setProperty` 写入 `--primary-color` 与派生的 `--primary-hover`
- [x] 2.2 抽出可复用的 `applyTheme(hex)` 渲染层函数（设置/移除根变量），供 App 初始化与配置面板共用
- [x] 2.3 确认 `src/styles/variables.css` 保留 `--primary-color` / `--primary-hover` 默认值作为未覆盖回退

## 3. 主题配置面板组件

- [x] 3.1 新建 `src/ThemeConfig/index.vue`：加载当前主色（`getThemeSettings`，缺省用默认）
- [x] 3.2 渲染预设色块列表（来自 `PRESET_PRIMARIES`），当前生效色显示选中标识；点击预设：`applyTheme` + `setThemeColor` 持久化
- [x] 3.3 渲染原生 `<input type="color">` 色彩盘与十六进制值显示；选色：`applyTheme` + `setThemeColor` 持久化
- [x] 3.4 自定义色与预设不匹配时，所有预设取消选中标识
- [x] 3.5 「恢复默认」按钮：`resetTheme` + `applyTheme(DEFAULT_PRIMARY)`，界面即时复位
- [x] 3.6 面板样式复用 `card` / `.btn` 等既有类与 CSS 变量，滚动条与其他页面保持一致

## 4. 集成到统一配置中心

- [x] 4.1 在 `src/UnifiedConfig/index.vue` 侧边栏新增「主题配置」导航项（含图标），扩展 `activeTab` 类型
- [x] 4.2 在内容区按 `activeTab` 挂载 `ThemeConfig`（`v-show` 与现有项一致）

## 5. 收敛硬编码主色

- [x] 5.1 全局检索主色字面量（`4f8cff`、`79, 140, 255`、`e8f0ff`、`3d7ae8`）
- [x] 5.2 将「列表选中底色」「badge 底色」等主色派生硬编码改为基于 `--primary-color` 的 `color-mix()`（或半透明叠加变量），使其跟随主题；记录不纳入范围的豁免项（如 `main.css` 的 `--blue`）

## 6. 测试与验证

- [x] 6.1 在 `test/` 新增单元测试：`deriveHover` / `isValidHex` / 主题读写（沿用 `test/helpers/load-preload.cjs` 模式）
- [x] 6.2 运行 `npm test`，确保新增与既有测试通过
- [x] 6.3 运行 `npm run build`，确保构建无错误
- [ ] 6.4 手动验证：选预设/自定义后，导航激活态、主按钮、列表选中态、聚焦边框即时换色；重进插件主题恢复；恢复默认可复位
