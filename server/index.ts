import express from "express";
import http from "http";
import dotenv from "dotenv";

import { createSocketServer } from "./socket";
import { registerRoutes } from "./routes";
import { createAppServices } from "./container";

dotenv.config();

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json());

  const { leaderboard } = await createAppServices();
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
