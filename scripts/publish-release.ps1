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
Write-Host "`n[3/5] Creating zip archive…" -ForegroundColor Yellow
$ReleaseInput = Join-Path $StreamerDir 'release'
$ZipName    = "BPCL-Streamer-v$Version.zip"
$ZipOutDir  = Join-Path $RepoRoot 'releases'
$ZipOutPath = Join-Path $ZipOutDir $ZipName

if (-not (Test-Path $ZipOutDir)) { New-Item -ItemType Directory -Path $ZipOutDir | Out-Null }
if (Test-Path $ZipOutPath) { Remove-Item $ZipOutPath -Force }

Compress-Archive -Path "$ReleaseInput\*" -DestinationPath $ZipOutPath -CompressionLevel Optimal
Write-Host "      Created: $ZipOutPath" -ForegroundColor Green

# ── 5. Write version.json ───────────────────────────────────────────────────
Write-Host "`n[4/5] Updating releases/version.json…" -ForegroundColor Yellow
$GithubOrg  = 'alferno'
$GithubRepo = 'bpcl-overlay'
$DownloadUrl = "https://github.com/$GithubOrg/$GithubRepo/releases/download/v$Version/$ZipName"

$VersionJson = [ordered]@{
    version     = $Version
    url         = $DownloadUrl
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
    & gh release create "v$Version" "$ZipOutPath" -t "v$Version" -n "$ReleaseNotes" --repo "$GithubOrg/$GithubRepo"
    if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed to create release" }
} finally {
    Pop-Location
}

Write-Host "`n✅ Done! Streamer desktop v$Version has been published." -ForegroundColor Green
Write-Host "All launchers will automatically pick up this update on their next launch." -ForegroundColor Green
Write-Host ""

