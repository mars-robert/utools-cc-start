<script lang="ts" setup>
import { ref } from 'vue'
import LauncherConfig from '../LauncherConfig/index.vue'
import CommandManage from '../CommandManage/index.vue'
import ClaudeConfig from '../ClaudeConfig/index.vue'
import EnvConfig from '../EnvConfig/index.vue'
import ThemeConfig from '../ThemeConfig/index.vue'

defineProps({
  enterAction: {
    type: Object,
    required: true
  }
})

const activeTab = ref<'env' | 'launch' | 'commands' | 'claude' | 'theme'>('env')
</script>

<template>
  <div class="unified-config">
    <div class="sidebar">
      <button
        class="nav-item"
        :class="{ active: activeTab === 'env' }"
        @click="activeTab = 'env'"
      >
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M8 21h8M12 18v3M7 9l2 2-2 2M12 13h4" />
          </svg>
        </span>
        <span class="nav-text">环境配置</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'launch' }"
        @click="activeTab = 'launch'"
      >
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v9" />
            <path d="M7.5 6.5a7 7 0 1 0 9 0" />
          </svg>
        </span>
        <span class="nav-text">启动配置</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'commands' }"
        @click="activeTab = 'commands'"
      >
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 9l3 3-3 3M13 15h4" />
          </svg>
        </span>
        <span class="nav-text">快捷命令</span>
      </button>
      <button
        class="nav-item"
        :class="{ active: activeTab === 'theme' }"
        @click="activeTab = 'theme'"
      >
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-6.6-9-6.6Z" />
            <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" />
            <circle cx="16.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span class="nav-text">主题配置</span>
      </button>
    </div>

    <div class="content">
      <LauncherConfig v-show="activeTab === 'launch'" />
      <CommandManage v-show="activeTab === 'commands'" />
      <EnvConfig v-show="activeTab === 'env'" />
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
  flex: 0 0 140px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-right: 1px solid var(--border-color);
  /* background: var(--card-bg); */
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

/* hover 凹陷：更暗的底色 + 内阴影 + 轻微内缩，营造"按进去"的感觉 */
.nav-item:hover {
  background: rgba(0, 0, 0, .07);
  color: var(--text-primary);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, .18), inset 0 0 0 1px rgba(0, 0, 0, .06);
  transform: scale(.97);
}

.nav-item:active {
  background: rgba(0, 0, 0, .11);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, .28);
  transform: scale(.95);
}

.nav-item.active {
  background: var(--primary-color);
  color: #ffffff;
  box-shadow: none;
  transform: none;
}

.nav-item.active:hover {
  background: var(--primary-hover);
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, .28);
  transform: scale(.97);
}

@media (prefers-color-scheme: dark) {
  /* 深色下黑色内阴影看不清 —— 用更暗底色 + 亮色内高光边勾勒凹陷 */
  .nav-item:hover {
    background: rgba(0, 0, 0, .32);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, .5), inset 0 0 0 1px rgba(255, 255, 255, .05);
  }
  .nav-item:active {
    background: rgba(0, 0, 0, .45);
    box-shadow: inset 0 2px 7px rgba(0, 0, 0, .6);
  }
  .nav-item.active:hover {
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, .45);
  }
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

.nav-text {
  font-weight: 500;
}

.content {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 10px;
}
</style>
