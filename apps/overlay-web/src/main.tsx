import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import OverlaySocketLayer from "./OverlaySocketLayer";
import OverlayRoutes from "./OverlayRoutes";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <OverlaySocketLayer>
      <OverlayRoutes />
    </OverlaySocketLayer>
  </StrictMode>,
);
