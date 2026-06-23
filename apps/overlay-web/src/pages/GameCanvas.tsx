import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";
import { H2HMatchupGraphic } from "../components/H2HMatchupGraphic";
import { PowerSpikeAlert } from "../components/PowerSpikeAlert";

export default function GameCanvas() {
  const { state } = useOverlayState();
  /** Game route clean feed — optional subtle branding when visible */
  const visible = routeVisible("game", state);

  return (
    <HudCanvas blend={!visible}>

      
      <H2HMatchupGraphic />
      <PowerSpikeAlert />
    </HudCanvas>
  );
}
