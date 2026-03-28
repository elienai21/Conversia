// src/components/VerificationBanner.tsx
// Shown at the top of the dashboard when the user's email is not yet verified.
import { useState } from "react";
import { MailWarning, X, RefreshCw } from "lucide-react";
import { ApiService } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";

export function VerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  // Only show for users whose emailVerifiedAt is null/missing and not dismissed
  if (!user || user.emailVerifiedAt || dismissed) return null;

  const handleResend = async () => {
    setResending(true);
    setError("");
    try {
      await ApiService.post("/auth/resend-verification", {});
      setResent(true);
    } catch (err: any) {
      setError(err.message || "Falha ao reenviar. Tente novamente.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="verification-banner" role="alert">
      <div className="verification-banner__inner">
        <MailWarning size={18} className="verification-banner__icon" />
        <span className="verification-banner__text">
          {resent
            ? "E-mail de verificação reenviado! Verifique sua caixa de entrada."
            : "Confirme seu e-mail para garantir acesso contínuo à plataforma."}
          {error && <span className="verification-banner__error"> {error}</span>}
        </span>
        {!resent && (
          <button
            className="verification-banner__btn"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? (
              <RefreshCw size={14} className="spin" />
            ) : (
              "Reenviar e-mail"
            )}
          </button>
        )}
        <button
          className="verification-banner__close"
          onClick={() => setDismissed(true)}
          aria-label="Fechar aviso"
        >
          <X size={16} />
        </button>
      </div>

      <style>{`
        .verification-banner {
          background: rgba(234,179,8,0.12);
          border-bottom: 1px solid rgba(234,179,8,0.25);
          padding: 0.5rem 1rem;
          position: sticky;
          top: 0;
          z-index: 200;
        }
        .verification-banner__inner {
          max-width: 900px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .verification-banner__icon { color: #eab308; flex-shrink: 0; }
        .verification-banner__text { font-size: 0.85rem; color: var(--text-secondary, #a0aec0); flex: 1; min-width: 160px; }
        .verification-banner__error { color: #fc8181; }
        .verification-banner__btn {
          background: rgba(234,179,8,0.15);
          border: 1px solid rgba(234,179,8,0.3);
          color: #eab308;
          border-radius: 6px;
          padding: 0.3rem 0.75rem;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: background 0.2s;
        }
        .verification-banner__btn:hover { background: rgba(234,179,8,0.25); }
        .verification-banner__btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .verification-banner__close {
          background: none;
          border: none;
          color: var(--text-muted, #718096);
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .verification-banner__close:hover { color: var(--text-primary, #e2e8f0); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
