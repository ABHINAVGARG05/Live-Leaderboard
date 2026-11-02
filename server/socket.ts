import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Server } from "http";
import type { RedisClientType, RedisModules } from "redis";
import { SocketEvent } from "../sdk/leaderboard/types";

/**
 * Routes Socket.IO broadcasts through Redis pub/sub so that
 * `io.to(gameId).emit(...)` on any server instance reaches clients connected
 * to every instance. Without this, a score submitted to instance A is only
 * pushed to sockets connected to instance A.
 *
 * Uses two dedicated connections (a subscribed Redis connection cannot run
 * other commands). Returns a function that closes them.
 */
export async function attachRedisAdapter(
  io: SocketIOServer,
  redisClient: RedisClientType<RedisModules>,
): Promise<() => Promise<void>> {
  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  pubClient.on("error", (err) => console.error("Redis pub client error:", err));
  subClient.on("error", (err) => console.error("Redis sub client error:", err));

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  return async () => {
    await Promise.all([pubClient.quit(), subClient.quit()]);
  };
}

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on(SocketEvent.JoinGame, (gameId: unknown) => {
      // Trim to match the router, which trims gameId before emitting to the room.
      if (typeof gameId !== "string" || !gameId.trim()) return;
      socket.join(gameId.trim());
    });
  });
}

export async function createSocketServer(
  httpServer: Server,
  redisClient: RedisClientType<RedisModules>,
): Promise<SocketIOServer> {
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
  await attachRedisAdapter(io, redisClient);
  registerSocketHandlers(io);
  return io;
}
