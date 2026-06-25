## 1. 依赖与脚手架

- [x] 1.1 在 `package.json` 添加运行时依赖 `marked` 并安装
- [x] 1.2 新建组件目录与空壳 `src/ProjectHistory/index.vue`(props: `project`,emit: `back`)

## 2. 预加载层:会话与记忆只读接口(`public/preload/services.js`)

- [x] 2.1 抽出可复用的 `dirName`/`sessionId`/`fileName` 路径越界校验(参考 `deleteClaudeProject`),禁止 `/`、`\`、`..` 且解析后须位于目标目录内
- [x] 2.2 实现 `listProjectSessions(dirName)`:返回 `[{ sessionId, title, mtime, gitBranch? }]`;标题取尾部扫描得到的最后一条 `ai-title.aiTitle`,带回退链(首条真实 user 文本 → 会话+时间);按 `mtime` 降序
- [x] 2.3 实现 `listProjectMemories(dirName)`:解析 `memory/*.md` frontmatter,返回 `[{ name, description, type, originSessionId, fileName }]`;无 `memory/` 目录时返回空数组
- [x] 2.4 实现 `readMemory(dirName, fileName)`:返回 `{ frontmatter, body }`
- [x] 2.5 实现会话解析器 `parseSession(content)`:逐行解析,产出有序消息块数组(用户/助手 text/thinking/tool_use/tool_result/system),按 `tool_use_id` 配对工具调用与结果,标记 `isSidechain`,跳过元数据与不可解析行
- [x] 2.6 实现 `readSession(dirName, sessionId)`:读取文件并调用 `parseSession`,返回结构化结果
- [x] 2.7 实现会话→Markdown 格式化器 `sessionToMarkdown(parsed)`(供导出复用 2.5 的解析结果)
- [x] 2.8 实现 `exportSession(dirName, sessionId)`:返回 Markdown 字符串
- [x] 2.9 实现 `resumeSession(cwd, sessionId)`:复用 `getLauncherSettings()` 与 `launchProject(cwd, 'claude --resume ' + sessionId, opts)`,返回 `{ success, error }`
- [x] 2.10 在 `window.services` 导出以上新接口

## 3. 项目列表:历史入口与视图切换(`src/ProjectLauncher/index.vue`)

- [x] 3.1 增加状态 `view: 'list' | 'history'` 与 `selectedProject`
- [x] 3.2 在每个项目行右侧加时间图标按钮,点击 `@click.stop` 设置 `selectedProject` 并切到 history(不触发启动)
- [x] 3.3 `view==='history'` 时渲染 `<ProjectHistory :project @back>`;`back` 事件切回 list
- [x] 3.4 管理 uTools 搜索框生命周期:切到 history 时重设占位符为"搜索记忆或会话…"并把输入转给历史页;返回 list 时恢复项目搜索(卸载时 `removeSubInput` 已在原 `onUnmounted` 处理)
- [x] 3.5 `Esc` 在 history 视图返回 list

## 4. 历史页面:左右布局与左栏(`src/ProjectHistory/index.vue`)

- [x] 4.1 master-detail 布局:左栏固定窄宽(~240–280px)+ 右栏自适应,适配 ~800px 窗口
- [x] 4.2 挂载时调用 `listProjectMemories` 与 `listProjectSessions` 填充左栏,分"记忆 / 历史会话"两组
- [x] 4.3 左栏条目展示:记忆(描述/名称 + 类型标签)、会话(标题 + 时间);空分组不展示
- [x] 4.4 接收来自搜索框的过滤文本,按标题/描述过滤左栏
- [x] 4.5 选中态管理:点击左栏条目设为当前选中,驱动右栏渲染;返回按钮 emit `back`

## 5. 历史页面:右栏渲染

- [x] 5.1 选中记忆:`readMemory` 后用 `marked` 渲染正文(渲染前转义/最小净化),展示类型标签;有 `originSessionId` 且会话存在时提供跳转入口
- [x] 5.2 选中会话:`readSession` 懒加载后按类型分样式渲染——用户气泡 / 助手正文(marked)/ `tool_use` 代码卡片 / `tool_result` 输出卡片 / `system` 提示
- [x] 5.3 `thinking` 与大体量 `tool_result` 默认折叠,可展开
- [x] 5.4 工具调用与结果按 `tool_use_id` 配对呈现;`isSidechain` 以"子任务"标记
- [x] 5.5 未选中任何条目时显示空状态

## 6. 历史页面:恢复与导出

- [x] 6.1 会话右栏 header 提供"恢复会话":调用 `resumeSession`,成功后 `outPlugin()`,失败展示错误
- [x] 6.2 提供"复制导出":`exportSession` 取 Markdown 后 `utools.copyText`
- [x] 6.3 提供"另存导出":`utools.showSaveDialog` 选路径后写入 Markdown 文件;失败展示错误

## 7. 测试与验证

- [x] 7.1 为 `parseSession` 写单元测试(`test/`,Node `--test`):覆盖 text/thinking/tool_use/tool_result 配对、元数据跳过、不可解析行容错、空壳会话
- [x] 7.2 为标题解析(`ai-title` 优先 + 回退链)与 `listProjectMemories` frontmatter 解析写单元测试
- [x] 7.3 为 `sessionToMarkdown` 写单元测试(各类型出现在输出中)
- [x] 7.4 路径越界校验测试:非法 `dirName`/`sessionId` 被拒
- [ ] 7.5 `npm run build` 通过(✓);在 uTools 中手动验证:🕐 进入历史 → 左栏双组 → 右栏分样式渲染 → 恢复 → 复制/另存 → 返回列表搜索恢复正常（待用户验收）
