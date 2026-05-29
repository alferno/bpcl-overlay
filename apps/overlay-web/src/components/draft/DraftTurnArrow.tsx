import { AnimatePresence, motion } from "framer-motion";

import { colorAlpha } from "../../draft/team-colors";

/** Turn pointer flanking DRAFT — left slot points toward radiant, right toward dire */
export function DraftTurnArrow({
  side,
  active,
  activeColor,
}: {
  side: "left" | "right";
  active: boolean;
  activeColor?: string;
}) {
  const color = activeColor ?? "#22d3ee";
  const pointsLeft = side === "left";

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center ${
        side === "left" ? "justify-end" : "justify-start"
      }`}
    >
      <AnimatePresence mode="wait">
        {active ? (
          <motion.div
            key="on"
            className="pointer-events-none"
            initial={{ opacity: 0, scale: 0.65 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.65 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
          >
            <div
              className="h-0 w-0"
              style={
                pointsLeft
                  ? {
                      borderTop: "9px solid transparent",
                      borderBottom: "9px solid transparent",
                      borderRight: `14px solid ${color}`,
                      filter: `drop-shadow(0 0 12px ${colorAlpha(color, 0.75)})`,
                    }
                  : {
                      borderTop: "9px solid transparent",
                      borderBottom: "9px solid transparent",
                      borderLeft: `14px solid ${color}`,
                      filter: `drop-shadow(0 0 12px ${colorAlpha(color, 0.75)})`,
                    }
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
