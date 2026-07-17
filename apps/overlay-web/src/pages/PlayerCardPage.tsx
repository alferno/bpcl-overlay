/**
 * PlayerCardPage — OBS browser source at /playercard
 *
 * Renders the BPCL player card (Default / Basic / Gold / Holo) driven by:
 *   - Live GSI state: state.livePlayerCard.steam32 for the focused player
 *   - BPCL Community API: cardTier, avatarUrl, stats via getBpclMember(steam32)
 *
 * This is an additive feature — it does NOT replace any existing page.
 * Add it as a new OBS browser source pointing to /playercard.
 *
 * The card is rendered full-viewport centered, transparent background,
 * so OBS can freely position and scale the source.
 */

import { useEffect, useState } from 'react'
import { HudCanvas } from '../HudPrimitives'
import { useOverlayState } from '../OverlaySocketLayer'
import { useRouteVisible } from '../hooks/useRouteVisible'
import { useBpclCard } from '../card/hooks/useBpclCard'
import { Card } from '../card/components/Card/Card'
import type { CardData } from '../card/types/card'
import type { BpclMember } from '../card/api/bpclMembers'
import { FallbackPlayerCard } from '../components/FallbackPlayerCard'

// Inline centering styles — transparent canvas, card centered.
// OBS browser source handles position/scale at the source level.
const containerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
}

const cardWrapStyle: React.CSSProperties = {
  // Allow OBS crop/scale to work cleanly
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// How long to keep the card visible after the steam32 clears (ms)
const LINGER_MS = 800

function PlayerCardInner() {
  const { state } = useOverlayState()
  const liveVisible = useRouteVisible('liveplayercard', state)
  const card = state.livePlayerCard

  const steam32 = card?.steam32 ?? 0
  const playerName = card?.playerLabel ?? 'Player'
  const { cardData: resolvedCardData, member: resolvedMember } = useBpclCard(
    steam32,
    playerName,
  )

  const [cardData, setCardData] = useState<CardData | null>(null)
  const [member, setMember] = useState<BpclMember | undefined>(undefined)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!liveVisible || !steam32 || steam32 <= 0) {
      // Linger before hiding
      const t = setTimeout(() => {
        setVisible(false)
        setCardData(null)
        setMember(undefined)
      }, LINGER_MS)
      return () => clearTimeout(t)
    }

    setCardData(resolvedCardData)
    setMember(resolvedMember)
    setVisible(true)
    return undefined
  }, [liveVisible, steam32, playerName, resolvedCardData, resolvedMember])

  if (!cardData || !visible) return null

  // A resolved BPCL member renders through the themed Card (default / basic /
  // gold / holo). No member match at all is a different state — show the
  // plain FallbackPlayerCard instead of letting it masquerade as "default".
  return (
    <div style={containerStyle}>
      <div style={cardWrapStyle}>
        {member ? (
          <Card data={cardData} />
        ) : (
          <FallbackPlayerCard playerName={playerName} />
        )}
      </div>
    </div>
  )
}

export default function PlayerCardPage() {
  return (
    <HudCanvas blend>
      <PlayerCardInner />
    </HudCanvas>
  )
}
