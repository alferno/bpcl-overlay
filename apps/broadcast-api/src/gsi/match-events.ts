import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCHES_DIR = path.resolve(__dirname, "../../../../data/matches");

if (!fs.existsSync(MATCHES_DIR)) {
  fs.mkdirSync(MATCHES_DIR, { recursive: true });
}

export type MatchEventType = "first_tower" | "mega_creeps" | "kill_streak" | "multi_kill" | string;

export interface MatchEvent {
  time: number;
  type: MatchEventType;
  description: string;
  steam32?: number;
  heroId?: number;
  metadata?: any;
}

export class MatchEventManager {
  private matchId: string;
  private matchDir: string;
  
  private timelineEvents: MatchEvent[] = [];
  private killEvents: MatchEvent[] = [];
  private fightEvents: MatchEvent[] = [];

  constructor(matchId: string) {
    this.matchId = matchId;
    this.matchDir = path.join(MATCHES_DIR, matchId);
    
    if (!fs.existsSync(this.matchDir)) {
      fs.mkdirSync(this.matchDir, { recursive: true });
    }
    this.load();
  }

  private getFilePath(name: string): string {
    return path.join(this.matchDir, `${name}.json`);
  }

  private loadCategory(name: string): MatchEvent[] {
    const fp = this.getFilePath(name);
    if (fs.existsSync(fp)) {
      try {
        return JSON.parse(fs.readFileSync(fp, "utf-8"));
      } catch (e) {
        console.error(`Failed to load match ${name} events`, e);
      }
    }
    return [];
  }

  private saveCategory(name: string, events: MatchEvent[]) {
    try {
      fs.writeFileSync(this.getFilePath(name), JSON.stringify(events, null, 2), "utf-8");
    } catch (e) {
      console.error(`Failed to save match ${name} events`, e);
    }
  }

  private load() {
    this.timelineEvents = this.loadCategory("timeline");
    this.killEvents = this.loadCategory("kills");
    this.fightEvents = this.loadCategory("fights");
  }

  private get allEvents(): MatchEvent[] {
    return [...this.timelineEvents, ...this.killEvents, ...this.fightEvents];
  }

  public hasEvent(type: MatchEventType, condition?: (ev: MatchEvent) => boolean): boolean {
    const events = this.allEvents;
    if (!condition) {
      return events.some((e) => e.type === type);
    }
    return events.some((e) => e.type === type && condition(e));
  }

  public addEvent(event: MatchEvent) {
    if (["kill_streak", "multi_kill", "first_blood", "hero_kill"].includes(event.type)) {
      this.killEvents.push(event);
      this.saveCategory("kills", this.killEvents);
    } else if (event.type.includes("fight")) {
      this.fightEvents.push(event);
      this.saveCategory("fights", this.fightEvents);
    } else {
      this.timelineEvents.push(event);
      this.saveCategory("timeline", this.timelineEvents);
    }
  }
}
