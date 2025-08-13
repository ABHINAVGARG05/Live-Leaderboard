CREATE TABLE IF NOT EXISTS leaderboard_scores (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    game_name VARCHAR(100) NOT NULL,
    score INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optional: index for faster leaderboard lookups by game
CREATE INDEX idx_leaderboard_game ON leaderboard_scores (game_name, score DESC);
