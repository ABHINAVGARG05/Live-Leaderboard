import type { RedisClientType, RedisModules } from "redis";
import type { Pool } from "pg";
import type { MongoClient } from "mongodb";
import type { Pool as MySQLPool } from "mysql2/promise";

import {
  createRedisClient,
  createPostgresClient,
  createMySQLClient,
  createMongoClient,
  leaderboardConfig,
} from "../config";
import { RedisService } from "../sdk/leaderboard/redisService";
import { PostgresService } from "../sdk/leaderboard/postgresService";
import { MySQLService } from "../sdk/leaderboard/mysqlService";
import { MongoDBService } from "../sdk/leaderboard/mongoService";
import { createLeaderboard, Leaderboard } from "../sdk/leaderboard";
import type { PersistenceProvider, PersistenceServiceLike } from "../sdk/leaderboard/types";

export interface AppServices {
  leaderboard: Leaderboard;
  redisClient: RedisClientType<RedisModules>;
  persistenceProvider: PersistenceProvider;
  persistenceClient: Pool | MySQLPool | MongoClient;
}

function getPersistenceProvider(): PersistenceProvider {
  const providerRaw = (process.env.PERSISTENCE_PROVIDER || "postgres").toLowerCase();
  if (providerRaw === "postgres" || providerRaw === "mysql" || providerRaw === "mongodb") {
    return providerRaw;
  }
  throw new Error(
    `Unsupported PERSISTENCE_PROVIDER="${providerRaw}". Use postgres, mysql, or mongodb.`
  );
}

function extractDatabaseNameFromMongoUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  try {
    const url = new URL(uri);
    const dbName = url.pathname.replace(/^\//, "");
    return dbName || undefined;
  } catch {
    return undefined;
  }
}

function getMongoDatabaseName(): string {
  return (
    process.env.MONGODB_DB ||
    process.env.MONGODB_DATABASE ||
    extractDatabaseNameFromMongoUri(process.env.MONGODB_URL || process.env.MONGODB_URI) ||
    "leaderboard"
  );
}

export async function createAppServices(): Promise<AppServices> {
  const redisClient = await createRedisClient();
  const provider = getPersistenceProvider();

  if (!redisClient) {
    throw new Error("Failed to establish Redis connection");
  }

  let persistenceService: PersistenceServiceLike;
  let persistenceClient: Pool | MySQLPool | MongoClient;

  if (provider === "postgres") {
    const pgClient = createPostgresClient();
    try {
      await pgClient.query("SELECT 1");
    } catch {
      await redisClient.quit();
      throw new Error("Failed to establish Postgres connection");
    }
    persistenceClient = pgClient;
    persistenceService = new PostgresService(pgClient, leaderboardConfig);
  } else if (provider === "mysql") {
    const mysqlClient = createMySQLClient();
    try {
      await mysqlClient.query("SELECT 1");
    } catch {
      await redisClient.quit();
      await mysqlClient.end();
      throw new Error("Failed to establish MySQL connection");
    }
    persistenceClient = mysqlClient;
    persistenceService = new MySQLService(mysqlClient, leaderboardConfig);
  } else {
    const mongoClient = await createMongoClient();
    try {
      await mongoClient.db(getMongoDatabaseName()).command({ ping: 1 });
    } catch {
      await redisClient.quit();
      await mongoClient.close();
      throw new Error("Failed to establish MongoDB connection");
    }

    const collectionName = leaderboardConfig.collectionName || leaderboardConfig.tableName;
    const collection = mongoClient
      .db(getMongoDatabaseName())
      .collection(collectionName);

    await collection.createIndex(
      {
        [leaderboardConfig.columns.gameId]: 1,
        [leaderboardConfig.columns.userId]: 1,
      },
      { unique: true }
    );
    await collection.createIndex({
      [leaderboardConfig.columns.gameId]: 1,
      [leaderboardConfig.columns.score]: -1,
    });

    persistenceClient = mongoClient;
    persistenceService = new MongoDBService(collection, leaderboardConfig);
  }

  const redisService = new RedisService(
    redisClient,
    leaderboardConfig.redisPrefix,
  );
  const leaderboard = createLeaderboard({
    redisService,
    persistenceService,
    config: leaderboardConfig,
  });

  return {
    leaderboard,
    redisClient,
    persistenceProvider: provider,
    persistenceClient,
  };
}
