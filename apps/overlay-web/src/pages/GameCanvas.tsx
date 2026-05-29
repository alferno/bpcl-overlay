import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function GameCanvas() {
  const { state } = useOverlayState();
  /** Game route clean feed — optional subtle branding when visible */
  const visible = routeVisible("game", state);

  return (
    <HudCanvas blend={!visible}>
      {visible ? (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-8 py-4 text-xl text-white backdrop-blur">
          BPC LIVE
        </div>
      ) : null}
    </HudCanvas>
  );
}
