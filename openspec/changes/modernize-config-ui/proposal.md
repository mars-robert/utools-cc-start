## Why

当前统一配置中心的 UI 存在三个核心可用性问题：(1) 下拉框隐藏了选项，用户需要点击才能看到全部启动命令与终端；(2) 预设终端（PowerShell/pwsh/wt/cmd）未显示实际可执行文件路径，导致启动时路径探测失败用户无感知；(3) 上下堆叠布局在窗口较矮时滚动体验差，且整体设计过时（细框线、紧凑间距、缺乏视觉层次）。

## What Changes

- 布局改为左右分栏：左侧固定宽度导航（图标 + 文字），右侧可滚动内容区
- 启动命令与终端由下拉框改为单选列表（radio buttons），所有选项一目了然
- 预设终端项允许用户编辑路径：系统探测到的路径作为默认值填入输入框（如 PowerShell → `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`），用户可修改后保存
- UI 风格升级为卡片式设计：圆角 8-12px、轻阴影、明确的视觉分组、合理留白、12-14px 字号、hover 状态高亮

## Capabilities

### New Capabilities
无（纯 UI 重构，不新增业务能力）

### Modified Capabilities
- `unified-config`：布局从上下堆叠改为左右分栏；交互从下拉改为单选列表；终端预设项可编辑路径；卡片式视觉风格

## Impact

- 受影响代码：`src/UnifiedConfig/index.vue`（布局与导航）、`src/LauncherConfig/index.vue`（单选列表 + 路径输入）、全局样式（卡片/阴影/圆角变量）
- 受影响存储：`ccstart.settings` 中预设终端项需支持路径覆盖（内置 id 如 `bt-powershell` 可带自定义 `path` 字段）
- 用户影响：界面交互方式变化（下拉 → 单选），但配置数据兼容，无需迁移
