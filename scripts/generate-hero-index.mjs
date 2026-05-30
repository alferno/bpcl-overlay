#!/usr/bin/env node
/**
 * Build apps/overlay-web/public/heroes/hero-index.json from OpenDota hero constants.
 * Run after hero portrait manifest changes: npm run heroes:generate-index
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(
  root,
  "apps/overlay-web/public/heroes/hero-index.json",
);

const { buildHeroSlugIndex, heroesListFromConstants } = await import(
  path.join(root, "packages/shared-types/dist/hero-slug.js")
);

const res = await fetch("https://api.opendota.com/api/constants/heroes");
if (!res.ok) {
  console.error("OpenDota heroes constants failed:", res.status);
  process.exit(1);
}

const heroes = heroesListFromConstants(await res.json());
const idx = buildHeroSlugIndex(heroes);

const byId = Object.fromEntries(
  [...idx.byId.entries()].map(([id, slug]) => [String(id), slug]),
);
const byDisplay = Object.fromEntries(idx.byDisplayKey);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  JSON.stringify(
    { generatedAt: new Date().toISOString(), byId, byDisplay },
    null,
    2,
  ),
);

console.log(
  `Wrote ${outPath} (${Object.keys(byId).length} heroes, ${Object.keys(byDisplay).length} display keys)`,
);
