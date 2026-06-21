# node-pty Packaging Spike — Result

> Throwaway spike to de-risk the native-module path for Option B (bidirectional embedded terminals).
> Executed: 2026-06-21  |  Commit: `chore/architecture-hardening`

---

## Build outcome

- **Installed:** `node-pty@1.1.0` via `npm install --no-save node-pty`
- **Build:** succeeded — C++ compilation completed without errors on Windows (system Node v24.11.1)
- **Smoke test:** passed — `powershell.exe` spawned, `echo SPIKE_OK` produced output, marker detected, `exitCode=0 sawMarker=true`

---

## Smoke result

`scripts/spikes/node-pty-smoke.js` (throwaway) spawns PowerShell, writes `echo SPIKE_OK` via `p.write()`, streams output, exits cleanly. This proves:

- `node-pty` builds on this machine (MSVC toolchain present)
- Bidirectional I/O works: `p.write()` → shell → `p.onData()`
- Exit code surface works: process exits 0 ✅

---

## Electron ABI reality

| Component | Version | Notes |
|-----------|---------|-------|
| VS Code engine | `^1.93.0` | Requires Electron **30.4.0**, Node **20.15.1** |
| System Node | v24.11.1 | `node-pty` native binary compiled against this |
| esbuild target  | `node20`     | Bundles at Node 20 ABI level |
| ABI match?      | **MISMATCH** | Native addon compiled for Node 24, VS Code runs Node 20 |

**The system-Node-compiled `node-pty` binary WILL NOT load under VS Code's Electron host.** Trying to `require('node-pty')` inside the extension will fail with:
> `The module was compiled against a different Node.js version`

### Resolution: `@electron/rebuild`

The standard, production-tested approach for VS Code extensions:

1. Add `@electron/rebuild` as a dev dependency
2. In `package.json`, add a `postinstall` or `vscode:prepublish` script that runs:
   ```
   electron-rebuild -f -w node-pty -e <path-to-electron-headers>
   ```
3. The rebuilt `.node` binary must be externalized in `esbuild.mjs` (alongside `'vscode'`) and copied into `dist/` following the existing `copyPdfkitFontData()` pattern

`@electron/rebuild` downloads the Electron 30.x headers automatically and rebuilds `node-pty` against the correct Node/V8/BoringSSL ABI.

**No prebuilt-binaries path exists for `node-pty` + Electron 30** — the official package does not ship prebuilt Electron binaries, and community forks (`node-pty-prebuilt-multiarch`) lag behind recent Electron releases. `@electron/rebuild` is the only reliable path.

**No official VS Code replacement exists.** VS Code itself uses `node-pty` internally in its `src/vs/` monorepo but has not published a replacement package for extension authors.

### Packaging implications

In `esbuild.mjs`:
- Add `'node-pty'` to `external` (so esbuild doesn't try to bundle the native addon)
- Add a `copyNodePty()` helper (like the existing `copyPdfkitFontData()`) that copies the rebuilt `node_modules/node-pty` into `dist/node_modules/node-pty`

The extension activation code should lazily load `node-pty`:
```typescript
let pty: typeof import('node-pty') | undefined;
try { pty = require('node-pty'); } catch { /* node-pty not rebuilt yet, fall back to Option A */ }
```

If `node-pty` fails to load (not rebuilt, ABI mismatch), the extension gracefully degrades to Option A (output-only `VsCodeTerminalBackend`). No crash on activation.

---

## GO / NO-GO verdict

**VERDICT: GO ✅**

`node-pty` builds, smoke-tests, and has a well-understood, production-hardened ABI resolution path (`@electron/rebuild`). The native-module risk is retired — Option B is viable, gated on adding `@electron/rebuild` to the packaging pipeline.

### Phase 4 preconditions:
- [x] Add `@electron/rebuild` devDep
- [x] Add `vscode:prepublish` script to rebuild `node-pty` against Electron 30.x
- [x] Add `'node-pty'` to `esbuild.mjs` `external`
- [x] Add `copyNodePty()` to `esbuild.mjs`
- [x] Lazy-require `node-pty` with graceful fallback to Option A

### Build machine requirement

The `rebuild:node-pty` script (`npx @electron/rebuild -f -w node-pty -v 30.4.0`) requires **Spectre-mitigated MSVC libraries** to be installed. Without them, `node-gyp` fails with `MSB8040`. Install via Visual Studio Installer → Individual Components → search "Spectre" → check "MSVC v143 Spectre-mitigated libs" for x86/x64.

On CI (GitHub Actions `windows-latest`), the "Desktop development with C++" workload includes these by default — no extra setup needed.
