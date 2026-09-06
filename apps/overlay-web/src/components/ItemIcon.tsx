import { useState } from "react";

export function ItemIcon({
  itemName,
  size = 40,
}: {
  itemName?: string;
  size?: number;
}) {
  const [error, setError] = useState(false);

  if (!itemName || itemName === "empty" || itemName === "") {
    return <div style={{ width: size, height: size * 0.72 }} className="rounded bg-black/40 border border-white/10" />;
  }

  const cleanName = itemName.replace(/^item_/, "");
  const url = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/${cleanName}.png`;

  return (
    <div
      style={{ width: size, height: size * 0.72 }}
      className="rounded overflow-hidden bg-black/60 shadow-[0_2px_8px_rgba(0,0,0,0.6)] border border-white/10"
    >
      {!error ? (
        <img
          src={url}
          alt={cleanName}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-mono text-slate-500">
          ?
        </div>
      )}
    </div>
  );
}
