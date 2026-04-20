/// <reference types="jest" />

import { MongoDBService } from "../sdk/leaderboard/mongoService";
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

function makeCollection() {
  const cursor = {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    project: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue([]),
  };

  return {
    updateOne: jest.fn().mockResolvedValue({}),
    bulkWrite: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockReturnValue(cursor),
    findOne: jest.fn().mockResolvedValue(null),
    countDocuments: jest.fn().mockResolvedValue(0),
    __cursor: cursor,
  } as any;
}

describe("MongoDBService", () => {
  it("validates field names in constructor", () => {
    const collection = makeCollection();

    expect(
      () =>
        new MongoDBService(collection, {
          ...config,
          columns: { ...config.columns, score: "bad-score" },
        })
    ).toThrow(/Invalid MongoDB field/);
  });

  it("upsertScore uses upsert + max semantics", async () => {
    const collection = makeCollection();
    const service = new MongoDBService(collection, config);

    await service.upsertScore("g1", "alice", 110);

    expect(collection.updateOne).toHaveBeenCalledWith(
      { game_id: "g1", user_id: "alice" },
      {
        $setOnInsert: { game_id: "g1", user_id: "alice" },
        $max: { score: 110 },
      },
      { upsert: true }
    );
  });

  it("bulkUpsert does nothing for empty input", async () => {
    const collection = makeCollection();
    const service = new MongoDBService(collection, config);

    await service.bulkUpsert([]);

    expect(collection.bulkWrite).not.toHaveBeenCalled();
  });

  it("bulkUpsert builds updateOne operations per write", async () => {
    const collection = makeCollection();
    const service = new MongoDBService(collection, config);

    await service.bulkUpsert([
      { gameId: "g1", userId: "alice", score: 100 },
      { gameId: "g1", userId: "bob", score: 90 },
    ]);

    expect(collection.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = collection.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(2);
    expect(operations[0]).toMatchObject({
      updateOne: {
        filter: { game_id: "g1", user_id: "alice" },
        upsert: true,
      },
    });
  });

  it("getTop queries by game, sorts desc, limits and maps fields", async () => {
    const collection = makeCollection();
    collection.__cursor.toArray.mockResolvedValueOnce([
      { user_id: "alice", score: "500" },
      { user_id: "bob", score: 250 },
    ]);
    const service = new MongoDBService(collection, config);

    const top = await service.getTop("g1", 2);

    expect(collection.find).toHaveBeenCalledWith({ game_id: "g1" });
    expect(collection.__cursor.sort).toHaveBeenCalledWith({ score: -1 });
    expect(collection.__cursor.limit).toHaveBeenCalledWith(2);
    expect(collection.__cursor.project).toHaveBeenCalledWith({ user_id: 1, score: 1, _id: 0 });
    expect(top).toEqual([
      { gameId: "g1", userId: "alice", score: 500 },
      { gameId: "g1", userId: "bob", score: 250 },
    ]);
  });

  it("getRank returns null when user has no document", async () => {
    const collection = makeCollection();
    const service = new MongoDBService(collection, config);

    await expect(service.getRank("g1", "ghost")).resolves.toBeNull();
    expect(collection.countDocuments).not.toHaveBeenCalled();
  });

  it("getRank returns null for non-numeric score", async () => {
    const collection = makeCollection();
    collection.findOne.mockResolvedValueOnce({ score: "not-a-number" });
    const service = new MongoDBService(collection, config);

    await expect(service.getRank("g1", "alice")).resolves.toBeNull();
    expect(collection.countDocuments).not.toHaveBeenCalled();
  });

  it("getRank returns higherCount + 1", async () => {
    const collection = makeCollection();
    collection.findOne.mockResolvedValueOnce({ score: 400 });
    collection.countDocuments.mockResolvedValueOnce(2);
    const service = new MongoDBService(collection, config);

    await expect(service.getRank("g1", "alice")).resolves.toBe(3);
    expect(collection.countDocuments).toHaveBeenCalledWith({
      game_id: "g1",
      score: { $gt: 400 },
    });
  });
});
