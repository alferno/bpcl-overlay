#!/usr/bin/env node
/**
 * Fetch Steam avatar URLs from OpenDota and write them into the roster CSV.
 *
 * Usage:
 *   node scripts/enrich-roster-avatars.mjs
 *   node scripts/enrich-roster-avatars.mjs path/to/roster.csv
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultCsv = path.join(root, "data/roster/players_roster_prepared.csv");
const csvPath = path.resolve(process.argv[2] ?? defaultCsv);

const parserUrl = pathToFileURL(
  path.join(root, "apps/broadcast-api/dist/services/roster-parser.js"),
).href;
const { parseRosterCsv, serializeRosterCsv } = await import(parserUrl);

/** ~40 req/min — stay under OpenDota limits */
const DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function avatarFromProfile(body) {
  const url =
    body?.profile?.avatarfull ??
    body?.avatarfull ??
    body?.profile?.avatarmedium ??
    body?.avatarmedium ??
    body?.profile?.avatar ??
    body?.avatar;
  return typeof url === "string" && url.startsWith("http") ? url : undefined;
}

async function fetchAvatarUrl(steam32) {
  const res = await fetch(
    `https://api.opendota.com/api/players/${steam32}`,
    { headers: { Accept: "application/json" } },
  );
  if (res.status === 429) {
    console.warn("rate limited — waiting 60s");
    await sleep(60_000);
    return fetchAvatarUrl(steam32);
  }
  if (!res.ok) {
    console.warn(`  OpenDota ${res.status} for steam32 ${steam32}`);
    return undefined;
  }
  return avatarFromProfile(await res.json());
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error("CSV not found:", csvPath);
    process.exit(1);
  }

  const text = fs.readFileSync(csvPath, "utf8");
  const roster = parseRosterCsv(text);
  if (roster.length === 0) {
    console.error("No players parsed from", csvPath);
    process.exit(1);
  }

  console.log(`Fetching avatars for ${roster.length} players…`);

  const enriched = [];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < roster.length; i++) {
    const player = roster[i];
    process.stdout.write(
      `[${i + 1}/${roster.length}] ${player.displayName} (${player.steam32})… `,
    );

    let avatarUrl = player.avatarUrl?.trim() || undefined;
    if (!avatarUrl) {
      try {
        avatarUrl = await fetchAvatarUrl(player.steam32);
      } catch (err) {
        console.log("error", err instanceof Error ? err.message : err);
        fail++;
        enriched.push(player);
        if (i < roster.length - 1) await sleep(DELAY_MS);
        continue;
      }
    }

    if (avatarUrl) {
      console.log("ok");
      ok++;
      enriched.push({ ...player, avatarUrl });
    } else {
      console.log("missing");
      fail++;
      enriched.push(player);
    }

    if (i < roster.length - 1) await sleep(DELAY_MS);
  }

  fs.writeFileSync(csvPath, serializeRosterCsv(enriched), "utf8");
  console.log(`\nWrote ${csvPath}`);
  console.log(`Avatars: ${ok} ok, ${fail} missing (kept prior rows without URL)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
