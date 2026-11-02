# 🏆 Live Leaderboard SDK

A **real‑time leaderboard** library powered by **Redis**, **Postgres/MySQL/MongoDB**, **Socket.IO**, and **TypeScript**.

- **Postgres / MySQL / MongoDB** → Persistent storage
- **Redis** → Ultra-fast reads & live score updates
- **Socket.IO** → Instant leaderboard broadcasts
- **Express Router** → Drop-in REST API

Perfect for multiplayer games, coding contests, and online quizzes.

---

## 📦 Installation

```bash
npm install live-leaderboard redis express socket.io
npm install @socket.io/redis-adapter   # needed if you run more than one server instance
# plus the driver for your persistence store (pick one):
npm install pg        # Postgres
npm install mysql2    # MySQL
npm install mongodb   # MongoDB
```

`redis`, `express` and `socket.io` are required peer dependencies; `pg`, `mysql2` and `mongodb` are optional — install only the one you use.

> Requires **Redis ≥ 6.2** (scores are written with `ZADD GT`) and **MySQL ≥ 8.0** if you use MySQL (window functions).

---

## ⚙️ Database Setup (Postgres / MySQL / MongoDB)

### 1) Create schema

Postgres schema (also shipped in the repo as [`playground/schema.sql`](playground/schema.sql)):

```sql
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id BIGSERIAL PRIMARY KEY,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leaderboard_scores_game_user_uk UNIQUE (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_scores_game_score_desc
  ON leaderboard_scores (game_id, score DESC, user_id DESC);
```

Run it once:

```bash
psql -d <YOUR_DB_NAME> -f playground/schema.sql
```

> If you customize table/column names, update the **`LeaderboardConfig`** accordingly (see below).

### 2) MySQL schema (optional)

```sql
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  game_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  score INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY leaderboard_scores_game_user_uk (game_id, user_id),
  INDEX idx_leaderboard_scores_game_score_desc (game_id, score DESC, user_id DESC)
);
```

### 3) MongoDB collection (optional)

The sample servers (`playground/server.ts` and `server/container.ts`) create these indexes automatically. If you wire `MongoDBService` yourself, create them once:

- Unique compound index on `(game_id, user_id)`
- Read index on `(game_id, score desc)`

```ts
await collection.createIndex({ game_id: 1, user_id: 1 }, { unique: true });
await collection.createIndex({ game_id: 1, score: -1, user_id: -1 });
```

---

## 🚀 Backend Setup

**`.env`**

```env
REDIS_URL=redis://localhost:6379
PERSISTENCE_PROVIDER=postgres

# Postgres (DATABASE_URL is also accepted)
POSTGRES_URL=postgres://user:pass@localhost:5432/dbname

# MySQL
MYSQL_URL=mysql://user:pass@localhost:3306/dbname

# MongoDB
MONGODB_URL=mongodb://localhost:27017/leaderboard
MONGODB_DB=leaderboard

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
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Pool } from "pg";
import dotenv from "dotenv";

import {
  Leaderboard,
  RedisService,
  PostgresService,
  createLeaderboardRouter,
  type LeaderboardConfig,
} from "live-leaderboard";

dotenv.config();

async function main() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, { cors: { origin: "*" } });
  app.use(express.json());

  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  // Route broadcasts through Redis pub/sub so clients connected to ANY
  // instance receive updates for scores submitted to ANY instance.
  const pub = redis.duplicate();
  const sub = redis.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));

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
    new PostgresService(pg, config),
  );

  app.use("/leaderboard", createLeaderboardRouter(leaderboard, io));

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("join-game", (gameId: unknown) => {
      if (typeof gameId === "string" && gameId.trim()) socket.join(gameId.trim());
    });
  });

  server.listen(process.env.PORT || 3000, () =>
    console.log(
      `Server running at http://localhost:${process.env.PORT || 3000}`,
    ),
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
          li.textContent = `#${p.rank} ${p.userId} - ${p.score}`;
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

Submit a score. A player's stored score only ever goes **up**: submitting a lower score than their best is a no-op (in Redis and in the persistence store).

**Body**

```json
{
  "gameId": "demo123",
  "userId": "alice",
  "score": 150
}
```

Validation

- `gameId` and `userId` must be non-empty strings
- `score` must be a non-negative integer

**Response**

```json
{ "success": true }
```

### `GET /leaderboard/:gameId/top?limit=10`

Get top N players. `limit` must be an integer ≥ 1. A hard cap of 100 is enforced.

**Response**

```json
[
  { "userId": "dave", "score": 490, "gameId": "demo123", "rank": 1 },
  { "userId": "carol", "score": 237, "gameId": "demo123", "rank": 2 },
  { "userId": "alice", "score": 237, "gameId": "demo123", "rank": 2 },
  { "userId": "bob", "score": 39, "gameId": "demo123", "rank": 4 }
]
```

After every successful `POST /score`, the router also emits `leaderboard:update` with the current top 10 (same shape) to the Socket.IO room named after the `gameId`. With the Redis adapter configured, that reaches clients on every server instance.

### Ranking and ties

Ranks use **standard competition ranking** ("1224"): players with equal scores share a rank, and the next distinct score skips ahead. A user's rank is `1 + number of players with a strictly higher score`, computed the same way in Redis, Postgres/MySQL (`RANK()`), and MongoDB, so `GET /rank` and the `rank` field in `/top` always agree regardless of which store served the request.

Within a tie, players are listed by `userId` descending (byte order) in every store, so the top-N list is deterministic and identical whether it comes from Redis or the database.

### `GET /leaderboard/:gameId/rank/:userId`

Get a user’s rank.

**Response**

```json
{ "rank": 2 }
```

Ranks are 1-based and tied players share a rank (see above). `rank` is `null` if the user has no score in that game. Validation errors return `400` with `{ "error": "Validation failed", "fields": { ... } }`.

---

## ⚡ SDK Usage (Direct)

```ts
import {
  Leaderboard,
  RedisService,
  PostgresService,
  MySQLService,
  MongoDBService,
  type LeaderboardConfig,
} from "live-leaderboard";
import { createClient } from "redis";
import { Pool } from "pg";
import { createPool } from "mysql2/promise";
import { MongoClient } from "mongodb";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const pg = new Pool({ connectionString: process.env.POSTGRES_URL });
const mysql = createPool(process.env.MYSQL_URL);
const mongoClient = new MongoClient(process.env.MONGODB_URL!);
await mongoClient.connect();
const mongoCollection = mongoClient
  .db(process.env.MONGODB_DB || "leaderboard")
  .collection("leaderboard_scores");

const config: LeaderboardConfig = {
  redisPrefix: "lb",
  tableName: "leaderboard_scores",
  columns: { gameId: "game_id", userId: "user_id", score: "score" },
};

const leaderboard = new Leaderboard(
  new RedisService(redis, config.redisPrefix),
  new PostgresService(pg, config),
);

// Alternative backend examples (choose one based on your needs):

const leaderboardMySQL = new Leaderboard(
  new RedisService(redis, `${config.redisPrefix}:mysql`),
  new MySQLService(mysql, config),
);

const leaderboardMongo = new Leaderboard(
  new RedisService(redis, `${config.redisPrefix}:mongo`),
  new MongoDBService(mongoCollection, config),
);

await leaderboard.submitScore("game1", "bob", 1000);
console.log(await leaderboard.getTopPlayers("game1", 5)); // limit must be a positive integer
console.log(await leaderboard.getUserRank("game1", "bob"));
```

---

## 🧩 Advanced Options

All optional fields of `LeaderboardConfig` (pass the config as the third `Leaderboard` argument):

```ts
const leaderboard = new Leaderboard(redisService, persistenceService, {
  ...config,
  maxEntriesPerGame: 1000,          // keep only the top 1000 per game in Redis
  writeBehind: { intervalMs: 500 }, // batch DB writes instead of writing on every submit
  collectionName: "scores",         // MongoDB collection (defaults to tableName)
});
```

- **`writeBehind`**: scores are written to Redis immediately and to the persistence store in one bulk upsert every `intervalMs`. Repeated submissions by the same player between flushes are collapsed to the highest score. Call `await leaderboard.shutdown()` on graceful shutdown to flush pending writes.
- **`maxEntriesPerGame`**: trims each game's Redis sorted set to the top N. Ranks for players outside the top N fall back to the persistence store.

### Events

`Leaderboard` is an `EventEmitter`:

| Event               | Payload                                   | When                                                     |
| ------------------- | ----------------------------------------- | -------------------------------------------------------- |
| `score:submitted`   | `{ gameId, userId, score }`               | After every successful `submitScore`                     |
| `rank:change`       | `{ gameId, userId, oldRank, newRank }`    | The submitting user's rank changed                       |
| `new:leader`        | `{ gameId, userId, score }`               | The submitting user moved into rank 1 (not if already #1; may be shared on a tie) |
| `flush:complete`    | `{ count, durationMs }`                   | A write-behind batch was persisted                       |
| `persistence:error` | `{ err, items }`                          | A write-behind batch failed to persist                   |

```ts
leaderboard.on("new:leader", ({ gameId, userId }) => {
  console.log(`${userId} now leads ${gameId}`);
});
```

Rank lookups for `rank:change` / `new:leader` only run when at least one listener is registered, so the events cost nothing if unused.

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

## 📁 Repository Structure

```
Live-Leaderboard/
├── sdk/                  # Published library (entry: sdk/index.ts)
│   ├── router.ts         # Express router (REST API + Socket.IO broadcast)
│   └── leaderboard/      # Leaderboard core, Redis/Postgres/MySQL/MongoDB services, write-behind
├── config/               # Env-driven client factories (Redis, Postgres, MySQL, MongoDB)
├── server/               # Reference server wiring (container, routes, sockets)
├── playground/
│   ├── server.ts         # Example server (`pnpm start` / `pnpm dev`)
│   └── schema.sql        # Postgres schema
├── tests/                # Jest unit tests + Redis integration tests (run when REDIS_URL is set)
├── package.json
└── README.md
```

Run locally: copy `.env.example` to `.env`, then `pnpm install`, `pnpm test`, `pnpm dev`.
To include the Redis integration tests (tie ranking, multi-instance Socket.IO): `docker run -p 6379:6379 redis:7`, then `REDIS_URL=redis://localhost:6379 pnpm test`.

---

## 📝 License

MIT © [abhi-garg](https://www.npmjs.com/~abhi-garg)
