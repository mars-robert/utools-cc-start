## ADDED Requirements

### Requirement: API 环境配置入口

统一配置中心（cconf）SHALL 在侧边栏提供「API 环境」导航项，位于「启动配置」与「快捷命令」之后、「主题配置」之前。点击 SHALL 在内容区显示 API 环境配置页面。该入口图标建议使用 🔌。

#### Scenario: 进入 API 环境配置
- **WHEN** 用户在 cconf 页面点击侧边栏的「API 环境」
- **THEN** 系统在内容区显示 API 环境配置页面，列出所有环境配置

### Requirement: 环境配置卡片展示

API 环境配置页面 SHALL 以卡片网格形式展示所有环境（内置 + 自定义），每张卡片 SHALL 显示：环境名称、BASE_URL、AUTH_TOKEN（默认打码）、MODEL（可选）、状态徽标（内置/自定义/生效中）。当前激活环境的卡片 SHALL 用主色描边（2px solid）并显示「● 生效中」徽标。

#### Scenario: 展示环境配置列表
- **WHEN** 用户进入 API 环境配置页面
- **THEN** 系统以卡片网格展示所有环境，每张卡片包含名称、URL、token（打码）、model（若有）、状态徽标

#### Scenario: 标识当前生效环境
- **WHEN** 某个环境配置为当前激活状态
- **THEN** 该卡片用主色描边，右上角显示「● 生效中」徽标，底部显示「✓ 已生效」

#### Scenario: token 默认脱敏
- **WHEN** 用户查看环境配置卡片
- **THEN** token 字段显示为 `sk-••••••••`（保留前缀 + 8 个点），除非用户点击👁切换为明文

### Requirement: 内置官方环境

系统 SHALL 内置一个「官方 Anthropic」环境配置，BASE_URL 预设为 `https://api.anthropic.com`，token 初始为空，标记为 `builtin: true`。该配置 SHALL 不可删除，但允许编辑 token 与 model。首次创建配置文件时 SHALL 自动包含此环境。

#### Scenario: 首次使用自动创建内置环境
- **WHEN** 用户首次进入 API 环境配置页面且配置文件不存在
- **THEN** 系统自动创建配置文件，包含「官方 Anthropic」内置环境，activeId 为 null

#### Scenario: 内置环境不可删除
- **WHEN** 用户查看内置环境的卡片
- **THEN** 该卡片显示「[内置]」徽标，删除按钮置灰或隐藏

### Requirement: 新增与编辑环境

用户 SHALL 能够新增自定义环境配置，或编辑已有环境（包括内置环境的 token/model）。编辑 SHALL 通过弹窗表单进行，包含字段：名称（必填）、BASE_URL（必填）、AUTH_TOKEN（必填，type=password）、MODEL（可选）、自定义 KV 列表（可选）。保存后 SHALL 立即反映到卡片列表。

#### Scenario: 新增自定义环境
- **WHEN** 用户点击「+ 新增环境」按钮
- **THEN** 系统弹出编辑表单，用户填写名称、URL、token、model，点击保存后新环境出现在卡片列表

#### Scenario: 编辑已有环境
- **WHEN** 用户点击某个环境卡片的「编辑」按钮
- **THEN** 系统弹出编辑表单，预填该环境的当前值，用户修改后保存，卡片立即更新

#### Scenario: 编辑内置环境的 token
- **WHEN** 用户编辑内置「官方 Anthropic」环境
- **THEN** 系统允许修改 token 与 model，但不允许修改 name 与 baseUrl

### Requirement: 删除自定义环境

用户 SHALL 能够删除自定义环境配置（非 builtin）。删除前 SHALL 弹窗确认。删除后该卡片从列表消失。若删除的是当前激活环境，activeId SHALL 重置为 null，不再改动 settings.json。

#### Scenario: 删除自定义环境
- **WHEN** 用户点击某个自定义环境的「删除」按钮并确认
- **THEN** 系统删除该环境配置，卡片从列表消失

#### Scenario: 删除当前激活环境
- **WHEN** 用户删除当前激活的环境配置
- **THEN** activeId 重置为 null，顶部不再显示「当前生效」提示

### Requirement: 应用环境配置

用户 SHALL 通过点击卡片底部的「应用此环境」按钮来激活该环境。点击后 SHALL 弹出确认弹窗，明示将写入 settings.json 的键值、token 明文落盘警告、备份信息。确认后 SHALL 执行以下步骤：读取 `~/.claude/settings.json`，清除 managedKeys 中的旧键，写入新环境的 env 键值，备份原文件为 `.bak`，原子写入，更新配置文件的 activeId 与 managedKeys。成功后卡片状态立即更新为「● 生效中」。

#### Scenario: 应用环境弹出确认
- **WHEN** 用户点击某个环境的「应用此环境」按钮
- **THEN** 系统弹出确认弹窗，列出将写入的键值、明文警告、备份提示

#### Scenario: 确认应用写入 settings.json
- **WHEN** 用户在确认弹窗点击「确认写入」
- **THEN** 系统清理 managedKeys 旧键，写入新环境的 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL（若有），备份原 settings.json 为 .bak，原子写入，更新 cconf-envs.json 的 activeId 与 managedKeys

#### Scenario: 应用成功状态更新
- **WHEN** 应用环境操作成功
- **THEN** 该环境卡片显示「● 生效中」与主色描边，顶部显示「当前生效：<环境名>」，系统弹出通知「环境已应用」

#### Scenario: 应用失败提示错误
- **WHEN** 应用环境操作失败（如文件写入错误）
- **THEN** 系统关闭确认弹窗，弹出错误提示框显示失败原因

### Requirement: 受管键清理策略

系统 SHALL 在配置文件中维护一个 `managedKeys` 数组，记录本插件写入 settings.json 的 env 键集合。每次应用环境前，SHALL 从 settings.json 的 env 对象删除 managedKeys 中的所有键，再写入新环境的键，并更新 managedKeys 为本次写入的键集合。此机制 SHALL 确保不留残值，也不误删用户手动添加的其它 env 键（如 HTTP_PROXY）。

#### Scenario: 清理旧环境的键
- **WHEN** 用户从环境 A（有键 X）切换到环境 B（无键 X）
- **THEN** 系统从 settings.json 的 env 删除键 X，不写入键 X，managedKeys 更新为环境 B 的键集合

#### Scenario: 保留用户手动添加的键
- **WHEN** 用户在 settings.json 手动添加了 `HTTP_PROXY` 键，随后应用某个环境
- **THEN** 系统不删除 `HTTP_PROXY`（因为它不在 managedKeys 中），仅清理与写入本插件管理的键

### Requirement: 配置本地存储不同步

环境配置清单 SHALL 存储在本地文件 `~/.claude/cconf-envs.json`（明文 JSON），不经 uTools dbStorage / dbCryptoStorage（以避免同步到云端）。文件 SHALL 包含 version / activeId / managedKeys / configs 字段。写入 SHALL 采用备份（.bak）+ 原子写（tmp→rename）机制，与 claude-config.js 一致。

#### Scenario: 配置存储在本地文件
- **WHEN** 用户新增或修改环境配置
- **THEN** 系统写入 `~/.claude/cconf-envs.json`，不写入 uTools 数据库

#### Scenario: 写入前自动备份
- **WHEN** 系统写入 cconf-envs.json 或 settings.json
- **THEN** 系统先备份原文件为 `<文件名>.<时间戳>.bak`，再通过临时文件 + rename 原子写入

### Requirement: 默认无激活环境

首次创建配置文件时，activeId SHALL 设为 null，表示无激活环境。此时系统 SHALL 不修改 settings.json。老用户进入 API 环境配置页面时，SHALL 保持零影响——直到用户主动应用某个环境。

#### Scenario: 首次使用默认无激活
- **WHEN** 用户首次进入 API 环境配置页面
- **THEN** activeId 为 null，顶部不显示「当前生效」提示，settings.json 不被修改

#### Scenario: 老用户零影响
- **WHEN** 老用户进入 API 环境配置页面但从未应用过环境
- **THEN** 系统不修改 settings.json 的 env 字段，保持原样

### Requirement: token 可见性切换

每张卡片的 token 字段 SHALL 默认显示为 `sk-••••••••`（保留前缀 + 8 个点）。点击旁边的 👁 图标 SHALL 切换为明文显示。再次点击 SHALL 恢复打码。编辑弹窗中的 token 输入框 SHALL 使用 type=password。

#### Scenario: 点击👁查看明文 token
- **WHEN** 用户点击某个环境卡片 token 字段旁的 👁 图标
- **THEN** 该卡片的 token 从 `sk-••••••••` 切换为完整明文

#### Scenario: 再次点击恢复打码
- **WHEN** token 已显示为明文且用户再次点击 👁
- **THEN** token 恢复为 `sk-••••••••` 打码显示

### Requirement: 错误处理与降级

文件读取失败或解析错误 SHALL 降级为默认配置（包含内置环境，activeId: null），不抛异常。写入失败 SHALL 返回 `{ success: false, error }` 并通过弹窗告知用户。备份失败 SHALL 记录错误但不阻断写入。应用不存在的环境 id SHALL 返回错误。

#### Scenario: 配置文件损坏降级
- **WHEN** cconf-envs.json 文件损坏无法解析
- **THEN** 系统降级为默认配置，包含内置环境，activeId 为 null，不抛异常

#### Scenario: 写入失败提示用户
- **WHEN** 应用环境时写入 settings.json 失败
- **THEN** 系统返回 `{ success: false, error: <原因> }`，弹窗显示「应用失败：<原因>」
