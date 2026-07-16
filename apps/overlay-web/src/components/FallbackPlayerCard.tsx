import { colorAlpha } from "../draft/team-colors";

export function FallbackPlayerCard({
  playerName,
  color = "#10b981", // default emerald
}: {
  playerName: string;
  color?: string;
}) {
  return (
    <div 
      className="flex h-full w-full items-center justify-center rounded-xl bg-slate-900"
      style={{ 
        boxShadow: `inset 0 0 40px ${colorAlpha(color, 0.2)}`
      }}
    >
      <span 
        className="text-white font-black uppercase tracking-widest text-center px-4"
        style={{
          fontSize: "1.75rem",
          textShadow: `0 0 20px ${colorAlpha(color, 0.8)}`
        }}
      >
        {playerName || "UNKNOWN"}
      </span>
    </div>
  );
}
