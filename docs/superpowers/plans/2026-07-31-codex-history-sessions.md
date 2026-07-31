# Codex History Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex history sessions grouped by real `threads.cwd` data while keeping Claude Code history unchanged.

**Architecture:** Keep Claude and Codex storage paths separate. Add Codex-specific preload service APIs that resolve sessions from `~/.codex/state_5.sqlite` `threads` rows and parse Codex JSONL into the existing ProjectHistory block model. Reuse the existing history UI with `project.source === 'codex'` switches for Codex-only behavior.

**Tech Stack:** uTools preload JavaScript, Vue 3 SFC, Node built-in test runner, optional `node:sqlite` when available.

---

### Task 1: Codex History Service

**Files:**
- Modify: `public/preload/services.js`
- Test: `test/services-codex-history.test.cjs`

- [ ] **Step 1: Write failing tests**

Create tests for:
- `listCodexProjectSessions(cwd)` reads `threads` rows from Codex sqlite, filters by normalized `cwd`, sorts by `recency_at_ms`, and returns session ids/titles.
- `readCodexSession(cwd, sessionId)` rejects sessions whose `cwd` does not match the selected project.
- `resumeCodexSession(cwd, sessionId)` launches `codex resume <id>`.

Run: `node --test test/services-codex-history.test.cjs`
Expected: FAIL because the service functions do not exist.

- [ ] **Step 2: Implement minimal service**

Add helpers to:
- Read `id`, `cwd`, `title`, `recency_at_ms`, and update fields from `threads`.
- Find Codex JSONL files recursively by session id.
- Parse Codex records into existing block kinds: `user`, `assistant`, `thinking`, `tool_use`, `tool_result`, and `system`.
- Export new APIs on `window.services`.

- [ ] **Step 3: Verify service tests**

Run: `node --test test/services-codex-history.test.cjs`
Expected: PASS.

### Task 2: ProjectHistory Codex Mode

**Files:**
- Modify: `src/ProjectHistory/index.vue`

- [ ] **Step 1: Route data by project source**

Use `isCodexHistory = computed(() => props.project?.source === 'codex')`.
For Codex:
- Load no memories.
- Load sessions through `window.services.listCodexProjectSessions(props.project.cwd)`.
- Read details through `window.services.readCodexSession(props.project.cwd, sessionId)`.
- Disable active Claude session polling and subagent loading.
- Resume through `window.services.resumeCodexSession`.
- Open terminal with Codex launch command.

- [ ] **Step 2: Keep Claude behavior unchanged**

Leave existing Claude calls active when `project.source !== 'codex'`.

### Task 3: Launcher History Entry

**Files:**
- Modify: `src/ProjectLauncher/index.vue`

- [ ] **Step 1: Enable history for Codex projects**

Change `canOpenHistory` so both Claude and Codex real projects show the history button.

- [ ] **Step 2: Keep temp project behavior**

Keep history hidden for `p.isTemp`.

### Task 4: Verification

**Files:**
- Existing tests.

- [ ] **Step 1: Run targeted tests**

Run:
`node --test test/services-codex-history.test.cjs test/services-codex-projects.test.cjs test/services-history.test.cjs test/services-launch.test.cjs`
Expected: PASS.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.
