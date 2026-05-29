import type { StatSlide } from "@bpc/shared-types";

export function StatTile({ slide }: { slide: StatSlide }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-widest text-purple-400">
        {slide.label}
      </p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-emerald-300">
        {slide.value}
      </p>
      {slide.sublabel ? (
        <p className="mt-0.5 text-xs text-neutral-400">{slide.sublabel}</p>
      ) : null}
    </div>
  );
}
