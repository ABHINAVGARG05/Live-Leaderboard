// Represents a single player's score entry
export interface PlayerScore {
  userId: string;
  gameId: string;
  score: number;
}

// Represents the leaderboard for a particular game
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

// Socket.io event names
export enum SocketEvent {
  Connect = "connect",
  Disconnect = "disconnect",
  JoinGame = "joinGame",
  UpdateScore = "updateScore",
  LeaderboardData = "leaderboardData",
}

// Payload structure for joining a game
export interface JoinGamePayload {
  gameId: string;
  userId: string;
}

// Payload structure for updating score
export interface UpdateScorePayload {
  gameId: string;
  userId: string;
  score: number;
}
