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

    // Build a descriptive validation error so callers know exactly what's wrong
    const errors: Record<string, string> = {};
    if (!gameId) errors.gameId = "required and must be a non-empty string";
    if (!userId) errors.userId = "required and must be a non-empty string";
    if (!Number.isFinite(score)) errors.score = "must be a finite number";
    else if (!Number.isInteger(score)) errors.score = "must be an integer";
    else if (score < 0) errors.score = "must be non-negative";

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: "Validation failed", fields: errors });
      return;
    }

    try {
      await leaderboard.submitScore(gameId, userId, score);
      const top = await leaderboard.getTopPlayers(gameId);
      if (io) io.to(gameId).emit("leaderboard:update", top);
      res.json({ success: true });
    } catch (err) {
      console.error("[POST /score]", err);
      res.status(500).json({ error: "Failed to submit score. Please try again." });
    }
  });

  router.get("/:gameId/top", async (req, res) => {
    const limitParam = req.query.limit;
    let limit = 10;
    if (typeof limitParam !== "undefined") {
      const parsed = parseInt(String(limitParam), 10);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
        res.status(400).json({
          error: "Validation failed",
          fields: { limit: "must be a positive integer" },
        });
        return;
      }
      // hard cap to prevent abuse
      limit = Math.min(parsed, 100);
    }

    try {
      const top = await leaderboard.getTopPlayers(req.params.gameId, limit);
      res.json(top);
    } catch (err) {
      console.error("[GET /:gameId/top]", err);
      res.status(500).json({ error: "Failed to fetch leaderboard. Please try again." });
    }
  });

  router.get("/:gameId/rank/:userId", async (req, res) => {
    try {
      const rank = await leaderboard.getUserRank(
        req.params.gameId,
        req.params.userId
      );
      res.json({ rank });
    } catch (err) {
      console.error("[GET /:gameId/rank/:userId]", err);
      res.status(500).json({ error: "Failed to fetch rank. Please try again." });
    }
  });

  return router;
}
