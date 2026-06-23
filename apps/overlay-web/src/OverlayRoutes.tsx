import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import DraftPage from "./pages/DraftPage";
import GameCanvas from "./pages/GameCanvas";
import HeroStatsPage from "./pages/HeroStatsPage";
import LowerThirdPage from "./pages/LowerThirdPage";
import MatchupPage from "./pages/MatchupPage";
import PausePage from "./pages/PausePage";
import PlayerStatsPage from "./pages/PlayerStatsPage";
import PostgamePage from "./pages/PostgamePage";
import SponsorsPage from "./pages/SponsorsPage";
import StartingSoonPage from "./pages/StartingSoonPage";
import VersusPage from "./pages/VersusPage";
import ReplayPage from "./pages/ReplayPage";

export default function OverlayAppRoutes() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/draft" element={<DraftPage />} />
        <Route path="/game" element={<GameCanvas />} />
        <Route path="/lowerthird" element={<LowerThirdPage />} />
        <Route path="/playerstats" element={<PlayerStatsPage />} />
        <Route path="/herostats" element={<HeroStatsPage />} />
        <Route path="/matchup" element={<MatchupPage />} />
        <Route path="/pause" element={<PausePage />} />
        <Route path="/startingsoon" element={<StartingSoonPage />} />
        <Route path="/postgame" element={<PostgamePage />} />
        <Route path="/sponsors" element={<SponsorsPage />} />
        <Route path="/versus" element={<VersusPage />} />
        <Route path="/replay" element={<ReplayPage />} />
        <Route path="*" element={<GameCanvas />} />
      </Routes>
    </Router>
  );
}
