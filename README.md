## 插件应用工程已创建

这是一个 uTools 插件，用于快速切换并启动 Claude Code 项目。

## 功能特性

- ✅ 快速列出所有 Claude Code 项目
- ✅ 智能搜索和过滤项目
- ✅ 支持键盘快捷键（方向键、Alt+数字）
- ✅ 支持 PowerShell 和 Windows Terminal
- ✅ 自定义启动命令
- ✅ 自动检测项目可用性

## Windows Terminal 支持

插件现已支持使用 Windows Terminal 作为终端启动选项！

### 配置方法
1. 在 uTools 中输入 `ccstartconf` 或 `配置`
2. 在"终端路径"中输入 Windows Terminal 路径：
   - `C:\terminal-1.24.10921.0\WindowsTerminal.exe`
   - 或 `wt.exe`（如果已添加到 PATH）
3. 点击保存

详见：[Windows Terminal 支持说明](./WINDOWS-TERMINAL-SUPPORT.md)

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