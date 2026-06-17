# Windows Terminal 支持说明

## 功能概述

Claude Code 启动器现已支持使用 **Windows Terminal** 作为终端启动选项，同时保持对标准 PowerShell 的完全兼容。

## 支持的终端类型

### 1. 标准 PowerShell
- Windows PowerShell 5.x: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`
- PowerShell 7+: `C:\Program Files\PowerShell\7\pwsh.exe`

### 2. Windows Terminal
- 完整路径: `C:\terminal-1.24.10921.0\WindowsTerminal.exe`
- 系统命令: `wt.exe` (如果已添加到 PATH)

## 如何配置

### 步骤 1：打开配置界面
在 uTools 中输入 `ccstartconf` 或 `配置` 打开启动器配置界面。

### 步骤 2：设置终端路径
在 **"终端路径（PowerShell / Windows Terminal）"** 字段中输入以下任一路径：

**使用 Windows Terminal：**
```
C:\terminal-1.24.10921.0\WindowsTerminal.exe
```
或
```
wt.exe
```

**使用标准 PowerShell：**
```
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
```

### 步骤 3：保存配置
点击 **"保存"** 按钮。

## 工作原理

启动器会自动检测配置的终端类型：

### Windows Terminal 模式
当检测到路径包含 `WindowsTerminal.exe` 或 `wt.exe` 时：
```javascript
// 直接调用 Windows Terminal，在其中启动 PowerShell
wt.exe powershell.exe -NoExit -Command "Set-Location '项目路径'; claude"
```

### 标准 PowerShell 模式
当使用标准 PowerShell 路径时：
```javascript
// 通过 cmd 的 start 命令打开新的 PowerShell 窗口
cmd.exe /c start "" powershell.exe -NoExit -Command "Set-Location '项目路径'; claude"
```

## 优势

### 使用 Windows Terminal 的好处
- ✅ 现代化的终端界面
- ✅ 多标签页支持
- ✅ Unicode 和 emoji 完整支持
- ✅ GPU 加速渲染
- ✅ 自定义配色方案和字体
- ✅ 更好的复制粘贴体验

### 保持 PowerShell 兼容
- ✅ 无需修改现有配置
- ✅ 默认使用系统 PowerShell
- ✅ 支持 PowerShell 5.x 和 7+

## 示例配置

### 配置 1：使用 Windows Terminal
```
终端路径: C:\terminal-1.24.10921.0\WindowsTerminal.exe
启动命令: claude
```

### 配置 2：使用 PowerShell 7
```
终端路径: C:\Program Files\PowerShell\7\pwsh.exe
启动命令: claude
```

### 配置 3：使用系统默认 PowerShell
```
终端路径: (留空，自动检测)
启动命令: claude
```

## 故障排除

### 问题 1：Windows Terminal 无法启动
**现象**：配置了 Windows Terminal 但项目未启动

**解决方案**：
1. 检查路径是否正确：
   ```powershell
   Test-Path "C:\terminal-1.24.10921.0\WindowsTerminal.exe"
   ```
2. 如果路径不存在，请改用完整路径或 `wt.exe`

### 问题 2：参数错误提示
**现象**：报错 "The following arguments were not expected: -NoExit -Command"

**原因**：这是之前的问题，现已修复。启动器会自动识别终端类型并使用正确的参数格式。

**解决方案**：
- 更新到最新版本的插件
- 重新构建项目：`npm run build`

### 问题 3：路径验证警告
**现象**：配置界面显示 "该 PowerShell 路径不存在"

**解决方案**：
- 使用系统命令（如 `wt.exe`）可以忽略此警告
- 或使用完整的绝对路径

## 技术实现

### 核心代码
文件：`public/preload/services.js`

```javascript
// 检测是否为 Windows Terminal
function isWindowsTerminal (psPath) {
  if (!psPath) return false
  const normalized = psPath.toLowerCase()
  return normalized.includes('windowsterminal.exe') || normalized.includes('wt.exe')
}

function launchWindows (cwd, command, options) {
  const psPath = (options && options.powershellPath) || detectDefaultPowershell()
  const inner = `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'; ${command}`

  if (isWindowsTerminal(psPath)) {
    // Windows Terminal 模式
    const args = ['powershell.exe', '-NoExit', '-Command', inner]
    return spawn(psPath, args, { detached: true, stdio: 'ignore' })
  } else {
    // 标准 PowerShell 模式
    const args = ['/c', 'start', '""', psPath, '-NoExit', '-Command', inner]
    return spawn('cmd.exe', args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: false })
  }
}
```

## 版本历史

### v1.1.0 (当前)
- ✅ 添加 Windows Terminal 支持
- ✅ 自动检测终端类型
- ✅ 更新配置界面提示
- ✅ 添加暗色模式样式

### v1.0.0
- 初始版本，仅支持 PowerShell

## 相关资源

- [Windows Terminal 官方文档](https://docs.microsoft.com/zh-cn/windows/terminal/)
- [PowerShell 文档](https://docs.microsoft.com/zh-cn/powershell/)
- [Claude Code 文档](https://docs.anthropic.com/claude/docs)
