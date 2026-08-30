param(
    [string]$Executable = (Join-Path $PSScriptRoot "..\..\release-electron\PageIndex.exe"),
    [string]$DataHome = (Join-Path $PSScriptRoot "..\..\.scratch\electron-smoke")
)

$ErrorActionPreference = "Stop"
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DataHome | Out-Null
$env:PAGEINDEX_DATA_HOME = (Resolve-Path $DataHome).Path
$env:PAGEINDEX_DOCUMENTS_DIR = Join-Path $env:PAGEINDEX_DATA_HOME "documents"
$userData = Join-Path $env:PAGEINDEX_DATA_HOME "electron-user-data"
New-Item -ItemType Directory -Force -Path $userData | Out-Null

$process = Start-Process -FilePath (Resolve-Path $Executable).Path `
    -ArgumentList @("--smoke-test", "--user-data-dir=$userData") -PassThru -Wait
if ($process.ExitCode -ne 0) {
    throw "PageIndex smoke test failed with exit code $($process.ExitCode)."
}

Start-Sleep -Milliseconds 500
$orphans = @(Get-Process pageindex-backend -ErrorAction SilentlyContinue)
if ($orphans.Count -ne 0) {
    throw "PageIndex left $($orphans.Count) backend process(es) running."
}

Write-Output "PageIndex portable smoke test passed; no backend process remains."
