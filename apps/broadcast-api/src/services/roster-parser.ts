/** Parse CSV: displayName,steam32,teamName,teamKey[,teamColor[,avatarUrl]] */
import type { RosterPlayer } from "@bpc/shared-types";
import {
  isSteamProfileUrl,
  parseSteamIdentifierSync,
  resolveSteamProfileToSteam32,
} from "./steam32-resolver.js";

export function normalizeTeamColorHex(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return undefined;
}

type ParsedRow =
  | { ok: true; player: RosterPlayer }
  | { ok: false; needsResolve: true; raw: string; rest: Omit<RosterPlayer, "steam32" | "displayName"> & { displayName: string } }
  | { ok: false; needsResolve: false };

function parseRow(line: string): ParsedRow {
  const parts = line.split(",").map((p) => p.trim());
  if (parts.length < 2) return { ok: false, needsResolve: false };

  const displayName = parts[0] ?? "Player";
  const rawId = parts[1] ?? "";

  let teamName: string | undefined;
  let teamKey: string | undefined;
  let teamColor: string | undefined;
  let avatarUrl: string | undefined;
  let roles: string[] | undefined;
  let bpcId: string | undefined;

  if (parts.length >= 4) {
    teamName = parts[2] || undefined;
    teamKey = parts[3] || undefined;
    if (parts.length >= 5) {
      const fifth = parts[4] ?? "";
      if (fifth.startsWith("http://") || fifth.startsWith("https://")) {
        avatarUrl = fifth;
      } else {
        teamColor = normalizeTeamColorHex(fifth);
      }
    }
    if (parts.length >= 6) {
      const sixth = parts[5] ?? "";
      if (sixth.startsWith("http://") || sixth.startsWith("https://")) {
        avatarUrl = sixth;
      }
    }
    if (parts.length >= 7) {
      const seventh = parts[6] ?? "";
      if (seventh) {
        roles = seventh.split("|").map((r) => r.trim()).filter(Boolean);
      }
    }
    if (parts.length >= 8) {
      const eighth = parts[7] ?? "";
      if (eighth) {
        bpcId = eighth;
      }
    }
  } else if (parts.length === 3) {
    teamKey = parts[2] || undefined;
    teamName = teamKey?.replace(/_/g, " ");
  }

  const rest = { displayName, teamName, teamKey, teamColor, avatarUrl, roles, bpcId };

  // Column 2 accepts: a bare Steam32 int, a bare Steam64 int, a
  // steamcommunity.com/profiles/<id> URL, or (async-only) a /id/<vanity> URL.
  const steam32 = parseSteamIdentifierSync(rawId);
  if (steam32 !== null) {
    return { ok: true, player: { ...rest, steam32 } };
  }
  if (isSteamProfileUrl(rawId)) {
    return { ok: false, needsResolve: true, raw: rawId, rest };
  }
  return { ok: false, needsResolve: false };
}

/**
 * Parse CSV: displayName,steam32,teamName,teamKey[,teamColor[,avatarUrl]]
 *
 * Column 2 accepts a bare Steam32/Steam64 ID or a /profiles/<id> URL —
 * all resolvable without a network call. Rows with a /id/<vanity> profile
 * URL are dropped here (a vanity URL needs a Steam API lookup); use
 * parseRosterCsvAsync if you want those resolved instead of skipped.
 */
export function parseRosterCsv(text: string): RosterPlayer[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  let start = 0;
  const header = lines[0]?.toLowerCase() ?? "";
  if (header.includes("steam") || header.includes("display")) {
    start = 1;
  }

  const out: RosterPlayer[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseRow(line);
    if (row.ok) out.push(row.player);
  }
  return out;
}

/**
 * Same as parseRosterCsv, but also resolves /id/<vanity> Steam profile URLs
 * via the Steam Web API (requires STEAM_API_KEY) instead of dropping them.
 * Rows whose identifier can't be resolved at all (missing API key, unknown
 * vanity, garbage input) are still skipped.
 */
export async function parseRosterCsvAsync(text: string): Promise<RosterPlayer[]> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  let start = 0;
  const header = lines[0]?.toLowerCase() ?? "";
  if (header.includes("steam") || header.includes("display")) {
    start = 1;
  }

  const out: RosterPlayer[] = [];
  const pending: {
    index: number;
    raw: string;
    rest: Omit<RosterPlayer, "steam32">;
  }[] = [];

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const row = parseRow(line);
    if (row.ok) {
      out.push(row.player);
    } else if (row.needsResolve) {
      pending.push({ index: out.length, raw: row.raw, rest: row.rest });
      out.push(null as unknown as RosterPlayer); // placeholder, filled in below
    }
  }

  if (pending.length > 0) {
    const resolved = await Promise.all(
      pending.map((p) => resolveSteamProfileToSteam32(p.raw)),
    );
    resolved.forEach((steam32, i) => {
      const { index, rest } = pending[i]!;
      out[index] = steam32 !== null ? { ...rest, steam32 } : (null as unknown as RosterPlayer);
    });
  }

  return out.filter((p): p is RosterPlayer => p !== null);
}

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CSV with avatarUrl, roles, and bpcId column: displayName,steam32,teamName,teamKey,teamColor,avatarUrl,roles,bpcId */
export function serializeRosterCsv(roster: RosterPlayer[]): string {
  const header =
    "displayName,steam32,teamName,teamKey,teamColor,avatarUrl,roles,bpcId";
  const rows = roster.map((p) =>
    [
      p.displayName,
      String(p.steam32),
      p.teamName ?? "",
      p.teamKey ?? "",
      p.teamColor ?? "",
      p.avatarUrl ?? "",
      p.roles ? p.roles.join("|") : "",
      p.bpcId ?? "",
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return `${header}\n${rows.join("\n")}\n`;
}

/** First valid teamColor per teamKey from roster rows. */
export function teamColorsFromRoster(
  roster: RosterPlayer[],
): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const row of roster) {
    if (!row.teamKey || !row.teamColor) continue;
    if (!colors[row.teamKey]) {
      colors[row.teamKey] = row.teamColor;
    }
  }
  return colors;
}
