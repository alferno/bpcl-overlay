import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const API_PORT = 8080;
const GSI_ENDPOINT = '/gsi';

/**
 * Sends a GSI payload to the Broadcast API
 */
function sendGsiPayload(payload) {
  const data = JSON.stringify(payload);

  const options = {
    hostname: 'localhost',
    port: API_PORT,
    path: GSI_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  const req = http.request(options, (res) => {
    console.log(`[Mock GSI] Server responded with status: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.error(`[Mock GSI] Error sending data: ${e.message}`);
    console.log(`Make sure the Broadcast API is running on port ${API_PORT} (npm run dev:bpc-api)`);
  });

  req.write(data);
  req.end();
}

// ---------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node scripts/feed-mock-gsi.mjs <path-to-json-file>');
  console.log('Example: node scripts/feed-mock-gsi.mjs data/match_events/sample-gsi.json');
  console.log('');
  console.log('Or use the built-in test events:');
  console.log('  node scripts/feed-mock-gsi.mjs --test-kill');
  console.log('  node scripts/feed-mock-gsi.mjs --test-draft');
  process.exit(1);
}

const arg = args[0];

if (arg === '--test-kill') {
  // A minimal mock payload mimicking a GSI state change
  const mockGsi = {
    provider: { name: "Dota 2", appid: 570, timestamp: Date.now() },
    map: {
      matchid: "mock_test_match",
      game_state: "DOTA_GAMERULES_STATE_PRE_GAME",
      clock_time: 120,
    },
    events: [
      {
        event_type: "first_blood",
        game_time: 120,
        killer_player_id: 1,
        victim_player_id: 6
      }
    ]
  };
  console.log('[Mock GSI] Sending test first_blood event...');
  sendGsiPayload(mockGsi);
} else if (arg === '--test-draft') {
  // A mock payload mimicking the Hero Selection phase with players and draft state
  const mockGsi = {
    provider: { name: "Dota 2", appid: 570, timestamp: Date.now() },
    map: {
      matchid: "mock_draft_match",
      game_state: "DOTA_GAMERULES_STATE_HERO_SELECTION",
    },
    player: {
      team2: {
        player0: { accountid: 861335657, name: "HUR7LOCkER" },
        player1: { accountid: 367563618, name: "sugimoto" },
        player2: { accountid: 384213851, name: "alferno" },
        player3: { accountid: 151519254, name: "MYM | LUCKY13" },
        player4: { accountid: 129128666, name: "[V]Engeance" }
      },
      team3: {
        player5: { accountid: 113216131, name: "Zapheto" },
        player6: { accountid: 156497533, name: "Phola" },
        player7: { accountid: 92983874, name: "RagnaR" },
        player8: { accountid: 367730370, name: "Pero" },
        player9: { accountid: 195002259, name: "gurjarkage" }
      }
    },
    draft: {
      activeteam: 3,
      pick: true,
      activeteam_time_remaining: 35,
      radiant_bonus_time: 130,
      dire_bonus_time: 130,
      team2: {
        home_team: true,
        pick0_id: 1, pick0_class: "npc_dota_hero_antimage",
        pick1_id: 2, pick1_class: "npc_dota_hero_axe",
        pick2_id: 0, pick2_class: "",
        ban0_id: 3, ban0_class: "npc_dota_hero_bane",
        ban1_id: 4, ban1_class: "npc_dota_hero_bloodseeker",
        ban2_id: 0, ban2_class: "",
      },
      team3: {
        home_team: false,
        pick0_id: 5, pick0_class: "npc_dota_hero_crystal_maiden",
        pick1_id: 0, pick1_class: "",
        ban0_id: 6, ban0_class: "npc_dota_hero_drow_ranger",
        ban1_id: 7, ban1_class: "npc_dota_hero_earthshaker"
      }
    }
  };
  console.log('[Mock GSI] Sending test draft event...');
  sendGsiPayload(mockGsi);
} else if (arg === '--test-live-player') {
  // A mock payload mimicking a live player being selected/spectated
  const mockGsi = {
    provider: { name: "Dota 2", appid: 570, timestamp: Date.now() },
    map: {
      game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
    },
    player: {
      accountid: 384213851, // alferno
      name: "alferno",
      kills: 14,
      deaths: 2,
      assists: 9,
      last_hits: 245,
      denies: 15,
      team_name: "Radiant",
      team2: {
        player2: {
          accountid: 384213851,
          name: "alferno",
          kill_list: {
            npc_dota_hero_juggernaut: 4,
            npc_dota_hero_rubick: 1,
            npc_dota_hero_pudge: 6,
            npc_dota_hero_axe: 3
          }
        }
      },
      team3: {
        player5: { accountid: 111, name: "Opp1" },
        player6: { accountid: 222, name: "Opp2" },
        player7: { accountid: 333, name: "Opp3" },
        player8: { accountid: 444, name: "Opp4" },
        player9: { accountid: 555, name: "Opp5" }
      }
    },
    hero: {
      id: 74, // Invoker
      name: "npc_dota_hero_invoker",
      level: 18,
      team3: {
        player5: { id: 8, name: "npc_dota_hero_juggernaut" },
        player6: { id: 86, name: "npc_dota_hero_rubick" },
        player7: { id: 14, name: "npc_dota_hero_pudge" },
        player8: { id: 2, name: "npc_dota_hero_axe" },
        player9: { id: 26, name: "npc_dota_hero_lion" }
      }
    },
    items: {
      team2: {
        player2: {
          slot0: { name: "item_hand_of_midas", purchaser: 384213851, item_level: 1 },
          slot1: { name: "item_blink", purchaser: 384213851, item_level: 1 },
          slot2: { name: "item_black_king_bar", purchaser: 384213851, item_level: 1 },
          slot3: { name: "item_aghanims_shard", purchaser: 384213851, item_level: 1 },
          slot4: { name: "item_travel_boots", purchaser: 384213851, item_level: 1 },
          slot5: { name: "item_sphere", purchaser: 384213851, item_level: 1 },
          neutral0: { name: "item_titan_sliver" }
        }
      }
    }
  };
  console.log('[Mock GSI] Sending test live player card event...');
  sendGsiPayload(mockGsi);
} else {
  // Read from file
  try {
    const filePath = path.resolve(process.cwd(), arg);
    const content = fs.readFileSync(filePath, 'utf-8');
    const payload = JSON.parse(content);
    console.log(`[Mock GSI] Sending payload from ${arg}...`);
    sendGsiPayload(payload);
  } catch (err) {
    console.error(`Failed to read or parse file: ${err.message}`);
  }
}
