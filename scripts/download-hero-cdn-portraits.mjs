#!/usr/bin/env node
/**
 * Download Steam CDN flat hero portrait PNGs into overlay-web/public/heroes/portraits/
 *
 * Usage:
 *   npm run heroes:download-cdn-portraits
 *   npm run heroes:download-cdn-portraits -- --limit=5
 *   npm run heroes:download-cdn-portraits -- --force
 *   npm run heroes:download-cdn-portraits -- --slug=invoker,magnataur
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CDN_PORTRAIT_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/overlay-web/public/heroes/portraits");
const manifestPath = path.join(outDir, "manifest.json");

const args = process.argv.slice(2);
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;
const slugArg = args.find((a) => a.startsWith("--slug="));
const slugFilter = slugArg
  ? new Set(
      slugArg
        .split("=")[1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
  : null;

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
        } catch {
          /* ignore */
        }
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

  if (slugFilter) {
    heroes = heroes.filter((h) => slugFilter.has(h.slug));
  }
  if (limit != null && Number.isFinite(limit)) {
    heroes = heroes.slice(0, limit);
  }

  console.log(`Downloading ${heroes.length} hero portrait PNG(s) from Steam CDN...`);
  console.log(`Output: ${outDir}\n`);

  const ok = [];
  const missing = [];
  let skipped = 0;

  await mapPool(
    heroes,
    async (hero) => {
      const url = `${CDN_PORTRAIT_BASE}/${hero.slug}.png`;
      const dest = path.join(outDir, `${hero.slug}.png`);

      if (!force && fs.existsSync(dest) && fs.statSync(dest).size > MIN_BYTES_SKIP) {
        skipped += 1;
        ok.push(hero.slug);
        return;
      }

      try {
        await downloadFile(url, dest);
        ok.push(hero.slug);
        const kb = (fs.statSync(dest).size / 1024).toFixed(1);
        console.log(`  OK   ${hero.slug}.png (${kb} KB)`);
      } catch (e) {
        missing.push({
          slug: hero.slug,
          localized: hero.localized,
          error: String(e),
        });
        console.log(`  FAIL ${hero.slug}: ${e}`);
      }
    },
    CONCURRENCY,
  );

  const slugs = [...new Set(ok)].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "steam_cdn_portraits",
        slugs,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nDone: ${slugs.length} file(s), ${skipped} skipped (already on disk)`);
  console.log(`Missing/failed: ${missing.length}`);
  console.log(`Manifest: ${manifestPath}`);

  if (missing.length) {
    console.warn("Some portraits failed; manifest lists successful downloads only.");
    if (args.includes("--strict")) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
