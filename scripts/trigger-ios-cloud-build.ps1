# Trigger the GitHub Actions workflow that builds an unsigned iOS .ipa (macOS runner).
# Run from PowerShell: .\scripts\trigger-ios-cloud-build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$workflowFile = 'build-ios-unsigned.yml'
$workflowPath = ".github/workflows/$workflowFile"

Write-Host ''
Write-Host 'Crochet Handy — unsigned iOS cloud build' -ForegroundColor Cyan
Write-Host 'Produces CrochetHandy.ipa for Sideloadly / AltStore (re-sign with your Apple ID).' -ForegroundColor DarkGray
Write-Host ''

function Get-RepoActionsUrl {
  $remote = git remote get-url origin 2>$null
  if (-not $remote) {
    return $null
  }
  if ($remote -match 'github\.com[:/](.+?)(?:\.git)?$') {
    return "https://github.com/$($Matches[1])/actions/workflows/$workflowFile"
  }
  return $null
}

$actionsUrl = Get-RepoActionsUrl

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host 'GitHub CLI (gh) is not installed.' -ForegroundColor Yellow
  if ($actionsUrl) {
    Write-Host "Open Actions and click Run workflow:`n  $actionsUrl" -ForegroundColor White
  } else {
    Write-Host "In your repo on GitHub: Actions → Build unsigned iOS IPA → Run workflow." -ForegroundColor White
  }
  Write-Host ''
  Write-Host 'Install gh: https://cli.github.com/' -ForegroundColor DarkGray
  exit 0
}

$authOk = $false
try {
  gh auth status 2>&1 | Out-Null
  $authOk = $LASTEXITCODE -eq 0
} catch {
  $authOk = $false
}

if (-not $authOk) {
  Write-Host 'gh is installed but not authenticated. Run: gh auth login' -ForegroundColor Yellow
  if ($actionsUrl) {
    Write-Host "Or run the workflow manually:`n  $actionsUrl" -ForegroundColor White
  }
  exit 1
}

Write-Host "Triggering workflow: $workflowPath" -ForegroundColor Green
gh workflow run $workflowFile
if ($LASTEXITCODE -ne 0) {
  throw "gh workflow run failed (exit $LASTEXITCODE)"
}

Start-Sleep -Seconds 3
$runJson = gh run list --workflow $workflowFile --limit 1 --json url,status,displayTitle,databaseId 2>$null
if ($runJson) {
  $run = $runJson | ConvertFrom-Json | Select-Object -First 1
  if ($run.url) {
    Write-Host ''
    Write-Host 'Workflow run started:' -ForegroundColor Green
    Write-Host "  $($run.url)"
    Write-Host ''
    Write-Host 'When the job finishes, download the CrochetHandy-unsigned-ipa artifact from the run page.' -ForegroundColor DarkGray
    exit 0
  }
}

if ($actionsUrl) {
  Write-Host "Workflow triggered. View runs:`n  $actionsUrl" -ForegroundColor Green
} else {
  Write-Host 'Workflow triggered. Check Actions on GitHub for the new run.' -ForegroundColor Green
}
