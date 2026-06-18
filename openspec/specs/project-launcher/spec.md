# project-launcher Specification

## Purpose

提供一个 uTools 功能（`ccstart` / `cc` 指令），从 `~/.claude/projects` 发现 Claude Code 项目，按最近使用时间排序并支持搜索与键盘导航，选中后在系统终端中以可配置命令启动该项目；并提供独立的配置功能（`ccstartconf` / `配置` 指令）用于配置终端路径（PowerShell 或 Windows Terminal）与自定义启动命令。

## Requirements

### Requirement: 从 Claude Code 目录发现项目

系统 SHALL 通过扫描 `~/.claude/projects` 目录来发现所有 Claude Code 项目，并将每个项目作为可选条目展示。系统 SHALL 以适配操作系统的方式解析用户主目录。

#### Scenario: 项目目录中存在项目
- **WHEN** 用户打开启动器功能且 `~/.claude/projects` 中包含一个或多个项目子目录
- **THEN** 系统为每个项目子目录列出一个条目

#### Scenario: 项目目录为空
- **WHEN** 用户打开启动器功能且 `~/.claude/projects` 存在但不包含任何项目子目录
- **THEN** 系统显示空状态提示，说明未找到 Claude Code 项目

#### Scenario: 项目目录不存在
- **WHEN** 用户打开启动器功能且 `~/.claude/projects` 不存在
- **THEN** 系统显示说明该目录未找到的提示，而非抛出未处理的错误

### Requirement: 解码项目工作目录与显示名称

系统 SHALL 将每个项目子目录名解码为项目工作目录的真实文件系统路径，并 SHALL 据此推导出便于阅读的显示名称。由于目录名编码有损，系统 SHALL 优先从会话 `*.jsonl` 文件的 `cwd` 字段解析真实路径，仅在无可用会话时回退到对目录名的启发式解码。

#### Scenario: 从会话文件解析真实路径
- **WHEN** 某个项目子目录拥有可读取的会话文件且其中记录了 `cwd`
- **THEN** 系统使用该 `cwd` 作为真实工作目录路径，并使用其路径末段作为显示名称

#### Scenario: 回退到目录名解码
- **WHEN** 某个项目子目录没有任何可提供 `cwd` 的会话文件
- **THEN** 系统对目录名进行启发式解码作为工作目录，并将该条目标记为低置信度

#### Scenario: 解码后的工作目录已不存在
- **WHEN** 某个项目解码后的工作目录在磁盘上不存在
- **THEN** 系统仍然列出该项目，但将其标记为不可用并阻止启动

### Requirement: 按最近使用时间排序项目

系统 SHALL 按最近使用时间降序排列项目列表，其中"最近"取自每个项目会话文件中最新的修改时间。

#### Scenario: 按最近使用时间排序
- **WHEN** 显示项目列表
- **THEN** 最新会话文件修改时间最近的项目排在最前，其余项目按最近使用时间降序依次排列

#### Scenario: 项目没有会话文件
- **WHEN** 某个项目子目录不包含可读取的会话文件
- **THEN** 系统改用该子目录自身的修改时间进行排序，并仍然列出该项目

### Requirement: 搜索与键盘导航

系统 SHALL 允许用户通过输入文本过滤项目列表，并允许用户使用键盘导航与激活条目。高亮项 SHALL 自动滚动到可见区域。

#### Scenario: 按查询词过滤
- **WHEN** 用户在搜索框中输入文本
- **THEN** 列表仅显示显示名称或工作目录路径包含该查询词的项目，并在匹配项之间保持最近使用时间排序

#### Scenario: 键盘导航与激活
- **WHEN** 用户按下 上/下 方向键
- **THEN** 高亮条目随之移动，按下回车则启动当前高亮的项目

#### Scenario: 数字快捷键启动
- **WHEN** 用户按下 Alt+数字（1-9）
- **THEN** 系统启动列表中对应序号的项目

### Requirement: 在终端中以可配置命令启动项目

系统 SHALL 在所选项目的工作目录打开系统终端，并运行用户可配置的启动命令（默认为 `claude`）。启动行为 SHALL 按操作系统（Windows、macOS、Linux）分别实现。

#### Scenario: 启动所选项目
- **WHEN** 用户激活一个可用项目
- **THEN** 系统打开一个工作目录为该项目路径的终端，并执行配置的启动命令

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

在 Windows 上，系统 SHALL 使用用户配置的终端可执行文件路径启动项目，并 SHALL 自动识别该路径是标准 PowerShell 还是 Windows Terminal，分别采用正确的参数格式。

#### Scenario: 使用标准 PowerShell 启动
- **WHEN** 在 Windows 上启动项目且配置的终端路径指向 PowerShell（如 `powershell.exe` 或 `pwsh.exe`）
- **THEN** 系统通过 `cmd /c start` 打开新的 PowerShell 窗口，先进入项目目录再运行命令并保持窗口

#### Scenario: 使用 Windows Terminal 启动
- **WHEN** 在 Windows 上启动项目且配置的终端路径指向 Windows Terminal（路径包含 `WindowsTerminal.exe` 或 `wt.exe`）
- **THEN** 系统直接调用该可执行文件并在其中启动 PowerShell，先进入项目目录再运行命令并保持窗口

#### Scenario: 未配置时回退到默认 PowerShell
- **WHEN** 在 Windows 上启动项目但未配置终端路径
- **THEN** 系统探测并使用系统默认 PowerShell（优先 PowerShell 7+，否则 Windows PowerShell 5.1）

### Requirement: macOS 与 Linux 终端启动

系统 SHALL 在 macOS 和 Linux 上分别以适配方式打开系统终端并运行启动命令。

#### Scenario: macOS 启动
- **WHEN** 在 macOS 上启动项目
- **THEN** 系统通过 `osascript` 打开 Terminal.app，在项目目录运行命令

#### Scenario: Linux 启动
- **WHEN** 在 Linux 上启动项目
- **THEN** 系统按优先级探测常见终端模拟器（如 `x-terminal-emulator`、`gnome-terminal`、`konsole`、`xterm`），在项目目录运行命令；全部失败时给出清晰错误

### Requirement: 通过独立配置功能管理启动器设置

系统 SHALL 提供一个独立的配置功能（uTools 指令 `ccstartconf` / `配置`），允许用户配置终端可执行文件路径与自定义启动命令，并 SHALL 使用 uTools 存储在多次会话间持久化这些设置。启动器在启动项目时 SHALL 读取这些已保存的设置。

#### Scenario: 进入配置功能
- **WHEN** 用户触发 `ccstartconf` 指令
- **THEN** 系统打开配置界面，展示当前的终端路径与自定义命令设置

#### Scenario: 配置并持久化终端路径
- **WHEN** 用户在配置界面中设置终端可执行文件路径并保存
- **THEN** 系统持久化该路径，且后续在 Windows 上启动项目时使用它

#### Scenario: 配置并持久化自定义命令
- **WHEN** 用户在配置界面中修改自定义启动命令并保存，之后重新打开插件
- **THEN** 系统使用先前保存的自定义命令作为启动时运行的命令

#### Scenario: 首次使用时的默认设置
- **WHEN** 用户首次使用且没有已保存的设置
- **THEN** 系统使用 `claude` 作为默认启动命令，并在 Windows 上使用系统默认 PowerShell 路径

#### Scenario: 终端路径校验
- **WHEN** 用户输入的终端路径看起来是绝对路径但文件不存在
- **THEN** 系统显示路径不存在的警告（不阻止保存，允许 PATH 命令如 `wt.exe`）
