import type { Pool, RowDataPacket } from "mysql2/promise";
import type { LeaderboardConfig, PlayerScore, PersistenceServiceLike } from "./types";

function validateIdentifier(value: string, field: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(
      `[Leaderboard] Invalid SQL identifier for "${field}": "${value}". Only alphanumeric characters and underscores are allowed.`
    );
  }
}

function quoteIdentifier(value: string): string {
  return `\`${value}\``;
}

interface RankRow extends RowDataPacket {
  rank: number;
}

interface TopRow extends RowDataPacket {
  userId: string;
  score: number;
}

export class MySQLService implements PersistenceServiceLike {
  private pool: Pool;
  private config: LeaderboardConfig;

  constructor(pool: Pool, config: LeaderboardConfig) {
    validateIdentifier(config.tableName, "tableName");
    validateIdentifier(config.columns.gameId, "columns.gameId");
    validateIdentifier(config.columns.userId, "columns.userId");
    validateIdentifier(config.columns.score, "columns.score");

    this.pool = pool;
    this.config = config;
  }

  async upsertScore(gameId: string, userId: string, score: number): Promise<void> {
    const { tableName, columns } = this.config;
    const table = quoteIdentifier(tableName);
    const gameIdCol = quoteIdentifier(columns.gameId);
    const userIdCol = quoteIdentifier(columns.userId);
    const scoreCol = quoteIdentifier(columns.score);

    await this.pool.execute(
      `
      INSERT INTO ${table} (${gameIdCol}, ${userIdCol}, ${scoreCol})
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE ${scoreCol} = GREATEST(VALUES(${scoreCol}), ${scoreCol})
      `,
      [gameId, userId, score]
    );
  }

  async getTop(gameId: string, limit: number): Promise<PlayerScore[]> {
    const { tableName, columns } = this.config;
    const table = quoteIdentifier(tableName);
    const gameIdCol = quoteIdentifier(columns.gameId);
    const userIdCol = quoteIdentifier(columns.userId);
    const scoreCol = quoteIdentifier(columns.score);

    const [rows] = await this.pool.query<TopRow[]>(
      `
      SELECT ${userIdCol} AS userId, ${scoreCol} AS score
      FROM ${table}
      WHERE ${gameIdCol} = ?
      ORDER BY ${scoreCol} DESC
      LIMIT ?
      `,
      [gameId, limit]
    );

    return rows.map((r) => ({ userId: r.userId, score: Number(r.score), gameId }));
  }

  async getRank(gameId: string, userId: string): Promise<number | null> {
    const { tableName, columns } = this.config;
    const table = quoteIdentifier(tableName);
    const gameIdCol = quoteIdentifier(columns.gameId);
    const userIdCol = quoteIdentifier(columns.userId);
    const scoreCol = quoteIdentifier(columns.score);

    const [rows] = await this.pool.query<RankRow[]>(
      `
      SELECT rank FROM (
        SELECT ${userIdCol}, RANK() OVER (ORDER BY ${scoreCol} DESC) AS rank
        FROM ${table}
        WHERE ${gameIdCol} = ?
      ) ranked
      WHERE ${userIdCol} = ?
      LIMIT 1
      `,
      [gameId, userId]
    );

    return rows.length ? Number(rows[0].rank) : null;
  }

  async bulkUpsert(
    writes: Array<{ gameId: string; userId: string; score: number }>
  ): Promise<void> {
    if (!writes.length) return;

    const { tableName, columns } = this.config;
    const table = quoteIdentifier(tableName);
    const gameIdCol = quoteIdentifier(columns.gameId);
    const userIdCol = quoteIdentifier(columns.userId);
    const scoreCol = quoteIdentifier(columns.score);

    const placeholders = writes.map(() => "(?, ?, ?)").join(", ");
    const values = writes.flatMap((w) => [w.gameId, w.userId, w.score]);

    await this.pool.execute(
      `
      INSERT INTO ${table} (${gameIdCol}, ${userIdCol}, ${scoreCol})
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE ${scoreCol} = GREATEST(VALUES(${scoreCol}), ${scoreCol})
      `,
      values
    );
  }
}
