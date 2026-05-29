import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function PausePage() {
  const { state } = useOverlayState();
  const visible = routeVisible("pause", state);

  return (
    <HudCanvas blend={false}>
      <FadePanel show={visible}>
        <div className="flex h-full flex-col items-center justify-center gap-16 bg-neutral-950/90">
          <p className="text-sm uppercase tracking-[0.85em] text-neutral-600">
            Technical pause
          </p>
          <p className="text-[11rem] font-black italic tracking-wide text-transparent bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text">
            PAUSE
          </p>
          {state.timers?.pauseMessage ? (
            <p className="max-w-6xl px-12 text-center text-4xl text-neutral-400">
              {state.timers.pauseMessage}
            </p>
          ) : (
            <p className="text-3xl text-neutral-700">We'll resume shortly</p>
          )}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}
