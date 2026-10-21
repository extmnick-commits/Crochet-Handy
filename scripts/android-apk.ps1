# Standalone release APK for a physical phone (embedded JS, no Metro, no dev launcher).
# Uses the debug keystore when MYAPP_UPLOAD_* is not configured (sideload testing only).
$ErrorActionPreference = "Stop"
$repoRoot = (Get-Item (Join-Path $PSScriptRoot "..")).FullName
. (Join-Path $repoRoot "scripts\android-build-root.ps1")
$root = Get-AndroidBuildRoot -RepoRoot $repoRoot

Set-Location $root
node (Join-Path $repoRoot "scripts\patch-expo-autolinking-win-drive-root.mjs") | Out-Null
. (Join-Path $repoRoot "scripts\android-env.ps1")

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

Invoke-AndroidGradle -GradleTask "app:assembleRelease" -AndroidDir (Join-Path $root "android")

$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
$artifactsDir = Join-Path $repoRoot "artifacts"
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
$out = Join-Path $artifactsDir "CrochetHandy-standalone.apk"

if (Test-Path $apk) {
    Copy-Item -Force $apk $out
    Write-Host ""
    Write-Host "Standalone APK ready (install on phone, no dev server):" -ForegroundColor Green
    Write-Host "  $out"
    Write-Host ""
    Write-Host "Uninstall any older Crochet Handy / development build first, then sideload this APK." -ForegroundColor DarkGray
} else {
    throw "Build finished but APK was not found at $apk"
}
