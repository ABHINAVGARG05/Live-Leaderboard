import type { Pool } from "pg";
import type { LeaderboardConfig, PlayerScore } from "./types";

export class PostgresService {
  private pg: Pool;
  private config: LeaderboardConfig;

  constructor(pgPool: Pool, config: LeaderboardConfig) {
    this.pg = pgPool;
    this.config = config;
  }

  async upsertScore(gameId: string, userId: string, score: number) {
    const { tableName, columns } = this.config;
    await this.pg.query(
      `
      INSERT INTO ${tableName} (${columns.gameId}, ${columns.userId}, ${columns.score})
      VALUES ($1, $2, $3)
      ON CONFLICT (${columns.gameId}, ${columns.userId})
      DO UPDATE SET ${columns.score} = EXCLUDED.${columns.score}
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
    return rows.map((r: { userId: string; score: number }) => ({
      userId: r.userId,
      score: r.score,
      gameId,
    }));
  }
}
