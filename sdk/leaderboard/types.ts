export interface PlayerScore {
  userId: string;
  gameId: string;
  score: number;
}

export interface GameLeaderboard {
  gameId: string;
  scores: PlayerScore[];
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
}

export interface RedisServiceLike {
  updateScore(gameId: string, userId: string, score: number, maxEntries?: number): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  setBulk(gameId: string, scores: PlayerScore[]): Promise<void>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

export interface PostgresServiceLike {
  upsertScore(gameId: string, userId: string, score: number): Promise<void>;
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
