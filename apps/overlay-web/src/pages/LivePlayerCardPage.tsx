import { useState, useEffect } from "react";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroStatsCardPanel } from "../components/HeroStatsCardPanel";
import { StatsPanelShell } from "../components/StatsPanelShell";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { withBaseUrl } from "../asset-paths";

export function LivePlayerCard() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("liveplayercard", state);
  const card = state.livePlayerCard;
  
  const extensions = [".png", ".jpg", ".gif"];
  const [extIndex, setExtIndex] = useState(0);

  useEffect(() => {
    setExtIndex(0);
  }, [card?.steam32, card?.heroId]);

  const m = state.minimapState || {};
  const roshanAlive = m.roshanState === "alive";
  const tormRadAlive = m.tormentorRadiant === "alive";
  const tormDireAlive = m.tormentorDire === "alive";
  const scanRadActive = m.radiantScanActive !== false;
  const scanDireActive = m.direScanActive !== false;
  const glyphRadActive = m.radiantGlyphActive !== false;
  const glyphDireActive = m.direGlyphActive !== false;

  function formatTime(seconds: number | undefined) {
    if (seconds === undefined || seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  const SWEEP_H = 80;
  const scanRadCharges = m.radiantScanCharges ?? 2;
  const scanDireCharges = m.direScanCharges ?? 2;
  const scanRadPct = Math.max(0, Math.min(1, 1 - (m.radiantScanCooldown || 0) / 210));
  const scanDirePct = Math.max(0, Math.min(1, 1 - (m.direScanCooldown || 0) / 210));
  const glyphRadPct = Math.max(0, Math.min(1, 1 - (m.radiantGlyphCooldown || 0) / 300));
  const glyphDirePct = Math.max(0, Math.min(1, 1 - (m.direGlyphCooldown || 0) / 300));

  const tormRadTimer = m.tormentorRadiantRespawnTimer || 0;
  const tormDireTimer = m.tormentorDireRespawnTimer || 0;
  const tormMaxTimer = Math.max(tormRadTimer, tormDireTimer);
  const showTormTimer = tormMaxTimer > 0;
  const tormDead = !tormRadAlive && !tormDireAlive;

  const isTestGame = typeof window !== "undefined" && window.location.pathname.includes("/test-game");

  return (
    <FadePanel
      show={visible && !!card}
      panelKey={`liveplayer-${card?.steam32 ?? card?.heroId ?? "empty"}`}
    >
      {/* 4 Minimap Buttons Above Map */}
      {visible && (
        <div className="absolute left-[1px] bottom-[280px] flex flex-row items-center justify-start px-6 py-3 gap-5 pointer-events-none origin-bottom-left z-10 h-[84px]">
          {/* Arched Window Background */}
          <div className="absolute inset-0 bg-[#061016] rounded-l-[20px] rounded-r-[42px] border border-[rgba(55,76,93,0.5)] shadow-[0_12px_40px_rgba(0,0,0,0.7)] overflow-hidden z-0">
            {/* Spiderweb details inside arch */}
            <svg width="100%" height="100%" className="absolute inset-0 opacity-40">
              <path d="M80,0 Q40,42 80,84" fill="none" stroke="#374c5d" strokeWidth="2" />
              <path d="M160,0 Q120,42 160,84" fill="none" stroke="#374c5d" strokeWidth="2" />
              <path d="M240,0 Q200,42 240,84" fill="none" stroke="#374c5d" strokeWidth="2" />
              <path d="M320,0 Q280,42 320,84" fill="none" stroke="#374c5d" strokeWidth="2" />
              <line x1="0" y1="42" x2="400" y2="42" stroke="#374c5d" strokeWidth="2" />
            </svg>
            <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,1)]" />
          </div>

          {/* Roshan */}
          <div className="relative z-10 w-[54px] h-[54px] rounded-full border-[2px] border-[rgba(16,185,129,0.3)] bg-[#030a08] shadow-[0_8px_20px_rgba(0,0,0,0.8),inset_0_0_12px_rgba(16,185,129,0.1)] flex flex-shrink-0 items-center justify-center overflow-visible">
            <div className="absolute -top-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#052e16] border border-[#10b981]/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="absolute -bottom-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -left-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -right-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className={`w-full h-full rounded-full overflow-hidden shadow-[inset_0_0_15px_#000] relative flex items-center justify-center ${!roshanAlive ? 'opacity-60 grayscale' : ''}`}>
              <img src={withBaseUrl("/icons/Roshan_mapicon_dota2_gameasset.png")} alt="Roshan" className={`w-[130%] h-[130%] object-cover object-center translate-y-[5%] transition-all ${!roshanAlive ? 'opacity-40' : ''}`} />
              {!roshanAlive && m.roshanRespawnTimer && m.roshanRespawnTimer > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-mono text-[11px] font-bold drop-shadow-md">
                  {formatTime(m.roshanRespawnTimer)}
                </div>
              )}
            </div>
          </div>

          {/* Tormentor */}
          <div className="relative z-10 w-[54px] h-[54px] rounded-full border-[2px] border-[rgba(16,185,129,0.3)] bg-[#030a08] shadow-[0_8px_20px_rgba(0,0,0,0.8),inset_0_0_12px_rgba(16,185,129,0.1)] flex flex-shrink-0 items-center justify-center overflow-visible">
            <div className="absolute -top-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#052e16] border border-[#10b981]/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="absolute -bottom-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -left-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -right-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className={`w-full h-full rounded-full overflow-hidden shadow-[inset_0_0_15px_#000] relative flex items-center justify-center ${tormDead ? 'opacity-60 grayscale' : ''}`}>
              <img 
                src={withBaseUrl(tormDireAlive ? "/icons/Tormentor_(Dire)_icon_dota2_gameasset.png" : "/icons/Tormentor_(Radiant)_icon_dota2_gameasset.png")} 
                alt="Tormentor" 
                className={`w-[130%] h-[130%] object-cover object-center ${tormDead ? 'opacity-40' : ''}`} 
              />
              {showTormTimer && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-mono text-[11px] font-bold drop-shadow-md">
                  {formatTime(tormMaxTimer)}
                </div>
              )}
            </div>
          </div>

          {/* Scan */}
          <div className="relative z-10 w-[54px] h-[54px] rounded-full border-[2px] border-[rgba(16,185,129,0.3)] bg-[#030a08] shadow-[0_8px_20px_rgba(0,0,0,0.8),inset_0_0_12px_rgba(16,185,129,0.1)] flex flex-shrink-0 items-center justify-center overflow-visible">
            <div className="absolute -top-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#052e16] border border-[#10b981]/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="absolute -bottom-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -left-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -right-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="w-full h-full rounded-full overflow-hidden shadow-[inset_0_0_15px_#000] relative flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 80 80">
                <defs>
                  <clipPath id="scan-rad-base"><rect x="0" y="0" width="40" height="80"/></clipPath>
                  <clipPath id="scan-dire-base"><rect x="40" y="0" width="40" height="80"/></clipPath>
                  <clipPath id="scan-rad-prog"><rect x="0" y={80 - 80 * scanRadPct} width="40" height={80 * scanRadPct}/></clipPath>
                  <clipPath id="scan-dire-prog"><rect x="40" y={80 - 80 * scanDirePct} width="40" height={80 * scanDirePct}/></clipPath>
                </defs>
                
                {/* Dim Base Radar */}
                <g opacity="0.25">
                  <g clipPath="url(#scan-rad-base)">
                    <circle cx="40" cy="40" r="26" fill="none" stroke="#22c55e" strokeWidth="6" />
                    <circle cx="40" cy="40" r="12" fill="none" stroke="#22c55e" strokeWidth="6" />
                  </g>
                  <g clipPath="url(#scan-dire-base)">
                    <circle cx="40" cy="40" r="26" fill="none" stroke="#ef4444" strokeWidth="6" />
                    <circle cx="40" cy="40" r="12" fill="none" stroke="#ef4444" strokeWidth="6" />
                  </g>
                </g>

                {/* Radiant Scan */}
                <g clipPath="url(#scan-rad-base)">
                  {scanRadCharges >= 1 && <circle cx="40" cy="40" r="12" fill="none" stroke="#22c55e" strokeWidth="6" />}
                  {scanRadCharges === 2 && <circle cx="40" cy="40" r="26" fill="none" stroke="#22c55e" strokeWidth="6" />}
                  
                  {scanRadCharges === 0 && (
                    <g clipPath="url(#scan-rad-prog)">
                      <circle cx="40" cy="40" r="12" fill="none" stroke="#22c55e" strokeWidth="6" />
                    </g>
                  )}
                  {scanRadCharges === 1 && (
                    <g clipPath="url(#scan-rad-prog)">
                      <circle cx="40" cy="40" r="26" fill="none" stroke="#22c55e" strokeWidth="6" />
                    </g>
                  )}
                </g>

                {/* Dire Scan */}
                <g clipPath="url(#scan-dire-base)">
                  {scanDireCharges >= 1 && <circle cx="40" cy="40" r="12" fill="none" stroke="#ef4444" strokeWidth="6" />}
                  {scanDireCharges === 2 && <circle cx="40" cy="40" r="26" fill="none" stroke="#ef4444" strokeWidth="6" />}
                  
                  {scanDireCharges === 0 && (
                    <g clipPath="url(#scan-dire-prog)">
                      <circle cx="40" cy="40" r="12" fill="none" stroke="#ef4444" strokeWidth="6" />
                    </g>
                  )}
                  {scanDireCharges === 1 && (
                    <g clipPath="url(#scan-dire-prog)">
                      <circle cx="40" cy="40" r="26" fill="none" stroke="#ef4444" strokeWidth="6" />
                    </g>
                  )}
                </g>

                {/* Center Divider */}
                <line x1="40" y1="0" x2="40" y2="80" stroke="#000" strokeWidth="4" />
              </svg>
            </div>
          </div>

          {/* Glyph */}
          <div className="relative z-10 w-[54px] h-[54px] rounded-full border-[2px] border-[rgba(16,185,129,0.3)] bg-[#030a08] shadow-[0_8px_20px_rgba(0,0,0,0.8),inset_0_0_12px_rgba(16,185,129,0.1)] flex flex-shrink-0 items-center justify-center overflow-visible">
            <div className="absolute -top-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#052e16] border border-[#10b981]/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <div className="absolute -bottom-[5px] left-[50%] -translate-x-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -left-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="absolute -right-[5px] top-[50%] -translate-y-[50%] w-2.5 h-2.5 rotate-45 bg-[#10b981] border border-[#374151]" />
            <div className="w-full h-full rounded-full overflow-hidden shadow-[inset_0_0_15px_#000] relative flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 80 80">
                <defs>
                  <clipPath id="glyph-rad-base"><rect x="0" y="0" width="40" height="80"/></clipPath>
                  <clipPath id="glyph-dire-base"><rect x="40" y="0" width="40" height="80"/></clipPath>
                  <clipPath id="glyph-rad-prog"><rect x="0" y={80 - 80 * glyphRadPct} width="40" height={80 * glyphRadPct}/></clipPath>
                  <clipPath id="glyph-dire-prog"><rect x="40" y={80 - 80 * glyphDirePct} width="40" height={80 * glyphDirePct}/></clipPath>
                </defs>
                
                {/* Dim Base Tower */}
                <g opacity="0.25">
                  <g clipPath="url(#glyph-rad-base)">
                    <path d="M28,60 L52,60 L48,35 L54,35 L54,20 L48,20 L48,26 L43,26 L43,20 L37,20 L37,26 L32,26 L32,20 L26,20 L26,35 L32,35 Z" fill="#22c55e" />
                  </g>
                  <g clipPath="url(#glyph-dire-base)">
                    <path d="M28,60 L52,60 L48,35 L54,35 L54,20 L48,20 L48,26 L43,26 L43,20 L37,20 L37,26 L32,26 L32,20 L26,20 L26,35 L32,35 Z" fill="#ef4444" />
                  </g>
                </g>

                {/* Sweeping Bright Tower */}
                <g clipPath="url(#glyph-rad-prog)">
                  <g clipPath="url(#glyph-rad-base)">
                    <path d="M28,60 L52,60 L48,35 L54,35 L54,20 L48,20 L48,26 L43,26 L43,20 L37,20 L37,26 L32,26 L32,20 L26,20 L26,35 L32,35 Z" fill="#22c55e" />
                  </g>
                </g>
                <g clipPath="url(#glyph-dire-prog)">
                  <g clipPath="url(#glyph-dire-base)">
                    <path d="M28,60 L52,60 L48,35 L54,35 L54,20 L48,20 L48,26 L43,26 L43,20 L37,20 L37,26 L32,26 L32,20 L26,20 L26,35 L32,35 Z" fill="#ef4444" />
                  </g>
                </g>
                
                {/* Center Divider */}
                <line x1="40" y1="0" x2="40" y2="80" stroke="#000" strokeWidth="4" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {isTestGame && card?.playerLabel && (
        <div className="absolute left-[264px] top-[765px] w-[310px] text-white font-bold text-2xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] z-30 pointer-events-none text-center uppercase tracking-wider">
          {card.playerLabel}
        </div>
      )}

      <div 
        className="absolute left-[264px] top-[806px] w-[310px] h-[274px] flex flex-col items-center justify-end pointer-events-none origin-bottom-left z-20 transition-all duration-300"
        style={{ 
          clipPath: (() => {
            const clampedAbilityCount = Math.min(card?.abilityCount ?? 4, 6);
            if (card?.heroId === 74) {
              return "polygon(0 0, 100% 0, 100% 43%, 74% 43%, 74% 83%, 65.5% 84.1%, 61.5% 87.3%, 60% 91.5%, 61.5% 95.8%, 65.5% 98.9%, 74% 100%, 0 100%)";
            }
            if (clampedAbilityCount === 4) {
              return "polygon(0 0, 100% 0, 100% 43%, 88% 43%, 88% 83%, 79.5% 84.1%, 75.5% 87.3%, 74% 91.5%, 75.5% 95.8%, 79.5% 98.9%, 88% 100%, 0 100%)";
            } else if (clampedAbilityCount === 5) {
              return "polygon(0 0, 100% 0, 100% 43%, 83% 43%, 83% 83%, 74.5% 84.1%, 70.5% 87.3%, 69% 91.5%, 70.5% 95.8%, 74.5% 98.9%, 83% 100%, 0 100%)";
            } else {
              return "polygon(0 0, 100% 0, 100% 43%, 75% 43%, 75% 83%, 66.5% 84.1%, 62.5% 87.3%, 61% 91.5%, 62.5% 95.8%, 66.5% 98.9%, 75% 100%, 0 100%)";
            }
          })()
        }}
      >
        {card ? (
          card.steam32 && extIndex < extensions.length ? (
            <img
              src={withBaseUrl(`/cards/${card.steam32}${extensions[extIndex]}`)}
              alt=""
              className="w-full h-full object-contain"
              onError={() => setExtIndex(e => e + 1)}
            />
          ) : (
            <img
              src={withBaseUrl(`/cards/sample.png`)}
              alt="Fallback"
              className="w-full h-full object-contain"
            />
          )
        ) : null}
      </div>
    </FadePanel>
  );
}

export default function LivePlayerCardPage() {
  return (
    <HudCanvas blend>
      <LivePlayerCard />
    </HudCanvas>
  );
}
