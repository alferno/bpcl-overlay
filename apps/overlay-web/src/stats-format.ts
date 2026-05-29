/** Format a 0–1 rate as a percentage string (matches broadcast-api stats-builder pct). */
export function formatPct(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/** Rounded whole-percent variant for compact stat tiles. */
export function formatPctRounded(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}
