# Hero WebM assets for the draft overlay

Pick cards play **animated hero WebMs**. For the full-body broadcast look, use **Steam CDN render WebMs** (downloaded locally or streamed as fallback).

## Two sources (do not mix them up)

| Script | Source | Framing | Use |
|--------|--------|---------|-----|
| **`heroes:download-cdn-webms`** (recommended) | Steam CDN `dota_react/heroes/renders/{slug}.webm` | Full hero render loop | Draft pick animation |
| **`heroes:copy-webms`** | Dota install `panorama/videos/heroes/` | Tight draft-hover bust (zoomed) | Legacy / offline only if you accept bust crop |

If you previously ran `heroes:copy-webms`, re-download with **`heroes:download-cdn-webms --force`** (or delete `public/heroes/renders/*.webm` first) so local files match CDN framing.

## Download full-body WebMs from Steam CDN (recommended)

From the repo root:

```bash
# Test a few heroes first
npm run heroes:download-cdn-webms -- --limit=5

# Full roster (large download, ~hundreds of MB)
npm run heroes:download-cdn-webms

# Refresh specific heroes
npm run heroes:download-cdn-webms -- --slug=invoker,magnataur --force
```

CDN URL pattern:

```
https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/{slug}.webm
```

Output:

```
apps/overlay-web/public/heroes/renders/
  magnataur.webm
  invoker.webm
  manifest.json   # source: "steam_cdn_renders"
```

Then verify and restart overlay:

```bash
npm run heroes:verify-webms
npm run dev:overlay
```

## Compress WebMs for OBS (~40% lower quality)

After CDN download, re-encode locally so pick cards decode faster. Same filenames and `manifest.json` — no overlay code changes.

**Requires [ffmpeg](https://ffmpeg.org/) on PATH.**

Windows install examples:

```bash
winget install ffmpeg
# or: choco install ffmpeg
```

From the repo root:

```bash
# Spot-check first
npm run heroes:reencode-webms -- --slug=nevermore,necrolyte --dry-run

# Full roster (overwrites files in public/heroes/renders/)
# Use --force when re-running on already-compressed files
npm run heroes:reencode-webms -- --force
```

Flags:

| Flag | Effect |
|------|--------|
| `--dry-run` | Print ffmpeg command per file; no writes |
| `--slug=a,b` | Re-encode only listed slugs |
| `--force` | Replace even if output would be larger |
| `--crf=N` | VP9 quality (default `48`; higher = smaller/softer; `42`/`37`/`34` = older passes) |

Encoding: VP9, max width 720px, no audio. Files are written to `{slug}.tmp.webm` then renamed over the original.

**Tradeoff:** Slightly softer edges on ~236px pick cards; much smaller files and lighter OBS decode load.

**Backup:** Copy `apps/overlay-web/public/heroes/renders/` before the first full re-encode (folder is gitignored).

```bash
npm run heroes:reencode-webms
npm run heroes:verify-webms
npm run dev:overlay
```

## Optional: copy from Dota install (panorama bust only)

Only if you need offline files without hitting Steam CDN during download. These are **not** the same clips as CDN renders.

Default path:

```
D:\SteamLibrary\steamapps\common\dota 2 beta\game\dota\panorama\videos\heroes\
```

```bash
npm run heroes:copy-webms
npm run heroes:copy-webms -- "D:/SteamLibrary/steamapps/common/dota 2 beta"
```

## Slug resolution (GSI vs WebM filenames)

Asset URLs use **internal slugs** (`magnataur`), not display labels (`Magnus`). Shared resolver: `packages/shared-types/src/hero-slug.ts`.

Debug GSI on broadcast-api:

```env
GSI_HERO_SLUG_DEBUG=1
```

## Runtime resolution

1. **Pick cards:** `/heroes/renders/{slug}.webm` when slug is in `manifest.json`, else Steam CDN WebM
2. **Poster while video loads:** local flat PNG when downloaded (`/heroes/portraits/{slug}.png`), else Steam CDN PNG (~60 KB)
3. **Ban tiles / intro / stats:** flat PNG (local preferred)

Download flat portraits:

```bash
npm run heroes:download-cdn-portraits -- --limit=5
npm run heroes:download-cdn-portraits
```

Output: `apps/overlay-web/public/heroes/portraits/` + `manifest.json`

The overlay pre-warms WebMs as heroes appear in draft slots (`hero-video-pool.ts`).

## Environment toggles

`apps/overlay-web/.env`:

```env
VITE_DRAFT_HERO_ANIMATED=false
```

## Git / repo size

`public/heroes/renders/*.webm` is gitignored. Only `manifest.json` and `.gitkeep` are tracked.

## After Dota patches

Re-run `npm run heroes:download-cdn-webms` and `npm run heroes:verify-webms` when heroes look wrong or missing.
