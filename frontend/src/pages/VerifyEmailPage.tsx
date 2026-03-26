// src/pages/VerifyEmailPage.tsx
// Handles the /verify-email?token=... link sent after signup.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { ApiService } from "@/services/api";
import "./LoginPage.css";

type Status = "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Link inválido. Verifique o e-mail ou solicite um novo.");
      return;
    }

    ApiService.get<{ detail: string }>(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setStatus("success");
        setMessage(res.detail ?? "E-mail verificado com sucesso!");
        setTimeout(() => navigate("/inbox"), 3000);
      })
      .catch((err) => {
        setStatus("error");
        const detail =
          err?.response?.data?.detail ??
          err?.message ??
          "Link inválido ou expirado.";
        setMessage(detail);
      });
  }, [searchParams, navigate]);

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <div className="login-logo">
            <span style={{ fontSize: "2rem" }}>
              {status === "loading" && <Loader2 className="spin" size={32} />}
              {status === "success" && <CheckCircle size={32} color="#48bb78" />}
              {status === "error"   && <XCircle   size={32} color="#fc8181" />}
            </span>
          </div>
          <h1 className="login-title">Verificação de E-mail</h1>
        </div>

        <div className="login-form">
          {status === "loading" && (
            <p style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Verificando seu e-mail...
            </p>
          )}

          {status === "success" && (
            <div className="login-success">
              <CheckCircle size={18} />
              <span>{message}</span>
              <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", opacity: 0.8 }}>
                Redirecionando em 3 segundos…
              </p>
            </div>
          )}

          {status === "error" && (
            <>
              <div className="login-error" style={{
                background: "rgba(252,129,129,0.1)",
                border: "1px solid rgba(252,129,129,0.25)",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                color: "#fc8181",
                fontSize: "0.875rem",
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}>
                <XCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{message}</span>
              </div>
              <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
                <Link to="/inbox" style={{ color: "var(--brand-primary)", fontSize: "0.875rem" }}>
                  Ir para o dashboard
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
