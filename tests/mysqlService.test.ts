/// <reference types="jest" />

import { MySQLService } from "../sdk/leaderboard/mysqlService";
import type { LeaderboardConfig } from "../sdk/leaderboard/types";

const config: LeaderboardConfig = {
  redisPrefix: "lb",
  tableName: "leaderboard_scores",
  columns: {
    gameId: "game_id",
    userId: "user_id",
    score: "score",
  },
};

function makePool() {
  return {
    execute: jest.fn().mockResolvedValue([{}, undefined]),
    query: jest.fn(),
  } as any;
}

describe("MySQLService", () => {
  it("validates identifiers in constructor", () => {
    expect(
      () =>
        new MySQLService(makePool(), {
          ...config,
          tableName: "invalid-name",
        })
    ).toThrow(/Invalid SQL identifier/);

    expect(
      () =>
        new MySQLService(makePool(), {
          ...config,
          columns: { ...config.columns, userId: "user-id" },
        })
    ).toThrow(/Invalid SQL identifier/);
  });

  it("upsertScore executes insert with max-score conflict behavior", async () => {
    const pool = makePool();
    const service = new MySQLService(pool, config);

    await service.upsertScore("g1", "alice", 100);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO `leaderboard_scores` (`game_id`, `user_id`, `score`)"),
      ["g1", "alice", 100]
    );
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("ON DUPLICATE KEY UPDATE `score` = GREATEST(VALUES(`score`), `score`)"),
      ["g1", "alice", 100]
    );
  });

  it("getTop returns mapped numeric scores", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce([[{ userId: "alice", score: "250" }], undefined]);
    const service = new MySQLService(pool, config);

    const top = await service.getTop("g1", 5);

    expect(top).toEqual([{ gameId: "g1", userId: "alice", score: 250 }]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY `score` DESC"),
      ["g1", 5]
    );
  });

  it("getRank returns null when row is missing", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce([[], undefined]);
    const service = new MySQLService(pool, config);

    await expect(service.getRank("g1", "ghost")).resolves.toBeNull();
  });

  it("getRank returns numeric rank when present", async () => {
    const pool = makePool();
    pool.query.mockResolvedValueOnce([[{ rank: "3" }], undefined]);
    const service = new MySQLService(pool, config);

    await expect(service.getRank("g1", "alice")).resolves.toBe(3);
  });

  it("bulkUpsert skips SQL when writes are empty", async () => {
    const pool = makePool();
    const service = new MySQLService(pool, config);

    await service.bulkUpsert([]);

    expect(pool.execute).not.toHaveBeenCalled();
  });

  it("bulkUpsert flattens params and uses multi-row placeholders", async () => {
    const pool = makePool();
    const service = new MySQLService(pool, config);

    await service.bulkUpsert([
      { gameId: "g1", userId: "alice", score: 100 },
      { gameId: "g1", userId: "bob", score: 90 },
    ]);

    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("VALUES (?, ?, ?), (?, ?, ?)"),
      ["g1", "alice", 100, "g1", "bob", 90]
    );
  });
});
