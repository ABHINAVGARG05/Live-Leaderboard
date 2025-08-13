import { LeaderboardConfig } from "../sdk/leaderboard/types";

export const leaderboardConfig: LeaderboardConfig = {
  redisPrefix: "leaderboard",
  tableName: "leaderboard_scores",
  columns: {
    gameId: "game_id",
    userId: "user_id",
    score: "score",
  },
};
