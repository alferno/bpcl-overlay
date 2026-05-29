#!/usr/bin/env node
/**
 * Scans apps/overlay-web/public/heroes/portraits/*.webm and writes manifest.json
 * Usage: npm run portraits:manifest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portraitDir = path.join(
  root,
  "apps/overlay-web/public/heroes/portraits",
);
const manifestPath = path.join(portraitDir, "manifest.json");

if (!fs.existsSync(portraitDir)) {
  fs.mkdirSync(portraitDir, { recursive: true });
}

const webms = fs
  .readdirSync(portraitDir)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => f.replace(/\.webm$/i, ""))
  .sort((a, b) => a.localeCompare(b));

const pngs = fs
  .readdirSync(portraitDir)
  .filter((f) => f.endsWith(".png"))
  .map((f) => f.replace(/\.png$/i, ""))
  .sort((a, b) => a.localeCompare(b));

const manifest = {
  generatedAt: new Date().toISOString(),
  slugs: webms,
  posters: pngs,
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Wrote ${manifestPath} — ${webms.length} webm, ${pngs.length} png poster(s)`,
);
