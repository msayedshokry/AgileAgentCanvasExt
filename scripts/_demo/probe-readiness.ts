// Prints what the board's agent readiness strip would show on this machine.
//   npx ts-node --transpile-only scripts/_demo/probe-readiness.ts
import * as cp from 'child_process';
import { probeReadiness, runProbe, aiderConfigHasApiBase } from '../../src/workflow/harness/harness-readiness';

const onPath = (b: string) => cp.spawnSync(process.platform === 'win32' ? 'where' : 'which', [b], { windowsHide: true }).status === 0;
void probeReadiness({ isOnPath: onPath, run: runProbe, env: process.env, aiderConfigHasApiBase: () => aiderConfigHasApiBase() })
  .then((rows) => rows.forEach((r) => console.log(`${r.label.padEnd(20)} ${r.installed ? (r.version ?? '?').padEnd(28) : 'not installed'.padEnd(28)} ${r.auth.padEnd(11)} ${r.authDetail}`)));
