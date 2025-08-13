import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";

import { createRedisClient } from "../config/redis";
import { createPostgresClient } from "../config/postgres";
import { Leaderboard } from "../sdk/leaderboard";
import { RedisService } from "../sdk/leaderboard/redisService";
import { PostgresService } from "../sdk/leaderboard/postgresService";
import { createLeaderboardRouter } from "../sdk/router";

dotenv.config();

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  app.use(express.json());

  // DB Connections
  const redisClient = await createRedisClient();
  const pgClient = createPostgresClient();

  // Dynamic config
  const config = {
    redisPrefix: "leaderboard",
    tableName: "leaderboard_scores",
    columns: {
      gameId: "game_id",
      userId: "user_id",
      score: "score",
    },
  };

  const redisService = new RedisService(redisClient, config.redisPrefix);
  const postgresService = new PostgresService(pgClient, config);
  const leaderboard = new Leaderboard(redisService, postgresService);

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
