import { FadePanel, HudCanvas } from "../HudPrimitives";
import { useOverlayState } from "../OverlaySocketLayer";
import { HeroPortrait } from "../components/HeroPortrait";
import {
  heroPortraitHintsFromFields,
  resolveOverlayPortraitForHero,
} from "../hero-portrait";
import { StatsOverlayRegion } from "../components/StatsOverlayRegion";
import { PLAYER_STATS_SHELL_CLASS } from "../overlay-layout";
import { routeVisible } from "../visibility";

export default function PlayerStatsPage() {
  const { state } = useOverlayState();
  const visible = routeVisible("playerstats", state);
  const card = state.playerStatsCard;
  const portraitUrl = card
    ? resolveOverlayPortraitForHero(
        card.heroId,
        card.heroName,
        heroPortraitHintsFromFields(card),
      )
    : undefined;

  return (
    <HudCanvas blend>
      <FadePanel show={visible}>
        <StatsOverlayRegion align="center">
          {card ? (
            <div
              className={`flex max-w-[640px] items-center gap-6 ${PLAYER_STATS_SHELL_CLASS}`}
            >
              {portraitUrl ? (
                <HeroPortrait
                  url={portraitUrl}
                  heroName={card.heroName}
                  size={112}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                  Player
                </p>
                <p className="mt-2 text-3xl font-black">{card.playerLabel}</p>
                {card.heroName ? (
                  <p className="text-xl text-cyan-100">{card.heroName}</p>
                ) : null}
                {card.statLines && card.statLines.length > 0 ? (
                  <div className="mt-5 grid gap-2.5 text-base font-semibold">
                    {card.statLines.map((l, idx) => (
                      <div
                        key={idx}
                        className="flex min-w-[16rem] justify-between border-b border-white/15 pb-1.5"
                      >
                        <span className="text-neutral-400">{l.label}</span>
                        <span>{l.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {card.notes ? (
                  <p className="mt-4 max-w-md text-sm text-neutral-400">
                    {card.notes}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <span className="text-2xl text-neutral-700">Awaiting producer card</span>
          )}
        </StatsOverlayRegion>
      </FadePanel>
    </HudCanvas>
  );
}
