import { motion } from "framer-motion";

import { pickCardLabelScrim, readableTextShadow } from "../../draft/neon-effects";
import { colorAlpha } from "../../draft/team-colors";
import {
  formatCardLabelText,
  wrapCardLabelLines,
  type CardLabelWrapVariant,
} from "../../draft/wrap-card-label";

export function DraftPickCardLabel({
  label,
  accent,
  variant,
}: {
  label: string;
  accent: string;
  variant: CardLabelWrapVariant;
}) {
  const isRoster = variant === "roster-player";
  const display = formatCardLabelText(label, variant);
  const lines = wrapCardLabelLines(display, variant);

  return (
    <motion.div
      key={label}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]"
      initial={isRoster ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className="px-2 pb-2.5 pt-10"
        style={{ background: pickCardLabelScrim(accent) }}
      >
        <p
          className={
            isRoster
              ? "draft-pick-slot-label draft-pick-slot-label--roster draft-pick-slot-label--wrap mx-auto max-w-full text-center font-body text-[17px] font-semibold leading-[1.15] tracking-normal text-white"
              : "draft-pick-slot-label draft-pick-slot-label--hero draft-pick-slot-label--wrap mx-auto max-w-full text-center font-heading text-base font-bold leading-[1.12] tracking-[0.04em] text-white"
          }
          style={{
            textShadow: readableTextShadow(accent),
            ...(isRoster
              ? {}
              : {
                  WebkitTextStroke: "0.4px rgb(0 0 0 / 0.35)",
                }),
          }}
        >
          {lines.map((line, i) => (
            <span key={`${line}-${i}`} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>
      <div
        className="pointer-events-none absolute inset-x-3 bottom-2 h-px opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${colorAlpha(accent, 0.55)}, transparent)`,
        }}
      />
    </motion.div>
  );
}
