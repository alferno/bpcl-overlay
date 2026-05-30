import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroPortrait } from "../components/HeroPortrait";
import {
  heroPortraitHintsFromFields,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import { routeVisible } from "../visibility";

export default function MatchupPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("matchup", state);
  const m = state.matchupCard;

  const lines = m?.statLines ?? [];
  const portraitA = m
    ? resolveOverlayPortraitForHero(
        m.heroAId,
        m.heroAName,
        heroPortraitHintsFromFields({
          heroPortraitSlug: m.heroAPortraitSlug,
          heroPortraitUrl: m.heroAPortraitUrl,
        }),
      )
    : undefined;
  const portraitB = m
    ? resolveOverlayPortraitForHero(
        m.heroBId,
        m.heroBName,
        heroPortraitHintsFromFields({
          heroPortraitSlug: m.heroBPortraitSlug,
          heroPortraitUrl: m.heroBPortraitUrl,
        }),
      )
    : undefined;

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <div className="flex h-full items-center justify-center gap-16 p-14">
          {m ? (
            <>
              <div className="flex flex-col items-center gap-4">
                <HeroPortrait
                  url={portraitA}
                  heroName={m.heroAName}
                  size={200}
                />
                <p className="text-4xl font-black text-emerald-300">
                  {m.heroAName ?? `#${m.heroAId}`}
                </p>
              </div>

              <div className="min-w-[28rem] rounded-[2rem] bg-black/80 p-12 text-xl text-neutral-200 shadow-2xl backdrop-blur">
                <p className="mb-6 text-center text-xs uppercase tracking-[0.5em] text-neutral-400">
                  Matchup
                </p>
                {lines.length > 0 ? (
                  lines.map((row, i) => (
                    <div
                      key={i}
                      className="flex justify-between gap-16 border-b border-white/10 py-3"
                    >
                      <span className="text-neutral-500">{row.label}</span>
                      <span className="font-bold tabular-nums">{row.value}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-neutral-500">No stat lines</p>
                )}
              </div>

              <div className="flex flex-col items-center gap-4">
                <HeroPortrait
                  url={portraitB}
                  heroName={m.heroBName}
                  size={200}
                />
                <p className="text-4xl font-black text-rose-300">
                  {m.heroBName ?? `#${m.heroBId}`}
                </p>
              </div>
            </>
          ) : (
            <p className="w-full text-center text-4xl text-neutral-600">
              Matchup overlay idle
            </p>
          )}
        </div>
      </FadePanel>
    </HudCanvas>
  );
}
