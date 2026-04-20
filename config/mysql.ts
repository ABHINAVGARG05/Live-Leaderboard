import { createPool, Pool, PoolOptions } from "mysql2/promise";

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMySQLOptions(): PoolOptions {
  if (process.env.MYSQL_URL) {
    return {
      uri: process.env.MYSQL_URL,
      waitForConnections: true,
      connectionLimit: toNumber(process.env.MYSQL_POOL_SIZE, 10),
      queueLimit: 0,
    };
  }

  const requiredVars = ["MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"] as const;
  const missingVars = requiredVars.filter((name) => {
    const value = process.env[name];
    return !value || !value.trim();
  });

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required MySQL environment variables: ${missingVars.join(", ")}. ` +
      "Set MYSQL_URL or provide MYSQL_USER, MYSQL_PASSWORD, and MYSQL_DATABASE."
    );
  }

  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: toNumber(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: toNumber(process.env.MYSQL_POOL_SIZE, 10),
    queueLimit: 0,
  };
}

export function createMySQLClient(): Pool {
  const pool = createPool(getMySQLOptions());
  console.log("Created MySQL connection pool");
  return pool;
}
