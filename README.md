# 🏆 Live Leaderboard SDK

A **real‑time leaderboard** library powered by **Redis**, **Postgres**, **Socket.IO**, and **TypeScript**.

* **Postgres** → Persistent storage
* **Redis** → Ultra-fast reads & live score updates
* **Socket.IO** → Instant leaderboard broadcasts
* **Express Router** → Drop-in REST API

Perfect for multiplayer games, coding contests, and online quizzes.

---

## 📦 Installation

```bash
npm install live-leaderboard redis pg express socket.io dotenv
# or:
pnpm add live-leaderboard redis pg express socket.io dotenv
```

---

## ⚙️ Database Setup (Postgres)

### 1) Create schema

Save this as **`playground/schema.sql`** in your project:

```sql
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leaderboard_scores_game_user_uk UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_game_score_desc
  ON leaderboard_scores (game_id, score DESC);
```

Run it once:

```bash
psql -d <YOUR_DB_NAME> -f playground/schema.sql
```

> If you customize table/column names, update the **`LeaderboardConfig`** accordingly (see below).

---

## 🚀 Backend Setup

**`.env`**

```env
REDIS_URL=redis://localhost:6379
POSTGRES_URL=postgres://user:pass@localhost:5432/dbname
PORT=3000
```

**Run Redis & Postgres (Docker)**

```bash
docker run -p 6379:6379 redis

docker run -p 5432:5432 \
  -e POSTGRES_PASSWORD=pass \
  -e POSTGRES_USER=user \
  -e POSTGRES_DB=dbname \
  postgres
```

**`server.ts`**

```ts
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { createClient } from "redis";
import { Pool } from "pg";
import dotenv from "dotenv";

import {
  Leaderboard,
  RedisService,
  PostgresService,
  createLeaderboardRouter,
  type LeaderboardConfig
} from "live-leaderboard";

dotenv.config();

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  app.use(express.json());

  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  const pg = new Pool({ connectionString: process.env.POSTGRES_URL });

  const config: LeaderboardConfig = {
    redisPrefix: "leaderboard",
    tableName: "leaderboard_scores",
    columns: {
      gameId: "game_id",
      userId: "user_id",
      score: "score",
    },
  };

  const leaderboard = new Leaderboard(
    new RedisService(redis, config.redisPrefix),
    new PostgresService(pg, config)
  );

  app.use("/leaderboard", createLeaderboardRouter(leaderboard, io));

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("join-game", (gameId: string) => socket.join(gameId));
  });

  server.listen(process.env.PORT || 3000, () =>
    console.log(`Server running at http://localhost:${process.env.PORT || 3000}`)
  );
}

main().catch(console.error);
```

---

## 🎮 Frontend Example (Vanilla)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Live Leaderboard</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
  <h1>Leaderboard</h1>
  <ul id="leaderboard"></ul>

  <script>
    const socket = io("http://localhost:3000");
    socket.emit("join-game", "demo123");

    socket.on("leaderboard:update", (players) => {
      const list = document.getElementById("leaderboard");
      list.innerHTML = "";
      players.forEach((p, i) => {
        const li = document.createElement("li");
        li.textContent = `#${i + 1} ${p.userId} - ${p.score}`;
        list.appendChild(li);
      });
    });
  </script>
</body>
</html>
```

---

## 📡 REST API

### `POST /leaderboard/score`

Submit or update a score.

**Body**

```json
{
  "gameId": "demo123",
  "userId": "alice",
  "score": 150
}
```

**Response**

```json
{ "success": true }
```

### `GET /leaderboard/:gameId/top?limit=10`

Get top N players.

**Response**

```json
[
  { "userId": "dave", "score": 490 },
  { "userId": "alice", "score": 237 },
  { "userId": "bob", "score": 39 }
]
```

### `GET /leaderboard/:gameId/rank/:userId`

Get a user’s rank.

**Response**

```json
{ "rank": 2 }
```

---

## ⚡ SDK Usage (Direct)

```ts
import { Leaderboard, RedisService, PostgresService, type LeaderboardConfig } from "live-leaderboard";
import { createClient } from "redis";
import { Pool } from "pg";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const pg = new Pool({ connectionString: process.env.POSTGRES_URL });

const config: LeaderboardConfig = {
  redisPrefix: "lb",
  tableName: "leaderboard_scores",
  columns: { gameId: "game_id", userId: "user_id", score: "score" },
};

const leaderboard = new Leaderboard(
  new RedisService(redis, config.redisPrefix),
  new PostgresService(pg, config)
);

await leaderboard.submitScore("game1", "bob", 1000);
console.log(await leaderboard.getTopPlayers("game1", 5));
console.log(await leaderboard.getUserRank("game1", "bob"));
```

---

## 🔧 Custom Schema Support

Use **any** table/column names by changing the config:

```ts
const config: LeaderboardConfig = {
  redisPrefix: "myapp:lb",
  tableName: "game_scores_custom",
  columns: {
    gameId: "gid",
    userId: "uid",
    score: "points",
  },
};
```

Matching SQL:

```sql
CREATE TABLE IF NOT EXISTS game_scores_custom (
  id BIGSERIAL PRIMARY KEY,
  gid TEXT NOT NULL,
  uid TEXT NOT NULL,
  points INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_scores_custom_gid_uid_uk UNIQUE (gid, uid)
);
```

---

## 📁 Suggested Project Structure

```
live-leaderboard/
├── src/
│   ├── config/           # DB & service configs
│   ├── server/           # Express + Socket.IO setup
│   ├── sdk/              # Leaderboard classes/services
│   └── playground/
│       ├── server.ts     # Example server
│       └── schema.sql    # Postgres schema
├── package.json
└── README.md
```

---

## 📝 License

MIT © [abhi-garg](https://www.npmjs.com/~abhi-garg)
