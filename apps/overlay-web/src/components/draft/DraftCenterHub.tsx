import type { DraftState, LeagueConfig } from "@bpc/shared-types";
import {
  resolveActiveTeamName,
  resolveTurnTimerLabel,
} from "../../draft/broadcast-theme";
import {
  formatDraftSeconds,
  resolveTurnAction,
} from "../../draft/slot-utils";
import { useDraftCountdown } from "../../draft/useDraftCountdown";
import { colorAlpha } from "../../draft/team-colors";
import {
  logoActiveGlow,
  neonPanelShadow,
  neonTextShadow,
} from "../../draft/neon-effects";
import { DraftTurnArrow } from "./DraftTurnArrow";

/** Logo tile size — VS column width is fixed separately */
const LOGO = "h-[96px] w-[96px]";
const VS_COLUMN = "w-10 shrink-0";

const LOGO_IDLE_SHADOW =
  "0 4px 14px rgb(0 0 0 / 0.55), 0 10px 28px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.07)";

export function DraftCenterHub({
  draft,
  teamColors,
}: {
  draft: DraftState;
  teamColors: { radiant: string; dire: string };
  leagueConfig?: LeagueConfig;
}) {
  const action = resolveTurnAction(draft);
  const timerKey = `${draft.activeTeam}-${action}-${draft.turnSecondsRemaining}`;
  const turnSeconds = useDraftCountdown(draft.turnSecondsRemaining, timerKey);
  const reserveDisplay = Math.max(0, Math.floor(draft.reserveSeconds ?? 0));

  const logoA = draft.radiant?.logoUrl ?? draft.series.logoUrlA;
  const logoB = draft.dire?.logoUrl ?? draft.series.logoUrlB;
  const nameA = draft.radiant?.name ?? draft.series.teamA;
  const nameB = draft.dire?.name ?? draft.series.teamB;
  const activeName = resolveActiveTeamName(draft);
  const activeColor =
    draft.activeTeam === "radiant"
      ? teamColors.radiant
      : draft.activeTeam === "dire"
        ? teamColors.dire
        : undefined;

  const turnLabel = action === "ban" ? "BANNING" : "PICKING";
  const timerLabel = resolveTurnTimerLabel(draft);

  const showTurnArrow =
    Boolean(draft.activeTeam) && draft.phase !== "done";

  const radiantLogoActive =
    showTurnArrow && draft.activeTeam === "radiant";
  const direLogoActive = showTurnArrow && draft.activeTeam === "dire";

  return (
    <div className="relative flex h-full min-h-0 w-[280px] shrink-0 flex-col items-center px-2 font-body">
      {/* Elevated anchor panel */}
      <div
        className="relative w-full overflow-hidden rounded-lg px-4 py-4"
        style={{
          background: "linear-gradient(180deg, rgb(12 12 14 / 0.98) 0%, rgb(2 2 4 / 1) 100%)",
          boxShadow: neonPanelShadow(teamColors.radiant, "idle"),
        }}
      >
        <div className="pointer-events-none absolute -inset-px rounded-lg bg-gradient-to-b from-white/[0.05] to-transparent" />

        {/* Logo row + VS — VS column size fixed; logos scale in side cells */}
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <div className="flex justify-end">
            <LogoMark
              logoUrl={logoA}
              name={nameA}
              isActive={radiantLogoActive}
              activeColor={teamColors.radiant}
            />
          </div>
          <div
            className={`flex ${VS_COLUMN} flex-col items-center justify-center gap-0.5`}
          >
            <span
              className="font-display text-2xl leading-none tracking-widest text-white"
              style={{ textShadow: "0 0 16px rgb(255 255 255 / 0.4)" }}
            >
              VS
            </span>
            <div
              className="h-px w-8"
              style={{
                background: `linear-gradient(90deg, ${colorAlpha(teamColors.radiant, 0.5)}, rgb(255 255 255 / 0.35), ${colorAlpha(teamColors.dire, 0.5)})`,
              }}
            />
          </div>
          <div className="flex justify-start">
            <LogoMark
              logoUrl={logoB}
              name={nameB}
              isActive={direLogoActive}
              activeColor={teamColors.dire}
            />
          </div>
        </div>

        <div className="broadcast-divider my-3" />

        {/* Active turn */}
        {activeName && draft.phase !== "done" ? (
          <div className="text-center">
            <p className="font-heading text-[10px] font-semibold uppercase tracking-[0.32em] text-zinc-500">
              Current Turn
            </p>
            <p
              className="mt-0.5 font-display text-xl leading-tight tracking-wide text-white"
              style={{ textShadow: neonTextShadow(activeColor ?? "#ffffff") }}
            >
              {activeName.toUpperCase()}
            </p>
            <p className="font-heading text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
              {turnLabel}
            </p>
          </div>
        ) : null}

        {activeName && draft.phase !== "done" ? (
          <div className="broadcast-divider my-3" />
        ) : null}

        {/* Timers */}
        <div className="grid grid-cols-2 gap-3">
          <TimerBlock
            label="RESERVE"
            value={formatDraftSeconds(reserveDisplay)}
            emphasis
          />
          <TimerBlock
            label={timerLabel}
            value={formatDraftSeconds(turnSeconds)}
            accent={activeColor}
            pulse={draft.phase !== "done" && draft.phase !== "paused"}
          />
        </div>
      </div>

      {/* DRAFT label — vertically centered in space below timer card */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-2 py-5">
        <div className="flex w-full max-w-[248px] items-center justify-between gap-1">
          <DraftTurnArrow
            side="left"
            active={showTurnArrow && draft.activeTeam === "radiant"}
            activeColor={activeColor}
          />
          <p
            className="shrink-0 font-display text-2xl leading-none tracking-[0.38em] text-white"
            style={{
              textShadow:
                "0 0 20px rgb(255 255 255 / 0.35), 0 2px 8px rgb(0 0 0 / 0.9)",
            }}
          >
            DRAFT
          </p>
          <DraftTurnArrow
            side="right"
            active={showTurnArrow && draft.activeTeam === "dire"}
            activeColor={activeColor}
          />
        </div>
      </div>
    </div>
  );
}

function LogoMark({
  logoUrl,
  name,
  isActive = false,
  activeColor,
}: {
  logoUrl?: string;
  name: string;
  isActive?: boolean;
  activeColor?: string;
}) {
  return (
    <div className="relative flex shrink-0 flex-col items-center">
      <div
        className={`flex ${LOGO} items-center justify-center rounded-lg bg-zinc-800/95 p-1.5 transition-shadow duration-300 ${
          isActive ? "logo-glow" : ""
        }`}
        style={{
          boxShadow:
            isActive && activeColor
              ? logoActiveGlow(activeColor)
              : LOGO_IDLE_SHADOW,
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={name}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="h-14 w-14 rounded-md bg-zinc-700/50" />
        )}
      </div>
    </div>
  );
}

function TimerBlock({
  label,
  value,
  accent,
  emphasis,
  pulse,
}: {
  label: string;
  value: string;
  accent?: string;
  emphasis?: boolean;
  pulse?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-2 py-2 text-center ${
        emphasis ? "bg-white/[0.04]" : "bg-black/30"
      } ${pulse ? "draft-pick-pulse" : ""}`}
      style={{
        ...(accent
          ? {
              boxShadow: `inset 0 0 0 1px ${colorAlpha(accent, 0.35)}`,
              ["--pick-glow" as string]: colorAlpha(accent, 0.45),
              ["--pick-glow-soft" as string]: colorAlpha(accent, 0.15),
            }
          : {}),
      }}
    >
      <p
        className="font-heading text-[11px] font-bold uppercase tracking-[0.28em] text-white"
        style={{ textShadow: "0 0 10px rgb(255 255 255 / 0.35)" }}
      >
        {label}
      </p>
      <p
        className="mt-0.5 font-heading text-2xl font-bold tabular-nums leading-none text-white"
        style={{
          textShadow: accent
            ? neonTextShadow(accent)
            : "0 0 12px rgb(255 255 255 / 0.25)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
