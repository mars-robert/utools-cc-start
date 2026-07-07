## 1. 服务层：读取 Claude Code 插件状态（只读）

- [x] 1.1 在 `services.js` 新增路径常量与安全读取工具：定位 `~/.claude/plugins/{known_marketplaces,installed_plugins}.json`、`~/.claude/settings.json`、`marketplaces/<mp>/.claude-plugin/marketplace.json`；统一 try/catch 降级为默认值
- [x] 1.2 实现 `listInstalledPlugins()`：合并 `installed_plugins.json` 与 `settings.enabledPlugins`，返回 `[{ id:'名称@商城', name, marketplace, version, enabled }]`
- [x] 1.3 实现 `listKnownMarketplaces()`：读取 `known_marketplaces.json` + `extraKnownMarketplaces`，返回 `[{ name, source, installLocation, lastUpdated }]`
- [x] 1.4 实现 `listMarketplacePlugins(mp)`：按需读取该商城 `marketplace.json`，返回 `[{ name, description, author, category, source, installed }]`（对照已装做标记）
- [x] 1.5 挂载以上只读服务到 `window.services`，并补 `test/` 用例（用 fixtures 覆盖正常/缺失/坏文件）

## 2. 服务层：变更操作（调用 claude CLI）

- [x] 2.1 实现 `detectClaudeCli()`：探测 PATH 上 `claude` 可执行文件是否存在，返回布尔
- [x] 2.2 实现薄封装 `runClaudePlugin(args)`：非交互 `spawn('claude',['plugin',...args])`，捕获 stdout/stderr、退出码，设置超时，返回 `{ success, code, stdout, stderr }`
- [x] 2.3 实现语义化服务：`installPlugin(plugin, mp)` / `uninstallPlugin(id)` / `enablePlugin(id)` / `disablePlugin(id)` / `updatePlugin(id)` / `addMarketplace(source)` / `removeMarketplace(name)`
- [x] 2.4 核对各 `claude plugin` 子命令 `--help`，为 uninstall/marketplace remove 等确认交互补齐非交互标志（如需要）
- [x] 2.5 挂载变更服务与 `detectClaudeCli` 到 `window.services`

## 3. 服务层：热门发现（GitHub 实时抓取 + 缓存）

- [x] 3.1 插件推荐 = 抓取官方目录 `anthropics/claude-plugins-official` 的 `marketplace.json`（raw，无限流，含 category/author）——无内置假数据
- [x] 3.2 热门商城 = GitHub 仓库搜索（sort=stars）+ contents API 校验 `.claude-plugin/marketplace.json` 只留真商城；`httpsGetJson` 懒加载 https + 超时；成功写 `dbStorage['ccplugin.cache']`
- [x] 3.3 实现回退链：网络失败/超时 → 本地缓存 → **诚实空态**（不塞假数据）；返回 `{ marketplaces, recommended, source:'live'|'cache'|'offline', fetchedAt }`
- [x] 3.4 在返回项上做去重标记：对照已知商城 / 已装插件，标注 `known` / `installed`
- [x] 3.5 挂载 `getHotList()`（读缓存/兜底，快）与 `refreshHotList()`（强制联网）到 `window.services`

## 4. 页面：插件中心 UI

- [x] 4.1 新增 `src/PluginCenter/index.vue`：标签框架（已装插件 / 商城管理 / 热门发现），`activeTab` 切换，暗色主题与主色变量与现有页面一致
- [x] 4.2 「已装插件」分区：**卡片网格（一行多张）**，展示 名称 / 版本 / **功能描述** / **能力指纹 chips**；操作集中在**右上角**——启停为**开关(switch)**、更新/卸载为图标按钮；**点击卡片打开详情弹窗**（完整描述 + 元信息栅格 + 技能/命令/子代理名称清单 + 弹窗内启停/更新/卸载）；强调色关联主题色 `--primary-color`
- [x] 4.7 服务层新增 `getInstalledPluginDetail(id)`：读取插件目录返回元信息 + 组件名称清单（技能/命令/子代理），供详情弹窗
- [x] 4.3 「商城管理」分区：已知商城列表 + 展开查看其可安装插件（懒加载）；「添加商城」输入弹窗（GitHub repo / git URL，含校验）、「移除商城（二次确认）」、插件「安装」
- [x] 4.4 「热门发现」分区：展示 `getHotList()` 榜单（含数据来源标注 live/cache/offline）、「刷新」触发 `refreshHotList()`；未知商城→「添加」、未装推荐→「安装」、已存在→标记
- [x] 4.5 交互统一：`setSubInput` 按当前分区实时过滤（名称/简介）、方向键导航 + 回车执行主操作 + `scrollIntoView`；执行中 loading、失败提示
- [x] 4.6 `claude` CLI 缺失时的只读降级：隐藏/禁用全部变更动作并提示需安装 Claude Code CLI

## 5. 路由与功能注册

- [x] 5.1 更新 `public/plugin.json`：新增 feature `ccplugin`（`cmds: ["ccplugin","ccp","插件"]`，explain 说明）
- [x] 5.2 更新 `src/App.vue`：新增 `route === 'ccplugin'` → `<PluginCenter :enterAction="enterAction">` 分支

## 6. 验证与文档

- [x] 6.1 `npm run build` 构建通过，无类型/编译错误
- [x] 6.2 `node --test test/**/*.test.cjs` 通过（含新增只读服务用例）
- [ ] 6.3 冒烟：已装插件列表正确、启停/更新/卸载经 CLI 生效并刷新
- [ ] 6.4 冒烟：商城浏览/添加/移除、从商城安装插件正确
- [x] 6.5 冒烟：热门发现联网实时抓取（12 真商城 + 255 官方插件，去重标记一致）、缓存/离线诚实空态、视觉三标签截图核验；`claude` 缺失时只读降级
- [x] 6.6 更新 README / PLUGIN_INTRO：新增 `ccplugin` 关键词与插件中心说明
