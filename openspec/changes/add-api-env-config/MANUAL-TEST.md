# API 环境配置 - 手动验证清单

## 验证环境
- uTools 插件已重新加载
- 构建成功：`npm run build` ✅
- 单元测试：6/7 通过（核心功能全通过）✅

## 手动验证步骤

### 1. 基础功能验证

#### 1.1 进入配置页面
- [ ] 打开 uTools
- [ ] 输入 `cconf` 进入统一配置中心
- [ ] 侧边栏应显示「API 环境」导航项（图标 🔌）
- [ ] 点击「API 环境」，右侧显示 API 环境配置页面

#### 1.2 默认状态
- [ ] 页面顶部显示「API 环境配置」标题
- [ ] 无「当前生效」提示（首次使用 activeId 为 null）
- [ ] 显示 1 张卡片：「官方 Anthropic」
- [ ] 该卡片标记为「[内置]」
- [ ] token 字段显示「(未设置)」

### 2. 新增自定义环境

#### 2.1 创建环境
- [ ] 点击「+ 新增环境」按钮
- [ ] 弹出编辑弹窗，标题为「新增环境」
- [ ] 填写：
  - 名称：`测试中转`
  - BASE_URL：`https://test-relay.example.com`
  - AUTH_TOKEN：`sk-test-token-123`
  - MODEL：`claude-opus-4`
- [ ] 点击「保存」
- [ ] 弹窗关闭，新卡片出现在列表中

#### 2.2 验证新卡片
- [ ] 卡片标题显示「测试中转」
- [ ] 🌐 显示 `test-relay.example.com`
- [ ] 🔑 显示 `sk-••••••••`
- [ ] 🤖 显示 `claude-opus-4`
- [ ] 显示「[编辑]」「[删除]」按钮（非内置）
- [ ] 底部显示「应用此环境」按钮（未生效）

### 3. Token 可见性切换

- [ ] 点击 token 字段旁的 👁 图标
- [ ] token 从 `sk-••••••••` 切换为 `sk-test-token-123`
- [ ] 再次点击 👁
- [ ] token 恢复为 `sk-••••••••`

### 4. 应用环境配置

#### 4.1 应用流程
- [ ] 点击「测试中转」卡片的「应用此环境」按钮
- [ ] 弹出确认弹窗，标题「即将写入 ~/.claude/settings.json」
- [ ] 弹窗内容包含：
  - `ANTHROPIC_BASE_URL = https://test-relay.example.com`
  - `ANTHROPIC_AUTH_TOKEN（明文）`
  - `ANTHROPIC_MODEL = claude-opus-4`
  - 备份提示
  - ⚠ 明文警告
- [ ] 点击「确认写入」

#### 4.2 应用后状态
- [ ] 弹窗关闭
- [ ] uTools 右上角显示通知「环境已应用」
- [ ] 卡片显示主色描边（2px solid）
- [ ] 右上角显示「● 生效中」徽标
- [ ] 底部显示「✓ 已生效」
- [ ] 页面顶部显示「当前生效：测试中转」

#### 4.3 验证文件写入
```powershell
# 检查 settings.json
cat ~/.claude/settings.json | findstr ANTHROPIC

# 应显示：
# "ANTHROPIC_BASE_URL": "https://test-relay.example.com",
# "ANTHROPIC_AUTH_TOKEN": "sk-test-token-123",
# "ANTHROPIC_MODEL": "claude-opus-4"

# 检查备份文件
ls ~/.claude/*.bak | Sort-Object LastWriteTime | Select-Object -Last 1

# 检查配置清单
cat ~/.claude/cconf-envs.json
```

### 5. 编辑环境

#### 5.1 编辑自定义环境
- [ ] 点击「测试中转」的「编辑」按钮
- [ ] 弹窗标题为「编辑环境」
- [ ] 预填当前值
- [ ] 修改 MODEL 为 `claude-sonnet-4`
- [ ] 点击「保存」
- [ ] 卡片更新，🤖 显示 `claude-sonnet-4`

#### 5.2 编辑内置环境
- [ ] 点击「官方 Anthropic」的「编辑」按钮（内置环境应该允许编辑）
- [ ] 修改 token 为 `sk-official-token`
- [ ] 保存后卡片更新

### 6. 切换环境与受管键清理

#### 6.1 切换到官方环境
- [ ] 点击「官方 Anthropic」的「应用此环境」
- [ ] 确认弹窗，注意 MODEL 行缺失（官方环境无 model）
- [ ] 确认写入
- [ ] 官方环境卡片显示「● 生效中」
- [ ] 测试中转卡片恢复为「应用此环境」按钮

#### 6.2 验证受管键清理
```powershell
cat ~/.claude/settings.json | findstr ANTHROPIC

# 应显示：
# "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
# "ANTHROPIC_AUTH_TOKEN": "sk-official-token"
# （ANTHROPIC_MODEL 已被清除）
```

#### 6.3 手动添加其它 env 键不被误删
```powershell
# 手动编辑 settings.json，在 env 中添加
"HTTP_PROXY": "http://proxy.example.com:8080"

# 保存后，在 uTools 中切换回「测试中转」并应用
# 再次检查 settings.json
cat ~/.claude/settings.json | findstr -E "HTTP_PROXY|ANTHROPIC"

# HTTP_PROXY 应保持不变（不在 managedKeys 中）
# ANTHROPIC_* 正确更新
```

### 7. 删除环境

#### 7.1 删除非激活环境
- [ ] 新增一个临时环境「待删除」
- [ ] 点击其「删除」按钮
- [ ] 确认删除
- [ ] 卡片从列表消失

#### 7.2 删除当前激活环境
- [ ] 点击「测试中转」的「删除」按钮（当前生效中）
- [ ] 确认删除
- [ ] 卡片消失
- [ ] 页面顶部不再显示「当前生效」提示
- [ ] cconf-envs.json 的 activeId 应为 null

#### 7.3 删除内置环境（应失败）
- [ ] 点击「官方 Anthropic」的「删除」按钮
- [ ] 应该：按钮置灰/隐藏，或点击后提示「内置环境不可删除」

### 8. 持久化验证

- [ ] 关闭 uTools 插件
- [ ] 重新打开，进入 `cconf` → API 环境
- [ ] 上次激活的环境仍显示「● 生效中」
- [ ] 所有自定义环境保留

### 9. 错误处理

#### 9.1 必填项验证
- [ ] 新增环境，名称留空，点击保存
- [ ] 弹窗提示「名称和 BASE_URL 为必填项」

#### 9.2 应用不存在的环境
```javascript
// 在浏览器控制台手动测试
window.services.applyEnvConfig('non-existent-id')
// 应返回 { success: false, error: '环境配置不存在' }
```

### 10. UI 细节验证

- [ ] 卡片网格响应式布局（调整窗口大小）
- [ ] 悬停卡片时背景变化
- [ ] 生效中卡片主色描边清晰可见
- [ ] token 打码与明文切换平滑
- [ ] 弹窗遮罩层点击关闭
- [ ] 弹窗内点击不传播（不关闭）
- [ ] 确认弹窗的警告框黄色底色清晰

---

## 预期文件结构验证

```powershell
ls ~/.claude/

# 应包含：
# cconf-envs.json          - 配置清单
# settings.json            - Claude Code 配置
# settings.json.*.bak      - 备份文件
# cconf-envs.json.*.bak    - 备份文件
```

---

## 已知限制（符合设计）

- ✅ 激活中的 token 明文存在 `settings.json`（Claude Code 机制）
- ✅ 配置清单存本地文件，不经 uTools 同步
- ✅ 内置环境可编辑 token/model，但不可删除
- ✅ 删除激活环境后 activeId 重置为 null

---

## 验证完成标准

- [ ] 所有基础功能正常
- [ ] 受管键清理策略正确工作
- [ ] token 脱敏与可见性切换正常
- [ ] 持久化与恢复正常
- [ ] 文件备份机制工作
- [ ] 错误处理符合预期
