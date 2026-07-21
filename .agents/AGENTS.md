# BPCL Production Rules

## Dota 2 GSI Player Slots
When working with Dota 2 Game State Integration (GSI) payload data, always remember that players are indexed from 0 to 9 across the two teams:
- **Radiant** (team2): `player0` through `player4`
- **Dire** (team3): `player5` through `player9`

Never use a hardcoded 0-4 loop for both teams, as this will result in the Dire team's players being completely skipped.

## Dota 2 GSI Field Schema
Dota 2 GSI exposes specific fields. Never guess field names or locations; refer to this structure when interacting with the GSI payload.

### Top-Level Nodes
- `provider`: Basic info (`timestamp`, `name`, `appid`, `version`).
- `map`: Game map and state (`matchid`, `game_time`, `clock_time`, `daytime`, `game_state`, `paused`, `win_team`, `radiant_score`, `dire_score`, `roshan_state`, `tormentor_state`, `radiant_glyph_cooldown`, `radiant_scan_cooldown`, `radiant_scan_charges`...).
- `player`: Account/player-level statistics.
- `hero`: In-game hero entity statistics.
- `items`: Player inventories.
- `abilities`: Hero skills.
- `buildings`: Map structures (towers, barracks, ancients).
- `draft`: Captains Mode / Draft phase status.
- `events`: Array of recent game events.
- `roshan`: Top-level Roshan state.

### The `player` Object
Located at `payload.player.team2.player[0-4]` and `payload.player.team3.player[5-9]`.
Contains account-level stats:
- `accountid` / `steamid`
- `name` (Persona name)
- `kills`, `deaths`, `assists`, `kill_streak`, `kill_list`
- `last_hits`, `denies`
- `gold`, `gold_reliable`, `gold_unreliable`, `gpm`, `xpm`, `net_worth`
- `hero_damage`, `hero_healing`, `tower_damage`
- `wards_purchased`, `wards_placed`, `wards_destroyed`
- `runes_activated`, `water_runes_activated`, `bounty_runes_activated`
- `camps_stacked`
- `support_gold_spent`, `consumable_gold_spent`, `item_gold_spent`
- Detailed `damage_received_` and `damage_outgoing_` breakdowns
- **Note:** This block does **NOT** contain `level` or `xp` (those are in `hero`).

### The `hero` Object
Located at `payload.hero.team2.player[0-4]` and `payload.hero.team3.player[5-9]`.
Contains entity-level stats:
- `id` (Hero ID), `name` (e.g., `npc_dota_hero_antimage`), `facet`
- `level` (Current hero level), `xp` (Total experience points gained)
- `alive` (Boolean), `respawn_seconds`, `buyback_cost`, `buyback_cooldown`
- `health`, `max_health`, `health_percent`, `mana`, `max_mana`, `mana_percent`
- `xpos`, `ypos`
- `aghanims_scepter`, `aghanims_shard` (Boolean or 0/1)
- `talent_1` through `talent_8`, `attributes_level`
- Status flags: `silenced`, `stunned`, `disarmed`, `magicimmune`, `hexed`, `muted`, `break`, `smoked`, `has_debuff`, `permanent_buffs`

### The `items` Object
Located at `payload.items.team2.player[0-4]` and `payload.items.team3.player[5-9]`.
Contains inventory slots:
- `slot0` through `slot5` (Main inventory)
- `slot6` through `slot8` (Backpack)
- `stash0` through `stash5` (Stash)
- `teleport0` (TP Scroll slot)
- `neutral0` (Neutral item slot)
- Each slot contains: `name`, `purchaser`, `item_level`, `can_cast`, `cooldown`, `max_cooldown`, `passive`, `charges`, `item_charges`

### The `events` Array
Located at `payload.events`. Array of objects. GSI resends the **full** array every tick — track a processed index to avoid reprocessing.
- `event_type`: Type of event. Known types from live payload dump:
  - `"bounty_rune_pickup"` — `{ game_time, event_type, team: 2|3, player_id }`
  - `"first_blood"` — `{ game_time, event_type, kill_streak, player_id, victim_id }`
  - `"kill_streak"` — `{ game_time, event_type, kill_streak, player_id, victim_id }`
  - `"roshan_killed"` — `{ game_time, event_type, killed_by_team: "radiant"|"dire", killer_player_id }`
  - `"aegis_picked_up"` — `{ game_time, event_type, player_id, snatched: boolean }` — `snatched: true` means it was stolen by the enemy team
  - `"courier_killed"` — `{ game_time, event_type, team: 2|3 }`

**IMPORTANT for Roshan:**
- `roshan_killed` uses `killed_by_team: "radiant" | "dire"` (string), **not** `team: 2|3`.
- Steal detection uses `aegis_picked_up` with `snatched: true` — do NOT scan item inventories manually for this.

### The `roshan` Top-Level Block
Located at `payload.roshan`. Tracks Roshan's live state:
- `alive` (boolean)
- `health` / `max_health` (integers, 0 when dead)
- `spawn_phase` (integer: 0 = alive, 1 = base respawn, 2 = bonus respawn window)
- `phase_time_remaining` (float, seconds until next phase transition)
- `xpos`, `ypos`, `yaw` (position, all 0 when dead)
- `items_drop` — object of item slots he will drop: `{ item0: "item_aegis", item1: "item_cheese", ... }`

Also in `payload.map`:
- `roshan_state`: `"alive"` | `"respawn_base"` | `"respawn_variable"`
- `roshan_state_end_seconds`: game clock second when state ends (respawn timer)
