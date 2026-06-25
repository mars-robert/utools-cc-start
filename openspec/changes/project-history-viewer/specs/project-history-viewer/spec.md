## ADDED Requirements

### Requirement: 历史页面采用左右(master-detail)布局

系统 SHALL 为某个项目提供历史页面,采用左右两栏布局:左栏为该项目资产列表,右栏为所选条目的详情内容。页面 SHALL 提供返回项目列表的途径(返回按钮或 `Esc` 键)。

#### Scenario: 进入历史页面
- **WHEN** 用户从项目列表对某个项目触发"历史"入口
- **THEN** 系统展示该项目的历史页面,左栏列出其资产,右栏在未选中任何条目时显示空状态提示

#### Scenario: 返回项目列表
- **WHEN** 用户在历史页面点击返回或按下 `Esc`
- **THEN** 系统回到项目列表视图,并恢复项目搜索框

### Requirement: 左栏分组展示记忆与历史会话

系统 SHALL 在左栏分两组展示当前项目的全部资产:**记忆**(来自 `~/.claude/projects/<dir>/memory/` 下的 `*.md`)与**历史会话**(来自该项目目录下的 `*.jsonl`)。每个会话条目 SHALL 以其会话标题与时间标识;每个记忆条目 SHALL 以其描述/名称标识。会话列表 SHALL 按最近修改时间降序排列。

#### Scenario: 同时展示两类资产
- **WHEN** 某项目既有记忆文件又有会话文件
- **THEN** 左栏在"记忆"分组下列出各记忆条目,在"历史会话"分组下按最近时间降序列出各会话条目

#### Scenario: 会话标题取自 ai-title
- **WHEN** 某会话文件中存在 `ai-title` 记录
- **THEN** 系统以最后一条 `ai-title` 的 `aiTitle` 作为该会话条目的标题

#### Scenario: 会话标题回退
- **WHEN** 某会话文件不存在任何 `ai-title` 记录
- **THEN** 系统回退使用首条真实用户消息文本作为标题,若仍无则使用"会话标识 + 时间"

#### Scenario: 仅有一类资产
- **WHEN** 某项目只有会话文件而没有记忆文件(或反之)
- **THEN** 系统仅展示存在的那一组,空的分组不展示或显示为空

### Requirement: 左栏搜索过滤

系统 SHALL 允许用户通过输入文本过滤左栏条目,匹配范围为记忆描述/名称与会话标题。

#### Scenario: 按查询词过滤左栏
- **WHEN** 用户输入过滤文本
- **THEN** 左栏仅保留标题或描述包含该文本的记忆与会话条目

### Requirement: 选中记忆时渲染其内容

系统 SHALL 在用户选中某记忆条目时,于右栏渲染该记忆 markdown 文件的内容,并 SHALL 展示其元数据(类型);记忆为只读展示,系统不修改记忆文件。

#### Scenario: 渲染记忆内容
- **WHEN** 用户在左栏选中一条记忆
- **THEN** 右栏以可读方式渲染该记忆的正文,并展示其类型标签

#### Scenario: 记忆关联来源会话
- **WHEN** 被选中记忆的 frontmatter 含 `originSessionId` 且该会话存在于当前项目
- **THEN** 系统提供从该记忆跳转到其来源会话的途径

### Requirement: 选中会话时按记录类型分样式渲染对话

系统 SHALL 在用户选中某会话时,懒加载并解析该会话文件,按记录与内容块类型以不同样式渲染:用户消息、助手正文、思考、工具调用、工具结果、系统提示各自采用区分样式;纯元数据记录(如 `mode`/`permission-mode`/`attachment`/`file-history-snapshot`/`last-prompt`/`ai-title`/`queue-operation`)默认隐藏。系统 SHALL 对未知记录类型安全跳过而不报错。

#### Scenario: 分样式渲染各类型
- **WHEN** 用户选中一个会话
- **THEN** 右栏按时间/文件顺序渲染对话,且用户消息、助手正文、思考、工具调用、工具结果、系统提示分别以不同样式呈现

#### Scenario: 工具调用与结果配对
- **WHEN** 会话包含 `tool_use` 与其对应的 `tool_result`
- **THEN** 系统按 `tool_use_id` 将两者关联呈现

#### Scenario: 重内容默认折叠
- **WHEN** 渲染 `thinking` 或体量较大的 `tool_result`
- **THEN** 系统默认折叠这些内容,允许用户展开查看

#### Scenario: 容错解析
- **WHEN** 会话文件中存在无法解析的行或未知记录类型
- **THEN** 系统跳过该行并继续渲染其余内容,不中断或抛出未处理错误

### Requirement: 从历史页面恢复会话

系统 SHALL 允许用户对所选会话在系统终端中恢复(执行 `claude --resume <sessionId>`),恢复 SHALL 复用启动器已配置的终端与路径,并在项目工作目录中执行。

#### Scenario: 恢复所选会话
- **WHEN** 用户对某个会话触发"恢复会话"
- **THEN** 系统在该项目工作目录打开终端并执行 `claude --resume <sessionId>`

#### Scenario: 恢复失败报告
- **WHEN** 终端无法打开或命令未能启动
- **THEN** 系统向用户呈现错误信息,而不会静默失败

### Requirement: 导出会话内容

系统 SHALL 允许用户将所选会话导出为 Markdown 对话稿,并 SHALL 提供复制到剪贴板与另存为文件两种途径。导出内容 SHALL 反映分样式渲染所用的同一份会话解析结果(用户/助手/工具调用/工具结果等)。

#### Scenario: 复制会话为 Markdown
- **WHEN** 用户对某个会话触发"复制导出"
- **THEN** 系统将该会话的 Markdown 对话稿写入剪贴板

#### Scenario: 另存会话为文件
- **WHEN** 用户对某个会话触发"另存导出"并选择保存路径
- **THEN** 系统将该会话的 Markdown 对话稿写入所选文件
