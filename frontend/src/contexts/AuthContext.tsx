// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { ApiService } from "@/services/api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  isOnline: boolean;
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem("conversia_token");
    localStorage.removeItem("conversia_tenant_id");
    setUser(null);
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("conversia_token");
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Validate token by fetching current agent profile (backend returns snake_case)
        const raw = await ApiService.get<{
          id: string;
          tenant_id: string;
          email: string;
          full_name: string;
          role: string;
          is_online: boolean;
        }>("/agents/me");
        setUser({
          id: raw.id,
          name: raw.full_name,
          email: raw.email,
          role: raw.role,
          tenantId: raw.tenant_id,
          isOnline: raw.is_online,
        });
      } catch (error) {
        console.error("Session expired or invalid token");
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen to 401 Unauthorized API responses
    const handleUnauthorized = () => logout();
    window.addEventListener("unauthorized_api_call", handleUnauthorized);
    return () => {
      window.removeEventListener("unauthorized_api_call", handleUnauthorized);
    };
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem("conversia_token", token);
    localStorage.setItem("conversia_tenant_id", userData.tenantId);
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
