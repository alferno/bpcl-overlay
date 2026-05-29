#!/usr/bin/env node
/**
 * Compare OpenDota hero slugs (what GSI hero_id + registry use) vs Steam CDN PNG paths.
 * Also flags overlay heroName → slug derivation mismatches.
 *
 * Usage: node scripts/audit-hero-cdn-slugs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendersDir = path.join(
  root,
  "apps/overlay-web/public/heroes/renders",
);

const CDN_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";
const RENDER_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "bpc-hero-audit/1.0" } }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function headStatus(url) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: "HEAD", headers: { "User-Agent": "bpc-hero-audit/1.0" } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );
    req.on("error", () => resolve(0));
    req.setTimeout(12_000, () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

function slugFromInternal(name) {
  return name.replace(/^npc_dota_hero_/, "");
}

/** What overlay-web does when heroId is missing */
function slugFromHeroNameDisplay(localized) {
  return localized.toLowerCase().replace(/\s+/g, "_");
}

/** What GSI parser does when only heroClass is present */
function displayNameFromHeroClass(heroClass) {
  return heroClass
    .replace(/^npc_dota_hero_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function heroesList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function slugFromOpenDotaImg(img) {
  if (typeof img !== "string") return undefined;
  const m = img.match(/\/heroes\/([^/?#.]+)/);
  return m?.[1];
}

async function main() {
  const raw = await fetchJson("https://api.opendota.com/api/constants/heroes");
  const heroes = heroesList(raw);
  const results = [];

  for (const h of heroes) {
    const slug = slugFromInternal(h.name);
    const cdnSlugFromImg = slugFromOpenDotaImg(h.img);
    const gsiClassVariants = [
      slug,
      `npc_dota_hero_${slug}`,
    ];
    const overlaySlugFromName = slugFromHeroNameDisplay(h.localized_name);
    const gsiDisplayFromClass = displayNameFromHeroClass(slug);
    const overlaySlugFromGsiDisplay = slugFromHeroNameDisplay(gsiDisplayFromClass);

    const flatUrl = `${CDN_BASE}/${slug}.png`;
    const flatStatus = await headStatus(flatUrl);

    const overlayUrl = `${CDN_BASE}/${overlaySlugFromName}.png`;
    const overlayStatus =
      overlaySlugFromName !== slug ? await headStatus(overlayUrl) : flatStatus;

    const renderUrl = `${RENDER_BASE}/${slug}.png`;
    const renderStatus = await headStatus(renderUrl);

    results.push({
      id: h.id,
      localized: h.localized_name,
      internal: h.name,
      slug,
      cdnSlugFromImg,
      imgSlugMismatch: cdnSlugFromImg && cdnSlugFromImg !== slug,
      flatStatus,
      renderStatus,
      overlaySlugFromName,
      overlayFlatStatus: overlayStatus,
      overlayMismatch:
        overlaySlugFromName !== slug && overlayStatus !== 200 && flatStatus === 200,
      gsiDisplayFromClass,
      overlaySlugFromGsiDisplay,
    });
  }

  const imgMismatches = results.filter((r) => r.imgSlugMismatch);
  const cdnMissing = results.filter((r) => r.flatStatus !== 200);
  const renderMissing = results.filter((r) => r.renderStatus !== 200);
  const overlayBroken = results.filter((r) => r.overlayMismatch);

  console.log(`\n=== Hero CDN audit (${results.length} heroes) ===\n`);

  if (imgMismatches.length) {
    console.log(`Internal name slug ≠ OpenDota img slug (${imgMismatches.length}):`);
    for (const r of imgMismatches) {
      console.log(
        `  [${r.id}] ${r.localized} internal=${r.slug} img=${r.cdnSlugFromImg}`,
      );
    }
    console.log();
  }

  if (cdnMissing.length) {
    console.log(`CDN flat PNG missing (${cdnMissing.length}):`);
    for (const r of cdnMissing) {
      console.log(
        `  [${r.id}] ${r.localized} slug=${r.slug} HTTP ${r.flatStatus}`,
      );
    }
    console.log();
  } else {
    console.log("All OpenDota slugs resolve on Steam CDN (dota_react/heroes/{slug}.png).\n");
  }

  if (renderMissing.length) {
    console.log(`CDN render poster missing (${renderMissing.length}):`);
    for (const r of renderMissing) {
      console.log(
        `  [${r.id}] ${r.localized} slug=${r.slug} HTTP ${r.renderStatus}`,
      );
    }
    console.log();
  }

  if (overlayBroken.length) {
    console.log(
      `Overlay heroName→slug would 404 (${overlayBroken.length}) — localized name ≠ CDN slug:`,
    );
    for (const r of overlayBroken) {
      console.log(
        `  [${r.id}] "${r.localized}" → overlay slug "${r.overlaySlugFromName}" (HTTP ${r.overlayFlatStatus}) vs CDN slug "${r.slug}" (HTTP ${r.flatStatus})`,
      );
    }
    console.log();
  }

  const nameDiff = results.filter((r) => r.overlaySlugFromName !== r.slug);
  if (nameDiff.length) {
    console.log(
      `Localized name slug differs from internal (${nameDiff.length}) — OK when heroId is set:`,
    );
    for (const r of nameDiff) {
      const ok =
        r.overlayFlatStatus === 200 ? "overlay slug also works" : "overlay slug 404";
      console.log(
        `  [${r.id}] internal=${r.slug} overlayFromName=${r.overlaySlugFromName} (${ok})`,
      );
    }
    console.log();
  }

  console.log("Sample GSI class → parser displayName → overlay fallback slug:");
  const samples = ["antimage", "queenofpain", "furion", "nevermore", "zuus"];
  for (const cls of samples) {
    const hero = results.find((r) => r.slug === cls);
    const disp = displayNameFromHeroClass(cls);
    const ov = slugFromHeroNameDisplay(disp);
    console.log(
      `  class=${cls} → display="${disp}" → overlay slug="${ov}"${hero ? ` (OpenDota: ${hero.localized})` : ""}`,
    );
  }

  if (fs.existsSync(rendersDir)) {
    const onDisk = new Set(
      fs
        .readdirSync(rendersDir)
        .filter((f) => f.endsWith(".webm"))
        .map((f) => f.replace(/\.webm$/i, "")),
    );
    if (onDisk.size > 0) {
      const localMissing = results.filter((r) => !onDisk.has(r.slug));
      console.log(
        `\nLocal WebM pack (${onDisk.size} files in public/heroes/renders):`,
      );
      if (localMissing.length === 0) {
        console.log("  All OpenDota slugs have a local .webm.\n");
      } else {
        console.log(`  Missing local .webm (${localMissing.length}):`);
        for (const r of localMissing.slice(0, 15)) {
          console.log(`    [${r.id}] ${r.localized} → ${r.slug}.webm`);
        }
        if (localMissing.length > 15) {
          console.log(`    ... and ${localMissing.length - 15} more`);
        }
        console.log();
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
