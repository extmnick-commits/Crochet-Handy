# Build/install Android with JDK 17 + SDK paths configured.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. "$PSScriptRoot\android-env.ps1"
npx expo run:android @args
