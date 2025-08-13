import express from "express";
import { Leaderboard } from "../sdk/leaderboard";
import { createLeaderboardRouter } from "../sdk/router";
import type { Server as SocketIOServer } from "socket.io";

export function registerRoutes(app: express.Application, leaderboard: Leaderboard, io: SocketIOServer) {
  app.use("/leaderboard", createLeaderboardRouter(leaderboard, io));
}
