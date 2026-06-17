<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import Hello from './Hello/index.vue'
import Read from './Read/index.vue'
import Write from './Write/index.vue'
import ProjectLauncher from './ProjectLauncher/index.vue'
import LauncherConfig from './LauncherConfig/index.vue'

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
  <template v-if="route === 'hello'">
    <Hello :enterAction="enterAction"></Hello>
  </template>
  <template v-if="route === 'read'">
    <Read :enterAction="enterAction"></Read>
  </template>
  <template v-if="route === 'write'">
    <Write :enterAction="enterAction"></Write>
  </template>
  <template v-if="route === 'ccstart'">
    <ProjectLauncher :enterAction="enterAction"></ProjectLauncher>
  </template>
  <template v-if="route === 'ccstartconf'">
    <LauncherConfig :enterAction="enterAction"></LauncherConfig>
  </template>
</template>
