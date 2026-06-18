## Why

当前插件暴露了多个分散的配置入口：`ccstartconf`（启动器配置）与 `ccrun-manage`（命令管理）各自独立，用户需要记忆不同关键词、在不同界面间切换，使用复杂且不直观。同时启动配置依赖手填命令与手填终端路径，易错且门槛高；快捷命令中的内置命令又无法编辑或删除，灵活性不足。

## What Changes

- 新增统一配置中心（单一入口 + 标签页），整合「启动配置」「快捷命令」「终端设置」三个分区。
- **BREAKING** 移除独立的 `ccrun-manage`（管理命令）功能入口，其能力并入统一配置中心的「快捷命令」标签页。
- 启动命令由手填文本改为下拉选择：内置常用预设（如 `claude`、`claude --continue`、`claude --resume`、`claude --dangerously-skip-permissions`），并支持用户对启动项进行增、删、改；下拉选中项即为当前生效的启动命令。
- 终端由手填路径改为下拉选择：预置 PowerShell/pwsh、Windows Terminal (wt)、CMD，并提供「自定义终端路径」选项允许填写任意终端可执行文件；下拉选中项即为当前生效终端。
- 快捷命令支持对全部命令增、删、改，**包括系统默认（内置）命令**；内置命令的修改/删除以用户覆盖层形式持久化，并可恢复默认。

## Capabilities

### New Capabilities
- `unified-config`: 统一配置中心，单一入口聚合启动配置、快捷命令管理与终端设置的标签页式界面与导航。

### Modified Capabilities
- `project-launcher`: 启动命令与终端从手填改为下拉选择（含预设与自定义项的增删改）；配置入口归入统一配置中心。
- `command-runner`: 快捷命令的增删改扩展到内置默认命令（覆盖层 + 恢复默认），命令管理界面归入统一配置中心。

## Impact

- 受影响代码：`public/plugin.json`（features 调整）、`src/App.vue`（路由）、`src/LauncherConfig`、`src/CommandManage`、`src/CommandList`、`public/preload/services.js`（设置/命令存储模型、终端与启动项数据源）。
- 受影响存储：`ccstart.settings`（新增 launchCommands/terminals 列表与当前选中项）、`ccrun.custom`（新增内置命令覆盖层 key）。
- 受影响 specs：`project-launcher`、`command-runner`，新增 `unified-config`。
- 用户影响：`ccrun-manage`（管理命令）关键词不再可用，需通过统一配置中心进入。
