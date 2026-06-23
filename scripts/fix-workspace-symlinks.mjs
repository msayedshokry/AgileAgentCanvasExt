#!/usr/bin/env node
// scripts/fix-workspace-symlinks.mjs
//
// npm v11 on Windows creates workspace symlinks with absolute target
// paths (e.g. /d/PersonalDev/.../webview-ui). That breaks portability:
// a contributor on a different checkout path can't reuse the same
// node_modules without re-running `npm install` from their CWD.
//
// There is no .npmrc flag that forces relative workspace symlinks
// (`install-links` / `install-strategy` / `legacy-peer-deps` control
// resolution layout, not symlink form). This postinstall hook
// re-writes absolute workspace symlinks as relative after every
// `npm install`. Idempotent across multiple runs:
//   - already-relative symlinks (incl. Windows junctions) → skip
//   - non-empty directories → warn and leave alone (caller's data)
//   - empty directories → upgrade to relative symlink
//   - missing workspace dirs → skip
//
// Windows uses `junction` reparse points (no admin / Developer Mode
// requirement). POSIX uses standard directory symlinks.
//
// KNOWN WIN32 LIMITATION: Node's `fs.symlinkSync` with `type:'junction'`
// auto-absolutizes the target on Windows (the OS resolves the relative
// path to an absolute one during junction creation). The symlink is
// still functional (resolves, traversal works, audit-script passes),
// but cross-checkout portability on Windows is NOT achieved via this
// script alone. To get a relative junction on Win10+, enable Developer
// Mode and use `cmd /c mklink /D <link> <relativeTarget>`. The script
// surfaces this as a portability `console.warn` rather than failing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const rootPkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);

const rawWorkspaces = rootPkg.workspaces;
const workspaceDirs = (
  Array.isArray(rawWorkspaces) ? rawWorkspaces : rawWorkspaces?.packages
) ?? [];

// Some npm/Node combos on Windows emit POSIX-style absolute targets
// (e.g. /d/PersonalDev/...) that path.isAbsolute (win32) classifies as
// relative. Treat both native and POSIX forms as absolute.
const isAbsoluteTarget = (target) =>
  path.isAbsolute(target) || path.posix.isAbsolute(target);

// Directory junctions on Windows are unprivileged; POSIX uses dir symlinks.
const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

let fixed = 0;
let alreadyRelative = 0;
let notSymlink = 0;
let missing = 0;
let validationFailed = 0;

for (const wsDir of workspaceDirs) {
  const wsAbs = path.resolve(root, wsDir);
  const wsPkgPath = path.join(wsAbs, 'package.json');
  if (!fs.existsSync(wsPkgPath)) {
    missing++;
    continue;
  }

  const { name } = JSON.parse(fs.readFileSync(wsPkgPath, 'utf8'));
  if (!name) {
    missing++;
    continue;
  }

  const linkPath = path.join(root, 'node_modules', name);
  let stat;
  try {
    stat = fs.lstatSync(linkPath);
  } catch {
    missing++;
    continue;
  }

  // Detect symlink vs junction vs real dir via fs.readlinkSync.
  // On Windows (Node 14+), junctions AND true symlinks both surface
  // from readlinkSync; regular directories throw.
  let currentTarget = null;
  try {
    currentTarget = fs.readlinkSync(linkPath);
  } catch {
    // Not a reparse point; treat as a regular dir or file.
  }

  if (currentTarget !== null) {
    if (!isAbsoluteTarget(currentTarget)) {
      alreadyRelative++;
      continue;
    }
    // Absolute symlink/junction → remove and recreate as relative.
    fs.unlinkSync(linkPath);
  } else if (stat.isDirectory()) {
    // Real directory in place of where the workspace symlink should be.
    const entries = fs.readdirSync(linkPath);
    if (entries.length > 0) {
      console.warn(
        `[fix-workspace-symlinks] ${name}: non-empty directory at ${linkPath}; leaving alone (likely stale build copy)`,
      );
      notSymlink++;
      continue;
    }
    // Use rmSync for robustness against hidden files / race-glued content.
    fs.rmSync(linkPath, { recursive: true, force: true });
  } else {
    notSymlink++;
    continue;
  }

  const relativeTarget = path.relative(
    path.join(root, 'node_modules'),
    wsAbs,
  );
  fs.symlinkSync(relativeTarget, linkPath, symlinkType);

  // Post-creation validation, two-stage:
  //   1. FUNCTIONAL — does the resolved target equal wsAbs?
  //      Works on POSIX (relative target) AND Win32 (auto-absolutized
  //      junction). This is what the symmetric behavior looks like.
  //   2. FORM (advisory) — is the stored target absolute? On Win32,
  //      this is expected behavior due to Node API auto-absolutization;
  //      the symlink is functional but cross-checkout portability is NOT
  //      guaranteed. Warn only — do not bump `validationFailed`.
  const rawTarget = fs.readlinkSync(linkPath);
  const resolvedTarget = path.isAbsolute(rawTarget)
    ? rawTarget
    : path.resolve(path.dirname(linkPath), rawTarget);

  if (resolvedTarget !== wsAbs) {
    console.error(
      `[fix-workspace-symlinks] ${name}: post-create functional check failed ` +
        `(resolved=${resolvedTarget}, expected=${wsAbs})`,
    );
    validationFailed++;
    continue;
  }

  if (isAbsoluteTarget(rawTarget)) {
    console.warn(
      `[fix-workspace-symlinks] ${name}: stored target is absolute ` +
        `(Win32 Node API auto-absolutizes junction targets; symlink is ` +
        `functional but cross-checkout portability NOT guaranteed). ` +
        `Enable Developer Mode + use \`cmd /c mklink /D\` for relative targets.`,
    );
  }

  console.log(`[fix-workspace-symlinks] ${name}: -> ${relativeTarget}`);
  fixed++;
}

if (alreadyRelative > 0)
  console.warn(
    `[fix-workspace-symlinks] ${alreadyRelative} workspace symlink(s) already relative`,
  );
if (notSymlink > 0)
  console.warn(
    `[fix-workspace-symlinks] ${notSymlink} workspace entries left untouched (non-symlink / non-empty)`,
  );
if (missing > 0)
  console.warn(
    `[fix-workspace-symlinks] ${missing} workspace(s) skipped (missing dir or package.json)`,
  );
if (validationFailed > 0)
  console.warn(
    `[fix-workspace-symlinks] ${validationFailed} symlink(s) failed post-create validation`,
  );
console.log(`[fix-workspace-symlinks] fixed=${fixed}`);
