import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function StartingSoonPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("startingsoon", state);

  return (
    <HudCanvas blend={false}>
      <FadePanel show={visible}>
        <div className="relative flex h-full flex-col overflow-hidden bg-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),transparent_56%)]" />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8">
            <p className="text-sm uppercase tracking-[0.6em] text-sky-300">
              LIVE TOURNAMENT GRAPHICS
            </p>
            <p className="text-[12rem] font-black italic leading-none text-white">
              SOON<span className="text-sky-400">TM</span>
            </p>
            <p className="text-[4rem] font-semibold text-neutral-600">Starting</p>
            {state.timers?.startingSoonEta ? (
              <p className="text-7xl tabular-nums text-sky-200">
                ETA {state.timers.startingSoonEta}
              </p>
            ) : (
              <p className="text-4xl text-neutral-700">Hang tight...</p>
            )}
          </div>
        </div>
      </FadePanel>
    </HudCanvas>
  );
}
