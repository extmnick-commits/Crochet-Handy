# First-time iOS TestFlight build (interactive Apple / EAS credential setup).
# Run from PowerShell: .\scripts\ios-testflight-build.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

$env:EAS_BUILD_NO_EXPO_GO_WARNING = 'true'

Write-Host 'Starting iOS production build on EAS…' -ForegroundColor Cyan
Write-Host 'Follow the prompts to sign in to Apple and create distribution credentials.' -ForegroundColor Yellow
Write-Host ''

npx eas-cli@latest build --platform ios --profile production

if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed (exit $LASTEXITCODE)." -ForegroundColor Red
  exit $LASTEXITCODE
}

$submit = Read-Host 'Submit to App Store Connect / TestFlight now? (y/N)'
if ($submit -match '^[yY]') {
  npx eas-cli@latest submit --platform ios --profile production
}
