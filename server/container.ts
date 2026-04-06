import type { RedisClientType, RedisModules } from "redis";
import type { Pool } from "pg";

import {
  createRedisClient,
  createPostgresClient,
  leaderboardConfig,
} from "../config";
import { RedisService } from "../sdk/leaderboard/redisService";
import { PostgresService } from "../sdk/leaderboard/postgresService";
import { createLeaderboard, Leaderboard } from "../sdk/leaderboard";

export interface AppServices {
  leaderboard: Leaderboard;
  redisClient: RedisClientType<RedisModules>;
  pgClient: Pool;
}

export async function createAppServices(): Promise<AppServices> {
  const redisClient = await createRedisClient();
  const pgClient = createPostgresClient();

  if (!redisClient || !pgClient) {
    throw new Error("Failed to establish database connections");
  }

  const redisService = new RedisService(
    redisClient,
    leaderboardConfig.redisPrefix
  );
  const postgresService = new PostgresService(pgClient, leaderboardConfig);
  const leaderboard = createLeaderboard({ redisService, postgresService });

  return { leaderboard, redisClient, pgClient };
}
