import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import type { PersistenceProvider, PersistenceServiceLike } from "../sdk/leaderboard/types";

import { createRedisClient } from "../config/redis";
import { createPostgresClient } from "../config/postgres";
import { createMySQLClient } from "../config/mysql";
import { createMongoClient } from "../config/mongodb";
import { Leaderboard } from "../sdk/leaderboard";
import { RedisService } from "../sdk/leaderboard/redisService";
import { PostgresService } from "../sdk/leaderboard/postgresService";
import { MySQLService } from "../sdk/leaderboard/mysqlService";
import { MongoDBService } from "../sdk/leaderboard/mongoService";
import { createLeaderboardRouter } from "../sdk/router";

dotenv.config();

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  app.use(express.json());

  // DB Connections
  const redisClient = await createRedisClient();

  const provider = (process.env.PERSISTENCE_PROVIDER || "postgres").toLowerCase() as PersistenceProvider;
  if (!["postgres", "mysql", "mongodb"].includes(provider)) {
    throw new Error(
      `Unsupported PERSISTENCE_PROVIDER="${process.env.PERSISTENCE_PROVIDER}". Use postgres, mysql, or mongodb.`
    );
  }

  // Dynamic config
  const config = {
    redisPrefix: "leaderboard",
    tableName: "leaderboard_scores",
    collectionName: "leaderboard_scores",
    columns: {
      gameId: "game_id",
      userId: "user_id",
      score: "score",
    },
  };

  const redisService = new RedisService(redisClient, config.redisPrefix);
  let persistenceService: PersistenceServiceLike;

  if (provider === "postgres") {
    const pgClient = createPostgresClient();
    await pgClient.query("SELECT 1");
    persistenceService = new PostgresService(pgClient, config);
  } else if (provider === "mysql") {
    const mysqlClient = createMySQLClient();
    await mysqlClient.query("SELECT 1");
    persistenceService = new MySQLService(mysqlClient, config);
  } else {
    const mongoClient = await createMongoClient();
    const dbName = process.env.MONGODB_DB || "leaderboard";
    const collectionName = config.collectionName || config.tableName;
    const collection = mongoClient.db(dbName).collection(collectionName);

    await collection.createIndex(
      { [config.columns.gameId]: 1, [config.columns.userId]: 1 },
      { unique: true }
    );
    await collection.createIndex({
      [config.columns.gameId]: 1,
      [config.columns.score]: -1,
    });

    persistenceService = new MongoDBService(collection, config);
  }

  const leaderboard = new Leaderboard(redisService, persistenceService, config);

  app.use("/leaderboard", createLeaderboardRouter(leaderboard, io));

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("join-game", (gameId: string) => {
      socket.join(gameId);
    });
  });

  server.listen(process.env.PORT || 3000, () =>
    console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`)
  );
}

main().catch(console.error);
