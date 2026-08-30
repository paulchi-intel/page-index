const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { app, BrowserWindow, dialog, shell } = require('electron');

const {
  findAvailablePort,
  isAllowedExternalUrl,
  launchTimestamp,
  resolveDocumentsDirectory,
  resolvePythonCommand,
  waitForHttp,
} = require('./runtime.cjs');

const HOST = '127.0.0.1';
const DEV_PORT = 7788;
const DEV_VIEW_URL = 'http://127.0.0.1:5173';
const isDev = process.argv.includes('--dev') || !app.isPackaged;
const isSmokeTest = process.argv.includes('--smoke-test');
const appRoot = app.getAppPath();

let backendProcess = null;
let backendLog = null;
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function dataHome() {
  return process.env.PAGEINDEX_DATA_HOME || app.getPath('userData');
}

function backendExecutable() {
  return path.join(process.resourcesPath, 'pageindex-backend', 'pageindex-backend.exe');
}

function stopBackend() {
  quitting = true;
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
  backendProcess = null;
  if (backendLog) backendLog.end();
  backendLog = null;
}

function startBackend(port) {
  const home = dataHome();
  const documents = resolveDocumentsDirectory({ appRoot, isDev });
  const logs = path.join(home, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  fs.mkdirSync(documents, { recursive: true });
  backendLog = fs.createWriteStream(path.join(logs, `backend-${launchTimestamp()}.log`), { flags: 'a' });

  const command = isDev ? resolvePythonCommand(appRoot) : backendExecutable();
  const args = isDev ? [path.join(appRoot, 'page_index.py')] : [];
  if (!isDev && !fs.existsSync(command)) {
    throw new Error(`Python backend is missing: ${command}`);
  }

  backendLog.write(`[Electron] Starting backend on http://${HOST}:${port}\n`);
  backendProcess = spawn(command, args, {
    cwd: isDev ? appRoot : path.dirname(command),
    env: {
      ...process.env,
      PAGEINDEX_HOME: home,
      PAGEINDEX_DOCUMENTS_DIR: documents,
      PAGEINDEX_HOST: HOST,
      PAGEINDEX_PORT: String(port),
      PAGEINDEX_OPEN_BROWSER: '0',
      PAGEINDEX_DEV_ORIGIN: isDev ? DEV_VIEW_URL : '',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  backendProcess.stdout.pipe(backendLog, { end: false });
  backendProcess.stderr.pipe(backendLog, { end: false });
  backendProcess.once('error', (error) => backendLog?.write(`[Electron] Backend process error: ${error.stack || error}\n`));
  backendProcess.once('exit', (code, signal) => {
    backendLog?.write(`[Electron] Backend exited code=${code} signal=${signal}\n`);
    if (!quitting && !isSmokeTest) {
      dialog.showErrorBox('PageIndex backend stopped', `The backend exited unexpectedly (code ${code ?? 'unknown'}). See ${logs} for details.`);
      app.quit();
    }
  });
}

function configureNavigation(window, applicationOrigin) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    let targetOrigin = '';
    try { targetOrigin = new URL(url).origin; } catch { /* blocked below */ }
    if (targetOrigin === applicationOrigin) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
}

async function runApplication() {
  const port = isDev ? DEV_PORT : await findAvailablePort(HOST);
  const backendUrl = `http://${HOST}:${port}`;
  startBackend(port);
  await waitForHttp(`${backendUrl}/api/health`);

  if (isSmokeTest) {
    const filesResponse = await fetch(`${backendUrl}/api/files`);
    if (!filesResponse.ok) throw new Error(`/api/files returned HTTP ${filesResponse.status}`);
    console.log(`PageIndex Electron smoke test passed on ${backendUrl}`);
    stopBackend();
    app.exit(0);
    return;
  }

  const viewUrl = isDev ? DEV_VIEW_URL : backendUrl;
  if (isDev) await waitForHttp(viewUrl);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  configureNavigation(mainWindow, new URL(viewUrl).origin);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  await mainWindow.loadURL(viewUrl);
}

app.on('before-quit', stopBackend);
app.on('window-all-closed', () => app.quit());

app.whenReady()
  .then(runApplication)
  .catch((error) => {
    const logs = path.join(dataHome(), 'logs');
    dialog.showErrorBox('PageIndex failed to start', `${error.message}\n\nDetails may be available in ${logs}.`);
    stopBackend();
    app.exit(1);
  });
