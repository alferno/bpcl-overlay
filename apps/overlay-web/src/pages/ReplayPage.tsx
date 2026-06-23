import { motion } from "framer-motion";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";

export default function ReplayPage() {
  return (
    <HudCanvas blend>
      <FadePanel show={true}>
        <div className="flex h-full items-start pt-16 pl-24">
          <ReplayAnimated />
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

function ReplayAnimated() {
  return (
    <motion.div
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -80, opacity: 0 }}
      className="max-w-md rounded-2xl border-l-8 border-red-600 bg-black/80 px-8 py-5 shadow-xl backdrop-blur flex items-center gap-5"
    >
      <div className="h-5 w-5 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse" />
      <p className="text-[2.5rem] font-black leading-none text-white tracking-wider">REPLAY</p>
    </motion.div>
  );
}
