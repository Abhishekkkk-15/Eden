import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server;

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust for production
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[Socket] New connection attempt: ${socket.id}`);
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(`user:${userId}`);
      console.log(`[Socket] User ${userId} connected and joined room: ${socket.id}`);
    } else {
      console.log(`[Socket] Connection without userId: ${socket.id}`);
    }

    socket.on("disconnect", () => {
      console.log("[Socket] User disconnected");
    });
  });

  console.log("[Socket] Server initialized");
  return io;
}

export function emitToUser(userId: string, event: string, data: any) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

export function broadcast(event: string, data: any) {
  if (io) {
    io.emit(event, data);
  }
}
