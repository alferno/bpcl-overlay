import { motion } from "framer-motion";
import type { CSSProperties } from "react";

import { leagueTeamAvatarNeonStyle } from "../stats-panel-theme";

const frameClass =
  "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-cyan-400/35 shadow-lg shadow-cyan-950/40";

export function PlayerAvatar({
  url,
  name,
  size = 96,
  neonColor,
}: {
  url?: string;
  name?: string;
  size?: number;
  /** Team brand hex — league player cards */
  neonColor?: string;
}) {
  const neonStyle: CSSProperties | undefined = neonColor
    ? leagueTeamAvatarNeonStyle(neonColor)
    : undefined;
  const boxStyle: CSSProperties = {
    width: size,
    height: size,
    ...neonStyle,
  };
  const frame = neonColor
    ? "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-black/70"
    : frameClass;

  if (!url?.trim()) {
    return (
      <div
        className={`${frame} ${neonColor ? "" : "border-white/15 bg-slate-800/80"}`}
        style={boxStyle}
        aria-hidden
      />
    );
  }

  return (
    <motion.div
      className={frame}
      style={boxStyle}
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <img
        src={url}
        alt={name ? `${name} Steam avatar` : "Player"}
        className="block h-full w-full object-cover object-center"
        referrerPolicy="no-referrer"
      />
    </motion.div>
  );
}
