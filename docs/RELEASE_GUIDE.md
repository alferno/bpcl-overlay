# BPCL Streamer — Release Guide

> This document explains how to ship new versions of the BPCL Streamer Desktop app via the existing **`alferno/bpcl-overlay`** GitHub repo. The launcher auto-updates from there — streamers never need to manually install updates.

---

## Table of Contents

1. [How it Works](#1-how-it-works)
2. [Releasing a New Version](#2-releasing-a-new-version)
3. [Distributing the Launcher to Streamers](#3-distributing-the-launcher-to-streamers)
4. [Manual Install Fallback](#4-manual-install-fallback)
5. [Folder Structure Reference](#5-folder-structure-reference)

---

## 1. How it Works

The update system uses the existing **`alferno/bpcl-overlay`** repo to host:

- **`releases/version.json`** — a tiny metadata file the launcher fetches on every launch to check for updates (committed directly to `main`)
- **GitHub Release assets** — the actual `.zip` of the packaged streamer app (uploaded via the GitHub Releases UI)

The launcher reads:
```
https://raw.githubusercontent.com/alferno/bpcl-overlay/main/releases/version.json
```

This is already wired in. No config changes needed.

---

## 2. Releasing a New Version

Every time you update the BPCL Streamer Desktop app, run from the **repo root**:

```powershell
.\scripts\publish-release.ps1
```

The script is fully automated and will:

| Step | What it does |
|------|-------------|
| **1** | Prompt you for the version bump (patch, minor, major) and release notes. |
| **2** | Bump the version in `apps/streamer-desktop/package.json`. |
| **3** | Run `npm run build` inside `apps/streamer-desktop/` (isolated build). |
| **4** | Zip the build output → `releases/BPCL-Streamer-v{version}.zip`. |
| **5** | Update `releases/version.json`. |
| **6** | Automatically commit and push the version updates to GitHub. |
| **7** | Use the GitHub CLI (`gh`) to create the release and upload the zip asset. |

> **Note:** You must have the GitHub CLI installed and authenticated (`gh auth login`) to use this script.

### After running the script

There are no manual steps! Within seconds, any streamer who opens the launcher will be prompted to update. ✅

---

## 3. Distributing the Launcher to Streamers

The launcher is built **once** and given to streamers. It then self-updates the *streamer app* forever — the launcher itself almost never needs to change.

### Building the launcher executable

```powershell
cd apps\launcher
npm install
npm run build
```

This produces `apps\launcher\release\BPCL Launcher-win32-x64\`. Inside you'll find `BPCL Launcher.exe`.

### Distribution options

| Method | Notes |
|--------|-------|
| **GitHub Release asset** | Upload `BPCL Launcher-win32-x64.zip` alongside the streamer app on `alferno/bpcl-overlay`. |
| **Google Drive / OneDrive** | Upload and share the link directly in Discord. |
| **Discord / direct** | Zip and send — it's a one-time thing. |

### What streamers do

1. Download and unzip `BPCL Launcher-win32-x64.zip` anywhere on their PC.
2. Double-click `BPCL Launcher.exe`.
3. Launcher checks for the latest streamer version at `alferno/bpcl-overlay`, downloads & installs it, then launches it.
4. Every subsequent launch: auto-check → auto-update if needed → launch. **Zero manual updates ever.**

> **Tip:** Streamers can pin `BPCL Launcher.exe` to their taskbar for one-click access.

---

## 4. Manual Install Fallback

If a streamer's launcher can't update (network issue, corrupted install etc.):

1. Point them to the Releases page directly:
   ```
   https://github.com/alferno/bpcl-overlay/releases
   ```

2. Download the latest `BPCL-Streamer-v*.zip` and extract it to:
   ```
   %LOCALAPPDATA%\BPCLStreamer\
   ```
   (Press `Win + R`, type `%LOCALAPPDATA%\BPCLStreamer\`, hit Enter.)

3. Re-launch the launcher — it detects the install and goes straight to "Launch".

---

## 5. Folder Structure Reference

### On the streamer's PC

```
%LOCALAPPDATA%\BPCLStreamer\
│
├── BPCL Streamer Desktop.exe    ← main app (or similar name)
├── version.txt                  ← installed version e.g. "1.2.0"
├── resources\
│   └── app\                     ← Electron app files
└── ...                          ← other Electron runtime files

Documents\BPCLBroadcast\         ← Shared handoff folder
├── README.txt
└── Season-2\
    ├── rosters\
    │   └── players_roster_season-2.csv
    └── matches\
        ├── match_log.json
        └── match_log.csv
```

### In the repository (`alferno/bpcl-overlay`)

```
BPCL Production\
│
├── apps\
│   ├── launcher\                ← The launcher (Electron, distributed once)
│   └── streamer-desktop\        ← The main streamer app
│
├── releases\
│   ├── version.json             ← Committed to main — all launchers read this
│   └── BPCL-Streamer-v*.zip    ← Build artifacts — upload as GitHub Release assets
│                                   (add *.zip to .gitignore — don't commit the zip)
├── scripts\
│   └── publish-release.ps1      ← One-command release packaging script
│
└── docs\
    └── RELEASE_GUIDE.md         ← You are here
```

---

## version.json Reference

The launcher fetches this on every launch from `releases/version.json` in `main`:

```json
{
  "version": "1.2.0",
  "url": "https://github.com/alferno/bpcl-overlay/releases/download/v1.2.0/BPCL-Streamer-v1.2.0.zip",
  "notes": "Season 2 team sync, Documents folder handoff, auto-update launcher.",
  "publishedAt": "2026-07-13T14:00:00.000Z"
}
```

| Field | Purpose |
|-------|---------|
| `version` | Compared against locally installed `version.txt` |
| `url` | Direct download link to the `.zip` on GitHub Releases |
| `notes` | Shown in the launcher UI |
| `publishedAt` | ISO 8601 timestamp — informational only |

---

## .gitignore

Add this to avoid committing the large zip files:

```gitignore
# Release zips (upload to GitHub Releases, don't commit)
releases/*.zip
```
