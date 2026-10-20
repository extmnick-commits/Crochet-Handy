# Local production Android build (release, embedded JS). Requires upload keystore — see android-release-signing.example.properties.
param(
    [switch]$Apk
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. "$PSScriptRoot\android-env.ps1"

function Read-GradleProperties {
    param([string[]]$Paths)
    $merged = @{}
    foreach ($file in $Paths) {
        if (-not (Test-Path $file)) { continue }
        foreach ($line in Get-Content $file) {
            $trimmed = $line.Trim()
            if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
            $parts = $trimmed.Split("=", 2)
            if ($parts.Count -lt 2) { continue }
            $merged[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
    return $merged
}

function Test-ReleaseSigningConfigured {
    param([string]$ProjectRoot)
    $props = Read-GradleProperties @(
        (Join-Path $env:USERPROFILE ".gradle\gradle.properties")
        (Join-Path $ProjectRoot "android\gradle.properties")
    )
    $required = @(
        "MYAPP_UPLOAD_STORE_FILE"
        "MYAPP_UPLOAD_KEY_ALIAS"
        "MYAPP_UPLOAD_STORE_PASSWORD"
        "MYAPP_UPLOAD_KEY_PASSWORD"
    )
    foreach ($key in $required) {
        if (-not $props.ContainsKey($key) -or -not $props[$key]) {
            return $false
        }
    }
    $storePath = Join-Path $ProjectRoot "android\app" $props["MYAPP_UPLOAD_STORE_FILE"]
    return (Test-Path $storePath)
}

$buildGradle = Join-Path $root "android\app\build.gradle"
if (-not (Test-Path (Join-Path $root "android\gradlew.bat")) -or -not (Test-Path $buildGradle) -or ((Get-Content $buildGradle -Raw) -notmatch "MYAPP_UPLOAD_STORE_FILE")) {
    Write-Host "Regenerating android/ (release signing config)…" -ForegroundColor Cyan
    npx expo prebuild --platform android --no-install
}

if (-not (Test-ReleaseSigningConfigured -ProjectRoot $root)) {
    throw @"
Release signing is not configured.

1. Get your upload keystore (same one EAS / Play uses):
     npx eas-cli@latest credentials -p android
   Download the keystore into android\app\

2. Add MYAPP_UPLOAD_* variables — see:
     scripts\android-release-signing.example.properties

Recommended: put secrets in %USERPROFILE%\.gradle\gradle.properties (not in git).

Then run this script again.
"@
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

$gradleTask = if ($Apk) { "app:assembleRelease" } else { "app:bundleRelease" }
.\gradlew.bat $gradleTask -x lint -x test --no-daemon "-PreactNativeArchitectures=arm64-v8a"

$artifactsDir = Join-Path $root "artifacts"
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

if ($Apk) {
    $built = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
    $out = Join-Path $artifactsDir "CrochetHandy-release.apk"
} else {
    $built = Join-Path $root "android\app\build\outputs\bundle\release\app-release.aab"
    $out = Join-Path $artifactsDir "CrochetHandy-release.aab"
}

if (-not (Test-Path $built)) {
    throw "Build finished but output was not found at $built"
}

Copy-Item -Force $built $out
Write-Host ""
Write-Host "Release build ready:" -ForegroundColor Green
Write-Host "  $out"
if (-not $Apk) {
    Write-Host ""
    Write-Host "Upload the .aab to Google Play Console (Production release)." -ForegroundColor DarkGray
}
