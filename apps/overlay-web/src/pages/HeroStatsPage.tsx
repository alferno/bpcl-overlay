import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroStatsCardPanel } from "../components/HeroStatsCardPanel";
import { StatCarouselPanel } from "../components/StatCarousel";
import { StatsPanelShell } from "../components/StatsPanelShell";
import { StatsOverlayRegion } from "../components/StatsOverlayRegion";
import { STATS_PANEL_SHELL_CLASS } from "../overlay-layout";
import { routeVisible } from "../visibility";

export default function HeroStatsPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("herostats", state);
  const card = state.heroStatsCard;
  const carousel = state.statCarousel;

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <StatsOverlayRegion align="start">
          {carousel && carousel.slides.length > 0 ? (
            <div className={STATS_PANEL_SHELL_CLASS}>
              <StatCarouselPanel carousel={carousel} />
            </div>
          ) : card ? (
            <StatsPanelShell card={card} leagueConfig={state.leagueConfig}>
              <HeroStatsCardPanel card={card} />
            </StatsPanelShell>
          ) : (
            <span className="text-2xl text-neutral-600">Awaiting hero card</span>
          )}
        </StatsOverlayRegion>
      </FadePanel>
    </HudCanvas>
  );
}
