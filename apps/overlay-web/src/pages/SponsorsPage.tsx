import { AnimatePresence, motion } from "framer-motion";
import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function SponsorsPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("sponsors", state);

  const sponsor = state.sponsor;
  const banners = sponsor?.banners ?? [];
  const idx = sponsor?.activeIndex ?? 0;
  const current = banners[idx];

  return (
    <HudCanvas blend>
      <AnimatePresence>
        {visible && current ? (
          <motion.div
            key={idx}
            className="absolute inset-0 flex items-center justify-center bg-neutral-950/70 backdrop-blur-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex flex-col gap-16 text-center drop-shadow-xl">
              {current.imageUrl ? (
                <img
                  src={current.imageUrl}
                  alt={current.title}
                  className="mx-auto max-h-[420px] object-contain"
                />
              ) : (
                <>
                  <p className="text-sm uppercase tracking-[0.85em] text-neutral-700">
                    Official Partner
                  </p>
                  <p className="text-[11rem] font-black italic text-transparent bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text">
                    {current.title}
                  </p>
                  {current.subtitle ? (
                    <p className="-mt-6 text-[3rem] font-medium text-neutral-400">
                      {current.subtitle}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </HudCanvas>
  );
}
