<template>
  <QuickSetup
    v-if="showQuickSetup"
    :presets="presets"
    :editing-config="editingStore"
    @close="closeQuickSetup"
    @saved="handleQuickSetupSaved"
    @notification="handleNotification"
  />

  <div v-else class="env">
    <div class="env-head">
      <div class="env-head-text">
        <h3 class="env-title">Claude Code 环境配置</h3>
        <p class="env-desc">管理多个 Claude Code 环境预设，点击卡片即可切换</p>
      </div>
      <button class="btn btn-primary env-add" @click="handleCreate">+ 新增配置</button>
    </div>

    <div class="env-grid">
      <!-- 原始配置 -->
      <div class="env-card" :class="{ active: !currentStoreId }" @click="handleResetToOriginal">
        <div class="card-top">
          <span class="card-name">原始配置</span>
          <span class="tag tag-gray">系统</span>
          <div class="card-actions">
            <span v-if="!currentStoreId" class="tag tag-on"><i class="dot"></i>已生效</span>
            <span v-else class="tag tag-off">未生效</span>
          </div>
        </div>
        <div class="card-body">
          <div
            v-if="ori('ANTHROPIC_BASE_URL')"
            class="kv"
            :class="{ expanded: expandedKey === 'ori:url' }"
            :data-full="ori('ANTHROPIC_BASE_URL')"
            @click.stop="toggleExpand('ori:url')"
          >
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
            </span>
            <span class="v">{{ ori('ANTHROPIC_BASE_URL') }}</span>
          </div>
          <div
            v-if="ori('ANTHROPIC_AUTH_TOKEN')"
            class="kv"
            :class="{ expanded: expandedKey === 'ori:token' }"
            :data-full="ori('ANTHROPIC_AUTH_TOKEN')"
            @click.stop="toggleExpand('ori:token')"
          >
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M18 5l2 2M15 8l2 2"/></svg>
            </span>
            <span class="v">{{ mask(ori('ANTHROPIC_AUTH_TOKEN')) }}</span>
          </div>
          <div v-if="ori('ANTHROPIC_MODEL')" class="kv">
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V5M9 3h6M9 13h.01M15 13h.01M9 17h6"/></svg>
            </span>
            <span class="v">{{ ori('ANTHROPIC_MODEL') }}</span>
          </div>
          <div v-if="!hasOri" class="kv-empty">系统默认 settings.json</div>
        </div>
      </div>

      <!-- 用户配置 -->
      <div
        v-for="store in stores"
        :key="store.id"
        class="env-card"
        :class="{ active: store.using }"
        @click="handleSwitchConfig(store.id)"
      >
        <div class="card-top">
          <span class="card-name">{{ store.title }}</span>
          <span v-if="getPresetLabel(store)" class="tag tag-preset">{{ getPresetLabel(store) }}</span>
          <div class="card-actions">
            <span v-if="store.using" class="tag tag-on"><i class="dot"></i>已生效</span>
            <span v-else class="tag tag-off">未生效</span>
            <span class="card-tools">
              <button class="tool" title="编辑" @click.stop="handleEdit(store)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <button class="tool tool-del" title="删除" @click.stop="handleDelete(store)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
              </button>
            </span>
          </div>
        </div>
        <div class="card-body">
          <div
            v-if="env(store, 'ANTHROPIC_BASE_URL')"
            class="kv"
            :class="{ expanded: expandedKey === store.id + ':url' }"
            :data-full="env(store, 'ANTHROPIC_BASE_URL')"
            @click.stop="toggleExpand(store.id + ':url')"
          >
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
            </span>
            <span class="v">{{ env(store, 'ANTHROPIC_BASE_URL') }}</span>
          </div>
          <div
            v-if="env(store, 'ANTHROPIC_AUTH_TOKEN')"
            class="kv"
            :class="{ expanded: expandedKey === store.id + ':token' }"
            :data-full="env(store, 'ANTHROPIC_AUTH_TOKEN')"
            @click.stop="toggleExpand(store.id + ':token')"
          >
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M18 5l2 2M15 8l2 2"/></svg>
            </span>
            <span class="v">{{ mask(env(store, 'ANTHROPIC_AUTH_TOKEN')) }}</span>
          </div>
          <div v-if="env(store, 'ANTHROPIC_MODEL')" class="kv">
            <span class="ki" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V5M9 3h6M9 13h.01M15 13h.01M9 17h6"/></svg>
            </span>
            <span class="v">{{ env(store, 'ANTHROPIC_MODEL') }}</span>
          </div>
          <div v-if="!hasContent(store)" class="kv-empty">暂无配置内容，点击右上角编辑</div>
        </div>
      </div>
    </div>

    <p v-if="stores.length === 0" class="env-hint">
      还没有自定义配置，点击「+ 新增配置」创建第一个预设
    </p>

    <Transition name="toast">
      <div v-if="notification" class="toast" :class="notification.type">
        {{ notification.message }}
      </div>
    </Transition>

  </div>
</template>

<script>
import QuickSetup from './QuickSetup.vue'

export default {
  name: 'EnvConfig',
  components: { QuickSetup },
  data () {
    return {
      stores: [],
      currentStoreId: null,
      presets: [],
      originalConfig: null,
      showQuickSetup: false,
      editingStore: null,
      notification: null,
      expandedKey: null
    }
  },
  computed: {
    hasOri () {
      return !!(this.ori('ANTHROPIC_BASE_URL') || this.ori('ANTHROPIC_AUTH_TOKEN') || this.ori('ANTHROPIC_MODEL'))
    }
  },
  mounted () {
    this.loadData()
    this.loadOriginalConfig()
  },
  methods: {
    ori (key) {
      return this.originalConfig?.env?.[key] || ''
    },
    env (store, key) {
      return store?.settings?.env?.[key] || ''
    },
    hasContent (store) {
      return !!(this.env(store, 'ANTHROPIC_BASE_URL') || this.env(store, 'ANTHROPIC_AUTH_TOKEN') || this.env(store, 'ANTHROPIC_MODEL'))
    },
    mask (token) {
      if (!token) return ''
      if (token.length <= 12) return token.replace(/./g, '*')
      return `${token.slice(0, 7)}***…***${token.slice(-3)}`
    },
    toggleExpand (id) {
      this.expandedKey = this.expandedKey === id ? null : id
    },
    loadData () {
      try {
        if (!window.services) return
        const s = window.services.getStores()
        if (s.success) this.stores = s.data || []
        const c = window.services.getCurrentStore()
        this.currentStoreId = (c.success && c.data) ? c.data.id : null
        const p = window.services.getPresets()
        if (p.success) {
          const providerUi = {
            'official-anthropic': {
              logo: '/provider-logos/anthropic.svg', website: 'https://www.anthropic.com/', color: '#191919', colorDark: '#d8d4ce',
              surface: '#f4f3f1', border: '#d7d3ce', surfaceDark: '#292826', borderDark: '#58544e',
              shadow: 'rgba(25, 25, 25, 0.16)'
            },
            deepseek: {
              logo: '/provider-logos/deepseek.svg', website: 'https://www.deepseek.com/', color: '#5786fe', colorDark: '#7fa0ff',
              surface: '#f2f5fc', border: '#cbd6ee', surfaceDark: '#20283a', borderDark: '#4b5f89',
              shadow: 'rgba(87, 134, 254, 0.2)'
            },
            glm: {
              logo: '/provider-logos/zhipu.png', website: 'https://www.zhipuai.cn/', color: '#1f4fbf', colorDark: '#7698ed',
              surface: '#f1f4fa', border: '#c9d2e5', surfaceDark: '#202738', borderDark: '#485b83',
              shadow: 'rgba(31, 79, 191, 0.2)'
            },
            kimi: {
              logo: '/provider-logos/kimi.svg', website: 'https://www.kimi.com/', color: '#161616', colorDark: '#e3e3e6',
              surface: '#f3f3f4', border: '#d2d2d6', surfaceDark: '#262628', borderDark: '#55555c',
              shadow: 'rgba(22, 22, 22, 0.16)'
            },
            openrouter: {
              logo: '/provider-logos/openrouter.svg', website: 'https://openrouter.ai/', color: '#64748b', colorDark: '#b4c0ce',
              surface: '#f2f4f6', border: '#cbd1d8', surfaceDark: '#242a31', borderDark: '#596674',
              shadow: 'rgba(100, 116, 139, 0.2)'
            },
            'china-relay': {
              color: '#b84c4c', colorDark: '#df8585', surface: '#faf3f3', border: '#e5caca',
              surfaceDark: '#352525', borderDark: '#744747', shadow: 'rgba(184, 76, 76, 0.18)'
            },
            custom: {
              color: '#667085', colorDark: '#aeb6c3', surface: '#f4f5f6', border: '#d3d6da',
              surfaceDark: '#272a30', borderDark: '#565d69', shadow: 'rgba(102, 112, 133, 0.18)'
            }
          }

          this.presets = (p.data || []).map(preset => {
            const enhanced = { ...preset }
            const isEmoji = preset.icon && preset.icon.length <= 2 && /[\u{1F300}-\u{1F9FF}]/u.test(preset.icon)
            enhanced.iconType = isEmoji ? 'emoji' : 'badge'
            const ui = providerUi[preset.id] || providerUi.custom
            enhanced.logo = ui.logo || ''
            enhanced.website = ui.website || ''
            enhanced.iconColor = ui.color
            enhanced.iconColorDark = ui.colorDark
            enhanced.cardSurface = ui.surface
            enhanced.cardBorder = ui.border
            enhanced.cardSurfaceDark = ui.surfaceDark
            enhanced.cardBorderDark = ui.borderDark
            enhanced.cardShadow = ui.shadow

            return enhanced
          })
        }
      } catch (e) {
        this.notify('加载失败', 'error')
      }
    },
    loadOriginalConfig () {
      try {
        const r = window.services.readClaudeSettings?.()
        if (r?.success && r.data) this.originalConfig = r.data
      } catch (e) { /* ignore */ }
    },
    handleCreate () {
      this.editingStore = null
      this.showQuickSetup = true
    },
    handleEdit (store) {
      this.editingStore = store
      this.showQuickSetup = true
    },
    closeQuickSetup () {
      this.showQuickSetup = false
      this.editingStore = null
    },
    handleQuickSetupSaved () {
      this.closeQuickSetup()
      this.loadData()
    },
    handleSwitchConfig (id) {
      if (this.currentStoreId === id) return
      const r = window.services.setUsingConfig(id)
      if (r.success) { this.notify('已切换配置'); this.loadData(); this.loadOriginalConfig() }
      else this.notify(r.error || '切换失败', 'error')
    },
    handleResetToOriginal () {
      if (!this.currentStoreId) return
      const r = window.services.resetToOriginalConfig()
      if (r.success) { this.notify('已恢复原始配置'); this.loadData() }
      else this.notify(r.error || '操作失败', 'error')
    },
    handleDelete (store) {
      if (!confirm(`确定删除配置「${store.title}」吗？`)) return
      const r = window.services.deleteConfig(store.id)
      if (r.success) { this.notify('已删除'); this.loadData() }
      else this.notify(r.error || '删除失败', 'error')
    },
    handleNotification (d) { this.notify(d.message, d.type) },
    notify (message, type = 'success') {
      this.notification = { message, type }
      setTimeout(() => { this.notification = null }, 2400)
    },
    getPresetLabel (store) {
      if (!store._presetId) return null
      const preset = this.presets.find(p => p.id === store._presetId)
      return preset ? preset.name : null
    }
  }
}
</script>

<style scoped>
.env {
  padding: var(--spacing-md) var(--spacing-sm);
  max-width: 100%;
  overflow-x: hidden;
  box-sizing: border-box;
}

.env-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}
.env-title { margin: 0; font-size: var(--font-size-lg); font-weight: 600; color: var(--text-primary); }
.env-desc { margin: 4px 0 0; font-size: var(--font-size-sm); color: var(--text-secondary); }
.env-add { height: 30px; padding: 0 14px; font-weight: 500; }

.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--spacing-sm);
}

/* 注意：uTools 老内核不支持 color-mix()，全部用 rgba/hex 兜底（见记忆 utools-no-color-mix） */
.env-card {
  --active-green: #22a06b;
  --active-green-rgb: 34, 160, 107;
  --active-bg: #eaf7f0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--card-radius);
  padding: 10px 12px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .08), 0 1px 2px rgba(0, 0, 0, .04);
  transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
}
/* hover：保持卡片本色（不染背景，避免与全局背景糊在一起），靠边框+阴影+上浮反馈 */
.env-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 8px 22px rgba(0, 0, 0, .13), 0 3px 6px rgba(0, 0, 0, .07);
  transform: translateY(-2px);
}
/* 生效：绿色卡片背景，辨识度高，与任何全局背景都拉开差距 */
.env-card.active {
  border-color: var(--active-green);
  background: var(--active-bg);
  box-shadow: 0 4px 14px rgba(var(--active-green-rgb), .22);
}
.env-card.active:hover {
  border-color: var(--active-green);
  background: #ddf0e4;
  box-shadow: 0 8px 24px rgba(var(--active-green-rgb), .34);
  transform: translateY(-2px);
}

@media (prefers-color-scheme: dark) {
  .env-card {
    --active-green: #34c98a;
    --active-green-rgb: 52, 201, 138;
    --active-bg: #16362a;
  }
  /* 深色下黑色投影看不见 —— 改用彩色发光 + 亮边框来体现浮起 */
  .env-card:hover {
    border-color: var(--primary-color);
    box-shadow: 0 10px 26px rgba(0, 0, 0, .55);
  }
  .env-card.active {
    box-shadow: 0 6px 20px rgba(var(--active-green-rgb), .35);
  }
  .env-card.active:hover {
    background: #1c4433;
    box-shadow: 0 10px 28px rgba(var(--active-green-rgb), .45);
  }
}

.card-top { display: flex; align-items: center; gap: 6px; min-height: 28px; }
.card-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.tag { flex: 0 0 auto; font-size: 11px; line-height: 1; padding: 3px 7px; border-radius: 5px; font-weight: 500; }
.tag-gray { background: var(--bg-hover); color: var(--text-tertiary); }
.tag-preset {
  background: rgba(79, 140, 255, 0.12);
  color: var(--primary-color);
  font-size: 11px;
  font-weight: 500;
}
.tag-off {
  flex: 0 0 auto;
  padding: 4px 9px; border-radius: 999px;
  background: var(--bg-hover); color: var(--text-tertiary); font-weight: 500;
}
.tag-on {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: 999px;
  background: rgba(var(--active-green-rgb), .18);
  color: var(--active-green); font-weight: 600;
}
.tag-on .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--active-green);
  box-shadow: 0 0 0 3px rgba(var(--active-green-rgb), .22);
}

.card-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 默认收起（宽度 0），负 margin 抵消父级 gap 让标签贴右；hover 展开推动标签左移 */
.card-tools {
  display: inline-flex;
  gap: 4px;
  max-width: 0;
  margin-left: -6px;
  opacity: 0;
  overflow: hidden;
  transition: max-width 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-left 0.28s ease;
}

.env-card:hover .card-tools {
  max-width: 80px;
  margin-left: 0;
  opacity: 1;
}

.tool {
  width: 26px; height: 26px;
  border: 1px solid var(--border-color); background: var(--card-bg);
  border-radius: 6px; cursor: pointer;
  color: var(--text-tertiary);
  display: inline-flex; align-items: center; justify-content: center;
  transition: all .15s ease;
  padding: 0;
}
.tool:hover { background: var(--primary-color); border-color: var(--primary-color); color: #fff; }
.tool-del:hover { background: #e53935; border-color: #e53935; color: #fff; }

.card-body {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  display: flex; flex-direction: column; gap: 6px;
}
.kv {
  position: relative;
  display: flex; align-items: center; gap: 6px;
  font-size: var(--font-size-sm);
}
.ki {
  flex: 0 0 auto;
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-tertiary);
}
/* 可点击展开的行（有 data-full 的）用手型光标提示 */
.kv[data-full] { cursor: pointer; border-radius: 6px; margin: -2px -4px; padding: 2px 4px; transition: background .15s ease; }
.kv[data-full]:hover { background: var(--bg-hover); }
.kv[data-full]:hover .ki,
.kv.expanded .ki { color: var(--primary-color); }
.v {
  flex: 1 1 auto; min-width: 0;
  color: var(--text-secondary);
  font-family: 'Consolas', 'Monaco', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: color .15s ease;
}
.kv[data-full]:hover .v { color: var(--text-primary); }
/* 点击展开的气泡：仅在 .expanded 时显示完整内容 */
.kv[data-full]::after {
  content: attr(data-full);
  position: absolute;
  left: 0; right: 0; bottom: calc(100% + 6px);
  z-index: 50;
  width: auto; max-width: 100%;
  padding: 7px 10px;
  border-radius: 6px;
  background: #1f2937; color: #f9fafb;
  font-size: 12px; font-family: 'Consolas', 'Monaco', monospace;
  line-height: 1.5; white-space: normal; word-break: break-all;
  box-shadow: 0 4px 14px rgba(0,0,0,.25);
  opacity: 0; visibility: hidden; transform: translateY(4px);
  transition: opacity .15s ease, transform .15s ease;
  pointer-events: none;
}
.kv.expanded[data-full]::after { opacity: 1; visibility: visible; transform: translateY(0); }
.kv-empty {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  padding: 6px 0;
}

.env-hint {
  margin-top: var(--spacing-lg);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  padding: 8px 16px; border-radius: 8px;
  background: var(--card-bg); border: 1px solid var(--border-color);
  box-shadow: var(--card-hover-shadow);
  font-size: var(--font-size-sm); font-weight: 500;
  color: var(--text-primary); z-index: 2000;
}
.toast.success { border-color: #43a047; color: #43a047; }
.toast.error { border-color: #e53935; color: #e53935; }
.toast-enter-active, .toast-leave-active { transition: all .22s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }

</style>
