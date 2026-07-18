import type { OverlayEnvelope } from "@bpc/shared-types";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, formatApiErrorBody } from "./api";

type TeamInfo = {
  teamKey: string;
  teamName: string;
  players: Array<{ displayName: string; steam32: number }>;
};

function Btn({
  children,
  onClick,
  disabled,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const cls =
    variant === "ghost"
      ? "border border-white/20 bg-transparent text-slate-300 hover:bg-white/5"
      : "bg-violet-600 text-white hover:bg-violet-500";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  );
}

const selectClass =
  "w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white";

const EMPTY_PICK_PLAYERS: (number | null)[] = [null, null, null, null, null];

function normalizePickPlayers(
  raw: (number | null)[] | undefined,
): (number | null)[] {
  const out = [...EMPTY_PICK_PLAYERS];
  if (!raw) return out;
  for (let i = 0; i < 5; i++) out[i] = raw[i] ?? null;
  return out;
}

function PickSlotSelects({
  label,
  players,
  values,
  onChange,
}: {
  label: string;
  players: TeamInfo["players"];
  values: (number | null)[];
  onChange: (next: (number | null)[]) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mb-3 text-xs text-slate-400">
        Assign players to pick slots (shown on overlay after draft completes).
      </p>
      <div className="grid gap-2">
        {values.map((val, i) => (
          <select
            key={i}
            className={selectClass}
            value={val ?? ""}
            onChange={(e) => {
              const next = [...values];
              const v = e.target.value;
              next[i] = v ? Number(v) : null;
              onChange(next);
            }}
          >
            <option value="">Pick slot {i + 1} — unassigned</option>
            {players.map((p) => {
              const takenElsewhere = values.some(
                (v, j) => j !== i && v === p.steam32,
              );
              return (
                <option
                  key={p.steam32}
                  value={p.steam32}
                  disabled={takenElsewhere && val !== p.steam32}
                >
                  {p.displayName}
                </option>
              );
            })}
          </select>
        ))}
      </div>
    </div>
  );
}

export function MatchSetupPanel({
  origin,
  token,
  state,
  setErr,
}: {
  origin: string;
  token: string;
  state: OverlayEnvelope | null;
  setErr: (e: string | null) => void;
}) {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [radiantKey, setRadiantKey] = useState("");
  const [direKey, setDireKey] = useState("");
  const [seriesBestOf, setSeriesBestOf] = useState<1 | 3 | 5>(3);
  const [seriesGame, setSeriesGame] = useState(1);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [radiantPickPlayers, setRadiantPickPlayers] = useState<(number | null)[]>(
    () => [...EMPTY_PICK_PLAYERS],
  );
  const [direPickPlayers, setDirePickPlayers] = useState<(number | null)[]>(
    () => [...EMPTY_PICK_PLAYERS],
  );
  const [busy, setBusy] = useState(false);
  const [subFixSteam32, setSubFixSteam32] = useState("");
  const [subFixName, setSubFixName] = useState("");
  const [subFixTeamKey, setSubFixTeamKey] = useState("");
  const [subFixBusy, setSubFixBusy] = useState(false);
  const [subFixMsg, setSubFixMsg] = useState<string | null>(null);
  const [selectedBpcMatchId, setSelectedBpcMatchId] = useState<string>("");
  const [bpcMatches, setBpcMatches] = useState<any[]>([]);
  const [matchSeason, setMatchSeason] = useState<string>("");
  const [availableSeasons, setAvailableSeasons] = useState<{slug: string, name: string}[]>([]);
  const [playerMemes, setPlayerMemes] = useState<Record<string, string>>({});
  const [subDetectedBanner, setSubDetectedBanner] = useState<string | null>(null);
  const pickPlayersDirtyRef = useRef(false);
  const matchSetupDirtyRef = useRef(false);
  const prevPickPlayersRef = useRef({ radiant: "", dire: "" });

  const matchSetup = state?.leagueConfig?.matchSetup;
  const roster = state?.leagueConfig?.roster ?? [];
  const teamColors = state?.leagueConfig?.teamColors ?? {};

  useEffect(() => {
    if (!token.trim() || roster.length === 0) {
      setTeams([]);
      return;
    }
    void apiFetch(origin, token, "/api/teams")
      .then((r) => r.json())
      .then((list: TeamInfo[]) => setTeams(list))
      .catch(() => setTeams([]));
  }, [origin, token, roster.length, state?.updatedAt]);

  useEffect(() => {
    if (!matchSeason && state?.leagueConfig?.seasonSlug) {
      setMatchSeason(state.leagueConfig.seasonSlug);
    }
  }, [state?.leagueConfig?.seasonSlug, matchSeason]);

  useEffect(() => {
    if (!token.trim()) return;
    void apiFetch(origin, token, "/api/league/bpc-seasons")
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) {
          setAvailableSeasons(list);
          if (!matchSeason && !state?.leagueConfig?.seasonSlug) {
            const active = list.find((s) => s.isActive);
            setMatchSeason(active?.slug || list[0]?.slug || "season-2");
          }
        }
      })
      .catch(() => {});
  }, [origin, token]);

  useEffect(() => {
    if (!token.trim() || roster.length === 0) {
      setBpcMatches([]);
      return;
    }
    const currentSeason = matchSeason || state?.leagueConfig?.seasonSlug || "season-2";
    // Fetch matches from bpcleague.in API
    void apiFetch(origin, token, `/api/league/bpc-matches?seasonSlug=${currentSeason}`)
      .then((r) => r.json())
      .then((list) => {
        if (Array.isArray(list)) {
          setBpcMatches(list);
        }
      })
      .catch(() => setBpcMatches([]));
  }, [origin, token, roster.length, matchSeason, state?.leagueConfig?.seasonSlug]);

  // Sync teams/scores from server. Do not depend on pickPlayers arrays — live
  // STATE_FULL snapshots clone them every tick and would reset unsaved edits.
  useEffect(() => {
    if (matchSetupDirtyRef.current) return;
    if (matchSetup?.radiantTeamKey) setRadiantKey(matchSetup.radiantTeamKey);
    if (matchSetup?.direTeamKey) setDireKey(matchSetup.direTeamKey);
    if (matchSetup?.seriesBestOf) setSeriesBestOf(matchSetup.seriesBestOf);
    if (matchSetup?.seriesGame) setSeriesGame(matchSetup.seriesGame);
    if (matchSetup?.scoreA !== undefined) setScoreA(matchSetup.scoreA);
    if (matchSetup?.scoreB !== undefined) setScoreB(matchSetup.scoreB);
    if (matchSetup?.stageLabel !== undefined) setStageLabel(matchSetup.stageLabel);
    if (matchSetup?.playerMemes) setPlayerMemes(matchSetup.playerMemes);
  }, [
    matchSetup?.radiantTeamKey,
    matchSetup?.direTeamKey,
    matchSetup?.seriesBestOf,
    matchSetup?.seriesGame,
    matchSetup?.scoreA,
    matchSetup?.scoreB,
    matchSetup?.stageLabel,
    matchSetup?.playerMemes,
  ]);

  const serverRadiantPickPlayers = JSON.stringify(
    matchSetup?.pickPlayers?.radiant ?? EMPTY_PICK_PLAYERS,
  );
  const serverDirePickPlayers = JSON.stringify(
    matchSetup?.pickPlayers?.dire ?? EMPTY_PICK_PLAYERS,
  );

  useEffect(() => {
    const prevR = prevPickPlayersRef.current.radiant;
    const prevD = prevPickPlayersRef.current.dire;
    const changed = prevR !== "" && (prevR !== serverRadiantPickPlayers || prevD !== serverDirePickPlayers);

    // Force-sync if the server changed pickPlayers (GSI substitute detection)
    // even if the streamer had locally touched the dropdowns
    if (changed) {
      // Detect which slots changed to show banner
      const oldR: (number | null)[] = prevR ? JSON.parse(prevR) : [];
      const newR: (number | null)[] = matchSetup?.pickPlayers?.radiant ?? [];
      const oldD: (number | null)[] = prevD ? JSON.parse(prevD) : [];
      const newD: (number | null)[] = matchSetup?.pickPlayers?.dire ?? [];
      const subSteam32s: number[] = [
        ...newR.filter((id, i) => id && id !== oldR[i]),
        ...newD.filter((id, i) => id && id !== oldD[i]),
      ] as number[];
      if (subSteam32s.length > 0) {
        const rosterAll = state?.leagueConfig?.roster ?? [];
        const names = subSteam32s.map(id => {
          const p = rosterAll.find(r => r.steam32 === id);
          return p ? p.displayName : `#${id}`;
        });
        setSubDetectedBanner(`⚡ GSI detected sub(s): ${names.join(", ")} — lineup auto-updated`);
        setTimeout(() => setSubDetectedBanner(null), 15000);
      }
      // Force sync the local dropdowns from server
      pickPlayersDirtyRef.current = false;
    }

    prevPickPlayersRef.current = { radiant: serverRadiantPickPlayers, dire: serverDirePickPlayers };

    if (pickPlayersDirtyRef.current) return;
    if (matchSetup?.pickPlayers?.radiant) {
      setRadiantPickPlayers(
        normalizePickPlayers(matchSetup.pickPlayers.radiant),
      );
    }
    if (matchSetup?.pickPlayers?.dire) {
      setDirePickPlayers(normalizePickPlayers(matchSetup.pickPlayers.dire));
    }
  }, [serverRadiantPickPlayers, serverDirePickPlayers]);

  const maxSeriesGame = seriesBestOf;
  const gameOptions = Array.from({ length: maxSeriesGame }, (_, i) => i + 1);

  useEffect(() => {
    if (seriesGame > maxSeriesGame) setSeriesGame(maxSeriesGame);
  }, [seriesGame, maxSeriesGame]);

  const radiantTeam = useMemo(
    () => teams.find((t) => t.teamKey === radiantKey),
    [teams, radiantKey],
  );
  const direTeam = useMemo(
    () => teams.find((t) => t.teamKey === direKey),
    [teams, direKey],
  );

  async function applyPlayerMapping() {
    setBusy(true);
    try {
      const r = await apiFetch(origin, token, "/api/match/apply-player-mapping", {
        method: "POST",
        body: JSON.stringify({
          pickPlayers: {
            radiant: radiantPickPlayers,
            dire: direPickPlayers,
          },
        }),
      });
      const t = await r.text();
      if (!r.ok) {
        setErr(formatApiErrorBody(t));
        return;
      }
      pickPlayersDirtyRef.current = false;
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function applySetup() {
    if (!radiantKey || !direKey) return;
    setBusy(true);
    try {
      const r = await apiFetch(origin, token, "/api/match/setup", {
        method: "POST",
        body: JSON.stringify({
          radiantTeamKey: radiantKey,
          direTeamKey: direKey,
          seriesBestOf,
          seriesGame,
          scoreA,
          scoreB,
          stageLabel: stageLabel.trim() || undefined,
          pickPlayers: {
            radiant: radiantPickPlayers,
            dire: direPickPlayers,
          },
          playerMemes,
        }),
      });
      const t = await r.text();
      if (!r.ok) {
        setErr(formatApiErrorBody(t));
        return;
      }
      pickPlayersDirtyRef.current = false;
      matchSetupDirtyRef.current = false;
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitSubFix() {
    const steam32 = parseInt(subFixSteam32.trim(), 10);
    if (!Number.isFinite(steam32) || steam32 <= 0) {
      setSubFixMsg("Enter a valid steam32 ID.");
      return;
    }
    if (!subFixName.trim() || !subFixTeamKey) {
      setSubFixMsg("Name and team are required.");
      return;
    }
    setSubFixBusy(true);
    setSubFixMsg(null);
    try {
      const r = await apiFetch(origin, token, "/api/roster/upsert-player", {
        method: "POST",
        body: JSON.stringify({
          steam32,
          displayName: subFixName.trim(),
          teamKey: subFixTeamKey,
        }),
      });
      const t = await r.text();
      if (!r.ok) {
        setSubFixMsg(formatApiErrorBody(t));
        return;
      }
      setSubFixMsg(`Saved — #${steam32} is now "${subFixName.trim()}".`);
      setSubFixSteam32("");
      setSubFixName("");
      setTimeout(() => setSubFixMsg(null), 6000);
    } catch (e) {
      setSubFixMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSubFixBusy(false);
    }
  }

  // Players currently in the live lineup that GSI couldn't resolve to a
  // real name (auto substitute-detection falls back to "Sub#<steam32>").
  const unresolvedSubs = useMemo(() => {
    const ids = [...radiantPickPlayers, ...direPickPlayers].filter(
      (id): id is number => id != null,
    );
    return ids
      .map((id) => roster.find((r) => r.steam32 === id))
      .filter(
        (p): p is NonNullable<typeof p> =>
          !!p && p.displayName.startsWith("Sub#"),
      );
  }, [radiantPickPlayers, direPickPlayers, roster]);

  return (
    <section className="rounded-2xl border border-violet-500/40 bg-violet-950/25 p-6">
      <h2 className="text-lg font-semibold text-violet-200">Match setup</h2>
      <p className="mt-2 text-xs text-slate-400">
        Upload roster first (include optional{" "}
        <code className="text-violet-300">teamColor</code> hex per row), then
        choose which two teams are playing and assign Radiant / Dire before the
        draft starts. Logos use each team&apos;s{" "}
        <code className="text-violet-300">teamKey</code> from the CSV.
      </p>

      {roster.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No roster loaded yet.</p>
      ) : (
        <>
          {/* Auto-Import from bpcleague.in */}
          <div className="mt-4 border-b border-white/5 pb-5">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase text-slate-500 font-bold text-violet-300">
                ⚡ Auto-Import Matchup (bpcleague.in)
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase text-slate-500">Season</span>
                <select
                  className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs text-white"
                  value={matchSeason}
                  onChange={(e) => setMatchSeason(e.target.value)}
                >
                  <option value="" disabled>-- Auto-Detect --</option>
                  {availableSeasons.length > 0 ? (
                    availableSeasons.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="season-1">Season 1</option>
                      <option value="season-2">Season 2</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            {bpcMatches.length > 0 ? (
              <select
                className={`${selectClass} mt-2 border-violet-500/30 bg-violet-950/20`}
                value={selectedBpcMatchId}
                onChange={(e) => {
                  const matchId = e.target.value;
                  setSelectedBpcMatchId(matchId);
                  const m = bpcMatches.find((x) => x.id === matchId);
                  if (m) {
                    matchSetupDirtyRef.current = true;
                    
                    const keyify = (name: string) => name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

                    const key1 = keyify(m.team1);
                    const key2 = keyify(m.team2);

                    setRadiantKey(key1);
                    setDireKey(key2);
                    
                    if (m.seriesType === "bo1") setSeriesBestOf(1);
                    else if (m.seriesType === "bo3") setSeriesBestOf(3);
                    else if (m.seriesType === "bo5") setSeriesBestOf(5);
                    
                    setScoreA(m.team1Score ?? 0);
                    setScoreB(m.team2Score ?? 0);
                    
                    const playedGames = (m.team1Score ?? 0) + (m.team2Score ?? 0);
                    const maxGame = m.seriesType === "bo1" ? 1 : m.seriesType === "bo3" ? 3 : 5;
                    setSeriesGame(Math.min(maxGame, playedGames + 1));
                    
                    setStageLabel(m.stageKey || "");
                  }
                }}
              >
                <option value="">— select bpcleague.in match —</option>
                {bpcMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.stageKey ? `[${m.stageKey.toUpperCase()}] ` : ""}{m.team1} vs {m.team2} ({m.seriesType.toUpperCase()} · {m.status})
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No matchups found for {matchSeason || "this season"}.</p>
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-slate-500">
                Radiant team
              </label>
              <select
                className={selectClass}
                value={radiantKey}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setRadiantKey(e.target.value);
                }}
              >
                <option value="">— select team —</option>
                {teams.map((t) => (
                  <option key={t.teamKey} value={t.teamKey}>
                    {t.teamName} ({t.teamKey})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Dire team
              </label>
              <select
                className={selectClass}
                value={direKey}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setDireKey(e.target.value);
                }}
              >
                <option value="">— select team —</option>
                {teams.map((t) => (
                  <option key={t.teamKey} value={t.teamKey}>
                    {t.teamName} ({t.teamKey})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs uppercase text-slate-500">
                Series format
              </label>
              <select
                className={selectClass}
                value={seriesBestOf}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setSeriesBestOf(Number(e.target.value) as 1 | 3 | 5);
                }}
              >
                <option value={1}>Best of 1</option>
                <option value={3}>Best of 3</option>
                <option value={5}>Best of 5</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Game in series
              </label>
              <select
                className={selectClass}
                value={seriesGame}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setSeriesGame(Number(e.target.value));
                }}
              >
                {gameOptions.map((g) => (
                  <option key={g} value={g}>
                    Game {g}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Radiant series wins
              </label>
              <input
                type="number"
                min={0}
                max={seriesBestOf}
                className={selectClass}
                value={scoreA}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setScoreA(Math.max(0, Number(e.target.value) || 0));
                }}
              />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">
                Dire series wins
              </label>
              <input
                type="number"
                min={0}
                max={seriesBestOf}
                className={selectClass}
                value={scoreB}
                onChange={(e) => {
                  matchSetupDirtyRef.current = true;
                  setScoreB(Math.max(0, Number(e.target.value) || 0));
                }}
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs uppercase text-slate-500">
              Overlay stage label (right side of draft bar)
            </label>
            <input
              type="text"
              className={`${selectClass} mt-1`}
              placeholder="Quarter finals 1"
              value={stageLabel}
              onChange={(e) => {
                matchSetupDirtyRef.current = true;
                setStageLabel(e.target.value);
              }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Btn
              disabled={
                busy ||
                !radiantKey ||
                !direKey ||
                radiantKey === direKey
              }
              onClick={() => void applySetup()}
            >
              apply match setup
            </Btn>
            <Btn
              variant="ghost"
              disabled={
                busy ||
                !matchSetup ||
                state?.draft?.phase !== "done"
              }
              onClick={() => void applyPlayerMapping()}
            >
              apply player mapping to overlay
            </Btn>
          </div>

          {state?.production?.playerMappingPublished ? (
            <p className="mt-2 text-xs text-emerald-400">
              Player names are live on the draft overlay.
            </p>
          ) : state?.draft?.phase === "done" ? (
            <p className="mt-2 text-xs text-amber-400">
              Draft complete — click “apply player mapping” when pick slots are final.
            </p>
          ) : null}

          {matchSetup ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-emerald-400">
                Active: {matchSetup.radiantTeamKey} (Radiant) vs{" "}
                {matchSetup.direTeamKey} (Dire) · BO{matchSetup.seriesBestOf ?? 3}{" "}
                game {matchSetup.seriesGame ?? 1}
                {matchSetup.scoreA || matchSetup.scoreB
                  ? ` · ${matchSetup.scoreA ?? 0}–${matchSetup.scoreB ?? 0}`
                  : ""}
                {matchSetup.stageLabel
                  ? ` · “${matchSetup.stageLabel}”`
                  : ""}
              </p>
              
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Unique Match Slug:</span>
                <code className="text-xs text-violet-300 bg-violet-950/50 px-2 py-0.5 rounded border border-violet-500/20 select-all">
                  bpcl_s2_{matchSetup.radiantTeamKey}_vs_{matchSetup.direTeamKey}_game_{matchSetup.seriesGame ?? 1}
                </code>
                <button
                  type="button"
                  className="text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded transition-colors"
                  onClick={(e) => {
                    const slug = `bpcl_s2_${matchSetup.radiantTeamKey}_vs_${matchSetup.direTeamKey}_game_${matchSetup.seriesGame ?? 1}`;
                    navigator.clipboard.writeText(slug);
                    const btn = e.currentTarget;
                    btn.textContent = "COPIED!";
                    setTimeout(() => { btn.textContent = "COPY"; }, 2000);
                  }}
                >
                  COPY
                </button>
              </div>
            </div>
          ) : null}

          {(radiantTeam || direTeam) && (
            <>
              {subDetectedBanner && (
                <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-950/50 px-4 py-2 text-xs font-bold text-amber-300 flex items-center gap-2">
                  <span>⚡</span>
                  <span>{subDetectedBanner}</span>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Fix substitute player
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  For a lobby player GSI couldn't resolve to a real name/team
                  (shows up as "Sub#steamid"). Saves instantly, no need to
                  re-upload the roster.
                </p>

                {unresolvedSubs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unresolvedSubs.map((p) => (
                      <button
                        key={p.steam32}
                        type="button"
                        className="rounded-full border border-amber-400/40 bg-amber-950/40 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/60"
                        onClick={() => {
                          setSubFixSteam32(String(p.steam32));
                          setSubFixTeamKey(p.teamKey ?? "");
                          setSubFixMsg(null);
                        }}
                      >
                        {p.displayName} ({p.teamName ?? "no team"})
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_1fr_auto]">
                  <input
                    className={selectClass}
                    placeholder="Steam32 ID"
                    inputMode="numeric"
                    value={subFixSteam32}
                    onChange={(e) => setSubFixSteam32(e.target.value)}
                  />
                  <input
                    className={selectClass}
                    placeholder="Display name"
                    value={subFixName}
                    onChange={(e) => setSubFixName(e.target.value)}
                  />
                  <select
                    className={selectClass}
                    value={subFixTeamKey}
                    onChange={(e) => setSubFixTeamKey(e.target.value)}
                  >
                    <option value="">Team…</option>
                    {teams.map((t) => (
                      <option key={t.teamKey} value={t.teamKey}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                  <Btn onClick={submitSubFix} disabled={subFixBusy}>
                    {subFixBusy ? "Saving…" : "Save"}
                  </Btn>
                </div>
                {subFixMsg && (
                  <p className="mt-2 text-xs text-slate-300">{subFixMsg}</p>
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {radiantTeam ? (
                  <PickSlotSelects
                    label={`${radiantTeam.teamName} — Radiant pick slots`}
                    players={radiantTeam.players}
                    values={radiantPickPlayers}
                    onChange={(next) => {
                      pickPlayersDirtyRef.current = true;
                      setRadiantPickPlayers(next);
                    }}
                  />
                ) : null}
                {direTeam ? (
                  <PickSlotSelects
                    label={`${direTeam.teamName} — Dire pick slots`}
                    players={direTeam.players}
                    values={direPickPlayers}
                    onChange={(next) => {
                      pickPlayersDirtyRef.current = true;
                      setDirePickPlayers(next);
                    }}
                  />
                ) : null}
              </div>
            </>
          )}

          {(radiantTeam || direTeam) && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {radiantTeam ? (
                <div>
                  <TeamRosterPreview
                    label="Radiant roster"
                    team={radiantTeam}
                    teamColor={teamColors[radiantTeam.teamKey]}
                  />
                  <PlayerMemeInputs
                    label="Radiant Custom Data"
                    team={radiantTeam}
                    memes={playerMemes}
                    onChange={(id, val) => {
                      matchSetupDirtyRef.current = true;
                      setPlayerMemes(prev => ({ ...prev, [id]: val }));
                    }}
                  />
                </div>
              ) : null}
              {direTeam ? (
                <div>
                  <TeamRosterPreview
                    label="Dire roster"
                    team={direTeam}
                    teamColor={teamColors[direTeam.teamKey]}
                  />
                  <PlayerMemeInputs
                    label="Dire Custom Data"
                    team={direTeam}
                    memes={playerMemes}
                    onChange={(id, val) => {
                      matchSetupDirtyRef.current = true;
                      setPlayerMemes(prev => ({ ...prev, [id]: val }));
                    }}
                  />
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TeamRosterPreview({
  label,
  team,
  teamColor,
}: {
  label: string;
  team: TeamInfo;
  teamColor?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="font-semibold text-white">
        {team.teamName}{" "}
        <span className="text-slate-500">/teams/{team.teamKey}.png</span>
      </p>
      {teamColor ? (
        <p className="mt-1 text-xs text-slate-400">
          Color from CSV:{" "}
          <span
            className="inline-block h-3 w-3 rounded-sm align-middle"
            style={{ backgroundColor: teamColor }}
          />{" "}
          {teamColor}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2 text-sm text-slate-300">
        {team.players.map((p) => (
          <li key={p.steam32}>
            <div>
              {p.displayName}{" "}
              <span className="text-slate-600">({p.steam32})</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerMemeInputs({
  label,
  team,
  memes,
  onChange,
}: {
  label: string;
  team: TeamInfo;
  memes: Record<string, string>;
  onChange: (steam32: number, value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 mt-4">
      <p className="text-xs uppercase text-slate-500 mb-2">{label}</p>
      <div className="space-y-2">
        {team.players.map((p) => (
          <div key={p.steam32} className="flex flex-col">
            <label className="text-xs text-slate-400 mb-1">{p.displayName}</label>
            <input
              type="text"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm text-white"
              placeholder="Custom Data (e.g. Meme, Hometown)"
              value={memes[String(p.steam32)] ?? ""}
              onChange={(e) => onChange(p.steam32, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
