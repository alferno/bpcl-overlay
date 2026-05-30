import type {
  DraftSlot,
  DraftState,
  LastPick,
  MatchSetup,
  RosterPlayer,
} from "@bpc/shared-types";
import {
  getTeamByKey,
  teamLogoUrl,
} from "../services/roster-teams.js";
import {
  heroPortraitMediaFromSlug,
  type HeroPortraitMedia,
} from "@bpc/shared-types";
import {
  canonicalHeroSlugForDraft,
  heroDisplayName,
  heroPortraitUrl,
  resolveHeroSlugForDraft,
} from "../services/hero-registry.js";

type GsiPayload = Record<string, unknown>;

const DRAFT_STATES = new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_PRE_GAME",
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function slotHeroId(slot: unknown): number | null {
  const r = asRecord(slot);
  if (!r) return null;
  const id = r.hero_id ?? r.heroid ?? r.id;
  if (typeof id === "number" && id > 0) return id;
  if (typeof id === "string") {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function heroClassString(v: unknown): string | undefined {
  if (typeof v === "string" && v.length > 0) return v;
  return undefined;
}

const gsiHeroSlugDebugLogged = new Set<string>();

function gsiHeroSlugDebugEnabled(): boolean {
  return process.env.GSI_HERO_SLUG_DEBUG === "1";
}

function maybeLogHeroSlugResolution(
  slotKey: string,
  heroId: number | null,
  heroClass: string | undefined,
  resolved: ReturnType<typeof resolveHeroSlugForDraft>,
): void {
  if (!gsiHeroSlugDebugEnabled()) return;
  if (gsiHeroSlugDebugLogged.has(slotKey)) return;
  gsiHeroSlugDebugLogged.add(slotKey);
  console.log("[gsi:hero-slug]", {
    slot: slotKey,
    heroId,
    heroClass,
    resolvedSlug: resolved.slug,
    source: resolved.source,
  });
}

type HeroMediaWithSlug = HeroPortraitMedia & { slug?: string };

function mediaForHero(
  heroId: number | null,
  heroClass?: string,
  heroName?: string,
  debugSlotKey?: string,
): HeroMediaWithSlug {
  const resolved = resolveHeroSlugForDraft({
    heroId: heroId ?? undefined,
    heroClass,
    heroName,
  });

  if (debugSlotKey) {
    maybeLogHeroSlugResolution(debugSlotKey, heroId, heroClass, resolved);
  }

  const slug = resolved.slug ?? canonicalHeroSlugForDraft({ heroId, heroClass });
  if (slug) {
    return { ...heroPortraitMediaFromSlug(slug), slug };
  }
  if (heroId) {
    const flat = heroPortraitUrl(heroId, heroName);
    if (flat) {
      return {
        staticUrl: flat,
        staticFallbackUrl: flat,
        slug: resolveHeroSlugForDraft({ heroId, heroName }).slug,
      };
    }
  }
  return {};
}

function displayNameForHero(heroId: number | null, heroClass?: string): string | undefined {
  if (heroId) return heroDisplayName(heroId);
  if (heroClass) {
    return heroClass
      .replace(/^npc_dota_hero_/, "")
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return undefined;
}

/** Build a synthetic pick/ban object from flat team2/team3 keys (pick0_id, ban0_class, …). */
function flatDraftSlotObject(
  sideData: Record<string, unknown>,
  type: "pick" | "ban",
  order: number,
): Record<string, unknown> | null {
  const prefix = `${type}${order}`;
  const heroId = gsiNumber(sideData[`${prefix}_id`]);
  const heroClass = heroClassString(sideData[`${prefix}_class`]);

  if (!heroId && !heroClass) {
    return null;
  }

  const obj: Record<string, unknown> = {};
  if (heroId > 0) obj.hero_id = heroId;
  if (heroClass) obj.class = heroClass;
  return obj;
}

function parseSideSlots(
  sideData: Record<string, unknown>,
  side: "radiant" | "dire",
): DraftSlot[] {
  const slots: DraftSlot[] = [];
  const seen = new Set<string>();

  const pushSlot = (
    type: DraftSlot["type"],
    order: number,
    heroId: number | null,
    heroClass: string | undefined,
  ) => {
    const key = `${type}-${order}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!heroId && !heroClass) return;

    const media = mediaForHero(
      heroId,
      heroClass,
      displayNameForHero(heroId, heroClass),
      `${side}-${type}${order}`,
    );
    slots.push({
      order,
      type,
      heroId,
      heroName: displayNameForHero(heroId, heroClass),
      heroPortraitSlug: media.slug,
      heroPortraitUrl: media.staticUrl,
      heroPortraitAnimatedUrl: media.animatedUrl,
    });
  };

  // Nested: pick0 / ban0 objects (curl & some lobby formats)
  for (const [key, val] of Object.entries(sideData)) {
    const m = /^(pick|ban)(\d+)$/i.exec(key);
    if (!m) continue;
    const type = m[1]?.toLowerCase() === "ban" ? "ban" : "pick";
    const order = Number(m[2]);
    const heroId = slotHeroId(val);
    const rec = asRecord(val);
    const heroClass = heroClassString(rec?.class ?? rec?.hero_class);
    pushSlot(type, order, heroId, heroClass);
  }

  // Flat: pick0_id / ban0_class (live GSI team2 / team3)
  for (let i = 0; i < 7; i++) {
    const banObj = flatDraftSlotObject(sideData, "ban", i);
    if (banObj) {
      pushSlot(
        "ban",
        i,
        gsiNumber(banObj.hero_id) > 0 ? gsiNumber(banObj.hero_id) : null,
        heroClassString(banObj.class),
      );
    }
  }
  for (let i = 0; i < 5; i++) {
    const pickObj = flatDraftSlotObject(sideData, "pick", i);
    if (pickObj) {
      pushSlot(
        "pick",
        i,
        gsiNumber(pickObj.hero_id) > 0 ? gsiNumber(pickObj.hero_id) : null,
        heroClassString(pickObj.class),
      );
    }
  }

  slots.sort((a, b) => a.order - b.order);
  return slots;
}

function resolveGsiSideData(
  draft: Record<string, unknown>,
  side: "radiant" | "dire",
): Record<string, unknown> {
  const nested =
    side === "radiant"
      ? (asRecord(draft.radiant) ?? asRecord(draft.team2))
      : (asRecord(draft.dire) ?? asRecord(draft.team3));
  return nested ?? {};
}

function activeTeamFromGsi(
  draft: Record<string, unknown>,
): "radiant" | "dire" | null {
  const t = draft.activeteam ?? draft.active_team;
  if (t === 2 || t === "2" || t === "radiant") return "radiant";
  if (t === 3 || t === "3" || t === "dire") return "dire";
  return null;
}

function gsiNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function turnActionFromGsi(draft: Record<string, unknown>): "pick" | "ban" {
  const p = draft.pick;
  if (p === true || p === 1 || p === "1") return "pick";
  if (p === false || p === 0 || p === "0") return "ban";
  return "pick";
}

function reserveSecondsFromGsi(
  draft: Record<string, unknown>,
  activeTeam: "radiant" | "dire" | null,
): number {
  const team2 = asRecord(draft.team2);
  const team3 = asRecord(draft.team3);
  const radiant =
    gsiNumber(draft.radiant_bonus_time) || gsiNumber(team2?.bonus_time);
  const dire =
    gsiNumber(draft.dire_bonus_time) || gsiNumber(team3?.bonus_time);
  if (activeTeam === "radiant") return radiant;
  if (activeTeam === "dire") return dire;
  return Math.max(radiant, dire);
}

const CM_BANS_PER_TEAM = 7;
const CM_PICKS_PER_TEAM = 5;

function countFilled(slots: DraftSlot[], type: DraftSlot["type"]): number {
  return slots.filter(
    (s) => s.type === type && (s.heroId || s.heroPortraitUrl),
  ).length;
}

function draftRosterComplete(
  radiantSlots: DraftSlot[],
  direSlots: DraftSlot[],
): boolean {
  return (
    countFilled(radiantSlots, "pick") >= CM_PICKS_PER_TEAM &&
    countFilled(direSlots, "pick") >= CM_PICKS_PER_TEAM
  );
}

function draftHasStarted(
  radiantSlots: DraftSlot[],
  direSlots: DraftSlot[],
): boolean {
  return (
    countFilled(radiantSlots, "ban") > 0 ||
    countFilled(direSlots, "ban") > 0 ||
    countFilled(radiantSlots, "pick") > 0 ||
    countFilled(direSlots, "pick") > 0
  );
}

/** Strategy / pre-draft countdown (map clock + draft timer before first ban). */
function startSecondsFromGsi(
  map: Record<string, unknown> | null,
  gameState: string,
  draftRec: Record<string, unknown>,
): number | undefined {
  const clock = gsiNumber(map?.clock_time);
  const teamTimer = gsiNumber(
    draftRec.activeteam_time_remaining ?? draftRec.active_team_time_remaining,
  );

  const fromClock = (): number | undefined => {
    if (clock < 0) return Math.max(0, Math.round(-clock));
    if (clock > 0 && clock <= 120) return Math.round(clock);
    return undefined;
  };

  if (gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME") {
    return fromClock() ?? (teamTimer > 0 ? teamTimer : undefined);
  }

  if (gameState === "DOTA_GAMERULES_STATE_PRE_GAME") {
    return fromClock();
  }

  if (gameState === "DOTA_GAMERULES_STATE_HERO_SELECTION") {
    if (teamTimer > 0) return teamTimer;
    return fromClock();
  }

  return undefined;
}

function inferDraftPhase(
  inDraft: boolean,
  gameState: string,
  radiantSlots: DraftSlot[],
  direSlots: DraftSlot[],
  activeTeam: "radiant" | "dire" | null,
): DraftState["phase"] {
  if (!inDraft || draftRosterComplete(radiantSlots, direSlots)) {
    return "done";
  }

  if (
    gameState === "DOTA_GAMERULES_STATE_STRATEGY_TIME" ||
    (gameState === "DOTA_GAMERULES_STATE_PRE_GAME" &&
      !draftHasStarted(radiantSlots, direSlots))
  ) {
    return "starting";
  }

  if (
    gameState === "DOTA_GAMERULES_STATE_HERO_SELECTION" &&
    !draftHasStarted(radiantSlots, direSlots) &&
    !activeTeam
  ) {
    return "starting";
  }

  const radiantBans = countFilled(radiantSlots, "ban");
  const direBans = countFilled(direSlots, "ban");
  if (radiantBans < CM_BANS_PER_TEAM || direBans < CM_BANS_PER_TEAM) {
    return "bans";
  }
  return "picks";
}

/** Hero id on a GSI player0..player4 entry (post-draft hero selection). */
function heroIdFromGsiPlayerEntry(val: unknown): number | null {
  const r = asRecord(val);
  if (!r) return null;
  const heroRec = asRecord(r.hero);
  if (heroRec) {
    const fromHero = slotHeroId(heroRec);
    if (fromHero) return fromHero;
  }
  return slotHeroId(val);
}

function collectGsiPlayerHeroByOrder(
  payload: GsiPayload,
  side: "radiant" | "dire",
): Map<number, number> {
  const byPickOrder = new Map<number, number>();
  const playerRoot = asRecord(payload.player);
  const heroRoot = asRecord(payload.hero);
  const teamBlocks = [
    side === "radiant"
      ? (asRecord(heroRoot?.team2) ?? asRecord(heroRoot?.radiant))
      : (asRecord(heroRoot?.team3) ?? asRecord(heroRoot?.dire)),
    side === "radiant"
      ? (asRecord(playerRoot?.team2) ?? asRecord(playerRoot?.radiant))
      : (asRecord(playerRoot?.team3) ?? asRecord(playerRoot?.dire)),
  ];

  for (const teamData of teamBlocks) {
    if (!teamData) continue;
    for (const [key, val] of Object.entries(teamData)) {
      const m = /^player(\d+)$/i.exec(key);
      if (!m) continue;
      const pickOrder = Number(m[1]);
      const heroId = heroIdFromGsiPlayerEntry(val);
      if (heroId && heroId > 0 && Number.isFinite(pickOrder)) {
        byPickOrder.set(pickOrder, heroId);
      }
    }
  }

  return byPickOrder;
}

/** After CM draft — apply locked hero from GSI player0..4 onto pick slots. */
function applyPlayerHeroLocks(
  slots: DraftSlot[],
  side: "radiant" | "dire",
  payload: GsiPayload,
): DraftSlot[] {
  const byPickOrder = collectGsiPlayerHeroByOrder(payload, side);

  return slots.map((slot) => {
    if (slot.type !== "pick") return slot;
    const heroId = byPickOrder.get(slot.order);
    if (!heroId || heroId <= 0) return slot;

    const media = mediaForHero(
      heroId,
      undefined,
      displayNameForHero(heroId, undefined),
      `${side}-player${slot.order}`,
    );

    return {
      ...slot,
      heroId,
      heroName: displayNameForHero(heroId, undefined),
      heroPortraitSlug: media.slug,
      heroPortraitUrl: media.staticUrl,
      heroPortraitAnimatedUrl: media.animatedUrl,
    };
  });
}

/** Captain's Mode pick order (slot order index per side). */
const CM_PICK_ORDER_RADIANT_FIRST: Array<{
  side: "radiant" | "dire";
  order: number;
}> = [
  { side: "radiant", order: 0 },
  { side: "dire", order: 0 },
  { side: "dire", order: 1 },
  { side: "radiant", order: 1 },
  { side: "radiant", order: 2 },
  { side: "dire", order: 2 },
  { side: "dire", order: 3 },
  { side: "radiant", order: 3 },
  { side: "radiant", order: 4 },
  { side: "dire", order: 4 },
];

const CM_PICK_ORDER_DIRE_FIRST: Array<{
  side: "radiant" | "dire";
  order: number;
}> = [
  { side: "dire", order: 0 },
  { side: "radiant", order: 0 },
  { side: "radiant", order: 1 },
  { side: "dire", order: 1 },
  { side: "dire", order: 2 },
  { side: "radiant", order: 2 },
  { side: "radiant", order: 3 },
  { side: "dire", order: 3 },
  { side: "dire", order: 4 },
  { side: "radiant", order: 4 },
];

function cmPickSequenceIndex(
  side: "radiant" | "dire",
  order: number,
  draftSide: DraftState["side"] | undefined,
): number {
  const seq =
    draftSide === "dire_first_pick"
      ? CM_PICK_ORDER_DIRE_FIRST
      : CM_PICK_ORDER_RADIANT_FIRST;
  const idx = seq.findIndex((p) => p.side === side && p.order === order);
  return idx >= 0 ? idx : order;
}

function filledPickKey(side: "radiant" | "dire", slot: DraftSlot): string | null {
  if (slot.type !== "pick" || !slot.heroId) return null;
  return `${side}:${slot.order}:${slot.heroId}`;
}

function slotToLastPick(
  side: "radiant" | "dire",
  slot: DraftSlot,
): LastPick {
  return {
    side,
    heroId: slot.heroId!,
    heroName: slot.heroName,
    heroPortraitSlug: slot.heroPortraitSlug,
    playerName: slot.playerName,
  };
}

type PickEntry = { side: "radiant" | "dire"; slot: DraftSlot };

function latestPickInCmOrder(
  entries: PickEntry[],
  draftSide: DraftState["side"] | undefined,
): PickEntry {
  let best = entries[0]!;
  let bestIdx = cmPickSequenceIndex(best.side, best.slot.order, draftSide);
  for (const entry of entries.slice(1)) {
    const idx = cmPickSequenceIndex(entry.side, entry.slot.order, draftSide);
    if (idx > bestIdx) {
      best = entry;
      bestIdx = idx;
    }
  }
  return best;
}

function lastPickChanged(a: LastPick | undefined, b: LastPick): boolean {
  if (!a) return true;
  return a.heroId !== b.heroId || a.side !== b.side;
}

/** Newest pick since previous GSI snapshot (not "last dire slot in array"). */
function detectLastPick(
  radiant: DraftSlot[],
  dire: DraftSlot[],
  prev: DraftState | null,
): LastPick | undefined {
  const current: PickEntry[] = [];
  for (const s of radiant) {
    if (s.type === "pick" && s.heroId) current.push({ side: "radiant", slot: s });
  }
  for (const s of dire) {
    if (s.type === "pick" && s.heroId) current.push({ side: "dire", slot: s });
  }
  if (current.length === 0) return undefined;

  const prevKeys = new Set<string>();
  for (const side of ["radiant", "dire"] as const) {
    const slots =
      side === "radiant" ? prev?.radiant?.slots : prev?.dire?.slots;
    for (const s of slots ?? []) {
      const k = filledPickKey(side, s);
      if (k) prevKeys.add(k);
    }
  }

  const newlyFilled = current.filter(
    ({ side, slot }) => !prevKeys.has(filledPickKey(side, slot)!),
  );

  const draftSide = prev?.side;

  if (newlyFilled.length === 0) {
    if (
      draftRosterComplete(radiant, dire) &&
      prev &&
      !draftRosterComplete(prev.radiant?.slots ?? [], prev.dire?.slots ?? [])
    ) {
      const e = latestPickInCmOrder(current, draftSide);
      const final = slotToLastPick(e.side, e.slot);
      if (lastPickChanged(prev.lastPick, final)) return final;
    }
    return prev?.lastPick;
  }

  if (newlyFilled.length === 1) {
    const one = newlyFilled[0]!;
    return slotToLastPick(one.side, one.slot);
  }

  const best = latestPickInCmOrder(newlyFilled, draftSide);
  return slotToLastPick(best.side, best.slot);
}

function teamSideFromMatchSetup(
  matchSetup: MatchSetup | null | undefined,
  side: "radiant" | "dire",
  roster: RosterPlayer[],
  fallbackName: string,
  prev: DraftState | null,
): { name: string; logoUrl?: string } {
  if (!matchSetup) {
    return {
      name: fallbackName,
      logoUrl:
        side === "radiant"
          ? (prev?.radiant?.logoUrl ?? prev?.series.logoUrlA)
          : (prev?.dire?.logoUrl ?? prev?.series.logoUrlB),
    };
  }

  const key =
    side === "radiant"
      ? matchSetup.radiantTeamKey
      : matchSetup.direTeamKey;
  const team = getTeamByKey(roster, key);
  if (!team) {
    return { name: fallbackName };
  }
  return {
    name: team.teamName,
    logoUrl: teamLogoUrl(team.teamKey),
  };
}

export type GsiParseResult = {
  inDraft: boolean;
  draftPatch: Partial<DraftState> | null;
};

export function parseGsiToDraft(
  payload: GsiPayload,
  prev: DraftState | null,
  roster: RosterPlayer[],
  matchSetup: MatchSetup | null | undefined,
): GsiParseResult {
  const map = asRecord(payload.map);
  const gameState = typeof map?.game_state === "string" ? map.game_state : "";
  const inDraft = DRAFT_STATES.has(gameState);

  const draft = asRecord(payload.draft);
  if (!draft && !inDraft) {
    return { inDraft: false, draftPatch: null };
  }

  const gsiRadiantName =
    typeof map?.team_name_radiant === "string"
      ? map.team_name_radiant
      : "Radiant";
  const gsiDireName =
    typeof map?.team_name_dire === "string" ? map.team_name_dire : "Dire";

  const radiantSide = teamSideFromMatchSetup(
    matchSetup,
    "radiant",
    roster,
    gsiRadiantName,
    prev,
  );
  const direSide = teamSideFromMatchSetup(
    matchSetup,
    "dire",
    roster,
    gsiDireName,
    prev,
  );

  const draftRec = draft ?? {};
  const radiantRaw = resolveGsiSideData(draftRec, "radiant");
  const direRaw = resolveGsiSideData(draftRec, "dire");

  let radiantSlots = parseSideSlots(radiantRaw, "radiant");
  let direSlots = parseSideSlots(direRaw, "dire");

  const rosterComplete = draftRosterComplete(radiantSlots, direSlots);
  if (rosterComplete) {
    radiantSlots = applyPlayerHeroLocks(radiantSlots, "radiant", payload);
    direSlots = applyPlayerHeroLocks(direSlots, "dire", payload);
  }

  const activeTeam = draft ? activeTeamFromGsi(draftRec) : null;
  const timer = gsiNumber(
    draftRec.activeteam_time_remaining ?? draftRec.active_team_time_remaining,
  );
  const turnAction = draft ? turnActionFromGsi(draftRec) : undefined;
  const reserveSeconds = draft
    ? reserveSecondsFromGsi(draftRec, activeTeam)
    : 0;

  const picksBansOrder = [
    ...radiantSlots.map((s) => ({
      team: "A" as const,
      heroId: s.heroId,
      player: s.playerName,
      isBan: s.type === "ban",
      order: s.order,
      heroName: s.heroName,
      heroPortraitUrl: s.heroPortraitUrl,
    })),
    ...direSlots.map((s) => ({
      team: "B" as const,
      heroId: s.heroId,
      player: s.playerName,
      isBan: s.type === "ban",
      order: s.order,
      heroName: s.heroName,
      heroPortraitUrl: s.heroPortraitUrl,
    })),
  ];

  const lastPick = detectLastPick(radiantSlots, direSlots, prev);

  const phase = inferDraftPhase(
    inDraft,
    gameState,
    radiantSlots,
    direSlots,
    activeTeam,
  );
  let startSecondsRemaining = startSecondsFromGsi(map, gameState, draftRec);

  if (phase === "starting" && startSecondsRemaining === undefined) {
    if (prev?.phase === "starting" && prev.startSecondsRemaining !== undefined) {
      startSecondsRemaining = prev.startSecondsRemaining;
    } else if (timer > 0 && !draftHasStarted(radiantSlots, direSlots)) {
      startSecondsRemaining = timer;
    }
  }

  const draftPatch: Partial<DraftState> = {
    source: "gsi",
    phase,
    reserveSeconds: Math.max(0, Math.round(reserveSeconds)),
    activeTeam: phase === "starting" ? null : activeTeam,
    turnAction: phase === "starting" ? undefined : turnAction,
    startSecondsRemaining:
      phase === "starting"
        ? Math.max(
            0,
            Math.round(
              startSecondsRemaining ??
                (prev?.phase === "starting"
                  ? prev.startSecondsRemaining
                  : undefined) ??
                30,
            ),
          )
        : undefined,
    turnSecondsRemaining:
      phase === "starting" ? undefined : Math.max(0, Math.round(timer)),
    series: {
      teamA: radiantSide.name,
      teamB: direSide.name,
      scoreA: prev?.series.scoreA ?? 0,
      scoreB: prev?.series.scoreB ?? 0,
      bestOf: prev?.series.bestOf,
      gameNumber: prev?.series.gameNumber,
      logoUrlA: radiantSide.logoUrl ?? prev?.series.logoUrlA,
      logoUrlB: direSide.logoUrl ?? prev?.series.logoUrlB,
    },
    radiant: {
      name: radiantSide.name,
      logoUrl: radiantSide.logoUrl,
      slots: radiantSlots,
    },
    dire: {
      name: direSide.name,
      logoUrl: direSide.logoUrl,
      slots: direSlots,
    },
    picksBansOrder,
    lastPick,
  };

  return { inDraft: inDraft || Boolean(draft), draftPatch };
}
