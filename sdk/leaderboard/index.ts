import { EventEmitter } from "events";
import type {
  PlayerScore,
  LeaderboardConfig,
  LeaderboardDependencies,
  RedisServiceLike,
  PostgresServiceLike,
  ScoreSubmittedEvent,
  NewLeaderEvent,
  RankChangeEvent,
  PostgresErrorEvent,
  FlushCompleteEvent,
} from "./types";
import { WriteBehindQueue, WriteBehindFlusher } from "./writeBehind";

// ---------------------------------------------------------------------------
// Typed event overloads — gives consumers full IntelliSense on event names
// ---------------------------------------------------------------------------

export declare interface Leaderboard {
  on(event: "score:submitted", listener: (e: ScoreSubmittedEvent) => void): this;
  on(event: "new:leader",      listener: (e: NewLeaderEvent) => void): this;
  on(event: "rank:change",     listener: (e: RankChangeEvent) => void): this;
  on(event: "postgres:error",  listener: (e: PostgresErrorEvent) => void): this;
  on(event: "flush:complete",  listener: (e: FlushCompleteEvent) => void): this;

  emit(event: "score:submitted", e: ScoreSubmittedEvent): boolean;
  emit(event: "new:leader",      e: NewLeaderEvent): boolean;
  emit(event: "rank:change",     e: RankChangeEvent): boolean;
  emit(event: "postgres:error",  e: PostgresErrorEvent): boolean;
  emit(event: "flush:complete",  e: FlushCompleteEvent): boolean;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export class Leaderboard extends EventEmitter {
  private redisService: RedisServiceLike;
  private postgresService: PostgresServiceLike;
  private config?: LeaderboardConfig;
  private writeBehindQueue?: WriteBehindQueue;
  private writeBehindFlusher?: WriteBehindFlusher;

  constructor(
    redisService: RedisServiceLike,
    postgresService: PostgresServiceLike,
    config?: LeaderboardConfig,
  ) {
    super();
    this.redisService = redisService;
    this.postgresService = postgresService;
    this.config = config;

    if (config?.writeBehind) {
      this.writeBehindQueue = new WriteBehindQueue();
      this.writeBehindFlusher = new WriteBehindFlusher(
        this.writeBehindQueue,
        (items) => this.postgresService.bulkUpsert(items),
        config.writeBehind.intervalMs,
        // Surface Postgres flush errors as an event — no uncaught exception
        (err, items) => this.emit("postgres:error", { err, items }),
        (count, durationMs) => this.emit("flush:complete", { count, durationMs }),
      );
      this.writeBehindFlusher.start();
    }
  }

  async submitScore(gameId: string, userId: string, score: number): Promise<void> {
    // Only pay the extra Redis RTT for rank lookups when someone is actually listening
    const hasRankListeners =
      this.listenerCount("rank:change") > 0 || this.listenerCount("new:leader") > 0;

    const oldRank = hasRankListeners
      ? await this.redisService.getRank(gameId, userId)
      : null;

    await this.redisService.updateScore(
      gameId,
      userId,
      score,
      this.config?.maxEntriesPerGame,
    );

    if (this.writeBehindQueue) {
      // Write-behind mode: enqueue Postgres write, it will be flushed in bulk later
      this.writeBehindQueue.enqueue(gameId, userId, score);
    } else {
      // Synchronous write-through mode
      try {
        await this.postgresService.upsertScore(gameId, userId, score);
      } catch (err) {
        console.error(
          `[Leaderboard] Postgres upsert failed for userId="${userId}" gameId="${gameId}". ` +
          `Redis is updated but Postgres is stale.`,
          err,
        );
        throw err;
      }
    }

    // Always emit score:submitted
    this.emit("score:submitted", { gameId, userId, score });

    // Emit rank events only when listeners exist — avoids unnecessary Redis calls
    if (hasRankListeners) {
      const newRank = await this.redisService.getRank(gameId, userId);

      if (newRank !== oldRank) {
        this.emit("rank:change", { gameId, userId, oldRank, newRank });
      }
      if (newRank === 1) {
        this.emit("new:leader", { gameId, userId, score });
      }
    }
  }

  async getTopPlayers(gameId: string, limit = 10): Promise<PlayerScore[]> {
    let top = await this.redisService.getTop(gameId, limit);
    if (!top.length) {
      top = await this.postgresService.getTop(gameId, limit);
      if (top.length) {
        await this.redisService.setBulk(gameId, top);
      }
    }
    return top;
  }

  async getUserRank(gameId: string, userId: string): Promise<number | null> {
    const rank = await this.redisService.getRank(gameId, userId);
    if (rank !== null) return rank;
    // Redis is cold or user absent — fall back to Postgres
    return await this.postgresService.getRank(gameId, userId);
  }

  /**
   * Gracefully stop the write-behind timer and flush any remaining queued
   * writes to Postgres before shutdown.
   *
   * **Always call this** when using write-behind mode, so no pending scores
   * are lost when the process exits.
   */
  async shutdown(): Promise<void> {
    if (this.writeBehindFlusher) {
      this.writeBehindFlusher.stop();
      await this.writeBehindFlusher.flush(); // drain remaining items
    }
  }
}

export function createLeaderboard(deps: LeaderboardDependencies) {
  return new Leaderboard(deps.redisService, deps.postgresService, deps.config);
}
