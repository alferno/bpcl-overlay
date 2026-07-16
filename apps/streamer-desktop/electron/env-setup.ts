import { app } from 'electron'
import path from 'node:path'
import { createHash } from 'node:crypto'
import os from 'node:os'

const docsDir = app.getPath('documents')
const bpclBase = path.join(docsDir, 'BPCLBroadcast')

if (app.isPackaged) {
  process.env.FFMPEG_PATH = path.join(process.resourcesPath, 'bin/ffmpeg.exe');
  process.env.FFPROBE_PATH = path.join(process.resourcesPath, 'bin/win32/x64/ffprobe.exe');
}

if (!process.env.BROADCAST_SECRET) {
  process.env.BROADCAST_SECRET = createHash('sha256')
    .update(os.hostname() + os.userInfo().username)
    .digest('hex')
    .slice(0, 32)
}
if (!process.env.LEAGUE_ID)           process.env.LEAGUE_ID           = '19721'
if (!process.env.NODE_ENV)            process.env.NODE_ENV            = 'production'
if (!process.env.PORT)                process.env.PORT                = '8080'
if (!process.env.STATE_BACKEND)       process.env.STATE_BACKEND       = 'memory'
if (!process.env.CORS_ORIGINS)        process.env.CORS_ORIGINS        = '*'
if (!process.env.STEAM_WEB_API_KEY)   process.env.STEAM_WEB_API_KEY   = 'E5DE5CF0D74F982E7FCB0AC3DE13393F'
if (!process.env.LEAGUE_AUTO_AGGREGATE) process.env.LEAGUE_AUTO_AGGREGATE = 'false'

if (!process.env.REPLAY_DB_FILE)              process.env.REPLAY_DB_FILE              = path.join(bpclBase, 'System', 'replay_db.csv')
if (!process.env.REPLAY_MATCH_FILE)           process.env.REPLAY_MATCH_FILE           = path.join(bpclBase, 'System', 'active_match.txt')
if (!process.env.REPLAY_LAST_COMPLETED_FILE)  process.env.REPLAY_LAST_COMPLETED_FILE  = path.join(bpclBase, 'System', 'last_completed_match.txt')
if (!process.env.REPLAY_PLAYBACK_DIR)         process.env.REPLAY_PLAYBACK_DIR         = path.join(bpclBase, 'Playback')
if (!process.env.REPLAY_FOLDER)               process.env.REPLAY_FOLDER               = path.join(bpclBase, 'Replays')
if (!process.env.ROSTER_CSV_PATH)             process.env.ROSTER_CSV_PATH             = path.join(bpclBase, 'System', 'Rosters', 'players_roster_prepared.csv')
if (!process.env.LEAGUE_STATS_DIR)            process.env.LEAGUE_STATS_DIR            = path.join(bpclBase, 'System', 'Stats')

export { bpclBase }
