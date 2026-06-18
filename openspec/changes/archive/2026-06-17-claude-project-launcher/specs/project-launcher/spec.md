## ADDED Requirements

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

系统 SHALL 将每个项目子目录名解码为项目工作目录的真实文件系统路径，并 SHALL 据此推导出便于阅读的显示名称。

#### Scenario: 将编码目录名解码为真实路径
- **WHEN** 某个项目子目录拥有表示文件系统路径的编码名称
- **THEN** 系统解析出真实的工作目录路径，并使用其路径末段作为显示名称

#### Scenario: 解码后的工作目录已不存在
- **WHEN** 某个项目解码后的工作目录在磁盘上不存在
- **THEN** 系统仍然列出该项目，但将其标记为不可用并阻止启动

### Requirement: 按最近使用时间排序项目

系统 SHALL 按最近使用时间降序排列项目列表，其中“最近”取自每个项目会话文件中最新的修改时间。

#### Scenario: 按最近使用时间排序
- **WHEN** 显示项目列表
- **THEN** 最新会话文件修改时间最近的项目排在最前，其余项目按最近使用时间降序依次排列

#### Scenario: 项目没有会话文件
- **WHEN** 某个项目子目录不包含可读取的会话文件
- **THEN** 系统改用该子目录自身的修改时间进行排序，并仍然列出该项目

### Requirement: 搜索与键盘导航

系统 SHALL 允许用户通过输入文本过滤项目列表，并允许用户使用键盘导航与激活条目。

#### Scenario: 按查询词过滤
- **WHEN** 用户在搜索框中输入文本
- **THEN** 列表仅显示显示名称或工作目录路径包含该查询词的项目，并在匹配项之间保持最近使用时间排序

#### Scenario: 键盘导航与激活
- **WHEN** 用户按下 上/下 方向键
- **THEN** 高亮条目随之移动，按下回车则启动当前高亮的项目

### Requirement: 在终端中以可配置命令启动项目

系统 SHALL 在所选项目的工作目录打开系统终端，并运行用户可配置的启动命令（默认为 `claude`）。启动行为 SHALL 按操作系统（Windows、macOS、Linux）分别实现，在 Windows 上 SHALL 使用用户配置的 PowerShell 可执行文件路径启动终端。

#### Scenario: 启动所选项目
- **WHEN** 用户激活一个可用项目
- **THEN** 系统打开一个工作目录为该项目路径的终端，并执行配置的启动命令

#### Scenario: Windows 使用配置的 PowerShell 路径
- **WHEN** 在 Windows 上启动项目且已配置 PowerShell 可执行文件路径
- **THEN** 系统使用该 PowerShell 路径打开终端并运行命令

#### Scenario: 报告启动失败
- **WHEN** 无法打开终端或命令未能启动
- **THEN** 系统向用户呈现错误信息，而不会静默失败

#### Scenario: 不可用项目无法启动
- **WHEN** 用户尝试激活一个被标记为不可用的项目
- **THEN** 系统阻止启动并说明原因

### Requirement: 通过独立配置功能管理启动器设置

系统 SHALL 提供一个独立的配置功能（uTools 指令 `ccstartconf`），允许用户配置 PowerShell 可执行文件路径与自定义启动命令，并 SHALL 使用 uTools 存储在多次会话间持久化这些设置。启动器在启动项目时 SHALL 读取这些已保存的设置。

#### Scenario: 进入配置功能
- **WHEN** 用户触发 `ccstartconf` 指令
- **THEN** 系统打开配置界面，展示当前的 PowerShell 路径与自定义命令设置

#### Scenario: 配置并持久化 PowerShell 路径
- **WHEN** 用户在配置界面中设置 PowerShell 可执行文件路径并保存
- **THEN** 系统持久化该路径，且后续在 Windows 上启动项目时使用它

#### Scenario: 配置并持久化自定义命令
- **WHEN** 用户在配置界面中修改自定义启动命令并保存，之后重新打开插件
- **THEN** 系统使用先前保存的自定义命令作为启动时运行的命令

#### Scenario: 首次使用时的默认设置
- **WHEN** 用户首次使用且没有已保存的设置
- **THEN** 系统使用 `claude` 作为默认启动命令，并在 Windows 上使用系统默认 PowerShell 路径
