# publish-release-full.ps1
# BPCL Streamer — Full Release (new-user friendly)
# Creates both a Full zip (entire app) and a Delta zip (resources only).
# New users: launcher downloads Full zip → one-click install, no setup needed.
# Existing users: launcher downloads Delta zip → fast patch.
# Run from the repo root: .\scripts\publish-release-full.ps1
# ────────────────────────────────────────────────────────────────────────────

param (
    [string]$BumpType,
    [string]$ReleaseNotes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Check Prerequisites ─────────────────────────────────────────────────────
if (-not (Get-Command "gh" -ErrorAction SilentlyContinue)) {
    Write-Error "GitHub CLI (gh) is not installed. Please install it to use this automated script."
}

# ── Check for Git changes ───────────────────────────────────────────────────
$GitStatus = & git status --porcelain
if ([string]::IsNullOrWhiteSpace($GitStatus)) {
    Write-Host "`n✅ No changes detected in the repository. Everything is up to date!" -ForegroundColor Green
    exit 0
}

# ── Resolve paths ───────────────────────────────────────────────────────────
$RepoRoot    = Split-Path $PSScriptRoot -Parent
$StreamerDir = Join-Path $RepoRoot 'apps\streamer-desktop'
$LauncherDir = Join-Path $RepoRoot 'apps\launcher'
$ZipOutDir   = Join-Path $RepoRoot 'releases'
$GithubOrg   = 'alferno'
$GithubRepo  = 'bpcl-overlay'

# ── 1. Prompt for Version Bump and Release Notes ────────────────────────────
Write-Host ""
Write-Host "  BPCL Streamer Full Release Tool" -ForegroundColor Cyan
Write-Host "  (Full zip + Delta zip + Launcher zip)" -ForegroundColor DarkCyan
Write-Host ""

$PkgJsonPath = Join-Path $StreamerDir 'package.json'
$PkgJson = Get-Content $PkgJsonPath -Raw | ConvertFrom-Json
$CurrentVersion = $PkgJson.version
Write-Host "Current Desktop App Version: $CurrentVersion" -ForegroundColor Yellow

if ([string]::IsNullOrWhiteSpace($BumpType)) {
    $BumpType = Read-Host "Enter version bump type (patch, minor, major) or specific version (leave empty for 'patch')"
}
if ([string]::IsNullOrWhiteSpace($BumpType)) { $BumpType = "patch" }

if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
    $ReleaseNotes = Read-Host "Enter release notes for this update"
}
if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) { $ReleaseNotes = "Automated release update." }

# ── 2. Bump Version ─────────────────────────────────────────────────────────
Write-Host "`n[1/6] Bumping version..." -ForegroundColor Yellow
Push-Location $StreamerDir
try {
    & npm version $BumpType --no-git-tag-version
    if ($LASTEXITCODE -ne 0) { throw "npm version failed" }
} finally {
    Pop-Location
}

$PkgJson = Get-Content $PkgJsonPath -Raw | ConvertFrom-Json
$Version = $PkgJson.version
Write-Host "      New Version: v$Version" -ForegroundColor Green

# ── 3. Build streamer-desktop ───────────────────────────────────────────────
Write-Host "`n[2/6] Building streamer-desktop..." -ForegroundColor Yellow
Push-Location $StreamerDir
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "      Build complete." -ForegroundColor Green

# ── 4. Create Full zip + Delta zip ──────────────────────────────────────────
Write-Host "`n[3/6] Creating Full zip and Delta zip..." -ForegroundColor Yellow
$ReleaseApp       = Join-Path $StreamerDir 'release\BPCL Streamer Desktop-win32-x64'
$ZipFull          = "BPCL-Streamer-v$Version-Full.zip"
$ZipUpdate        = "BPCL-Streamer-v$Version-Update.zip"
$ZipFullOutPath   = Join-Path $ZipOutDir $ZipFull
$ZipUpdateOutPath = Join-Path $ZipOutDir $ZipUpdate

if (-not (Test-Path $ZipOutDir)) { New-Item -ItemType Directory -Path $ZipOutDir | Out-Null }
if (Test-Path $ZipFullOutPath)   { Remove-Item $ZipFullOutPath   -Force }
if (Test-Path $ZipUpdateOutPath) { Remove-Item $ZipUpdateOutPath -Force }

# Full zip — entire Electron app, ready to extract and run
Compress-Archive -Path "$ReleaseApp\*" -DestinationPath $ZipFullOutPath -CompressionLevel Optimal
Write-Host "      Created Full zip:  $ZipFullOutPath" -ForegroundColor Green

# Delta zip — resources only, patches an existing install
$TempDelta    = Join-Path $Env:TEMP "BPCL-Delta-$Version"
$TempDeltaApp = Join-Path $TempDelta "BPCL Streamer Desktop-win32-x64"
New-Item -ItemType Directory -Path $TempDeltaApp -Force | Out-Null
Copy-Item -Path "$ReleaseApp\resources" -Destination $TempDeltaApp -Recurse
Compress-Archive -Path "$TempDelta\*" -DestinationPath $ZipUpdateOutPath -CompressionLevel Optimal
Remove-Item $TempDelta -Recurse -Force
Write-Host "      Created Delta zip: $ZipUpdateOutPath" -ForegroundColor Green

# ── 5. Build and zip Launcher ────────────────────────────────────────────────
Write-Host "`n[4/6] Building Launcher..." -ForegroundColor Yellow
Push-Location $LauncherDir
& npm run build
Pop-Location
$ZipLauncher        = "BPCL-Launcher-v1.1.0.zip"
$ZipLauncherOutPath = Join-Path $ZipOutDir $ZipLauncher
if (Test-Path $ZipLauncherOutPath) { Remove-Item $ZipLauncherOutPath -Force }
Compress-Archive -Path "$LauncherDir\release\*" -DestinationPath $ZipLauncherOutPath -CompressionLevel Optimal
Write-Host "      Created Launcher zip: $ZipLauncherOutPath" -ForegroundColor Green

# ── 6. Write version.json ───────────────────────────────────────────────────
Write-Host "`n[5/6] Updating releases/version.json..." -ForegroundColor Yellow
# url      = Full zip — launcher downloads this for fresh installs (no exe found)
# updateUrl = Delta zip — launcher downloads this for existing installs (exe found)
$FullDownloadUrl   = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$ZipFull"
$UpdateDownloadUrl = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$ZipUpdate"

$VersionJson = [ordered]@{
    version     = $Version
    url         = $FullDownloadUrl
    updateUrl   = $UpdateDownloadUrl
    notes       = $ReleaseNotes
    publishedAt = (Get-Date -Format 'o')
} | ConvertTo-Json -Depth 3

$VersionJsonPath = Join-Path $ZipOutDir 'version.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($VersionJsonPath, $VersionJson, $Utf8NoBom)
Write-Host "      Updated version.json" -ForegroundColor Green

# ── 7. Git Commit, Push, GitHub Release ─────────────────────────────────────
Write-Host "`n[6/6] Pushing to GitHub and creating release..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    & git add "apps/streamer-desktop/package.json" "releases/version.json"
    & git commit -m "chore: release desktop app v$Version (full)"
    & git push
    if ($LASTEXITCODE -ne 0) { Write-Warning "Git push failed. You may need to push manually." }

    Write-Host "      Creating GitHub release v$Version..." -ForegroundColor Cyan
    & gh release create "v$Version" "$ZipFullOutPath" "$ZipUpdateOutPath" "$ZipLauncherOutPath" `
        -t "v$Version" -n "$ReleaseNotes" --repo "$GithubOrg/$GithubRepo"
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed to create release" }
} finally {
    Pop-Location
}

Write-Host "`n✅ Done! Streamer desktop v$Version has been published (Full + Delta)." -ForegroundColor Green
Write-Host "New users: launcher downloads Full zip — one click, no setup." -ForegroundColor Green
Write-Host "Existing users: launcher downloads Delta zip — fast patch." -ForegroundColor Green
Write-Host ""
