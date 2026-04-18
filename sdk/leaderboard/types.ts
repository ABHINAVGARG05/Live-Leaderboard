export interface PlayerScore {
  userId: string;
  gameId: string;
  score: number;
}

export interface GameLeaderboard {
  gameId: string;
  scores: PlayerScore[];
}

export interface WriteBehindConfig {
  /** How often the queue is flushed to Postgres, in milliseconds. */
  intervalMs: number;
}

export interface LeaderboardConfig {
  redisPrefix: string; // Redis key prefix
  tableName: string; // Postgres table name for persistence
  columns: {
    gameId: string; // Column name for game ID
    userId: string; // Column name for user ID
    score: string; // Column name for score
  };
  maxEntriesPerGame?: number; // Optional: limit top N players stored in Redis
  writeBehind?: WriteBehindConfig; // Optional: async write-behind batching to Postgres
}

// ---------------------------------------------------------------------------
// Event payload interfaces
// ---------------------------------------------------------------------------

export interface ScoreSubmittedEvent {
  gameId: string;
  userId: string;
  score: number;
}

export interface NewLeaderEvent {
  gameId: string;
  userId: string;
  score: number;
}

export interface RankChangeEvent {
  gameId: string;
  userId: string;
  oldRank: number | null;
  newRank: number | null;
}

export interface PostgresErrorEvent {
  err: unknown;
  items: Array<{ gameId: string; userId: string; score: number }>;
}

export interface FlushCompleteEvent {
  /** Number of writes that were flushed in this batch. */
  count: number;
  /** Time taken to flush the batch to Postgres, in milliseconds. */
  durationMs: number;
}

export interface RedisServiceLike {
  updateScore(gameId: string, userId: string, score: number, maxEntries?: number): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  setBulk(gameId: string, scores: PlayerScore[]): Promise<void>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

export interface PostgresServiceLike {
  upsertScore(gameId: string, userId: string, score: number): Promise<void>;
  bulkUpsert(writes: Array<{ gameId: string; userId: string; score: number }>): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

export interface LeaderboardDependencies {
  redisService: RedisServiceLike;
  postgresService: PostgresServiceLike;
  config?: LeaderboardConfig;
}

export enum SocketEvent {
  Connect = "connect",
  Disconnect = "disconnect",
  JoinGame = "joinGame",
  UpdateScore = "updateScore",
  LeaderboardData = "leaderboardData",
}

export interface JoinGamePayload {
  gameId: string;
  userId: string;
}

export interface UpdateScorePayload {
  gameId: string;
  userId: string;
  score: number;
}
