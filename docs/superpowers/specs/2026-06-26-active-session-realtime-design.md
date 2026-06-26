# 设计:仅对「当前真正打开的 session」实时刷新

日期:2026-06-26
状态:已确认,待落实现计划

## 1. 背景与问题

历史页(`src/ProjectHistory/index.vue`)的实时刷新当前是**无条件**的:点开任意一个历史会话 → `selectSession` 读取一次 → `startPoll()` 启动 800ms 轮询(`refreshSession`),并自动贴底跟随。

缺陷:只有「Claude 此刻正在终端里写入的那个 session」才值得实时刷新。点开一个早已结束的旧会话也去轮询、也显示「回到底部 / N 条新提问」跟随 UI,既无意义,又让人误以为「我看的这个 = Claude 现在开着的那个」,而二者可能并不对应。

目标:**先精确识别「Claude 当前真正打开的是哪个 session」,只对该 session 显示实时效果,其余按静态历史展示。**

## 2. 目标 / 非目标

目标:
- 精确检测当前项目下「正在运行的 claude 进程打开的 session id 集合」(即使会话空闲也成立)。
- 实时刷新(轮询 + 贴底跟随 + 新消息提示)只对活跃 session 生效。
- 列表标记活跃 session;打开非活跃会话提供手动「重新加载」。

非目标:
- 不改造 Claude 启动方式、不建立与 claude 进程的 IPC。
- 不处理 PID 复用这一极小概率误判(列入已知限制)。
- 不改动会话解析、记忆、导出等既有逻辑。

## 3. 检测机制(关键发现)

每个正在运行的 claude 实例在 `~/.claude/sessions/<pid>.json` 写入自身状态,实测内容:

```json
{"pid":4448,"sessionId":"3be5d715-...","cwd":"D:\\code\\utools\\claudecode\\claude",
 "startedAt":1782473934570,"version":"2.1.193","kind":"interactive",
 "entrypoint":"cli","status":"busy","updatedAt":1782477976932,"statusUpdatedAt":1782477976932}
```

- `pid` 经核实为存活的 `claude` 进程;
- `sessionId` 即该实例当前打开的会话;
- `cwd` 为权威真实路径,可与历史页的 `props.project.cwd`(解码后路径)归一化匹配;
- 文件随进程存活而存在,**与 jsonl 是否在写无关** → 空闲也能判定。

这优于「mtime 新鲜度」启发式:后者无法区分「开着但空闲」与「已关闭」。

## 4. 接口设计:`listActiveSessions(cwd)`

位置:`public/preload/services.js` 只读接口区,并加入 `window.services` 导出。

逻辑:
1. `fs.readdirSync(path.join(~/.claude, 'sessions'))`,取 `*.json`;
2. 逐个 `JSON.parse`,容错跳过坏文件;
3. 过滤 `kind === 'interactive'`;
4. 进程存活校验:`process.kill(pid, 0)` —— 不抛=活;`ESRCH`=死(剔除);`EPERM`=活(保留);
5. 传入 `cwd` 时按归一化路径匹配(win32:转小写 + `/`→`\` + 去尾分隔符;posix:去尾 `/`);未传则返回全部;
6. 返回 `[{ sessionId, status, pid }]`。

`~/.claude` 根目录沿用现有取法(与 `getProjectsDir()` 同源)。纯只读,无副作用。

## 5. 历史页改造(`src/ProjectHistory/index.vue`)

状态:
- `activeIds = ref<Set<string>>()` —— 当前项目的活跃 session id 集合。
- `currentLive = ref(false)` —— 当前打开的会话是否活跃。
- `liveTimer` —— 组件挂载期间运行的 liveness 定时器(约 2500ms)。

流程:
- `load()`:列出会话后调用 `refreshActive()` 拉一次活跃集,给 `sessions[]` 标注 `live`。
- `refreshActive()`:`listActiveSessions(props.project.cwd)` → 重建 `activeIds`;若「当前打开会话」的存活态发生翻转,则相应 `startPoll`/`stopPoll` 并切换静态/实时 UI。
- liveness 定时器在 `onMounted` 启动、`onUnmounted` 清理,既驱动列表标记,也驱动开着会话的实时开关。
- `selectSession`:读完详情后 `currentLive = activeIds.has(id)`;`startPoll` 仅在 `currentLive` 时启动 800ms 内容轮询。
- 跟随 UI(贴底跟随 / 「回到底部」/ 「N 条新提问」)**仅 `currentLive` 时渲染**。
- 非活跃会话:顶部「重新加载」按钮 → 手动 `readSession` 拉最新一次;不轮询、不跟随。
- 列表:活跃 session 显示「● 进行中」绿色标记。

`autoRefresh` 暂停开关保留,仅对 live 会话有意义。

## 6. 边界与已知限制

- **多终端**:同项目多个 claude 进程 → 多个活跃 id,集合天然支持,各自打标。
- **崩溃残留**:`<pid>.json` 未被清理时,靠 `process.kill(pid,0)` 剔除死 pid。
- **PID 复用**(已知小瑕疵,v1 不处理):死掉的 claude 其 pid 被别的程序复用会被误判存活。窗口极小且自愈(claude 下次运行会重写该文件),暂不加 `procStart`/进程名二次校验以保持简洁。

## 7. 改动范围

仅 2 个文件:
- `public/preload/services.js`:新增 `listActiveSessions` + 导出。
- `src/ProjectHistory/index.vue`:gate 轮询、加活跃标记、加手动刷新、按 live 显隐跟随 UI、加 liveness 定时器。

不触碰其他模块。

## 8. 验证标准

- 终端里开着某 session 时,历史页列表对应项显示「进行中」,点开后实时刷新跟随生效。
- 点开同项目其他旧会话:无「进行中」标记,无轮询,无跟随 UI,有「重新加载」按钮。
- 关闭终端里的 claude 后,约一个 liveness 周期内「进行中」标记消失;若当时正开着它,自动切为静态并露出手动刷新。
- `process.kill` 校验能剔除残留的死 pid 文件。
- 现有会话解析 / 记忆 / 导出功能无回归。
