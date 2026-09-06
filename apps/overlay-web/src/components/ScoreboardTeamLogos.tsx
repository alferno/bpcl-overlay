import { useOverlayState } from '../OverlaySocketLayer';
import { withBaseUrl } from '../asset-paths';

export function ScoreboardTeamLogos() {
  const { state } = useOverlayState();
  const radiantLogo = withBaseUrl(state.draft?.radiant?.logoUrl ?? state.draft?.series?.logoUrlA ?? '/teams/ashborn.png');
  const direLogo = withBaseUrl(state.draft?.dire?.logoUrl ?? state.draft?.series?.logoUrlB ?? '/teams/crimson_veil.png');

  // You can adjust these coordinates!
  // In a standard 1080p Dota 2 HUD, the team logos are right outside the 5 hero portraits
  const leftX = 385;
  const rightX = 415;

  const gameState = state.minimapState?.gameState;
  const isLive = gameState === 'DOTA_GAMERULES_STATE_PRE_GAME' || gameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';

  if (!radiantLogo && !direLogo) return null;
  if (!isLive) return null;

  return (
    <div className="absolute pointer-events-none" style={{ top: 0, left: 0, right: 0, height: 100, zIndex: 40 }}>
      {radiantLogo && (
        <div style={{ position: 'absolute', top: 4, left: leftX, width: 76, height: 76 }} className="flex items-center justify-center bg-black">
          <img src={radiantLogo} className="max-w-full max-h-full drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] object-contain scale-90" />
        </div>
      )}
      {direLogo && (
        <div style={{ position: 'absolute', top: 4, right: rightX, width: 76, height: 76 }} className="flex items-center justify-center bg-black">
          <img src={direLogo} className="max-w-full max-h-full drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] object-contain scale-90" />
        </div>
      )}
    </div>
  );
}
