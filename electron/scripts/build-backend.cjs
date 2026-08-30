const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolvePythonCommand } = require('../runtime.cjs');

const appRoot = path.resolve(__dirname, '..', '..');
const python = resolvePythonCommand(appRoot);
const spec = path.join(appRoot, 'pageindex_backend.spec');

if (!fs.existsSync(spec)) {
  console.error(`Missing backend build specification: ${spec}`);
  process.exit(1);
}

const result = spawnSync(python, [
  '-m', 'PyInstaller',
  spec,
  '--clean',
  '--workpath', path.join(appRoot, 'build-electron', 'python'),
  '--distpath', path.join(appRoot, 'dist-electron'),
  '-y',
], {
  cwd: appRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) {
  console.error(`Unable to start Python backend build: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const backendInternal = path.join(appRoot, 'dist-electron', 'pageindex-backend', '_internal');
const requiredLiteLlmData = [
  path.join('litellm', 'model_prices_and_context_window_backup.json'),
  path.join('litellm', 'litellm_core_utils', 'tokenizers', 'anthropic_tokenizer.json'),
  path.join('litellm', 'containers', 'endpoints.json'),
];
for (const relativePath of requiredLiteLlmData) {
  const bundledPath = path.join(backendInternal, relativePath);
  if (!fs.existsSync(bundledPath)) {
    console.error(`Backend bundle is missing required LiteLLM data: ${bundledPath}`);
    process.exit(1);
  }
}

const pageindexConfig = path.join(backendInternal, 'pageindex', 'config.yaml');
if (!fs.existsSync(pageindexConfig)) {
  console.error(`Backend bundle is missing required PageIndex config: ${pageindexConfig}`);
  process.exit(1);
}
