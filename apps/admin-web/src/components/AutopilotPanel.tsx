import { useEffect, useState, useCallback } from "react";
import { Btn, apiFetch } from "./Common";

export function AutopilotPanel({
  origin,
  token,
  setErr,
}: {
  origin: string;
  token: string;
  setErr: (e: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [durationSeconds, setDurationSeconds] = useState(12);
  const [cardTypes, setCardTypes] = useState<string[]>([
    "player-league",
    "player-hero",
    "tournament-hero",
    "matchup",
  ]);
  const [isActive, setIsActive] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!token.trim()) return;
    try {
      const r = await apiFetch(origin, token, "/api/autopilot/config");
      if (!r.ok) return;
      const data = await r.json();
      if (data && data.config) {
        setEnabled(data.config.enabled);
        setIntervalMinutes(data.config.intervalMinutes);
        setDurationSeconds(data.config.durationSeconds);
        setCardTypes(data.config.cardTypes || []);
        setIsActive(data.isActive);
      }
    } catch {
      // Ignore
    }
  }, [origin, token]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (updates: Record<string, any>) => {
    setBusy(true);
    try {
      // Calculate next state
      const nextEnabled = updates.enabled !== undefined ? updates.enabled : enabled;
      const nextInterval = updates.intervalMinutes !== undefined ? updates.intervalMinutes : intervalMinutes;
      const nextDuration = updates.durationSeconds !== undefined ? updates.durationSeconds : durationSeconds;
      const nextTypes = updates.cardTypes !== undefined ? updates.cardTypes : cardTypes;

      const r = await apiFetch(origin, token, "/api/autopilot/config", {
        method: "POST",
        body: JSON.stringify({
          enabled: nextEnabled,
          intervalMinutes: nextInterval,
          durationSeconds: nextDuration,
          cardTypes: nextTypes,
        }),
      });
      const text = await r.text();
      if (!r.ok) {
        setErr(text);
        return;
      }
      const data = JSON.parse(text);
      if (data && data.config) {
        setEnabled(data.config.enabled);
        setIntervalMinutes(data.config.intervalMinutes);
        setDurationSeconds(data.config.durationSeconds);
        setCardTypes(data.config.cardTypes || []);
        setIsActive(data.isActive);
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const triggerNow = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(origin, token, "/api/autopilot/trigger", {
        method: "POST",
      });
      if (!r.ok) throw new Error(await r.text());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleCardType = (type: string) => {
    let next;
    if (cardTypes.includes(type)) {
      next = cardTypes.filter((x) => x !== type);
    } else {
      next = [...cardTypes, type];
    }
    setCardTypes(next);
    void saveConfig({ cardTypes: next });
  };

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-200">Stats Autopilot</h2>
        </div>
        
        {/* Enabled toggle */}
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveConfig({ enabled: !enabled })}
          className={`relative inline-flex h-6 w-12 shrink-0 items-center rounded-full transition-colors duration-200 outline-none ${
            enabled ? "bg-emerald-500" : "bg-slate-800 ring-1 ring-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        Automatically rotates player, hero, and matchup statistics overlays on the stream at configurable intervals.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Interval (Minutes)</label>
          <input
            type="number"
            min={1}
            max={60}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            value={intervalMinutes}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value) || 1);
              setIntervalMinutes(val);
            }}
            onBlur={() => void saveConfig({ intervalMinutes })}
          />
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Overlay Duration (Sec)</label>
          <input
            type="number"
            min={5}
            max={60}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            value={durationSeconds}
            onChange={(e) => {
              const val = Math.max(5, Number(e.target.value) || 5);
              setDurationSeconds(val);
            }}
            onBlur={() => void saveConfig({ durationSeconds })}
          />
        </div>

        <div className="flex flex-col justify-end">
          <Btn variant="cyan" className="!py-2 !text-[10px]" disabled={busy} onClick={triggerNow}>
            Trigger spotlight now
          </Btn>
        </div>
      </div>

      {/* Card types selection */}
      <div className="mt-5 border-t border-white/5 pt-4">
        <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
          Rotated Stats Formats
        </label>
        <div className="flex flex-wrap gap-3">
          {[
            { id: "player-league", label: "Player League Stats" },
            { id: "player-hero", label: "Player Hero Spotlight" },
            { id: "tournament-hero", label: "Tournament Hero Stats" },
            { id: "matchup", label: "Hero Matchups" },
          ].map((item) => {
            const active = cardTypes.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleCardType(item.id)}
                className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all ${
                  active
                    ? "border-emerald-500 bg-emerald-950/20 text-emerald-300"
                    : "border-white/5 bg-slate-950/20 text-slate-500 hover:text-slate-300"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500 border-t border-white/5 pt-3">
        <span>Autopilot state: <strong className={isActive ? "text-emerald-400" : "text-slate-400"}>{isActive ? "ACTIVE" : "STANDBY"}</strong></span>
        {isActive && (
          <span className="animate-pulse text-emerald-400 font-bold uppercase">
            Running interval timer...
          </span>
        )}
      </div>
    </section>
  );
}
