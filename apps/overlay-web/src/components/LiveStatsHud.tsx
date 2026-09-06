import { useState, useEffect } from "react";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { withBaseUrl } from "../asset-paths";

import {
  ensureOverlayHeroIndex,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import { leagueTitleFromSlug } from "@bpc/shared-types";
import { resolveBroadcastTheme } from "../draft/theme-colors";

function MiniHeroPortrait({
  heroId,
  portraitUrl: initialPortraitUrl,
}: {
  heroId: number;
  portraitUrl?: string;
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

  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: 24,
        height: 24,
        borderRadius: 2,
        boxShadow: "0 1px 4px rgba(0,0,0,0.8)",
      }}
    >
      {portraitUrl && !imgError ? (
        <img
          src={withBaseUrl(portraitUrl)}
          alt=""
          className="w-full h-full object-cover object-center scale-[1.15]"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full bg-slate-800" />
      )}
    </div>
  );
}

function FocusedHeroPortrait({ heroId, heroName, portraitUrl: initialPortraitUrl, themeColor }: {
  heroId: number;
  heroName?: string;
  portraitUrl?: string;
  themeColor: string;
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
        width: 72,
        borderRadius: 2,
        border: `1px solid ${themeColor}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.8)",
      }}
    >
      {portraitUrl && !imgError ? (
        <img
          src={withBaseUrl(portraitUrl)}
          alt=""
          className="w-full h-full object-cover object-center scale-[1.15]"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full bg-slate-800" />
      )}
    </div>
  );
}

export function LiveStatsHud() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("kdaCard", state);
  const card = state.livePlayerCard;

  if (!visible || !card) return null;

  const rawLeagueTitle = state.leagueConfig?.seasonSlug ? leagueTitleFromSlug(state.leagueConfig.seasonSlug) : "";
  const leagueTitle = `BPC LEAGUE ${rawLeagueTitle}`;
  const stageLabel = state.leagueConfig?.matchSetup?.stageLabel;

  const kills = card.liveKills ?? 0;
  const deaths = card.liveDeaths ?? 0;
  const assists = card.liveAssists ?? 0;
  const lastHits = card.liveLastHits ?? 0;
  const denies = card.liveDenies ?? 0;

  const enemyKills = card.enemyHeroKills ?? [];

  const layout = state.production?.layoutConfig?.kdaCard;
  // If the user hasn't explicitly moved it (x=1, y=1), leave 2px margin top and left
  const top = (layout?.y === 1 ? 2 : layout?.y) ?? 2;
  const left = (layout?.x === 1 ? 2 : layout?.x) ?? 2;
  const scale = layout?.scale ?? 1;

  const theme = resolveBroadcastTheme(state.production);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        top,
        left,
        width: 380,
        zIndex: 50,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        animation: "hudSlideIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards",
        filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.8))",
      }}
    >
      {/* ── Banner Row ── */}
      <div
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${theme.primary} 15%, #050505) 0%, color-mix(in srgb, ${theme.primary} 5%, #050505) 60%, transparent 100%)`,
          padding: "4px 12px",
          display: "flex",
          alignItems: "center",
          borderTop: "2px solid transparent",
          borderImageSource: `linear-gradient(90deg, color-mix(in srgb, ${theme.primary} 80%, white) 0%, color-mix(in srgb, ${theme.primary} 80%, white) 60%, transparent 100%)`,
          borderImageSlice: "1",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: "'Segoe UI', sans-serif",
            color: theme.accent,
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
            lineHeight: 1.1,
          }}
        >
          {leagueTitle.toUpperCase()}{stageLabel ? ` - ${stageLabel.toUpperCase()}` : ""}
        </div>
      </div>

      {/* ── Main Block ── */}
      <div
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, ${theme.primary} 8%, #030303) 0%, color-mix(in srgb, ${theme.primary} 2%, #030303) 60%, transparent 100%)`,
          padding: "6px 12px",
          display: "flex",
          alignItems: "stretch",
          gap: 12,
        }}
      >
        {/* Left: Hero Portrait */}
        <FocusedHeroPortrait
          heroId={card.heroId}
          heroName={card.heroName}
          portraitUrl={card.heroPortraitUrl}
          themeColor={`color-mix(in srgb, ${theme.primary} 60%, white)`}
        />

        {/* Right: Stats and Enemy Kills */}
        <div className="flex flex-col gap-1 mt-[1px]">
          {/* Row 1: KDA */}
          <div className="flex items-center">
            <span style={{ 
              width: 68, 
              fontSize: 11, 
              color: theme.primary, 
              fontWeight: 800, 
              letterSpacing: "0.1em",
              fontFamily: "'Segoe UI', sans-serif",
              textShadow: "1px 1px 2px #000",
              whiteSpace: "nowrap"
            }}>
              K / D / A
            </span>
            <span style={{ 
              fontSize: 13, 
              color: "#ffffff", 
              fontWeight: 800, 
              letterSpacing: "0.15em",
              fontFamily: "'Segoe UI', sans-serif",
              textShadow: "1px 1px 2px #000"
            }}>
              {kills} / {deaths} / {assists}
            </span>
          </div>

          {/* Row 2: LH / DN */}
          <div className="flex items-center">
            <span style={{ 
              width: 68, 
              fontSize: 11, 
              color: theme.primary, 
              fontWeight: 800, 
              letterSpacing: "0.1em",
              fontFamily: "'Segoe UI', sans-serif",
              textShadow: "1px 1px 2px #000",
              whiteSpace: "nowrap"
            }}>
              LH / DN
            </span>
            <span style={{ 
              fontSize: 13, 
              color: "#ffffff", 
              fontWeight: 800, 
              letterSpacing: "0.15em",
              fontFamily: "'Segoe UI', sans-serif",
              textShadow: "1px 1px 2px #000"
            }}>
              {lastHits} / {denies}
            </span>
          </div>

          {/* Row 3: Enemy Kills inline */}
          {enemyKills.length > 0 && (
            <div className="flex items-center gap-3 mt-1">
              {enemyKills.map((e, idx) => (
                <div key={e.heroId > 0 ? e.heroId : `unknown-${idx}`} className="flex items-center gap-[4px]">
                  <MiniHeroPortrait
                    heroId={e.heroId}
                    portraitUrl={e.heroPortraitUrl}
                  />
                  <span style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#ffffff",
                    fontFamily: "'Segoe UI', sans-serif",
                    textShadow: "1px 1px 2px #000"
                  }}>
                    {e.kills}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
