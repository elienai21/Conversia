// src/pages/ResetPasswordPage.tsx
// Receives the ?token= from the password-reset email and lets the user set a new password.
import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiService } from "@/services/api";
import { Lock, Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, MessageSquare } from "lucide-react";
import "./LoginPage.css"; // reuse the same visual styles

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError("Link inválido. Solicite um novo link de redefinição de senha.");
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      await ApiService.post("/auth/password-reset/confirm", {
        token,
        new_password: password,
      });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao redefinir senha.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container animate-fade-in">
      {/* Left branded panel */}
      <div className="login-brand-panel">
        <div className="brand-badge">
          <span className="brand-badge-dot" />
          Conversia &bull; AI Assistant
        </div>
        <h2 className="brand-headline">
          Redefinir <span className="highlight">senha</span>
        </h2>
        <p className="brand-description">
          Crie uma senha forte e exclusiva para proteger sua conta Conversia.
        </p>
        <div className="brand-features">
          <div className="brand-feature-item">
            <span className="feature-dot" />
            <span>Mínimo 8 caracteres</span>
          </div>
          <div className="brand-feature-item">
            <span className="feature-dot" />
            <span>Combine letras, números e símbolos</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        {success ? (
          <div className="reset-success-state">
            <CheckCircle size={56} className="reset-success-icon" />
            <h2>Senha redefinida!</h2>
            <p>Sua senha foi alterada com sucesso. Redirecionando para o login…</p>
            <Link to="/login" className="login-submit-btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 24, textDecoration: "none" }}>
              <MessageSquare size={18} />
              Ir para o login
            </Link>
          </div>
        ) : (
          <>
            <div className="login-form-header">
              <h1>Nova senha</h1>
              <p>Digite e confirme sua nova senha abaixo.</p>
            </div>

            {error && (
              <div className="login-error" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {!token ? null : (
              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-field">
                  <label htmlFor="reset-pw">Nova senha</label>
                  <div className="login-input-wrapper">
                    <span className="input-icon"><Lock size={18} /></span>
                    <input
                      id="reset-pw"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(""); }}
                      required
                      autoFocus
                      placeholder="Mínimo 8 caracteres"
                      maxLength={128}
                    />
                    <button type="button" className="toggle-password-btn" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="login-field">
                  <label htmlFor="reset-confirm">Confirmar nova senha</label>
                  <div className="login-input-wrapper">
                    <span className="input-icon"><Lock size={18} /></span>
                    <input
                      id="reset-confirm"
                      type={showConfirm ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                      required
                      placeholder="Repita a senha"
                      maxLength={128}
                    />
                    <button type="button" className="toggle-password-btn" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}>
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading || !token} className="login-submit-btn">
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Lock size={18} />
                      Redefinir senha
                    </>
                  )}
                </button>
              </form>
            )}

            <p className="login-signup-link">
              Lembrou a senha? <Link to="/login">Voltar ao login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
