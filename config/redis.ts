import { createClient, RedisClientType, RedisModules } from "redis";

export async function createRedisClient(): Promise<RedisClientType<RedisModules>> {
  const redis = createClient({
    url: process.env.REDIS_URL,
  }) as RedisClientType<RedisModules>;

  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  await redis.connect();
  console.log("Connected to Redis");

  return redis;
}
