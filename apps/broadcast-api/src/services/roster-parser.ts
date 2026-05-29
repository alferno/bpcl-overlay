/** Parse CSV: displayName,steam32,teamName,teamKey[,teamColor] */
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

    if (parts.length >= 4) {
      teamName = parts[2] || undefined;
      teamKey = parts[3] || undefined;
      if (parts.length >= 5) {
        teamColor = normalizeTeamColorHex(parts[4]);
      }
    } else if (parts.length === 3) {
      teamKey = parts[2] || undefined;
      teamName = teamKey?.replace(/_/g, " ");
    }

    out.push({ displayName, steam32, teamName, teamKey, teamColor });
  }
  return out;
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
