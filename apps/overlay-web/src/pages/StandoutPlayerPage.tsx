import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { withBaseUrl } from "../asset-paths";
import {
  resolveHeroPortraitSlug,
  heroPortraitHintsFromFields,
} from "../hero-portrait";
import {
  resolveOverlayHeroAnimatedUrl,
  loadHeroRenderManifest,
} from "../hero-render-manifest";
import type { StandoutPlayerCard } from "@bpc/shared-types";

// ─── Constants ────────────────────────────────────────────────────────────────

import { HERO_ABILITIES } from "../ability-constants";

const EMERALD = "#10b981";
const EMERALD_DARK = "#059669";
const EMERALD_GLOW = "rgba(16,185,129,0.25)";

/** Valve CDN base for ability icons */
const ABILITY_ICON_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities";

/** Valve CDN base for item icons */
const ITEM_ICON_BASE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items";

import { ITEM_ID_NAME } from "../item-constants";

function itemIconUrl(itemId: number): string | null {
  if (!itemId || itemId === 0) return null;
  const name = ITEM_ID_NAME[itemId];
  if (!name) return null;
  return `${ITEM_ICON_BASE}/${name}.png`;
}

function abilityIconUrl(heroSlug: string, index: number): string | null {
  const abilities = HERO_ABILITIES[heroSlug];
  if (!abilities || !abilities[index]) return null;
  return `${ABILITY_ICON_BASE}/${abilities[index]}.png`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  delay = 0,
}: {
  value: string;
  label: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center rounded-xl border backdrop-blur-md"
      style={{
        background:
          "linear-gradient(145deg, rgba(4,20,15,0.7) 0%, rgba(0,0,0,0.85) 100%)",
        borderColor: "rgba(16,185,129,0.25)",
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 20px rgba(16,185,129,0.05)`,
        padding: "14px 20px",
      }}
    >
      <span
        className="font-mono font-black leading-none"
        style={{
          fontSize: "2.4rem",
          color: "#ffffff",
          textShadow: `0 0 20px ${EMERALD}`,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span
        className="mt-1 font-bold uppercase tracking-widest"
        style={{ fontSize: "0.65rem", color: EMERALD, letterSpacing: "0.18em" }}
      >
        {label}
      </span>
    </motion.div>
  );
}

function ItemSlot({ itemId, size = 52 }: { itemId: number; size?: number }) {
  const url = itemIconUrl(itemId);
  return (
    <div
      className="overflow-hidden rounded"
      style={{
        width: size,
        height: Math.round(size * 0.74),
        background: "rgba(255,255,255,0.04)",
        border: url
          ? `1px solid rgba(16,185,129,0.4)`
          : "1px solid rgba(255,255,255,0.1)",
        boxShadow: url ? `0 0 8px ${EMERALD_GLOW}` : "none",
        flexShrink: 0,
      }}
    >
      {url && (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => (e.currentTarget.style.opacity = "0")}
        />
      )}
    </div>
  );
}

function CombinedUpgradeBadge({
  hasScepter,
  hasShard,
}: {
  hasScepter: boolean;
  hasShard: boolean;
}) {
  let imgName = "none.png";
  if (hasScepter && hasShard) imgName = "shard-aghanim.png";
  else if (hasScepter) imgName = "aghanim.png";
  else if (hasShard) imgName = "shard.png";
  const active = hasScepter || hasShard;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative overflow-hidden rounded-lg"
        style={{
          width: 96,
          height: 46,
          border: active
            ? `2px solid ${EMERALD}`
            : "2px solid rgba(255,255,255,0.1)",
          boxShadow: active ? `0 0 16px ${EMERALD_GLOW}` : "none",
          filter: active ? "none" : "grayscale(1) brightness(0.3)",
          background: "rgba(0,0,0,0.6)",
        }}
      >
        <img src={withBaseUrl(`/${imgName}`)} alt="Upgrades" className="h-full w-full object-contain" />
      </div>
      <span
        className="font-bold uppercase tracking-wider"
        style={{
          fontSize: "0.46rem",
          color: active ? EMERALD : "rgba(255,255,255,0.2)",
          letterSpacing: "0.12em",
        }}
      >
        UPGRADES
      </span>
    </div>
  );
}

function HeroVideo({
  slug,
  portraitUrl,
}: {
  slug: string | undefined;
  portraitUrl: string | undefined;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webmUrl, setWebmUrl] = useState<string | undefined>(undefined);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setVideoError(false);
    loadHeroRenderManifest().then(() => {
      const url = resolveOverlayHeroAnimatedUrl(slug);
      setWebmUrl(url);
    });
  }, [slug]);

  useEffect(() => {
    if (videoRef.current && webmUrl) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [webmUrl]);

  if (webmUrl && !videoError) {
    return (
      <video
        key={webmUrl}
        ref={videoRef}
        src={webmUrl}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setVideoError(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center bottom",
        }}
      />
    );
  }

  if (portraitUrl) {
    return (
      <img
        src={portraitUrl}
        alt=""
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "center bottom",
        }}
      />
    );
  }

  return null;
}

function SkillIconsRow({ heroSlug }: { heroSlug: string | undefined }) {
  const [errors, setErrors] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setErrors({});
  }, [heroSlug]);

  if (!heroSlug) return null;

  // Render up to 6 slots; any that 404 hide themselves
  const slots = [0, 1, 2, 3, 4, 5];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {slots.map((i) => {
        const url = abilityIconUrl(heroSlug, i);
        if (errors[i] || !url) return null;
        return (
          <div
            key={i}
            className="overflow-hidden rounded-lg"
            style={{
              width: 46,
              height: 46,
              border: `1px solid rgba(16,185,129,0.35)`,
              boxShadow: `0 0 8px ${EMERALD_GLOW}`,
              background: "rgba(0,0,0,0.5)",
            }}
          >
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setErrors((p) => ({ ...p, [i]: true }))}
            />
          </div>
        )
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function killParticipation(card: StandoutPlayerCard): string {
  if (!card.teamKills || card.teamKills === 0) return "—";
  const pct = ((card.kills + card.assists) / card.teamKills) * 100;
  return `${Math.min(100, pct).toFixed(2)}%`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StandoutPlayerPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("standoutplayer", state);
  const card = state.standoutPlayerCard;

  const heroSlug = card
    ? resolveHeroPortraitSlug(
        card.heroId,
        card.heroName,
        heroPortraitHintsFromFields(card),
      )
    : undefined;

  let portraitUrl =
    card?.heroPortraitUrl ??
    (heroSlug ? `/heroes/portraits/${heroSlug}.png` : undefined);
  if (portraitUrl && !portraitUrl.startsWith("http")) {
    portraitUrl = withBaseUrl(portraitUrl);
  }

  const items = card?.items ?? Array(10).fill(0);
  const mainItems = items.slice(0, 6);
  const neutralItem = items[6] ?? 0;
  const backpackItems = items.slice(7, 10);

  const EASE = [0.16, 1, 0.3, 1] as const;

  return (
    <HudCanvas>
      <FadePanel
        show={visible}
        panelKey={`standout-${card?.steam32 ?? card?.heroId ?? "empty"}`}
      >
        {/* ── Background ───────────────────────────────────────────────── */}
        <div className="absolute inset-0 bg-slate-950 pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 65% 50% at 50% 50%, rgba(5,150,105,0.15) 0%, transparent 70%)",
          }}
        />
        <motion.img
          src={withBaseUrl("/emerald-trophy.png")}
          alt=""
          className="absolute inset-0 w-full h-full pointer-events-none select-none mix-blend-screen"
          style={{
            objectFit: "cover",
            opacity: 0.15,
            filter: `drop-shadow(0 0 40px ${EMERALD})`,
          }}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 0.15, scale: 1 }}
          transition={{ duration: 1, delay: 0.1 }}
        />

        {card ? (
          <>
            {/* ── HEADER ───────────────────────────────────────────────── */}
            <motion.div
              className="absolute top-0 inset-x-0 flex flex-col items-center pt-9"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <h1
                className="font-black uppercase"
                style={{
                  fontSize: "3.4rem",
                  color: "#ffffff",
                  letterSpacing: "0.22em",
                  textShadow: `0 0 40px ${EMERALD}, 0 2px 4px rgba(0,0,0,0.9)`,
                }}
              >
                STANDOUT PLAYER
              </h1>
              <p
                className="font-bold uppercase"
                style={{
                  fontSize: "0.82rem",
                  color: EMERALD,
                  letterSpacing: "0.4em",
                  marginTop: 3,
                }}
              >
                LAST MATCH
              </p>
              <div
                className="mt-4 rounded-full"
                style={{
                  width: 520,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${EMERALD}, transparent)`,
                  boxShadow: `0 0 12px ${EMERALD}`,
                }}
              />
            </motion.div>


            {/* ── 3-COLUMN MAIN LAYOUT ─────────────────────────────────── */}
            <div
              className="absolute inset-x-0 flex items-start justify-center gap-6 px-10"
              style={{ top: 182, bottom: 36 }}
            >
              {/* ═══════════════════════════════════════════ LEFT COLUMN */}
              <motion.div
                className="flex flex-col gap-4"
                style={{ width: 280, flexShrink: 0 }}
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
              >
                <StatTile value={fmt(card.xpm)} label="XPM" delay={0.25} />
                <StatTile value={fmt(card.gpm)} label="GPM" delay={0.32} />
                <StatTile
                  value={fmt(card.networth)}
                  label="Total Networth"
                  delay={0.39}
                />
                {/* Skill icons */}
                <motion.div
                  className="mt-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.55 }}
                >
                  <SkillIconsRow heroSlug={heroSlug} />
                </motion.div>
              </motion.div>

              {/* ═══════════════════════════════════════════ CENTER COLUMN */}
              <motion.div
                className="flex flex-col items-center flex-1"
                style={{ maxWidth: 380 }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.1, ease: EASE }}
              >
                {/* Player name */}
                <div
                  className="w-full flex items-center justify-center rounded-xl mb-3 backdrop-blur-lg"
                  style={{
                    height: 52,
                    background:
                      "linear-gradient(135deg, rgba(4,20,15,0.8), rgba(0,0,0,0.9))",
                    border: `1px solid rgba(16,185,129,0.3)`,
                    boxShadow: `0 8px 32px rgba(0,0,0,0.6), inset 0 0 15px rgba(16,185,129,0.1)`,
                  }}
                >
                  <span
                    className="font-black uppercase tracking-wider text-white truncate px-4"
                    style={{
                      fontSize: "1.45rem",
                      textShadow: `0 0 18px ${EMERALD}`,
                    }}
                  >
                    {card.playerLabel}
                  </span>
                </div>

                {/* Hero WebM */}
                <div
                  className="relative w-full overflow-hidden rounded-xl backdrop-blur-md"
                  style={{
                    height: 470,
                    background:
                      "linear-gradient(180deg, rgba(4,18,12,0.6) 0%, rgba(0,0,0,0.85) 100%)",
                    border: `1px solid rgba(16,185,129,0.2)`,
                    boxShadow: `0 12px 40px rgba(0,0,0,0.8), inset 0 0 60px rgba(0,0,0,0.6)`,
                  }}
                >
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "radial-gradient(ellipse 80% 55% at 50% 85%, rgba(16,185,129,0.16) 0%, transparent 70%)",
                    }}
                  />
                  <div className="absolute inset-0 flex items-end justify-center">
                    <HeroVideo slug={heroSlug} portraitUrl={portraitUrl} />
                  </div>
                </div>

                {/* KDA */}
                <div className="mt-3 flex flex-col items-center">
                  <span
                    className="font-bold uppercase"
                    style={{
                      fontSize: "0.68rem",
                      color: EMERALD,
                      letterSpacing: "0.26em",
                    }}
                  >
                    KDA
                  </span>
                  <span
                    className="font-black"
                    style={{
                      fontSize: "1.95rem",
                      color: "#fff",
                      letterSpacing: "0.05em",
                      textShadow: `0 0 18px ${EMERALD}`,
                    }}
                  >
                    {card.kills}/{card.deaths}/{card.assists}
                  </span>
                </div>
              </motion.div>

              {/* ═══════════════════════════════════════════ RIGHT COLUMN */}
              <motion.div
                className="flex flex-col gap-4"
                style={{ width: 340, flexShrink: 0 }}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
              >
                <StatTile
                  value={fmt(card.heroDamage)}
                  label="Hero Damage"
                  delay={0.25}
                />
                <StatTile
                  value={fmt(card.lastHits)}
                  label="Last Hits"
                  delay={0.32}
                />
                <StatTile
                  value={killParticipation(card)}
                  label="Kill Participation"
                  delay={0.39}
                />

                {/* ── Aghs + inventory row ─────────────────────────────── */}
                <motion.div
                  className="mt-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.55 }}
                >
                  <div className="flex items-start gap-2.5 flex-wrap">
                    {/* Scepter + Shard */}
                    <div className="flex items-center">
                      <CombinedUpgradeBadge
                        hasScepter={card.hasScepter ?? false}
                        hasShard={card.hasShard ?? false}
                      />
                    </div>

                    {/* Main inventory: 2 rows of 3 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        {mainItems.slice(0, 3).map((id, i) => (
                          <ItemSlot key={i} itemId={id} size={50} />
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        {mainItems.slice(3, 6).map((id, i) => (
                          <ItemSlot key={i + 3} itemId={id} size={50} />
                        ))}
                      </div>
                    </div>

                    {/* Neutral item — circular */}
                    <div className="flex flex-col items-center gap-1">
                      <div
                        className="overflow-hidden"
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          border: neutralItem
                            ? `2px solid ${EMERALD_DARK}`
                            : "2px solid rgba(255,255,255,0.1)",
                          boxShadow: neutralItem
                            ? `0 0 12px ${EMERALD_GLOW}`
                            : "none",
                          background: "rgba(0,0,0,0.5)",
                        }}
                      >
                        {neutralItem
                          ? (() => {
                              const nu = itemIconUrl(neutralItem);
                              return nu ? (
                                <img
                                  src={nu}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : null;
                            })()
                          : null}
                      </div>
                      <span
                        className="font-bold uppercase text-center"
                        style={{
                          fontSize: "0.42rem",
                          color: "rgba(16,185,129,0.5)",
                          letterSpacing: "0.1em",
                        }}
                      >
                        NEUTRAL
                      </span>
                    </div>

                    {/* Backpack: 3 smaller slots stacked */}
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex flex-col gap-1.5">
                        {backpackItems.map((id, i) => (
                          <div
                            key={i}
                            className="overflow-hidden rounded"
                            style={{
                              width: 42,
                              height: 30,
                              border: id
                                ? `1px solid rgba(16,185,129,0.3)`
                                : "1px dashed rgba(255,255,255,0.1)",
                              background: "rgba(0,0,0,0.4)",
                            }}
                          >
                            {id
                              ? (() => {
                                  const bu = itemIconUrl(id);
                                  return bu ? (
                                    <img
                                      src={bu}
                                      alt=""
                                      className="h-full w-full object-cover"
                                    />
                                  ) : null;
                                })()
                              : null}
                          </div>
                        ))}
                      </div>
                      <span
                        className="font-bold uppercase text-center"
                        style={{
                          fontSize: "0.42rem",
                          color: "rgba(16,185,129,0.5)",
                          letterSpacing: "0.1em",
                        }}
                      >
                        BACKPACK
                      </span>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            </div>

            {/* ── Bottom accent line ────────────────────────────────────── */}
            <div
              className="absolute bottom-0 inset-x-0"
              style={{
                height: 3,
                background: `linear-gradient(90deg, transparent 0%, ${EMERALD} 25%, ${EMERALD} 75%, transparent 100%)`,
                boxShadow: `0 0 18px ${EMERALD}`,
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="font-bold uppercase tracking-widest"
              style={{ fontSize: "1.5rem", color: "rgba(16,185,129,0.3)" }}
            >
              Awaiting standout player data…
            </span>
          </div>
        )}
      </FadePanel>
    </HudCanvas>
  );
}
