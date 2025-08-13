CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id BIGSERIAL PRIMARY KEY,
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT leaderboard_scores_game_user_uk UNIQUE (game_id, user_id)
);
-- Optional: index for faster leaderboard lookups by game
CREATE INDEX idx_leaderboard_game ON leaderboard_scores (game_name, score DESC);
