import { motion } from "framer-motion";
import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { useRouteVisible } from "../hooks/useRouteVisible";

export default function LowerThirdPage() {
  const { state } = useOverlayState();
  const visible = useRouteVisible("lowerthird", state);

  const lt = state.lowerThirds;

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <div className="flex h-full items-end pb-32 pl-28">
          {lt ? (
            <LowerThirdAnimated
              headline={lt.headline}
              subtitle={lt.subtitle}
              accent={lt.accent}
            />
          ) : (
            <div className="rounded-lg bg-neutral-950/65 px-6 py-3 text-neutral-600">
              Lower third standby
            </div>
          )}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}

function LowerThirdAnimated({
  headline,
  subtitle,
  accent,
}: {
  headline: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <motion.div
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -80, opacity: 0 }}
      className={`max-w-4xl rounded-2xl border-l-8 bg-black/80 px-12 py-6 shadow-xl backdrop-blur ${
        accent ? "" : "border-yellow-400"
      }`}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <p className="text-[3.75rem] font-black leading-none">{headline}</p>
      {subtitle ? (
        <p className="mt-4 text-[2rem] font-semibold text-neutral-400">{subtitle}</p>
      ) : null}
    </motion.div>
  );
}
