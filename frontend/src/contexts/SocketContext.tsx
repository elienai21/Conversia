import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";
import { API_URL } from "@/services/api";
import { isPushSupported, getNotificationPermission, subscribeToPush } from "@/services/push-notifications";

const WS_URL = API_URL.replace(/\/api\/v1$/, "");

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string) => void;
  leaveConversation: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Auto-subscribe to push notifications after login (only if permission not yet decided)
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (!isPushSupported()) return;
    if (getNotificationPermission() === "denied") return;

    // Wait for the SW to be ready, then subscribe (2s delay avoids fighting page load)
    const timer = setTimeout(async () => {
      // Only auto-prompt if permission hasn't been granted yet;
      // if already granted, silently re-register the subscription
      const result = await subscribeToPush();
      if (result === "subscribed") {
        console.info("[Push] Push notifications active");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      // Disconnect if logged out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem("conversia_token") ?? "";

    const socket = io(WS_URL, {
      auth: {
        token,
        tenantId: user.tenantId,
      },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("[Socket] Disconnected");
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, user]);

  const joinConversation = (conversationId: string) => {
    socketRef.current?.emit("join_conversation", conversationId);
  };

  const leaveConversation = (conversationId: string) => {
    socketRef.current?.emit("leave_conversation", conversationId);
  };

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        joinConversation,
        leaveConversation,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
}
