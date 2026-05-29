import type { HeroStatsCard } from "@bpc/shared-types";

import { HeroPortrait } from "./HeroPortrait";
import { StatTile } from "./StatTile";
import { resolveSlotFlatPortraitUrl } from "../hero-portrait";

export function HeroStatsCardPanel({ card }: { card: HeroStatsCard }) {
  const slides = card.statSlides ?? [];
  const portraitUrl =
    resolveSlotFlatPortraitUrl({
      order: 0,
      type: "pick",
      heroId: card.heroId,
      heroName: card.heroName,
      heroPortraitUrl: card.heroPortraitUrl,
    }) ?? card.heroPortraitUrl;

  return (
    <div className="flex items-center gap-6">
      <HeroPortrait
        url={portraitUrl}
        heroName={card.heroName}
        size={128}
      />
      <div className="min-w-[340px] max-w-[400px]">
        <p className="text-xs uppercase tracking-[0.35em] text-purple-300">
          {card.playerHero?.games ? "Player spotlight" : "Tournament hero"}
        </p>
        <p className="mt-1 text-2xl font-black text-white">{card.playerLabel}</p>
        <p className="text-xl font-semibold text-purple-100">
          {card.heroName ?? `#${card.heroId}`}
        </p>

        {slides.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {slides.map((slide) => (
              <StatTile key={slide.label} slide={slide} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
