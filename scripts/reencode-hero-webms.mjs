#!/usr/bin/env node
/**
 * Re-encode local hero render WebMs for smaller files (VP9 CRF ~37 ≈ ~20% smaller than CRF 34 pass).
 *
 * Usage:
 *   npm run heroes:reencode-webms
 *   npm run heroes:reencode-webms -- --dry-run
 *   npm run heroes:reencode-webms -- --slug=nevermore,necrolyte
 *   npm run heroes:reencode-webms -- --force
 *   npm run heroes:reencode-webms -- --crf=36
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendersDir = path.join(root, "apps/overlay-web/public/heroes/renders");

/** VP9 CRF — 48 ≈ one-pass ~40% smaller vs CRF-37 encodes (two-pass 42→47 also works). */
const DEFAULT_CRF = 48;
const MAX_WIDTH = 720;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const crfArg = args.find((a) => a.startsWith("--crf="));
const crf = crfArg ? Number(crfArg.split("=")[1]) : DEFAULT_CRF;
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

function ffmpegAvailable() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

function listWebms() {
  if (!fs.existsSync(rendersDir)) return [];
  return fs
    .readdirSync(rendersDir)
    .filter((f) => f.endsWith(".webm") && !f.includes(".tmp."))
    .map((f) => ({
      slug: f.replace(/\.webm$/i, ""),
      file: path.join(rendersDir, f),
    }))
    .filter(({ slug }) => !slugFilter || slugFilter.has(slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function ffmpegArgs(input, output) {
  return [
    "-y",
    "-i",
    input,
    "-an",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    String(crf),
    "-b:v",
    "0",
    "-vf",
    `scale=${MAX_WIDTH}:-2`,
    "-deadline",
    "good",
    "-cpu-used",
    "2",
    output,
  ];
}

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ffmpegArgs(input, output), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr?.on("data", (d) => {
      stderr += d;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
    });
  });
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function reencodeOne({ slug, file }) {
  // ffmpeg 8+ needs a .webm extension (not .webm.tmp) to pick the muxer
  const tmp = path.join(rendersDir, `${slug}.tmp.webm`);
  const before = fs.statSync(file).size;

  if (dryRun) {
    console.log(`  DRY  ${slug}.webm (${formatMb(before)} MB)`);
    console.log(`       ffmpeg ${ffmpegArgs(file, tmp).join(" ")}`);
    return { status: "dry", slug, before, after: before };
  }

  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    await runFfmpeg(file, tmp);
    const after = fs.statSync(tmp).size;

    if (!force && after >= before) {
      fs.unlinkSync(tmp);
      console.log(
        `  SKIP ${slug}.webm (output ${formatMb(after)} MB >= ${formatMb(before)} MB; use --force)`,
      );
      return { status: "skip", slug, before, after: before };
    }

    fs.renameSync(tmp, file);
    const ratio = after / before;
    console.log(
      `  OK   ${slug}.webm ${formatMb(before)} → ${formatMb(after)} MB (${(ratio * 100).toFixed(0)}%)`,
    );
    return { status: "ok", slug, before, after };
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    console.log(`  FAIL ${slug}.webm: ${e.message || e}`);
    return { status: "fail", slug, before, after: before };
  }
}

async function main() {
  if (!ffmpegAvailable()) {
    console.error(
      "ffmpeg not found on PATH. Install ffmpeg and retry (Windows: winget install ffmpeg).",
    );
    process.exit(1);
  }

  if (!Number.isFinite(crf) || crf < 0 || crf > 63) {
    console.error(`Invalid --crf=${crf}`);
    process.exit(1);
  }

  const items = listWebms();
  if (!items.length) {
    console.error(`No .webm files in ${rendersDir}`);
    console.error("Run: npm run heroes:download-cdn-webms");
    process.exit(1);
  }

  console.log(`Re-encoding ${items.length} WebM(s) in ${rendersDir}`);
  console.log(`Profile: vp9 CRF ${crf}, max width ${MAX_WIDTH}px${dryRun ? " (dry-run)" : ""}\n`);

  let totalBefore = 0;
  let totalAfter = 0;
  const counts = { ok: 0, skip: 0, fail: 0, dry: 0 };

  for (const item of items) {
    const r = await reencodeOne(item);
    totalBefore += r.before;
    totalAfter += r.after;
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  console.log("\n--- Summary ---");
  console.log(`Total: ${formatMb(totalBefore)} MB → ${formatMb(totalAfter)} MB`);
  if (totalBefore > 0 && !dryRun) {
    console.log(
      `Ratio: ${((totalAfter / totalBefore) * 100).toFixed(1)}% of input size (CRF ${crf})`,
    );
  }
  console.log(`OK: ${counts.ok ?? 0}, skipped: ${counts.skip ?? 0}, failed: ${counts.fail ?? 0}`);
  if (dryRun) {
    console.log("(dry-run — no files changed)");
    return;
  }
  console.log("\nRestart overlay / OBS browser source to reload WebMs.");
  if ((counts.fail ?? 0) > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
