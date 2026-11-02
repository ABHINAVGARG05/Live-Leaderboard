import type { RedisClientType, RedisModules } from "redis";
import type { PlayerScore } from "./types";

export class RedisService {
  private redis: RedisClientType<RedisModules>;
  private prefix: string;

  constructor(redisClient: RedisClientType<RedisModules>, prefix: string) {
    this.redis = redisClient;
    this.prefix = prefix;
  }

  private key(gameId: string) {
    return `${this.prefix}:${gameId}`;
  }

  async updateScore(
    gameId: string,
    userId: string,
    score: number,
    maxEntries?: number
  ): Promise<void> {
    // GT: only update when the new score is higher, matching the max-score
    // semantics of the persistence services (GREATEST / $max). Requires Redis >= 6.2.
    await this.redis.zAdd(this.key(gameId), [{ score, value: userId }], {
      GT: true,
    });
    // If a cap is configured, trim the sorted set to keep only the top N entries
    if (maxEntries && maxEntries > 0) {
      await this.redis.zRemRangeByRank(this.key(gameId), 0, -(maxEntries + 1));
    }
  }

  /**
   * Top players by score descending. Redis orders equal scores by member in
   * reverse byte order; the persistence services use the same tie order
   * (userId descending, binary comparison) so results agree across stores.
   */
  async getTop(gameId: string, limit: number): Promise<PlayerScore[]> {
    const result = await this.redis.zRangeWithScores(
      this.key(gameId),
      0,
      limit - 1,
      { REV: true },
    );
    return result.map((r) => ({ userId: r.value, score: r.score, gameId }));
  }

  async setBulk(gameId: string, scores: PlayerScore[]) {
    const pipeline = this.redis.multi();
    scores.forEach((s) =>
      pipeline.zAdd(this.key(gameId), [{ score: s.score, value: s.userId }]),
    );
    await pipeline.exec();
  }

  /**
   * Standard competition rank ("1224"): 1 + the number of players with a
   * strictly higher score, so tied players share a rank. This matches SQL
   * RANK() and the MongoDB count used by the persistence services.
   * (ZREVRANK would instead give tied players distinct ranks ordered by member.)
   */
  async getRank(gameId: string, userId: string): Promise<number | null> {
    const key = this.key(gameId);
    const score = await this.redis.zScore(key, userId);
    if (score === null || score === undefined) return null;
    const higher = await this.redis.zCount(key, `(${score}`, "+inf");
    return higher + 1;
  }
}
