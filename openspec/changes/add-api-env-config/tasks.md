## 1. 存储层（env-config.js）

- [ ] 1.1 新建 `public/preload/env-config.js`，定义路径函数 `getEnvConfigsPath()` 返回 `~/.claude/cconf-envs.json`，`getClaudeSettingsPath()` 返回 `~/.claude/settings.json`
- [ ] 1.2 实现 `readEnvConfigsFile()`：读取 JSON 文件，返回 `{ exists, data, parseError }`，缺失或损坏时返回 `defaultEnvConfigs()`
- [ ] 1.3 实现 `defaultEnvConfigs()`：返回默认配置 `{ version: 1, activeId: null, managedKeys: [], configs: [内置官方环境] }`
- [ ] 1.4 实现 `writeEnvConfigsFile(data)`：复刻 `claude-config.js` 的备份+原子写——备份为 `.bak`，先写 `.tmp`，再 `fs.renameSync` 覆盖，返回 `{ success, error? }`
- [ ] 1.5 实现 `readClaudeSettingsFile()`：读取 `settings.json`，返回 `{ exists, data, parseError }`，缺失或损坏时返回空对象
- [ ] 1.6 实现 `writeClaudeSettingsFile(data)`：同样备份+原子写，返回 `{ success, error? }`
- [ ] 1.7 实现 `applyEnvConfig(id)`：
  - 读取 `cconf-envs.json`，找到 id 对应的 config，不存在则返回 `{ success: false, error: '环境配置不存在' }`
  - 读取 `settings.json`，若 `env` 字段不存在则初始化为 `{}`
  - 从 `env` 删除 `managedKeys` 中的所有旧键
  - 将 `{ ANTHROPIC_BASE_URL: config.baseUrl, ANTHROPIC_AUTH_TOKEN: config.token, ANTHROPIC_MODEL: config.model?, ...config.extra }` 写入 `env`
  - 更新 `managedKeys` 为本次写入的键数组
  - 备份+原子写 `settings.json`
  - 更新 `cconf-envs.json` 的 `activeId` 与 `managedKeys`，备份+原子写
  - 返回 `{ success: true, activeId }`，失败时返回 `{ success: false, error }`
- [ ] 1.8 实现 `addEnvConfig(item)`：生成 `id: 'custom-' + Date.now()`，追加到 `configs`，写入文件，返回新 config
- [ ] 1.9 实现 `updateEnvConfig(id, patch)`：找到 id 对应的 config，合并 patch（保留 id/builtin），写入文件，返回更新后的 config
- [ ] 1.10 实现 `deleteEnvConfig(id)`：删除 id 对应的 config（builtin 不可删），若删除的是 activeId 则重置为 null，写入文件，返回 `{ success }`
- [ ] 1.11 `module.exports` 导出所有函数

## 2. 挂载到 services.js

- [ ] 2.1 在 `public/preload/services.js` 顶部 `require('./env-config')`
- [ ] 2.2 在 `module.exports` 挂载：
  - `getEnvConfigs: () => envConfig.readEnvConfigsFile().data || envConfig.defaultEnvConfigs()`
  - `applyEnvConfig: envConfig.applyEnvConfig`
  - `addEnvConfig: envConfig.addEnvConfig`
  - `updateEnvConfig: envConfig.updateEnvConfig`
  - `deleteEnvConfig: envConfig.deleteEnvConfig`

## 3. EnvConfig 组件（渲染层）

- [ ] 3.1 新建 `src/EnvConfig/index.vue`，定义响应式状态：`configs`（数组）、`activeId`（string|null）、`showEditDialog`（boolean）、`showApplyConfirm`（boolean）、`editingConfig`（object|null）、`applyingConfig`（object|null）、`tokenVisible`（对象，键为 id）
- [ ] 3.2 实现 `load()`：调用 `window.services.getEnvConfigs()`，更新 `configs.value` 与 `activeId.value`
- [ ] 3.3 实现 `openEdit(config)`：若 config 存在则复制其值到 `editingConfig.value`（编辑），否则初始化空表单（新增），打开 `showEditDialog`
- [ ] 3.4 实现 `saveEdit()`：根据 `editingConfig.value.id` 判断调用 `updateEnvConfig` 或 `addEnvConfig`，成功后关闭弹窗并 `load()`
- [ ] 3.5 实现 `deleteConfig(id)`：调用 `window.confirm` 确认，调用 `window.services.deleteEnvConfig(id)`，成功后 `load()`
- [ ] 3.6 实现 `openApply(config)`：设置 `applyingConfig.value = config`，打开 `showApplyConfirm`
- [ ] 3.7 实现 `confirmApply()`：调用 `window.services.applyEnvConfig(applyingConfig.value.id)`，成功则更新 `activeId.value`，通知「环境已应用」，失败则 `alert` 错误，关闭弹窗
- [ ] 3.8 实现 `toggleTokenVisible(id)`：切换 `tokenVisible.value[id]` 布尔值
- [ ] 3.9 `onMounted` 调用 `load()`

## 4. UI 模板（EnvConfig.vue template）

- [ ] 4.1 顶部 `.env-header`：左侧标题「API 环境配置」+ 当前生效提示（`v-if="activeId"`），右侧「+ 新增环境」按钮
- [ ] 4.2 卡片网格 `.env-grid`：`v-for` 遍历 `configs`，每张卡片 `.env-card` 动态 class `{ active: cfg.id === activeId }`
- [ ] 4.3 卡片头 `.env-card-header`：左侧环境名，右侧「● 生效中」徽标（`v-if="cfg.id === activeId"`）
- [ ] 4.4 卡片主体 `.env-card-body`：三行 `.env-field`——🌐 baseUrl、🔑 token（打码/明文 + 👁 按钮）、🤖 model（`v-if="cfg.model"`）
- [ ] 4.5 卡片操作 `.env-card-actions`：内置环境显示「[内置]」徽标，自定义环境显示「编辑」「删除」按钮
- [ ] 4.6 卡片底部 `.env-card-footer`：生效中显示「✓ 已生效」，否则显示「应用此环境」按钮
- [ ] 4.7 编辑弹窗：`v-if="showEditDialog"`，遮罩层 + 卡片弹窗，表单字段（名称、BASE_URL、AUTH_TOKEN、MODEL），底部「保存」「取消」按钮
- [ ] 4.8 应用确认弹窗：`v-if="showApplyConfirm"`，遮罩层 + 卡片弹窗，列出将写入的键值、警告文案、底部「取消」「确认写入」按钮

## 5. 样式（EnvConfig.vue style）

- [ ] 5.1 `.env-config` 容器 padding
- [ ] 5.2 `.env-header` flex 布局，标题与按钮两端对齐
- [ ] 5.3 `.env-grid` grid 布局，`repeat(auto-fill, minmax(320px, 1fr))`，gap
- [ ] 5.4 `.env-card` 基础样式：边框、圆角、padding、hover 背景；`.env-card.active` 主色描边（`border: 2px solid var(--primary-color)`）
- [ ] 5.5 `.env-card-header` / `.env-card-body` / `.env-card-actions` / `.env-card-footer` 内部布局
- [ ] 5.6 `.env-field` flex 布局，图标固定宽度，value 省略号
- [ ] 5.7 `.btn-icon` 透明背景，小尺寸，cursor pointer
- [ ] 5.8 `.env-badge-active` 主色文字
- [ ] 5.9 `.env-badge` 灰色徽标
- [ ] 5.10 `.env-applied` 成功色文字
- [ ] 5.11 `.dialog-overlay` 遮罩层居中，z-index 1000
- [ ] 5.12 `.dialog` 弹窗宽度、max-width
- [ ] 5.13 `.form-field` 表单字段样式，label + input
- [ ] 5.14 `.confirm-dialog` / `.confirm-content` / `.confirm-item` / `.confirm-warn` 确认弹窗内容与警告样式（黄色底）

## 6. UnifiedConfig 挂载

- [ ] 6.1 在 `src/UnifiedConfig/index.vue` 的 `<script>` 中 `import EnvConfig from '../EnvConfig/index.vue'`
- [ ] 6.2 在 `activeTab` ref 类型定义中加入 `'env'`
- [ ] 6.3 在 sidebar 的 `commands` 与 `theme` 之间插入「API 环境」nav-item：
  ```vue
  <button class="nav-item" :class="{ active: activeTab === 'env' }" @click="activeTab = 'env'">
    <span class="nav-icon">🔌</span>
    <span class="nav-text">API 环境</span>
  </button>
  ```
- [ ] 6.4 在 `.content` 区的 `CommandManage` 与 `ThemeConfig` 之间插入 `<EnvConfig v-show="activeTab === 'env'" />`

## 7. 验证

- [ ] 7.1 `npm run build` 构建通过
- [ ] 7.2 `node --test` 为 `env-config.js` 补单元测试：
  - 默认配置包含内置环境
  - 读取缺失文件降级为默认
  - 写入后备份文件存在
  - applyEnvConfig 正确清理 managedKeys 并写入新键
  - 删除 builtin 环境失败
  - 删除当前激活环境后 activeId 重置为 null
- [ ] 7.3 手动核验：
  - 进入 cconf → API 环境 tab，显示内置官方环境卡片
  - 新增自定义环境（填写中转 URL/token），保存后卡片出现
  - 编辑自定义环境，修改 token/model，保存后卡片更新
  - 点击👁切换 token 可见性
  - 点击「应用此环境」→ 确认弹窗显示将写入的键与警告 → 确认后卡片显示「● 生效中」与主色描边
  - 检查 `~/.claude/settings.json` 的 `env` 字段已写入 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL
  - 检查 `~/.claude/cconf-envs.json` 的 activeId 与 managedKeys 已更新
  - 检查备份文件 `settings.json.<时间戳>.bak` 与 `cconf-envs.json.<时间戳>.bak` 存在
  - 切换到另一个环境，原环境的 token 从 settings.json 的 env 中被清除，新环境的 token 写入
  - 手动在 settings.json 添加 `HTTP_PROXY` 键，应用环境后该键保持不变（不被误删）
  - 删除非激活的自定义环境，卡片消失
  - 删除当前激活环境，activeId 重置为 null，顶部不再显示「当前生效」
  - 编辑内置环境的 token，保存后生效，但 name/baseUrl 不可改（验证表单逻辑）
  - 关闭插件重新打开，进入 API 环境 tab，上次激活的环境仍显示「● 生效中」
