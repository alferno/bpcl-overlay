import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";
import { H2HMatchupGraphic } from "../components/H2HMatchupGraphic";
import { PowerSpikeAlert } from "../components/PowerSpikeAlert";
import { RankMedalsHUD } from "../components/RankMedalsHUD";
import { LivePlayerCard } from "./LivePlayerCardPage";
import { LiveStatsHud } from "../components/LiveStatsHud";
import { RoshanKillAlert } from "../components/RoshanKillAlert";

export default function GameCanvas() {
  const { state } = useOverlayState();
  /** Game route clean feed — optional subtle branding when visible */
  const visible = routeVisible("game", state);
  const showRankMedals = routeVisible("rankmedals", state);

  return (
    <HudCanvas blend>

      {showRankMedals && <RankMedalsHUD />}
      <H2HMatchupGraphic />
      <LivePlayerCard />
      <PowerSpikeAlert />
      <LiveStatsHud />
      <RoshanKillAlert />
    </HudCanvas>
  );
}
