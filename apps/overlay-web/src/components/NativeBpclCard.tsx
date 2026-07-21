import type { CSSProperties, ReactNode } from "react";
import { Card } from "../card/components/Card/Card";
import { useBpclCard } from "../card/hooks/useBpclCard";
import { isFetchInFlight } from "../card/api/bpclMembers";

interface NativeBpclCardProps {
  steam32?: number | null;
  playerName?: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
}

/**
 * Prefers the local, community-backed card renderer. The prior screen-specific
 * renderer remains available whenever the player cannot be resolved.
 *
 * While the community fetch is still in-flight we render nothing so the
 * fallback doesn't flash on-screen before the data arrives.
 */
export function NativeBpclCard({
  steam32,
  playerName,
  className,
  style,
  fallback,
}: NativeBpclCardProps) {
  const { cardData, member, ready } = useBpclCard(steam32, playerName);

  // Still loading — hold rendering so the fallback iframe doesn't flash
  if (!ready && isFetchInFlight()) return null;

  if (!member || !cardData) return <>{fallback}</>;

  return (
    <div className={className} style={style}>
      <Card data={cardData} />
    </div>
  );
}
