const { spawn } = require('node:child_process');
const electron = require('electron');

const { electronEnvironment } = require('../runtime.cjs');

const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  cwd: require('node:path').resolve(__dirname, '..', '..'),
  env: electronEnvironment(),
  stdio: 'inherit',
  windowsHide: true,
});

child.once('error', (error) => {
  console.error(`Unable to launch Electron: ${error.message}`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
