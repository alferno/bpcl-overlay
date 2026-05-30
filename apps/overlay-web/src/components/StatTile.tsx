import type { StatSlide } from "@bpc/shared-types";

import {
  leagueTeamStatLabelStyle,
  leagueTeamStatSublabelStyle,
  leagueTeamStatTileStyle,
  leagueTeamStatValueStyle,
} from "../stats-panel-theme";

export function StatTile({
  slide,
  accentColor,
  leagueReadable,
}: {
  slide: StatSlide;
  accentColor?: string;
  /** Dark tile + white text; team neon on chrome */
  leagueReadable?: boolean;
}) {
  const neonLeague = accentColor && leagueReadable;

  return (
    <div
      className={
        neonLeague
          ? "rounded-xl px-3 py-2.5"
          : "rounded-xl border border-white/10 bg-black/30 px-3 py-2.5"
      }
      style={neonLeague ? leagueTeamStatTileStyle(accentColor) : undefined}
    >
      <p
        className={
          neonLeague
            ? "text-[9px] uppercase tracking-widest"
            : "text-[9px] uppercase tracking-widest text-purple-400"
        }
        style={neonLeague ? leagueTeamStatLabelStyle(accentColor) : undefined}
      >
        {slide.label}
      </p>
      <p
        className={
          neonLeague
            ? "mt-0.5 text-2xl font-black tabular-nums"
            : "mt-0.5 text-2xl font-black tabular-nums text-emerald-300"
        }
        style={neonLeague ? leagueTeamStatValueStyle(accentColor) : undefined}
      >
        {slide.value}
      </p>
      {slide.sublabel ? (
        <p
          className={neonLeague ? "mt-0.5 text-xs" : "mt-0.5 text-xs text-neutral-400"}
          style={
            neonLeague ? leagueTeamStatSublabelStyle(accentColor) : undefined
          }
        >
          {slide.sublabel}
        </p>
      ) : null}
    </div>
  );
}
