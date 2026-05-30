#!/usr/bin/env node
/**
 * Audit one player's league games vs league_*.csv (OpenDota + Steam match list).
 * Usage: node scripts/audit-player-league.mjs <steam32> [leagueId]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const steam32 = Number(process.argv[2]);
const leagueId = Number(process.argv[3] ?? 19721);
if (!Number.isFinite(steam32) || steam32 <= 0) {
  console.error("Usage: node scripts/audit-player-league.mjs <steam32> [leagueId]");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, "apps/broadcast-api/.env") });

const steamKey = process.env.STEAM_WEB_API_KEY?.trim();
const dataDir = path.join(root, "apps/broadcast-api/data/league-stats");
const csvPath = path.join(dataDir, `league_${leagueId}_player_heroes.csv`);

function countsForStats(p) {
  const k = p.kills ?? 0;
  const d = p.deaths ?? 0;
  const a = p.assists ?? 0;
  if (k === 0 && d === 0 && a === 0) return false;
  if ((p.leaver_status ?? 0) >= 3) return false;
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  return res.json();
}

async function steamLeagueMatchIds() {
  if (!steamKey) return [];
  const ids = [];
  let startAt;
  while (ids.length < 80) {
    const params = new URLSearchParams({
      key: steamKey,
      league_id: String(leagueId),
      matches_requested: "100",
    });
    if (startAt != null) params.set("start_at_match_id", String(startAt));
    const body = await fetchJson(
      `https://api.steampowered.com/IDOTA2Match_570/GetMatchHistory/V001/?${params}`,
    );
    const batch = body.result?.matches ?? [];
    if (batch.length === 0) break;
    for (const m of batch) {
      if (typeof m.match_id === "number") ids.push(m.match_id);
    }
    const last = batch[batch.length - 1]?.match_id;
    if (last == null || batch.length < 100) break;
    startAt = last - 1;
  }
  return [...new Set(ids)];
}

async function main() {
  const csvText = await readFile(csvPath, "utf8");
  const csvRows = csvText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.startsWith(String(steam32)));
  let csvGames = 0;
  for (const line of csvRows) {
    const parts = line.split(",");
    csvGames += Number(parts[2]) || 0;
  }

  const steamIds = await steamLeagueMatchIds();
  let odIds = [];
  try {
    const od = await fetchJson(`https://api.opendota.com/api/leagues/${leagueId}/matches`);
    odIds = od.map((m) => m.match_id).filter((id) => typeof id === "number");
  } catch {
    odIds = [];
  }

  const allIds = [...new Set([...steamIds, ...odIds])];
  const played = [];
  const skipped = [];

  for (const matchId of allIds) {
    let detail;
    try {
      detail = await fetchJson(`https://api.opendota.com/api/matches/${matchId}`);
    } catch {
      skipped.push({ matchId, reason: "fetch failed" });
      continue;
    }
    const p = detail.players?.find((x) => x.account_id === steam32);
    if (!p) continue;
    const row = {
      matchId,
      heroId: p.hero_id,
      leagueid: detail.leagueid,
      kda: `${p.kills}/${p.deaths}/${p.assists}`,
      leaver: p.leaver_status ?? 0,
      counted: countsForStats(p),
    };
    if (row.counted) played.push(row);
    else skipped.push({ matchId, reason: "filtered (leaver or 0/0/0)", ...row });
  }

  console.log(`\n=== Player ${steam32} · league ${leagueId} ===\n`);
  console.log(`CSV rows: ${csvRows.length} · CSV game sum: ${csvGames}`);
  console.log(`Steam match IDs: ${steamIds.length} · OpenDota league IDs: ${odIds.length} · union: ${allIds.length}`);
  console.log(`\nCounted in league set (${played.length} games):`);
  for (const r of played.sort((a, b) => a.matchId - b.matchId)) {
    console.log(
      `  ${r.matchId} hero ${r.heroId} leagueid=${r.leagueid} ${r.kda} leaver=${r.leaver}`,
    );
  }
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    for (const s of skipped) console.log(`  ${JSON.stringify(s)}`);
  }

  const csvHeroes = new Set(csvRows.map((l) => Number(l.split(",")[1])));
  const missingFromCsv = played.filter((r) => !csvHeroes.has(r.heroId));
  if (missingFromCsv.length) {
    console.log(`\nIn league matches but NOT in CSV (by hero):`);
    for (const r of missingFromCsv) console.log(`  ${r.matchId} hero ${r.heroId}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
