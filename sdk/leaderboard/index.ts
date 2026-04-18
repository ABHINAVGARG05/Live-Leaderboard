import type {
  PlayerScore,
  LeaderboardConfig,
  LeaderboardDependencies,
  RedisServiceLike,
  PostgresServiceLike,
} from "./types";

export class Leaderboard {
  private redisService: RedisServiceLike;
  private postgresService: PostgresServiceLike;
  private config?: LeaderboardConfig;

  constructor(
    redisService: RedisServiceLike,
    postgresService: PostgresServiceLike,
    config?: LeaderboardConfig,
  ) {
    this.redisService = redisService;
    this.postgresService = postgresService;
    this.config = config;
  }

  async submitScore(gameId: string, userId: string, score: number): Promise<void> {
    await this.redisService.updateScore(
      gameId,
      userId,
      score,
      this.config?.maxEntriesPerGame
    );
    try {
      await this.postgresService.upsertScore(gameId, userId, score);
    } catch (err) {
      // Redis write succeeded but Postgres failed — log clearly so the
      // caller knows the data is in an inconsistent state and can decide
      // whether to retry, alert, or surface the error.
      console.error(
        `[Leaderboard] Postgres upsert failed for userId="${userId}" gameId="${gameId}". ` +
        `Redis is updated but Postgres is stale.`,
        err
      );
      throw err;
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
    // Redis is cold or the user isn't in the sorted set yet — fall back to Postgres
    return await this.postgresService.getRank(gameId, userId);
  }
}

export function createLeaderboard(deps: LeaderboardDependencies) {
  return new Leaderboard(deps.redisService, deps.postgresService, deps.config);
}
