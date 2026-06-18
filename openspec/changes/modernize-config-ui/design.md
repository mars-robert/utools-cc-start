## Context

当前 `UnifiedConfig` 采用顶部标签页 + 纵向堆叠布局，`LauncherConfig` 使用 `<select>` 下拉框选择启动命令与终端。用户反馈三点问题：(1) 下拉隐藏选项，不直观；(2) 预设终端路径不可见，启动失败时用户无从排查；(3) UI 设计过时（细框线、紧凑间距）。

存储模型（`ccstart.settings` v2）当前仅支持自定义终端的 `path`，预设终端（`bt-powershell` 等）的路径由 `resolveTerminal()` 运行时探测，无法持久化用户覆盖。

## Goals / Non-Goals

**Goals:**
- 左右分栏布局，左侧导航固定宽度（~180px），右侧内容可滚动
- 启动命令与终端改为 radio 单选列表，移除 `<select>`
- 预设终端支持路径编辑：探测路径作为默认值，用户可修改并保存覆盖
- 卡片式风格：圆角 8-12px、阴影 `box-shadow: 0 1px 3px rgba(0,0,0,0.1)`、16-20px 内边距、12-14px 字号

**Non-Goals:**
- 不改变业务逻辑（启动、命令执行）
- 不引入新的第三方 UI 库（保持 Vue 3 原生）
- 不改变存储 key（`ccstart.settings` 继续使用，仅扩展结构）

## Decisions

### 决策 1：左右分栏用 flexbox 实现

`UnifiedConfig` 改为 `display: flex; flex-direction: row;`：
- 左侧 `.sidebar`：`flex: 0 0 180px; overflow: hidden;` 固定宽度，纵向排列导航项（图标 + 文字）
- 右侧 `.content`：`flex: 1 1 auto; overflow-y: auto;` 填充剩余空间，内容超出时滚动

导航项用 `<button>` 实现，`:class="{ active: activeTab === 'launch' }"` 控制高亮。

**备选**：CSS Grid —— 被否决，flexbox 更直观且浏览器兼容性好。

### 决策 2：启动命令与终端用 radio + label 替换 select

`LauncherConfig` 模板改为：
```vue
<div v-for="c in launchCommands" :key="c.id" class="radio-item">
  <input type="radio" :id="'lc-'+c.id" :value="c.id" v-model="selectedLaunchId" @change="onSelectLaunch" />
  <label :for="'lc-'+c.id">{{ c.label }}</label>
</div>
```

样式：隐藏原生 radio，用伪元素绘制圆形单选框（未选中：空心圆，选中：实心圆 + 蓝色）。

**备选**：保留 select 仅改样式 —— 被否决，无法满足"一目了然"诉求。

### 决策 3：预设终端路径可编辑 —— 存储扩展 + UI 输入框

存储模型扩展：`ccstart.settings` 的 `customTerminals` 允许覆盖内置 id 的路径。新增 `terminalPathOverrides: { [builtinId]: string }`，如 `{ 'bt-powershell': 'C:\\custom\\path\\powershell.exe' }`。

读取逻辑：`getTerminalList()` 合并时，若 `terminalPathOverrides[bt.id]` 存在，覆盖 `resolveTerminal(bt)` 的默认路径。

UI：每个终端项旁显示 `<input v-model="terminalPaths[t.id]" />`，输入框默认值为探测路径或用户覆盖路径。「保存」按钮更新 `terminalPathOverrides`；「恢复默认」按钮删除覆盖。

**备选**：让预设项也可以像自定义项一样 `type: 'custom'` —— 被否决，会破坏"预设不可删除"语义。

### 决策 4：卡片式风格用 CSS 变量统一

定义全局 CSS 变量：
```css
:root {
  --card-bg: #fff;
  --card-radius: 10px;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.1);
  --card-padding: 18px;
  --text-primary: #333;
  --text-secondary: #666;
  --border-color: #e0e0e0;
  --primary-color: #4f8cff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --card-bg: #2a2a2a;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
    --text-primary: #e0e0e0;
    --text-secondary: #aaa;
    --border-color: #3a3a3a;
  }
}
```

`.card` 类：`background: var(--card-bg); border-radius: var(--card-radius); box-shadow: var(--card-shadow); padding: var(--card-padding);`

**备选**：内联样式 —— 被否决，不利于主题切换与复用。

## Risks / Trade-offs

- [左侧导航固定宽度在窄屏（<600px）下挤压内容] → 在窄屏时左侧收窄或改为顶部 tab（media query）
- [预设路径编辑增加配置复杂度] → 提供「恢复默认」按钮简化；输入框右侧显示「系统默认」提示
- [radio 列表占用更多垂直空间] → 内容区可滚动，折叠暂不需要的分组（如已选中的不再展开全部选项）
- [卡片阴影在某些暗色主题下可能过重] → 暗色模式下减轻阴影透明度（`rgba(0,0,0,0.3)` → `0.2`）

## Migration Plan

1. 升级 `services.js`：新增 `terminalPathOverrides` 读写方法 + `getTerminalList()` 合并覆盖路径
2. 改造 `UnifiedConfig`：flex 左右布局 + 左侧导航（图标 + 文字按钮）
3. 改造 `LauncherConfig`：radio 列表 + 终端路径输入框 + 保存/恢复按钮
4. 新增 `src/styles/variables.css`：卡片变量；在 `main.ts` / `App.vue` 引入
5. 更新组件样式：`.card`、`.radio-item`、`.sidebar` 等类应用变量
6. 回滚策略：保留旧代码为 `LauncherConfig.legacy.vue`，若有问题可快速切回

## Open Questions

- 左侧导航是否需要 tooltip（hover 显示完整名称）？当前图标 + 文字已足够，暂不需要。
- 是否对启动命令也显示「命令文本」输入框？建议仅在管理弹窗中编辑，列表中仅展示 label，避免视觉混乱。
