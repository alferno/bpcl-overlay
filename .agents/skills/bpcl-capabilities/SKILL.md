---
name: bpcl-capabilities
description: Overview of current BPCL broadcast overlay capabilities and gaps vs professional esports standards. Use this when planning new features, evaluating improvements, or comparing with pro-level production.
---

# BPCL Broadcast Capabilities Overview

Use this document when discussing new features or comparing BPCL's current toolset against professional esports production standards (LCK, DPC, ESL, PGL, etc.).

---

## ✅ Current BPCL Capabilities

### Draft Phase
| Feature | Status | Notes |
|---|---|---|
| Hero draft overlay | ✅ Live | Real-time bans/picks from GSI |
| Hero portraits (PNG renders) | ✅ Live | Custom per-hero renders, scaled to cards |
| Ban card display | ✅ Live | Separate from pick cards |
| Draft history tags | ✅ Live | Previous picks shown on each card |
| Team color theming | ✅ Live | Per-team accent colors |
| Pick card flip animation | ✅ Live | Cards flip on hero selection |
| Auto-transition: Draft → Versus | ✅ Live | 5s after draft ends |

### Versus Screen
| Feature | Status | Notes |
|---|---|---|
| Team vs Team display | ✅ Live | Shows both rosters |
| Player BPC card embed | ✅ Live | BPCLeague.in card via iframe |
| Steam32 community card | ✅ Live | Fetched from community API |
| Fallback player card | ✅ Live | Name-only card when image unavailable |
| Auto card flip (hero reveal) | ✅ Live | 20s after versus shows, frontend timer |
| Auto-transition: Versus → Game | ✅ Live | 20s after flip (45s total from draft) |

### In-Game Overlays
| Feature | Status | Notes |
|---|---|---|
| Live Player Card (hero focus) | ✅ Live | Auto-shows/hides on hero focus via GSI |
| KDA Card | ✅ Live | Shows K/D/A, CS, denies. Tied to hero focus |
| Minimap utility icons | ✅ Live | Roshan, Tormentor, Scan, Glyph with timers |
| Standout Player card | ✅ Live | Manually triggered via admin |
| Player Stats Card | ✅ Live | Lifetime + match hero stats |
| Hero Stats Card | ✅ Live | Tournament hero history |
| Player H2H (Matchup) | ✅ Live | Head-to-head player comparison |
| Lower Thirds | ✅ Live | Scrolling text/info bar |
| Scan/Glyph cooldown tracking | ✅ Live | Split radiant/dire ring indicators |
| Roshan & Tormentor timers | ✅ Live | Respawn countdown display |
| Enemy hero kills panel | ✅ Live | Shows hero icons the focused player killed |

### Post-Game
| Feature | Status | Notes |
|---|---|---|
| Post-game MVP auto-selection | ✅ Live | Auto-scores best performer |
| Bounty/Wisdom run tracking | ✅ Live | Match history pushed from system testing |
| Replay auto-save | ✅ Live | Triggered after game ends |

### Infrastructure
| Feature | Status | Notes |
|---|---|---|
| OBS browser source integration | ✅ Live | All overlays served via local API |
| Real-time state via Socket.IO | ✅ Live | Sub-100ms latency |
| Admin panel | ✅ Live | Full control of all overlay states |
| System testing panel | ✅ Live | Bounty/Wisdom card history + counters |
| Desktop launcher (auto-update) | ✅ Live | Electron app, GitHub release pipeline |
| GSI integration (Dota 2) | ✅ Live | Auto-installs cfg, parses all events |
| Player community mapping | ✅ Live | Steam32 → player profile lookup |
| No-cache overlay serving | ✅ Live | Express headers force fresh index.html |

---

## ❌ Gaps vs Professional Esports Broadcast

### Draft Phase Gaps
| Feature | Pro Standard | Gap |
|---|---|---|
| Timer per pick/ban | ✅ LCK, DPC | ❌ No draft clock shown |
| "On the clock" animation | ✅ LCK | ❌ No animated indicator for active team |
| Role icons on draft cards | ✅ PGL | ❌ Roles not displayed |
| Pick order numbers | ✅ Most pro leagues | ❌ Not shown |
| Player name on pick slot | ✅ DPC | ⚠️ Limited (shown on some views) |
| Animated hero reveal on pick | ✅ ESL | ⚠️ Only flip animation, no cinematic |

### In-Game Overlay Gaps
| Feature | Pro Standard | Gap |
|---|---|---|
| Net worth graph (real-time) | ✅ All major | ❌ Not implemented |
| Gold/XP advantage bar | ✅ All major | ❌ Not implemented |
| Tower kill tracker | ✅ DPC, ESL | ❌ Not tracked |
| Team fight detector | ✅ PGL, Valve | ❌ Not implemented |
| Item tracking on focused hero | ✅ LCK, DPC | ❌ No item display in live card |
| Level indicator on focused hero | ✅ Standard | ❌ Not shown |
| Buff/debuff tracking | ✅ Valve production | ❌ Not implemented |
| Multi-kill/spree announcements | ✅ Most leagues | ❌ Not implemented |
| Mega creep announcements | ✅ Some leagues | ❌ Not implemented |
| XPM / GPM stats on card | ✅ DPC | ❌ Not on live card |

### Replay & Highlights
| Feature | Pro Standard | Gap |
|---|---|---|
| Real-time highlight clips | ✅ Valve, ESL | ⚠️ Replay auto-save exists but no clip cuts |
| Slow-motion replay trigger | ✅ LCK | ❌ Not implemented |
| Kill replay auto-trigger | ✅ PGL | ❌ Manual only |

### Production Tools
| Feature | Pro Standard | Gap |
|---|---|---|
| Scene transition manager | ✅ All major | ⚠️ Manual OBS scene switching |
| Broadcast rundown / cue sheet | ✅ Production teams | ❌ No rundown tool |
| Stats in commentary headset | ✅ Large orgs | ❌ Not applicable (small setup) |
| Observer camera automation | ✅ Valve | ❌ Not implemented |
| Sponsor logo rotation | ✅ Most leagues | ✅ Implemented (sponsorWidget) |
| Rank medal display | ✅ DPC, regional | ✅ Implemented |

---

## 🚀 Suggested Quick Wins (High Impact, Low Effort)

1. **Draft pick timer** — Show a countdown per pick/ban slot (data available in GSI)
2. **Item slots on Live Player Card** — GSI provides item data; display the 6 main item slots
3. **Hero level on Live Player Card** — GSI provides hero level; add a small badge
4. **Gold/XP net worth bar** — GSI provides team totals; single bar component
5. **Kill/Death streak announcements** — GSI kill_list already tracked, just need UI
