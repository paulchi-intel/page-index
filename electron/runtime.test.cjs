const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  electronEnvironment,
  findAvailablePort,
  isAllowedExternalUrl,
  resolveDocumentsDirectory,
  resolvePythonCommand,
  waitForHttp,
} = require('./runtime.cjs');

test('removes IDE Electron-as-Node mode before launching the desktop runtime', () => {
  assert.deepEqual(
    electronEnvironment({ ELECTRON_RUN_AS_NODE: '1', PAGEINDEX_DATA_HOME: 'C:/data' }),
    { PAGEINDEX_DATA_HOME: 'C:/data' },
  );
});

test('only allows external HTTPS URLs', () => {
  assert.equal(isAllowedExternalUrl('https://gnai.intel.com/meta?section=models'), true);
  assert.equal(isAllowedExternalUrl('http://example.com'), false);
  assert.equal(isAllowedExternalUrl('file:///C:/secret.txt'), false);
  assert.equal(isAllowedExternalUrl('not a URL'), false);
});

test('finds an available loopback port and waits for HTTP readiness', async () => {
  const port = await findAvailablePort();
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{"status":"ok"}');
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  try {
    const response = await waitForHttp(`http://127.0.0.1:${port}/api/health`);
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('prefers an explicit Python command and detects a local virtual environment', () => {
  assert.equal(resolvePythonCommand('C:/repo', 'C:/Python/python.exe'), 'C:/Python/python.exe');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pageindex-python-'));
  const python = path.join(root, '.venv', 'Scripts', 'python.exe');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(python, 'fixture');
  assert.equal(resolvePythonCommand(root), python);
  fs.rmSync(root, { recursive: true, force: true });
});

test('resolves documents beside the portable executable', () => {
  assert.equal(resolveDocumentsDirectory({
    appRoot: 'C:/repo',
    isDev: false,
    environment: { PORTABLE_EXECUTABLE_DIR: 'C:/portable' },
    executablePath: 'C:/temporary/PageIndex.exe',
  }), path.join('C:/portable', 'documents'));
});

test('resolves documents beside packaged and development applications', () => {
  assert.equal(resolveDocumentsDirectory({
    appRoot: 'C:/repo',
    isDev: false,
    environment: {},
    executablePath: 'C:/installed/PageIndex.exe',
  }), path.join('C:/installed', 'documents'));
  assert.equal(resolveDocumentsDirectory({
    appRoot: 'C:/repo',
    isDev: true,
    environment: {},
    executablePath: 'C:/electron/electron.exe',
  }), path.join('C:/repo', 'documents'));
});

test('allows an explicit documents directory override', () => {
  assert.equal(resolveDocumentsDirectory({
    appRoot: 'C:/repo',
    isDev: false,
    environment: { PAGEINDEX_DOCUMENTS_DIR: 'C:/custom-library' },
  }), path.resolve('C:/custom-library'));
});
