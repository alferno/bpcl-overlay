import { useEffect, useState } from "react";
import { useOverlayState } from "../OverlaySocketLayer";

type AbilityAccuracyEntry = {
  abilityName: string;
  displayName: string;
  heroName: string;
  attempts: number;
  hits: number;
  accuracyPct: string; // e.g. "60%"
};

type AbilityAccuracySnapshot = {
  entries: AbilityAccuracyEntry[];
  updatedAt: number | null;
};

function AccuracyCard({ entry }: { entry: AbilityAccuracyEntry }) {
  if (entry.attempts === 0) return null; // Only show if they've attempted it

  const pctNum = Math.round((entry.hits / entry.attempts) * 100);
  const color =
    pctNum >= 60
      ? "text-emerald-400"
      : pctNum >= 40
        ? "text-yellow-400"
        : "text-red-400";

  // Note: We use the Dota CDN directly for abilities.
  // The abilityName from combatlog maps 1:1 to the CDN icon name.
  const abilityIconUrl = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/${entry.abilityName}.png`;

  return (
    <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur border border-white/10 rounded-lg p-2 pr-4 shadow-xl pointer-events-auto">
      <img
        src={abilityIconUrl}
        alt={entry.displayName}
        className="w-10 h-10 rounded border border-black shadow"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-tight">
          {entry.displayName} Acc
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-white font-mono font-bold text-lg leading-none">
            {entry.hits}/{entry.attempts}
          </span>
          <span className={`font-mono font-bold text-sm leading-none ${color}`}>
            ({entry.accuracyPct})
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Live HUD element showing ability accuracy (e.g. Hooks 6/10)
 * Uses Socket.IO to receive updates directly from the CombatLogWatcher.
 */
export function AbilityAccuracyHUD() {
  const [snapshot, setSnapshot] = useState<AbilityAccuracySnapshot | null>(null);
  const { socket } = useOverlayState();

  useEffect(() => {
    function handleUpdate(data: AbilityAccuracySnapshot) {
      setSnapshot(data);
    }
    
    // Bind to the socket event emitted by combatlog-watcher.ts
    if (socket) {
      socket.on("ability_accuracy_update", handleUpdate);
      return () => {
        socket.off("ability_accuracy_update", handleUpdate);
      };
    }
  }, [socket]);

  if (!snapshot || !snapshot.entries || snapshot.entries.length === 0) {
    return null;
  }

  // Only show entries that have attempts
  const activeEntries = snapshot.entries.filter((e) => e.attempts > 0);
  if (activeEntries.length === 0) return null;

  return (
    <div className="absolute left-[360px] top-[140px] flex flex-col gap-2 z-[60]">
      {activeEntries.map((entry) => (
        <AccuracyCard key={entry.abilityName} entry={entry} />
      ))}
    </div>
  );
}
