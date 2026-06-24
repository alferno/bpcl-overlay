import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

/** Base 1080p safe area for OBS browser sources configured to 1920x1080. */
export function HudCanvas({
  blend = true,
  children,
}: {
  blend?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden box-border h-[1080px] w-[1920px] text-white antialiased ${
        blend ? "bg-transparent" : "bg-slate-950/60 shadow-2xl"
      }`}
    >
      {children}
    </div>
  );
}

export function FadePanel({
  show,
  panelKey = "panel",
  children,
}: {
  show: boolean;
  panelKey?: string;
  children?: ReactNode;
}) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key={panelKey}
          className="absolute inset-0 h-full w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
