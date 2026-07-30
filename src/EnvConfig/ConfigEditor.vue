<template>
  <div class="config-editor">
    <!-- 头部：标题 + 模式切换 + 取消/保存 -->
    <div class="editor-header">
      <input
        v-model="configName"
        class="title-input"
        placeholder="输入配置名称"
        spellcheck="false"
      />

      <div class="mode-switch" :data-mode="mode">
        <span class="mode-thumb"></span>
        <button :class="{ on: mode === 'form' }" @click="switchMode('form')">表单</button>
        <button :class="{ on: mode === 'json' }" @click="switchMode('json')">JSON</button>
      </div>

      <button class="btn-cancel" @click="$emit('close')">取消</button>
      <button class="btn-save" @click="handleSave">保存</button>
    </div>

    <!-- 表单模式 -->
    <div v-show="mode === 'form'" class="editor-content">
      <div
        v-for="(section, si) in sections"
        :key="section.sectionName"
        class="config-section"
      >
        <button class="section-head" @click="toggleSection(si)">
          <svg
            class="chevron" :class="{ open: openSections[si] }"
            viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span class="section-title">{{ section.sectionName }}</span>
          <span class="section-count">{{ filledCount(section) }}</span>
        </button>

        <div v-show="openSections[si]" class="section-content">
          <div v-for="field in section.fields" :key="field.name" class="field-row">
            <div class="field-label">
              <div class="label-main">{{ field.label }}</div>
              <div v-if="field.description" class="label-desc">{{ field.description }}</div>
            </div>
            <div class="field-input">
              <button
                v-if="field.name === 'env.ANTHROPIC_BASE_URL' && presets.length"
                class="btn-preset" title="套用预设"
                @click="showPresetMenu = !showPresetMenu"
              >+ 预设</button>

              <select v-if="field.type === 'boolean'" v-model="formData[field.name]" class="field-select">
                <option :value="undefined">默认</option>
                <option :value="true">true</option>
                <option :value="false">false</option>
              </select>

              <select v-else-if="field.type === 'select'" v-model="formData[field.name]" class="field-select">
                <option value="">{{ field.placeholder || '请选择…' }}</option>
                <option v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>

              <input
                v-else-if="field.type === 'number'"
                v-model.number="formData[field.name]"
                type="number" :placeholder="field.placeholder" class="field-text"
              />

              <input
                v-else
                v-model="formData[field.name]"
                type="text" :placeholder="field.placeholder" class="field-text"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 显示/隐藏高级选项按钮 -->
      <div class="toggle-advanced-container">
        <button class="btn-toggle-advanced" @click="toggleAdvancedFields">
          {{ showAdvancedFields ? '隐藏高级选项' : '显示高级选项' }}
        </button>
      </div>
    </div>

    <!-- JSON 模式 -->
    <div v-show="mode === 'json'" class="editor-content json-mode">
      <div class="json-toolbar">
        <span class="json-tip">编辑完整 settings.json</span>
        <span class="json-status" :class="jsonError ? 'bad' : 'ok'">
          {{ jsonError ? '格式有误' : '格式正确' }}
        </span>
        <button class="json-btn" @click="formatJson">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 6h16M4 12h10M4 18h13" />
          </svg>
          格式化
        </button>
      </div>
      <div class="json-editor">
        <pre class="json-hl" aria-hidden="true"><code v-html="highlighted"></code></pre>
        <textarea
          ref="jsonArea"
          v-model="jsonText"
          class="json-area"
          spellcheck="false"
          @input="onJsonInput"
          @scroll="syncScroll"
          placeholder='{ "env": { "ANTHROPIC_BASE_URL": "https://…" } }'
        ></textarea>
      </div>
      <p v-if="jsonError" class="json-error">⚠ {{ jsonError }}</p>
    </div>

    <!-- 预设菜单 -->
    <div v-if="showPresetMenu" class="preset-overlay" @click="showPresetMenu = false">
      <div class="preset-menu" @click.stop>
        <div class="preset-menu-title">套用预设</div>
        <div v-for="preset in presets" :key="preset.id" class="preset-item" @click="applyPreset(preset.id)">
          {{ preset.name }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { CONFIG_SECTIONS, getNestedValue, setNestedValue, cleanEmptyObjects, getBasicFields } from './ConfigFields.js'

export default {
  name: 'ConfigEditor',
  props: {
    store: { type: Object, default: null },
    presets: { type: Array, default: () => [] }
  },
  data () {
    return {
      sections: CONFIG_SECTIONS,
      formData: {},
      configName: '',
      mode: 'form',
      jsonText: '',
      jsonError: '',
      showPresetMenu: false,
      openSections: [],
      showAdvancedFields: false
    }
  },
  computed: {
    isEdit () { return !!this.store },
    highlighted () {
      return this.highlightJson(this.jsonText)
    }
  },
  mounted () {
    // 默认使用基础字段
    this.sections = getBasicFields()
    this.loadFormData()
    // 默认仅展开第一个分组（常用配置）
    this.openSections = this.sections.map((_, i) => i === 0)
  },
  methods: {
    loadFormData () {
      this.configName = this.store?.title || '新配置'
      const data = {}
      // 加载时使用完整字段列表，确保已有数据不丢失
      CONFIG_SECTIONS.forEach(section => {
        section.fields.forEach(field => {
          const value = getNestedValue(this.store?.settings || {}, field.name)
          if (value !== undefined) data[field.name] = value
        })
      })
      this.formData = data
    },
    toggleAdvancedFields () {
      this.showAdvancedFields = !this.showAdvancedFields
      this.sections = this.showAdvancedFields ? CONFIG_SECTIONS : getBasicFields()
      // 重新计算展开状态
      this.openSections = this.sections.map((_, i) => i === 0)
    },
    toggleSection (i) {
      this.openSections.splice(i, 1, !this.openSections[i])
    },
    filledCount (section) {
      const n = section.fields.filter(f => {
        const v = this.formData[f.name]
        return v !== undefined && v !== null && v !== ''
      }).length
      return n ? `${n} 项` : ''
    },
    buildSettings () {
      const settings = {}
      this.sections.forEach(section => {
        section.fields.forEach(field => {
          const value = this.formData[field.name]
          if (value !== undefined && value !== null && value !== '') {
            setNestedValue(settings, field.name, value)
          }
        })
      })
      return cleanEmptyObjects(settings)
    },
    switchMode (m) {
      if (m === this.mode) return
      if (m === 'json') {
        // 表单 → JSON：合并已有 settings（保留表单未覆盖的字段，如 permissions/hooks）
        const base = JSON.parse(JSON.stringify(this.store?.settings || {}))
        const formPart = this.buildSettings()
        const merged = this.deepMerge(base, formPart)
        this.jsonText = JSON.stringify(merged, null, 2)
        this.jsonError = ''
      } else {
        // JSON → 表单：解析并回填已知字段
        try {
          const parsed = JSON.parse(this.jsonText)
          this.jsonError = ''
          const data = {}
          this.sections.forEach(section => {
            section.fields.forEach(field => {
              const v = getNestedValue(parsed, field.name)
              if (v !== undefined) data[field.name] = v
            })
          })
          this.formData = data
        } catch (e) {
          this.$emit('notification', { message: 'JSON 格式错误，无法切回表单', type: 'error' })
          return
        }
      }
      this.mode = m
    },
    deepMerge (base, extra) {
      for (const k of Object.keys(extra)) {
        if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
          base[k] = this.deepMerge(base[k] && typeof base[k] === 'object' ? base[k] : {}, extra[k])
        } else {
          base[k] = extra[k]
        }
      }
      return base
    },
    applyPreset (presetId) {
      const result = window.services.applyPreset(presetId, this.buildSettings())
      if (result.success) {
        const settings = result.data
        this.sections.forEach(section => {
          section.fields.forEach(field => {
            const v = getNestedValue(settings, field.name)
            if (v !== undefined) this.formData[field.name] = v
          })
        })
        // 应用预设后展开常用配置，让用户看到变化
        this.openSections.splice(0, 1, true)
        this.showPresetMenu = false
        this.$emit('notification', { message: '预设已应用', type: 'success' })
      }
    },
    handleSave () {
      const name = (this.configName || '').trim()
      if (!name) {
        this.$emit('notification', { message: '请填写配置名称', type: 'error' })
        return
      }
      let settings
      if (this.mode === 'json') {
        try {
          settings = JSON.parse(this.jsonText)
        } catch (e) {
          this.jsonError = 'JSON 格式错误：' + e.message
          this.$emit('notification', { message: 'JSON 格式错误，请检查', type: 'error' })
          return
        }
      } else {
        // 表单模式：合并已有 settings，避免丢失表单外字段
        const base = JSON.parse(JSON.stringify(this.store?.settings || {}))
        settings = this.deepMerge(base, this.buildSettings())
      }

      const result = this.isEdit
        ? window.services.updateConfig(this.store.id, name, settings)
        : window.services.createConfig(name, settings)

      if (result.success) {
        this.$emit('notification', { message: this.isEdit ? '配置已更新' : '配置已创建', type: 'success' })
        this.$emit('saved', result.data)
      } else {
        this.$emit('notification', { message: result.error || '保存失败', type: 'error' })
      }
    },
    onJsonInput () {
      // 实时校验 JSON
      const t = this.jsonText.trim()
      if (!t) { this.jsonError = ''; return }
      try { JSON.parse(t); this.jsonError = '' }
      catch (e) { this.jsonError = e.message }
    },
    formatJson () {
      const t = this.jsonText.trim()
      if (!t) return
      try {
        this.jsonText = JSON.stringify(JSON.parse(t), null, 2)
        this.jsonError = ''
        this.$emit('notification', { message: '已格式化', type: 'success' })
      } catch (e) {
        this.jsonError = e.message
        this.$emit('notification', { message: 'JSON 格式错误，无法格式化', type: 'error' })
      }
    },
    syncScroll (e) {
      const pre = this.$el.querySelector('.json-hl')
      if (pre) { pre.scrollTop = e.target.scrollTop; pre.scrollLeft = e.target.scrollLeft }
    },
    escapeHtml (s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    },
    highlightJson (text) {
      if (!text) return ''
      const esc = this.escapeHtml(text)
      // 依次给 字符串键、字符串值、数字、布尔/null 套色
      return esc.replace(
        /("(\\.|[^"\\])*"\s*:)|("(\\.|[^"\\])*")|(\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b)|(\b(true|false|null)\b)/g,
        (m, key, _k2, str, _s2, num, _n2, _n3, bool) => {
          if (key) return '<span class="tk-key">' + key + '</span>'
          if (str) return '<span class="tk-str">' + str + '</span>'
          if (num) return '<span class="tk-num">' + num + '</span>'
          if (bool) return '<span class="tk-bool">' + bool + '</span>'
          return m
        }
      )
    }
  }
}
</script>

<style scoped>
/* uTools 老内核不支持 color-mix，统一用 rgba/hex（见记忆 utools-no-color-mix） */
.config-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
}

/* ===== 头部：两行（标题行 + 工具行）===== */
/* ===== 头部 ===== */
.editor-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}
/* 标题：markdown 式，仅底部边框，聚焦时底边变主题色 */
.title-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  border-bottom: 2px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
  padding: 4px 2px;
  transition: border-color .18s ease;
}
.title-input::placeholder { color: var(--text-tertiary); font-weight: 500; }
.title-input:hover { border-bottom-color: var(--text-tertiary); }
.title-input:focus { outline: none; border-bottom-color: var(--primary-color); }

/* 滑块式切换：高亮滑块随选中态左右滑动 */
.mode-switch {
  position: relative;
  flex: 0 0 auto;
  height: 30px;
  display: inline-flex;
  align-items: center;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 3px;
  box-sizing: border-box;
}
.mode-thumb {
  position: absolute;
  top: 3px; left: 3px;
  width: calc(50% - 3px);
  height: calc(100% - 6px);
  border-radius: 999px;
  background: var(--primary-color);
  box-shadow: 0 2px 8px rgba(79, 140, 255, .45);
  transition: transform .28s cubic-bezier(.34, 1.56, .64, 1);
  z-index: 0;
}
.mode-switch[data-mode="json"] .mode-thumb { transform: translateX(100%); }
.mode-switch button {
  position: relative;
  z-index: 1;
  height: 100%;
  min-width: 52px;
  display: inline-flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 0 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: color .2s ease;
}
.mode-switch button.on { color: #fff; }
.mode-switch button:not(.on):hover { color: var(--text-primary); }

.btn-cancel {
  flex: 0 0 auto;
  height: 30px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 12px; font-weight: 500;
  padding: 0 14px; border-radius: 4px;
  cursor: pointer; transition: all .15s ease;
}
.btn-cancel:hover { border-color: var(--text-tertiary); color: var(--text-primary); background: var(--bg-hover); }
.btn-cancel:active { transform: scale(.97); }

.btn-save {
  flex: 0 0 auto;
  height: 30px;
  border: 1px solid var(--primary-color);
  background: var(--primary-color);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  padding: 0 14px;
  border-radius: 4px;
  cursor: pointer;
  transition: all .15s ease;
}
.btn-save:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn-save:active { transform: scale(.97); }

/* ===== 内容区 ===== */
.editor-content {
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--spacing-lg);
}
/* 分组折叠：完整边框方框 */
.config-section {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: var(--spacing-md);
  overflow: hidden;
}
.section-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 12px 14px;
  border: none;
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background .15s ease;
}
.section-head:hover { background: var(--bg-hover); }
.chevron { flex: 0 0 auto; color: var(--text-tertiary); transition: transform .18s ease; }
.chevron.open { transform: rotate(90deg); }
.section-title { flex: 1 1 auto; }
.section-count {
  flex: 0 0 auto;
  font-size: 11px; font-weight: 500;
  color: var(--primary-color);
  background: rgba(79, 140, 255, .12);
  padding: 2px 8px; border-radius: 999px;
}
.section-content {
  padding: 4px 14px 12px;
  border-top: 1px solid var(--border-color);
}

/* 字段行：左右布局（label 左 / input 右） */
.field-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: 10px 0;
}
.field-row + .field-row { border-top: 1px solid var(--border-color); }
.field-label { flex: 0 0 42%; min-width: 0; }
.label-main {
  font-size: 13px; font-weight: 500; color: var(--text-primary);
  font-family: 'Consolas', 'Monaco', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.label-desc { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; line-height: 1.4; }
.field-input {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}
.field-text, .field-select {
  flex: 1 1 auto;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-hover);
  color: var(--text-primary);
  font-size: 13px;
  padding: 0 10px;
  box-sizing: border-box;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.field-text::placeholder { color: var(--text-tertiary); }
.field-text:hover, .field-select:hover { border-color: var(--text-tertiary); }
.field-text:focus, .field-select:focus {
  outline: none;
  border-color: var(--primary-color);
  background: var(--card-bg);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, .15);
}
.field-text { font-family: 'Consolas', 'Monaco', monospace; }

/* 自定义下拉箭头 */
.field-select {
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

.btn-preset {
  flex: 0 0 auto;
  border: 1px solid var(--primary-color);
  background: transparent;
  color: var(--primary-color);
  font-size: 12px; font-weight: 500;
  padding: 5px 10px; border-radius: 6px;
  cursor: pointer;
  transition: all .15s ease;
}
.btn-preset:hover { background: var(--primary-color); color: #fff; }

/* 显示/隐藏高级选项按钮 */
.toggle-advanced-container {
  display: flex;
  justify-content: center;
  padding: var(--spacing-md) 0;
  margin-top: var(--spacing-sm);
}

.btn-toggle-advanced {
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all .15s ease;
}

.btn-toggle-advanced:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--bg-hover);
}

/* ===== JSON 模式 ===== */
.json-mode { display: flex; flex-direction: column; gap: 0; }
.json-toolbar {
  display: flex; align-items: center; gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}
.json-tip { flex: 1 1 auto; font-size: 12px; color: var(--text-tertiary); }
.json-status { flex: 0 0 auto; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.json-status.ok { color: #16a34a; background: rgba(22, 163, 74, .12); }
.json-status.bad { color: #e5484d; background: rgba(229, 72, 77, .12); }
.json-btn {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 12px; font-weight: 500;
  padding: 4px 10px; border-radius: 7px;
  cursor: pointer; transition: all .15s ease;
}
.json-btn:hover { border-color: var(--primary-color); color: var(--primary-color); background: var(--bg-hover); }

/* 叠层高亮编辑器：底层 <pre> 高亮，上层透明 textarea 接收输入 */
.json-editor {
  position: relative;
  flex: 1 1 auto;
  min-height: 320px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-hover);
  overflow: hidden;
}
.json-editor:focus-within { border-color: var(--primary-color); box-shadow: 0 0 0 3px rgba(79, 140, 255, .15); }
.json-hl, .json-area {
  margin: 0;
  padding: 12px 14px;
  border: 0;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px; line-height: 1.6;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
  box-sizing: border-box;
}
.json-hl {
  position: absolute; inset: 0;
  overflow: auto;
  pointer-events: none;
  color: var(--text-primary);
}
.json-area {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  background: transparent;
  color: transparent;
  caret-color: var(--text-primary);
  resize: none;
  overflow: auto;
}
.json-area:focus { outline: none; }
.json-area::placeholder { color: var(--text-tertiary); }
.json-error { margin: var(--spacing-sm) 0 0; font-size: 12px; color: #e5484d; }

/* JSON 语法高亮配色 */
.json-hl :deep(.tk-key) { color: #0550ae; }
.json-hl :deep(.tk-str) { color: #16a34a; }
.json-hl :deep(.tk-num) { color: #b25000; }
.json-hl :deep(.tk-bool) { color: #9333ea; }
@media (prefers-color-scheme: dark) {
  .json-hl :deep(.tk-key) { color: #6fb3ff; }
  .json-hl :deep(.tk-str) { color: #5fcf8d; }
  .json-hl :deep(.tk-num) { color: #ffab6b; }
  .json-hl :deep(.tk-bool) { color: #d0a6ff; }
}
/* ===== 预设菜单 ===== */
.preset-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, .4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.preset-menu {
  min-width: 220px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, .28);
  overflow: hidden;
  padding: 6px;
}
.preset-menu-title {
  padding: 8px 12px 6px;
  font-size: 12px; font-weight: 600;
  color: var(--text-tertiary);
}
.preset-item {
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 8px;
  transition: background .15s ease;
}
.preset-item:hover { background: var(--bg-hover); color: var(--primary-color); }
</style>
