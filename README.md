# 🏆 Live Leaderboard SDK

A real-time leaderboard system built using **Redis**, **Socket.IO**, **Express**, and **TypeScript**.

It enables **real-time score updates** across clients. Ideal for multiplayer games, live contests, or online quizzes.

---

## 📦 Installation

Install using **npm**:

```bash
npm install live-leaderboard
```

Or using **pnpm**:

```bash
pnpm add live-leaderboard
```

---

## 🚀 Backend Setup

Create a `.env` file:

```env
REDIS_URL=redis://localhost:6379
```

**Start a Redis server** (e.g., using Docker):

```bash
docker run -p 6379:6379 redis
```

**Backend server setup (e.g., `server.ts`)**:

```ts
import express from 'express';
import { createClient } from 'redis';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

import { Leaderboard } from 'live-leaderboard';
import { createLeaderboardRouter } from 'live-leaderboard/router';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

app.use(express.json());

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const leaderboard = new Leaderboard(redis);
const router = createLeaderboardRouter(leaderboard, io);

app.use('/leaderboard', router);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('join-game', (gameId: string) => {
    socket.join(gameId);
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

---

## 🎮 Frontend Client Example

Create an `index.html` file:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Real-Time Leaderboard</title>
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
  <h1>Leaderboard for Game</h1>
  <ul id="leaderboard"></ul>

  <script>
    const socket = io("http://localhost:3000");

    // Join a game room
    socket.emit("join-game", "demo123");

    // Listen for leaderboard updates
    socket.on("leaderboard:update", (players) => {
      const list = document.getElementById("leaderboard");
      list.innerHTML = '';
      players.forEach((player, index) => {
        const li = document.createElement("li");
        li.innerText = `#${index + 1} ${player.userId} - ${player.score}`;
        list.appendChild(li);
      });
    });
  </script>
</body>
</html>
```

---

## 📡 API Endpoints

### `POST /leaderboard/score`

Submit a player's score.

#### Request Body

```json
{
  "gameId": "demo123",
  "userId": "alice",
  "score": 150
}
```

#### Response

```json
{
  "success": true
}
```

---

### `GET /leaderboard/top/:gameId`

Get the top 10 players of a game.

**Example:**

```
GET /leaderboard/top/demo123
```

#### Response

```json
[
  { "userId": "dave", "score": 490 },
  { "userId": "alice", "score": 237 },
  { "userId": "bob", "score": 39 }
]
```

---

### `GET /leaderboard/rank/:gameId/:userId`

Get a user's rank in the game.

**Example:**

```
GET /leaderboard/rank/demo123/alice
```

#### Response

```json
{
  "rank": 2
}
```

---

## 🧪 Testing

You can manually push scores using `curl`:

```bash
curl -X POST http://localhost:3000/leaderboard/score   -H "Content-Type: application/json"   -d '{"gameId":"demo123", "userId":"charlie", "score":300}'
```

Watch live updates on the frontend as scores change.

---

## 🗃 Redis Example

You can inspect Redis using:

```bash
redis-cli
> ZRANGE leaderboard:demo123 0 9 WITHSCORES REV
```

---

## 📁 Project Structure

```
├── sdk/
│   ├── leaderboard.ts
│   └── router.ts
├── playground/
│   ├── server.ts
│   └── public/
│       └── index.html
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📝 License

MIT © [abhi-garg](https://www.npmjs.com/~abhi-garg)