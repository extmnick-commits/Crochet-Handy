# Build an installable iOS .ipa for Sideloadly / AltStore (re-sign with a personal Apple ID).
# Run from PowerShell: .\scripts\build-ios-ipa.ps1
# Optional: -Local forces a macOS local EAS build. -NonInteractive skips prompts (CI).
param(
  [switch]$Local,
  [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$profile = 'development-ipa'
$artifactsDir = Join-Path $root 'artifacts'
$ipaOutput = Join-Path $artifactsDir 'CrochetHandy.ipa'

$env:EAS_BUILD_NO_EXPO_GO_WARNING = 'true'

Write-Host ''
Write-Host 'Crochet Handy — iOS IPA (profile: development-ipa)' -ForegroundColor Cyan
Write-Host 'Internal distribution, device build — suitable for Sideloadly / AltStore re-signing.' -ForegroundColor DarkGray
Write-Host ''

function Write-EasCliStatus {
  $globalList = npm list -g eas-cli --depth=0 2>$null
  if ($LASTEXITCODE -eq 0 -and ($globalList -match 'eas-cli@')) {
    Write-Host 'EAS CLI: global eas-cli found; using npx eas-cli@latest for a pinned version.' -ForegroundColor DarkGray
  } else {
    Write-Host 'EAS CLI: no global install; using npx eas-cli@latest.' -ForegroundColor DarkGray
  }
}

function Test-LocalIosCapable {
  $xcode = Get-Command xcodebuild -ErrorAction SilentlyContinue
  if (-not $xcode) {
    if ($Local) {
      Write-Host '-Local was set but xcodebuild was not found on PATH.' -ForegroundColor Yellow
    }
    return $false
  }
  & xcodebuild -version 2>$null | Out-Null
  return $LASTEXITCODE -eq 0
}

function Invoke-Eas {
  param([string[]]$EasArgs)
  & npx eas-cli@latest @EasArgs
  if ($LASTEXITCODE -ne 0) {
    throw "EAS command failed (exit $LASTEXITCODE): eas $($EasArgs -join ' ')"
  }
}

function Find-IpaPath {
  param([string]$SearchRoot)
  $candidates = Get-ChildItem -Path $SearchRoot -Filter '*.ipa' -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if ($candidates) {
    return $candidates[0].FullName
  }
  return $null
}

function Download-LatestCloudIpa {
  param([string]$BuildProfile)

  $listJson = & npx eas-cli@latest build:list `
    --platform ios `
    --build-profile $BuildProfile `
    --status finished `
    --limit 1 `
    --json `
    --non-interactive 2>$null

  if ($LASTEXITCODE -ne 0 -or -not $listJson) {
    throw 'Could not list finished iOS builds. Run the build again or download the .ipa from the Expo build page.'
  }

  $builds = $listJson | ConvertFrom-Json
  if (-not $builds -or $builds.Count -lt 1) {
    throw 'No finished iOS builds found for profile development-ipa.'
  }

  $build = $builds[0]
  $buildId = $build.id
  if (-not $buildId) {
    throw 'Latest build record did not include an id.'
  }

  Write-Host "Downloading build $buildId …" -ForegroundColor Cyan
  Push-Location $artifactsDir
  try {
    Invoke-Eas @('build:download', '--build-id', $buildId, '--non-interactive')
  } finally {
    Pop-Location
  }

  $downloaded = Find-IpaPath -SearchRoot $artifactsDir
  if (-not $downloaded) {
    throw "Download finished but no .ipa was found under $artifactsDir"
  }

  if ($downloaded -ne $ipaOutput) {
    Copy-Item -LiteralPath $downloaded -Destination $ipaOutput -Force
  }
  return $ipaOutput
}

Write-EasCliStatus
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

$useLocal = Test-LocalIosCapable
$buildArgs = @(
  'build',
  '--platform', 'ios',
  '--profile', $profile,
  '--wait'
)

if ($useLocal) {
  Write-Host 'Using local EAS build (macOS + Xcode).' -ForegroundColor Green
  $buildArgs += @('--local', '--output', $ipaOutput)
} else {
  Write-Host 'Using EAS cloud build (no local Xcode — typical on Windows).' -ForegroundColor Yellow
  Write-Host 'Sign in to Expo / Apple when prompted. Use internal (ad-hoc) credentials or any device .ipa you plan to re-sign.' -ForegroundColor Yellow
}

if ($NonInteractive) {
  $buildArgs += '--non-interactive'
}

Write-Host ''
Invoke-Eas $buildArgs

$finalIpa = $null
if ($useLocal) {
  if (Test-Path -LiteralPath $ipaOutput) {
    $finalIpa = $ipaOutput
  } else {
    $finalIpa = Find-IpaPath -SearchRoot $root
  }
} else {
  $finalIpa = Download-LatestCloudIpa -BuildProfile $profile
}

if (-not $finalIpa -or -not (Test-Path -LiteralPath $finalIpa)) {
  throw 'Build completed but the .ipa file could not be located.'
}

Write-Host ''
Write-Host 'IPA ready for Sideloadly / AltStore:' -ForegroundColor Green
Write-Host "  $finalIpa"
Write-Host ''
Write-Host 'Next: open the .ipa in Sideloadly or AltStore and sign with your Apple ID (7-day personal profile).' -ForegroundColor DarkGray
Write-Host 'Bundle ID on device: com.crochethandy.app — change in the sideloader if your free profile requires a unique ID.' -ForegroundColor DarkGray
Write-Host ''
