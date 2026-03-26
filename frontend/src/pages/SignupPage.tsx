// src/pages/SignupPage.tsx
// Self-service tenant signup — creates a new tenant + admin user in one step.
import { useState, useId } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ApiService } from "@/services/api";
import {
  Building2, User, Mail, Lock, Eye, EyeOff,
  Loader2, ArrowRight, ArrowLeft, Check, MessageSquare,
} from "lucide-react";
import "./SignupPage.css";

// ── Slugify preview (mirrors backend logic) ──────────────────────────────────
function previewSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "minha-empresa";
}

// ── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2;

const FEATURES = [
  "Atendimento multicanal com IA (WhatsApp, Instagram, E-mail)",
  "Ordens de serviço e gestão de equipe operacional",
  "Traduções automáticas para hóspedes internacionais",
  "Análise de conversas e relatórios em tempo real",
];

// ── Component ─────────────────────────────────────────────────────────────────
export function SignupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>(1);

  // Step 1 fields
  const [companyName, setCompanyName] = useState("");

  // Step 2 fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Accessibility IDs
  const companyId = useId();
  const nameId = useId();
  const emailId = useId();
  const pwId = useId();
  const confirmId = useId();

  // ── Password strength ────────────────────────────────────────────────────
  const strength = (() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score; // 0–5
  })();

  const strengthLabel = ["", "Muito fraca", "Fraca", "Razoável", "Boa", "Forte"][strength];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#eab308", "#22c55e", "#10b981"][strength];

  // ── Step 1 → 2 ─────────────────────────────────────────────────────────
  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (companyName.trim().length < 2) {
      setError("O nome da empresa deve ter pelo menos 2 caracteres.");
      return;
    }
    setError("");
    setStep(2);
  };

  // ── Final Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const result = await ApiService.post<{
        access_token: string;
        refresh_token?: string;
        user: { id: string; name: string; email: string; role: string; tenantId: string };
      }>("/auth/signup", {
        company_name: companyName.trim(),
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      login(result.access_token, { ...result.user, isOnline: true }, result.refresh_token);
      navigate("/settings"); // send admin straight to settings to configure integrations
    } catch (err: any) {
      setError(err.message || "Não foi possível criar a conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="signup-container animate-fade-in">
      {/* Left panel */}
      <div className="signup-brand-panel">
        <div className="brand-badge">
          <span className="brand-badge-dot" />
          Conversia &bull; AI Assistant
        </div>

        <h2 className="brand-headline">
          Comece a usar o <span className="highlight">Conversia</span> hoje
        </h2>

        <p className="brand-description">
          Configure seu espaço de trabalho em menos de 2 minutos e comece a
          automatizar o atendimento do seu hotel com inteligência artificial.
        </p>

        <ul className="signup-features">
          {FEATURES.map((f) => (
            <li key={f} className="signup-feature-item">
              <span className="signup-feature-check">
                <Check size={12} strokeWidth={3} />
              </span>
              {f}
            </li>
          ))}
        </ul>

        {/* Step indicator */}
        <div className="signup-steps-indicator">
          <div className={`step-dot ${step >= 1 ? "done" : ""}`} />
          <div className="step-line" />
          <div className={`step-dot ${step >= 2 ? "done" : ""}`} />
        </div>
      </div>

      {/* Right form panel */}
      <div className="signup-form-panel">
        <div className="signup-form-header">
          <h1>
            {step === 1 ? "Criar conta" : "Dados do administrador"}
          </h1>
          <p>
            {step === 1
              ? "Passo 1 de 2 — Informações da empresa"
              : "Passo 2 de 2 — Sua conta de acesso"}
          </p>
        </div>

        {error && <div className="signup-error">{error}</div>}

        {/* ── STEP 1 ── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="signup-form">
            <div className="signup-field">
              <label htmlFor={companyId}>Nome do hotel / empresa</label>
              <div className="signup-input-wrapper">
                <span className="input-icon"><Building2 size={18} /></span>
                <input
                  id={companyId}
                  type="text"
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); setError(""); }}
                  required
                  autoFocus
                  placeholder="ex: Hotel Atlântico"
                  maxLength={100}
                />
              </div>
              {companyName.trim().length >= 2 && (
                <p className="signup-slug-preview">
                  ID da conta: <strong>conversia.io/{previewSlug(companyName)}</strong>
                </p>
              )}
            </div>

            <button type="submit" className="signup-submit-btn">
              Continuar
              <ArrowRight size={18} />
            </button>

            <p className="signup-login-link">
              Já tem uma conta?{" "}
              <Link to="/login">Fazer login</Link>
            </p>
          </form>
        )}

        {/* ── STEP 2 ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="signup-field">
              <label htmlFor={nameId}>Seu nome completo</label>
              <div className="signup-input-wrapper">
                <span className="input-icon"><User size={18} /></span>
                <input
                  id={nameId}
                  type="text"
                  value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setError(""); }}
                  required
                  autoFocus
                  placeholder="ex: Ana Souza"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor={emailId}>E-mail de acesso</label>
              <div className="signup-input-wrapper">
                <span className="input-icon"><Mail size={18} /></span>
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  required
                  placeholder="voce@empresa.com"
                />
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor={pwId}>Senha</label>
              <div className="signup-input-wrapper">
                <span className="input-icon"><Lock size={18} /></span>
                <input
                  id={pwId}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  required
                  placeholder="Mínimo 8 caracteres"
                  maxLength={128}
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
              {/* Strength bar */}
              {password.length > 0 && (
                <div className="signup-strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className="strength-bar"
                        style={{ background: strength >= n ? strengthColor : undefined }}
                      />
                    ))}
                  </div>
                  <span className="strength-label" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </span>
                </div>
              )}
            </div>

            <div className="signup-field">
              <label htmlFor={confirmId}>Confirmar senha</label>
              <div className="signup-input-wrapper">
                <span className="input-icon"><Lock size={18} /></span>
                <input
                  id={confirmId}
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                  required
                  placeholder="Repita a senha"
                  maxLength={128}
                />
                <button
                  type="button"
                  className="toggle-password-btn"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                  aria-label={showConfirm ? "Ocultar" : "Mostrar"}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="signup-actions">
              <button
                type="button"
                className="signup-back-btn"
                onClick={() => { setStep(1); setError(""); }}
                disabled={loading}
              >
                <ArrowLeft size={16} />
                Voltar
              </button>

              <button type="submit" disabled={loading} className="signup-submit-btn signup-submit-btn--flex">
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <MessageSquare size={18} />
                    Criar minha conta
                  </>
                )}
              </button>
            </div>

            <p className="signup-legal">
              Ao criar uma conta você concorda com os{" "}
              <a href="#" className="signup-legal-link">termos de uso</a>{" "}
              e{" "}
              <a href="#" className="signup-legal-link">política de privacidade</a>.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
