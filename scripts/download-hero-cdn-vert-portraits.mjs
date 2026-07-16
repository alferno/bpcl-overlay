#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CDN_PORTRAIT_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/overlay-web/public/heroes/portraits");

const { normalizeHeroSlug } = await import(
  pathToFileURL(path.join(root, "packages/shared-types/dist/hero-assets.js")).href
);

const CONCURRENCY = 6;
const MIN_BYTES_SKIP = 2_000;

function slugFromInternal(name) {
  return name.replace(/^npc_dota_hero_/i, "");
}

function heroesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "bpc-hero-download/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.part`;
    const file = fs.createWriteStream(tmp);

    const onResponse = (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {}
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(tmp, () => reject(new Error(`HTTP ${res.statusCode}`)));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
    };

    https
      .get(url, { headers: { "User-Agent": "bpc-hero-download/1.0" } }, onResponse)
      .on("error", reject);
  });
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, run));
  return results;
}

async function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const raw = await fetchJson("https://api.opendota.com/api/constants/heroes");
  let heroes = heroesList(raw).map((h) => ({
    id: h.id,
    name: h.name,
    localized: h.localized_name,
    slug: slugFromInternal(h.name),
  }));

  console.log(`Downloading ${heroes.length} vertical hero portrait JPGs (saving as PNG) from Steam CDN...`);
  console.log(`Output: ${outDir}\n`);

  const ok = [];
  const missing = [];

  await mapPool(
    heroes,
    async (hero) => {
      const canonical = normalizeHeroSlug(hero.slug);
      const candidates = [...new Set([canonical, hero.slug].filter(Boolean))];
      let savedAs = null;

      for (const candidate of candidates) {
        const url = `${CDN_PORTRAIT_BASE}/${candidate}_vert.jpg`;
        const dest = path.join(outDir, `${candidate}.png`);
        try {
          await downloadFile(url, dest);
          savedAs = candidate;
          ok.push(candidate);
          const kb = (fs.statSync(dest).size / 1024).toFixed(1);
          console.log(`  OK   ${candidate}.png (${kb} KB)`);
          break;
        } catch {
          /* try next candidate */
        }
      }

      if (!savedAs) {
        const err = `CDN miss for ${candidates.join(", ")}`;
        missing.push({
          slug: hero.slug,
          localized: hero.localized,
          error: err,
        });
        console.log(`  FAIL ${hero.slug}: ${err}`);
      }
    },
    CONCURRENCY,
  );

  console.log(`\nDone: ${ok.length} file(s)`);
  console.log(`Missing/failed: ${missing.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
