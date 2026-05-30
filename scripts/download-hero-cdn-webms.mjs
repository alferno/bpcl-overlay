#!/usr/bin/env node
/**
 * Download Steam CDN full-body hero render WebMs into overlay-web/public/heroes/renders/
 *
 * Usage:
 *   npm run heroes:download-cdn-webms
 *   npm run heroes:download-cdn-webms -- --limit=5
 *   npm run heroes:download-cdn-webms -- --force
 *   npm run heroes:download-cdn-webms -- --slug=invoker,magnataur
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CDN_RENDER_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/overlay-web/public/heroes/renders");
const manifestPath = path.join(outDir, "manifest.json");

const { normalizeHeroSlug } = await import(
  path.join(root, "packages/shared-types/dist/hero-assets.js")
);

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

const CONCURRENCY = 4;
const MIN_BYTES_SKIP = 10_000;

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

  console.log(`Downloading ${heroes.length} hero render WebM(s) from Steam CDN...`);
  console.log(`Output: ${outDir}\n`);

  const ok = [];
  const missing = [];
  let skipped = 0;

  await mapPool(
    heroes,
    async (hero) => {
      const canonical = normalizeHeroSlug(hero.slug);
      const candidates = [...new Set([canonical, hero.slug].filter(Boolean))];
      let savedAs = null;

      for (const candidate of candidates) {
        const dest = path.join(outDir, `${candidate}.webm`);
        if (
          !force &&
          fs.existsSync(dest) &&
          fs.statSync(dest).size > MIN_BYTES_SKIP
        ) {
          skipped += 1;
          ok.push(candidate);
          return;
        }
      }

      for (const candidate of candidates) {
        const url = `${CDN_RENDER_BASE}/${candidate}.webm`;
        const dest = path.join(outDir, `${candidate}.webm`);
        try {
          await downloadFile(url, dest);
          savedAs = candidate;
          ok.push(candidate);
          const mb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
          console.log(`  OK   ${candidate}.webm (${mb} MB)`);
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

  const slugs = [...new Set(ok)].sort((a, b) => a.localeCompare(b));
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "steam_cdn_renders",
        slugs,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nDone: ${slugs.length} file(s), ${skipped} skipped (already on disk)`);
  console.log(`Missing/failed: ${missing.length}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log("Run: npm run heroes:verify-webms");

  if (missing.length) {
    console.warn("Some WebMs failed; manifest lists successful downloads only.");
    if (args.includes("--strict")) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
