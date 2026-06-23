import { useState, useEffect } from "react";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroStatsCardPanel } from "../components/HeroStatsCardPanel";
import { StatCarouselPanel } from "../components/StatCarousel";
import { StatsPanelShell } from "../components/StatsPanelShell";
import { StatsOverlayRegion } from "../components/StatsOverlayRegion";
import { STATS_PANEL_SHELL_CLASS } from "../overlay-layout";
import { useRouteVisible } from "../hooks/useRouteVisible";

export default function HeroStatsPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("herostats", state);
  const card = state.heroStatsCard;
  const carousel = state.statCarousel;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [card?.steam32]);

  return (
    <HudCanvas blend>
      <FadePanel show={visible} panelKey={`herostats-${card?.steam32 ?? card?.heroId ?? "empty"}`}>
        <StatsOverlayRegion>
          {carousel && carousel.slides.length > 0 ? (
            <div className={STATS_PANEL_SHELL_CLASS}>
              <StatCarouselPanel carousel={carousel} />
            </div>
          ) : card ? (
            card.steam32 && !imageError ? (
              <img
                src={`/cards/${card.steam32}.png`}
                alt=""
                className="max-h-[800px] object-contain shadow-2xl"
                onError={() => setImageError(true)}
              />
            ) : (
              <StatsPanelShell card={card} leagueConfig={state.leagueConfig}>
                <HeroStatsCardPanel card={card} />
              </StatsPanelShell>
            )
          ) : (
            <span className="text-2xl text-neutral-600">Awaiting hero card</span>
          )}
        </StatsOverlayRegion>
      </FadePanel>
    </HudCanvas>
  );
}
