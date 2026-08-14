# ─────────────────────────────────────────────────────────────────────────────
# SmartSht Remote Deploy — PowerShell (Windows)
#
# Pushes to main, then SSHs into the production server and runs the deploy.
#
# Usage:
#   .\scripts\deploy-remote.ps1              # full deploy
#   .\scripts\deploy-remote.ps1 -Server      # server only
#   .\scripts\deploy-remote.ps1 -Frontend    # frontend only
#   .\scripts\deploy-remote.ps1 -SkipPush    # deploy without pushing first
# ─────────────────────────────────────────────────────────────────────────────

param(
    [switch]$Server,
    [switch]$Frontend,
    [switch]$SkipPush,
    [string]$SshKey = "$env:USERPROFILE\.ssh\server_saver_key"
)

$ErrorActionPreference = 'Stop'
$SshHost = 'ubuntu@52.0.207.242'
$DeployScript = '/opt/smartsht/current/scripts/deploy.sh'

# ─── Build deploy args ────────────────────────────────────────────────────────

$DeployArgs = @()
if ($Server)   { $DeployArgs += '--server' }
if ($Frontend) { $DeployArgs += '--frontend' }
$DeployArgStr = $DeployArgs -join ' '

# ─── Pre-flight ───────────────────────────────────────────────────────────────

Write-Host "[deploy] SmartSht remote deploy starting..." -ForegroundColor Green

if (-not (Test-Path $SshKey)) {
    Write-Host "[deploy] SSH key not found: $SshKey" -ForegroundColor Red
    exit 1
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "[deploy] Working tree has uncommitted changes:" -ForegroundColor Yellow
    git status --short
    Write-Host ""
    $confirm = Read-Host "Deploy anyway? Current branch tip will be deployed [y/N]"
    if ($confirm -notin @('y', 'Y')) {
        Write-Host "[deploy] Aborted." -ForegroundColor Red
        exit 1
    }
}

# ─── Push ─────────────────────────────────────────────────────────────────────

if (-not $SkipPush) {
    Write-Host "[deploy] Pushing to origin/main..." -ForegroundColor Green
    git push origin main --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[deploy] Git push failed. Resolve conflicts first." -ForegroundColor Red
        exit 1
    }
    Write-Host "[deploy] Push complete." -ForegroundColor Green
}

# ─── SSH Deploy ───────────────────────────────────────────────────────────────

Write-Host "[deploy] Connecting to production server..." -ForegroundColor Green
Write-Host ""

ssh -i $SshKey -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 $SshHost "bash $DeployScript $DeployArgStr"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[deploy] Deploy succeeded!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[deploy] Deploy failed (exit $LASTEXITCODE) — check server logs" -ForegroundColor Red
    exit 1
}
