---
name: bpcl-release
description: Build everything, package the desktop app, and stage an update for the launcher
---

# BPCL Release Automation

When the user wants to push a new update or triggers this skill (e.g., using `/release` or asking to "build everything and stage an update"), follow these exact steps:

1. **Check for Changes**
   Run `git status --porcelain` to check for uncommitted changes. Then, run `git log $(git describe --tags --abbrev=0)..HEAD --oneline` to check if there are any new commits since the last release. If BOTH outputs are empty, simply inform the user that there are no new changes to release and stop here (do not build or patch). If there are uncommitted changes, you can proceed (they will be included/committed).

2. **Build Everything**
   Run `npm run build` in the root of the workspace. This ensures all packages, API, and web overlays are freshly compiled. Wait for this command to finish successfully.

3. **Run the Release Script**
   Execute the PowerShell release script to package the desktop app and stage the launcher update. You can use standard flags unless the user specifies otherwise:
   ```powershell
   .\scripts\publish-release.ps1 -BumpType patch -ReleaseNotes "Automated overlay and API update"
   ```
   *Note: This script automatically bumps the desktop app version, creates a zip archive in the `releases/` folder, updates `version.json` (which the launcher reads to self-update), commits the changes, and pushes a new GitHub release using the `gh` CLI.*

4. **Verify and Report**
   - If the script fails (e.g., missing GitHub CLI auth), notify the user with the error so they can resolve it.
   - If the script succeeds, inform the user that the release has been published and the launcher will automatically pick up the update on the next restart.
