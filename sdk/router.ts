import express, { Request, Response } from 'express';
import { Leaderboard } from './leaderboard';
import { Server as SocketIOServer } from 'socket.io';

export function createLeaderboardRouter(
  leaderboard: Leaderboard,
  io?: SocketIOServer
): express.Router {
  const router = express.Router();

  router.post(
  '/score',
  async function (
    req: Request<{}, {}, { gameId: string; userId: string; score: number }>,
    res: Response
  ): Promise<void> {
    const { gameId, userId, score } = req.body;
    if (!gameId || !userId || typeof score !== 'number') {
      res.status(400).json({ error: 'Missing or invalid fields' });
      return;
    }
    await leaderboard.submitScore(gameId, userId, score);
    const top = await leaderboard.getTopPlayers(gameId);
    if (io) io.to(gameId).emit('leaderboard:update', top);
    res.json({ success: true });
  }
);


  router.get(
    '/top/:gameId',
    async (req: Request<{ gameId: string }>, res: Response) => {
      const { gameId } = req.params;
      const top = await leaderboard.getTopPlayers(gameId);
      res.json(top);
    }
  );

  router.get(
    '/rank/:gameId/:userId',
    async (
      req: Request<{ gameId: string; userId: string }>,
      res: Response
    ) => {
      const { gameId, userId } = req.params;
      const rank = await leaderboard.getUserRank(gameId, userId);
      res.json({ rank });
    }
  );

  return router;
}
