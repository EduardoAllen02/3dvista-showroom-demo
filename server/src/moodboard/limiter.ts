import { MoodboardError, type GenerationGuard } from "@3dvista-assistant/moodboard-engine";

const HOUR_MS = 60 * 60 * 1000;
const PRUNE_ABOVE = 2000;

/**
 * Caps paid generations; cache hits never count. Two limits:
 * - per session and hour, so one visitor can't loop through combinations
 *   by accident;
 * - per day for the whole backend, the hard ceiling on spend. session_id is
 *   client-generated, so the daily cap is the one that actually bounds cost.
 * In memory: a restart resets the counters, acceptable for a single
 * instance whose worst case is one extra day's cap.
 */
export class GenerationLimiter {
  private readonly bySession = new Map<string, number[]>();
  private day = "";
  private dayCount = 0;

  constructor(
    private readonly sessionHourlyLimit: number,
    private readonly dailyLimit: number
  ) {}

  guard(sessionId: string): GenerationGuard {
    return () => {
      const now = Date.now();
      const today = new Date(now).toISOString().slice(0, 10);
      if (today !== this.day) {
        this.day = today;
        this.dayCount = 0;
      }
      if (this.dayCount >= this.dailyLimit) {
        throw new MoodboardError("rate_limited", "Daily moodboard generation limit reached.");
      }
      const recent = (this.bySession.get(sessionId) ?? []).filter((t) => now - t < HOUR_MS);
      if (recent.length >= this.sessionHourlyLimit) {
        throw new MoodboardError("rate_limited", "Hourly moodboard limit reached for this session.");
      }
      recent.push(now);
      this.bySession.set(sessionId, recent);
      this.dayCount += 1;
      if (this.bySession.size > PRUNE_ABOVE) this.prune(now);
    };
  }

  private prune(now: number): void {
    for (const [session, times] of this.bySession) {
      if (times.every((t) => now - t >= HOUR_MS)) this.bySession.delete(session);
    }
  }
}
