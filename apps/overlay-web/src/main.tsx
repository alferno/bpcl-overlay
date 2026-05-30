import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ensureOverlayHeroIndex } from "./hero-portrait";
import OverlaySocketLayer from "./OverlaySocketLayer";
import OverlayRoutes from "./OverlayRoutes";

void ensureOverlayHeroIndex();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlaySocketLayer>
      <OverlayRoutes />
    </OverlaySocketLayer>
  </StrictMode>,
);
