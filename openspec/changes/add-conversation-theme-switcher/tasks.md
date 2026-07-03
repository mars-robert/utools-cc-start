## 1. 存储层（services.js）

- [x] 1.1 新增常量 `READING_SKIN_KEY` 与已知皮肤集合 `['system','light','dark','sepia','ocean','forest']`
- [x] 1.2 新增 `getReadingSkin()`：读 `utools.dbStorage`，缺省或未知值降级为 `'system'`
- [x] 1.3 新增 `setReadingSkin(id)`：按已知集合校验，合法才写入 `READING_SKIN_KEY`，返回是否成功
- [x] 1.4 将 `getReadingSkin` / `setReadingSkin` 挂载到 `window.services`（与 `getThemeSettings` 并列，互不复用键）

## 2. 主题工具（theme-skins.ts）

- [x] 2.1 新增 `src/theme-skins.ts`：导出 `SKINS: { id, name }[]`（6 项，顺序即菜单顺序）
- [x] 2.2 导出 `isKnownSkin(id)` 供渲染层与（可选）服务层校验复用

## 3. 变量种子契约（提升硬编码 + color-mix 派生）

- [x] 3.1 在组件 `<style>` 顶部为 `.ph-right` 定义**派生层**：`--k-bg`/`--bubble-user-*`/`--diff-*-bg`/`--code-inline-*`/`--table-stripe`/`--primary-soft`/`--glass-bg` 均以 `color-mix(... , var(--card-bg))` 表达
- [x] 3.2 用户气泡 `.chat-bubble-user`：底/边改用 `--bubble-user-bg`/`--bubble-user-border`
- [x] 3.3 头像与名字：`--user-color`（`.chat-ava-user`/`.chat-name-user`）、`--ai-color`（`.chat-ava-ai`/`.chat-name-ai`）
- [x] 3.4 `.k-*` 仅保留 `--k-accent`，`--k-bg` 改为派生；**删除** `@media dark` 内 `.k-*` tint 与相应 tint 覆盖（2737-2746、2759-2760）
- [x] 3.5 diff/行内代码/表格斑马纹/`.ph-qitem.active`/jump-bottom 玻璃底 改用对应派生变量；删除其 `@media dark` 覆盖
- [x] 3.6 报错红 → `--error-color`（含 invalid、err 边）；绿色 CTA/ask-chosen/完成/live 点 → `--success-color`；notice/grep → `--warn-color`
- [x] 3.7 mem-card 头条与边 → `--mem-accent`（按类型），随主题取值
- [x] 3.8 校验**域外不动**：`.ph-terminal`、左列 `.ph-item` hover、`.ph-back`、`.ph-list-toggle` 配色保持原样

## 4. 主题定义（[data-theme] 规则）

- [x] 4.1 写 5 套命名主题 `[data-theme="light|dark|sepia|ocean|forest"]`：各声明 ~13 个种子（按 design.md 两张色表）+ `.ph-right[data-theme="…"]{ background: var(--page-bg) }`
- [x] 4.2 `system` 不写规则（继承 `:root` + `@media`），确保经典浅色/暗夜与今日 `:root`/`@media dark` 等价、零回归

## 5. 主题按钮 + 预览下拉（filterbar UI）

- [x] 5.1 在 `ph-qnav` 之后新增主题按钮（🎨），复用 `ph-export-wrap` 的「按钮 + backdrop + 菜单」结构与样式
- [x] 5.2 下拉为纵向预览行：每行 = 迷你对话 mock（自带 `data-theme`，含 page/卡片/气泡/accent 示意）+ 主题名 + 选中 ✓
- [x] 5.3 `system` 行预览按 `osDark` 解析为 `data-theme="dark|light"`，标签注明「跟随系统（当前：深色/浅色）」

## 6. 接线与持久化

- [x] 6.1 `skin = ref(services.getReadingSkin())`；`.ph-right` 绑定 `:data-theme="skin==='system' ? null : skin"`
- [x] 6.2 选择即写：`skin.value = id; services.setReadingSkin(id)`，关闭下拉；响应式即时重渲染
- [x] 6.3 `osDark` ref + `matchMedia('(prefers-color-scheme: dark)')` 的 `change` 监听（挂载时加、卸载时移除），驱动 system 预览实时翻转

## 7. 验证

- [x] 7.1 `npm run build` 构建通过
- [x] 7.2 `node --test` 覆盖 `getReadingSkin`（默认/未知降级）与 `setReadingSkin`（合法写入/非法拒绝）
- [x] 7.3 手动核验：6 主题逐一切换即时生效；浅色主题（米黄/森林）在 **OS 暗色**下仍正确（绝对优先）；重进插件恢复上次选择；顶栏/左列不受影响；记忆详情同步换肤
