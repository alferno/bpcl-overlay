import { Btn } from "./Common";

export function EmergencyRow(props: { onHide(): void; onReset(): void; onSnap(): void }) {
  return (
    <section className="rounded-2xl border border-red-500/20 bg-red-950/10 backdrop-blur-md p-6 shadow-xl shadow-red-950/5">
      <div className="flex items-center gap-2 border-b border-red-500/10 pb-3">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-red-400">Emergency Panel</h2>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Global hot switches to instantly manage overlays and recover state in case of issues.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Btn variant="danger" onClick={props.onHide} className="px-5 py-2.5">
          Blackout Overlays
        </Btn>
        <Btn variant="ghost" onClick={props.onSnap} className="px-5 py-2.5">
          Resync State
        </Btn>
        <Btn variant="ghost" onClick={props.onReset} className="px-5 py-2.5 border-red-950/20 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300">
          Reset Overlay State
        </Btn>
      </div>
    </section>
  );
}
