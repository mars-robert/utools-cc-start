## Why

当前主题色（`--primary-color` / `--primary-hover`）在 `src/styles/variables.css` 中硬编码，用户无法调整列表选中、导航高亮、主按钮、聚焦边框等的主色。增加一个主题配置入口，让用户在预设配色与自定义取色之间自由选择，能显著提升个性化体验，且改动集中在样式变量与一处持久化逻辑，成本可控。

## What Changes

- 在统一配置中心（`UnifiedConfig`）侧边栏新增一个「主题配置」导航项，作为新的配置面板。
- 面板提供一组**预设主题色**：以当前默认主色（`#4f8cff` 蓝）所在的同一色域（蓝色系）派生出的若干不同明度/饱和度的颜色，作为可一键选用的默认主题。
- 面板提供**自定义取色**：用户通过原生色彩盘（`<input type="color">`）自选主色，并可输入/查看十六进制值。
- 用户选择的主色即时应用到全局：列表选中态、导航激活态、主按钮（`.btn-primary`）、单选控件、聚焦边框等所有引用 `--primary-color` / `--primary-hover` 的位置。
- 主题选择**持久化**（uTools `dbStorage`），插件下次进入时自动恢复；提供「恢复默认」回到内置默认主色。
- `--primary-hover`（悬停色）由选定主色自动派生（同色相轻微加深），用户无需单独设置。

## Capabilities

### New Capabilities
- `theme-config`: 主题主色的配置能力——预设配色选择、自定义取色、全局即时应用、持久化与恢复默认。

### Modified Capabilities
<!-- 无现有 spec 的需求级行为变化 -->

## Impact

- **新增渲染组件**: `src/ThemeConfig/index.vue`（主题配置面板）。
- **修改**: `src/UnifiedConfig/index.vue`（新增侧边栏导航项与面板挂载）。
- **修改**: `src/styles/variables.css`（主色变量改为可被运行时覆盖，定义默认值常量）。
- **修改**: `src/App.vue` 或新增初始化逻辑（应用启动时从持久化读取并写入 `:root` 主色变量，确保全局生效）。
- **新增持久化逻辑**: `public/preload/services.js` 增加主题读写接口（`getThemeSettings` / `setThemeColor` / `resetTheme`），沿用 `dbStorage` 模式。
- **依赖**: 无新增第三方依赖，使用原生 `<input type="color">`。
- **测试**: `test/` 下新增主题持久化逻辑的单元测试（沿用现有 preload 测试模式）。
