## 1. 插件功能注册

- [x] 1.1 在 `public/plugin.json` 中新增 `ccrun` 功能项，设置 `code: "ccrun"`、`explain` 及指令关键字 `ccrun`
- [x] 1.2 在 `public/plugin.json` 中新增 `ccrun-manage` 管理功能项，设置 `code: "ccrun-manage"`、`explain` 及指令关键字 `管理命令`
- [x] 1.3 在 uTools 开发模式中验证两个新功能均出现，且不破坏既有功能

## 2. 预加载服务（Node 层）

- [x] 2.1 在 `public/preload/services.js` 中定义内置命令库 `BUILTIN_COMMANDS`，包含 Claude CLI、OpenSpec、npm、git 常用命令
- [x] 2.2 实现 `getAllCommands()` 函数，返回内置命令 + 自定义命令的合并列表
- [x] 2.3 实现 `getCustomCommands()` 函数，从 `utools.dbStorage` 读取自定义命令
- [x] 2.4 实现 `addCustomCommand(command)` 函数，添加自定义命令并持久化
- [x] 2.5 实现 `updateCustomCommand(id, updates)` 函数，更新自定义命令
- [x] 2.6 实现 `deleteCustomCommand(id)` 函数，删除自定义命令
- [x] 2.7 实现 `saveLastProjectDir(dir)` 函数，保存最近使用的项目目录
- [x] 2.8 实现 `getLastUsedProjectDir()` 函数，获取最近使用的项目目录
- [x] 2.9 确保命令执行复用现有的 `launchProject(cwd, command, options)` 函数

## 3. 命令列表视图（ccrun）

- [x] 3.1 创建 `src/CommandList/index.vue`，接收 `enterAction` prop
- [x] 3.2 挂载时调用 `window.services.getAllCommands()` 加载所有命令
- [x] 3.3 实现命令列表渲染，显示命令名称、命令文本、描述、类型标记（内置/自定义）、执行位置图标（📂/⚡）
- [x] 3.4 实现搜索过滤功能，使用 `utools.setSubInput` 接管搜索输入
- [x] 3.5 实现键盘导航（上/下方向键选择，回车执行）
- [x] 3.6 实现鼠标点击执行
- [x] 3.7 实现命令执行逻辑：
  - [x] 3.7.1 判断 `needsProjectDir`，获取工作目录（当前目录或最近项目目录）
  - [x] 3.7.2 调用 `window.services.launchProject(cwd, command, settings)`
  - [x] 3.7.3 执行成功后调用 `window.utools.outPlugin()` 关闭插件
  - [x] 3.7.4 执行失败显示错误通知
- [x] 3.8 渲染空状态提示（无匹配命令时）
- [x] 3.9 添加底部提示文本（操作说明）

## 4. 命令管理视图（ccrun-manage）

- [x] 4.1 创建 `src/CommandManage/index.vue`，显示所有自定义命令列表
- [x] 4.2 实现添加命令对话框：
  - [x] 4.2.1 输入名称、命令文本、描述（可选）
  - [x] 4.2.2 选择是否需要在项目目录执行
  - [x] 4.2.3 保存按钮调用 `window.services.addCustomCommand`
- [x] 4.3 实现编辑命令功能：
  - [x] 4.3.1 点击编辑按钮打开对话框，填充现有数据
  - [x] 4.3.2 保存按钮调用 `window.services.updateCustomCommand`
- [x] 4.4 实现删除命令功能：
  - [x] 4.4.1 点击删除按钮弹出确认对话框
  - [x] 4.4.2 确认后调用 `window.services.deleteCustomCommand`
- [x] 4.5 渲染空状态提示（无自定义命令时）
- [x] 4.6 实现对话框样式和交互（覆盖层、表单验证）

## 5. 路由集成

- [x] 5.1 在 `src/App.vue` 中导入 `CommandList` 和 `CommandManage` 组件
- [x] 5.2 新增 `v-if="route === 'ccrun'"` 分支渲染 `CommandList`
- [x] 5.3 新增 `v-if="route === 'ccrun-manage'"` 分支渲染 `CommandManage`

## 6. 与现有功能联动

- [x] 6.1 在 `ProjectLauncher` 的 `launch` 函数中，成功启动项目后调用 `window.services.saveLastProjectDir(project.cwd)` 记录项目目录
- [x] 6.2 确保 `ccrun` 执行需要项目目录的命令时能正确获取最近项目目录

## 7. 内置命令定义

- [x] 7.1 定义 Claude CLI 相关命令（升级、查看版本、帮助）
- [x] 7.2 定义 OpenSpec 相关命令（升级、查看版本、状态、初始化、列出变更）
- [x] 7.3 定义 npm 相关命令（清理缓存、查看全局包）
- [x] 7.4 定义 git 相关命令（状态、拉取代码、查看分支、提交历史）
- [x] 7.5 确保所有内置命令的 `needsProjectDir` 标记正确

## 8. 样式实现

- [x] 8.1 实现 `CommandList` 组件样式（列表、高亮、图标、搜索提示）
- [x] 8.2 实现 `CommandManage` 组件样式（列表、按钮、对话框）
- [x] 8.3 添加暗色模式适配（`@media (prefers-color-scheme: dark)`）
- [x] 8.4 确保样式与现有功能风格一致

## 9. 验证

- [x] 9.1 运行 `npm run build`，确认无错误编译通过
- [x] 9.2 在 uTools 开发模式中打开 `ccrun` 功能，确认命令列表正常显示
- [x] 9.3 测试搜索过滤功能
- [x] 9.4 测试键盘导航（方向键和回车）
- [x] 9.5 测试执行不需要项目目录的命令（如升级命令）
- [x] 9.6 测试执行需要项目目录的命令（如 git status）
- [x] 9.7 在 `管理命令` 中添加自定义命令，确认持久化
- [x] 9.8 测试编辑和删除自定义命令
- [x] 9.9 确认通过 `ccstart` 启动项目后，`ccrun` 能使用该项目目录
- [x] 9.10 确认关闭并重新打开插件后自定义命令仍然保留
