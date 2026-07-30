## Why

Claude Code 启动时从 `~/.claude/settings.json` 读取环境变量（`env` 字段）来连接 API 后端。用户若要使用不同的 API 端点（官方 / 中转 / 自建代理），目前只能手动编辑该文件——这对于频繁切换场景（测试不同后端、国内访问需中转、本地开发用代理）非常低效且易错。

现有启动配置（`LauncherConfig`）只管理启动命令与终端选择，不涉及 API 环境变量。用户需要一个**可视化的 API 环境配置管理与一键切换**能力。

## What Changes

- 在统一配置中心（`cconf` → `UnifiedConfig`）新增第 3 个 tab：**API 环境**。
- 以**卡片网格**形式展示所有 API 环境配置（内置「官方 Anthropic」+ 用户自定义的中转/代理）。
- 每张卡片显示：环境名称、BASE_URL、TOKEN（默认打码 + 👁 切换显示）、MODEL（可选）、状态徽标（内置/自定义/生效中）。
- 点击卡片上的**「应用此环境」按钮** → 弹出确认弹窗，明示将写入 `settings.json` 的键值、token 明文落盘警告、已自动备份 `.bak`。确认后写入 `~/.claude/settings.json` 的 `env` 字段。
- 支持**增删改**自定义环境：弹窗表单编辑 name / baseUrl / token / model / 自定义 KV。
- 配置清单存储在**本地文件** `~/.claude/cconf-envs.json`（明文 JSON，不经 uTools 同步），记录 activeId 与 configs 数组。
- 应用环境时，采用**受管键清理策略**：在 `cconf-envs.json` 记录本插件写过的 env 键集合（managedKeys），每次应用前先删除这批旧键，再写入新激活项的键——避免残留、也不误删用户手动加的其它 env（如 `HTTP_PROXY`）。

## Capabilities

### New Capabilities
- `api-env-config`: API 环境配置管理——卡片网格展示、增删改、一键应用（写 `settings.json` 的 `env`）、本地文件存储（不同步）、受管键清理策略、token UI 打码、确认弹窗郑重提示。

### Modified Capabilities
- `unified-config`: 统一配置中心新增「API 环境」tab（第 3 个，位于「启动配置」与「快捷命令」之后、「主题配置」之前）。

## Impact

- **新增组件**：`src/EnvConfig/index.vue`（卡片网格 + 增删改弹窗 + 应用确认弹窗）。
- **修改组件**：`src/UnifiedConfig/index.vue`——sidebar 新增「API 环境」nav-item（图标 🔌），content 区挂载 `EnvConfig`。
- **存储层**：
  - 新增 `public/preload/env-config.js`：读写 `~/.claude/cconf-envs.json`（复刻 `claude-config.js` 的备份 `.bak` + 原子写 tmp→rename）、读写 `~/.claude/settings.json` 的 `env` 字段（同样备份+原子写）、受管键清理逻辑。
  - `public/preload/services.js` 引入并挂载到 `window.services`：`getEnvConfigs()` / `setEnvConfigs(data)` / `applyEnvConfig(id)` / `addEnvConfig(item)` / `updateEnvConfig(id, patch)` / `deleteEnvConfig(id)`。
- **本地文件**：
  - `~/.claude/cconf-envs.json` 格式：`{ version: 1, activeId: string|null, managedKeys: string[], configs: [{id, name, baseUrl, token, model?, extra?: Record<string,string>}] }`。首次创建时内置「官方 Anthropic」配置（id: `builtin-official`, baseUrl: `https://api.anthropic.com`, token: 空，builtin: true）。
  - `~/.claude/settings.json` 的 `env` 字段：应用环境时只改写 managedKeys 集合内的键，其余原样保留。
- **兼容性**：默认无激活环境（`activeId: null`）时，不修改 `settings.json`——对既有用户零影响。
- **测试**：为 `env-config.js` 的读写、备份、受管键清理补单元测试（Node `--test`）。

## Non-goals

- 不做环境配置的导入/导出（JSON 本就明文，手动复制即可）。
- 不在启动项目时临时选环境（全局单一激活，简单直观）。
- 不对 token 做真加密（激活中的 token 必然明文在 `settings.json`，配置清单文件也本地存储不同步，加密无实际意义）。
- 不做环境配置的健康检查/连通性测试（超出本 change 范围）。
