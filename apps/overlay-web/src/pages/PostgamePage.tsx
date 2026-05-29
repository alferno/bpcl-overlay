import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function PostgamePage() {
  const { state } = useOverlayState();
  const visible = routeVisible("postgame", state);

  return (
    <HudCanvas blend={false}>
      <FadePanel show={visible}>
        <div className="flex h-full flex-col gap-24 bg-neutral-950/95 p-20">
          <p className="text-sm uppercase tracking-[0.45em] text-neutral-700">
            Post-Series
          </p>
          <p className="text-[14rem] font-black italic leading-none text-white">
            GG
          </p>
          {state.timers?.postgameNotes ? (
            <div className="max-w-[70%] whitespace-pre-wrap text-6xl leading-tight font-semibold text-neutral-600">
              {state.timers.postgameNotes}
            </div>
          ) : (
            <p className="text-neutral-900">Awaiting recap copy</p>
          )}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}
