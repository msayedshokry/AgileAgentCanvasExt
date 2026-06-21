// Throwaway spike: prove node-pty spawns a shell, streams output, accepts input.
const os = require('os');
const pty = require('node-pty');

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
const p = pty.spawn(shell, [], { name: 'xterm-color', cols: 80, rows: 30, cwd: process.cwd(), env: process.env });

let out = '';
p.onData((d) => { out += d; process.stdout.write(d); });
p.onExit(({ exitCode }) => {
  const ok = out.includes('SPIKE_OK');
  console.log(`\n[spike] exitCode=${exitCode} sawMarker=${ok}`);
  process.exit(ok ? 0 : 1);
});

// Write input (proves bidirectional), then exit.
setTimeout(() => p.write('echo SPIKE_OK\r'), 500);
setTimeout(() => p.write('exit\r'), 1500);
