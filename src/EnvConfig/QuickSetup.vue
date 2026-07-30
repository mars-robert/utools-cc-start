<template>
  <div class="quick-setup-overlay" @click="$emit('close')">
    <div class="quick-setup" @click.stop>
      <div class="setup-toolbar" :class="{ divided: selectedPreset || editingConfig }">
        <div v-if="selectedPreset && !editingConfig" class="toolbar-provider">
          <button
            class="toolbar-button"
            @click="selectedPreset = null"
            title="返回服务商选择"
            aria-label="返回服务商选择"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="toolbar-provider-logo">
            <img v-if="selectedPreset.logo" :src="selectedPreset.logo" alt="" class="provider-logo" />
            <span v-else-if="selectedPreset.iconType === 'emoji'">{{ selectedPreset.icon }}</span>
            <span v-else class="icon-badge" :style="{ background: selectedPreset.iconColor }">{{ selectedPreset.icon }}</span>
          </span>
          <span class="toolbar-provider-name">{{ selectedPreset.name }}</span>
          <button
            v-if="selectedPreset.website"
            type="button"
            class="toolbar-link"
            :title="`访问 ${selectedPreset.name} 官网`"
            :aria-label="`访问 ${selectedPreset.name} 官网`"
            @click="openWebsite(selectedPreset.website)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </button>
        </div>
        <span v-else-if="!editingConfig" class="toolbar-label">选择 Claude Code API 服务商</span>
        <span v-else class="toolbar-spacer" aria-hidden="true"></span>
        <button class="toolbar-button" @click="$emit('close')" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 步骤 1：选择服务商（仅新增时显示） -->
      <div v-if="!editingConfig && !selectedPreset" class="preset-grid">
        <div class="preset-cards">
          <div
            v-for="preset in presets"
            :key="preset.id"
            class="preset-card"
            :class="{ template: preset.isTemplate }"
            :style="{
              '--provider-color': preset.iconColor || 'var(--primary-color)',
              '--provider-color-dark': preset.iconColorDark || preset.iconColor || 'var(--primary-color)',
              '--provider-surface': preset.cardSurface || 'var(--card-bg)',
              '--provider-border': preset.cardBorder || 'var(--border-color)',
              '--provider-surface-dark': preset.cardSurfaceDark || 'var(--card-bg)',
              '--provider-border-dark': preset.cardBorderDark || 'var(--border-color)',
              '--provider-shadow': preset.cardShadow || 'rgba(0, 0, 0, 0.12)'
            }"
            role="button"
            tabindex="0"
            @click="handlePresetClick(preset)"
            @keydown.enter.prevent="handlePresetClick(preset)"
            @keydown.space.prevent="handlePresetClick(preset)"
          >
            <div class="preset-card-head">
              <div class="preset-icon">
                <img v-if="preset.logo" :src="preset.logo" alt="" class="provider-logo" />
                <span v-else-if="preset.iconType === 'emoji'">{{ preset.icon }}</span>
                <span v-else class="icon-badge" :style="{ background: preset.iconColor }">{{ preset.icon }}</span>
              </div>
              <span v-if="preset.isTemplate" class="preset-badge">需修改</span>
            </div>
            <div class="preset-name">{{ preset.name }}</div>
            <div class="preset-desc">{{ preset.description }}</div>
            <svg class="preset-arrow" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 步骤 2：填写配置（选中预设或编辑时显示） -->
      <div v-if="selectedPreset || editingConfig" class="config-form">
        <div class="form-section">
          <div class="form-field">
            <label class="field-label">配置名称</label>
            <input
              v-model="form.name"
              type="text"
              class="field-input"
              placeholder="例如：DeepSeek 主力"
              @keydown.enter="handleSave"
            />
          </div>

          <div class="form-field">
            <label class="field-label">API Base URL</label>
            <input
              v-model="form.baseUrl"
              type="text"
              class="field-input"
              placeholder="https://api.anthropic.com"
            />
          </div>

          <div class="form-field">
            <label class="field-label">API Token</label>
            <div class="input-with-icon">
              <input
                v-model="form.token"
                :type="tokenVisible ? 'text' : 'password'"
                class="field-input"
                :placeholder="selectedPreset?.tokenPlaceholder || 'sk-ant-...'"
                @keydown.enter="handleSave"
              />
              <button class="btn-toggle-visibility" @click="tokenVisible = !tokenVisible" type="button">
                <svg v-if="tokenVisible" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 高级选项折叠 -->
          <div class="advanced-section" :class="{ open: showAdvanced }">
            <button
              type="button"
              class="btn-toggle-advanced"
              :aria-expanded="showAdvanced"
              aria-controls="advanced-settings-panel"
              @click="showAdvanced = !showAdvanced"
            >
              <span class="advanced-label">
                <svg class="advanced-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
                </svg>
                <span>高级设置</span>
              </span>
              <span class="advanced-chevron" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </button>

            <div
              id="advanced-settings-panel"
              class="advanced-collapse"
              :aria-hidden="!showAdvanced"
            >
              <div class="advanced-collapse-inner">
                <div class="advanced-fields">
                  <div class="form-field">
                    <label class="field-label">默认模型（可选）</label>
                    <input
                      v-model="form.model"
                      type="text"
                      class="field-input"
                      placeholder="claude-opus-4"
                    />
                  </div>

                  <div class="form-field">
                    <label class="field-label">其他环境变量（JSON 格式）</label>
                    <div class="extra-json-editor" :class="{ invalid: extraJsonError }">
                      <pre ref="extraJsonHighlight" class="extra-json-highlight" aria-hidden="true"><code v-html="highlightedExtraJson"></code></pre>
                      <textarea
                        v-model="extraJson"
                        class="extra-json-input"
                        rows="4"
                        spellcheck="false"
                        aria-label="其他环境变量（JSON 格式）"
                        placeholder='{ "CLAUDE_CODE_EFFORT_LEVEL": "high" }'
                        @input="extraJsonError = ''"
                        @scroll="syncExtraJsonScroll"
                      ></textarea>
                    </div>
                    <div v-if="extraJsonError" class="field-error">{{ extraJsonError }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" @click="handleSave">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
            {{ editingConfig ? '保存并应用' : '创建并启用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'QuickSetup',
  props: {
    presets: { type: Array, default: () => [] },
    editingConfig: { type: Object, default: null }
  },
  data () {
    return {
      selectedPreset: null,
      form: {
        name: '',
        token: '',
        baseUrl: '',
        model: ''
      },
      extraJson: '',
      extraJsonError: '',
      tokenVisible: false,
      showAdvanced: false
    }
  },
  mounted () {
    if (this.editingConfig) {
      this.loadEditingData()
    }
  },
  computed: {
    highlightedExtraJson () {
      return this.highlightJson(this.extraJson)
    }
  },
  methods: {
    openWebsite (url) {
      if (!url) return

      if (window.utools && typeof window.utools.shellOpenExternal === 'function') {
        window.utools.shellOpenExternal(url)
        return
      }

      window.open(url, '_blank', 'noopener,noreferrer')
    },

    syncExtraJsonScroll (event) {
      const highlight = this.$refs.extraJsonHighlight
      if (!highlight) return

      highlight.scrollTop = event.target.scrollTop
      highlight.scrollLeft = event.target.scrollLeft
    },

    escapeHtml (value) {
      return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    },

    highlightJson (text) {
      if (!text) return ''

      const escaped = this.escapeHtml(text)
      return escaped.replace(
        /("(\\.|[^"\\])*"\s*:)|("(\\.|[^"\\])*")|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|(\b(true|false|null)\b)/g,
        (match, key, _keyEscape, string, _stringEscape, number, _decimal, _exponent, literal) => {
          if (key) return '<span class="json-key">' + key + '</span>'
          if (string) return '<span class="json-string">' + string + '</span>'
          if (number) return '<span class="json-number">' + number + '</span>'
          if (literal) return '<span class="json-literal">' + literal + '</span>'
          return match
        }
      )
    },

    handlePresetClick (preset) {
      this.selectedPreset = preset
      this.form.name = preset.name
      this.form.baseUrl = preset.settings?.env?.ANTHROPIC_BASE_URL || ''
      this.form.model = preset.settings?.env?.ANTHROPIC_MODEL || ''
      this.form.token = ''

      // 提取其他环境变量
      const extra = {}
      if (preset.settings?.env) {
        Object.keys(preset.settings.env).forEach(key => {
          if (!['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL'].includes(key)) {
            extra[key] = preset.settings.env[key]
          }
        })
      }
      if (Object.keys(extra).length > 0) {
        this.extraJson = JSON.stringify(extra, null, 2)
      }
    },

    loadEditingData () {
      const cfg = this.editingConfig
      this.form.name = cfg.title || ''
      this.form.token = cfg.settings?.env?.ANTHROPIC_AUTH_TOKEN || ''
      this.form.baseUrl = cfg.settings?.env?.ANTHROPIC_BASE_URL || ''
      this.form.model = cfg.settings?.env?.ANTHROPIC_MODEL || ''

      // 提取其他环境变量
      const extra = {}
      if (cfg.settings?.env) {
        Object.keys(cfg.settings.env).forEach(key => {
          if (!['ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_MODEL'].includes(key)) {
            extra[key] = cfg.settings.env[key]
          }
        })
      }
      if (Object.keys(extra).length > 0) {
        this.extraJson = JSON.stringify(extra, null, 2)
        this.showAdvanced = true
      }
    },

    handleSave () {
      const name = (this.form.name || '').trim()
      if (!name) {
        this.$emit('notification', { message: '请填写配置名称', type: 'error' })
        return
      }

      if (!this.form.token && !this.editingConfig) {
        this.$emit('notification', { message: '请填写 API Token', type: 'error' })
        return
      }

      // 解析额外的 JSON
      let extra = {}
      if (this.extraJson.trim()) {
        try {
          extra = JSON.parse(this.extraJson)
          this.extraJsonError = ''
        } catch (e) {
          this.extraJsonError = 'JSON 格式错误：' + e.message
          return
        }
      }

      // 构建 settings
      const settings = {
        env: {
          ANTHROPIC_BASE_URL: this.form.baseUrl || '',
          ANTHROPIC_AUTH_TOKEN: this.form.token || '',
          ...(this.form.model ? { ANTHROPIC_MODEL: this.form.model } : {}),
          ...extra
        }
      }

      if (this.editingConfig) {
        const result = window.services.updateConfig(this.editingConfig.id, name, settings)
        if (result.success) {
          const applyResult = window.services.setUsingConfig(this.editingConfig.id)
          if (!applyResult.success) {
            this.$emit('notification', { message: '配置已保存，但应用失败：' + (applyResult.error || '未知错误'), type: 'error' })
            this.$emit('saved')
            return
          }

          this.$emit('notification', { message: '配置已保存并应用', type: 'success' })
          this.$emit('saved')
        } else {
          this.$emit('notification', { message: result.error || '更新失败', type: 'error' })
        }
      } else {
        const result = window.services.createConfig(name, settings, this.selectedPreset?.id)
        if (result.success) {
          const applyResult = window.services.setUsingConfig(result.data.id)
          if (!applyResult.success) {
            this.$emit('notification', { message: '配置已创建，但启用失败：' + (applyResult.error || '未知错误'), type: 'error' })
            this.$emit('saved')
            return
          }

          this.$emit('notification', { message: '配置已创建并启用', type: 'success' })
          this.$emit('saved')
        } else {
          this.$emit('notification', { message: result.error || '创建失败', type: 'error' })
        }
      }
    }
  }
}
</script>

<style scoped>
/* 遮罩层 */
.quick-setup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 弹窗主体 */
.quick-setup {
  position: relative;
  width: 92%;
  max-width: 620px;
  max-height: 85vh;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.18s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: translateY(0); }
}

.setup-toolbar {
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  box-sizing: border-box;
}

.setup-toolbar.divided {
  border-bottom: 1px solid var(--border-color);
}

.toolbar-spacer,
.toolbar-button {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
}

.toolbar-label {
  min-width: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-provider {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-provider-logo {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: #fff;
  font-size: 15px;
}

.toolbar-provider-logo .provider-logo {
  width: 18px;
  height: 18px;
}

.toolbar-provider-logo .icon-badge {
  font-size: 10px;
}

.toolbar-provider-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 28px;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-link {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.toolbar-link:hover {
  border-color: var(--border-color);
  background: var(--bg-hover);
  color: var(--primary-color);
}

.toolbar-link:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

.toolbar-button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.toolbar-button:hover {
  background: var(--bg-hover);
  border-color: var(--border-color);
  color: var(--text-primary);
}

.toolbar-button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 1px;
}

/* 预设网格 */
.preset-grid {
  padding: 4px 20px 20px;
  overflow-y: auto;
}

.preset-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.preset-card {
  --provider-color: var(--primary-color);
  --provider-color-dark: var(--provider-color);
  --provider-active-color: var(--provider-color);
  --provider-surface: var(--card-bg);
  --provider-border: var(--border-color);
  --provider-surface-dark: var(--card-bg);
  --provider-border-dark: var(--border-color);
  --provider-shadow: rgba(0, 0, 0, 0.12);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  min-width: 0;
  min-height: 116px;
  padding: 13px 42px 13px 13px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--provider-border);
  border-radius: 6px;
  background: var(--provider-surface);
  cursor: pointer;
  text-align: left;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transform: translateY(0);
  transition: transform 0.16s ease-out, border-color 0.16s ease-out, box-shadow 0.16s ease-out;
}

.preset-card:hover,
.preset-card:focus-visible {
  outline: none;
  border-color: var(--provider-active-color);
  box-shadow: 0 0 0 2px var(--provider-border), 0 8px 20px var(--provider-shadow);
  transform: translateY(-2px);
}

.preset-card:active {
  box-shadow: 0 0 0 1px var(--provider-border), 0 3px 8px var(--provider-shadow);
  transform: translateY(0);
}

.preset-card.template {
  border-style: dashed;
}

.preset-card-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  min-height: 36px;
  margin-bottom: 11px;
}

.preset-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  flex: 0 0 36px;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--provider-border);
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  transition: border-color 0.16s ease-out, box-shadow 0.16s ease-out;
}

.provider-logo {
  display: block;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  transition: filter 0.18s ease;
}

.preset-card:hover .preset-icon,
.preset-card:focus-visible .preset-icon {
  border-color: var(--provider-active-color);
  box-shadow: 0 0 0 2px var(--provider-border);
}

.preset-card:hover .icon-badge,
.preset-card:focus-visible .icon-badge {
  filter: saturate(1.08) brightness(1.04);
}

.preset-name {
  position: relative;
  z-index: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preset-desc {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 32px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.45;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.preset-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.preset-arrow {
  position: absolute;
  z-index: 2;
  top: 31px;
  right: 12px;
  flex: 0 0 auto;
  margin: 0;
  padding: 3px;
  border-radius: 5px;
  box-sizing: content-box;
  color: var(--provider-active-color);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--provider-border);
  opacity: 0.72;
  transform: translateY(-50%);
  transition: color 0.16s ease-out, background 0.16s ease-out, border-color 0.16s ease-out, transform 0.16s ease-out, opacity 0.16s ease-out;
}

.preset-card:hover .preset-arrow,
.preset-card:focus-visible .preset-arrow {
  color: #fff;
  background: var(--provider-active-color);
  border-color: var(--provider-active-color);
  opacity: 1;
  transform: translate(2px, -50%);
}

/* 配置表单 */
.config-form {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.form-section {
  flex: 1 1 auto;
  padding: 20px 20px 10px;
  overflow-y: auto;
}

.form-field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.field-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 14px;
  font-family: 'Consolas', 'Monaco', monospace;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.field-input:hover {
  border-color: var(--text-tertiary);
}

.field-input:focus {
  outline: none;
  border-color: var(--primary-color);
  background: var(--card-bg);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
}

.field-input::placeholder {
  color: var(--text-tertiary);
}

.extra-json-editor {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-hover);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.extra-json-editor:hover {
  border-color: var(--text-tertiary);
}

.extra-json-editor:focus-within {
  border-color: var(--primary-color);
  background: var(--card-bg);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.15);
}

.extra-json-editor.invalid {
  border-color: #e5484d;
}

.extra-json-highlight,
.extra-json-input {
  margin: 0;
  padding: 10px 12px;
  border: 0;
  box-sizing: border-box;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.extra-json-highlight {
  position: absolute;
  inset: 0;
  overflow: auto;
  pointer-events: none;
  color: var(--text-primary);
  scrollbar-width: none;
}

.extra-json-highlight::-webkit-scrollbar {
  display: none;
}

.extra-json-input {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-height: 96px;
  resize: vertical;
  overflow: auto;
  outline: none;
  background: transparent;
  color: transparent;
  caret-color: var(--text-primary);
  -webkit-text-fill-color: transparent;
}

.extra-json-input::placeholder {
  color: var(--text-tertiary);
  -webkit-text-fill-color: var(--text-tertiary);
}

.extra-json-highlight :deep(.json-key) {
  color: #0550ae;
}

.extra-json-highlight :deep(.json-string) {
  color: #16843d;
}

.extra-json-highlight :deep(.json-number) {
  color: #b25000;
}

.extra-json-highlight :deep(.json-literal) {
  color: #9333ea;
}

.field-error {
  margin-top: 6px;
  font-size: 12px;
  color: #e53935;
}

.input-with-icon {
  position: relative;
}

.input-with-icon .field-input {
  padding-right: 40px;
}

.btn-toggle-visibility {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.btn-toggle-visibility:hover {
  background: var(--card-bg);
  color: var(--text-primary);
}

/* 高级选项 */
.advanced-section {
  margin-top: 4px;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  transition: border-color 0.18s ease;
}

.btn-toggle-advanced {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.15s ease;
}

.btn-toggle-advanced:hover {
  color: var(--primary-color);
}

.btn-toggle-advanced:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.advanced-label {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.advanced-icon {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  transition: color 0.15s ease;
}

.btn-toggle-advanced:hover .advanced-icon,
.advanced-section.open .advanced-icon {
  color: var(--primary-color);
}

.advanced-chevron {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--text-tertiary);
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.advanced-chevron svg {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-toggle-advanced:hover .advanced-chevron {
  border-color: var(--border-color);
  background: var(--bg-hover);
  color: var(--text-primary);
}

.advanced-section.open .advanced-chevron {
  border-color: rgba(79, 140, 255, 0.28);
  background: rgba(79, 140, 255, 0.1);
  color: var(--primary-color);
}

.advanced-section.open .advanced-chevron svg {
  transform: rotate(180deg);
}

.advanced-collapse {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition: grid-template-rows 0.24s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.16s ease, visibility 0s linear 0.24s;
}

.advanced-section.open .advanced-collapse {
  grid-template-rows: 1fr;
  opacity: 1;
  visibility: visible;
  transition: grid-template-rows 0.24s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease 0.04s, visibility 0s linear;
}

.advanced-collapse-inner {
  min-height: 0;
  overflow: hidden;
}

.advanced-fields {
  padding: 8px 4px 0;
  transform: translateY(-6px);
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.advanced-section.open .advanced-fields {
  transform: translateY(0);
}

.advanced-fields .form-field:last-child {
  margin-bottom: 14px;
}

/* 操作按钮 */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 10px;
  background: var(--card-bg);
}

.btn {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 13px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}

.btn-primary {
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: #fff;
}

.btn-primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  box-shadow: 0 3px 10px rgba(79, 140, 255, 0.24);
}

.btn-primary:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.btn:active {
  transform: translateY(1px);
  box-shadow: none;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .quick-setup-overlay {
    background: rgba(0, 0, 0, 0.75);
  }

  .quick-setup {
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.7);
  }

  .preset-card {
    --provider-active-color: var(--provider-color-dark);
    background: var(--provider-surface-dark);
    border-color: var(--provider-border-dark);
  }

  .preset-arrow {
    background: var(--provider-border-dark);
  }

  .preset-icon {
    border-color: var(--provider-border-dark);
  }

  .preset-card:hover,
  .preset-card:focus-visible {
    border-color: var(--provider-active-color);
    box-shadow: 0 0 0 2px var(--provider-border-dark), 0 8px 20px rgba(0, 0, 0, 0.4);
  }

  .preset-card:active {
    box-shadow: 0 0 0 1px var(--provider-border-dark), 0 3px 8px rgba(0, 0, 0, 0.35);
  }

  .extra-json-highlight :deep(.json-key) {
    color: #6fb3ff;
  }

  .extra-json-highlight :deep(.json-string) {
    color: #5fcf8d;
  }

  .extra-json-highlight :deep(.json-number) {
    color: #ffab6b;
  }

  .extra-json-highlight :deep(.json-literal) {
    color: #d0a6ff;
  }
}

@media (prefers-reduced-motion: reduce) {
  .quick-setup-overlay,
  .quick-setup {
    animation: none;
  }

  .preset-card,
  .preset-icon,
  .icon-badge,
  .preset-arrow,
  .advanced-section,
  .advanced-icon,
  .advanced-chevron,
  .advanced-chevron svg,
  .advanced-collapse,
  .advanced-fields {
    transition: none;
  }

  .preset-card:hover,
  .preset-card:focus-visible,
  .preset-card:active,
  .preset-card:hover .preset-icon,
  .preset-card:focus-visible .preset-icon {
    transform: none;
  }

  .preset-card:hover .preset-arrow,
  .preset-card:focus-visible .preset-arrow {
    transform: translateY(-50%);
  }
}

@media (max-width: 560px) {
  .quick-setup {
    width: calc(100% - 24px);
    max-height: calc(100vh - 24px);
  }

  .preset-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preset-grid {
    padding: 4px 16px 16px;
  }

  .form-section {
    padding: 16px 16px 8px;
  }

}

@media (max-width: 390px) {
  .preset-cards {
    grid-template-columns: 1fr;
  }
}
</style>
