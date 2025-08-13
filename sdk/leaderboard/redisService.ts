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

  async updateScore(gameId: string, userId: string, score: number) {
    await this.redis.zAdd(this.key(gameId), [{ score, value: userId }]);
  }

  async getTop(gameId: string, limit: number): Promise<PlayerScore[]> {
    const result = await this.redis.zRangeWithScores(
      this.key(gameId),
      0,
      limit - 1,
      { REV: true }
    );
    return result.map(r => ({ userId: r.value, score: r.score, gameName: gameId }));
  }

  async setBulk(gameId: string, scores: PlayerScore[]) {
    const pipeline = this.redis.multi();
    scores.forEach(s =>
      pipeline.zAdd(this.key(gameId), [{ score: s.score, value: s.userId }])
    );
    await pipeline.exec();
  }

  async getRank(gameId: string, userId: string) {
    const rank = await this.redis.zRevRank(this.key(gameId), userId);
    return rank !== null ? rank + 1 : null;
  }
}
