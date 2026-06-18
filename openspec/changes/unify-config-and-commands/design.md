## Context

当前插件在 `public/plugin.json` 中注册了 4 个 feature：`ccstart`（启动器）、`ccstartconf`（启动配置）、`ccrun`（命令列表）、`ccrun-manage`（命令管理）。其中 `ccstartconf` 与 `ccrun-manage` 都是「配置类」入口，但相互独立，关键词分散，使用复杂。

现有存储模型（`public/preload/services.js`）：
- `ccstart.settings`：`{ launchCommand: string, powershellPath: string }` —— 单一手填命令 + 单一手填终端路径。
- `ccrun.custom`：自定义命令数组；内置命令以常量 `BUILTIN_COMMANDS` 硬编码，不可改。

UI 层为 Vue 3 `<script setup>` 单文件组件，通过 `window.services`（预加载层注入）访问 Node 能力，通过 `window.utools.dbStorage` 持久化。`App.vue` 按 `action.code` 路由到对应组件。

## Goals / Non-Goals

**Goals:**
- 单一配置入口 + 标签页（启动配置 / 快捷命令 / 终端设置），移除 `ccrun-manage` 独立入口。
- 启动命令、终端均改为下拉选择，数据源为「内置预设 + 用户自定义」，下拉选中项即生效。
- 启动命令的自定义项可增删改；终端的自定义项可增删改（预设不可删）。
- 快捷命令对全部命令（含内置）可增删改，内置以覆盖层实现并可恢复默认。
- 保持现有 `ccstart`、`ccrun` 运行时行为与终端启动逻辑（PowerShell/wt/cmd）兼容。

**Non-Goals:**
- 不改变项目发现逻辑（`listClaudeProjects`）与 cwd 解析。
- 不引入新的第三方依赖或构建工具。
- 不做配置的云同步 / 导入导出（可作为后续变更）。

## Decisions

### 决策 1：统一配置中心采用「单一 feature + 标签页组件」

新增组件 `src/UnifiedConfig/index.vue`，内部用 `activeTab` ref 切换三个子分区组件：
- `LauncherConfig`（改造）—— 启动命令下拉 + 终端下拉 + 各自管理弹窗。
- `CommandManage`（改造）—— 全量命令管理。
- 终端设置并入「启动配置」标签页内（终端下拉与启动命令下拉同屏），或作为独立第三标签。**采用：启动配置标签内含启动命令与终端两个下拉**；「快捷命令」为第二标签。最终为 2 个主标签（启动配置、快捷命令），终端作为启动配置内的一节，避免标签过多。

> 备注：proposal 提到三分区，实现上将「终端设置」作为「启动配置」标签内的一节呈现，语义等价且更紧凑。spec 的标签页要求以「分区」满足。

**plugin.json 变更**：保留 `ccstartconf`（关键词 `cconf`/`ccstartconf`/`配置`）指向统一配置中心；删除 `ccrun-manage` feature。`App.vue` 路由 `ccstartconf` → `UnifiedConfig`，移除 `ccrun-manage` 分支。

**备选**：保留 4 个 feature 仅共享组件——被否决，无法满足「移除独立入口、统一管理」的诉求。

### 决策 2：启动配置存储模型升级为列表 + 选中 id

`ccstart.settings` 新结构：
```
{
  launchCommands: [{ id, label, command, builtin: bool }],   // 启动命令项
  selectedLaunchId: string,
  terminals: [{ id, label, type, path, builtin: bool }],      // type: 'powershell'|'pwsh'|'wt'|'cmd'|'custom'
  selectedTerminalId: string
}
```
- 内置预设由代码常量提供（`BUILTIN_LAUNCH_COMMANDS`、`BUILTIN_TERMINALS`），存储中仅保存用户自定义项与「选中 id」「内置项的删除/隐藏标记（启动命令允许隐藏，终端预设不可删）」。读取时合并预设与自定义。
- `getLauncherSettings()` 负责把新模型解析为运行时所需的 `{ launchCommand, powershellPath }`（取选中项），使 `launchProject` / `runCommand` 无需改签名。
- 终端 `type` 显式化，替代原先靠路径字符串猜测；`custom` 类型仍走 `isWindowsTerminal()` 等启发式以兼容。

**向后兼容**：`getLauncherSettings()` 检测到旧结构（仅有 `launchCommand`/`powershellPath`）时，迁移为新结构（把旧值作为一个自定义项并选中）。

**备选**：把启动项也塞进 `ccrun.custom`——被否决，语义不同，分开更清晰。

### 决策 3：内置命令可改用「覆盖层」实现

`ccrun.custom` 保持为用户自定义命令数组；新增存储 key `ccrun.overrides`：
```
{ [builtinId]: { deleted?: true, name?, command?, description?, needsProjectDir? } }
```
`getAllCommands()` 合并逻辑：遍历 `BUILTIN_COMMANDS`，对每个内置命令套用 overrides（删除则跳过，修改则浅合并并标记 `modified: true`），再追加自定义命令。新增 `updateBuiltinCommand(id, patch)`、`deleteBuiltinCommand(id)`、`resetBuiltinCommand(id)` 服务方法。

**备选**：把内置命令复制进 `ccrun.custom` 后允许直接改——被否决，会导致内置库升级时无法同步新增项、且产生重复。

### 决策 4：下拉与管理分离的交互

下拉只负责「选哪个生效」；增删改在下拉旁的「管理」按钮打开弹窗完成，复用现有 `CommandManage` 的 dialog 模式。保持键盘可达与暗色主题样式一致。

## Risks / Trade-offs

- [移除 `ccrun-manage` 关键词导致老用户找不到入口] → 在 proposal/README 注明迁移路径；`配置`/`cconf` 关键词保留并作为统一入口。
- [存储模型迁移出错导致设置丢失] → `getLauncherSettings()` 做防御式迁移，迁移失败回退默认值；旧 key 保留不删，便于回滚。
- [内置命令覆盖层与未来内置库变更冲突] → overrides 以 `builtinId` 为键，内置项改名/删除时孤儿 override 自动失效（合并时找不到对应内置项即忽略）。
- [终端 type 显式化后自定义路径仍需启发式识别] → 自定义项保留路径特征识别逻辑，保证 wt/PowerShell 兼容。

## Migration Plan

1. 升级 `services.js`：新存储模型 + 兼容读取 + 新服务方法（`get/saveLauncherSettings` 内部迁移、`getAllCommands` 合并 overrides、启动项与终端的增删改方法）。
2. 新增 `UnifiedConfig` 组件，改造 `LauncherConfig`、`CommandManage` 为其子分区。
3. 更新 `App.vue` 路由与 `plugin.json` features（删除 `ccrun-manage`）。
4. `npm run build` 构建并冒烟测试：旧设置自动迁移、下拉选择生效、内置命令改/删/恢复、自定义增删改、启动与执行命令在 Windows 终端正常。
5. 回滚策略：保留旧存储 key 不删除；如需回退，恢复 `plugin.json` 与组件即可读回旧设置。

## Open Questions

- 「启动配置」与「终端设置」最终是 2 标签（终端作为启动配置内一节）还是 3 标签？倾向 2 标签更紧凑，实现时如界面拥挤再拆分。
