import { Server as SocketIOServer } from "socket.io";
import type { Server } from "http";
import { SocketEvent } from "../sdk/leaderboard/types";

export function createSocketServer(httpServer: Server) {
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on(SocketEvent.JoinGame, (gameId: string) => {
      socket.join(gameId);
    });
  });

  return io;
}
