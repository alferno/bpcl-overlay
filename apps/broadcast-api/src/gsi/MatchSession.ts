export type MatchStatus = "WAITING" | "DRAFTING" | "RUNNING" | "PAUSED" | "POST_GAME";

export class MatchSession {
  public matchId: string | number | null = null;
  public startedAt: number = 0;
  public status: MatchStatus = "WAITING";
  public isPaused: boolean = false;
  
  constructor(matchId: string | number | null) {
    this.matchId = matchId;
    this.startedAt = Date.now();
  }

  // Returns true if matchId changed, false otherwise
  updateMatchId(newMatchId: string | number | null): boolean {
    if (newMatchId !== undefined && newMatchId !== null && this.matchId !== newMatchId) {
      this.matchId = newMatchId;
      this.reset();
      return true;
    }
    return false;
  }

  private reset() {
    this.startedAt = Date.now();
    this.status = "WAITING";
    this.isPaused = false;
  }
}
