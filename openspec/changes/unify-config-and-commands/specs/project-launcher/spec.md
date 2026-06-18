## MODIFIED Requirements

### Requirement: 在终端中以可配置命令启动项目

系统 SHALL 在所选项目的工作目录打开系统终端，并运行用户从预设列表或自定义列表中选定的启动命令。启动行为 SHALL 按操作系统（Windows、macOS、Linux）分别实现。

#### Scenario: 启动所选项目
- **WHEN** 用户激活一个可用项目
- **THEN** 系统打开一个工作目录为该项目路径的终端，并执行用户当前选中的启动命令

#### Scenario: 报告启动失败
- **WHEN** 无法打开终端或命令未能启动
- **THEN** 系统向用户呈现错误信息，而不会静默失败

#### Scenario: 不可用项目无法启动
- **WHEN** 用户尝试激活一个被标记为不可用的项目
- **THEN** 系统阻止启动并说明原因

#### Scenario: 记录最近使用的项目目录
- **WHEN** 用户成功启动某个项目
- **THEN** 系统保存该项目的工作目录作为"最近使用的项目目录"，供命令运行器（ccrun）使用

### Requirement: Windows 终端启动支持 PowerShell 与 Windows Terminal

在 Windows 上，系统 SHALL 使用用户从预设列表或自定义列表中选定的终端启动项目，并 SHALL 自动识别该终端类型（PowerShell、Windows Terminal、CMD 或自定义），采用正确的参数格式。

#### Scenario: 使用标准 PowerShell 启动
- **WHEN** 在 Windows 上启动项目且用户选定的终端是 PowerShell 或 pwsh 预设项
- **THEN** 系统通过 `cmd /c start` 打开新的 PowerShell 窗口，先进入项目目录再运行命令并保持窗口

#### Scenario: 使用 Windows Terminal 启动
- **WHEN** 在 Windows 上启动项目且用户选定的终端是 Windows Terminal 预设项
- **THEN** 系统直接调用 `wt.exe` 或用户指定的 WindowsTerminal.exe 路径，在其中启动 PowerShell，先进入项目目录再运行命令并保持窗口

#### Scenario: 使用 CMD 启动
- **WHEN** 在 Windows 上启动项目且用户选定的终端是 CMD 预设项
- **THEN** 系统通过 `cmd /c start` 打开新的 CMD 窗口，先进入项目目录再运行命令并保持窗口

#### Scenario: 使用自定义终端启动
- **WHEN** 在 Windows 上启动项目且用户选定的终端是自定义路径
- **THEN** 系统根据该路径的特征（如路径包含 `WindowsTerminal.exe` 或 `wt.exe`）自动识别类型并采用相应启动方式；若无法识别则回退到 PowerShell 模式

#### Scenario: 未配置时回退到默认 PowerShell
- **WHEN** 在 Windows 上启动项目但用户未选定任何终端
- **THEN** 系统探测并使用系统默认 PowerShell（优先 PowerShell 7+，否则 Windows PowerShell 5.1）

### Requirement: 通过统一配置中心管理启动器设置

系统 SHALL 将启动器设置的配置入口整合进统一配置中心的「启动配置」标签页，允许用户通过下拉选择框选定当前启动命令与终端，并支持用户对启动命令列表与终端列表进行增、删、改。系统 SHALL 使用 uTools 存储持久化这些设置。

#### Scenario: 进入启动配置
- **WHEN** 用户打开统一配置中心并切换到「启动配置」标签页
- **THEN** 系统展示启动命令下拉与终端下拉，以及对应的管理按钮

#### Scenario: 下拉选择启动命令
- **WHEN** 用户从启动命令下拉列表中选择一个项（内置预设或用户自定义）
- **THEN** 系统将该项标记为当前生效的启动命令，后续启动项目时使用它

#### Scenario: 管理启动命令列表
- **WHEN** 用户点击启动命令管理按钮并进入管理界面
- **THEN** 系统显示所有启动命令项（内置预设 + 用户自定义），用户可增、删、改

#### Scenario: 下拉选择终端
- **WHEN** 用户从终端下拉列表中选择一个预设项（PowerShell/pwsh、Windows Terminal、CMD）或自定义路径项
- **THEN** 系统将该项标记为当前生效的终端，后续启动项目时使用它

#### Scenario: 管理终端列表
- **WHEN** 用户点击终端管理按钮并进入管理界面
- **THEN** 系统显示所有终端项（预设 + 用户自定义），用户可增、删、改自定义项，但不可删除预设项

#### Scenario: 持久化选定项
- **WHEN** 用户选定启动命令或终端后关闭并重新打开插件
- **THEN** 之前选定的启动命令与终端仍然生效

## ADDED Requirements

### Requirement: 内置启动命令预设

系统 SHALL 提供内置的启动命令预设列表，包括 `claude`、`claude --continue`、`claude --resume`、`claude --dangerously-skip-permissions`，并允许用户添加自定义启动命令项。

#### Scenario: 内置预设不可删除
- **WHEN** 用户进入启动命令管理界面
- **THEN** 内置预设项可见但不可删除，只能选择使用或不使用

#### Scenario: 用户自定义启动命令可增删改
- **WHEN** 用户在启动命令管理界面中添加、编辑或删除自定义启动命令
- **THEN** 系统持久化这些操作，自定义项出现在启动命令下拉列表中

### Requirement: 内置终端预设

系统 SHALL 在 Windows 上提供内置终端预设列表，包括 PowerShell/pwsh（自动探测路径）、Windows Terminal (wt)、CMD，并允许用户添加自定义终端路径项。

#### Scenario: 内置终端预设自动探测路径
- **WHEN** 用户选择 PowerShell/pwsh 预设项
- **THEN** 系统自动探测系统中安装的 PowerShell 7+ 或 Windows PowerShell 5.1 路径

#### Scenario: 用户自定义终端可增删改
- **WHEN** 用户在终端管理界面中添加、编辑或删除自定义终端路径
- **THEN** 系统持久化这些操作，自定义项出现在终端下拉列表中

## REMOVED Requirements

### Requirement: 通过独立配置功能管理启动器设置

**Reason**: 启动器设置已整合进统一配置中心的「启动配置」标签页，不再使用独立的 `ccstartconf` 配置功能入口。

**Migration**: 用户通过统一配置中心（关键词如 `cconf` / `ccstartconf` / `配置`）进入「启动配置」标签页管理启动命令与终端设置。
