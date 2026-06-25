import { AnimatePresence, motion } from "framer-motion";
import { HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { routeVisible } from "../visibility";

export default function SponsorsPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("sponsors", state);

  const sponsor = state.sponsor;
  const banners = sponsor?.banners ?? [];

  const renderSponsors = (keyPrefix: string) => (
    <span className="inline-flex items-center" key={keyPrefix}>
      {banners.map((b, i) => (
        <span key={`${keyPrefix}-${i}`} className="inline-flex items-center">
          <span 
            style={{ color: b.color || '#ffffff' }} 
            className={b.isCoSponsor ? "font-black text-3xl mx-6 drop-shadow-[0_0_8px_currentColor]" : "font-semibold text-2xl mx-6"}
          >
            {b.title}
          </span>
          <span className="text-white/30 text-2xl"> • </span>
        </span>
      ))}
    </span>
  );

  const copies = 20; // Enough copies to ensure it is wider than any screen
  const repeatedSponsors = Array.from({ length: copies }).map((_, i) => renderSponsors(`set-${i}`));

  // Calculate dynamic duration to maintain constant scroll speed regardless of sponsor count
  const duration = Math.max(30, banners.length * copies * 1.5);

  return (
    <HudCanvas blend>
      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll {
          display: inline-flex;
          white-space: nowrap;
          animation: scroll-left linear infinite;
        }
      `}</style>

      <AnimatePresence>
        {visible && banners.length > 0 && (
          <motion.div
            className="absolute bottom-0 inset-x-0 h-16 bg-slate-950/90 border-t border-white/10 flex items-center shadow-[0_-10px_30px_rgba(0,0,0,0.5)] backdrop-blur-md"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: "spring", bounce: 0, duration: 0.8 }}
          >
            {/* Fixed prefix */}
            <div className="z-20 bg-slate-950 h-full flex items-center px-8 border-r border-white/10 shadow-[10px_0_20px_rgba(0,0,0,0.5)] shrink-0">
              <span className="font-display font-black text-2xl uppercase tracking-widest text-slate-300">
                Sponsored By:-
              </span>
            </div>
            
            {/* Scrolling Marquee */}
            <div className="flex-1 overflow-hidden h-full flex items-center relative z-10">
              <div 
                className="animate-scroll"
                style={{ animationDuration: `${duration}s` }}
              >
                {repeatedSponsors}
              </div>
              {/* Fade out edges for smoothness */}
              <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-slate-950/90 to-transparent pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950/90 to-transparent pointer-events-none" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </HudCanvas>
  );
}
