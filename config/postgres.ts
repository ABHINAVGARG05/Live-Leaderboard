import { Pool } from "pg";

export function createPostgresClient() {
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
  });

  pool.on("error", (err) => {
    console.error("Postgres connection error:", err);
  });

  console.log("Created Postgres connection pool");

  return pool;
}
