$ErrorActionPreference = 'Stop'
$src = 'D:\__CPU-AGENTS\Qwen3.5-4B.q8q4.gguf'
$destDir = Join-Path $PSScriptRoot '..\models'
$dest = Join-Path $destDir 'Qwen3.5-4B.q8q4.gguf'

New-Item -ItemType Directory -Force -Path $destDir | Out-Null

if (Test-Path $dest) {
  Write-Host "Model already exists at $dest"
  exit 0
}

if (-not (Test-Path $src)) {
  Write-Error "Source model not found: $src"
}

Write-Host "Copying model to project (about 2.9 GB)..."
Copy-Item $src $dest
Write-Host "Done: $dest"
