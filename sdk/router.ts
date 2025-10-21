import express from "express";
import { Leaderboard } from "./leaderboard";
import { Server as SocketIOServer } from "socket.io";

export function createLeaderboardRouter(
  leaderboard: Leaderboard,
  io?: SocketIOServer
): express.Router {
  const router = express.Router();

  router.post("/score", async (req, res) => {
    const gameIdRaw = req.body?.gameId;
    const userIdRaw = req.body?.userId;
    const scoreRaw = req.body?.score;

    const gameId = typeof gameIdRaw === "string" ? gameIdRaw.trim() : "";
    const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : "";
    const score = Number.isFinite(scoreRaw) ? Number(scoreRaw) : NaN;

    if (
      !gameId ||
      !userId ||
      !Number.isFinite(score) ||
      !Number.isInteger(score) ||
      score < 0
    ) {
      res.status(400).json({ error: "Invalid fields" });
      return;
    }

    await leaderboard.submitScore(gameId, userId, score);
    const top = await leaderboard.getTopPlayers(gameId);
    if (io) io.to(gameId).emit("leaderboard:update", top);
    res.json({ success: true });
  });

  router.get("/:gameId/top", async (req, res) => {
    const limitParam = req.query.limit;
    let limit = 10;
    if (typeof limitParam !== "undefined") {
      const parsed = parseInt(String(limitParam), 10);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
        res.status(400).json({ error: "Invalid limit parameter" });
        return;
      }
      // hard cap to prevent abuse
      limit = Math.min(parsed, 100);
    }

    const top = await leaderboard.getTopPlayers(req.params.gameId, limit);
    res.json(top);
  });

  router.get("/:gameId/rank/:userId", async (req, res) => {
    const rank = await leaderboard.getUserRank(
      req.params.gameId,
      req.params.userId
    );
    res.json({ rank });
  });

  return router;
}
