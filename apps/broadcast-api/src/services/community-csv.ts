import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { logger } from "../logger.js";
import { env } from "../env.js";

export interface BpclCardStat {
  id: string;
  label: string;
  value: string;
}

export interface BpclMember {
  steam32Id: number;
  avatarUrl?: string;
  cardTier: "default" | "basic" | "gold" | "holo";
  displayName?: string;
  card?: {
    stats?: BpclCardStat[];
  };
}

const PAGE_SIZE = 100;

/** Parse a single CSV row respecting quoted fields. */
function csvParseRow(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

/** Escape a CSV field */
function csvEscape(v: string | number | undefined): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Parses CSV file content into BpclMember array */
export function parseCommunityCsvContent(csvContent: string): BpclMember[] {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 2) return [];

  const members: BpclMember[] = [];
  // Skip header: steam32Id,cardTier,displayName,avatarUrl,statIds,statLabels,statValues
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [steam32Str, cardTier, displayName, avatarUrl, statIds, statLabels, statValues] =
      csvParseRow(line);

    const steam32 = Number(steam32Str);
    if (!steam32 || isNaN(steam32)) continue;

    const ids = statIds ? statIds.split('|') : [];
    const labels = statLabels ? statLabels.split('|') : [];
    const values = statValues ? statValues.split('|') : [];
    const stats: BpclCardStat[] = ids.map((id, idx) => ({
      id,
      label: labels[idx] ?? '',
      value: values[idx] ?? '',
    }));

    members.push({
      steam32Id: steam32,
      cardTier: (cardTier as BpclMember['cardTier']) || 'default',
      displayName: displayName || undefined,
      avatarUrl: avatarUrl || undefined,
      card: stats.length ? { stats } : undefined,
    });
  }
  return members;
}

/** Serializes BpclMember array to CSV content */
export function serializeCommunityCsv(members: BpclMember[]): string {
  const header = 'steam32Id,cardTier,displayName,avatarUrl,statIds,statLabels,statValues';
  const rows = members.map((m) => {
    const stats = m.card?.stats ?? [];
    return [
      csvEscape(m.steam32Id),
      csvEscape(m.cardTier),
      csvEscape(m.displayName),
      csvEscape(m.avatarUrl),
      csvEscape(stats.map((s) => s.id).join('|')),
      csvEscape(stats.map((s) => s.label).join('|')),
      csvEscape(stats.map((s) => s.value).join('|')),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

/** Load community from CSV file */
export async function loadCommunityCsv(): Promise<BpclMember[]> {
  const csvPath = path.resolve(env.COMMUNITY_CSV_PATH);
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file missing at ${csvPath}`);
  }
  const content = await readFile(csvPath, "utf8");
  return parseCommunityCsvContent(content);
}

/** Fetch all pages, merge, deduplicate, and write CSV to disk */
export async function fetchAndWriteCommunityCsv(): Promise<BpclMember[]> {
  let offset = 0;
  const rawMerged: any[] = [];
  
  while (true) {
    const url = `https://api.bpcleague.in/api/public/community?limit=${PAGE_SIZE}&offset=${offset}`;
    try {
      const res = await axios.get<any>(url);
      const players = res.data?.players || [];
      if (players.length === 0) break;
      rawMerged.push(...players);
      if (players.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    } catch (err) {
      logger.error({ err, url }, "[Community] Failed to fetch community players page");
      break;
    }
  }

  const total = rawMerged.length;
  logger.info(`[Community] Fetched ${total} total community members.`);

  // Map raw API payloads to BpclMember format and deduplicate by steam32Id
  const uniqueMembers = new Map<number, BpclMember>();

  for (const p of rawMerged) {
    const steam32 = p.steam32Id ? Number(p.steam32Id) : (p.steam32 ? Number(p.steam32) : undefined);
    if (!steam32 || isNaN(steam32)) continue;

    if (!uniqueMembers.has(steam32)) {
      const statsObj = p.card?.cardPayload?.stats;
      const stats: BpclCardStat[] = [];
      if (statsObj && typeof statsObj === "object") {
        if ("gpm" in statsObj) stats.push({ id: "gpm", label: "GPM", value: String(statsObj.gpm ?? "") });
        if ("kda" in statsObj) stats.push({ id: "kda", label: "KDA", value: String(statsObj.kda ?? "") });
        if ("xpm" in statsObj) stats.push({ id: "xpm", label: "XPM", value: String(statsObj.xpm ?? "") });
        if ("winrate" in statsObj) stats.push({ id: "winrate", label: "WINRATE", value: String(statsObj.winrate ?? "") });
      }

      uniqueMembers.set(steam32, {
        steam32Id: steam32,
        cardTier: p.cardTier || "default",
        displayName: p.displayName || undefined,
        avatarUrl: p.avatarUrl || p.card?.avatarUrl || undefined,
        card: stats.length ? { stats } : undefined
      });
    }
  }

  const membersList = Array.from(uniqueMembers.values());

  const csvPath = path.resolve(env.COMMUNITY_CSV_PATH);
  await mkdir(path.dirname(csvPath), { recursive: true });
  await writeFile(csvPath, serializeCommunityCsv(membersList), "utf8");

  logger.info({ count: membersList.length, csvPath }, "[Community] Successfully fetched, merged, and saved community CSV to disk.");
  return membersList;
}

// How long to trust the on-disk cache before re-fetching from bpcleague.in
// automatically. Previously this cache never expired on its own — it only
// refreshed via a manual POST /api/community/refresh call, so a player's
// updated cardTier (e.g. newly granted "holo") could silently never show up
// until someone remembered to hit that endpoint by hand.
const COMMUNITY_CSV_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Get community data, loading from CSV if it exists and is still fresh,
 * otherwise fetching and saving. Falls back to the stale file (rather than
 * failing the request) if a refresh attempt errors out. */
export async function getCommunityData(): Promise<BpclMember[]> {
  const csvPath = path.resolve(env.COMMUNITY_CSV_PATH);
  if (existsSync(csvPath)) {
    try {
      const stats = await stat(csvPath);
      const age = Date.now() - stats.mtimeMs;
      if (age < COMMUNITY_CSV_TTL_MS) {
        const data = await loadCommunityCsv();
        logger.info({ count: data.length, ageMs: age }, "[Community] Loaded community members from fresh-enough CSV cache.");
        return data;
      }
      logger.info({ ageMs: age }, "[Community] Cache expired — refreshing from bpcleague.in.");
    } catch (err) {
      logger.warn({ err }, "[Community] Failed checking CSV cache age, falling back to fetch.");
    }
  }
  try {
    return await fetchAndWriteCommunityCsv();
  } catch (err) {
    logger.warn({ err }, "[Community] Refresh fetch failed — serving stale CSV if we have one.");
    if (existsSync(csvPath)) return loadCommunityCsv();
    throw err;
  }
}
