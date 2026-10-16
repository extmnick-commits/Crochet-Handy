# Start Crochet Handy in Expo Go over a public tunnel (remote testers, no native build).
# Run from PowerShell: .\scripts\share-expo-go.ps1
param(
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host ''
Write-Host 'Crochet Handy — Expo Go (tunnel)' -ForegroundColor Cyan
Write-Host 'Share the exp:// link or QR code with testers on iOS or Android.' -ForegroundColor DarkGray
Write-Host ''

function Test-NodeAvailable {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    throw 'Node.js was not found on PATH. Install Node 20+ from https://nodejs.org and reopen the terminal.'
  }
  $version = & node -v
  Write-Host "Node: $version" -ForegroundColor DarkGray
}

function Test-ProjectDependencies {
  if (-not (Test-Path (Join-Path $root 'node_modules\expo\package.json'))) {
    Write-Host 'Installing npm dependencies…' -ForegroundColor Yellow
    & npm install
    if ($LASTEXITCODE -ne 0) {
      throw 'npm install failed.'
    }
  }
}

function Ensure-ExpoNgrok {
  $localPkg = Join-Path $root 'node_modules\@expo\ngrok\package.json'
  if (Test-Path $localPkg) {
    Write-Host '@expo/ngrok: found in project devDependencies.' -ForegroundColor DarkGray
    return
  }

  Write-Host '@expo/ngrok: not found — installing as a dev dependency (avoids tunnel prompts on first run).' -ForegroundColor Yellow
  & npm install --save-dev @expo/ngrok
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to install @expo/ngrok. Run: npm install --save-dev @expo/ngrok'
  }
}

function Write-TesterInstructions {
  Write-Host ''
  Write-Host '--- When Metro shows a QR code and exp:// URL ---' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Send testers:' -ForegroundColor White
  Write-Host '  1. Install Expo Go (App Store / Google Play).' -ForegroundColor DarkGray
  Write-Host '  2. iOS: open the exp:// link in Safari, or scan the QR with the Camera app.' -ForegroundColor DarkGray
  Write-Host '  3. Android: scan the QR in Expo Go, or open the exp:// link.' -ForegroundColor DarkGray
  Write-Host '  4. Tap Open in Expo Go when prompted.' -ForegroundColor DarkGray
  Write-Host ''
  Write-Host 'Copy-paste template: docs/TESTER_INVITE.md' -ForegroundColor DarkGray
  Write-Host 'Keep this terminal open while testers load the app.' -ForegroundColor Yellow
  Write-Host ''
}

Test-NodeAvailable
Test-ProjectDependencies
Ensure-ExpoNgrok
Write-TesterInstructions

$expoArgs = @('expo', 'start', '--tunnel')
if ($NonInteractive) {
  $env:CI = '1'
}

& npx @expoArgs
if ($LASTEXITCODE -ne 0) {
  throw "expo start --tunnel failed (exit $LASTEXITCODE)."
}
