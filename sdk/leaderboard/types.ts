export interface PlayerScore {
  userId: string;
  gameName: string;
  score: number;
}

export interface GameLeaderboard {
  gameName: string;
  scores: PlayerScore[];
}

export interface LeaderboardConfig {
  redisPrefix: string; // Redis key prefix
  tableName: string;   // Postgres table name for persistence
  columns: {
    gameId: string;    
    userId: string;    // Column name for user ID
    score: string;     // Column name for score
  };
  maxEntriesPerGame?: number; // Optional: limit top N players stored in Redis
}

export interface RedisServiceLike {
  updateScore(gameId: string, userId: string, score: number): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
  setBulk(gameId: string, scores: PlayerScore[]): Promise<void>;
  getRank(gameId: string, userId: string): Promise<number | null>;
}

export interface PostgresServiceLike {
  upsertScore(gameId: string, userId: string, score: number): Promise<void>;
  getTop(gameId: string, limit: number): Promise<PlayerScore[]>;
}

export interface LeaderboardDependencies {
  redisService: RedisServiceLike;
  postgresService: PostgresServiceLike;
}

export enum SocketEvent {
  Connect = "connect",
  Disconnect = "disconnect",
  JoinGame = "joinGame",
  UpdateScore = "updateScore",
  LeaderboardData = "leaderboardData",
}

export interface JoinGamePayload {
  gameName: string;
  userId: string;
}

export interface UpdateScorePayload {
  gameName: string;
  userId: string;
  score: number;
}
