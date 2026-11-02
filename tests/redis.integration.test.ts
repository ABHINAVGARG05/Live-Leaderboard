/// <reference types="jest" />

/**
 * Integration tests against a real Redis (>= 6.2).
 * Skipped unless REDIS_URL is set — CI provides one via a service container.
 *   REDIS_URL=redis://localhost:6379 pnpm test
 */

import http from "http";
import type { AddressInfo } from "net";
import express from "express";
import { Server as SocketIOServer } from "socket.io";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { createClient, type RedisClientType, type RedisModules } from "redis";

import { Leaderboard } from "../sdk/leaderboard";
import { RedisService } from "../sdk/leaderboard/redisService";
import { createLeaderboardRouter } from "../sdk/router";
import type {
  PersistenceServiceLike,
  RankedPlayerScore,
} from "../sdk/leaderboard/types";
import { attachRedisAdapter, registerSocketHandlers } from "../server/socket";

const REDIS_URL = process.env.REDIS_URL;
const describeIfRedis = REDIS_URL ? describe : describe.skip;

jest.setTimeout(20_000);

function emptyPersistence(): PersistenceServiceLike {
  return {
    upsertScore: async () => {},
    bulkUpsert: async () => {},
    getTop: async () => [],
    getRank: async () => null,
  };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitFor timed out");
}

describeIfRedis("Redis integration", () => {
  let redis: RedisClientType<RedisModules>;
  const prefix = `lb-test-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    redis = createClient({ url: REDIS_URL }) as RedisClientType<RedisModules>;
    await redis.connect();
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(keys);
    await redis.quit();
  });

  describe("ranking and ties", () => {
    it("ties share a rank (1224), lower scores never overwrite, top order is deterministic", async () => {
      const service = new RedisService(redis, prefix);
      const lb = new Leaderboard(service, emptyPersistence());

      await lb.submitScore("g1", "alice", 100);
      await lb.submitScore("g1", "bob", 100);
      await lb.submitScore("g1", "carol", 50);
      await lb.submitScore("g1", "alice", 10); // lower: must be ignored (ZADD GT)

      await expect(lb.getUserRank("g1", "alice")).resolves.toBe(1);
      await expect(lb.getUserRank("g1", "bob")).resolves.toBe(1);
      await expect(lb.getUserRank("g1", "carol")).resolves.toBe(3);

      const top = await lb.getTopPlayers("g1", 10);
      expect(top.map((p) => [p.userId, p.score, p.rank])).toEqual([
        ["bob", 100, 1], // ties: userId descending (byte order)
        ["alice", 100, 1],
        ["carol", 50, 3],
      ]);
    });
  });

  describe("multi-instance Socket.IO", () => {
    const servers: http.Server[] = [];
    const ios: SocketIOServer[] = [];
    const closers: Array<() => Promise<void>> = [];
    let client: ClientSocket | undefined;

    afterEach(async () => {
      client?.disconnect();
      for (const io of ios) await new Promise<void>((r) => io.close(() => r()));
      for (const close of closers) await close();
      servers.length = ios.length = closers.length = 0;
    });

    async function startInstance(leaderboard?: Leaderboard) {
      const app = express();
      app.use(express.json());
      const server = http.createServer(app);
      const io = new SocketIOServer(server);
      closers.push(await attachRedisAdapter(io, redis));
      registerSocketHandlers(io);
      if (leaderboard) {
        app.use("/leaderboard", createLeaderboardRouter(leaderboard, io));
      }
      await new Promise<void>((r) => server.listen(0, r));
      servers.push(server);
      ios.push(io);
      const { port } = server.address() as AddressInfo;
      return { io, url: `http://127.0.0.1:${port}` };
    }

    it("a score POSTed to instance A reaches a client connected to instance B", async () => {
      const lb = new Leaderboard(
        new RedisService(redis, `${prefix}:socket`),
        emptyPersistence(),
      );
      const a = await startInstance(lb);
      const b = await startInstance();
      const room = "game-xyz";

      client = connectClient(b.url, { transports: ["websocket"] });
      const update = new Promise<RankedPlayerScore[]>((resolve) =>
        client!.on("leaderboard:update", resolve),
      );
      client.emit("join-game", room);

      // Instance A can see the socket joined on instance B only through the adapter.
      await waitFor(async () => (await a.io.in(room).fetchSockets()).length === 1);

      const res = await fetch(`${a.url}/leaderboard/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId: room, userId: "alice", score: 42 }),
      });
      expect(res.status).toBe(200);

      await expect(update).resolves.toEqual([
        { gameId: room, userId: "alice", score: 42, rank: 1 },
      ]);
    });
  });
});
