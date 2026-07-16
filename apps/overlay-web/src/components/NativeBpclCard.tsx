import type { CSSProperties, ReactNode } from "react";
import { Card } from "../card/components/Card/Card";
import { useBpclCard } from "../card/hooks/useBpclCard";

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
 */
export function NativeBpclCard({
  steam32,
  playerName,
  className,
  style,
  fallback,
}: NativeBpclCardProps) {
  const { cardData, member } = useBpclCard(steam32, playerName);

  if (!member || !cardData) return <>{fallback}</>;

  return (
    <div className={className} style={style}>
      <Card data={cardData} />
    </div>
  );
}
