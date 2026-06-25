<script lang="ts" setup>
import { ref } from 'vue'
import LauncherConfig from '../LauncherConfig/index.vue'
import CommandManage from '../CommandManage/index.vue'
import ClaudeConfig from '../ClaudeConfig/index.vue'
import ThemeConfig from '../ThemeConfig/index.vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

const activeTab = ref<'launch' | 'commands' | 'claude' | 'theme'>('launch')
</script>

<template>
  <div class="unified-config">
    <div class="sidebar">
      <button
        class="nav-item"
        :class="{ active: activeTab === 'launch' }"
        @click="activeTab = 'launch'"
      >
        <span class="nav-icon nav-icon--launch">⚙</span>
        <span class="nav-text">启动配置</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'commands' }"
        @click="activeTab = 'commands'"
      >
        <span class="nav-icon nav-icon--cmd">⌘</span>
        <span class="nav-text">快捷命令</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'claude' }"
        @click="activeTab = 'claude'"
      >
        <span class="nav-icon nav-icon--json">⌬</span>
        <span class="nav-text">.claude.json 配置</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'theme' }"
        @click="activeTab = 'theme'"
      >
        <span class="nav-icon nav-icon--theme">🎨</span>
        <span class="nav-text">主题配置</span>
      </button>
    </div>

    <div class="content">
      <LauncherConfig v-show="activeTab === 'launch'" />
      <CommandManage v-show="activeTab === 'commands'" />
      <ClaudeConfig v-show="activeTab === 'claude'" />
      <ThemeConfig v-show="activeTab === 'theme'" />
    </div>
  </div>
</template>

<style scoped>
.unified-config {
  display: flex;
  flex-direction: row;
  height: 100vh;
  box-sizing: border-box;
}

.sidebar {
  flex: 0 0 180px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  border-right: 1px solid var(--border-color);
  border-radius: 0 10px 10px 0;
  background: var(--card-bg);
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  height: 36px;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--primary-color);
  color: #ffffff;
}

.nav-icon {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  text-align: center;
}

/* 各图标字形大小不一，按字号分别配平 */
.nav-icon--launch {
  font-size: 18px;
}

.nav-icon--cmd {
  font-size: 14px;
}

.nav-icon--json {
  font-size: 26px;
}

.nav-icon--theme {
  font-size: 15px;
}

.nav-text {
  font-weight: 500;
}

.content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 10px;
}
</style>
