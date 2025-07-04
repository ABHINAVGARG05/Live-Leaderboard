import type { RedisClientType, RedisModules } from 'redis';

export interface PlayerScore {
  userId: string;
  score: number;
}

export class Leaderboard {
 private redis: RedisClientType<RedisModules>;

  constructor(redisClient: RedisClientType<RedisModules>) {
    this.redis = redisClient;
  }

  async submitScore(gameId: string, userId: string, score: number): Promise<void> {
    const key = `leaderboard:${gameId}`;
    await this.redis.zAdd(key, [{ score, value: userId }]);
  }

  async getTopPlayers(gameId: string, limit: number = 10): Promise<PlayerScore[]> {
    const key = `leaderboard:${gameId}`;
    const result = await this.redis.zRangeWithScores(key, 0, limit - 1, { REV: true });
    return result.map(entry => ({ userId: entry.value, score: entry.score }));
  }

  async getUserRank(gameId: string, userId: string): Promise<number | null> {
    const key = `leaderboard:${gameId}`;
    const rank = await this.redis.zRevRank(key, userId);
    return rank !== null ? rank + 1 : null;
  }
}
