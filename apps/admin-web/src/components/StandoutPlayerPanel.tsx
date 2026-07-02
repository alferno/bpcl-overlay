/**
 * StandoutPlayerPanel.tsx
 * ──────────────────────
 * Admin panel for auto-selecting and broadcasting the Standout Player (MVP).
 *
 * Flow:
 *  1. Producer enters an OpenDota match ID
 *  2. Clicks "Analyse Match" → calls POST /api/standout/compute
 *  3. Panel shows ranked leaderboard with per-metric breakdown bars
 *  4. Auto-selected winner is highlighted; producer can override by clicking
 *     any other candidate
 *  5. "Push to Overlay" sends the selected card live + shows the overlay
 *  6. "Hide Overlay" calls POST /api/standout/hide
 */
import { useState } from "react";
import { apiFetch, formatApiErrorBody, SectionPanel, Btn, ErrBox } from "./Common";

// ─── Types (mirror mvp-scorer.ts on the API side) ─────────────────────────────

interface ScoreBreakdown {
  kda: number;
  killParticipation: number;
  gpm: number;
  xpm: number;
  networthShare: number;
  damagePm: number;
  healingPm: number;
  lastHits: number;
  denies: number;
  laneEfficiency: number;
  winBonus: number;
}

interface RawStats {
  kills: number;
  deaths: number;
  assists: number;
  heroDamage: number;
  gpm: number;
  xpm: number;
  networth: number;
  lastHits: number;
  teamKills: number;
  items: number[];
  hasScepter: boolean;
  hasShard: boolean;
}

interface Candidate {
  rank: number;
  accountId: number | undefined;
  personaname: string | undefined;
  heroId: number | undefined;
  heroName: string | undefined;
  playerSlot: number;
  side: "radiant" | "dire";
  won: boolean;
  mvpScore: number;
  breakdown: ScoreBreakdown;
  raw: RawStats;
}

interface ComputeResult {
  ok: boolean;
  ranked: Candidate[];
  standoutCard: Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BREAKDOWN_LABELS: Record<keyof ScoreBreakdown, string> = {
  kda: "KDA",
  killParticipation: "Kill Part.",
  gpm: "GPM",
  xpm: "XPM",
  networthShare: "NW Share",
  damagePm: "Damage/min",
  healingPm: "Heal/min",
  lastHits: "Last Hits",
  denies: "Denies",
  laneEfficiency: "Lane Eff.",
  winBonus: "Win Bonus",
};

const BREAKDOWN_KEYS = Object.keys(BREAKDOWN_LABELS) as (keyof ScoreBreakdown)[];

/** Sum of all breakdown values in a full 10-player universe → max possible ≈ sum of weights */
const MAX_WEIGHT_SUM = 14.4; // sum of DEFAULT_MVP_WEIGHTS values

function fmt(n: number): string {
  return n.toLocaleString();
}

function kp(raw: RawStats): string {
  if (!raw.teamKills) return "—";
  return `${Math.min(100, ((raw.kills + raw.assists) / raw.teamKills) * 100).toFixed(1)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ value, max = MAX_WEIGHT_SUM }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500/70 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] font-mono text-slate-300">
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

function SideLabel({ side, won }: { side: "radiant" | "dire"; won: boolean }) {
  const color =
    side === "radiant"
      ? won
        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        : "bg-emerald-900/20 text-emerald-700 border-emerald-900/30"
      : won
      ? "bg-red-500/20 text-red-300 border-red-500/30"
      : "bg-red-900/20 text-red-800 border-red-900/30";

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider border ${color}`}
    >
      {side} {won ? "✓" : "✗"}
    </span>
  );
}

function CandidateCard({
  c,
  selected,
  maxScore,
  onClick,
}: {
  c: Candidate;
  selected: boolean;
  maxScore: number;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const kda = c.raw.deaths === 0
    ? `${c.raw.kills + c.raw.assists}.00`
    : ((c.raw.kills + c.raw.assists) / c.raw.deaths).toFixed(2);

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
        selected
          ? "border-emerald-500/60 bg-emerald-950/30 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/20"
          : "border-white/8 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/80"
      }`}
    >
      {/* Rank badge */}
      <div
        className={`absolute -top-2.5 -left-2.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black border ${
          c.rank === 1
            ? "bg-emerald-500 text-slate-950 border-emerald-400"
            : "bg-slate-800 text-slate-300 border-slate-700"
        }`}
      >
        #{c.rank}
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-black text-sm text-white truncate">
            {c.heroName ?? `Hero ${c.heroId ?? "?"}`}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Account {c.accountId ?? "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <SideLabel side={c.side} won={c.won} />
          {selected && (
            <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">
              ✦ Selected MVP
            </span>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 text-center mb-3">
        {[
          { label: "KDA", value: kda },
          { label: "K/D/A", value: `${c.raw.kills}/${c.raw.deaths}/${c.raw.assists}` },
          { label: "GPM", value: fmt(c.raw.gpm) },
          { label: "Kill Part", value: kp(c.raw) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-slate-950/60 px-1.5 py-1.5 border border-white/5">
            <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-xs font-black text-white mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* MVP Score bar */}
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            MVP Score
          </span>
          <span className="text-[10px] font-black text-emerald-400 font-mono">
            {c.mvpScore.toFixed(3)}
          </span>
        </div>
        <ScoreBar value={c.mvpScore} max={maxScore} />
      </div>

      {/* Expandable breakdown */}
      <button
        type="button"
        className="mt-2 w-full text-[9px] uppercase tracking-wider font-bold text-slate-500 hover:text-slate-300 transition-colors text-center"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
      >
        {expanded ? "▲ Hide breakdown" : "▼ Score breakdown"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {BREAKDOWN_KEYS.map((key) => (
            <MetricBar
              key={key}
              label={BREAKDOWN_LABELS[key]}
              value={c.breakdown[key]}
              max={c.breakdown[key] === 0 ? 1 : c.breakdown[key] * 1.5}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function StandoutPlayerPanel({
  origin,
  token,
}: {
  origin: string;
  token: string;
}) {
  const [matchId, setMatchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [pushed, setPushed] = useState(false);

  async function analyse() {
    const id = parseInt(matchId.trim(), 10);
    if (!id || isNaN(id)) {
      setErr("Enter a valid numeric match ID");
      return;
    }
    setLoading(true);
    setErr(null);
    setResult(null);
    setSelectedIndex(0);
    setPushed(false);
    try {
      const r = await apiFetch(origin, token, "/api/standout/compute", {
        method: "POST",
        body: JSON.stringify({ matchId: id, persist: false }),
      });
      const text = await r.text();
      if (!r.ok) {
        setErr(formatApiErrorBody(text));
        return;
      }
      const data = JSON.parse(text) as ComputeResult;
      setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pushToOverlay() {
    if (!result) return;
    const candidate = result.ranked[selectedIndex];
    if (!candidate) return;
    setPushing(true);
    setErr(null);
    try {
      // Re-compute card from the selected candidate (server builds it via /compute
      // with persist=true, but we already have the card – just push it directly)
      const card = buildCardFromCandidate(candidate, result.standoutCard, selectedIndex === 0);
      const r = await apiFetch(origin, token, "/api/standout/push", {
        method: "POST",
        body: JSON.stringify({ card, show: true }),
      });
      if (!r.ok) {
        const text = await r.text();
        setErr(formatApiErrorBody(text));
        return;
      }
      setPushed(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }

  async function hideOverlay() {
    setHiding(true);
    setErr(null);
    try {
      await apiFetch(origin, token, "/api/standout/hide", { method: "POST" });
      setPushed(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setHiding(false);
    }
  }

  const ranked = result?.ranked ?? [];
  const maxScore = ranked[0]?.mvpScore ?? 1;

  return (
    <SectionPanel title="Standout Player — MVP Auto-Select" icon="🏆">
      {/* Match ID input */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
            OpenDota Match ID
          </label>
          <input
            type="number"
            placeholder="e.g. 8148236789"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void analyse()}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white font-mono text-sm outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all"
          />
        </div>
        <Btn
          variant="ghost"
          disabled={hiding}
          onClick={() => void hideOverlay()}
          className="h-10 border border-white/10"
        >
          {hiding ? "Hiding…" : "Hide Overlay"}
        </Btn>
        <Btn
          onClick={() => void analyse()}
          disabled={loading || !matchId.trim()}
          className="h-10"
        >
          {loading ? "Analysing…" : "Analyse Match"}
        </Btn>
      </div>

      {err && <ErrBox text={err} />}

      {/* Results */}
      {ranked.length > 0 && (
        <>
          {/* Summary banner */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400 mb-0.5">
                Auto-selected MVP
              </p>
              <p className="text-lg font-black text-white">
                {ranked[selectedIndex]?.heroName ?? `Hero ${ranked[selectedIndex]?.heroId}`}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Score: <span className="font-mono text-emerald-300">{ranked[selectedIndex]?.mvpScore.toFixed(3)}</span>
                {" · "}
                {ranked[selectedIndex]?.side} {ranked[selectedIndex]?.won ? "✓ Winner" : "✗ Loser"}
              </p>
            </div>
            <div className="flex gap-2">
              <Btn
                variant="ghost"
                disabled={hiding}
                onClick={() => void hideOverlay()}
              >
                {hiding ? "…" : "Hide"}
              </Btn>
              <Btn
                disabled={pushing}
                onClick={() => void pushToOverlay()}
                className={pushed ? "opacity-60" : ""}
              >
                {pushing ? "Pushing…" : pushed ? "✓ Live" : "Push to Overlay"}
              </Btn>
            </div>
          </div>

          {/* Leaderboard */}
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Click any player to select them as the featured standout
          </p>
          <div className="grid gap-3">
            {ranked.map((c, i) => (
              <CandidateCard
                key={`${c.accountId}-${c.heroId}`}
                c={c}
                selected={i === selectedIndex}
                maxScore={maxScore}
                onClick={() => {
                  setSelectedIndex(i);
                  setPushed(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </SectionPanel>
  );
}

// ─── Card builder helper ──────────────────────────────────────────────────────

/**
 * Rebuild a StandoutPlayerCard from a Candidate.
 * When the auto-selected winner is chosen we reuse the server-built card
 * (which already has portrait fields), otherwise we assemble from raw data.
 */
function buildCardFromCandidate(
  c: Candidate,
  serverCard: Record<string, unknown>,
  isWinner: boolean,
): Record<string, unknown> {
  if (isWinner) return serverCard;
  // For override candidates we build a minimal card; the server will resolve portrait
  return {
    playerLabel: c.heroName ?? `Hero ${c.heroId ?? "?"}`,
    heroId: c.heroId,
    heroName: c.heroName,
    steam32: c.accountId,
    personaname: c.personaname,
    xpm: c.raw.xpm,
    gpm: c.raw.gpm,
    networth: c.raw.networth,
    kills: c.raw.kills,
    deaths: c.raw.deaths,
    assists: c.raw.assists,
    heroDamage: c.raw.heroDamage,
    lastHits: c.raw.lastHits,
    teamKills: c.raw.teamKills,
    items: c.raw.items,
    hasScepter: c.raw.hasScepter,
    hasShard: c.raw.hasShard,
  };
}
