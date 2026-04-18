import type { Pool } from "pg";
import type { LeaderboardConfig, PlayerScore } from "./types";

/** Validates that a string is a safe SQL identifier (alphanumeric + underscore only). */
function validateIdentifier(value: string, field: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `[Leaderboard] Invalid SQL identifier for "${field}": "${value}". Only alphanumeric characters and underscores are allowed.`
    );
  }
}

export class PostgresService {
  private pg: Pool;
  private config: LeaderboardConfig;

  constructor(pgPool: Pool, config: LeaderboardConfig) {
    // Validate all identifiers at construction time — not at query time
    validateIdentifier(config.tableName, "tableName");
    validateIdentifier(config.columns.gameId, "columns.gameId");
    validateIdentifier(config.columns.userId, "columns.userId");
    validateIdentifier(config.columns.score, "columns.score");

    this.pg = pgPool;
    this.config = config;
  }

  async upsertScore(gameId: string, userId: string, score: number): Promise<void> {
    const { tableName, columns } = this.config;
    await this.pg.query(
      `
      INSERT INTO ${tableName} (${columns.gameId}, ${columns.userId}, ${columns.score})
      VALUES ($1, $2, $3)
      ON CONFLICT (${columns.gameId}, ${columns.userId})
      DO UPDATE SET ${columns.score} = GREATEST(EXCLUDED.${columns.score}, ${tableName}.${columns.score})
      `,
      [gameId, userId, score]
    );
  }

  async getTop(gameId: string, limit: number): Promise<PlayerScore[]> {
    const { tableName, columns } = this.config;
    const { rows } = await this.pg.query<{ userId: string; score: number }>(
      `
      SELECT ${columns.userId} as "userId", ${columns.score} as "score"
      FROM ${tableName}
      WHERE ${columns.gameId} = $1
      ORDER BY ${columns.score} DESC
      LIMIT $2
      `,
      [gameId, limit]
    );
    return rows.map((r) => ({ userId: r.userId, score: r.score, gameId }));
  }

  async getRank(gameId: string, userId: string): Promise<number | null> {
    const { tableName, columns } = this.config;
    const { rows } = await this.pg.query<{ rank: string }>(
      `
      SELECT rank FROM (
        SELECT ${columns.userId},
               RANK() OVER (ORDER BY ${columns.score} DESC) AS rank
        FROM ${tableName}
        WHERE ${columns.gameId} = $1
      ) ranked
      WHERE ${columns.userId} = $2
      `,
      [gameId, userId]
    );
    return rows.length ? Number(rows[0].rank) : null;
  }

  /**
   * Write an entire batch to Postgres in a single query using UNNEST.
   * Called by the write-behind flusher — far more efficient than N individual upserts.
   */
  async bulkUpsert(
    writes: Array<{ gameId: string; userId: string; score: number }>,
  ): Promise<void> {
    if (!writes.length) return;

    const { tableName, columns } = this.config;
    const gameIds = writes.map((w) => w.gameId);
    const userIds = writes.map((w) => w.userId);
    const scores  = writes.map((w) => w.score);

    await this.pg.query(
      `
      INSERT INTO ${tableName} (${columns.gameId}, ${columns.userId}, ${columns.score})
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[])
      ON CONFLICT (${columns.gameId}, ${columns.userId})
      DO UPDATE SET ${columns.score} = GREATEST(EXCLUDED.${columns.score}, ${tableName}.${columns.score})
      `,
      [gameIds, userIds, scores],
    );
  }
}
