export type CardLabelWrapVariant = "hero" | "roster-player";

const WRAP_BY_VARIANT: Record<
  CardLabelWrapVariant,
  { maxLineChars: number; maxLines: number }
> = {
  hero: { maxLineChars: 12, maxLines: 2 },
  "roster-player": { maxLineChars: 16, maxLines: 3 },
};

function breakLongToken(token: string, maxLineChars: number): string[] {
  if (token.length <= maxLineChars) return [token];
  const parts: string[] = [];
  for (let i = 0; i < token.length; i += maxLineChars) {
    parts.push(token.slice(i, i + maxLineChars));
  }
  return parts;
}

function ellipsisLine(line: string, maxLineChars: number): string {
  if (line.length <= maxLineChars) return line;
  if (maxLineChars <= 1) return "…";
  return `${line.slice(0, maxLineChars - 1)}…`;
}

/**
 * Word-wraps a pick-card label into short lines for narrow slots.
 * Long tokens are split; overflow on the last line gets an ellipsis.
 */
export function wrapCardLabelLines(
  text: string,
  variant: CardLabelWrapVariant = "hero",
  overrides?: Partial<{ maxLineChars: number; maxLines: number }>,
): string[] {
  const { maxLineChars, maxLines } = {
    ...WRAP_BY_VARIANT[variant],
    ...overrides,
  };

  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const tokens = normalized
    .split(" ")
    .flatMap((word) => breakLongToken(word, maxLineChars));

  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = current ? `${current} ${token}` : token;
    if (candidate.length <= maxLineChars) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = token;

    if (lines.length >= maxLines) {
      lines[maxLines - 1] = ellipsisLine(
        `${lines[maxLines - 1] ?? ""} ${token}`.trim(),
        maxLineChars,
      );
      return lines.slice(0, maxLines);
    }
  }

  if (current) {
    if (lines.length < maxLines) lines.push(current);
    else {
      lines[maxLines - 1] = ellipsisLine(
        `${lines[maxLines - 1] ?? ""} ${current}`.trim(),
        maxLineChars,
      );
    }
  }

  return lines.length ? lines : [normalized];
}

/** Display string for pick cards (hero labels stay uppercase). */
export function formatCardLabelText(
  text: string,
  variant: CardLabelWrapVariant,
): string {
  const trimmed = text.trim();
  return variant === "hero" ? trimmed.toUpperCase() : trimmed;
}
