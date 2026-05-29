import { motion } from "framer-motion";

export function HeroPortrait({
  url,
  heroName,
  size = 120,
  dimmed,
  banned,
}: {
  url?: string;
  heroName?: string;
  size?: number;
  dimmed?: boolean;
  banned?: boolean;
}) {
  if (!url) {
    return (
      <div
        className="rounded-lg border border-white/[0.06] bg-black/40"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-lg border border-white/[0.08] shadow-lg"
      style={{ width: size, height: size }}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: dimmed ? 0.8 : 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <img
        src={url}
        alt={heroName ?? "hero"}
        className={`h-full w-full object-cover ${banned ? "scale-[0.92] object-[center_12%] grayscale-[0.65] saturate-50 opacity-75" : ""}`}
      />
      {banned ? (
        <div
          className="pointer-events-none absolute inset-0 bg-red-950/25"
          aria-hidden
        />
      ) : null}
    </motion.div>
  );
}
