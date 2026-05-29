import type { ReactNode } from "react";

import { DRAFT_BOTTOM_SAFE_PX } from "../overlay-layout";

export function StatsOverlayRegion({
  children,
  align = "start",
}: {
  children?: ReactNode;
  /** `start` = top-left (hero stats), `center` = top-center (player stats) */
  align?: "start" | "center";
}) {
  const justify = align === "center" ? "justify-center" : "justify-start";
  return (
    <div
      className={`box-border flex h-full w-full items-start overflow-hidden px-8 pt-8 ${justify}`}
      style={{ paddingBottom: DRAFT_BOTTOM_SAFE_PX }}
    >
      {children}
    </div>
  );
}
