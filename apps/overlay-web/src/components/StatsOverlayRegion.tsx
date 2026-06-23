import type { ReactNode } from "react";

import { DRAFT_BOTTOM_SAFE_PX } from "../overlay-layout";

export function StatsOverlayRegion({
  children,
}: {
  children?: ReactNode;
}) {
  const justify = "justify-end";
  return (
    <div
      className={`box-border flex h-full w-full items-start overflow-hidden px-8 pt-8 ${justify}`}
      style={{ paddingBottom: DRAFT_BOTTOM_SAFE_PX }}
    >
      {children}
    </div>
  );
}
