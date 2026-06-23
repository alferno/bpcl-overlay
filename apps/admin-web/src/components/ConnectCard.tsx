import { Btn } from "./Common";

export function ConnectCard(props: {
  origin: string;
  token: string;
  setO(v: string): void;
  setT(v: string): void;
  onSave(): void;
}) {
  return (
    <section className="h-fit rounded-2xl border border-cyan-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-cyan-200">API Connection</h2>
      </div>
      
      <div className="mt-4">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">API Origin</label>
        <input 
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-all duration-200" 
          value={props.origin} 
          onChange={(e) => props.setO(e.target.value)} 
          placeholder="http://127.0.0.1:8080"
        />
      </div>

      <div className="mt-4">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Bearer Secret</label>
        <input 
          type="password" 
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none transition-all duration-200" 
          value={props.token} 
          onChange={(e) => props.setT(e.target.value)} 
          placeholder="••••••••••••••••"
        />
      </div>

      <Btn variant="cyan" className="mt-6 w-full py-2.5" onClick={props.onSave}>
        Connect & Sync
      </Btn>
    </section>
  );
}
