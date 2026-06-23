import type { ButtonHTMLAttributes } from "react";
import type { VisibilityMode } from "@bpc/shared-types";
export { apiFetch, formatApiErrorBody } from "../api";

export const selectClass =
  "w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-white transition-all duration-200 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 outline-none";

export function Btn(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "cyan" },
) {
  const { variant = "primary", className = "", type = "button", children, ...rest } = props;
  
  const palette =
    variant === "danger"
      ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white border border-transparent shadow-lg shadow-red-950/20"
      : variant === "ghost"
        ? "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
        : variant === "cyan"
          ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold shadow-lg shadow-cyan-950/20"
          : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 font-semibold shadow-lg shadow-emerald-950/20";

  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-xs uppercase tracking-wider font-bold transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${palette} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function StopBtn({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Btn variant="danger" disabled={disabled} onClick={onClick}>
      stop
    </Btn>
  );
}

export function ErrBox({ text }: { text: string }) {
  return (
    <pre className="whitespace-pre-wrap rounded-xl border border-rose-500/20 bg-rose-950/30 p-4 text-rose-300 text-xs font-mono">
      {text}
    </pre>
  );
}

export function VisToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onToggle}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors duration-200 outline-none ${
        active
          ? "bg-emerald-500"
          : "bg-slate-800 ring-1 ring-white/10"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          active ? "translate-x-8" : "translate-x-1"
        }`}
      />
      <span
        className={`pointer-events-none absolute text-[8px] font-black uppercase tracking-wider ${
          active ? "left-2 text-emerald-950" : "right-2 text-slate-400"
        }`}
      >
        {active ? "On" : "Off"}
      </span>
    </button>
  );
}

export function stringifyMode(mode?: VisibilityMode) {
  if (!mode || mode === "visible" || mode === "hidden") return String(mode ?? "unset");
  if (typeof mode === "object") return `timed ${new Date(mode.until).toLocaleTimeString()}`;
  return "?";
}
