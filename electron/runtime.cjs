const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

function findAvailablePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHttp(url, { timeoutMs = 45000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`);
}

function isAllowedExternalUrl(rawUrl) {
  try {
    return new URL(rawUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

function electronEnvironment(source = process.env) {
  const environment = { ...source };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

function resolvePythonCommand(appRoot, override = process.env.PAGEINDEX_PYTHON) {
  if (override) return override;
  const candidates = [
    path.join(appRoot, '.venv', 'Scripts', 'python.exe'),
    path.resolve(appRoot, '..', '..', '.venv', 'Scripts', 'python.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || 'python';
}

function resolveDocumentsDirectory({ appRoot, isDev, environment = process.env, executablePath = process.execPath }) {
  if (environment.PAGEINDEX_DOCUMENTS_DIR) return path.resolve(environment.PAGEINDEX_DOCUMENTS_DIR);
  if (isDev) return path.join(appRoot, 'documents');
  const executableDirectory = environment.PORTABLE_EXECUTABLE_DIR || path.dirname(executablePath);
  return path.join(executableDirectory, 'documents');
}

function launchTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

module.exports = {
  electronEnvironment,
  findAvailablePort,
  isAllowedExternalUrl,
  launchTimestamp,
  resolveDocumentsDirectory,
  resolvePythonCommand,
  waitForHttp,
};
