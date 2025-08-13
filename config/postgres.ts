import { Pool } from "pg";

export function createPostgresClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  pool.on("error", (err) => {
    console.error("Postgres connection error:", err);
  });

  console.log("Connected to Postgres");

  return pool;
}
