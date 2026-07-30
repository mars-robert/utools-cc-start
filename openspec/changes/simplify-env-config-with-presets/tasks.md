## 1. 预设定义（Preload 层）

- [ ] 1.1 在 `public/preload/env-config.js` 定义 `VENDOR_PRESETS` 数组，包含 5 个预设：official-anthropic、deepseek、openrouter、china-relay、custom
- [ ] 1.2 为每个预设定义完整结构：id、name、description、icon、config（嵌套路径格式如 'env.ANTHROPIC_BASE_URL'）、requiresToken、tokenPlaceholder、docs、isTemplate
- [ ] 1.3 实现 `getVendorPresets()` 函数，返回 `{ success: true, data: VENDOR_PRESETS }`
- [ ] 1.4 在 `public/preload/services.js` 的 `module.exports` 中挂载 `getVendorPresets: envConfig.getVendorPresets`

## 2. 字段优先级标注（ConfigFields.js）

- [ ] 2.1 在 `ConfigFields.js` 的每个 field 对象中新增 `priority` 属性（'basic' | 'advanced'）
- [ ] 2.2 标记 4 个基础字段为 `priority: 'basic'`：ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN、ANTHROPIC_MODEL、CLAUDE_CODE_EFFORT_LEVEL
- [ ] 2.3 标记其余所有字段为 `priority: 'advanced'`（包括 DEFAULT_HAIKU_MODEL、DEFAULT_OPUS_MODEL、DEFAULT_SONNET_MODEL、SUBAGENT_MODEL 等）
- [ ] 2.4 在 `ConfigFields.js` 导出 `getBasicFields()` 函数，筛选并返回只包含 priority === 'basic' 的字段的 section 数组
- [ ] 2.5 导出 `getAdvancedFields()` 函数，筛选并返回只包含 priority === 'advanced' 的字段的 section 数组

## 3. 预设选择界面（index.vue）

- [ ] 3.1 在 `src/EnvConfig/index.vue` 的 data 中新增 `showPresetSelector: false` 状态
- [ ] 3.2 修改 `handleCreate()` 方法：设置 `showPresetSelector = true` 而非直接打开编辑器
- [ ] 3.3 实现 `handlePresetSelected(presetId)` 方法：根据 presetId 查找预设，调用 `buildSettingsFromPreset(preset)` 构建 settings 对象，设置 `editingStore = { title: preset.name, settings, _presetId: presetId }`，关闭预设选择器并打开编辑器
- [ ] 3.4 实现 `buildSettingsFromPreset(preset)` 方法：遍历 preset.config，使用 `setNestedValue` 解析嵌套路径并填充到 settings 对象
- [ ] 3.5 在 template 中添加预设选择弹窗：遮罩层 `.preset-overlay` + 卡片 `.preset-selector`
- [ ] 3.6 在预设选择弹窗中渲染预设列表：`v-for="preset in presets"`，每项显示 icon、name、description，支持点击触发 `handlePresetSelected(preset.id)`
- [ ] 3.7 为标记 `isTemplate: true` 的预设添加视觉提示标签「需修改 URL」
- [ ] 3.8 为包含 `docs` 链接的预设显示「📖 申请 API Key」链接，点击打开外部浏览器

## 4. 配置编辑器简化（ConfigEditor.vue）

- [ ] 4.1 在 `ConfigEditor.vue` 的 data 中新增 `showAdvancedFields: false` 状态
- [ ] 4.2 修改 `sections` 的计算或初始化逻辑：默认使用 `getBasicFields()` 加载字段
- [ ] 4.3 实现 `toggleAdvancedFields()` 方法：切换 `showAdvancedFields` 状态，动态更新 `sections` 为 `getBasicFields()` 或完整的 `CONFIG_SECTIONS`
- [ ] 4.4 在表单模式底部（所有 section 之后）添加「显示高级选项」按钮，`v-show="!showAdvancedFields"`，点击调用 `toggleAdvancedFields()`
- [ ] 4.5 当 `showAdvancedFields === true` 时，按钮文字改为「隐藏高级选项」
- [ ] 4.6 确保 JSON 模式不受简化影响：JSON 编辑器始终显示完整 `settings` 对象

## 5. 编辑器内预设应用（ConfigEditor.vue）

- [ ] 5.1 在 `ConfigEditor.vue` 确认 props 包含 `presets: { type: Array, default: () => [] }`
- [ ] 5.2 在 ANTHROPIC_BASE_URL 字段的 `.field-input` 中添加「+ 预设」按钮，`v-if="field.name === 'env.ANTHROPIC_BASE_URL' && presets.length"`
- [ ] 5.3 在 data 中新增 `showPresetMenu: false` 状态
- [ ] 5.4 点击「+ 预设」按钮时设置 `showPresetMenu = true`
- [ ] 5.5 实现预设下拉菜单：绝对定位浮层，`v-if="showPresetMenu"`，点击遮罩层关闭
- [ ] 5.6 在预设菜单中渲染 `v-for="preset in presets"`，显示 preset.name，点击调用 `applyPreset(preset.id)`
- [ ] 5.7 实现 `applyPreset(presetId)` 方法：查找预设，遍历 preset.config，使用 `setNestedValue` 更新 `formData`，但跳过 'env.ANTHROPIC_AUTH_TOKEN' 以保留用户已输入的 token，关闭预设菜单
- [ ] 5.8 应用预设后触发响应式更新，确保表单字段显示新值

## 6. 卡片显示预设标签（index.vue）

- [ ] 6.1 在 `src/EnvConfig/index.vue` 的 methods 中实现 `getPresetLabel(store)` 方法：检查 `store._presetId`，若存在则从 `presets` 数组查找对应预设，返回 `preset.icon + ' ' + preset.name`，否则返回 `null`
- [ ] 6.2 在卡片模板的 `.card-top` 中，`card-name` 后面添加预设标签：`<span v-if="getPresetLabel(store)" class="tag tag-preset">{{ getPresetLabel(store) }}</span>`
- [ ] 6.3 在 `<style scoped>` 中添加 `.tag-preset` 样式：小字号、圆角、浅色背景、与卡片名称间距适当

## 7. 保存配置时保留预设元数据

- [ ] 7.1 在 `ConfigEditor.vue` 的 `handleSave()` 方法中，确保 emit 的 store 对象包含 `_presetId` 字段（若存在）
- [ ] 7.2 在 `index.vue` 的 `handleEditorSaved()` 方法中，调用 `window.services.saveStore()` 时传递完整的 store 对象（包括 `_presetId`）
- [ ] 7.3 确认 `public/preload/env-config.js` 的 store 保存逻辑（若已有 `addEnvConfig` / `updateEnvConfig`）能保留 `_presetId` 元数据

## 8. 样式优化

- [ ] 8.1 在 `src/EnvConfig/index.vue` 的 `<style scoped>` 中添加 `.preset-overlay` 样式：全屏遮罩，半透明黑色背景，flex 居中
- [ ] 8.2 添加 `.preset-selector` 样式：白色卡片，最大宽度 520px，圆角、阴影，内边距
- [ ] 8.3 添加 `.preset-item` 样式：每个预设项的布局，hover 背景变化，cursor pointer，padding、border-bottom
- [ ] 8.4 在 `ConfigEditor.vue` 的 `<style scoped>` 中添加 `.btn-preset` 样式：小型按钮，主色边框，与输入框对齐
- [ ] 8.5 添加 `.preset-menu` 样式：下拉菜单浮层，白色背景，圆角、阴影，绝对定位
- [ ] 8.6 添加 `.btn-toggle-advanced` 样式：「显示高级选项」按钮样式，次要按钮外观，位于表单底部居中

## 9. 数据加载与兼容性

- [ ] 9.1 在 `index.vue` 的 `loadData()` 方法中增加预设加载：调用 `window.services.getVendorPresets()`，结果存入 `this.presets`
- [ ] 9.2 确认已有 store 数据（无 `_presetId`）正常加载和显示，不受新功能影响
- [ ] 9.3 测试从旧版本升级场景：已有配置的卡片不显示预设标签，但编辑和切换功能正常

## 10. 验证与测试

- [ ] 10.1 手动测试：打开 cconf → API 环境，点击「+ 新增配置」，预设选择弹窗正常显示 5 个预设
- [ ] 10.2 选择「DeepSeek」预设，编辑器打开后 BASE_URL 等字段已预填，只需填写 AUTH_TOKEN
- [ ] 10.3 保存配置后，卡片上显示「🔷 DeepSeek」标签
- [ ] 10.4 编辑已有配置，点击 BASE_URL 旁的「+ 预设」按钮，下拉菜单显示，选择预设后字段更新但 token 保留
- [ ] 10.5 测试表单简化：默认只显示 4 个基础字段，点击「显示高级选项」后展开所有字段
- [ ] 10.6 切换到 JSON 模式，完整配置正常显示和编辑
- [ ] 10.7 测试已有配置（无 _presetId）：加载、编辑、保存、切换功能正常，卡片无预设标签
- [ ] 10.8 测试「官方 Anthropic」和「OpenRouter」预设的配置和应用
- [ ] 10.9 测试「国内中转（示例）」预设，确认「需修改 URL」提示显示
- [ ] 10.10 测试「自定义配置」预设，编辑器打开时字段为空
