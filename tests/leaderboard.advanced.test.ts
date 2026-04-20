/// <reference types="jest" />

/**
 * Advanced tests for write-behind batching and event emission.
 */

import { Leaderboard } from "../sdk/leaderboard";
import { WriteBehindQueue, WriteBehindFlusher } from "../sdk/leaderboard/writeBehind";
import type {
  RedisServiceLike,
  PostgresServiceLike,
} from "../sdk/leaderboard/types";


function makeRedis(overrides: Partial<RedisServiceLike> = {}): jest.Mocked<RedisServiceLike> {
  return {
    updateScore: jest.fn().mockResolvedValue(undefined),
    getTop:      jest.fn().mockResolvedValue([]),
    setBulk:     jest.fn().mockResolvedValue(undefined),
    getRank:     jest.fn().mockResolvedValue(null),
    ...overrides,
  } as jest.Mocked<RedisServiceLike>;
}

function makePostgres(overrides: Partial<PostgresServiceLike> = {}): jest.Mocked<PostgresServiceLike> {
  return {
    upsertScore: jest.fn().mockResolvedValue(undefined),
    bulkUpsert:  jest.fn().mockResolvedValue(undefined),
    getTop:      jest.fn().mockResolvedValue([]),
    getRank:     jest.fn().mockResolvedValue(null),
    ...overrides,
  } as jest.Mocked<PostgresServiceLike>;
}

const BASE_CONFIG = {
  redisPrefix: "lb",
  tableName: "leaderboard_scores",
  columns: { gameId: "game_id", userId: "user_id", score: "score" },
};


describe("WriteBehindQueue", () => {
  it("enqueues items and returns them on drain", () => {
    const q = new WriteBehindQueue();
    q.enqueue("g1", "alice", 100);
    q.enqueue("g1", "bob",   200);

    const items = q.drain();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.userId === "alice")?.score).toBe(100);
    expect(items.find((i) => i.userId === "bob")?.score).toBe(200);
  });

  it("deduplicates — keeps the highest score for the same player in the same game", () => {
    const q = new WriteBehindQueue();
    q.enqueue("g1", "alice", 50);
    q.enqueue("g1", "alice", 200); // higher — should win
    q.enqueue("g1", "alice", 30);  // lower — should be ignored

    const items = q.drain();
    expect(items).toHaveLength(1);
    expect(items[0].score).toBe(200);
  });

  it("does not mix players across different games", () => {
    const q = new WriteBehindQueue();
    q.enqueue("g1", "alice", 100);
    q.enqueue("g2", "alice", 999); // same userId, different game

    const items = q.drain();
    expect(items).toHaveLength(2);
  });

  it("drain clears the queue", () => {
    const q = new WriteBehindQueue();
    q.enqueue("g1", "alice", 100);
    q.drain();

    expect(q.size).toBe(0);
    expect(q.drain()).toHaveLength(0);
  });

  it("reports size correctly", () => {
    const q = new WriteBehindQueue();
    expect(q.size).toBe(0);
    q.enqueue("g1", "alice", 100);
    q.enqueue("g1", "bob",   200);
    expect(q.size).toBe(2);
    q.drain();
    expect(q.size).toBe(0);
  });
});


describe("WriteBehindFlusher", () => {
  it("calls flushFn with drained items", async () => {
    const queue = new WriteBehindQueue();
    queue.enqueue("g1", "alice", 100);

    const flushFn = jest.fn().mockResolvedValue(undefined);
    const flusher = new WriteBehindFlusher(queue, flushFn, 5000, jest.fn());

    await flusher.flush();

    expect(flushFn).toHaveBeenCalledWith([
      { gameId: "g1", userId: "alice", score: 100 },
    ]);
  });

  it("does nothing when the queue is empty", async () => {
    const flushFn = jest.fn().mockResolvedValue(undefined);
    const flusher = new WriteBehindFlusher(new WriteBehindQueue(), flushFn, 5000, jest.fn());

    await flusher.flush();

    expect(flushFn).not.toHaveBeenCalled();
  });

  it("calls onError when flushFn rejects", async () => {
    const queue = new WriteBehindQueue();
    queue.enqueue("g1", "alice", 100);

    const pgError = new Error("PG down");
    const flushFn = jest.fn().mockRejectedValue(pgError);
    const onError = jest.fn();
    const flusher = new WriteBehindFlusher(queue, flushFn, 5000, onError);

    await flusher.flush();

    expect(onError).toHaveBeenCalledWith(pgError, [
      { gameId: "g1", userId: "alice", score: 100 },
    ]);
  });

  it("calls onComplete with count and durationMs on success", async () => {
    const queue = new WriteBehindQueue();
    queue.enqueue("g1", "alice", 100);
    queue.enqueue("g1", "bob",   200);

    const onComplete = jest.fn();
    const flusher = new WriteBehindFlusher(
      queue,
      jest.fn().mockResolvedValue(undefined),
      5000,
      jest.fn(),
      onComplete,
    );

    await flusher.flush();

    expect(onComplete).toHaveBeenCalledWith(2, expect.any(Number));
  });

  it("stop() prevents further timed flushes", () => {
    const flusher = new WriteBehindFlusher(
      new WriteBehindQueue(),
      jest.fn(),
      100,
      jest.fn(),
    );
    flusher.start();
    expect(flusher.isRunning).toBe(true);
    flusher.stop();
    expect(flusher.isRunning).toBe(false);
  });

  it("start() is idempotent — calling twice does not create two timers", () => {
    const flushFn = jest.fn().mockResolvedValue(undefined);
    const flusher = new WriteBehindFlusher(new WriteBehindQueue(), flushFn, 5000, jest.fn());
    flusher.start();
    flusher.start(); // second call should be a no-op
    expect(flusher.isRunning).toBe(true);
    flusher.stop();
  });
});

describe("Leaderboard write-behind mode", () => {
  it("enqueues to write-behind queue instead of calling upsertScore directly", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres, {
      ...BASE_CONFIG,
      writeBehind: { intervalMs: 60_000 },
    });

    await lb.submitScore("g1", "alice", 100);

    // Postgres should NOT have been called synchronously
    expect(postgres.upsertScore).not.toHaveBeenCalled();

    await lb.shutdown(); // triggers flush
  });

  it("shutdown() flushes remaining queued writes to Postgres via bulkUpsert", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres, {
      ...BASE_CONFIG,
      writeBehind: { intervalMs: 60_000 },
    });

    await lb.submitScore("g1", "alice", 100);
    await lb.submitScore("g1", "bob",   200);
    await lb.shutdown();

    expect(postgres.bulkUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        { gameId: "g1", userId: "alice", score: 100 },
        { gameId: "g1", userId: "bob",   score: 200 },
      ]),
    );
  });

  it("emits postgres:error when bulkUpsert fails during flush", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres({
      bulkUpsert: jest.fn().mockRejectedValue(new Error("Flush failed")),
    });
    const lb = new Leaderboard(redis, postgres, {
      ...BASE_CONFIG,
      writeBehind: { intervalMs: 60_000 },
    });

    await lb.submitScore("g1", "alice", 100);

    const errorHandler = jest.fn();
    lb.on("postgres:error", errorHandler);

    await lb.shutdown();

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        items: expect.arrayContaining([
          { gameId: "g1", userId: "alice", score: 100 },
        ]),
      }),
    );
  });

  it("emits persistence:error when bulkUpsert fails during flush", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres({
      bulkUpsert: jest.fn().mockRejectedValue(new Error("Flush failed")),
    });
    const lb = new Leaderboard(redis, postgres, {
      ...BASE_CONFIG,
      writeBehind: { intervalMs: 60_000 },
    });

    await lb.submitScore("g1", "alice", 100);

    const errorHandler = jest.fn();
    lb.on("persistence:error", errorHandler);

    await lb.shutdown();

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        items: expect.arrayContaining([
          { gameId: "g1", userId: "alice", score: 100 },
        ]),
      }),
    );
  });
});


describe("Leaderboard events", () => {
  it("emits score:submitted on every successful submitScore", async () => {
    const lb = new Leaderboard(makeRedis(), makePostgres());
    const handler = jest.fn();
    lb.on("score:submitted", handler);

    await lb.submitScore("g1", "alice", 150);

    expect(handler).toHaveBeenCalledWith({ gameId: "g1", userId: "alice", score: 150 });
  });

  it("emits rank:change when the user's rank changes", async () => {
    const redis = makeRedis({
      getRank: jest.fn()
        .mockResolvedValueOnce(3) // old rank (before update)
        .mockResolvedValueOnce(2) // new rank (after update)
    });
    const lb = new Leaderboard(redis, makePostgres());
    const handler = jest.fn();
    lb.on("rank:change", handler);

    await lb.submitScore("g1", "alice", 300);

    expect(handler).toHaveBeenCalledWith({
      gameId: "g1",
      userId: "alice",
      oldRank: 3,
      newRank: 2,
    });
  });

  it("emits new:leader when the user reaches rank 1", async () => {
    const redis = makeRedis({
      getRank: jest.fn()
        .mockResolvedValueOnce(2) // old rank
        .mockResolvedValueOnce(1) // new rank — they're #1!
    });
    const lb = new Leaderboard(redis, makePostgres());
    const handler = jest.fn();
    lb.on("new:leader", handler);

    await lb.submitScore("g1", "alice", 999);

    expect(handler).toHaveBeenCalledWith({ gameId: "g1", userId: "alice", score: 999 });
  });

  it("does not call getRank at all when nobody is listening for rank events", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres);
    // No listeners attached — no getRank calls expected
    await lb.submitScore("g1", "alice", 100);

    expect(redis.getRank).not.toHaveBeenCalled();
  });

  it("emits flush:complete after a successful write-behind flush", async () => {
    const redis    = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres, {
      ...BASE_CONFIG,
      writeBehind: { intervalMs: 60_000 },
    });

    const handler = jest.fn();
    lb.on("flush:complete", handler);

    await lb.submitScore("g1", "alice", 100);
    await lb.shutdown();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ count: 1, durationMs: expect.any(Number) }),
    );
  });
});
