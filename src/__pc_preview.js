import { createApp } from 'vue'
import './main.css'
import './styles/variables.css'
import PluginCenter from './PluginCenter/index.vue'

const INSTALLED = [
  { id: 'ecs-qa@ecs-market', name: 'ecs-qa', marketplace: 'ecs-market', version: '1.3.3', enabled: true, description: '测试职能插件框架：需求澄清 / 方案 / 用例 / 代码 / 执行 / 报告全流程。', components: { skills: 4, commands: 9, agents: 12, hooks: true, mcp: true } },
  { id: 'oh-my-claudecode@omc', name: 'oh-my-claudecode', marketplace: 'omc', version: '2.1.0', enabled: true, description: '一站式增强套件：架构顾问、代码审查、调试、测试工程等 20+ 子代理与技能。', components: { skills: 8, commands: 14, agents: 22, hooks: false, mcp: true } }
]

const KNOWN_MP = [
  { name: 'claude-plugins-official', sourceLabel: 'anthropics/claude-plugins-official', installLocation: '', lastUpdated: '2026-06-30', pluginCount: 255 },
  { name: 'ecs-market', sourceLabel: 'ecs-team/plugins', installLocation: '', lastUpdated: '2026-06-12', pluginCount: 7 }
]

const REC = [
  { plugin: 'code-review', marketplace: 'claude-plugins-official', repo: 'anthropics/claude-plugins-official', stars: 12800, official: true, description: '自动化 Pull Request 代码审查。', category: 'productivity', author: 'anthropics', id: 'code-review@claude-plugins-official', installed: false },
  { plugin: 'commit-commands', marketplace: 'claude-plugins-official', repo: 'anthropics/claude-plugins-official', stars: 12800, official: true, description: 'Git 提交与 PR 工作流命令。', category: 'productivity', author: 'anthropics', id: 'commit-commands@claude-plugins-official', installed: false },
  { plugin: 'frontend-design', marketplace: 'claude-plugins-official', repo: 'anthropics/claude-plugins-official', stars: 12800, official: true, description: '生产级前端 UI 创作。', category: 'development', author: 'anthropics', id: 'frontend-design@claude-plugins-official', installed: true },
  { plugin: 'feature-dev', marketplace: 'claude-plugins-official', repo: 'anthropics/claude-plugins-official', stars: 12800, official: true, description: '多专家代理协作的功能开发工作流。', category: 'development', author: 'anthropics', id: 'feature-dev@claude-plugins-official', installed: false },
  { plugin: 'architect', marketplace: 'oh-my-claudecode', repo: 'ccbikai/oh-my-claudecode', stars: 3420, official: false, description: '架构顾问：策略级架构与调试建议。', category: 'development', author: 'ccbikai', id: 'architect@oh-my-claudecode', installed: false },
  { plugin: 'ralph', marketplace: 'oh-my-claudecode', repo: 'ccbikai/oh-my-claudecode', stars: 3420, official: false, description: '自引用循环执行直至任务完成。', category: 'development', author: 'ccbikai', id: 'ralph@oh-my-claudecode', installed: false },
  { plugin: 'snippet-vault', marketplace: 'awesome-cc', repo: 'someone/awesome-cc', stars: 1560, official: false, description: '常用代码片段库与快速插入。', category: 'productivity', author: 'someone', id: 'snippet-vault@awesome-cc', installed: false },
  { plugin: 'ui-kit', marketplace: 'cc-devkit', repo: 'devteam/cc-devkit', stars: 640, official: false, description: '前端团队 UI 组件脚手架。', category: 'development', author: 'devteam', id: 'ui-kit@cc-devkit', installed: false }
]
const HOT_MP = [
  { name: 'claude-plugins-official', repo: 'anthropics/claude-plugins-official', url: 'https://github.com/anthropics/claude-plugins-official', stars: 12800, description: 'Anthropic 官方插件目录。', pluginCount: 255, known: true },
  { name: 'oh-my-claudecode', repo: 'ccbikai/oh-my-claudecode', url: 'https://github.com/ccbikai/oh-my-claudecode', stars: 3420, description: '一站式增强套件：架构顾问 / 审查 / 调试等 20+ 能力。', pluginCount: 24, known: false },
  { name: 'awesome-cc', repo: 'someone/awesome-cc', url: 'https://github.com/someone/awesome-cc', stars: 1560, description: '社区精选的 Claude Code 插件合集。', pluginCount: 18, known: false },
  { name: 'cc-devkit', repo: 'devteam/cc-devkit', url: 'https://github.com/devteam/cc-devkit', stars: 640, description: '面向前端团队的开发者工具箱。', pluginCount: 9, known: false }
]
const HOT = { marketplaces: HOT_MP, recommended: REC, source: 'cache', fetchedAt: '2026-07-06T09:41:00' }

window.services = {
  listInstalledPlugins: () => INSTALLED,
  getInstalledPluginDetail: () => null,
  listKnownMarketplaces: () => KNOWN_MP,
  listMarketplacePlugins: () => [],
  detectClaudeCli: () => true,
  getHotList: () => HOT,
  refreshHotList: () => Promise.resolve({ ...HOT, source: 'live' }),
  enablePlugin: () => Promise.resolve({ success: true }),
  disablePlugin: () => Promise.resolve({ success: true }),
  updatePlugin: () => Promise.resolve({ success: true }),
  uninstallPlugin: () => Promise.resolve({ success: true }),
  installPlugin: () => Promise.resolve({ success: true }),
  addMarketplace: () => Promise.resolve({ success: true }),
  removeMarketplace: () => Promise.resolve({ success: true })
}
window.utools = { setSubInput: () => {}, removeSubInput: () => {}, setSubInputValue: () => {}, shellOpenExternal: () => {}, shellOpenPath: () => {} }

createApp(PluginCenter, { enterAction: { code: 'ccplugin' } }).mount('#app')
