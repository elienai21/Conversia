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
  emailVerifiedAt?: string | null;
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, userData: User, refreshToken?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem("conversia_token");
    localStorage.removeItem("conversia_refresh_token");
    localStorage.removeItem("conversia_tenant_id");
    setUser(null);
  };

  /** Tenta renovar o access token usando o refresh token armazenado.
   *  Retorna true se conseguiu, false se deve fazer logout. */
  const tryRefresh = async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem("conversia_refresh_token");
    if (!refreshToken) return false;

    try {
      const result = await ApiService.post<{
        access_token: string;
        refresh_token: string;
        user: { id: string; name: string; email: string; role: string; tenantId: string };
      }>("/auth/refresh", { refresh_token: refreshToken });

      localStorage.setItem("conversia_token", result.access_token);
      localStorage.setItem("conversia_refresh_token", result.refresh_token);
      setUser({ ...result.user, isOnline: true, emailVerifiedAt: null });
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("conversia_token");
      if (!token) {
        // Tenta refresh mesmo sem token de acesso (sessão expirada)
        const refreshed = await tryRefresh();
        if (!refreshed) {
          setIsLoading(false);
          return;
        }
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
          email_verified_at: string | null;
        }>("/agents/me");
        setUser({
          id: raw.id,
          name: raw.full_name,
          email: raw.email,
          role: raw.role,
          tenantId: raw.tenant_id,
          isOnline: raw.is_online,
          emailVerifiedAt: raw.email_verified_at,
        });
      } catch {
        // Access token inválido — tenta refresh antes de fazer logout
        const refreshed = await tryRefresh();
        if (!refreshed) {
          logout();
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Listen to 401 Unauthorized API responses — tenta refresh primeiro
    const handleUnauthorized = async () => {
      const refreshed = await tryRefresh();
      if (!refreshed) logout();
    };
    window.addEventListener("unauthorized_api_call", handleUnauthorized);
    return () => {
      window.removeEventListener("unauthorized_api_call", handleUnauthorized);
    };
  }, []);

  const login = (token: string, userData: User, refreshToken?: string) => {
    localStorage.setItem("conversia_token", token);
    localStorage.setItem("conversia_tenant_id", userData.tenantId);
    if (refreshToken) {
      localStorage.setItem("conversia_refresh_token", refreshToken);
    }
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
