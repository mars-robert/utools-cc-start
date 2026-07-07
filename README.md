## 插件应用工程已创建

这是一个 uTools 插件，用于快速切换并启动 Claude Code 项目。

## 功能特性

- ✅ 快速列出所有 Claude Code 项目
- ✅ 智能搜索和过滤项目
- ✅ 支持键盘快捷键（方向键、Alt+数字）
- ✅ 统一配置中心：启动配置与快捷命令集中管理
- ✅ 启动命令下拉选择（claude 及其变体），支持自定义增删改
- ✅ 终端下拉选择（Windows PowerShell / pwsh / Windows Terminal / CMD），支持自定义终端路径
- ✅ 快捷命令（ccrun）全部可增删改，含内置命令的修改/删除与恢复默认
- ✅ 插件中心（ccplugin）：Claude Code 插件商城与插件管理 + 热门发现
- ✅ 自动检测项目可用性

## 统一配置中心

启动配置与命令管理已合并为单一入口的「统一配置中心」，采用左右分栏的现代化卡片式界面。

### 进入方式
1. 在 uTools 中输入 `cconf` / `ccstartconf` / `配置`
2. 左侧导航切换分区：
   - **📦 启动配置**：以单选列表选择启动命令与终端；点击「+ 新增」管理自定义项（内置预设不可删除）
   - **⚡ 快捷命令**：增删改全部命令，内置命令可编辑/删除并「恢复默认」

### UI 特性
- 左侧固定导航 + 右侧可滚动内容区
- 启动命令、终端均为单选列表（radio），所有选项一目了然，无需展开下拉
- 预设终端路径可见可编辑：系统探测到的路径默认填入输入框，可修改后点「保存路径」覆盖，或「恢复默认」还原
- 卡片式视觉风格，自动适配暗色主题

> 迁移提示：旧的 `管理命令`（`ccrun-manage`）独立入口已移除，其功能并入「快捷命令」分区。旧的启动器设置会在首次进入时自动迁移到新的列表模型。

### Windows Terminal / 自定义终端
在「启动配置」标签页的终端下拉中选择 **Windows Terminal**，或点击「+ 新增」添加自定义终端可执行文件路径（如 `wt.exe` 或 `C:\path\to\WindowsTerminal.exe`）。

详见：[Windows Terminal 支持说明](./WINDOWS-TERMINAL-SUPPORT.md)

## 插件中心（ccplugin）

在 uTools 中输入 `ccplugin` / `ccp` / `插件` 进入，用于管理 Claude Code 的插件生态，分三个标签页：

- **已装插件**：读取 Claude Code 真实状态（`~/.claude/plugins/installed_plugins.json` + `settings.json` 的 `enabledPlugins`），展示插件的商城归属、版本与启停状态，可**启用 / 停用 / 更新 / 卸载**。
- **商城管理**：列出已知商城，展开可查看该商城的可安装插件；支持**添加商城**（GitHub `owner/repo` 或 git URL）、**移除商城**、**从商城安装插件**。
- **热门发现**：从互联网获取的热门商城与插件推荐榜单，一键添加商城或安装推荐插件；已存在项自动标记。数据来源标注为「实时 / 缓存 / 离线」，断网时回退本地缓存与内置精选清单。

### 工作方式
- **浏览**直接读取 `~/.claude` 下的 JSON，快速且离线可用；**变更**统一通过调用 `claude plugin …` 子命令完成（复用 Claude Code 官方的下载/版本/缓存逻辑，本插件不直接改写其配置文件）。
- **热门发现**的数据实时来自 GitHub：插件推荐取自官方目录 `anthropics/claude-plugins-official`，热门商城由 GitHub 仓库搜索（按 Star）经 `.claude-plugin/marketplace.json` 校验得到；结果本地缓存，断网时显示缓存或空态，不含硬编码数据。
- 部分变更（如插件更新）需**重启 Claude Code 会话**后完全生效。
- 未检测到 `claude` CLI 时，插件中心降级为**只读浏览**并给出提示。

# 开发

### 第一步，安装依赖包

```
npm i
```

### 第二步，开发模式

```
npm run dev
```

### 第三步，检测服务端口

检测 Vite 服务端口，如果端口不是 【5173】, 请修改 plugin.json 文件 development.main 为对应端口

# 发布

### 第一步，构建

```
npm run build
```

### 第二步，选择 dist 目录发布

构建成功将会生成 dist 目录