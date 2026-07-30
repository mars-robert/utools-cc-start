<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import ProjectLauncher from './ProjectLauncher/index.vue'
import UnifiedConfig from './UnifiedConfig/index.vue'
import CommandList from './CommandList/index.vue'
import PluginCenter from './PluginCenter/index.vue'
import { initTheme } from './theme'

const route = ref('')
const enterAction = ref({})

// 渲染任何页面前应用持久化主色，避免默认色闪烁
initTheme()

onMounted(() => {
  window.utools.onPluginEnter((action) => {
    route.value = action.code
    enterAction.value = action
  })
  window.utools.onPluginOut((isKill) => {
    route.value = ''
  })
})
</script>

<template>
  <template v-if="route === 'ccstart' || route === 'cxstart'">
    <ProjectLauncher :enterAction="enterAction"></ProjectLauncher>
  </template>
  <template v-if="route === 'ccstartconf'">
    <UnifiedConfig :enterAction="enterAction"></UnifiedConfig>
  </template>
  <template v-if="route === 'ccrun'">
    <CommandList :enterAction="enterAction"></CommandList>
  </template>
  <template v-if="route === 'ccplugin'">
    <PluginCenter :enterAction="enterAction"></PluginCenter>
  </template>
</template>
