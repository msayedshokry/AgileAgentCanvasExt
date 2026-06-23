'use strict';
/**
 * scripts/prepublish-guard.js
 *
 * OS-aware guard for `vscode:prepublish`. On Linux hosts we force a
 * `rebuild:node-pty` so the linux-x64 prebuild (pty.node) is regenerated
 * against the hardcoded Electron ABI that the script also bakes into its
 * expectation — currently Electron `30.4.0`, which ships with VS Code
 * `1.93.x`. On Windows / macOS the rebuild is skipped because the MSBuild
 * / Xcode chain there frequently errors on missing Spectre-mitigated libs
 * / SDKs and the shipped node-pty prebuilds already cover those host
 * arches.
 *
 * Hardcoded ABI — the script intentionally does NOT derive the Electron
 * version from `engines.vscode` via a mapping table. The shipped binary at
 * `node_modules/node-pty/prebuilds/linux-x64/pty.node` was built against a
 * specific Electron version, and any silent drift between the Electron
 * flag in `scripts.rebuild:node-pty` and the committed prebuild blob
 * would produce a runtime `MODULE_NOT_FOUND` for Linux users. Pin all
 * three values together (`EXPECTED_VSCODE_RANGE`,
 * `PREBUILD_ELECTRON_VERSION`, the committed pty.node) and bump them as
 * a single-source-of-truth set. The drift guard below fails loud if
 * `engines.vscode` doesn't match what this script expects.
 *
 * Build-tool pre-flight — on Linux, gcc/g++/make/python3 must be present
 * for `@electron/rebuild`'s node-gyp step. The script probes for them
 * with `command -v` and fails with a friendly remediation message
 * instead of letting node-gyp surface an obscure compiler error.
 *
 * The companion-script form (rather than inline `node -e` in
 * package.json) was chosen for readability and to keep cross-platform
 * shell-quoting out of the npm scripts section.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Drift detector — keep these two values in sync with each other AND with
// the committed linux-x64 prebuild. The shipped binary at
// node_modules/node-pty/prebuilds/linux-x64/pty.node was compiled against
// Electron 30.4.0 (the version that ships with VS Code 1.93.x).
const EXPECTED_VSCODE_RANGE = '^1.93.0';
const PREBUILD_ELECTRON_VERSION = '30.4.0';

const platform = os.platform();
const arch = os.arch();
console.log(`[prepublish-guard] host: ${platform}/${arch}`);

// Drift guard: engines.vscode must match what this commit's prebuild was
// compiled against. Mismatch here means the VS Code range was bumped
// without rebuilding the linux-x64 binary, which would crash the
// extension at first require on Linux hosts.
let actualRange = '<unknown>';
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  actualRange = pkg.engines?.vscode || '<undefined>';
} catch (err) {
  console.error(`[prepublish-guard] FATAL: could not read package.json: ${err.message}`);
  process.exit(1);
}
if (actualRange !== EXPECTED_VSCODE_RANGE) {
  console.error(
    `[prepublish-guard] FATAL: engines.vscode is "${actualRange}" but this commit's ` +
      `linux-x64 prebuild was compiled against Electron ${PREBUILD_ELECTRON_VERSION} ` +
      `(VS Code ${EXPECTED_VSCODE_RANGE}). Bump all three together:\n` +
      `  1. EXPECTED_VSCODE_RANGE in scripts/prepublish-guard.js\n` +
      `  2. -v <electron> in scripts.rebuild:node-pty in package.json\n` +
      `  3. node_modules/node-pty/prebuilds/linux-x64/pty.node (re-run the WSL Ubuntu build recipe)\n` +
      `Do NOT skip this guard - shipping a mismatched prebuild crashes the extension on Linux.`
  );
  process.exit(1);
}

/**
 * POSIX probe for a binary on PATH. Uses `command -v` which is built into
 * POSIX shells; falls back to ANSI-C-style exit-code-throws via execSync.
 * Linux-only — Windows / macOS branches never call into here because we
 * skip the rebuild on those hosts (the bundled node-pty prebuilds already
 * cover those arches).
 *
 * @param {string} cmd  the binary name to look up on PATH
 * @returns {boolean}   true iff `command -v <cmd>` exits 0
 */
function hasTool(cmd) {
  try {
    execSync(`command -v ${cmd} >/dev/null 2>&1`, {
      stdio: 'pipe',
      shell: '/bin/sh',
    });
    return true;
  } catch {
    return false;
  }
}

if (platform === 'linux') {
  const REQUIRED_TOOLS = ['gcc', 'g++', 'make', 'python3'];
  const missing = REQUIRED_TOOLS.filter((t) => !hasTool(t));
  if (missing.length > 0) {
    console.error(
      `[prepublish-guard] FATAL: linux host is missing build tools: ${missing.join(', ')}.\n` +
        `node-pty's native build (rebuild:node-pty) needs gcc, g++, make, and python3. ` +
        `Install them (Debian/Ubuntu: \`sudo apt install -y build-essential python3\`), ` +
        `or run \`vsce package --no-dependencies\` from a non-Linux host.`
    );
    process.exit(1);
  }
  console.log(
    `[prepublish-guard] linux host + build tools present -> running rebuild:node-pty (Electron ${PREBUILD_ELECTRON_VERSION})`
  );
  execSync('npm run rebuild:node-pty', { stdio: 'inherit' });
} else {
  console.log(
    `[prepublish-guard] non-linux host (${platform}) -> skipping rebuild; linux-x64 prebuild is regenerated by Linux CI`
  );
}
