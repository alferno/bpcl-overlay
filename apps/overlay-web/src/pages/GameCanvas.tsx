import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";
import { H2HMatchupGraphic } from "../components/H2HMatchupGraphic";
import { PowerSpikeAlert } from "../components/PowerSpikeAlert";
import { RankMedalsHUD } from "../components/RankMedalsHUD";
import { LivePlayerCard } from "./LivePlayerCardPage";
import { LiveStatsHud } from "../components/LiveStatsHud";
import { RoshanKillAlert } from "../components/RoshanKillAlert";
import { AegisStolenAlert } from "../components/AegisStolenAlert";
import { BountyRuneCard } from "../components/BountyRuneCard";
import { WisdomRuneCard } from "../components/WisdomRuneCard";
import { SponsorFlipWidget } from "../components/SponsorFlipWidget";
import { TopStatAlert } from "../components/TopStatAlert";


export default function GameCanvas() {
  const { state } = useOverlayState();
  /** Game route clean feed — optional subtle branding when visible */
  const visible = routeVisible("game", state);
  const showRankMedals = routeVisible("rankmedals", state);
  const showSponsorWidget = routeVisible("sponsorWidget" as any, state);
  const sponsorCfg = state.production?.sponsorWidget;

  return (
    <HudCanvas blend>

      {showRankMedals && <RankMedalsHUD />}
      {showSponsorWidget && <SponsorFlipWidget {...sponsorCfg} />}
      <H2HMatchupGraphic />
      <LivePlayerCard />
      <PowerSpikeAlert />
      <LiveStatsHud />
      <div style={{ position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 16, zIndex: 60 }}>
        <RoshanKillAlert />
        <AegisStolenAlert />
      </div>
      <TopStatAlert />
      <BountyRuneCard />
      <WisdomRuneCard />
    </HudCanvas>
  );
}
