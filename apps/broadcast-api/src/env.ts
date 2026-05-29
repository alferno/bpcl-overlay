import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(8080),
  BROADCAST_SECRET: z.string().min(8),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:5173"),
  STATE_BACKEND: z.enum(["memory", "redis"]).default("memory"),
  REDIS_URL: z.string().optional(),
  REDIS_STATE_KEY: z.string().default("bpc:broadcast:v1"),
  REDIS_UNAVAILABLE_FALLBACK_MEMORY: z.coerce.boolean().default(false),
  OPENDOTA_RATE_PER_MINUTE: z.coerce.number().default(45),
  GSI_TOKEN: z.string().optional(),
  /** OpenDota league ID — required; all player stats are league-scoped only */
  LEAGUE_ID: z.coerce.number().int().positive(),
  /** Re-fetch league match stats from OpenDota/Steam when API starts (if CSV missing). Prefer CSV + manual refresh. */
  LEAGUE_AUTO_AGGREGATE: z.coerce.boolean().default(false),
  /** Directory for league_{id}_heroes.csv and league_{id}_player_heroes.csv */
  LEAGUE_STATS_DIR: z.string().optional(),
  /** Steam Web API key — required for amateur/excluded leagues (OpenDota match list is empty) */
  STEAM_WEB_API_KEY: z.string().optional(),
  /** Optional comma/space-separated match IDs when OpenDota league list is empty */
  LEAGUE_MATCH_IDS: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export function parseCorsOrigins(): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
