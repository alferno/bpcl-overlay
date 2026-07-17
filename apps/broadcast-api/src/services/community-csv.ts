import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
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

/** Fetch pages 1 and 2 in parallel, merge, deduplicate, and write CSV to disk */
export async function fetchAndWriteCommunityCsv(): Promise<BpclMember[]> {
  const url1 = `https://api.bpcleague.in/api/public/community?limit=${PAGE_SIZE}&offset=0`;
  const url2 = `https://api.bpcleague.in/api/public/community?limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`;

  logger.info("[Community] Fetching community players from API (paginated, limit=100)...");
  
  const [res1, res2] = await Promise.all([
    axios.get<any>(url1).then((r) => r.data),
    axios.get<any>(url2).then((r) => r.data)
  ]);

  const players1: any[] = res1?.players || [];
  const players2: any[] = res2?.players || [];

  const total = Number(res1?.total || res2?.total || 0);
  if (total > 200) {
    logger.warn(`[Community] Warning: Total community members is ${total}, which exceeds the 200 limit fetched by 2 fixed pages. Some players may be omitted.`);
  }

  const rawMerged = [...players1, ...players2];

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

/** Get community data, loading from CSV if it exists, otherwise fetching and saving. */
export async function getCommunityData(): Promise<BpclMember[]> {
  const csvPath = path.resolve(env.COMMUNITY_CSV_PATH);
  if (existsSync(csvPath)) {
    try {
      const data = await loadCommunityCsv();
      logger.info({ count: data.length }, "[Community] Loaded community members from CSV first.");
      return data;
    } catch (err) {
      logger.warn({ err }, "[Community] Failed reading existing CSV, falling back to fetch.");
    }
  }
  return fetchAndWriteCommunityCsv();
}
