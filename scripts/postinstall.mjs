#!/usr/bin/env node
// scripts/postinstall.mjs
//
// Root `package.json`'s `postinstall` runs in the cwd where `npm install`
// was invoked. With workspaces, that cwd may be a workspace (e.g.
// `webview-ui/`) rather than the repo root — and (a) `patch-package` won't
// be on PATH (it lives in `<root>/node_modules/.bin/`) and (b) a
// relative `scripts/fix-workspace-symlinks.mjs` won't resolve.
//
// This orchestrator resolves both steps RELATIVE TO ITS OWN LOCATION,
// so it works no matter which workspace's cwd npm installed from:
//
//   - patch-package binary:     <root>/node_modules/.bin/patch-package
//   - symlink-fix script:       <root>/scripts/fix-workspace-symlinks.mjs
//
// Both execFileSync calls pin `cwd: root` so subprocesses inherit a
// consistent working context (e.g. for relative-path calculations the
// symlink-fix performs internally).

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const patchPkgBin = path.join(root, 'node_modules', '.bin', 'patch-package');
const symlinkScript = path.join(root, 'scripts', 'fix-workspace-symlinks.mjs');

execFileSync(patchPkgBin, { stdio: 'inherit', cwd: root });
execFileSync(process.execPath, [symlinkScript], { stdio: 'inherit', cwd: root });
