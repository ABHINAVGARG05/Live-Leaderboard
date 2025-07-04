import express from 'express';
import { createClient, RedisClientType, RedisModules } from 'redis';
import { Leaderboard } from '../sdk/leaderboard';
import { createLeaderboardRouter } from '../sdk/router';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

app.use(express.json());

async function main() {
  const redis = createClient({ url: process.env.REDIS_URL }) as RedisClientType<RedisModules>;
  await redis.connect();

  const leaderboard = new Leaderboard(redis);
  const leaderboardRouter = createLeaderboardRouter(leaderboard, io);
  app.use('/leaderboard', leaderboardRouter);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('join-game', (gameId: string) => {
      socket.join(gameId);
    });
  });

  server.listen(3000, () => console.log('Server running on http://localhost:3000'));
}

main().catch(err => {
  console.error('Fatal error:', err);
});
