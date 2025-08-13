import express from "express";
import http from "http";
import dotenv from "dotenv";

import { createRedisClient, createPostgresClient, leaderboardConfig } from "../config";
import { RedisService } from "../sdk/leaderboard/redisService";
import { PostgresService } from "../sdk/leaderboard/postgresService";
import { Leaderboard } from "../sdk/leaderboard";
import { createSocketServer } from "./socket";
import { registerRoutes } from "./routes";

dotenv.config();

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  // Connections
  const redisClient = await createRedisClient();
  const pgClient = createPostgresClient();

  // Services
  const redisService = new RedisService(redisClient, leaderboardConfig.redisPrefix);
  const postgresService = new PostgresService(pgClient, leaderboardConfig);
  const leaderboard = new Leaderboard(redisService, postgresService);

  // Sockets
  const io = createSocketServer(server);

  // Routes
  registerRoutes(app, leaderboard, io);

  // Start server
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
