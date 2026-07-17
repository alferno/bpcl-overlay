# publish-release-delta.ps1
# BPCL Streamer — Delta Release (fast patch for existing installs)
# Creates only the Delta zip (resources folder only) — much faster than a full release.
# Use this for routine updates when all streamers already have the app installed.
# Run from the repo root: .\scripts\publish-release-delta.ps1
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
$ZipOutDir   = Join-Path $RepoRoot 'releases'
$GithubOrg   = 'alferno'
$GithubRepo  = 'bpcl-overlay'

# ── 1. Prompt for Version Bump and Release Notes ────────────────────────────
Write-Host ""
Write-Host "  BPCL Streamer Delta Release Tool" -ForegroundColor Cyan
Write-Host "  (Delta zip only — for existing installs)" -ForegroundColor DarkCyan
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
Write-Host "`n[1/5] Bumping version..." -ForegroundColor Yellow
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
Write-Host "`n[2/5] Building streamer-desktop..." -ForegroundColor Yellow
Push-Location $StreamerDir
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "      Build complete." -ForegroundColor Green

# ── 4. Create Delta zip only ─────────────────────────────────────────────────
Write-Host "`n[3/5] Creating Delta zip..." -ForegroundColor Yellow
$ReleaseApp       = Join-Path $StreamerDir 'release\BPCL Streamer Desktop-win32-x64'
$ZipUpdate        = "BPCL-Streamer-v$Version-Update.zip"
$ZipUpdateOutPath = Join-Path $ZipOutDir $ZipUpdate

if (-not (Test-Path $ZipOutDir)) { New-Item -ItemType Directory -Path $ZipOutDir | Out-Null }
if (Test-Path $ZipUpdateOutPath) { Remove-Item $ZipUpdateOutPath -Force }

$TempDelta    = Join-Path $Env:TEMP "BPCL-Delta-$Version"
$TempDeltaApp = Join-Path $TempDelta "BPCL Streamer Desktop-win32-x64"
New-Item -ItemType Directory -Path $TempDeltaApp -Force | Out-Null
Copy-Item -Path "$ReleaseApp\resources" -Destination $TempDeltaApp -Recurse
Compress-Archive -Path "$TempDelta\*" -DestinationPath $ZipUpdateOutPath -CompressionLevel Optimal
Remove-Item $TempDelta -Recurse -Force
Write-Host "      Created Delta zip: $ZipUpdateOutPath" -ForegroundColor Green

# ── 5. Write version.json ───────────────────────────────────────────────────
# NOTE: url points to the Delta zip. New users without the app installed will
# need to use publish-release-full.ps1 to get a Full zip they can download.
Write-Host "`n[4/5] Updating releases/version.json..." -ForegroundColor Yellow
$UpdateDownloadUrl = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$ZipUpdate"

$VersionJson = [ordered]@{
    version     = $Version
    url         = $UpdateDownloadUrl
    updateUrl   = $UpdateDownloadUrl
    notes       = $ReleaseNotes
    publishedAt = (Get-Date -Format 'o')
} | ConvertTo-Json -Depth 3

$VersionJsonPath = Join-Path $ZipOutDir 'version.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($VersionJsonPath, $VersionJson, $Utf8NoBom)
Write-Host "      Updated version.json" -ForegroundColor Green

# ── 6. Git Commit, Push, GitHub Release ─────────────────────────────────────
Write-Host "`n[5/5] Pushing to GitHub and creating release..." -ForegroundColor Yellow
Push-Location $RepoRoot
try {
    & git add "apps/streamer-desktop/package.json" "releases/version.json"
    & git commit -m "chore: release desktop app v$Version (delta)"
    & git push
    if ($LASTEXITCODE -ne 0) { Write-Warning "Git push failed. You may need to push manually." }

    Write-Host "      Creating GitHub release v$Version..." -ForegroundColor Cyan
    & gh release create "v$Version" "$ZipUpdateOutPath" `
        -t "v$Version" -n "$ReleaseNotes" --repo "$GithubOrg/$GithubRepo"
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed to create release" }
} finally {
    Pop-Location
}

Write-Host "`n✅ Done! Streamer desktop v$Version has been published (Delta only)." -ForegroundColor Green
Write-Host "Existing users will get the patch automatically on next launcher start." -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  New users will need a Full release. Run publish-release-full.ps1 if onboarding new streamers." -ForegroundColor Yellow
Write-Host ""
