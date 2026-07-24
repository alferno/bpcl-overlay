import { logger } from "../logger.js";

/**
 * Reports the match winner and MVP data to the BPCL League API.
 * Uses a POST request with a JSON body as requested.
 */
export async function reportMatchResult(
  team1: string,
  team2: string,
  winner: string,
  gameNumber?: number,
) {
  try {
    const url = "https://api.bpcleague.in/api/public/tournament/match";
    const dateTime = new Date().toISOString();

    const payload = {
      team1,
      team2,
      winner,
      gameNumber,
      "date-time": dateTime
    };

    logger.info({ payload }, "Reporting match result to BPCL API");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error");
      logger.warn({ status: res.status, text }, "BPCL API match report failed");
    } else {
      logger.info("Successfully reported match result to BPCL API");
    }
  } catch (err) {
    logger.error(err, "Error reporting match result to BPCL API");
  }
}
