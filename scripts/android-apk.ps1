# Assemble a standalone debug APK with embedded JS (no Metro required on device).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. "$PSScriptRoot\android-env.ps1"

if (-not (Test-Path (Join-Path $root "android\gradlew.bat"))) {
    npx expo prebuild --platform android --no-install
}

$coreBuild = Join-Path $root "node_modules\expo\node_modules\expo-modules-core\android\build"
if (Test-Path $coreBuild) {
    Remove-Item -Recurse -Force $coreBuild -ErrorAction SilentlyContinue
}

Get-Process -Name "java" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

$env:NODE_ENV = "production"

Set-Location (Join-Path $root "android")
.\gradlew.bat --stop 2>$null | Out-Null
Start-Sleep -Seconds 2
.\gradlew.bat app:assembleDebug -x lint -x test --no-daemon "-PreactNativeArchitectures=arm64-v8a"

$apk = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
    Write-Host ""
    Write-Host "APK ready: $apk"
} else {
    throw "Build finished but APK was not found at $apk"
}
