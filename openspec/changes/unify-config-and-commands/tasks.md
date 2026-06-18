## 1. 存储与服务层（services.js）

- [x] 1.1 定义内置预设常量：`BUILTIN_LAUNCH_COMMANDS`（claude / --continue / --resume / --dangerously-skip-permissions）与 `BUILTIN_TERMINALS`（powershell、pwsh、wt、cmd）
- [x] 1.2 升级 `getLauncherSettings()`：返回新模型（launchCommands/selectedLaunchId/terminals/selectedTerminalId），合并内置预设与自定义项；检测旧结构（launchCommand/powershellPath）时迁移为新结构并选中
- [x] 1.3 实现派生读取：从选中项解析出运行时 `{ launchCommand, powershellPath }`，使 `launchProject`/`runCommand` 调用处无需改动
- [x] 1.4 实现启动命令项增删改服务：`addLaunchCommand` / `updateLaunchCommand` / `deleteLaunchCommand`（内置项不可删，仅自定义可删）与 `setSelectedLaunchId`
- [x] 1.5 实现终端项增删改服务：`addTerminal` / `updateTerminal` / `deleteTerminal`（预设不可删，自定义可删）与 `setSelectedTerminalId`
- [x] 1.6 终端 `type` 显式化：Windows 启动时按 type 选择 PowerShell/wt/cmd 分支；`custom` 类型回退到现有路径启发式（`isWindowsTerminal`）
- [x] 1.7 新增内置命令覆盖层 key `ccrun.overrides`，改造 `getAllCommands()` 合并逻辑（删除标记跳过、修改浅合并并标记 `modified`），追加自定义命令
- [x] 1.8 实现内置命令服务：`updateBuiltinCommand(id, patch)` / `deleteBuiltinCommand(id)` / `resetBuiltinCommand(id)`，并挂载到 `window.services`

## 2. 统一配置中心 UI

- [x] 2.1 新增 `src/UnifiedConfig/index.vue`：标签页框架（启动配置 / 快捷命令），`activeTab` 切换，暗色主题与现有样式一致
- [x] 2.2 改造 `src/LauncherConfig/index.vue`：启动命令下拉（选中即生效）+「管理启动命令」弹窗（增删改，内置不可删）
- [x] 2.3 在启动配置分区加入终端下拉（选中即生效）+「管理终端」弹窗（增删改自定义，预设不可删）；非 Windows 平台隐藏终端相关项
- [x] 2.4 改造 `src/CommandManage/index.vue`：列表展示内置 + 自定义命令，内置命令支持编辑/删除/「恢复默认」，自定义命令支持增删改；标记"已修改/自定义"
- [x] 2.5 将改造后的 LauncherConfig 与 CommandManage 作为子分区嵌入 UnifiedConfig

## 3. 路由与功能注册

- [x] 3.1 更新 `public/plugin.json`：`ccstartconf` 指向统一配置中心；删除 `ccrun-manage` feature
- [x] 3.2 更新 `src/App.vue`：`ccstartconf` 路由到 `UnifiedConfig`，移除 `ccrun-manage` 分支与对独立 CommandManage 的直接路由

## 4. 验证与文档

- [x] 4.1 `npm run build` 构建通过，无类型/编译错误
- [x] 4.2 冒烟测试：旧设置自动迁移、启动命令/终端下拉选择生效、ccstart 正常启动
- [x] 4.3 冒烟测试：内置命令改/删/恢复默认、自定义命令增删改，ccrun 列表与执行正确
- [x] 4.4 运行 `node test/services-launch.test.cjs`，按新模型修复或补充用例
- [x] 4.5 更新 README：说明统一配置入口与 `ccrun-manage` 关键词迁移路径
