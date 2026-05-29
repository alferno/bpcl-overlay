#!/usr/bin/env node
/**
 * Compare OpenDota hero slugs vs local WebM files in overlay public folder.
 * Usage: npm run heroes:verify-webms
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendersDir = path.join(
  root,
  "apps/overlay-web/public/heroes/renders",
);
const manifestPath = path.join(rendersDir, "manifest.json");

function slugFromInternal(name) {
  return name.replace(/^npc_dota_hero_/i, "");
}

function displayKey(localized) {
  return localized
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/'/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function heroesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

async function fetchHeroes() {
  const res = await fetch("https://api.opendota.com/api/constants/heroes");
  if (!res.ok) throw new Error(`OpenDota HTTP ${res.status}`);
  return heroesList(await res.json());
}

async function main() {
  const heroes = await fetchHeroes();
  const onDisk = new Set(
    fs.existsSync(rendersDir)
      ? fs
          .readdirSync(rendersDir)
          .filter((f) => f.endsWith(".webm"))
          .map((f) => f.replace(/\.webm$/i, ""))
      : [],
  );

  const missing = [];
  const displayDiff = [];

  for (const h of heroes) {
    const slug = slugFromInternal(h.name);
    if (!onDisk.has(slug)) missing.push({ id: h.id, localized: h.localized_name, slug });

    const key = displayKey(h.localized_name);
    if (key !== slug) {
      displayDiff.push({
        id: h.id,
        localized: h.localized_name,
        displayKey: key,
        slug,
      });
    }
  }

  let manifestSource = "unknown";
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifestSource = manifest.source ?? "unknown";
  } catch {
    /* no manifest */
  }

  console.log(`\n=== Hero WebM verify (${heroes.length} heroes) ===\n`);
  console.log(`Renders dir: ${rendersDir}`);
  console.log(`Manifest source: ${manifestSource}`);
  console.log(`On disk: ${onDisk.size} .webm file(s)\n`);

  if (manifestSource !== "steam_cdn_renders" && onDisk.size > 0) {
    console.log(
      "Tip: For full-body pick animation, run: npm run heroes:download-cdn-webms\n",
    );
  }

  if (onDisk.size === 0) {
    console.log("No local WebMs found. Run: npm run heroes:copy-webms\n");
  }

  if (missing.length) {
    console.log(`Missing local WebM (${missing.length}):`);
    for (const r of missing.slice(0, 30)) {
      console.log(`  [${r.id}] ${r.localized} → ${r.slug}.webm`);
    }
    if (missing.length > 30) {
      console.log(`  ... and ${missing.length - 30} more`);
    }
    console.log();
  } else if (onDisk.size > 0) {
    console.log("All OpenDota heroes have a matching local .webm.\n");
  }

  const samples = displayDiff.filter((r) =>
    ["magnataur", "furion", "nevermore", "zuus", "antimage"].includes(r.slug),
  );
  console.log("Display name → internal slug (sample — labels vs filenames):");
  for (const r of samples.length ? samples : displayDiff.slice(0, 12)) {
    console.log(`  "${r.localized}" (key=${r.displayKey}) → ${r.slug}.webm`);
  }
  if (displayDiff.length > samples.length) {
    console.log(`  (${displayDiff.length} heroes where display key ≠ internal slug)`);
  }
  console.log();

  if (missing.length && onDisk.size > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
