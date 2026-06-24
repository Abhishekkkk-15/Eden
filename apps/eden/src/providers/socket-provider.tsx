import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";

const SocketContext = createContext<{ socket: Socket | null; isConnected: boolean }>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    console.log("[Socket] Effect triggered - User object:", user);
    if (user?.id) {
      console.log("[Socket] Initializing connection for user:", user.id);
      const socketInstance = io(import.meta.env.VITE_API_URL || "http://localhost:4000", {
        query: { userId: user.id },
      });

      socketInstance.on("connect", () => {
        console.log("[Socket] Connected to server successfully");
        setIsConnected(true);
      });

      socketInstance.on("disconnect", () => {
        console.log("[Socket] Disconnected from server");
        setIsConnected(false);
      });

      socketInstance.on("connect_error", (err) => {
        console.error("[Socket] Connection error:", err.message);
        setIsConnected(false);
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
      };
    } else {
      console.log("[Socket] No user ID found, skipping connection");
    }
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
