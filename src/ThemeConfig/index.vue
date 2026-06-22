<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { applyTheme } from '../theme'

const DEFAULT_PRIMARY: string = window.services.DEFAULT_PRIMARY
const presets: string[] = window.services.PRESET_PRIMARIES

const currentColor = ref(DEFAULT_PRIMARY)
const saved = ref(false)

const load = () => {
  const s = window.services.getThemeSettings()
  currentColor.value = s.primaryColor || DEFAULT_PRIMARY
}

const flashSaved = () => {
  saved.value = true
  setTimeout(() => { saved.value = false }, 1500)
}

// 归一化为小写 #rrggbb，便于比较与展示
const normalize = (hex: string) => (hex || '').toLowerCase()

const isPreset = (hex: string) => normalize(currentColor.value) === normalize(hex)

// 当前色不匹配任何预设时，视为自定义
const isCustom = computed(() => !presets.some((p) => isPreset(p)))

const pickColor = (hex: string) => {
  currentColor.value = hex
  applyTheme(hex)
  window.services.setThemeColor(hex)
  flashSaved()
}

// 拖动取色：仅实时预览（廉价的 CSS 变量更新），不写盘
const onCustomInput = (e: Event) => {
  const hex = (e.target as HTMLInputElement).value
  currentColor.value = hex
  applyTheme(hex)
}

// 选色提交（松开取色器）：此时才持久化一次
const onCustomChange = (e: Event) => {
  const hex = (e.target as HTMLInputElement).value
  currentColor.value = hex
  applyTheme(hex)
  window.services.setThemeColor(hex)
  flashSaved()
}

const resetDefault = () => {
  currentColor.value = DEFAULT_PRIMARY
  applyTheme(DEFAULT_PRIMARY)
  window.services.resetTheme()
  flashSaved()
}

onMounted(load)
</script>

<template>
  <div class="conf">
    <div class="section card">
      <h3 class="section-title">
        主题主色
        <span v-if="saved" class="saved-badge">✓ 已保存</span>
      </h3>

      <!-- 预设配色 -->
      <p class="hint">从同色域预设中选择，或在下方自定义取色。</p>
      <div class="preset-grid">
        <button
          v-for="p in presets"
          :key="p"
          class="swatch"
          :class="{ selected: isPreset(p) }"
          :style="{ background: p }"
          :title="p"
          @click="pickColor(p)"
        >
          <span v-if="isPreset(p)" class="check">✓</span>
        </button>
      </div>

      <!-- 自定义取色 -->
      <div class="custom-row">
        <label class="custom-label">自定义：</label>
        <input
          type="color"
          class="color-input"
          :value="currentColor"
          @input="onCustomInput"
          @change="onCustomChange"
        />
        <code class="hex-value" :class="{ active: isCustom }">{{ currentColor.toUpperCase() }}</code>
        <button class="btn" @click="resetDefault">恢复默认</button>
      </div>

      <!-- 预览：模拟真实列表与按钮 -->
      <div class="preview">
        <div class="preview-label">效果预览</div>

        <!-- 列表选中态（仿配置页单选列表） -->
        <div class="pv-radio-list">
          <div class="pv-radio-item selected">
            <span class="pv-radio-dot"></span>
            <div class="pv-radio-content">
              <code class="pv-radio-detail">claude --resume</code>
              <span class="pv-radio-sub">Claude 恢复会话</span>
            </div>
            <span class="pv-badge">自定义</span>
          </div>
          <div class="pv-radio-item">
            <span class="pv-radio-dot empty"></span>
            <div class="pv-radio-content">
              <code class="pv-radio-detail">claude</code>
              <span class="pv-radio-sub">Claude</span>
            </div>
          </div>
        </div>

        <!-- 列表选中态（仿项目启动器高亮行） -->
        <div class="pv-launch-list">
          <div class="pv-launch-item active">
            <span class="pv-launch-name">my-project</span>
            <span class="pv-launch-shortcut">↵</span>
          </div>
          <div class="pv-launch-item">
            <span class="pv-launch-name">another-repo</span>
          </div>
        </div>

        <!-- 按钮组 -->
        <div class="pv-btn-row">
          <button class="btn btn-primary">主按钮</button>
          <button class="btn">次按钮</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conf { box-sizing: border-box; }

.section { margin-bottom: var(--spacing-xl); }
.section-title {
  margin: 0 0 var(--spacing-lg);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.hint {
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.swatch {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 2px solid var(--border-color);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.swatch:hover { transform: scale(1.08); }
.swatch.selected { border-color: var(--text-primary); }
.swatch .check {
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}

.custom-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
}
.custom-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.color-input {
  width: 44px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  cursor: pointer;
}
.hex-value {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--bg-hover);
}
.hex-value.active { color: var(--primary-color); }

.preview {
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}
.preview-label {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
}

/* 单选列表预览（仿 LauncherConfig） */
.pv-radio-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}
.pv-radio-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.pv-radio-item.selected {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  border-color: var(--primary-color);
}
.pv-radio-dot {
  flex: 0 0 auto;
  width: 18px; height: 18px;
  border: 2px solid var(--primary-color);
  border-radius: 50%;
  position: relative;
}
.pv-radio-dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  background: var(--primary-color);
  border-radius: 50%;
}
.pv-radio-dot.empty {
  border-color: var(--border-color);
}
.pv-radio-dot.empty::after { display: none; }
.pv-radio-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.pv-radio-detail {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  font-weight: 500;
}
.pv-radio-sub {
  font-size: 12px;
  color: var(--text-secondary);
}
.pv-badge {
  flex: 0 0 auto;
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: color-mix(in srgb, var(--primary-color) 14%, transparent);
  color: var(--primary-color); font-weight: 400;
}

/* 启动器高亮行预览（仿 ProjectLauncher） */
.pv-launch-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--spacing-md);
}
.pv-launch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 5px;
}
.pv-launch-item.active {
  background-color: var(--primary-color);
  color: #fff;
}
.pv-launch-name {
  flex: 1 1 auto;
  font-weight: 600;
  font-size: 14px;
}
.pv-launch-shortcut {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* 按钮组预览 */
.pv-btn-row {
  display: flex;
  gap: var(--spacing-sm);
}

.saved-badge {
  color: #43a047;
  font-size: var(--font-size-sm);
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
