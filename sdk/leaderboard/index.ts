import type { RedisService } from "./redisService";
import type { PostgresService } from "./postgresService";
import type { PlayerScore } from "./types";

export class Leaderboard {
  private redisService: RedisService;
  private postgresService: PostgresService;

  constructor(redisService: RedisService, postgresService: PostgresService) {
    this.redisService = redisService;
    this.postgresService = postgresService;
  }

  async submitScore(gameId: string, userId: string, score: number) {
    await this.redisService.updateScore(gameId, userId, score);
    await this.postgresService.upsertScore(gameId, userId, score);
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

  async getUserRank(gameId: string, userId: string) {
    return await this.redisService.getRank(gameId, userId);
  }
}
