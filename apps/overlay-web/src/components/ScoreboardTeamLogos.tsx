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
  
  // Hiding logos as requested
  return null;
}
