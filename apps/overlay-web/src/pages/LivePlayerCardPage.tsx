import { useState, useEffect } from "react";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroStatsCardPanel } from "../components/HeroStatsCardPanel";
import { StatsPanelShell } from "../components/StatsPanelShell";
import { useRouteVisible } from "../hooks/useRouteVisible";
import { withBaseUrl } from "../asset-paths";

export default function LivePlayerCardPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("liveplayercard", state);
  const card = state.livePlayerCard;
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [card?.steam32, card?.heroId]);

  return (
    <HudCanvas blend>
      <FadePanel
        show={visible && !!card}
        panelKey={`liveplayer-${card?.steam32 ?? card?.heroId ?? "empty"}`}
      >
        <div className="absolute left-[310px] bottom-[30px] flex items-end justify-start pointer-events-none origin-bottom-left scale-90">
          {card ? (
            card.steam32 && !imageError ? (
              <img
                src={withBaseUrl(`/cards/${card.steam32}.png`)}
                alt=""
                className="max-h-[600px] object-contain shadow-2xl drop-shadow-[0_15px_15px_rgba(0,0,0,0.8)] rounded-xl"
                onError={() => setImageError(true)}
              />
            ) : (
              <StatsPanelShell card={card} leagueConfig={state.leagueConfig}>
                <HeroStatsCardPanel card={card} />
              </StatsPanelShell>
            )
          ) : null}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}
