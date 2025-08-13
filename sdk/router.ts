import express from 'express';
import { Leaderboard } from './leaderboard';
import { Server as SocketIOServer } from 'socket.io';

export function createLeaderboardRouter(leaderboard: Leaderboard, io?: SocketIOServer): express.Router {
  const router = express.Router();

  router.post('/score', async (req, res) => {
    const { gameId, userId, score } = req.body;
    if (!gameId || !userId || typeof score !== 'number') {
      res.status(400).json({ error: 'Invalid fields' });
      return;
    }
    await leaderboard.submitScore(gameId, userId, score);
    const top = await leaderboard.getTopPlayers(gameId);
    if (io) io.to(gameId).emit('leaderboard:update', top);
    res.json({ success: true });
  });

  router.get('/:gameId/top', async (req, res) => {
    const top = await leaderboard.getTopPlayers(req.params.gameId);
    res.json(top);
  });

  router.get('/:gameId/rank/:userId', async (req, res) => {
    const rank = await leaderboard.getUserRank(req.params.gameId, req.params.userId);
    res.json({ rank });
  });

  return router;
}
