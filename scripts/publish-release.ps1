# publish-release.ps1
# BPCL Streamer — Build, Package, and Auto-Publish Release
# Run from the repo root: .\scripts\publish-release.ps1
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

# ── Resolve repo root ───────────────────────────────────────────────────────
$RepoRoot = Split-Path $PSScriptRoot -Parent
$StreamerDir = Join-Path $RepoRoot 'apps\streamer-desktop'

# ── 1. Prompt for Version Bump and Release Notes ────────────────────────────
Write-Host ""
Write-Host "  BPCL Streamer Automated Release Tool" -ForegroundColor Cyan
Write-Host ""

$PkgJsonPath = Join-Path $StreamerDir 'package.json'
$PkgJson = Get-Content $PkgJsonPath -Raw | ConvertFrom-Json
$CurrentVersion = $PkgJson.version
Write-Host "Current Desktop App Version: $CurrentVersion" -ForegroundColor Yellow

if ([string]::IsNullOrWhiteSpace($BumpType)) {
    $BumpType = Read-Host "Enter version bump type (patch, minor, major) or specific version (leave empty for 'patch')"
}
if ([string]::IsNullOrWhiteSpace($BumpType)) {
    $BumpType = "patch"
}

if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
    $ReleaseNotes = Read-Host "Enter release notes for this update"
}
if ([string]::IsNullOrWhiteSpace($ReleaseNotes)) {
    $ReleaseNotes = "Automated release update."
}

# ── 2. Bump Version ─────────────────────────────────────────────────────────
Write-Host "`n[1/5] Bumping version..." -ForegroundColor Yellow
Push-Location $StreamerDir
try {
    # Using --no-git-tag-version so we can manually handle git later
    & npm version $BumpType --no-git-tag-version
    if ($LASTEXITCODE -ne 0) { throw "npm version failed" }
} finally {
    Pop-Location
}

# Read the new version
$PkgJson = Get-Content $PkgJsonPath -Raw | ConvertFrom-Json
$Version = $PkgJson.version
Write-Host "      New Version: v$Version" -ForegroundColor Green

# ── 3. Build streamer-desktop ───────────────────────────────────────────────
Write-Host "`n[2/5] Building streamer-desktop (npm run build)…" -ForegroundColor Yellow
Push-Location $StreamerDir
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
Write-Host "      Build complete." -ForegroundColor Green

# ── 4. Create zip archive ───────────────────────────────────────────────────
Write-Host "`n[3/5] Creating zip archives (Full and Delta)…" -ForegroundColor Yellow
$ReleaseInput = Join-Path $StreamerDir 'release'
$ZipFull = "BPCL-Streamer-v$Version-Full.zip"
$ZipUpdate = "BPCL-Streamer-v$Version-Update.zip"
$ZipOutDir  = Join-Path $RepoRoot 'releases'
$ZipFullOutPath = Join-Path $ZipOutDir $ZipFull
$ZipUpdateOutPath = Join-Path $ZipOutDir $ZipUpdate

if (-not (Test-Path $ZipOutDir)) { New-Item -ItemType Directory -Path $ZipOutDir | Out-Null }
if (Test-Path $ZipFullOutPath) { Remove-Item $ZipFullOutPath -Force }
if (Test-Path $ZipUpdateOutPath) { Remove-Item $ZipUpdateOutPath -Force }

# Create Full Zip
Compress-Archive -Path "$ReleaseInput\*" -DestinationPath $ZipFullOutPath -CompressionLevel Optimal
Write-Host "      Created Full Zip: $ZipFullOutPath" -ForegroundColor Green

# Create Delta Zip (only resources, preserving folder structure)
$TempDelta = Join-Path $Env:TEMP "BPCL-Delta-$Version"
$TempDeltaApp = Join-Path $TempDelta "BPCL Streamer Desktop-win32-x64"
New-Item -ItemType Directory -Path $TempDeltaApp -Force | Out-Null
Copy-Item -Path "$ReleaseInput\BPCL Streamer Desktop-win32-x64\resources" -Destination $TempDeltaApp -Recurse
Compress-Archive -Path "$TempDelta\*" -DestinationPath $ZipUpdateOutPath -CompressionLevel Optimal
Remove-Item $TempDelta -Recurse -Force
Write-Host "      Created Delta Zip: $ZipUpdateOutPath" -ForegroundColor Green

# Build and Zip Launcher
Write-Host "`n[3.5/5] Building Launcher (v1.1.0)…" -ForegroundColor Yellow
$LauncherDir = Join-Path $RepoRoot 'apps\launcher'
Push-Location $LauncherDir
& npm run build
Pop-Location
$LauncherReleaseInput = Join-Path $LauncherDir 'release\*'
$ZipLauncher = "BPCL-Launcher-v1.1.0.zip"
$ZipLauncherOutPath = Join-Path $ZipOutDir $ZipLauncher
if (Test-Path $ZipLauncherOutPath) { Remove-Item $ZipLauncherOutPath -Force }
Compress-Archive -Path $LauncherReleaseInput -DestinationPath $ZipLauncherOutPath -CompressionLevel Optimal
Write-Host "      Created Launcher Zip: $ZipLauncherOutPath" -ForegroundColor Green

# ── 5. Write version.json ───────────────────────────────────────────────────
Write-Host "`n[4/5] Updating releases/version.json…" -ForegroundColor Yellow
$GithubOrg  = 'alferno'
$GithubRepo = 'bpcl-overlay'
$FullDownloadUrl = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$ZipFull"
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

# ── 6. Git Commit & Push ────────────────────────────────────────────────────
Write-Host "`n[5/5] Pushing to GitHub and Creating Release..." -ForegroundColor Yellow

Push-Location $RepoRoot
try {
    # Commit package.json and version.json
    & git add "apps/streamer-desktop/package.json" "releases/version.json"
    & git commit -m "chore: release desktop app v$Version"
    & git push
    if ($LASTEXITCODE -ne 0) { Write-Warning "Git push failed. You may need to push manually." }

    # Create GitHub Release with gh cli
    Write-Host "      Creating GitHub release v$Version..." -ForegroundColor Cyan
    & gh release create "v$Version" "$ZipFullOutPath" "$ZipUpdateOutPath" "$ZipLauncherOutPath" -t "v$Version" -n "$ReleaseNotes" --repo "$GithubOrg/$GithubRepo"
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed to create release" }
} finally {
    Pop-Location
}

Write-Host "`n✅ Done! Streamer desktop v$Version has been published." -ForegroundColor Green
Write-Host "All launchers will automatically pick up this update on their next launch." -ForegroundColor Green
Write-Host ""

