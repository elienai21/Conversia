import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiService } from "@/services/api";
import { Lock, Mail, Loader2 } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await ApiService.post<{ 
        access_token: string, 
        user: { id: string, name: string, email: string, role: string, tenantId: string } 
      }>("/auth/login", {
        email,
        password,
      });

      login(response.access_token, {
        ...response.user,
        isOnline: true // optimistic
      });
      navigate("/inbox");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container flex-center" style={{ 
      background: "radial-gradient(circle at top right, var(--bg-tertiary), var(--bg-primary))" 
    }}>
      <div className="glass-panel animate-fade-in" style={{
        padding: "var(--spacing-10)",
        width: "100%",
        maxWidth: "420px",
      }}>
        <div style={{ textAlign: "center", marginBottom: "var(--spacing-8)" }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "var(--spacing-2)" }}>Conversia</h1>
          <p style={{ color: "var(--text-secondary)" }}>Sign in to your team workspace</p>
        </div>

        {error && (
          <div style={{ 
            background: "var(--accent-error)", 
            color: "white", 
            padding: "var(--spacing-3)", 
            borderRadius: "var(--radius-md)",
            marginBottom: "var(--spacing-4)",
            fontSize: "0.875rem",
            textAlign: "center"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--spacing-1)" }}>
              Email Address
            </label>
            <div style={{ position: "relative" }}>
              <Mail style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.75rem",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color var(--transition-fast)"
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--brand-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
                placeholder="agent@hotel.com"
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "var(--spacing-1)" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem 0.75rem 2.75rem",
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color var(--transition-fast)"
                }}
                onFocus={(e) => e.target.style.borderColor = "var(--brand-primary)"}
                onBlur={(e) => e.target.style.borderColor = "var(--border-color)"}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "var(--spacing-2)",
              width: "100%",
              padding: "0.875rem",
              background: "var(--brand-primary)",
              color: "white",
              fontWeight: 600,
              borderRadius: "var(--radius-md)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem",
              transition: "background var(--transition-fast)",
              opacity: loading ? 0.7 : 1
            }}
            onMouseOver={(e) => !loading && (e.currentTarget.style.background = "var(--brand-primary-hover)")}
            onMouseOut={(e) => e.currentTarget.style.background = "var(--brand-primary)"}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
