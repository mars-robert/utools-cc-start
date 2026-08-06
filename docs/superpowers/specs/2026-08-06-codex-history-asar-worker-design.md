# Codex History ASAR Worker Fix Design

## Problem

The installed uTools plugin runs `preload/services.js` from an Electron ASAR archive. The preload builds an external Node script containing an absolute path such as:

```text
C:\Users\...\plugins\<plugin-id>.asar\preload\codex-history-worker.cjs
```

The system Node process does not implement Electron's ASAR virtual filesystem, so `require(workerPath)` fails with `MODULE_NOT_FOUND`. The worker is present in both `public/preload` and `dist/preload`; this is a runtime boundary problem, not a missing build artifact.

## Selected Approach

Keep `codex-history-worker.cjs` as the standalone, directly tested worker. The ASAR-aware preload reads its source text, then passes that trusted source to the external Node process over stdin. A small bootstrap script evaluates the source as a CommonJS module and invokes `worker.run(mode, input)`.

This avoids filesystem extraction, cache invalidation, cleanup, and Windows permission concerns. It also avoids putting the 10 KB worker source on the Windows command line or duplicating the worker implementation inside `services.js`.

## Components

### Async Child Runner

Extend `runNodeJson(script, options)` with an optional `stdin` string. When present, spawn Node with piped stdin and end the stream with the supplied UTF-8 source. Existing callers that do not pass stdin retain ignored stdin and unchanged behavior.

The runner keeps the current timeout, combined output limit, non-zero exit handling, malformed JSON handling, and process cleanup behavior.

### Codex History Service

Replace the child-side `require(asarWorkerPath)` bootstrap with these preload-side steps:

1. Resolve the worker path relative to `__dirname`.
2. Read the worker source through Electron's ASAR-aware `fs` implementation.
3. Build a fixed bootstrap script containing only JSON-encoded mode and input data.
4. Call `runNodeJson` with the bootstrap script and worker source on stdin.

The worker remains self-contained and uses only Node built-ins. History and active-session result formats do not change.

## Error Handling

If preload cannot read the packaged worker, the existing async history request rejects with that filesystem error. If the child cannot evaluate or run the worker, stderr and the non-zero exit code flow through the existing `runNodeJson` error. No synchronous fallback is added, so the progressive-loading UI remains non-blocking.

## Security

Only source shipped inside the plugin ASAR is evaluated. User-controlled values such as `cwd` remain JSON encoded in the bootstrap script and are never concatenated as executable code. The source travels through stdin, not shell parsing or command-line interpolation.

## Testing

Add regression coverage before implementation:

- `runNodeJson` pipes optional stdin without changing the existing no-stdin spawn contract.
- The Codex async preload APIs read the worker source and send it through stdin rather than generating a child-side ASAR `require()`.
- Paths and `cwd` values containing quotes cannot inject code.
- Existing worker unit tests continue to cover history filtering, SQLite fallback, and active-session calculation.

Verification will run the focused child-runner and Codex history tests, the full Node test suite, and the Vite production build. A real external Node smoke test will execute worker source through stdin to prove it does not depend on direct ASAR access.
