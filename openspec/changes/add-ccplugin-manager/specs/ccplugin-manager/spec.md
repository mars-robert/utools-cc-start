## ADDED Requirements

### Requirement: 插件中心入口与页面框架

系统 SHALL 提供 `ccplugin` 功能命令（关键词 `ccplugin`、`ccp`、`插件`），触发后进入「插件中心」页面。页面 SHALL 采用标签式布局，包含「已装插件」「商城管理」「热门发现」三个分区，并保持与现有页面一致的暗色主题、主色变量与交互范式。

#### Scenario: 打开插件中心
- **WHEN** 用户触发 `ccplugin` / `ccp` / `插件` 指令
- **THEN** 系统渲染插件中心页面，默认停留在「已装插件」分区

#### Scenario: 切换分区
- **WHEN** 用户点击「商城管理」或「热门发现」标签
- **THEN** 系统切换到对应分区并保留其余分区的加载状态，不丢失已获取的数据

### Requirement: 浏览已安装插件

系统 SHALL 读取 Claude Code 的真实状态（`~/.claude/plugins/installed_plugins.json` 与 `~/.claude/settings.json` 的 `enabledPlugins`）展示已安装插件列表。每个插件 SHALL 显示插件名、所属商城、版本、启用/停用状态、**功能描述**、以及**能力指纹**（技能 / 命令 / 子代理数量，以及是否含 hooks / MCP）。功能信息 SHALL 从插件安装目录本地提取（`.claude-plugin/plugin.json` 描述 + 目录扫描组件计数），无需联网或调用 CLI；缺失时安全降级。读取为纯只读，缺失或损坏的文件 SHALL 安全降级为空列表而非报错崩溃。

#### Scenario: 展示已装插件
- **WHEN** 用户进入「已装插件」分区
- **THEN** 系统列出每个已安装插件的 `名称@商城`、版本、启/停状态

#### Scenario: 展示插件功能
- **WHEN** 展示某个已安装插件
- **THEN** 系统显示其功能描述与能力指纹（如「13 skills · 14 命令 · 12 agents · hooks」），使用户无需打开插件即可了解它能做什么

#### Scenario: 卡片式布局与右上角操作
- **WHEN** 进入「已装插件」分区
- **THEN** 插件以卡片网格呈现（一行多张），每张卡片的操作集中在右上角：启用/停用为开关，更新/卸载为按钮

### Requirement: 插件详情弹窗

系统 SHALL 允许用户点击某个已安装插件打开详情弹窗，展示其完整描述、版本 / 范围 / 安装时间 / 作者 / 许可证 / 主页等元信息，以及该插件提供的技能 / 命令 / 子代理的**名称清单**与 hooks / MCP 能力。弹窗内 SHALL 支持直接启用/停用（开关）、更新、卸载。UI 强调色 SHALL 关联主题设置的主色（`--primary-color`）。

#### Scenario: 打开详情
- **WHEN** 用户点击某已安装插件卡片
- **THEN** 系统弹出详情弹窗，展示其元信息与技能/命令/子代理的名称清单

#### Scenario: 详情内操作
- **WHEN** 用户在详情弹窗内切换启用开关或点击更新 / 卸载
- **THEN** 系统执行对应操作，并刷新详情与列表状态

#### Scenario: 关闭详情
- **WHEN** 用户点击关闭、遮罩或按 Esc
- **THEN** 系统关闭详情弹窗

#### Scenario: 状态文件缺失
- **WHEN** `installed_plugins.json` 不存在或无法解析
- **THEN** 系统显示空列表与友好提示，不抛出异常

### Requirement: 启用与停用插件

系统 SHALL 允许用户对已安装插件进行启用与停用，操作经 `claude plugin enable/disable` 执行。操作完成后系统 SHALL 刷新该插件的状态展示，并在失败时展示错误信息。

#### Scenario: 停用已启用插件
- **WHEN** 用户对一个已启用插件点击「停用」
- **THEN** 系统执行停用操作，成功后该插件显示为「已停用」

#### Scenario: 启用已停用插件
- **WHEN** 用户对一个已停用插件点击「启用」
- **THEN** 系统执行启用操作，成功后该插件显示为「已启用」

#### Scenario: 操作失败反馈
- **WHEN** 启用/停用命令返回非零退出码
- **THEN** 系统展示失败原因，且不改变该插件的显示状态

### Requirement: 更新与卸载插件

系统 SHALL 允许用户更新或卸载已安装插件，分别经 `claude plugin update` 与 `claude plugin uninstall` 执行。卸载 SHALL 需要用户二次确认。操作完成后系统 SHALL 刷新已装插件列表。

#### Scenario: 卸载需确认
- **WHEN** 用户点击某插件的「卸载」
- **THEN** 系统弹出二次确认，仅在确认后才执行卸载

#### Scenario: 更新插件
- **WHEN** 用户点击某插件的「更新」
- **THEN** 系统执行更新操作，成功后刷新该插件的版本信息

### Requirement: 浏览已知商城及其可安装插件

系统 SHALL 读取 `~/.claude/plugins/known_marketplaces.json` 列出已知商城；对每个已克隆商城，SHALL 读取其 `marketplaces/<mp>/.claude-plugin/marketplace.json` 展示可安装插件（名称、简介、分类、作者）。列表 SHALL 标注哪些插件已安装。

#### Scenario: 展示已知商城
- **WHEN** 用户进入「商城管理」分区
- **THEN** 系统列出所有已知商城及其来源（GitHub repo 或 git URL）

#### Scenario: 展开商城查看插件
- **WHEN** 用户展开某个已克隆商城
- **THEN** 系统列出该商城 `marketplace.json` 中的插件，并对已安装的插件加以标记

### Requirement: 添加与移除商城

系统 SHALL 允许用户通过 GitHub `owner/repo` 或 git URL 添加商城（经 `claude plugin marketplace add`），并允许移除已知商城（经 `claude plugin marketplace remove`）。移除 SHALL 需要二次确认。操作完成后系统 SHALL 刷新商城列表。

#### Scenario: 添加商城
- **WHEN** 用户输入合法的 GitHub repo 或 git URL 并提交
- **THEN** 系统执行添加操作，成功后新商城出现在已知商城列表中

#### Scenario: 移除商城需确认
- **WHEN** 用户点击某商城的「移除」
- **THEN** 系统弹出二次确认，仅在确认后才执行移除

#### Scenario: 非法来源
- **WHEN** 用户提交的商城来源为空或格式明显非法
- **THEN** 系统阻止提交并给出输入提示

### Requirement: 从商城安装插件

系统 SHALL 允许用户从某商城的可安装插件列表中一键安装插件，经 `claude plugin install <plugin>@<marketplace>` 执行。操作完成后系统 SHALL 刷新已装插件与该商城插件的安装标记。

#### Scenario: 安装商城插件
- **WHEN** 用户对某商城中一个未安装的插件点击「安装」
- **THEN** 系统执行安装操作，成功后该插件在已装插件列表出现并标记为已安装

#### Scenario: 重复安装保护
- **WHEN** 用户对一个已安装插件查看安装入口
- **THEN** 系统不提供「安装」动作，改为展示已安装标记

### Requirement: 热门商城与插件推荐（互联网获取）

系统 SHALL 在「热门发现」分区从互联网获取「热门商城」与「插件推荐」榜单并展示，每条 SHALL 至少显示名称、简介、分类，若数据源提供则一并显示 star 等元信息。系统 SHALL 对已知商城 / 已安装插件做去重标记，并为每条提供相应动作（未知商城→「添加」，未装推荐插件→「安装」，已存在→标记）。

#### Scenario: 展示热门榜单
- **WHEN** 用户进入「热门发现」分区且网络可用
- **THEN** 系统展示热门商城与推荐插件榜单，含名称、简介、分类等元信息

#### Scenario: 一键添加热门商城
- **WHEN** 用户对榜单中一个尚未添加的热门商城点击「添加」
- **THEN** 系统执行商城添加，成功后该项标记为「已添加」

#### Scenario: 去重标记
- **WHEN** 榜单中的商城或插件已存在于已知商城 / 已安装插件
- **THEN** 系统将其标记为「已添加」/「已安装」而非提供重复动作

### Requirement: 网络降级与缓存

系统 SHALL 通过 HTTPS 获取热门榜单，请求 SHALL 设置超时。成功获取的数据 SHALL 缓存到本地（含拉取时间戳）。当网络失败或超时，系统 SHALL 依次回退到本地缓存、再到内置离线兜底清单，并提示数据为「缓存/离线」，不得使页面报错或空白。

#### Scenario: 网络成功
- **WHEN** 榜单 HTTPS 请求在超时内成功返回
- **THEN** 系统展示最新榜单并更新本地缓存与时间戳

#### Scenario: 网络失败回退缓存
- **WHEN** 榜单请求失败或超时且存在本地缓存
- **THEN** 系统展示缓存数据并提示为「缓存」内容

#### Scenario: 无缓存回退内置清单
- **WHEN** 榜单请求失败且无本地缓存
- **THEN** 系统展示内置离线兜底清单并提示为「离线」内容

### Requirement: 搜索与键盘导航

系统 SHALL 支持在当前分区内通过 uTools 子输入框实时过滤列表（匹配名称/简介），并支持方向键在列表项间移动、回车触发当前项的主操作，高亮项 SHALL 自动滚动到可见区域。

#### Scenario: 实时过滤
- **WHEN** 用户在子输入框输入文本
- **THEN** 当前分区列表仅显示名称或简介匹配该文本的项

#### Scenario: 键盘导航与执行
- **WHEN** 用户使用上/下方向键移动并按回车
- **THEN** 高亮项随之移动并滚动到可见区域，回车触发该项的主操作

### Requirement: 变更操作经 claude CLI 执行且依赖检测降级

系统的所有插件/商城**变更**操作 SHALL 通过在系统中调用 `claude plugin …` 子命令完成，而非直接改写 Claude Code 的配置文件。当 PATH 上不存在可用的 `claude` CLI 时，系统 SHALL 降级为只读浏览模式：隐藏或禁用所有变更动作并明确提示。

#### Scenario: 经 CLI 执行变更
- **WHEN** 用户触发任一变更操作（安装/卸载/启停/更新/增删商城）
- **THEN** 系统调用对应 `claude plugin` 子命令执行，并根据退出码给出成功或失败反馈

#### Scenario: 缺少 claude CLI
- **WHEN** 系统检测不到可用的 `claude` 可执行文件
- **THEN** 浏览类功能仍可用，所有变更动作被禁用并提示需要安装 Claude Code CLI
