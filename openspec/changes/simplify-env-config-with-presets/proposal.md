## Why

现有的环境配置界面（`src/EnvConfig/`）虽然已实现卡片展示和编辑器功能，但用户体验不够友好：用户需要在复杂的表单中填写大量字段，对于常见的 API 厂商接入（如 DeepSeek、官方 Anthropic、国内中转等）缺乏快速配置入口。这导致新用户配置门槛高，切换不同 API 后端的流程繁琐。

## What Changes

- 新增内置 API 厂商预设模板（DeepSeek、官方 Anthropic、OpenRouter 等），用户可一键套用并填写 API Key
- 简化配置编辑器：在表单模式下只展示核心字段（BASE_URL、AUTH_TOKEN、MODEL、EFFORT_LEVEL），高级字段移至 JSON 模式
- 优化卡片交互：卡片上直接展示预设来源标签（如「DeepSeek」「官方」），快速识别配置类型
- 增强预设管理：支持从预设创建配置时自动填充推荐的模型配置（如 DeepSeek 自动配置 v4-pro[1m] + max effort）

## Capabilities

### New Capabilities
- `api-vendor-presets`: API 厂商预设模板系统，包含内置预设定义、预设选择界面、预设应用逻辑

### Modified Capabilities
- `env-config-editor`: 简化表单模式的字段展示，重组为「基础配置」和「高级配置（JSON）」两层结构

## Impact

- **修改文件**：
  - `src/EnvConfig/ConfigEditor.vue` — 简化表单字段，增加预设应用逻辑
  - `src/EnvConfig/ConfigFields.js` — 重组字段定义，区分基础/高级字段
  - `public/preload/env-config.js` — 新增预设定义和应用函数
  - `public/preload/services.js` — 导出预设相关 API
- **新增功能**：预设选择界面，内置 5+ 主流 API 厂商预设
- **用户体验**：配置流程从「填写 10+ 字段」简化为「选择预设 → 填写 API Key → 保存」
- **兼容性**：已有配置完全兼容，新增预设功能不影响现有数据结构
