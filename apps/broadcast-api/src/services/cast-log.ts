/**
 * cast-log.ts — Persistent match log for multi-caster handoff
 *
 * Writes to Documents\BPCLBroadcast\{Season}\  so any caster can pick up
 * where the last person left off. Rosters go to the rosters\ subfolder;
 * match logs to matches\match_log.json + match_log.csv.
 *
 * All writes are best-effort — errors are caught and logged, never thrown,
 * so a missing Documents path never breaks the broadcast.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CastLogEntry {
  /** Dota 2 match ID (may be 0 if not yet resolved) */
  matchId: number | string;
  /** bpcleague team key / name for Radiant side */
  team1: string;
  /** bpcleague team key / name for Dire side */
  team2: string;
  /** Key of winning team, or null if in-progress / not yet determined */
  winner: string | null;
  /** "bo1" | "bo3" | "bo5" etc. */
  seriesType: string;
  /** Stage / round label from bpcleague, e.g. "group-stage" */
  stageKey?: string;
  /** Streamer / caster display name or machine hostname */
  castedBy: string;
  /** ISO 8601 timestamp */
  castedAt: string;
  /** Replay filename only (NOT full path — replays stay on local machine) */
  replayFile?: string;
  /** Optional notes about the match */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Root of the shared broadcast data folder in the user's Documents directory.
 * e.g. C:\Users\anian\Documents\BPCLBroadcast\
 */
export function broadcastDocumentsRoot(): string {
  return path.join(os.homedir(), "Documents", "BPCLBroadcast");
}

/**
 * Season-scoped subfolder under the broadcast root.
 * e.g. …\BPCLBroadcast\Season-2\
 */
export function seasonDir(seasonSlug: string): string {
  // Capitalise for friendlier folder name: "season-2" → "Season-2"
  const friendly = seasonSlug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return path.join(broadcastDocumentsRoot(), friendly);
}

function rostersDir(seasonSlug: string): string {
  return path.join(seasonDir(seasonSlug), "rosters");
}

function matchesDir(seasonSlug: string): string {
  return path.join(seasonDir(seasonSlug), "matches");
}

function matchLogJsonPath(seasonSlug: string): string {
  return path.join(matchesDir(seasonSlug), "match_log.json");
}

function matchLogCsvPath(seasonSlug: string): string {
  return path.join(matchesDir(seasonSlug), "match_log.csv");
}

// ---------------------------------------------------------------------------
// Ensure directories + write README on first use
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const README_CONTENT = `# BPCL Broadcast Data
====================

This folder is automatically maintained by the BPCL Streamer Hub application.
It stores data that can be shared between casters / broadcasters.

## Folder structure

BPCLBroadcast\\
  Season-2\\
    rosters\\
      players_roster_season-2.csv   ← Synced from bpcleague.in — re-sync any time
    matches\\
      match_log.json                ← All matches cast this season (JSON)
      match_log.csv                 ← Same data as a spreadsheet-friendly CSV

## Handoff guide

1. After casting, your matches are automatically logged here.
2. Share this "BPCLBroadcast" folder via OneDrive / Google Drive with other casters.
3. The next caster opens the folder, sees the match log, and continues from there.
4. To sync the roster on any machine: open BPCL Streamer Hub → Admin → "Sync Roster".
5. Replays stay on each caster's local machine — only filenames are recorded here.

## Notes
- Never manually edit match_log.json (the app manages it).
- You CAN open match_log.csv in Excel to review / annotate.
- Roster CSVs are safe to copy to another machine — just import via Admin → Upload Roster.
`;

let _readmeWritten = false;
function ensureReadme(): void {
  if (_readmeWritten) return;
  const root = broadcastDocumentsRoot();
  ensureDir(root);
  const readmePath = path.join(root, "README.txt");
  if (!fs.existsSync(readmePath)) {
    try {
      fs.writeFileSync(readmePath, README_CONTENT, "utf8");
    } catch { /* non-fatal */ }
  }
  _readmeWritten = true;
}

// ---------------------------------------------------------------------------
// Roster CSV — save season-scoped copy
// ---------------------------------------------------------------------------

/**
 * Saves a copy of the roster CSV in the season's rosters\ subfolder.
 * e.g. Documents\BPCLBroadcast\Season-2\rosters\players_roster_season-2.csv
 */
export async function saveSeasonRosterCsv(
  seasonSlug: string,
  csvContent: string
): Promise<void> {
  try {
    ensureReadme();
    const dir = rostersDir(seasonSlug);
    ensureDir(dir);
    const filename = `players_roster_${seasonSlug}.csv`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, csvContent, "utf8");
    logger.info({ filePath }, "[cast-log] Season roster CSV saved to Documents");
  } catch (err) {
    logger.warn({ err, seasonSlug }, "[cast-log] Failed to save season roster CSV (non-fatal)");
  }
}

// ---------------------------------------------------------------------------
// Match log — read + write
// ---------------------------------------------------------------------------

/**
 * Reads all match log entries for a season. Returns empty array on any error.
 */
export function getMatchLog(seasonSlug: string): CastLogEntry[] {
  const logPath = matchLogJsonPath(seasonSlug);
  if (!fs.existsSync(logPath)) return [];
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const CSV_HEADER =
  "matchId,team1,team2,winner,seriesType,stageKey,castedBy,castedAt,replayFile,notes";

function entryToCsvRow(e: CastLogEntry): string {
  const fields = [
    String(e.matchId ?? ""),
    e.team1 ?? "",
    e.team2 ?? "",
    e.winner ?? "",
    e.seriesType ?? "",
    e.stageKey ?? "",
    e.castedBy ?? "",
    e.castedAt ?? "",
    e.replayFile ?? "",
    e.notes ?? "",
  ];
  return fields
    .map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

/**
 * Appends a match log entry to both JSON and CSV files.
 * Idempotent — if a match with the same matchId already exists it will be
 * skipped (unless matchId is 0 / empty, in which case duplicates are allowed).
 */
export async function appendMatchLog(
  seasonSlug: string,
  entry: CastLogEntry
): Promise<void> {
  try {
    ensureReadme();
    const dir = matchesDir(seasonSlug);
    ensureDir(dir);

    // --- JSON log ---
    const jsonPath = matchLogJsonPath(seasonSlug);
    const existing = getMatchLog(seasonSlug);

    // Dedup by matchId (only when matchId is meaningful)
    const isDup =
      entry.matchId &&
      entry.matchId !== 0 &&
      existing.some(
        (e) => String(e.matchId) === String(entry.matchId)
      );

    if (!isDup) {
      existing.push(entry);
      fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2), "utf8");

      // --- CSV log (append only — faster, avoid re-serialising all rows) ---
      const csvPath = matchLogCsvPath(seasonSlug);
      const csvExists = fs.existsSync(csvPath);
      const newLine = entryToCsvRow(entry);
      if (!csvExists) {
        fs.writeFileSync(csvPath, `${CSV_HEADER}\n${newLine}\n`, "utf8");
      } else {
        fs.appendFileSync(csvPath, `${newLine}\n`, "utf8");
      }

      logger.info(
        { matchId: entry.matchId, team1: entry.team1, team2: entry.team2, seasonSlug },
        "[cast-log] Match appended to log"
      );
    } else {
      logger.info(
        { matchId: entry.matchId },
        "[cast-log] Match already in log — skipping duplicate"
      );
    }
  } catch (err) {
    logger.warn({ err, seasonSlug }, "[cast-log] Failed to append match log (non-fatal)");
  }
}

/**
 * Returns summary stats for the current season's match log.
 */
export function getMatchLogSummary(seasonSlug: string): {
  totalMatches: number;
  uniqueCasters: string[];
  lastMatchAt: string | null;
  seasonDir: string;
} {
  const entries = getMatchLog(seasonSlug);
  const casters = [...new Set(entries.map((e) => e.castedBy).filter(Boolean))];
  const lastMatch = entries.length
    ? entries[entries.length - 1].castedAt
    : null;
  return {
    totalMatches: entries.length,
    uniqueCasters: casters,
    lastMatchAt: lastMatch,
    seasonDir: seasonDir(seasonSlug),
  };
}
