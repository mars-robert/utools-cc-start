<script lang="ts" setup>
import { computed } from 'vue'
import { fieldMetaFor, isEditablePath, isMaskedPath, isMapPath } from './schema.js'

const props = defineProps<{
  path: string
  segments: string[]
  keyName: string
  value: any
  // 父级提供的 setter：按 segments 路径写回到 draft（dot-safe）
  onChange: (segments: string[], next: any) => void
}>()

const MASK = '••••••（已隐藏）'

function isObject (v: any) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

const meta = computed(() => fieldMetaFor(props.keyName))
const editable = computed(() => isEditablePath(props.path))
const masked = computed(() => isMaskedPath(props.path))
// 冒号分隔的层级标题
const titlePath = computed(() => props.path.split('.').join(' : '))

const kind = computed(() => {
  if (masked.value) return 'masked'
  if (Array.isArray(props.value)) return 'array'
  if (isObject(props.value)) return isMapPath(props.path) ? 'map' : 'object'
  if (typeof props.value === 'boolean') return 'boolean'
  if (typeof props.value === 'number') return 'number'
  return 'string'
})

function previewJson (v: any): string {
  try { return JSON.stringify(v) } catch { return String(v) }
}
const preview = computed(() => `"${props.keyName}": ${masked.value ? `"${MASK}"` : previewJson(props.value)}`)

// 标量编辑
function setScalar (next: any) {
  props.onChange(props.segments, next)
}

// 数组编辑
function setArrayItem (i: number, next: any) {
  const arr = [...props.value]; arr[i] = next; props.onChange(props.segments, arr)
}
function addArrayItem () {
  const arr = [...props.value, '']; props.onChange(props.segments, arr)
}
function removeArrayItem (i: number) {
  const arr = props.value.filter((_: any, idx: number) => idx !== i); props.onChange(props.segments, arr)
}

// 映射（env / mcpServers）键值编辑
function childChange (segments: string[], next: any) {
  props.onChange(segments, next)
}
function addMapEntry () {
  const obj = { ...props.value }
  let name = 'newKey'; let n = 1
  while (Object.prototype.hasOwnProperty.call(obj, name)) { name = `newKey${n++}` }
  // env 默认空串，mcpServers 默认服务模板，其它默认空串
  const isServers = props.keyName === 'mcpServers'
  obj[name] = isServers ? { type: 'stdio', command: '', args: [], env: {} } : ''
  props.onChange(props.segments, obj)
}
function removeMapEntry (k: string) {
  const obj = { ...props.value }; delete obj[k]; props.onChange(props.segments, obj)
}

const childEntries = computed(() => {
  if (!isObject(props.value)) return []
  return Object.entries(props.value).map(([k, v]) => ({
    key: k,
    path: `${props.path}.${k}`,
    segments: [...props.segments, k],
    value: v
  }))
})
</script>

<template>
  <div class="cfg-field" :class="{ 'is-readonly': !editable && kind !== 'object' && kind !== 'map' }">
    <div class="cfg-head">
      <span class="cfg-title">{{ titlePath }}</span>
      <span v-if="!editable && kind !== 'object' && kind !== 'map'" class="cfg-ro-tag">只读</span>
    </div>
    <p v-if="meta.description" class="cfg-desc">{{ meta.description }}</p>

    <!-- 标量：boolean / number / string -->
    <template v-if="kind === 'boolean'">
      <label class="cfg-control">
        <input type="checkbox" :checked="value" :disabled="!editable"
          @change="setScalar(($event.target as HTMLInputElement).checked)" />
        <span class="cfg-bool-label">{{ value ? '开启' : '关闭' }}</span>
      </label>
    </template>
    <template v-else-if="kind === 'number'">
      <input class="cfg-input" type="number" :value="value" :disabled="!editable"
        @input="setScalar(Number(($event.target as HTMLInputElement).value))" />
    </template>
    <template v-else-if="kind === 'string'">
      <input class="cfg-input" type="text" :value="value" :disabled="!editable"
        @input="setScalar(($event.target as HTMLInputElement).value)" />
    </template>

    <!-- 数组：可编辑则支持增删，只读则列出 -->
    <template v-else-if="kind === 'array'">
      <div class="cfg-list">
        <div v-for="(item, i) in value" :key="i" class="cfg-list-row">
          <input v-if="typeof item !== 'object'" class="cfg-input" type="text" :value="item" :disabled="!editable"
            @input="setArrayItem(i, ($event.target as HTMLInputElement).value)" />
          <code v-else class="cfg-json">{{ previewJson(item) }}</code>
          <button v-if="editable" class="btn btn-danger cfg-mini" @click="removeArrayItem(i)">删除</button>
        </div>
        <button v-if="editable" class="btn cfg-mini" @click="addArrayItem">+ 添加</button>
        <div v-if="!value.length && !editable" class="cfg-empty">（空）</div>
      </div>
    </template>

    <!-- 脱敏 -->
    <template v-else-if="kind === 'masked'">
      <div class="cfg-masked">{{ MASK }}</div>
    </template>

    <!-- 对象 / 映射：递归 -->
    <template v-else>
      <div class="cfg-children">
        <ConfigField v-for="c in childEntries" :key="c.path"
          :path="c.path" :segments="c.segments" :key-name="c.key" :value="c.value" :on-change="childChange" />
        <div class="cfg-map-actions" v-if="editable && kind === 'map'">
          <button class="btn cfg-mini" @click="addMapEntry">+ 新增条目</button>
        </div>
        <div class="cfg-map-actions" v-if="editable && kind === 'map'">
          <button v-for="c in childEntries" :key="'del-'+c.path" class="btn btn-danger cfg-mini"
            @click="removeMapEntry(c.key)">删除 {{ c.key }}</button>
        </div>
      </div>
    </template>

    <code class="cfg-preview">{{ preview }}</code>
  </div>
</template>

<style scoped>
.cfg-field {
  padding: var(--spacing-md) 0;
  border-top: 1px solid var(--border-color);
}
.cfg-children {
  margin-left: var(--spacing-md);
  padding-left: var(--spacing-md);
  border-left: 2px solid var(--border-color);
}
.cfg-head { display: flex; align-items: center; gap: var(--spacing-sm); }
.cfg-title {
  font-family: monospace;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  font-weight: 600;
  word-break: break-all;
}
.cfg-ro-tag {
  padding: 0 6px; border-radius: 4px; background: var(--bg-hover);
  color: var(--text-tertiary); font-size: 11px; line-height: 1.7;
}
.cfg-desc {
  margin: 2px 0 var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  line-height: 1.5;
}
.cfg-control { display: inline-flex; align-items: center; gap: var(--spacing-sm); cursor: pointer; }
.cfg-bool-label { font-size: var(--font-size-sm); color: var(--text-secondary); }
.cfg-input {
  width: 100%; max-width: 420px; padding: 6px 10px;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--card-bg); color: var(--text-primary); font-size: var(--font-size-base);
}
.cfg-input:disabled { background: var(--bg-hover); color: var(--text-secondary); cursor: not-allowed; }
.cfg-list { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.cfg-list-row { display: flex; align-items: center; gap: var(--spacing-sm); }
.cfg-mini { padding: 2px 10px; width: fit-content; }
.cfg-json {
  flex: 1; padding: 2px 8px; border-radius: 4px; background: var(--bg-hover);
  font-family: monospace; font-size: var(--font-size-sm); color: var(--text-secondary);
  word-break: break-all;
}
.cfg-empty { color: var(--text-tertiary); font-size: var(--font-size-sm); }
.cfg-masked {
  padding: 6px 10px; border-radius: 6px; background: var(--bg-hover);
  color: var(--text-tertiary); font-size: var(--font-size-base); width: fit-content;
}
.cfg-map-actions { display: flex; flex-wrap: wrap; gap: var(--spacing-sm); margin-top: var(--spacing-sm); }
.cfg-preview {
  display: block; width: fit-content; max-width: 100%;
  margin-top: var(--spacing-sm); padding: 2px 8px; border-radius: 4px;
  background: var(--bg-hover); color: var(--text-secondary);
  font-family: monospace; font-size: var(--font-size-sm); word-break: break-all;
}
</style>
