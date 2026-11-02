/// <reference types="jest" />

import { RedisService } from "../sdk/leaderboard/redisService";

function makeClient() {
  return {
    zAdd: jest.fn().mockResolvedValue(1),
    zRemRangeByRank: jest.fn().mockResolvedValue(0),
    zRangeWithScores: jest.fn().mockResolvedValue([]),
    zRevRank: jest.fn().mockResolvedValue(null),
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

  it("getRank converts the 0-based Redis rank to 1-based", async () => {
    const client = makeClient();
    client.zRevRank.mockResolvedValueOnce(0);
    const service = new RedisService(client, "lb");

    await expect(service.getRank("g1", "alice")).resolves.toBe(1);
  });
});
