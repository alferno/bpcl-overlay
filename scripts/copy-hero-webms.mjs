#!/usr/bin/env node
/**
 * Copy Dota panorama hero WebMs into overlay-web/public/heroes/renders/
 *
 * Usage:
 *   npm run heroes:copy-webms
 *   npm run heroes:copy-webms -- "D:/SteamLibrary/steamapps/common/dota 2 beta"
 *   npm run heroes:copy-webms -- "D:/.../game/dota/panorama/videos/heroes"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/overlay-web/public/heroes/renders");
const manifestPath = path.join(outDir, "manifest.json");

const HEROES_SUBPATH = path.join(
  "game",
  "dota",
  "panorama",
  "videos",
  "heroes",
);

const defaultDotaDir =
  process.env.DOTA_HERO_VIDEOS ??
  "D:/SteamLibrary/steamapps/common/dota 2 beta/game/dota/panorama/videos/heroes";

function resolveHeroesSourceDir(arg) {
  if (!arg) return defaultDotaDir;
  const resolved = path.resolve(arg);
  const normalized = resolved.replace(/\\/g, "/").toLowerCase();

  if (normalized.endsWith("panorama/videos/heroes")) {
    return resolved;
  }

  const fromGameRoot = path.join(resolved, HEROES_SUBPATH);
  if (fs.existsSync(fromGameRoot)) {
    console.log(`Using heroes folder: ${fromGameRoot}`);
    return fromGameRoot;
  }

  return resolved;
}

const srcDir = resolveHeroesSourceDir(process.argv[2]);

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

if (!fs.existsSync(srcDir)) {
  console.error(`Source not found: ${srcDir}`);
  console.error(
    "Pass Dota game root or panorama/videos/heroes path, or set DOTA_HERO_VIDEOS.",
  );
  console.error(
    'Example: npm run heroes:copy-webms -- "D:/SteamLibrary/steamapps/common/dota 2 beta"',
  );
  process.exit(1);
}

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".webm"));
let copied = 0;

for (const file of files) {
  const slug = file.replace(/^npc_dota_hero_/i, "").replace(/\.webm$/i, "");
  if (!slug) continue;
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, `${slug}.webm`));
  copied += 1;
}

const slugs = fs
  .readdirSync(outDir)
  .filter((f) => f.endsWith(".webm"))
  .map((f) => f.replace(/\.webm$/i, ""))
  .sort((a, b) => a.localeCompare(b));

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), slugs }, null, 2)}\n`,
);

console.log(`Copied ${copied} WebM(s) from ${srcDir}`);
console.log(`Wrote ${manifestPath} — ${slugs.length} slug(s)`);
console.log(
  "Note: panorama WebMs are draft-hover busts (tight crop). For full-body renders:",
);
console.log("  npm run heroes:download-cdn-webms");
console.log("Run: npm run heroes:verify-webms");
