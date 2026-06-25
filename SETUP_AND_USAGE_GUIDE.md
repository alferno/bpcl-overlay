# BPCL Production Setup & Usage Guide

This document outlines the setup and operation for the BPCL Production suite, which includes the desktop hub application, the web overlays, and the inbuilt replay manager.

## 1. Prerequisites Setup

The built-in Replay Manager requires `ffmpeg` to process video files and automatically handles its own internal folder structure for replays, highlights, and playback.

### Install FFmpeg
The highlight generation and playback trimming rely on FFmpeg.
1. Download [FFmpeg](https://ffmpeg.org/download.html) for Windows.
2. Extract it and add the `bin` folder to your Windows system `PATH` environment variable.
3. Verify by opening a new Command Prompt and typing `ffmpeg -version`.

---

## 2. OBS Setup (Replays & Highlights)

The built-in Replay Manager automates trimming, cataloging, and playing back replays directly from the Producer Dashboard.

### OBS Replay Buffer
1. Open OBS Settings -> **Output**.
2. Go to the **Replay Buffer** tab and check **Enable Replay Buffer**.
3. Set the Maximum Replay Time to at least `40` seconds.
4. In OBS Settings -> **Advanced** -> **Recording**, set a standard folder for your replays. The BPCL Streamer Desktop will automatically detect your OBS replay outputs and move them into its internal managed directories.

### OBS Sources & Scenes
The Replay Manager expects specific sources to exist in your OBS collection:
1. **Media Source**: Create a Media Source named **exactly** `ReplayPlayer`.
   - *Note: This is the source the system will dynamically update with the `.mp4` file when a replay is triggered.*
2. **Scene**: Create a Scene named **exactly** `Replay Intro`.
   - *Note: The system switches to this scene when you trigger "Go Live" or "Play Latest" from the dashboard.*

### Replay Manager Controls
Instead of a Lua script or hotkeys inside OBS, open the **Producer Dashboard** and navigate to the **Replay Manager** tab. From there, you can:
- **Save 15s / 20s / 30s / 40s**: Saves the replay buffer and automatically trims it to the specified length.
- **Go Live**: Switches to the `Replay Intro` scene and plays the selected replay.
- **Play Latest**: Automatically plays the most recently saved replay.
- **Previous / Next Replay**: Navigates through your saved replays during the cast.
- **Favorite Replay (Star Icon)**: Marks the current replay as a favorite. Favorited replays are included in the end-of-match highlights.
- **Next Match**: Increments the match counter in the system.
- **Generate Highlights**: Manually compiles favorited replays from the last completed match into a single MP4 in the `Highlights` folder.

---

## 3. Desktop App & Overlays Setup

The newly packaged Desktop App acts as your central control hub. It bundles the API, the State Manager, the Admin Dashboard, and the Overlays.

### Launching the Hub
1. Navigate to: `apps\streamer-desktop\release\BPCL Streamer Desktop-win32-x64\`
2. Run `BPCL Streamer Desktop.exe`.
3. The desktop app will spin up the internal server and provide you with local URLs for the Admin interface and the Overlays.

### Adding Overlays to OBS
1. In the BPCL Streamer Desktop, locate the overlay URLs (usually `http://localhost:<port>/overlay`).
2. In OBS, add a new **Browser Source**.
3. Set the URL to the overlay link provided by the desktop app.
4. Set the Width to `1920` and Height to `1080` (or your canvas size).
5. Check **"Refresh browser when scene becomes active"** if you want the overlay to reset animations on scene switches.

### Operating the Admin Dashboard
Use the built-in Admin dashboard in the Desktop App to:
- Update Draft states and hero picks.
- Control the visibility of specific stats (Hero Stats, Player Stats).
- Update team names, scores, and series information.

---

## 4. Production Workflow Summary

1. **Pre-Show**: 
   - Start OBS and start the Replay Buffer.
   - Open `BPCL Streamer Desktop.exe`.
   - Ensure the correct Match is active in your Admin Dashboard.
2. **During the Game**:
   - Use the Admin Dashboard to update live stats and draft phases.
   - When a big play happens, use the Replay Manager dashboard to save it (e.g. **Save 20s**).
   - After a few seconds, hit **Play Latest** to show it on stream.
   - If it was an amazing play, star it (Favorite) in the dashboard list.
3. **Post-Game**:
   - Hit **Next Match**. 
   - Click **Generate Highlights** to automatically grab all favorited replays from that game and concatenate them into a single highlight reel in the `Highlights` folder.
   - Use this highlight reel during your post-game analysis or break screen!
