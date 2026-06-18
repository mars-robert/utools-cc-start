<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import ProjectLauncher from './ProjectLauncher/index.vue'
import UnifiedConfig from './UnifiedConfig/index.vue'
import CommandList from './CommandList/index.vue'

const route = ref('')
const enterAction = ref({})

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
  <template v-if="route === 'ccstart'">
    <ProjectLauncher :enterAction="enterAction"></ProjectLauncher>
  </template>
  <template v-if="route === 'ccstartconf'">
    <UnifiedConfig :enterAction="enterAction"></UnifiedConfig>
  </template>
  <template v-if="route === 'ccrun'">
    <CommandList :enterAction="enterAction"></CommandList>
  </template>
</template>
