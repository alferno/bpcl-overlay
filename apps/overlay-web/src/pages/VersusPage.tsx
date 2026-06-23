import { useState, useEffect } from "react";
import type { RosterPlayer } from "@bpc/shared-types";
import { withBaseUrl } from "../asset-paths";
import { motion } from "framer-motion";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { colorAlpha } from "../draft/team-colors";
import { resolveSlotFlatPortraitUrl, resolveSlotSlug } from "../hero-portrait";

function formatHeroName(slug: string | undefined): string {
  if (!slug) return "";
  return slug
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function FallbackPlayerAvatar({
  player,
  color,
  logoPath,
}: {
  player: RosterPlayer;
  color: string;
  logoPath: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900">
      {/* Background logo */}
      <img
        src={logoPath}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-20 mix-blend-overlay blur-sm"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      {/* Player steam avatar if available */}
      {player.avatarUrl ? (
        <img
          src={player.avatarUrl}
          alt=""
          className="relative z-10 mb-4 h-28 w-28 rounded-full border-4 shadow-xl"
          style={{ borderColor: color, boxShadow: `0 0 20px ${colorAlpha(color, 0.4)}` }}
        />
      ) : (
        <div
          className="relative z-10 mb-4 flex h-28 w-28 items-center justify-center rounded-full border-4 bg-slate-800 shadow-xl"
          style={{ borderColor: color, boxShadow: `0 0 20px ${colorAlpha(color, 0.4)}` }}
        >
          <span className="text-3xl font-black text-white">?</span>
        </div>
      )}
      <div className="relative z-10 text-center">
        <span
          className="block font-display text-2xl font-black uppercase tracking-wider text-white"
          style={{ textShadow: `0 2px 10px ${color}` }}
        >
          {player.displayName}
        </span>
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  color,
  logoPath,
  pos,
  index,
  isDire,
  flipToHero,
  heroInfo,
}: {
  player: RosterPlayer;
  color: string;
  logoPath: string;
  pos: number;
  index: number;
  isDire: boolean;
  flipToHero: boolean;
  heroInfo?: any;
}) {
  const cardUrl = withBaseUrl(`/cards/${player.steam32}.png`)!;
  const [imageError, setImageError] = useState(false);

  useEffect(() => setImageError(false), [player.steam32]);

  return (
    <motion.div
      className="group relative h-[360px] w-[240px]"
      style={{ perspective: 1000 }}
      initial={{ opacity: 0, y: 50, x: isDire ? 50 : -50 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: 0.6, delay: 0.6 + index * 0.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="relative h-full w-full rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all hover:scale-[1.05] hover:z-50 hover:-translate-y-2"
        style={{ transformStyle: "preserve-3d", borderBottom: `4px solid ${color}` }}
        animate={{ rotateY: flipToHero && heroInfo ? 180 : 0 }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.3, delay: index * 0.15 }}
      >
        {/* FRONT FACE (Player Card) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl bg-slate-900"
          style={{ backfaceVisibility: "hidden", boxShadow: `0 10px 40px -10px ${colorAlpha(color, 0.4)}` }}
        >
          {!imageError ? (
            <img
              src={cardUrl}
              alt={player.displayName}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
          ) : (
            <FallbackPlayerAvatar player={player} color={color} logoPath={logoPath} />
          )}
          {/* Shine effect */}
          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
          </div>
        </div>

        {/* BACK FACE (Hero Portrait) */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl bg-slate-900"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", boxShadow: `0 10px 40px -10px ${colorAlpha(color, 0.4)}` }}
        >
          {heroInfo && resolveSlotFlatPortraitUrl(heroInfo) && (
            <img src={resolveSlotFlatPortraitUrl(heroInfo)} alt="Hero" className="h-full w-full object-cover object-top" />
          )}
          <div
            className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
            style={{ backgroundColor: color }}
          />
          <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/70 to-transparent p-5 pt-20 text-center">
            <span
              className="truncate font-display text-2xl font-black uppercase tracking-wide text-white"
              style={{ textShadow: `0 0 12px ${color}` }}
            >
              {player.displayName}
            </span>
            <span className="mt-1 font-mono text-[11px] font-bold uppercase tracking-widest text-slate-300">
              {heroInfo?.heroName || formatHeroName(heroInfo ? resolveSlotSlug(heroInfo) : undefined) || `Position ${pos}`}
            </span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export default function VersusPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("versus", state);
  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];

  const radiantKey = matchSetup?.radiantTeamKey || "";
  const direKey = matchSetup?.direTeamKey || "";

  if (!radiantKey || !direKey) {
    return (
      <HudCanvas blend>
        <FadePanel show={visible}>
          <div className="flex h-full w-full items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="rounded-xl border border-white/10 bg-black/50 p-8 shadow-2xl backdrop-blur-md flex flex-col items-center text-center">
              <p className="font-display text-4xl font-black uppercase tracking-widest text-slate-400">
                Waiting for match setup...
              </p>
              <p className="mt-4 font-mono text-sm text-slate-500">
                Configure teams in the admin dashboard to display the versus screen.
              </p>
            </div>
          </div>
        </FadePanel>
      </HudCanvas>
    );
  }

  const radiantName = state?.draft?.radiant?.name || matchSetup?.radiantTeamKey || "Radiant";
  const direName = state?.draft?.dire?.name || matchSetup?.direTeamKey || "Dire";

  const radiantColor = state?.leagueConfig?.teamColors?.[radiantKey] || "#10b981";
  const direColor = state?.leagueConfig?.teamColors?.[direKey] || "#ef4444";

  const radiantRaw = roster.filter((p) => p.teamKey === radiantKey);
  const direRaw = roster.filter((p) => p.teamKey === direKey);

  // Always pad to 5 players
  const radiantPlayers = Array.from({ length: 5 }).map((_, i) => radiantRaw[i] ?? {
    steam32: -(i + 1),
    displayName: "TBD",
    teamKey: radiantKey,
  });

  const direPlayers = Array.from({ length: 5 }).map((_, i) => direRaw[i] ?? {
    steam32: -(i + 10),
    displayName: "TBD",
    teamKey: direKey,
  });

  const radiantLogoPath = `${import.meta.env.BASE_URL}teams/${radiantKey}.png`;
  const direLogoPath = `${import.meta.env.BASE_URL}teams/${direKey}.png`;

  // Determine if strategy time has started
  const radiantPicks = state?.draft?.radiant?.slots?.filter((s) => s.type === "pick" && s.heroId) || [];
  const direPicks = state?.draft?.dire?.slots?.filter((s) => s.type === "pick" && s.heroId) || [];
  const gameState = state?.draft?.gameState;
  const isStrategyTime = gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || 
                         gameState === "DOTA_GAMERULES_STATE_PRE_GAME" || 
                         gameState === "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS";
  const flipToHero = isStrategyTime;

  // Helper to map player to hero pick via steam32
  const getHeroInfo = (steam32: number, side: "radiant" | "dire") => {
    const draftPicks = side === "radiant" ? radiantPicks : direPicks;
    return draftPicks.find(s => s.steam32 === steam32) || null;
  };

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <div className="relative flex h-full w-full items-center justify-center bg-black overflow-hidden">
          
          {/* RADIANT SIDE (Left Diagonal) */}
          <motion.div
            className="absolute inset-y-0 left-0 z-10 w-[60%]"
            style={{ clipPath: "polygon(0 0, 99.02% 0, 67.64% 100%, 0 100%)" }}
            initial={{ x: "-100%" }}
            animate={{ x: visible ? 0 : "-100%" }}
            transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 to-slate-900" />
            <div
              className="absolute inset-0 opacity-40 mix-blend-multiply"
              style={{ background: `linear-gradient(135deg, ${radiantColor}, transparent)` }}
            />
            <img
              src={radiantLogoPath}
              alt=""
              className="absolute top-1/2 left-[25%] h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 object-contain opacity-20 blur-sm"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            
            {/* Radiant Content */}
            <div className="absolute inset-0 flex flex-col justify-center pl-16 pr-[15%]">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT_EXPO }}
                className="mb-8 flex items-center gap-6"
              >
                <img
                  src={radiantLogoPath}
                  alt=""
                  className="h-28 w-28 object-contain drop-shadow-2xl"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div>
                  <h2 className="font-display text-[3.5rem] font-black uppercase leading-none tracking-wider text-white drop-shadow-lg">
                    {radiantName}
                  </h2>
                </div>
              </motion.div>

              <div className="flex flex-col gap-4">
                {/* Top Row: 3 cards */}
                <div className="flex gap-4">
                  {radiantPlayers.slice(0, 3).map((p, i) => (
                    <PlayerCard
                      key={p.steam32}
                      player={p}
                      color={radiantColor}
                      logoPath={radiantLogoPath}
                      pos={i + 1}
                      index={i}
                      isDire={false}
                      flipToHero={flipToHero}
                      heroInfo={getHeroInfo(p.steam32, "radiant")}
                    />
                  ))}
                </div>
                {/* Bottom Row: 2 cards centered */}
                <div className="flex gap-4">
                  {radiantPlayers.slice(3, 5).map((p, i) => (
                    <PlayerCard
                      key={p.steam32}
                      player={p}
                      color={radiantColor}
                      logoPath={radiantLogoPath}
                      pos={i + 4}
                      index={i + 3}
                      isDire={false}
                      flipToHero={flipToHero}
                      heroInfo={getHeroInfo(p.steam32, "radiant")}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* DIRE SIDE (Right Diagonal) */}
          <motion.div
            className="absolute inset-y-0 right-0 z-10 w-[60%]"
            style={{ clipPath: "polygon(32.36% 0, 100% 0, 100% 100%, 0.98% 100%)" }}
            initial={{ x: "100%" }}
            animate={{ x: visible ? 0 : "100%" }}
            transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
          >
            <div className="absolute inset-0 bg-gradient-to-bl from-slate-950 to-slate-900" />
            <div
              className="absolute inset-0 opacity-40 mix-blend-multiply"
              style={{ background: `linear-gradient(225deg, ${direColor}, transparent)` }}
            />
            <img
              src={direLogoPath}
              alt=""
              className="absolute top-1/2 right-[25%] h-[800px] w-[800px] -translate-y-1/2 translate-x-1/2 object-contain opacity-20 blur-sm"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            
            {/* Dire Content */}
            <div className="absolute inset-0 flex flex-col justify-center pl-[15%] pr-16 items-end">
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease: EASE_OUT_EXPO }}
                className="mb-8 flex flex-row-reverse items-center gap-6 text-right"
              >
                <img
                  src={direLogoPath}
                  alt=""
                  className="h-28 w-28 object-contain drop-shadow-2xl"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div>
                  <h2 className="font-display text-[3.5rem] font-black uppercase leading-none tracking-wider text-white drop-shadow-lg">
                    {direName}
                  </h2>
                </div>
              </motion.div>

              <div className="flex flex-col gap-4">
                {/* Top Row: 2 cards centered */}
                <div className="flex gap-4">
                  {direPlayers.slice(0, 2).map((p, i) => (
                    <PlayerCard
                      key={p.steam32}
                      player={p}
                      color={direColor}
                      logoPath={direLogoPath}
                      pos={i + 1}
                      index={i}
                      isDire={true}
                      flipToHero={flipToHero}
                      heroInfo={getHeroInfo(p.steam32, "dire")}
                    />
                  ))}
                </div>
                {/* Bottom Row: 3 cards */}
                <div className="flex gap-4">
                  {direPlayers.slice(2, 5).map((p, i) => (
                    <PlayerCard
                      key={p.steam32}
                      player={p}
                      color={direColor}
                      logoPath={direLogoPath}
                      pos={i + 3}
                      index={i + 2}
                      isDire={true}
                      flipToHero={flipToHero}
                      heroInfo={getHeroInfo(p.steam32, "dire")}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* CENTER SPLIT & VS BADGE */}
          <motion.div
            className="absolute inset-0 z-20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            {/* Glowing slant divider line */}
            <div className="absolute inset-y-0 left-1/2 w-[4px] -translate-x-1/2 rotate-[18.5deg] scale-y-150 bg-gradient-to-b from-transparent via-white/50 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.3)]" />

            {/* VS Centerpiece */}
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center z-20">
              <motion.div
                initial={{ scale: 3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                  delay: 0.3,
                }}
              >
              <div className="relative flex h-32 w-32 items-center justify-center rounded-2xl bg-black/80 shadow-2xl backdrop-blur-md">
                <div className="absolute inset-0 rounded-2xl border border-white/20" />
                <div
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: `linear-gradient(135deg, ${colorAlpha(radiantColor, 0.5)}, transparent 50%, ${colorAlpha(direColor, 0.5)})`,
                  }}
                />
                <span className="relative z-10 font-display text-6xl font-black italic tracking-tighter text-white drop-shadow-lg">
                  VS
                </span>
              </div>
            </motion.div>
            </div>


          </motion.div>

        </div>
      </FadePanel>
    </HudCanvas>
  );
}
