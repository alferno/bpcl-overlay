/** Parse CSV: displayName,steam32,teamName,teamKey[,teamColor[,avatarUrl]] */
import type { RosterPlayer } from "@bpc/shared-types";

export function normalizeTeamColorHex(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return undefined;
}

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
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) continue;

    const displayName = parts[0] ?? "Player";
    const steam32 = Number(parts[1]);
    if (!Number.isFinite(steam32)) continue;

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
          roles = seventh.split("|").map(r => r.trim()).filter(Boolean);
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

    out.push({ displayName, steam32, teamName, teamKey, teamColor, avatarUrl, roles, bpcId });
  }
  return out;
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
