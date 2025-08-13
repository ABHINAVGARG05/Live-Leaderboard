import { Server as SocketIOServer } from "socket.io";
import type { Server } from "http";

export function createSocketServer(httpServer: Server) {
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("join-game", (gameId: string) => {
      socket.join(gameId);
    });
  });

  return io;
}
