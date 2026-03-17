import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "@/contexts/AuthContext";
import { ApiService } from "@/services/api";
import { Lock, Mail, Loader2, Eye, EyeOff, MessageSquare } from "lucide-react";
import "./LoginPage.css";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError("Google Sign-In failed: no credential received");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await ApiService.post<{
        access_token: string;
        user: { id: string; name: string; email: string; role: string; tenantId: string };
      }>("/auth/google", { credential: response.credential });

      login(result.access_token, { ...result.user, isOnline: true });
      navigate("/inbox");
    } catch (err: any) {
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await ApiService.post<{
        access_token: string;
        user: { id: string; name: string; email: string; role: string; tenantId: string };
      }>("/auth/login", {
        email,
        password,
      });

      login(response.access_token, {
        ...response.user,
        isOnline: true,
      });
      navigate("/inbox");
    } catch (err: any) {
      setError(err.message || "Failed to authenticate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container animate-fade-in">
      {/* Left Branded Panel */}
      <div className="login-brand-panel">
        <div className="brand-badge">
          <span className="brand-badge-dot" />
          Conversia &bull; AI Assistant
        </div>

        <h2 className="brand-headline">
          Acesse seu <span className="highlight">Painel de Atendimento</span>
        </h2>

        <p className="brand-description">
          Gerencie conversas, acompanhe clientes e deixe a IA trabalhar por
          você &ndash; tudo em um s&oacute; lugar.
        </p>

        <div className="brand-features">
          <div className="brand-feature-item">
            <span className="feature-dot" />
            <span>Atendimento multicanal com intelig&ecirc;ncia artificial</span>
          </div>
          <div className="brand-feature-item">
            <span className="feature-dot" />
            <span>Acesso exclusivo para agentes e administradores</span>
          </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="login-form-panel">
        <div className="login-form-header">
          <h1>Fazer login</h1>
          <p>Use o e-mail e senha configurados para acessar o Conversia.</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label htmlFor="login-email">E-mail</label>
            <div className="login-input-wrapper">
              <span className="input-icon"><Mail size={18} /></span>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                placeholder="voce@empresa.com"
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Senha</label>
            <div className="login-input-wrapper">
              <span className="input-icon"><Lock size={18} /></span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-password-row">
            <span className="login-restricted-text">Ambiente restrito a usu&aacute;rios autorizados.</span>
            <button type="button" className="login-forgot-link">
              Esqueceu a senha?
            </button>
          </div>

          <button type="submit" disabled={loading} className="login-submit-btn">
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <MessageSquare size={18} />
                Entrar no Conversia
              </>
            )}
          </button>
        </form>

        {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
          <>
            <div className="login-divider">
              <div className="login-divider-line" />
              <span className="login-divider-text">ou continue com</span>
              <div className="login-divider-line" />
            </div>

            <div className="login-google-wrapper">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError("Google Sign-In failed")}
                theme="filled_black"
                size="large"
                width={350}
                text="signin_with"
                shape="rectangular"
              />
            </div>
          </>
        )}

        <p className="login-legal">
          Ao acessar, voc&ecirc; concorda com os termos de uso e pol&iacute;tica de
          privacidade definidos para a sua conta Conversia.
        </p>
      </div>
    </div>
  );
}
