/// <reference types="jest" />

import { createLeaderboard, Leaderboard } from "../sdk/leaderboard";
import type {
  RedisServiceLike,
  PostgresServiceLike,
  PlayerScore,
} from "../sdk/leaderboard/types";
import { PostgresService } from "../sdk/leaderboard/postgresService";


function makeRedis(overrides: Partial<RedisServiceLike> = {}): jest.Mocked<RedisServiceLike> {
  return {
    updateScore: jest.fn().mockResolvedValue(undefined),
    getTop: jest.fn().mockResolvedValue([]),
    setBulk: jest.fn().mockResolvedValue(undefined),
    getRank: jest.fn().mockResolvedValue(null),
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

const samplePlayers: PlayerScore[] = [
  { userId: "alice", score: 200, gameId: "g1" },
  { userId: "bob", score: 100, gameId: "g1" },
];


describe("submitScore", () => {
  it("writes to Redis and Postgres on success", async () => {
    const redis = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres);

    await lb.submitScore("g1", "alice", 200);

    expect(redis.updateScore).toHaveBeenCalledWith("g1", "alice", 200, undefined);
    expect(postgres.upsertScore).toHaveBeenCalledWith("g1", "alice", 200);
  });

  it("passes maxEntriesPerGame to Redis when configured", async () => {
    const redis = makeRedis();
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres, {
      redisPrefix: "lb",
      tableName: "leaderboard_scores",
      columns: { gameId: "game_id", userId: "user_id", score: "score" },
      maxEntriesPerGame: 50,
    });

    await lb.submitScore("g1", "alice", 200);

    expect(redis.updateScore).toHaveBeenCalledWith("g1", "alice", 200, 50);
  });

  it("throws and logs when Postgres upsert fails", async () => {
    const pgError = new Error("Postgres timeout");
    const redis = makeRedis();
    const postgres = makePostgres({
      upsertScore: jest.fn().mockRejectedValue(pgError),
    });
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const lb = new Leaderboard(redis, postgres);

    await expect(lb.submitScore("g1", "alice", 200)).rejects.toThrow("Postgres timeout");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Persistence upsert failed"),
      pgError
    );
    consoleSpy.mockRestore();
  });
});


describe("getTopPlayers", () => {
  it("returns data from Redis when the cache is warm", async () => {
    const redis = makeRedis({ getTop: jest.fn().mockResolvedValue(samplePlayers) });
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres);

    const result = await lb.getTopPlayers("g1", 10);

    expect(result).toEqual(samplePlayers);
    expect(postgres.getTop).not.toHaveBeenCalled(); // no DB call needed
  });

  it("falls back to Postgres when Redis cache is empty (cache miss)", async () => {
    const redis = makeRedis({ getTop: jest.fn().mockResolvedValue([]) });
    const postgres = makePostgres({ getTop: jest.fn().mockResolvedValue(samplePlayers) });
    const lb = new Leaderboard(redis, postgres);

    const result = await lb.getTopPlayers("g1", 10);

    expect(postgres.getTop).toHaveBeenCalledWith("g1", 10);
    expect(result).toEqual(samplePlayers);
  });

  it("warms Redis after a cache miss so future reads are fast", async () => {
    const redis = makeRedis({ getTop: jest.fn().mockResolvedValue([]) });
    const postgres = makePostgres({ getTop: jest.fn().mockResolvedValue(samplePlayers) });
    const lb = new Leaderboard(redis, postgres);

    await lb.getTopPlayers("g1", 10);

    expect(redis.setBulk).toHaveBeenCalledWith("g1", samplePlayers);
  });

  it("returns empty array when both Redis and Postgres have no data", async () => {
    const lb = new Leaderboard(makeRedis(), makePostgres());
    const result = await lb.getTopPlayers("g1", 10);
    expect(result).toEqual([]);
    // setBulk should NOT be called — nothing to warm
    expect(makeRedis().setBulk).not.toHaveBeenCalled();
  });
});


describe("getUserRank", () => {
  it("returns the Redis rank when available", async () => {
    const redis = makeRedis({ getRank: jest.fn().mockResolvedValue(3) });
    const postgres = makePostgres();
    const lb = new Leaderboard(redis, postgres);

    const rank = await lb.getUserRank("g1", "alice");

    expect(rank).toBe(3);
    expect(postgres.getRank).not.toHaveBeenCalled();
  });

  it("falls back to Postgres when Redis returns null (cold start)", async () => {
    const redis = makeRedis({ getRank: jest.fn().mockResolvedValue(null) });
    const postgres = makePostgres({ getRank: jest.fn().mockResolvedValue(2) });
    const lb = new Leaderboard(redis, postgres);

    const rank = await lb.getUserRank("g1", "alice");

    expect(rank).toBe(2);
    expect(postgres.getRank).toHaveBeenCalledWith("g1", "alice");
  });

  it("returns null when the user is not ranked in either store", async () => {
    const lb = new Leaderboard(makeRedis(), makePostgres());
    const rank = await lb.getUserRank("g1", "ghost");
    expect(rank).toBeNull();
  });
});



describe("PostgresService constructor", () => {
  const validConfig = {
    redisPrefix: "lb",
    tableName: "leaderboard_scores",
    columns: { gameId: "game_id", userId: "user_id", score: "score" },
  };

  it("accepts valid SQL identifiers without throwing", () => {
    expect(() => new PostgresService({} as any, validConfig)).not.toThrow();
  });

  it("throws on tableName with spaces (potential injection)", () => {
    expect(() =>
      new PostgresService({} as any, {
        ...validConfig,
        tableName: "leaderboard scores; DROP TABLE users;--",
      })
    ).toThrow(/Invalid SQL identifier/);
  });

  it("throws on column names with hyphens", () => {
    expect(() =>
      new PostgresService({} as any, {
        ...validConfig,
        columns: { ...validConfig.columns, gameId: "game-id" },
      })
    ).toThrow(/Invalid SQL identifier/);
  });

  it("throws on empty string identifier", () => {
    expect(() =>
      new PostgresService({} as any, {
        ...validConfig,
        tableName: "",
      })
    ).toThrow(/Invalid SQL identifier/);
  });
});

describe("createLeaderboard", () => {
  it("throws when redisService is not provided", () => {
    expect(() =>
      createLeaderboard({
        persistenceService: makePostgres(),
      } as any)
    ).toThrow(/requires deps\.redisService/i);
  });

  it("accepts persistenceService dependency", () => {
    expect(() =>
      createLeaderboard({
        redisService: makeRedis(),
        persistenceService: makePostgres(),
      })
    ).not.toThrow();
  });

  it("throws when neither persistenceService nor postgresService is provided", () => {
    expect(() =>
      createLeaderboard({
        redisService: makeRedis(),
      } as any)
    ).toThrow(/requires either deps\.persistenceService or deps\.postgresService/i);
  });
});
