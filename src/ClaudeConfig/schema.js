// Claude 配置 schema：分区、字段说明、按路径分类（可编辑/只读/脱敏）、写回与校验

const CLAUDE_CONFIG_SECTIONS = [
  {
    id: 'preferences',
    title: '偏好设置',
    description: '可调整的常用开关与选项，修改后会写回 ~/.claude.json。',
    fields: ['installMethod', 'showSpinnerTree', 'penguinModeOrgEnabled']
  },
  {
    id: 'account',
    title: '账户',
    description: '当前登录的账户信息，只读；敏感字段（如邮箱）已脱敏。',
    fields: ['oauthAccount']
  },
  {
    id: 'workspace',
    title: '工作区',
    description: '项目与 MCP 服务配置。MCP 服务与项目的 allowedTools 可编辑，统计类字段只读。',
    trees: ['mcpServers', 'projects']
  },
  {
    id: 'usage',
    title: '使用统计与缓存',
    description: 'Claude Code 记录的使用数据与本地缓存，只读。',
    fields: [
      'tipsHistory',
      'toolUsage',
      'skillUsage',
      'cachedGrowthBookFeatures',
      'pluginUsage',
      'groveConfigCache',
      'overageCreditGrantCache',
      'machineID'
    ]
  }
]

// 字段中文元数据：标题与说明，供配置界面展示。key 可为完整路径或末级 key。
const CLAUDE_FIELD_META = {
  installMethod: { label: '安装方式', description: 'Claude Code 的安装方式，例如 global（全局）或 local（本地）。' },
  showSpinnerTree: { label: '显示加载动画树', description: '运行时是否以树状结构显示加载 / 进度动画。' },
  penguinModeOrgEnabled: { label: '企鹅模式（组织级）', description: '是否为组织启用企鹅模式（实验性彩蛋开关）。' },
  oauthAccount: { label: 'OAuth 账户', description: '当前登录账户的基本信息，邮箱已脱敏，仅供查看。' },
  mcpServers: { label: '全局 MCP 服务', description: '全局配置的 MCP 服务列表，可增删改；env 为该服务的环境变量键值。' },
  projects: { label: '项目配置', description: '各本地项目的配置；其中 allowedTools 与项目级 mcpServers 可编辑，统计字段只读。' },
  tipsHistory: { label: '提示历史', description: '各类使用技巧的展示记录，仅供查看。' },
  toolUsage: { label: '工具使用次数', description: '各工具（如 Read、Task）的累计调用次数，仅供查看。' },
  skillUsage: { label: '技能使用次数', description: '各技能的累计调用次数，仅供查看。' },
  cachedGrowthBookFeatures: { label: '特性开关缓存', description: 'GrowthBook 远程特性开关的本地缓存，仅供查看。' },
  pluginUsage: { label: '插件使用次数', description: '各插件的累计使用次数，仅供查看。' },
  groveConfigCache: { label: 'Grove 配置缓存', description: 'Grove 相关配置的本地缓存，仅供查看。' },
  overageCreditGrantCache: { label: '超额额度缓存', description: '超额额度授予状态的本地缓存，仅供查看。' },
  machineID: { label: '机器标识', description: '当前设备的唯一标识，仅供查看。' },
  command: { label: '启动命令', description: 'MCP 服务的启动命令，例如 npx。' },
  args: { label: '启动参数', description: 'MCP 服务启动命令的参数列表。' },
  env: { label: '环境变量', description: 'MCP 服务运行时注入的环境变量键值对。' },
  type: { label: '类型', description: 'MCP 服务的传输类型，例如 stdio。' },
  allowedTools: { label: '允许的工具', description: '该项目允许 Claude 使用的工具列表。' }
}

function fieldMetaFor (key) {
  return CLAUDE_FIELD_META[key] || { label: key, description: '' }
}

const EDITABLE_PREF_PATHS = new Set([
  'installMethod',
  'showSpinnerTree',
  'penguinModeOrgEnabled'
])

const MASKED_EXACT_PATHS = new Set(['oauthAccount.emailAddress'])

function isPlainObject (value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue (value) {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (isPlainObject(value)) {
    const copy = {}
    for (const [k, v] of Object.entries(value)) copy[k] = cloneValue(v)
    return copy
  }
  return value
}

function joinPath (base, key) {
  return base ? `${base}.${key}` : key
}

function splitPath (path) {
  return path ? path.split('.') : []
}

// 仅用于脱敏判断（脱敏优先级最高）
function isMaskedPath (path) {
  return MASKED_EXACT_PATHS.has(path)
}

// 路径是否落在「可编辑子树」内。范围：偏好 3 项；mcpServers 整棵；projects.*.allowedTools 与 projects.*.mcpServers 整棵。
function isEditablePath (path) {
  if (isMaskedPath(path)) return false
  if (EDITABLE_PREF_PATHS.has(path)) return true
  const seg = splitPath(path)
  if (seg[0] === 'mcpServers') return true
  if (seg[0] === 'projects') {
    // projects.<dir>.allowedTools(.*) 或 projects.<dir>.mcpServers(.*)
    if (seg.length >= 3 && (seg[2] === 'allowedTools' || seg[2] === 'mcpServers')) return true
  }
  return false
}

// 是否为「任意键的映射」（支持增删条目）：mcpServers 容器、projects 容器、任意 env
function isMapPath (path) {
  if (path === 'mcpServers' || path === 'projects') return true
  const seg = splitPath(path)
  if (seg[seg.length - 1] === 'env') return true
  // projects.<dir>.mcpServers 也是映射
  if (seg.length === 3 && seg[0] === 'projects' && seg[2] === 'mcpServers') return true
  return false
}

function cloneSections () {
  return CLAUDE_CONFIG_SECTIONS.map((section) => ({
    ...section,
    fields: section.fields ? [...section.fields] : undefined,
    trees: section.trees ? [...section.trees] : undefined
  }))
}

function classify (path) {
  if (isMaskedPath(path)) return 'masked'
  if (isEditablePath(path)) return 'editable'
  return 'readOnly'
}

// 递归构建节点树，并把叶子分类收集进扁平列表
function buildNode (value, path, key, model) {
  const classification = classify(path)
  let kind = 'scalar'
  if (Array.isArray(value)) kind = 'array'
  else if (isPlainObject(value)) kind = isMapPath(path) ? 'map' : 'object'

  const node = { path, key, kind, classification, children: [] }
  if (kind === 'scalar') node.value = cloneValue(value)

  if (classification === 'editable') model.editable.push(node)
  else if (classification === 'masked') model.masked.push(node)
  else model.readOnly.push(node)

  if (isPlainObject(value) && classification !== 'masked') {
    for (const [ck, cv] of Object.entries(value)) {
      node.children.push(buildNode(cv, joinPath(path, ck), ck, model))
    }
  }
  return node
}

function buildClaudeConfigModel (source) {
  const root = isPlainObject(source) ? source : {}
  const model = { sections: cloneSections(), tree: [], editable: [], readOnly: [], masked: [], trees: {} }
  for (const [key, value] of Object.entries(root)) {
    const node = buildNode(value, key, key, model)
    model.tree.push(node)
    if (key === 'projects' || key === 'mcpServers') model.trees[key] = node
  }
  return model
}

function validateClaudeConfigDraft (draft) {
  const errors = []
  if (!isPlainObject(draft)) {
    errors.push({ path: '', message: 'Claude config draft 必须是对象。' })
    return { valid: false, errors }
  }
  const servers = draft.mcpServers
  if (servers !== undefined && !isPlainObject(servers)) {
    errors.push({ path: 'mcpServers', message: 'mcpServers 必须是对象。' })
  } else if (isPlainObject(servers)) {
    for (const [name, cfg] of Object.entries(servers)) {
      if (!isPlainObject(cfg)) { errors.push({ path: `mcpServers.${name}`, message: '服务配置必须是对象。' }); continue }
      if (cfg.args !== undefined && !Array.isArray(cfg.args)) errors.push({ path: `mcpServers.${name}.args`, message: 'args 必须是数组。' })
      if (cfg.env !== undefined && !isPlainObject(cfg.env)) errors.push({ path: `mcpServers.${name}.env`, message: 'env 必须是对象。' })
    }
  }
  return { valid: errors.length === 0, errors }
}

// 把 draft 中「可编辑子树」整体覆盖到 base，只读字段保留 base 原值。
function applyEditableTree (base, draft, path) {
  if (isEditablePath(path)) {
    return cloneValue(draft)
  }
  if (isPlainObject(base) && isPlainObject(draft)) {
    const out = cloneValue(base)
    for (const key of Object.keys(out)) {
      const childPath = joinPath(path, key)
      if (Object.prototype.hasOwnProperty.call(draft, key)) {
        out[key] = applyEditableTree(out[key], draft[key], childPath)
      }
    }
    // mcpServers 容器允许新增条目（draft 有、base 无）
    if (isMapPath(path)) {
      for (const key of Object.keys(draft)) {
        if (!Object.prototype.hasOwnProperty.call(out, key)) {
          out[key] = cloneValue(draft[key])
        }
      }
    }
    return out
  }
  return cloneValue(base)
}

function applyClaudeConfigDraft (source, draft) {
  const base = cloneValue(isPlainObject(source) ? source : {})
  if (!isPlainObject(draft)) return base
  for (const key of Object.keys(base)) {
    if (Object.prototype.hasOwnProperty.call(draft, key)) {
      base[key] = applyEditableTree(base[key], draft[key], key)
    }
  }
  // 顶层允许新增 mcpServers（若原文件没有）
  if (!Object.prototype.hasOwnProperty.call(base, 'mcpServers') && isPlainObject(draft.mcpServers)) {
    base.mcpServers = cloneValue(draft.mcpServers)
  }
  return base
}

export {
  CLAUDE_CONFIG_SECTIONS,
  CLAUDE_FIELD_META,
  fieldMetaFor,
  isEditablePath,
  isMaskedPath,
  isMapPath,
  applyClaudeConfigDraft,
  buildClaudeConfigModel,
  validateClaudeConfigDraft
}



