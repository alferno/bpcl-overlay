#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CDN_RENDER_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "apps/overlay-web/public/heroes/portraits");

const missingHeroes = [
  "dawnbreaker",
  "marci",
  "muerta",
  "primal_beast",
  "kez",
  "ringmaster"
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.part`;
    const file = fs.createWriteStream(tmp);

    const onResponse = (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
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

    https.get(url, { headers: { "User-Agent": "bpc-hero-download/1.0" } }, onResponse).on("error", reject);
  });
}

async function main() {
  for (const slug of missingHeroes) {
    const url = `${CDN_RENDER_BASE}/${slug}.png`;
    const dest = path.join(outDir, `${slug}.png`);
    try {
      await downloadFile(url, dest);
      const kb = (fs.statSync(dest).size / 1024).toFixed(1);
      console.log(`Downloaded missing hero: ${slug}.png (${kb} KB)`);
    } catch (e) {
      console.error(`Failed to download ${slug}: ${e.message}`);
    }
  }
}

main().catch(console.error);
