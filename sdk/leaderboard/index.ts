import { EventEmitter } from "events";
import type {
  PlayerScore,
  LeaderboardConfig,
  LeaderboardDependencies,
  RedisServiceLike,
  PersistenceServiceLike,
  ScoreSubmittedEvent,
  NewLeaderEvent,
  RankChangeEvent,
  PersistenceErrorEvent,
  FlushCompleteEvent,
} from "./types";
import { WriteBehindQueue, WriteBehindFlusher } from "./writeBehind";

export declare interface Leaderboard {
  on(event: "score:submitted", listener: (e: ScoreSubmittedEvent) => void): this;
  on(event: "new:leader",      listener: (e: NewLeaderEvent) => void): this;
  on(event: "rank:change",     listener: (e: RankChangeEvent) => void): this;
  on(event: "persistence:error", listener: (e: PersistenceErrorEvent) => void): this;
  on(event: "flush:complete",  listener: (e: FlushCompleteEvent) => void): this;

  emit(event: "score:submitted", e: ScoreSubmittedEvent): boolean;
  emit(event: "new:leader",      e: NewLeaderEvent): boolean;
  emit(event: "rank:change",     e: RankChangeEvent): boolean;
  emit(event: "persistence:error", e: PersistenceErrorEvent): boolean;
  emit(event: "flush:complete",  e: FlushCompleteEvent): boolean;
}

export class Leaderboard extends EventEmitter {
  private redisService: RedisServiceLike;
  private persistenceService: PersistenceServiceLike;
  private config?: LeaderboardConfig;
  private writeBehindQueue?: WriteBehindQueue;
  private writeBehindFlusher?: WriteBehindFlusher;

  constructor(
    redisService: RedisServiceLike,
    persistenceService: PersistenceServiceLike,
    config?: LeaderboardConfig,
  ) {
    super();
    this.redisService = redisService;
    this.persistenceService = persistenceService;
    this.config = config;

    if (config?.writeBehind) {
      this.writeBehindQueue = new WriteBehindQueue();
      this.writeBehindFlusher = new WriteBehindFlusher(
        this.writeBehindQueue,
        (items) => this.persistenceService.bulkUpsert(items),
        config.writeBehind.intervalMs,
        (err, items) => {
          this.emit("persistence:error", { err, items });
        },
        (count, durationMs) => this.emit("flush:complete", { count, durationMs }),
      );
      this.writeBehindFlusher.start();
    }
  }

  async submitScore(gameId: string, userId: string, score: number): Promise<void> {
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
      this.writeBehindQueue.enqueue(gameId, userId, score);
    } else {
      try {
        await this.persistenceService.upsertScore(gameId, userId, score);
      } catch (err) {
        console.error(
          `[Leaderboard] Persistence upsert failed for userId="${userId}" gameId="${gameId}". ` +
          `Redis is updated but durable store is stale.`,
          err,
        );
        throw err;
      }
    }

    this.emit("score:submitted", { gameId, userId, score });

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
      top = await this.persistenceService.getTop(gameId, limit);
      if (top.length) {
        await this.redisService.setBulk(gameId, top);
      }
    }
    return top;
  }

  async getUserRank(gameId: string, userId: string): Promise<number | null> {
    const rank = await this.redisService.getRank(gameId, userId);
    if (rank !== null) return rank;
    return await this.persistenceService.getRank(gameId, userId);
  }


  async shutdown(): Promise<void> {
    if (this.writeBehindFlusher) {
      this.writeBehindFlusher.stop();
      await this.writeBehindFlusher.flush(); // drain remaining items
    }
  }
}

export function createLeaderboard(deps: LeaderboardDependencies) {
  if (!deps.redisService) {
    throw new Error(
      "createLeaderboard requires deps.redisService (passed as the first Leaderboard constructor argument)"
    );
  }

  const persistenceService = deps.persistenceService ?? deps.postgresService;
  if (!persistenceService) {
    throw new Error(
      "createLeaderboard requires either deps.persistenceService or deps.postgresService"
    );
  }
  return new Leaderboard(deps.redisService, persistenceService, deps.config);
}

export { RedisService } from "./redisService";
export { PostgresService } from "./postgresService";
export { MySQLService } from "./mysqlService";
export { MongoDBService } from "./mongoService";
