// ccmate ConfigEditorPage 的完整字段定义
// 参考：ccmate-main/src/pages/ConfigEditorPage.tsx 的 createFields 函数

export const CONFIG_SECTIONS = [
  {
    sectionName: '常用配置',
    fields: [
      {
        label: 'ANTHROPIC_BASE_URL',
        name: 'env.ANTHROPIC_BASE_URL',
        type: 'text',
        priority: 'basic',
        description: '覆盖 API 请求的 URL',
        placeholder: 'https://api.anthropic.com'
      },
      {
        label: 'ANTHROPIC_AUTH_TOKEN',
        name: 'env.ANTHROPIC_AUTH_TOKEN',
        type: 'text',
        priority: 'basic',
        description: '作为 Authorization header 发送',
        placeholder: 'sk-ant-...'
      },
      {
        label: 'ANTHROPIC_MODEL',
        name: 'env.ANTHROPIC_MODEL',
        type: 'text',
        priority: 'basic',
        description: '使用的模型名称',
        placeholder: 'claude-opus-4'
      },
      {
        label: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        name: 'env.ANTHROPIC_DEFAULT_HAIKU_MODEL',
        type: 'text',
        priority: 'advanced',
        description: '默认 Haiku 模型配置'
      },
      {
        label: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
        name: 'env.ANTHROPIC_DEFAULT_OPUS_MODEL',
        type: 'text',
        priority: 'advanced',
        description: '默认 Opus 模型配置'
      },
      {
        label: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
        name: 'env.ANTHROPIC_DEFAULT_SONNET_MODEL',
        type: 'text',
        priority: 'advanced',
        description: '默认 Sonnet 模型配置'
      },
      {
        label: 'ANTHROPIC_API_KEY',
        name: 'env.ANTHROPIC_API_KEY',
        type: 'text',
        priority: 'advanced',
        description: 'API key 作为 X-Api-Key header 发送'
      },
      {
        label: 'CLAUDE_CODE_SUBAGENT_MODEL',
        name: 'env.CLAUDE_CODE_SUBAGENT_MODEL',
        type: 'text',
        priority: 'advanced',
        description: 'Subagents 使用的模型配置'
      },
      {
        label: 'CLAUDE_CODE_EFFORT_LEVEL',
        name: 'env.CLAUDE_CODE_EFFORT_LEVEL',
        type: 'select',
        priority: 'basic',
        description: '控制 Claude Code 响应的努力程度',
        options: ['low', 'medium', 'high', 'xhigh', 'max']
      }
    ]
  },
  {
    sectionName: '通用设置',
    fields: [
      {
        label: 'Model',
        name: 'model',
        type: 'text',
        priority: 'advanced',
        description: '覆盖默认使用的模型',
        placeholder: 'claude-sonnet-4-5-20250929'
      },
      {
        label: 'Output Style',
        name: 'outputStyle',
        type: 'select',
        priority: 'advanced',
        description: '配置输出风格以调整系统提示',
        options: ['Default', 'Explanatory', 'Concise']
      },
      {
        label: 'Include Co-Authored By',
        name: 'includeCoAuthoredBy',
        type: 'boolean',
        priority: 'advanced',
        description: '在 git commits 和 PRs 中包含 Claude 署名'
      },
      {
        label: 'API Key Helper',
        name: 'apiKeyHelper',
        type: 'text',
        priority: 'advanced',
        description: '生成 auth 值的自定义脚本（在 /bin/sh 中执行）',
        placeholder: '/bin/generate_temp_api_key.sh'
      },
      {
        label: 'Cleanup Period (Days)',
        name: 'cleanupPeriodDays',
        type: 'number',
        priority: 'advanced',
        description: '基于最后活动日期保留聊天记录的天数',
        placeholder: '30'
      },
      {
        label: 'Disable All Hooks',
        name: 'disableAllHooks',
        type: 'boolean',
        priority: 'advanced',
        description: '禁用所有 hooks'
      }
    ]
  },
  {
    sectionName: 'MCP 配置',
    fields: [
      {
        label: 'Enable All Project MCP Servers',
        name: 'enableAllProjectMcpServers',
        type: 'boolean',
        priority: 'advanced',
        description: '自动批准 .mcp.json 中的所有 MCP servers'
      },
      {
        label: 'Use Enterprise MCP Config Only',
        name: 'useEnterpriseMcpConfigOnly',
        type: 'boolean',
        priority: 'advanced',
        description: '仅限使用 managed-mcp.json 中的 MCP servers'
      }
    ]
  },
  {
    sectionName: '环境变量（高级）',
    fields: [
      {
        label: 'MAX_THINKING_TOKENS',
        name: 'env.MAX_THINKING_TOKENS',
        type: 'number',
        priority: 'advanced',
        description: '启用扩展思考并设置 token 预算'
      },
      {
        label: 'BASH_DEFAULT_TIMEOUT_MS',
        name: 'env.BASH_DEFAULT_TIMEOUT_MS',
        type: 'number',
        priority: 'advanced',
        description: '长时间运行 bash 命令的默认超时'
      },
      {
        label: 'BASH_MAX_OUTPUT_LENGTH',
        name: 'env.BASH_MAX_OUTPUT_LENGTH',
        type: 'number',
        priority: 'advanced',
        description: 'bash 输出中间截断前的最大字符数'
      },
      {
        label: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        name: 'env.CLAUDE_CODE_MAX_OUTPUT_TOKENS',
        type: 'number',
        priority: 'advanced',
        description: '大多数请求的最大输出 tokens'
      },
      {
        label: 'MCP_TIMEOUT',
        name: 'env.MCP_TIMEOUT',
        type: 'number',
        priority: 'advanced',
        description: 'MCP server 启动超时（毫秒）'
      },
      {
        label: 'MCP_TOOL_TIMEOUT',
        name: 'env.MCP_TOOL_TIMEOUT',
        type: 'number',
        priority: 'advanced',
        description: 'MCP tool 执行超时（毫秒）'
      },
      {
        label: 'DISABLE_TELEMETRY',
        name: 'env.DISABLE_TELEMETRY',
        type: 'boolean',
        priority: 'advanced',
        description: '选择退出 Statsig telemetry'
      },
      {
        label: 'DISABLE_ERROR_REPORTING',
        name: 'env.DISABLE_ERROR_REPORTING',
        type: 'boolean',
        priority: 'advanced',
        description: '选择退出 Sentry 错误报告'
      },
      {
        label: 'HTTP_PROXY',
        name: 'env.HTTP_PROXY',
        type: 'text',
        priority: 'advanced',
        description: '网络连接的 HTTP 代理服务器'
      },
      {
        label: 'HTTPS_PROXY',
        name: 'env.HTTPS_PROXY',
        type: 'text',
        priority: 'advanced',
        description: '网络连接的 HTTPS 代理服务器'
      }
    ]
  }
]

// 筛选基础字段
export function getBasicFields() {
  const result = []
  CONFIG_SECTIONS.forEach(section => {
    const basicFields = section.fields.filter(f => f.priority === 'basic')
    if (basicFields.length > 0) {
      result.push({ ...section, fields: basicFields })
    }
  })
  return result
}

// 筛选高级字段
export function getAdvancedFields() {
  const result = []
  CONFIG_SECTIONS.forEach(section => {
    const advancedFields = section.fields.filter(f => f.priority === 'advanced')
    if (advancedFields.length > 0) {
      result.push({ ...section, fields: advancedFields })
    }
  })
  return result
}

// 从嵌套路径获取值
export function getNestedValue(obj, path) {
  const keys = path.split('.')
  let value = obj
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key]
    } else {
      return undefined
    }
  }
  return value
}

// 设置嵌套路径的值
export function setNestedValue(obj, path, value) {
  const keys = path.split('.')
  const lastKey = keys.pop()
  let target = obj

  for (const key of keys) {
    if (!(key in target) || typeof target[key] !== 'object') {
      target[key] = {}
    }
    target = target[key]
  }

  if (value === undefined || value === null || value === '') {
    delete target[lastKey]
  } else {
    target[lastKey] = value
  }
}

// 清理空对象
export function cleanEmptyObjects(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj
  }

  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      cleanEmptyObjects(obj[key])
      if (Object.keys(obj[key]).length === 0) {
        delete obj[key]
      }
    }
  }

  return obj
}
