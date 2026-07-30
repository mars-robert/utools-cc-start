# API 环境配置管理

> OpenSpec Change: `add-api-env-config`
> Created: 2026-07-20
> Status: ✅ Valid

## 概述

为 Claude Code 启动器添加**可视化的 API 环境配置管理与一键切换**能力，解决用户频繁切换 API 后端（官方 / 中转 / 代理）时手动编辑配置文件的痛点。

## 核心特性

### 1. 卡片式环境管理
- 网格展示所有 API 环境（内置「官方 Anthropic」+ 用户自定义）
- 每张卡片显示：名称、BASE_URL、TOKEN（默认打码👁）、MODEL、状态徽标
- 生效中的环境用主色描边 + 「● 生效中」徽标

### 2. 一键应用环境
- 点击「应用此环境」→ 确认弹窗明示操作（写哪些键、明文警告、已备份）
- 写入 `~/.claude/settings.json` 的 `env` 字段
- 采用**受管键清理策略**：切换时清掉旧环境的键，不留残值、不误删用户手动加的其它 env

### 3. 本地存储不同步
- 配置清单存 `~/.claude/cconf-envs.json`（明文 JSON）
- 不经 uTools dbStorage（避免同步到云端）
- 备份 `.bak` + 原子写 `tmp→rename` 机制

### 4. 增删改自定义环境
- 弹窗表单编辑：name / baseUrl / token / model / 自定义 KV
- 内置环境不可删除，但可编辑 token/model

## 文件结构

```
~/.claude/
├── cconf-envs.json              ← 配置清单（本地，不同步）
│   { version, activeId, managedKeys, configs }
├── settings.json                ← Claude Code 官方配置
│   { env: { ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN, ... } }
├── *.bak                        ← 自动备份
```

## 技术设计亮点

### 受管键清理策略
```javascript
// 每次应用环境前
1. 从 settings.json 的 env 删除 managedKeys 中的所有旧键
2. 写入新环境的 { BASE_URL, TOKEN, MODEL?, ...extra }
3. 更新 managedKeys = 本次写入的键集合

// 效果
- 从「中转A(有键X)」切到「官方(无X)」→ X 被清掉，不残留
- 用户手动加的 HTTP_PROXY → 不在 managedKeys 中，不被误删
```

### 存储隔离
- **配置清单**：本地文件 `cconf-envs.json`（不同步，含所有环境的完整信息）
- **激活配置**：`settings.json` 的 `env`（Claude Code 读取点，只含当前生效的键值）
- **分离原因**：激活中的 token 必然明文在 `settings.json`（Claude Code 机制），配置清单本地存储不同步以避免云端泄露

### 原子写 + 自动备份
复刻 `claude-config.js` 的稳定模式：
```javascript
1. 备份原文件 → <文件名>.<时间戳>.bak
2. 写临时文件 → <文件名>.<时间戳>.tmp
3. 原子 rename → fs.renameSync(tmp, 目标)
```

## UI 预览

```
┌─────────────────────────────────────────────────────────────┐
│  API 环境配置                              [+ 新增环境]         │
│  当前生效：中转-XX                                             │
│                                                              │
│  ┌───────────────────┐ ┌───────────────────┐ ┌────────────┐ │
│  │ 官方 Anthropic     │ │ 中转-XX  ● 生效中  │ │ 自建代理    │ │
│  │ ─────────────      │ │ ─────────────      │ │ ────────── │ │
│  │ 🌐 api.anthropic…  │ │ 🌐 relay.xx.com    │ │ 🌐 10.0.0… │ │
│  │ 🔑 ••••••••  👁     │ │ 🔑 ••••••••  👁     │ │ 🔑 ••••••  │ │
│  │ 🤖 (默认)          │ │ 🤖 claude-opus-4   │ │ 🤖 …       │ │
│  │ [内置]             │ │ [编辑][删除]        │ │ [编辑][删] │ │
│  │                    │ │                    │ │            │ │
│  │ [应用此环境]        │ │ ✓ 已生效           │ │[应用此环境]│ │
│  └───────────────────┘ └───────────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 影响范围

### 新增文件
- `public/preload/env-config.js` — 存储层（读写配置清单与 settings.json）
- `src/EnvConfig/index.vue` — UI 组件

### 修改文件
- `public/preload/services.js` — 挂载新 API
- `src/UnifiedConfig/index.vue` — 新增「API 环境」tab

### 不动
- `spawn` / `launchProject` / `~/.claude.json` / `claude-config.js`

## 默认行为

- 首次创建：包含内置「官方 Anthropic」环境，`activeId: null`（无激活）
- 老用户：进入 API 环境 tab 不修改 `settings.json`，零影响
- 直到用户主动点击「应用此环境」，才写入配置

## 工件清单

- [x] `.openspec.yaml` — Change 元数据
- [x] `proposal.md` — 为什么做、做什么、影响范围
- [x] `design.md` — 技术决策、数据结构、模块划分
- [x] `specs/api-env-config/spec.md` — 需求规格（SHALL 语句 + Scenarios）
- [x] `tasks.md` — 实现任务清单（7 大模块，42 个子任务）

## 验证状态

```bash
$ openspec validate add-api-env-config
Change 'add-api-env-config' is valid
```

## 相关文档

- [uTools 数据库 API 文档](https://www.u-tools.cn/docs/developer/utools-api/db.html#dbcryptostorage)
- Claude Code 官方配置：`~/.claude/settings.json` 的 `env` 字段
- 参考实现：`openspec/changes/add-conversation-theme-switcher`（卡片布局）、`public/preload/claude-config.js`（备份+原子写）

---

**下一步**：按 `tasks.md` 中的清单实现（7 个模块，建议顺序：存储层 → services 挂载 → EnvConfig 组件 → UnifiedConfig 挂载 → 验证）
