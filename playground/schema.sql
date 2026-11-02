CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id BIGSERIAL PRIMARY KEY,
    game_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT leaderboard_scores_game_user_uk UNIQUE (game_id, user_id)
);

-- Index for fast top-N / rank lookups per game
CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_game_score_desc
    ON leaderboard_scores (game_id, score DESC);
