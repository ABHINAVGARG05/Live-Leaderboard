/// <reference types="jest" />

import { RedisService } from "../sdk/leaderboard/redisService";

function makeClient() {
  return {
    zAdd: jest.fn().mockResolvedValue(1),
    zRemRangeByRank: jest.fn().mockResolvedValue(0),
    zRangeWithScores: jest.fn().mockResolvedValue([]),
    zScore: jest.fn().mockResolvedValue(null),
    zCount: jest.fn().mockResolvedValue(0),
    multi: jest.fn(),
  } as any;
}

describe("RedisService", () => {
  it("updateScore only raises scores (ZADD GT), matching persistence max semantics", async () => {
    const client = makeClient();
    const service = new RedisService(client, "lb");

    await service.updateScore("g1", "alice", 100);

    expect(client.zAdd).toHaveBeenCalledWith(
      "lb:g1",
      [{ score: 100, value: "alice" }],
      { GT: true },
    );
    expect(client.zRemRangeByRank).not.toHaveBeenCalled();
  });

  it("updateScore trims to the top N entries when maxEntries is set", async () => {
    const client = makeClient();
    const service = new RedisService(client, "lb");

    await service.updateScore("g1", "alice", 100, 50);

    expect(client.zRemRangeByRank).toHaveBeenCalledWith("lb:g1", 0, -51);
  });

  it("getRank returns null when the user has no score", async () => {
    const client = makeClient();
    const service = new RedisService(client, "lb");

    await expect(service.getRank("g1", "ghost")).resolves.toBeNull();
    expect(client.zCount).not.toHaveBeenCalled();
  });

  it("getRank is 1 + count of strictly higher scores, so ties share a rank", async () => {
    const client = makeClient();
    client.zScore.mockResolvedValueOnce(200);
    client.zCount.mockResolvedValueOnce(1);
    const service = new RedisService(client, "lb");

    await expect(service.getRank("g1", "bob")).resolves.toBe(2);
    expect(client.zCount).toHaveBeenCalledWith("lb:g1", "(200", "+inf");
  });
});
