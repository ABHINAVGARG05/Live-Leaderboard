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
  intervalMs: number;
}

export interface LeaderboardConfig {
  redisPrefix: string; // Redis key prefix
  tableName: string; // SQL table name (or Mongo collection name fallback)
  columns: {
    gameId: string; // Column/field name for game ID
    userId: string; // Column/field name for user ID
    score: string; // Column/field name for score
  };
  collectionName?: string; // Optional MongoDB collection name (defaults to tableName)
  maxEntriesPerGame?: number; // Optional: limit top N players stored in Redis
  writeBehind?: WriteBehindConfig; // Optional: async write-behind batching to persistent store
}

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

export interface PersistenceErrorEvent {
  err: unknown;
  items: Array<{ gameId: string; userId: string; score: number }>;
}

// Backward-compatible alias for existing consumers.
export type PostgresErrorEvent = PersistenceErrorEvent;

export interface FlushCompleteEvent {
  count: number;
  durationMs: number;
}

export interface RedisServiceLike {
  updateScore(gameId: string, userId: string, score: number, maxEntries?: number): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  setBulk(gameId: string, scores: PlayerScore[]): Promise<void>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

export interface PersistenceServiceLike {
  upsertScore(gameId: string, userId: string, score: number): Promise<void>;
  bulkUpsert(writes: Array<{ gameId: string; userId: string; score: number }>): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

// Backward-compatible alias for existing consumers.
export type PostgresServiceLike = PersistenceServiceLike;

export interface LeaderboardDependencies {
  redisService: RedisServiceLike;
  persistenceService?: PersistenceServiceLike;
  postgresService?: PostgresServiceLike;
  config?: LeaderboardConfig;
}

export type PersistenceProvider = "postgres" | "mysql" | "mongodb";

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
