import { useEffect, useState } from "react";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { withBaseUrl } from "../asset-paths";
import {
  ensureOverlayHeroIndex,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import { leagueTitleFromSlug } from "@bpc/shared-types";

// ── Mini Hero Portrait ────────────────────────────────────────────────────────

function MiniHeroPortrait({
  heroId,
  heroClass,
  portraitUrl: initialPortraitUrl,
  kills,
}: {
  heroId: number;
  heroClass: string;
  portraitUrl?: string;
  kills: number;
}) {
  const [portraitUrl, setPortraitUrl] = useState<string | undefined>(
    () => initialPortraitUrl || resolveOverlayPortraitForHero(heroId, undefined, {}),
  );

  useEffect(() => {
    const resolve = () => resolveOverlayPortraitForHero(heroId, undefined, {});
    const url = resolve();
    if (url) setPortraitUrl(url);
    else void ensureOverlayHeroIndex().then(() => {
      const u2 = resolve();
      if (u2) setPortraitUrl(u2);
    });
  }, [heroId]);

  const hasKills = kills > 0;

  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative flex-shrink-0" style={{ width: 30, height: 30 }}>
      {/* Hero portrait circle */}
      <div
        className="w-full h-full rounded-sm overflow-hidden border"
        style={{
          borderColor: hasKills ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.15)",
          boxShadow: hasKills
            ? "0 0 6px rgba(239,68,68,0.5)"
            : "0 2px 6px rgba(0,0,0,0.6)",
          filter: hasKills ? "none" : "grayscale(40%) brightness(0.65)",
        }}
      >
        {portraitUrl && !imgError ? (
          <img
            src={withBaseUrl(portraitUrl)}
            alt=""
            className="w-full h-full object-cover object-top"
            style={{ transform: "scale(1.15) translateY(4px)" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-slate-800" />
        )}
      </div>

      {/* Kill count badge */}
      <div
        className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full font-bold"
        style={{
          width: 14,
          height: 14,
          fontSize: 8,
          lineHeight: 1,
          background: hasKills
            ? "linear-gradient(135deg, #ef4444, #b91c1c)"
            : "rgba(15,23,42,0.95)",
          color: hasKills ? "#fff" : "rgba(148,163,184,0.8)",
          border: hasKills ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.1)",
          boxShadow: hasKills ? "0 0 4px rgba(239,68,68,0.4)" : "none",
        }}
      >
        {kills}
      </div>
    </div>
  );
}

// ── Focused Hero Portrait ─────────────────────────────────────────────────────

function FocusedHeroPortrait({ heroId, heroName, portraitUrl: initialPortraitUrl }: {
  heroId: number;
  heroName?: string;
  portraitUrl?: string;
}) {
  const [portraitUrl, setPortraitUrl] = useState<string | undefined>(
    () => initialPortraitUrl || resolveOverlayPortraitForHero(heroId, heroName, {}),
  );

  useEffect(() => {
    const resolve = () => resolveOverlayPortraitForHero(heroId, heroName, {});
    const url = resolve();
    if (url) setPortraitUrl(url);
    else void ensureOverlayHeroIndex().then(() => {
      const u2 = resolve();
      if (u2) setPortraitUrl(u2);
    });
  }, [heroId, heroName]);

  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 46,
        height: 46,
        borderRadius: 4,
        border: "1px solid rgba(251,191,36,0.4)",
        boxShadow: "0 0 12px rgba(0,0,0,0.8), inset 0 0 8px rgba(0,0,0,0.5)",
      }}
    >
      {portraitUrl && !imgError ? (
        <img
          src={withBaseUrl(portraitUrl)}
          alt=""
          className="w-full h-full object-cover object-top"
          style={{ transform: "scale(1.15) translateY(4px)" }}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full bg-slate-800" />
      )}
      {/* Subtle bottom gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 50%)",
        }}
      />
    </div>
  );
}

// ── Stat Label + Value ────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-[3px]">
      <span
        style={{
          fontSize: 8,
          lineHeight: 1,
          color: "rgba(148,163,184,0.8)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          fontWeight: 600,
          minWidth: 18,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          lineHeight: 1,
          fontWeight: 700,
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          color: accent ? "#fbbf24" : "#f1f5f9",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LiveStatsHud() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("kdaCard", state);
  const card = state.livePlayerCard;

  if (!visible || !card) return null;

  const leagueTitle = leagueTitleFromSlug(state.leagueConfig?.seasonSlug);
  const stageLabel = state.leagueConfig?.matchSetup?.stageLabel;

  const kills = card.liveKills ?? 0;
  const deaths = card.liveDeaths ?? 0;
  const assists = card.liveAssists ?? 0;
  const lastHits = card.liveLastHits ?? 0;
  const denies = card.liveDenies ?? 0;

  const enemyKills = card.enemyHeroKills ?? [];

  const layout = state.production?.layoutConfig?.kdaCard;
  const top = layout?.y ?? 8;
  const left = layout?.x ?? 16;
  const scale = layout?.scale ?? 1;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top,
        left,
        width: 260,
        zIndex: 50,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        // Entrance animation
        animation: "hudSlideIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
      }}
    >
      {/* ── Banner Row ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgb(10,14,26) 0%, rgb(16,20,38) 100%)",
          borderRadius: "6px 6px 0 0",
          borderBottom: "1px solid rgba(251,191,36,0.25)",
          border: "1px solid rgba(251,191,36,0.2)",
          padding: "4px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.7)",
        }}
      >
        {/* League title */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontFamily: "'Bebas Neue', 'Arial Narrow', sans-serif",
            background: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 60%, #fcd34d 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1.1,
          }}
        >
          {leagueTitle}
        </div>

        {/* Stage label (optional) */}
        {stageLabel && (
          <div
            style={{
              fontSize: 8,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(148,163,184,0.7)",
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              lineHeight: 1,
            }}
          >
            {stageLabel}
          </div>
        )}
      </div>

      {/* ── Stats + Hero Row ─────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgb(8,12,22) 0%, rgb(12,16,30) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderTop: "none",
          borderRadius: enemyKills.length > 0 ? 0 : "0 0 6px 6px",
          padding: "5px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        {/* Hero portrait */}
        <FocusedHeroPortrait
          heroId={card.heroId}
          heroName={card.heroName}
          portraitUrl={card.heroPortraitUrl}
        />

        {/* Stats block */}
        <div className="flex flex-col gap-[5px] flex-1 min-w-0">
          {/* KDA row */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 0,
            }}
          >
            <span style={{ fontSize: 8, color: "rgba(148,163,184,0.7)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, marginRight: 4 }}>K/D/A</span>
            <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", color: "#f1f5f9", lineHeight: 1 }}>
              {kills}
            </span>
            <span style={{ fontSize: 11, color: "rgba(100,116,139,0.8)", margin: "0 1px", lineHeight: 1 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", color: "#f87171", lineHeight: 1 }}>
              {deaths}
            </span>
            <span style={{ fontSize: 11, color: "rgba(100,116,139,0.8)", margin: "0 1px", lineHeight: 1 }}>/</span>
            <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", color: "#f1f5f9", lineHeight: 1 }}>
              {assists}
            </span>
          </div>

          {/* LH / DN row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 8, color: "rgba(148,163,184,0.6)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>LH</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", color: "#94a3b8", lineHeight: 1 }}>{lastHits}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ fontSize: 8, color: "rgba(148,163,184,0.6)", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>DN</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Rajdhani', 'Segoe UI', sans-serif", color: "#64748b", lineHeight: 1 }}>{denies}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Enemy Kill Tracker Row ──────────────────────────────────── */}
      {enemyKills.length > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, rgb(6,9,20) 0%, rgb(10,13,28) 100%)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            borderRadius: "0 0 6px 6px",
            padding: "4px 10px",
            display: "flex",
            alignItems: "center",
            gap: 5,
            backdropFilter: "blur(12px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.7)",
          }}
        >
          {/* VS label */}
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "rgba(100,116,139,0.6)",
              textTransform: "uppercase",
              fontFamily: "'Rajdhani', sans-serif",
              marginRight: 2,
            }}
          >
            vs
          </span>

          {/* Enemy hero icons with kill badges */}
          {enemyKills.map((e, idx) => (
            <MiniHeroPortrait
              key={e.heroId > 0 ? e.heroId : `unknown-${idx}`}
              heroId={e.heroId}
              heroClass={e.heroClass}
              portraitUrl={e.heroPortraitUrl}
              kills={e.kills}
            />
          ))}
        </div>
      )}

      {/* Subtle left accent bar */}
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: 2,
          height: "100%",
          borderRadius: "6px 0 0 6px",
          background: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 50%, rgba(251,191,36,0.2) 100%)",
          boxShadow: "0 0 8px rgba(251,191,36,0.4)",
        }}
      />
    </div>
  );
}
