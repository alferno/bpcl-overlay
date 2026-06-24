# BPCL Production Features

This document outlines the core features of the BPCL Production suite, which provides a comprehensive, professional-grade broadcast experience for Dota 2 tournaments.

## 1. Core Architecture
- **Monorepo Structure**: Isolated monorepo containing all broadcast tools separated into specialized apps and packages.
- **Real-Time State Management**: Redis/memory-backed state manager (`packages/state-manager`) with Express + Socket.io (`broadcast-api`) for instantaneous updates across all overlays.
- **Shared Types**: Centralized Zod schemas (`packages/shared-types`) ensuring strict type safety between the API, Admin Dashboard, and Overlays.
- **Desktop Application Hub**: Packaged desktop app (`streamer-desktop`) that bundles the API, State Manager, Admin Dashboard, and Overlays into a single, easy-to-use local control hub for streamers.

## 2. Dynamic Overlays (`overlay-web`)
Built with React, Vite, Tailwind CSS, and Framer Motion for high-performance, dynamic animations. Accessible as OBS Browser Sources.
- **Versus Screen (`/versus`)**: Pre-game splash screen showing team matchups, player rosters, avatars, and team logos with reveal animations.
- **Starting Soon (`/startingsoon`)**: Countdown timer scene with dynamic sponsor rotations.
- **Draft Phase (`/draft`)**: Real-time pick and ban overlay mimicking the in-game draft, controllable via the admin dashboard.
- **Game Canvas (`/game`)**: Main in-game HUD overlay integrating live data.
- **Lower Thirds (`/lowerthird`)**: Informational popups and lower third graphics for casters or player information.
- **Player Stats (`/playerstats`)**: Detailed player statistics comparisons.
- **Hero Stats (`/herostats`)**: In-depth hero statistics and performance metrics.
- **Matchup (`/matchup`)**: Head-to-head comparisons for specific roles or players.
- **Post-Game (`/postgame`)**: End-of-match summary, scoreboards, and statistics.
- **Pause Screen (`/pause`)**: Animated pause screen with relevant tournament info or sponsor loops during game pauses.
- **Replay Indicator (`/replay`)**: Visual bug/indicator displayed during instant replays.
- **Sponsor Rotations (`/sponsors`)**: Dedicated module for sponsor logo loops and dynamic ad placements.

## 3. Producer Dashboard (`admin-web`)
A dedicated control panel for the stream producer to manage the live broadcast.
- **Match Setup Panel**: Configure series info, update team names, adjust live scores, and manage team logos.
- **Roster Management**: Upload CSV rosters to quickly populate player names and avatars.
- **Stats Workspace**: Dynamically push player and hero stats to the live overlays on command.
- **Draft Controller**: Manage draft phases, hero picks, and bans manually (via `HeroSearchSelect`).
- **Timer Controls**: Start, stop, and adjust the "Starting Soon" countdown timer.
- **Visibility Toggles**: Instantly show or hide specific overlay components (e.g. lower thirds, stats) from the producer dashboard.

## 4. OBS Integration & Instant Replays
A powerful Lua script (`instant_replay.lua`) built for OBS Studio that automates the entire replay and highlight workflow.
- **Automated Trimming**: Hotkeys to instantly save the replay buffer and use FFmpeg to trim it to specific lengths (15s, 20s, 30s, 40s).
- **Instant Playback**: "Play Latest Replay" hotkey to automatically switch scenes and play the generated clip on stream.
- **Replay Cataloging**: Saves replays to a local database (`replay_db.csv`) for easy navigation (Previous/Next) during the cast.
- **Highlights Generator**: Mark specific replays as "Favorites" during the game. Transitioning to the "Next Match" automatically concatenates all favorited clips into a single post-game highlight reel using FFmpeg.
