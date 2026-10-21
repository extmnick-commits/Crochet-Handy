# Standalone release APK for a physical phone (embedded JS, no Metro, no dev launcher).
# Uses the debug keystore when MYAPP_UPLOAD_* is not configured (sideload testing only).
$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Split-Path $PSScriptRoot -Parent)).Path
$root = $repoRoot

# Release CMake paths can exceed MAX_PATH under a deep repo path on Windows.
if ($env:OS -match 'Windows' -and $repoRoot.Length -gt 24) {
    $junction = 'C:\ch'
    if (-not (Test-Path $junction)) {
        cmd /c "mklink /J `"$junction`" `"$repoRoot`"" | Out-Null
    }
    if (Test-Path $junction) {
        $root = $junction
        Write-Host "Using short build path: $root (avoids Windows MAX_PATH in native builds)" -ForegroundColor DarkGray
    }
}

Set-Location $root
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

Set-Location (Join-Path $root "android")
.\gradlew.bat --stop 2>$null | Out-Null
Start-Sleep -Seconds 2
.\gradlew.bat app:assembleRelease -x lint -x test --no-daemon "-PreactNativeArchitectures=arm64-v8a"

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
