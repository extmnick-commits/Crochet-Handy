# Shared Android SDK / JDK setup for local Gradle builds on Windows.
$ErrorActionPreference = "Stop"

function Get-Jdk17Home {
    $roots = @(
        (Join-Path ${env:ProgramFiles} "Microsoft"),
        (Join-Path ${env:ProgramFiles} "Eclipse Adoptium"),
        (Join-Path ${env:ProgramFiles} "Java")
    )

    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $installs = Get-ChildItem $root -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending
        foreach ($install in $installs) {
            $java = Join-Path $install.FullName "bin\java.exe"
            if (Test-Path $java) {
                return $install.FullName
            }
        }
    }

    if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
        if ($env:JAVA_HOME -match 'jdk-17|jdk17|Java-17') {
            return $env:JAVA_HOME
        }
    }

    return $null
}

function Write-AndroidLocalProperties {
    param([string]$ProjectRoot)

    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
    if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
    if (-not (Test-Path $sdk)) {
        throw "Android SDK not found. Install Android Studio or set ANDROID_HOME."
    }

    $env:ANDROID_HOME = $sdk
    $env:ANDROID_SDK_ROOT = $sdk

    $androidDir = Join-Path $ProjectRoot "android"
    if (-not (Test-Path $androidDir)) {
        throw "android/ is missing. Run: npx expo prebuild --platform android"
    }

    $escaped = ($sdk -replace '\\', '/')
    $content = "sdk.dir=$escaped`n"
    $propsPath = Join-Path $androidDir "local.properties"
    Set-Content -Path $propsPath -Value $content -Encoding ASCII
}

$projectRoot = Split-Path $PSScriptRoot -Parent

$jdk17 = Get-Jdk17Home
if (-not $jdk17) {
    throw @"
JDK 17 is required for Android builds (JDK 21+ breaks CMake/Gradle on this project).
Install: winget install Microsoft.OpenJDK.17
"@
}

$env:JAVA_HOME = $jdk17
$pathParts = @("$jdk17\bin") + ($env:PATH -split ';' | Where-Object { $_ -and $_ -notmatch '(?i)\\java\\' })
$env:PATH = ($pathParts | Select-Object -Unique) -join ';'
# Always use the user Gradle cache (sandboxed shells may point elsewhere and break dependency downloads).
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE ".gradle"
$env:NODE_ENV = if ($env:NODE_ENV) { $env:NODE_ENV } else { "development" }

Write-AndroidLocalProperties -ProjectRoot $projectRoot

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
