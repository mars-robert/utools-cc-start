## 背景与动机（Why）

开发者在使用 Claude Code、OpenSpec 等工具时，经常需要执行一些常用命令，比如：
- 升级 Claude CLI：`npm install -g @anthropic-ai/claude-cli@latest`
- 升级 OpenSpec：`npm install -g openspec@latest`
- 查看版本信息、清理缓存等

这些命令虽然常用，但难以记忆，每次都需要查文档或搜索历史记录，效率低下。同时，不同项目可能有特定的常用命令（如启动开发服务器、运行测试等），也需要一个统一的管理和执行入口。

通过在 uTools 插件中新增 `ccrun` 功能，提供一个命令列表，用户可以快速选择并在终端中执行，大幅提升开发效率。

## 变更内容（What Changes）

- 新增一个 uTools 功能（`ccrun` 指令），列出所有可用的开发命令（内置 + 自定义）
- 内置常用命令：Claude CLI、OpenSpec、npm、git 等工具的常用操作
- 支持用户添加、编辑、删除自定义命令
- 提供搜索过滤功能，快速定位需要的命令
- 选中命令后直接回车执行，无需二次确认
- 命令支持两种执行位置：任意位置执行 / 需要在项目目录执行
- 通过独立的管理功能（`管理命令` 指令）维护自定义命令

## 能力（Capabilities）

### 新增能力（New Capabilities）
- `command-runner`：快速执行常用开发命令（`ccrun` 指令），展示内置和自定义命令列表，支持搜索和键盘导航，选中后直接在终端中执行；并提供独立的管理功能（`管理命令` 指令）用于添加、编辑、删除自定义命令。

### 修改能力（Modified Capabilities）
<!-- 无：这是全新功能 -->

## 影响（Impact）

- **plugin.json**：新增 `ccrun` 和 `ccrun-manage` 两个功能项
- **渲染层（Vue）**：新增 `CommandList` 和 `CommandManage` 视图组件，并在 `App.vue` 中增加对应路由分支
- **预加载层（`public/preload/services.js`）**：新增命令管理相关的服务函数（获取命令、添加/编辑/删除自定义命令、执行命令）
- **持久化**：使用 uTools `dbStorage` 保存用户自定义命令
- **复用现有能力**：命令执行复用 `launchProject` 函数在终端中运行命令
- 对现有 `ccstart`、`ccstartconf` 等功能无破坏性变更

## 与现有功能的关系

- `ccstart`：启动 Claude Code 项目
- `ccrun`：执行常用开发命令
- 两者互补：前者专注项目启动，后者专注命令执行
- 可以联动：在项目启动器中按快捷键可以打开 ccrun（未来扩展）
