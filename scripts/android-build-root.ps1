# Resolves a Windows-friendly project root for Gradle / native builds.
function Get-PhysicalRepoRoot {
    param([string]$RepoRoot)
    $out = node -e "console.log(require('fs').realpathSync.native(process.argv[1]))" -- $RepoRoot
    if (-not $out) {
        throw "Could not resolve physical path for: $RepoRoot"
    }
    return $out.Trim().TrimEnd('\')
}

function Get-AndroidBuildRoot {
    param([string]$RepoRoot)

    $logical = (Get-Item -LiteralPath $RepoRoot).FullName.TrimEnd('\')
    $physical = Get-PhysicalRepoRoot -RepoRoot $logical

    if ($logical -ne $physical) {
        Write-Host "SUBST/logical path $logical -> $physical" -ForegroundColor DarkGray
    }

    if ($logical -match '^[A-Z]:$') {
        throw @"
Your project is on a SUBST drive root ($logical\), which breaks Expo autolinking in Gradle.

Use: subst X: C:\Users\extmn  then  cd X:\Crochet-Handy  and run npm run android:apk again.
"@
    }

    $useJunction = $env:OS -match 'Windows' -and (
        $physical.Length -gt 24 -or $logical -ne $physical
    )

    if ($useJunction) {
        $junction = 'C:\ch'
        $junctionTarget = $null
        if (Test-Path $junction) {
            $junctionTarget = (Get-Item -LiteralPath $junction).Target
            if ($junctionTarget) {
                $junctionTarget = $junctionTarget.TrimEnd('\')
            }
        }
        if ($junctionTarget -ne $physical) {
            if (Test-Path $junction) {
                cmd /c "rmdir `"$junction`"" | Out-Null
            }
            cmd /c "mklink /J `"$junction`" `"$physical`"" | Out-Null
        }
        if (Test-Path $junction) {
            Write-Host "Using short build path: $junction -> $physical" -ForegroundColor DarkGray
            return (Get-Item -LiteralPath $junction).FullName.TrimEnd('\')
        }
    }

    return $physical
}

function Invoke-AndroidGradle {
    param(
        [string]$GradleTask,
        [string]$AndroidDir
    )

    Set-Location $AndroidDir
    .\gradlew.bat --stop 2>$null | Out-Null
    Start-Sleep -Seconds 2
    .\gradlew.bat $GradleTask -x lint -x test --no-daemon "-PreactNativeArchitectures=arm64-v8a"
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle failed (exit $LASTEXITCODE). Scroll above for * What went wrong: * or C/C++ errors."
    }
}
