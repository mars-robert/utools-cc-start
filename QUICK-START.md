# 快速使用指南

## 立即开始使用 Windows Terminal

### 1. 构建插件
```bash
npm run build
```

### 2. 在 uTools 中配置

1. 打开 uTools
2. 输入 `ccstartconf` 或 `配置`
3. 在"终端路径"字段中输入：
   ```
   C:\terminal-1.24.10921.0\WindowsTerminal.exe
   ```
   或者如果 Windows Terminal 已在 PATH 中：
   ```
   wt.exe
   ```
4. 点击"保存"

### 3. 启动项目

1. 在 uTools 中输入 `ccstart` 或 `cc`
2. 选择你的 Claude Code 项目
3. 按 Enter 或点击项目
4. 项目将在 Windows Terminal 中打开！

## 键盘快捷键

- **方向键 ↑↓**: 选择项目
- **Enter**: 启动选中的项目
- **Alt + 1-9**: 快速启动前 9 个项目
- **输入文本**: 搜索过滤项目

## 配置选项

### 终端路径
支持的值：
- `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` (默认)
- `C:\Program Files\PowerShell\7\pwsh.exe` (PowerShell 7+)
- `C:\terminal-1.24.10921.0\WindowsTerminal.exe` (Windows Terminal)
- `wt.exe` (Windows Terminal 简写)

### 启动命令
默认: `claude`

可以自定义为任何命令，例如：
- `code .` (在 VS Code 中打开)
- `idea .` (在 IntelliJ IDEA 中打开)
- `bash` (启动 bash shell)

## 验证配置

### 测试 Windows Terminal 路径
```powershell
Test-Path "C:\terminal-1.24.10921.0\WindowsTerminal.exe"
```
应该返回 `True`

### 测试 wt.exe 是否可用
```powershell
Get-Command wt.exe
```
如果返回路径信息，说明可以使用 `wt.exe`

## 切换回 PowerShell

如果想切换回标准 PowerShell：
1. 打开配置界面
2. 将终端路径改为：
   ```
   C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
   ```
3. 保存

或者留空，插件会自动检测系统默认 PowerShell。

## 常见问题

### Q: 为什么推荐使用 Windows Terminal？
A: Windows Terminal 提供更好的用户体验：
- 多标签页支持
- GPU 加速
- 更好的字体渲染
- 完整的 Unicode 支持
- 自定义主题

### Q: 我可以混合使用吗？
A: 可以随时在配置中切换，不同项目启动时会使用当前配置的终端。

### Q: 配置存储在哪里？
A: 配置通过 uTools 的 `dbStorage` API 存储在本地，不会丢失。

## 技术细节

插件会自动检测终端类型：
- 包含 `windowsterminal.exe` 或 `wt.exe` → Windows Terminal 模式
- 其他路径 → 标准 PowerShell 模式

不同模式使用不同的启动参数，确保兼容性。
