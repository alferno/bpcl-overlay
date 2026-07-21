/**
 * BPCL Community Members API — with CSV persistence
 *
 * Endpoint: https://api.bpcleague.in/api/public/community
 *
 * On every successful fetch:
 *   - Updates in-memory Map for fast synchronous lookups
 *   - Serializes to a CSV string stored in sessionStorage (key: bpcl_community_csv)
 *     so refreshing the tab doesn't lose data between navigations.
 *
 * CSV format (created fresh, not pre-existing):
 *   steam32Id,cardTier,displayName,avatarUrl,statIds,statLabels,statValues
 *
 * Refreshes every 5 minutes while the page is open.
 */

import { resolveApiOrigin } from '../../utils/resolve-origin';

export interface BpclCardStat {
  id: string;
  label: string;
  value: string;
}

export interface BpclMember {
  steam32Id: number;
  avatarUrl?: string;
  /** Card rarity tier straight from the API: "default" | "basic" | "gold" | "holo" */
  cardTier: 'default' | 'basic' | 'gold' | 'holo';
  displayName?: string;
  card?: {
    stats?: BpclCardStat[];
  };
}

interface CommunityMemberPayload extends Omit<BpclMember, 'card'> {
  card?: {
    stats?: unknown;
    cardPayload?: {
      stats?: unknown;
    };
  };
}

const STAT_LABELS: Record<string, string> = {
  gpm: 'GPM',
  kda: 'KDA',
  xpm: 'XPM',
  winrate: 'Win Rate',
};

function normalizeStats(stats: unknown): BpclCardStat[] {
  if (Array.isArray(stats)) {
    return stats.flatMap((stat) => {
      if (!stat || typeof stat !== 'object') return [];
      const { id, label, value } = stat as Record<string, unknown>;
      if (typeof id !== 'string') return [];
      const isWinrate = id.toLowerCase() === 'winrate';
      const fallback = isWinrate ? '--%' : '--';
      return [{
        id,
        label: typeof label === 'string' ? label : STAT_LABELS[id] ?? id,
        value: value === undefined || value === null || String(value).trim() === '' ? fallback : String(value),
      }];
    });
  }

  if (!stats || typeof stats !== 'object') return [];
  return Object.entries(stats as Record<string, unknown>).flatMap(([id, value]) => {
    if (value !== null && typeof value === 'object') return [];
    const isWinrate = id.toLowerCase() === 'winrate';
    const fallback = isWinrate ? '--%' : '--';
    const valStr = value === undefined || value === null || String(value).trim() === '' ? fallback : String(value);
    return [{ id, label: STAT_LABELS[id] ?? id, value: valStr }];
  });
}

function normalizeMember(member: CommunityMemberPayload): BpclMember {
  const stats = normalizeStats(member.card?.cardPayload?.stats ?? member.card?.stats);
  return {
    ...member,
    card: stats.length ? { stats } : undefined,
  };
}

// ─── Config ──────────────────────────────────────────────────────────────────
function getCommunityApiUrl(): string {
  const origin = resolveApiOrigin();
  return `${origin}/api/community`;
}
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CSV_STORAGE_KEY = 'bpcl_community_csv';

// ─── In-memory cache ──────────────────────────────────────────────────────────
let memberMap = new Map<number, BpclMember>();
let lastFetchAt = 0;
let fetchInFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/** Escape a CSV field (wrap in quotes and double any inner quotes). */
function csvEscape(v: string | number | undefined): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

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

/** Serialize current memberMap → CSV string and save to sessionStorage. */
function persistCsv(): void {
  const header = 'steam32Id,cardTier,displayName,avatarUrl,statIds,statLabels,statValues';
  const rows = Array.from(memberMap.values()).map((m) => {
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
  const csv = [header, ...rows].join('\n');
  try {
    sessionStorage.setItem(CSV_STORAGE_KEY, csv);
  } catch {
    // Ignore storage quota errors
  }
}

/** Load from sessionStorage CSV on cold start (returns member count loaded). */
function loadCsvFromStorage(): number {
  try {
    const raw = sessionStorage.getItem(CSV_STORAGE_KEY);
    if (!raw) return 0;
    const lines = raw.split('\n');
    if (lines.length < 2) return 0; // header only

    // Skip header row
    let loaded = 0;
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

      memberMap.set(steam32, {
        steam32Id: steam32,
        cardTier: (cardTier as BpclMember['cardTier']) || 'default',
        displayName: displayName || undefined,
        avatarUrl: avatarUrl || undefined,
        card: stats.length ? { stats } : undefined,
      });
      loaded++;
    }
    return loaded;
  } catch {
    return 0;
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchMembers(): Promise<void> {
  try {
    const baseUrl = getCommunityApiUrl();
    const next = new Map<number, BpclMember>();
    
    const res = await fetch(baseUrl);
    if (!res.ok) {
      console.warn(`[BPCL Card] Community API returned ${res.status}`);
      return;
    }
    const json = await res.json();

    // Shape: { players: CommunityMemberPayload[] } or flat array
    const players: CommunityMemberPayload[] = Array.isArray(json?.players)
      ? json.players
      : Array.isArray(json)
      ? json
      : [];

    if (players.length === 0) {
      console.warn('[BPCL Card] Community API returned 0 players');
      return;
    }

    for (const p of players) {
      const steam32 = p.steam32Id ? Number(p.steam32Id) : (p.steam32 ? Number(p.steam32) : undefined);
      if (steam32 && !isNaN(steam32)) {
        const member = normalizeMember({ ...p, steam32Id: steam32 });
        next.set(steam32, member);
      }
    }

    if (next.size === 0) {
      console.warn('[BPCL Card] Community API returned 0 players');
      return;
    }

    memberMap = next;
    lastFetchAt = Date.now();

    // Persist to CSV in sessionStorage
    persistCsv();
    notifyListeners();

    console.info(`[BPCL Card] Community loaded: ${memberMap.size} players (CSV saved)`);
  } catch (err) {
    console.warn('[BPCL Card] Failed to fetch community members:', err);
  } finally {
    fetchInFlight = null;
  }
}

/** Trigger a background refresh if cache is stale. */
function maybeRefresh(): void {
  if (fetchInFlight) return;
  if (Date.now() - lastFetchAt < REFRESH_INTERVAL_MS && memberMap.size > 0) return;
  fetchInFlight = fetchMembers();
}

// ─── Boot: load CSV from storage, then start fresh fetch ──────────────────────

const storedCount = loadCsvFromStorage();
if (storedCount > 0) {
  console.info(`[BPCL Card] Loaded ${storedCount} members from session CSV cache`);
}
// Always kick off a fresh fetch on module load
fetchInFlight = fetchMembers();

// Auto-refresh every 5 minutes
setInterval(() => {
  if (!fetchInFlight) {
    fetchInFlight = fetchMembers();
  }
}, REFRESH_INTERVAL_MS);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Synchronous lookup by steam32Id.
 * Returns `undefined` if not found or data not yet loaded.
 * Triggers a background refresh if cache is stale.
 */
export function getBpclMember(steam32: number): BpclMember | undefined {
  maybeRefresh();
  return memberMap.get(steam32);
}

/**
 * Force a refresh right now.
 * Returns a promise that resolves when the fetch is complete.
 */
export function refreshMembers(): Promise<void> {
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = fetchMembers();
  return fetchInFlight;
}

/** Subscribe to successful community-cache refreshes. */
export function subscribeBpclMembers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Returns the current CSV string (same format as sessionStorage).
 * Useful for debugging: open browser console → copy(getCsvSnapshot()).
 */
export function getCsvSnapshot(): string {
  return sessionStorage.getItem(CSV_STORAGE_KEY) ?? '(empty — fetch not yet complete)';
}

/** How many members are currently in the in-memory cache. */
export function getMemberCount(): number {
  return memberMap.size;
}

/** When was the cache last successfully populated (0 = never). */
export function getLastFetchTime(): number {
  return lastFetchAt;
}

/** True while a fetch is currently in-flight. */
export function isFetchInFlight(): boolean {
  return fetchInFlight !== null;
}
