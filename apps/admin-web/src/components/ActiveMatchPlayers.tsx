import { useState, useEffect } from "react";
import type { OverlayEnvelope } from "@bpc/shared-types";
import { Btn, apiFetch } from "./Common";
import type { HeroMeta } from "../HeroSearchSelect";

type PlayerSignature = {
  heroId: number;
  heroName: string;
  games: number;
};

export function ActiveMatchPlayers({
  origin,
  token,
  state,
  setErr,
  onShowOverlay,
}: {
  origin: string;
  token: string;
  state: OverlayEnvelope | null;
  setErr: (e: string | null) => void;
  onShowOverlay: (route: string, seconds?: number) => Promise<void>;
}) {
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [selectedHeroes, setSelectedHeroes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];
  const playerHeroIndex = state?.playerHeroIndex ?? {};

  useEffect(() => {
    if (!token.trim()) return;
    void apiFetch(origin, token, "/api/heroes")
      .then((r) => r.json())
      .then((list: HeroMeta[]) => setHeroes(list))
      .catch(() => undefined);
  }, [origin, token]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await apiFetch(origin, token, path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      });
      const t = await r.text();
      if (!r.ok) {
        setErr(t.slice(0, 400));
        return null;
      }
      setErr(null);
      return t ? JSON.parse(t) : {};
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!matchSetup?.radiantTeamKey || !matchSetup?.direTeamKey) {
    return (
      <div className="rounded-2xl border border-white/5 bg-slate-900/20 p-6 text-center">
        <p className="text-sm text-slate-500 italic">
          No active matchup configured. Set up a match in the <strong>Match & OBS</strong> tab to list player stats shortcuts here.
        </p>
      </div>
    );
  }

  // Filter players for radiant and dire
  const radiantPlayers = roster.filter((p) => p.teamKey === matchSetup.radiantTeamKey);
  const direPlayers = roster.filter((p) => p.teamKey === matchSetup.direTeamKey);

  // Helper to list played heroes for a player
  const getPlayedHeroes = (steam32: number): PlayerSignature[] => {
    const prefix = `${steam32}:`;
    return Object.entries(playerHeroIndex)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, stats]) => {
        const heroId = Number(k.split(":")[1]);
        const hMeta = heroes.find((h) => Number(h.id) === heroId);
        return {
          heroId,
          heroName: hMeta?.name || `Hero #${heroId}`,
          games: (stats as any).games ?? 0,
        };
      })
      .sort((a, b) => b.games - a.games); // Sort by games played
  };

  const getPlayerTotalStats = (steam32: number) => {
    const prefix = `${steam32}:`;
    let totalGames = 0;
    let totalWins = 0;
    Object.entries(playerHeroIndex)
      .filter(([k]) => k.startsWith(prefix))
      .forEach(([_, stats]) => {
        totalGames += (stats as any).games ?? 0;
        totalWins += (stats as any).wins ?? 0;
      });
    return {
      games: totalGames,
      wins: totalWins,
      winRate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
    };
  };

  const triggerPlayerLeagueStats = async (steam32: number, name: string) => {
    const card = await post("/api/stats/player-league", {
      steam32,
      displayName: name,
      persist: true,
    });
    if (card) {
      void onShowOverlay("herostats", 12);
    }
  };

  const triggerPlayerHeroStats = async (steam32: number, name: string, heroId: number) => {
    if (!heroId) return;
    const card = await post("/api/stats/player-hero", {
      steam32,
      heroId,
      displayName: name,
      persist: true,
    });
    if (card) {
      void onShowOverlay("herostats", 12);
    }
  };

  const triggerPlayerHeroCarousel = async (steam32: number, heroId: number) => {
    if (!heroId) return;
    await post("/api/stats/carousel", {
      type: "player-hero",
      steam32,
      heroId,
    });
  };

  const handleHeroSelectChange = (steam32: number, value: string) => {
    setSelectedHeroes((prev) => ({ ...prev, [steam32]: value }));
  };

  const renderTeamColumn = (teamName: string, teamKey: string, players: typeof roster, side: "radiant" | "dire") => {
    const isRadiant = side === "radiant";
    const accentColor = isRadiant ? "border-emerald-500/20 bg-emerald-950/5" : "border-red-500/20 bg-red-950/5";
    const badgeColor = isRadiant ? "text-emerald-400 bg-emerald-950/30" : "text-red-400 bg-red-950/30";

    return (
      <div className={`rounded-xl border p-4 ${accentColor}`}>
        <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">
            {teamName} <span className="text-[10px] text-slate-500 font-mono">({teamKey})</span>
          </h3>
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${badgeColor}`}>
            {side}
          </span>
        </div>

        <div className="space-y-3">
          {players.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No players synced for this team.</p>
          ) : (
            players.map((p) => {
              const playedHeroes = getPlayedHeroes(p.steam32);
              const selectedHero = selectedHeroes[p.steam32] || (playedHeroes[0]?.heroId ? String(playedHeroes[0].heroId) : "");
              
              return (
                <div key={p.steam32} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <div className="flex items-center gap-2">
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="h-7 w-7 rounded-md border border-white/10" />
                    ) : (
                      <div className="h-7 w-7 rounded-md bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {p.displayName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold text-white leading-tight flex flex-wrap items-center gap-1.5">
                        <span>{p.displayName}</span>
                        {(() => {
                          const stats = getPlayerTotalStats(p.steam32);
                          if (stats.games === 0) return null;
                          const isHot = stats.games >= 4 && stats.winRate >= 70;
                          return (
                            <>
                              <span className="text-[9px] font-bold text-cyan-400 bg-cyan-950/40 px-1 py-0.5 rounded border border-cyan-500/10">
                                {stats.games}g {stats.winRate}% WR
                              </span>
                              {isHot && (
                                <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-950/40 px-1 py-0.5 rounded border border-amber-500/20 animate-pulse" title="Spicy Winrate in League!">
                                  🔥 Hot
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5">Steam32: {p.steam32}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Quick League stats */}
                    <Btn 
                      variant="ghost" 
                      className="!py-1 !px-2 !text-[9px]" 
                      disabled={busy}
                      onClick={() => triggerPlayerLeagueStats(p.steam32, p.displayName)}
                    >
                      📊 League
                    </Btn>

                    {/* Hero stats options */}
                    {playedHeroes.length > 0 ? (
                      <div className="flex items-center gap-1.5 bg-slate-900 border border-white/5 rounded-md px-1.5 py-0.5">
                        <select
                          className="bg-transparent text-[10px] text-slate-300 outline-none max-w-[100px]"
                          value={selectedHero}
                          onChange={(e) => handleHeroSelectChange(p.steam32, e.target.value)}
                        >
                          {playedHeroes.map((ph) => (
                            <option key={ph.heroId} value={ph.heroId} className="bg-slate-950 text-slate-200">
                              {ph.heroName} ({ph.games}g)
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="text-orange-400 hover:text-orange-300 font-bold text-[10px] transition-colors"
                          title="Show hero stats card"
                          disabled={busy}
                          onClick={() => triggerPlayerHeroStats(p.steam32, p.displayName, Number(selectedHero))}
                        >
                          ⚡
                        </button>
                        <button
                          type="button"
                          className="text-cyan-400 hover:text-cyan-300 font-bold text-[10px] transition-colors"
                          title="Trigger 3-slide carousel spotlight"
                          disabled={busy}
                          onClick={() => triggerPlayerHeroCarousel(p.steam32, Number(selectedHero))}
                        >
                          🎠
                        </button>
                      </div>
                    ) : (
                      <span className="text-[9px] text-slate-600 italic">No league matches</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-slate-900/40 backdrop-blur-md p-6 shadow-xl shadow-slate-950/40 space-y-4">
      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
        <div className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-200">Active Roster Matchup</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {renderTeamColumn(
          state?.draft?.radiant?.name || matchSetup.radiantTeamKey,
          matchSetup.radiantTeamKey,
          radiantPlayers,
          "radiant"
        )}
        {renderTeamColumn(
          state?.draft?.dire?.name || matchSetup.direTeamKey,
          matchSetup.direTeamKey,
          direPlayers,
          "dire"
        )}
      </div>
    </section>
  );
}
