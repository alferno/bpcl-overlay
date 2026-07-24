import type { DraftSlot } from "@bpc/shared-types";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function DraftHistoryTags({
  currentSlot,
}: {
  currentSlot: DraftSlot | null;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (currentSlot?.heroId && (currentSlot.priorBan || currentSlot.stolen || currentSlot.samePick)) {
      setShow(true);
      const t = setTimeout(() => {
        setShow(false);
      }, 10000); // 10 seconds
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [currentSlot?.heroId, currentSlot?.priorBan, currentSlot?.stolen, currentSlot?.samePick]);

  if (!currentSlot?.heroId) return null;

  let tagText = "";
  let tagColor = "";
  let borderColor = "";
  
  // Logic priority based on user request:
  if (currentSlot.priorBan) {
    tagText = "PRIOR BAN";
    tagColor = "bg-red-600/90 text-white border-red-500 shadow-[0_0_12px_rgba(220,38,38,0.8)]";
    borderColor = "border-red-500 shadow-[inset_0_0_20px_rgba(220,38,38,0.5)]";
  } else if (currentSlot.stolen) {
    tagText = "STOLEN";
    tagColor = "bg-yellow-500/90 text-black border-yellow-400 shadow-[0_0_12px_rgba(234,179,8,0.8)]";
    borderColor = "border-yellow-400 shadow-[inset_0_0_20px_rgba(234,179,8,0.5)]";
  } else if (currentSlot.samePick) {
    tagText = "SAME";
    tagColor = "bg-green-600/90 text-white border-green-500 shadow-[0_0_12px_rgba(22,163,74,0.8)]";
    borderColor = "border-green-500 shadow-[inset_0_0_20px_rgba(22,163,74,0.5)]";
  }

  return (
    <AnimatePresence>
      {show && tagText ? (
        <motion.div
          key="history-tags"
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="absolute inset-0 z-[14] pointer-events-none"
        >
          <motion.div 
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1 }
            }}
            transition={{ duration: 0.4 }}
            className={`absolute inset-0 border-2 rounded-md ${borderColor}`}
          />
          <motion.div 
            variants={{
              hidden: { opacity: 0, y: 10, scale: 0.9, filter: "blur(4px)" },
              visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute inset-x-0 bottom-[22%] flex justify-center"
          >
            <span className={`w-full text-center py-1 border-y text-xs md:text-sm font-black tracking-widest uppercase shadow-lg backdrop-blur-md ${tagColor}`}>
              {tagText}
            </span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
