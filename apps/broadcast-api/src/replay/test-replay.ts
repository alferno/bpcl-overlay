import { readFile } from "fs/promises";
import { resolve } from "path";
import { EventEngine } from "../events/EventEngine.js";
import { EventBus } from "../events/EventBus.js";
import { GameStateStore } from "../gsi/GameStateStore.js";
import { ShrineDetector } from "../events/detectors/ShrineDetector.js";
import { MatchStateDetector } from "../events/detectors/MatchStateDetector.js";
import { RoshanDetector } from "../events/detectors/RoshanDetector.js";
import { TormentorDetector } from "../events/detectors/TormentorDetector.js";
import { BountyDetector } from "../events/detectors/BountyDetector.js";
import { CanonicalEvent } from "../events/CanonicalEvent.js";



async function runTests() {
  const fullPath = resolve("../../payload_dump.json");
  const data = await readFile(fullPath, "utf-8");
  let basePayload = JSON.parse(data);
  if (basePayload.payload) {
    basePayload = basePayload.payload;
  }

  const eventsEmitted: CanonicalEvent[] = [];
  const eventBus = new EventBus();
  
  eventBus.on("*", (event) => {
    eventsEmitted.push(event);
    
    const minutes = Math.floor(event.gameTime / 60);
    const seconds = Math.floor(event.gameTime % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    let extraInfo = "";
    if ("team" in event) extraInfo += ` ${event.team?.toUpperCase()}`;
    if ("playerName" in event && event.playerName) extraInfo += ` ${event.playerName}`;
    console.log(`[EVENT] ${timeStr} ${event.type}${extraInfo} (ID: ${event.id}, Source: ${event.source})`);
  });

  const engine = new EventEngine(eventBus);
  engine.registerDetector(new ShrineDetector());
  engine.registerDetector(new MatchStateDetector());
  engine.registerDetector(new RoshanDetector());
  engine.registerDetector(new TormentorDetector());
  engine.registerDetector(new BountyDetector());
  
  const store = new GameStateStore(engine, eventBus);

  console.log("=== Running Timeline Test ===");
  
  const clone = (p: any) => JSON.parse(JSON.stringify(p));

  // Tick 1: Initial State.
  // We need to set map.radiant_wisdom_shrine to true initially so we can transition to false later.
  const tick1 = clone(basePayload);
  tick1.map.matchid = "TEST_MATCH_1";
  tick1.map.clock_time = 1000;
  tick1.map.radiant_wisdom_shrine = true;
  tick1.map.dire_wisdom_shrine = true;
  tick1.events = []; // clear events so roshan/bounty don't trigger yet
  store.processPayload(tick1);
  
  // Tick 2: Transition (true -> false) for Radiant Shrine
  const tick2 = clone(tick1);
  tick2.map.clock_time = 1001;
  tick2.map.radiant_wisdom_shrine = false;
  store.processPayload(tick2);

  // Tick 3: Unchanged shrine state (should emit 0 events)
  const tick3 = clone(tick2);
  tick3.map.clock_time = 1002;
  store.processPayload(tick3);

  // Tick 4: Transition (false -> true) for Radiant Shrine (respawn)
  const tick4 = clone(tick3);
  tick4.map.clock_time = 1003;
  tick4.map.radiant_wisdom_shrine = true;
  store.processPayload(tick4);

  // Tick 5: Duplicate GSI Snapshot (exact same payload as tick 4)
  const tick5 = clone(tick4);
  store.processPayload(tick5);

  // Tick 6: New Match ID (Detector state reset)
  const tick6 = clone(tick5);
  tick6.map.matchid = "TEST_MATCH_2";
  tick6.map.clock_time = 0; // reset clock
  // When a new match happens, GameStateStore sets prev/curr to null and resets engine.
  // We process it once to set initial state...
  store.processPayload(tick6);
  
  // Tick 7: After reset, transition a shrine
  const tick7 = clone(tick6);
  tick7.map.clock_time = 1;
  tick7.map.radiant_wisdom_shrine = false; // Transition true -> false again
  store.processPayload(tick7);
  
  // Now let's trigger the actual payload dump's events array (Roshan, Bounty, Aegis)
  console.log("=== Running Dump Events Test ===");
  const tick8 = clone(basePayload);
  tick8.map.matchid = "TEST_MATCH_3";
  tick8.map.clock_time = 1500;
  tick8.map.roshan_state = "alive"; // Simulate roshan alive before kill
  tick8.events = [];
  store.processPayload(tick8); // set baseline
  
  const tick9 = clone(basePayload); // this one has the events array populated
  tick9.map.matchid = "TEST_MATCH_3";
  tick9.map.clock_time = 1501;
  store.processPayload(tick9);

  console.log("=== Running Bounty Rune Edge Cases ===");
  // Tick 10: Reset events array to set a new baseline
  const tick10 = clone(tick9);
  tick10.map.clock_time = 1502;
  tick10.events = [];
  store.processPayload(tick10);

  // Tick 11: Four bounties picked up, testing various team normalizations
  const tick11 = clone(tick10);
  tick11.map.clock_time = 1503;
  tick11.events = [
    { event_type: "bounty_rune_pickup", game_time: 1503, team: "dire" },
    { event_type: "bounty_rune_pickup", game_time: 1503, team: "radiant" },
    { event_type: "bounty_rune_pickup", game_time: 1503, team: 3 },
    { event_type: "bounty_rune_pickup", game_time: 1503, team: 2 }
  ];
  store.processPayload(tick11);

  // Tick 12: Duplicate of Tick 11 (should produce 0 events)
  const tick12 = clone(tick11);
  tick12.map.clock_time = 1504;
  store.processPayload(tick12);

  // Tick 13: Same as Tick 11 but with one MORE event added
  const tick13 = clone(tick11);
  tick13.map.clock_time = 1505;
  tick13.events = [
    ...tick11.events,
    { event_type: "bounty_rune_pickup", game_time: 1505, team: 2 }
  ];
  store.processPayload(tick13);

  console.log("=== Running Tormentor Edge Cases ===");
  // Tick 14: Tormentor alive
  const tick14 = clone(tick13);
  tick14.map.clock_time = 2000;
  tick14.map.tormentor_state = "alive"; // Assuming GSI sends "alive" or it's omitted
  tick14.map.tormentor_state_location = "bottom";
  store.processPayload(tick14);

  // Tick 15: Tormentor killed (bottom/radiant)
  const tick15 = clone(tick14);
  tick15.map.clock_time = 2001;
  tick15.map.tormentor_state = "respawning";
  store.processPayload(tick15);

  // Tick 16: Duplicate of Tick 15 (should not emit)
  const tick16 = clone(tick15);
  tick16.map.clock_time = 2002;
  store.processPayload(tick16);

  // Tick 17: Tormentor respawns later, location shifts to top/dire
  const tick17 = clone(tick16);
  tick17.map.clock_time = 2601;
  tick17.map.tormentor_state = undefined; // Assuming it disappears when alive
  tick17.map.tormentor_state_location = "top";
  store.processPayload(tick17);

  console.log("=== Running Match Lifecycle Tests ===");
  const tick18 = clone(tick17);
  tick18.map.matchid = "TEST_MATCH_4";
  tick18.map.clock_time = -90;
  tick18.map.game_state = "DOTA_GAMERULES_STATE_HERO_SELECTION";
  tick18.map.paused = false;
  tick18.events = []; // Clear previous match events
  store.processPayload(tick18); // Should emit MATCH_INITIALIZED and MATCH_STATE_CHANGED

  // Go to Pre Game (Match Started)
  const tick19 = clone(tick18);
  tick19.map.clock_time = -89;
  tick19.map.game_state = "DOTA_GAMERULES_STATE_PRE_GAME";
  store.processPayload(tick19); // Should emit MATCH_STARTED

  // Out of order payload (same state, older clock time)
  const tick20 = clone(tick19);
  tick20.map.clock_time = -90; 
  store.processPayload(tick20); // Should be ignored or at least not double emit

  // Reconnect with same match ID
  const tick21 = clone(tick19);
  tick21.map.clock_time = -88;
  store.processPayload(tick21); // Should not emit MATCH_INITIALIZED or MATCH_STARTED

  // Pause
  const tick22 = clone(tick21);
  tick22.map.clock_time = -87;
  tick22.map.paused = true;
  store.processPayload(tick22); // Should emit MATCH_PAUSED

  // Duplicate Pause
  const tick23 = clone(tick22);
  tick23.map.clock_time = -86;
  store.processPayload(tick23); // Should not emit again

  // Resume
  const tick24 = clone(tick23);
  tick24.map.clock_time = -85;
  tick24.map.paused = false;
  store.processPayload(tick24); // Should emit MATCH_RESUMED

  // End match
  const tick25 = clone(tick24);
  tick25.map.clock_time = 2500;
  tick25.map.game_state = "DOTA_GAMERULES_STATE_POST_GAME";
  store.processPayload(tick25); // Should emit MATCH_ENDED

  // Assertions
  console.log("\n=== Test Results ===");
  const expectedBountyCount = 6; // 1 from dump + 4 from tick11 + 1 from tick13
  const expectedShrinesRespawn = 1;
  const expectedTormentorKills = 1;
  const expectedTormentorRespawns = 2;
  
  const actualShrinesTaken = eventsEmitted.filter(e => e.type === "WISDOM_SHRINE_TAKEN").length;
  const actualShrinesRespawn = eventsEmitted.filter(e => e.type === "WISDOM_SHRINE_RESPAWNED").length;
  const actualBountyPickups = eventsEmitted.filter(e => e.type === "BOUNTY_RUNE_PICKED").length;
  const actualTormentorKills = eventsEmitted.filter(e => e.type === "TORMENTOR_KILLED").length;
  const actualTormentorRespawns = eventsEmitted.filter(e => e.type === "TORMENTOR_RESPAWNED").length;

  const matchInitializedCount = eventsEmitted.filter(e => e.type === "MATCH_INITIALIZED").length;
  const matchStartedCount = eventsEmitted.filter(e => e.type === "MATCH_STARTED").length;
  const matchPausedCount = eventsEmitted.filter(e => e.type === "MATCH_PAUSED").length;
  const matchResumedCount = eventsEmitted.filter(e => e.type === "MATCH_RESUMED").length;
  const matchEndedCount = eventsEmitted.filter(e => e.type === "MATCH_ENDED").length;
  
  console.log(`Shrine Taken events: ${actualShrinesTaken} (Expected: 2) -> ${actualShrinesTaken === 2 ? 'PASS' : 'FAIL'}`);
  console.log(`Shrine Respawn events: ${actualShrinesRespawn} (Expected: ${expectedShrinesRespawn}) -> ${actualShrinesRespawn === expectedShrinesRespawn ? 'PASS' : 'FAIL'}`);
  console.log(`Bounty Pickup events: ${actualBountyPickups} (Expected: ${expectedBountyCount}) -> ${actualBountyPickups === expectedBountyCount ? 'PASS' : 'FAIL'}`);
  console.log(`Tormentor Kill events: ${actualTormentorKills} (Expected: ${expectedTormentorKills}) -> ${actualTormentorKills === expectedTormentorKills ? 'PASS' : 'FAIL'}`);
  console.log(`Tormentor Respawn events: ${actualTormentorRespawns} (Expected: ${expectedTormentorRespawns}) -> ${actualTormentorRespawns === expectedTormentorRespawns ? 'PASS' : 'FAIL'}`);
  
  console.log(`MATCH_INITIALIZED events: ${matchInitializedCount} (Expected: 4) -> ${matchInitializedCount === 4 ? 'PASS' : 'FAIL'}`);
  console.log(`MATCH_STARTED events: ${matchStartedCount} (Expected: 1) -> ${matchStartedCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`MATCH_PAUSED events: ${matchPausedCount} (Expected: 1) -> ${matchPausedCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`MATCH_RESUMED events: ${matchResumedCount} (Expected: 1) -> ${matchResumedCount === 1 ? 'PASS' : 'FAIL'}`);
  console.log(`MATCH_ENDED events: ${matchEndedCount} (Expected: 1) -> ${matchEndedCount === 1 ? 'PASS' : 'FAIL'}`);

  const eventCounts = new Map<string, number>();
  eventsEmitted.forEach(e => {
    if (e.type !== "MATCH_STATE_CHANGED") { // state changed event fires frequently and is purely informational
      eventCounts.set(e.id, (eventCounts.get(e.id) || 0) + 1);
    }
  });

  const duplicateIds = Array.from(eventCounts.entries()).filter(([_, count]) => count > 1);
  console.log(`Duplicates: ${duplicateIds.length === 0 ? 'PASS' : 'FAIL'} (Expected: 0) -> ${duplicateIds.length === 0 ? 'PASS' : 'FAIL'}`);
  if (duplicateIds.length > 0) {
    console.error("Duplicate events found:");
    console.error(duplicateIds);
  }

  console.log("\n=== E2E Architecture & Duplicate Listener Test ===");
  // Create a clean mock event bus
  const testBus = new EventBus();
  
  // Create a mock socket.io server
  let emitCount = 0;
  const mockIo = {
    of: (ns: string) => ({
      emit: (event: string, payload: any) => {
        if (event === "ROSHAN_KILLED") {
          emitCount++;
        }
      }
    })
  } as any;
  
  // Create mock state
  const mockState = {
    getState: async () => ({ draft: {}, leagueConfig: {} })
  } as any;

  // Instantiate OverlayConsumer exactly once
  const OverlayConsumer = (await import("../production/OverlayConsumer.js")).OverlayConsumer;
  new OverlayConsumer(testBus, mockState, mockIo);

  // Emit a single event
  testBus.emit({
    id: "roshan_killed_test_1",
    type: "ROSHAN_KILLED",
    gameTime: 1000,
    killNumber: 1,
    team: "radiant",
    killerPlayerName: "TestPlayer",
    drops: ["item_aegis"]
  } as any);

  // Let promises resolve
  await new Promise(r => setTimeout(r, 100));

  console.log(`E2E OverlayConsumer emission count: ${emitCount} (Expected: 1) -> ${emitCount === 1 ? 'PASS' : 'FAIL'}`);

  console.log("\nAll Events Emitted:");
  eventsEmitted.forEach(e => {
    if (e.type !== "MATCH_STATE_CHANGED") {
      console.log(`  - ${e.id} [${e.type}]`);
    }
  });
}

runTests().catch(console.error);
