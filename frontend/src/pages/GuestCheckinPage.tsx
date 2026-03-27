import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  Upload,
  AlertCircle,
  Loader2,
  User,
  FileText,
  Globe,
  Calendar,
  ArrowRight,
  X,
} from "lucide-react";
import "./GuestCheckinPage.css";

// Strip /api/v1 suffix so public routes (registered outside /api/v1) resolve correctly
const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/api\/v1\/?$/, "");

interface ReservationInfo {
  alreadySubmitted: boolean;
  guestName: string;
  propertyName: string;
  reservationId?: string;
  type?: string;
  scheduledFor?: string;
  submittedAt?: string;
}

type DocumentType = "cpf" | "rg" | "passport";

interface FormState {
  fullName: string;
  document: string;
  documentType: DocumentType;
  nationality: string;
  birthDate: string;
  phone: string;
}

export function GuestCheckinPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ReservationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [step, setStep] = useState<"form" | "photo" | "submitting" | "success">("form");

  const [form, setForm] = useState<FormState>({
    fullName: "",
    document: "",
    documentType: "passport",
    nationality: "",
    birthDate: "",
    phone: "",
  });

  const [photoFront, setPhotoFront] = useState<string | null>(null);
  const [photoBack, setPhotoBack] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [upsellLoading, setUpsellLoading] = useState<string | null>(null);
  const [upsellSuccess, setUpsellSuccess] = useState<string | null>(null);

  const handleUpsell = async (serviceName: string) => {
    try {
      setUpsellLoading(serviceName);
      const res = await fetch(`${API_BASE}/public/checkin/${token}/upsell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: serviceName }),
      });
      if (!res.ok) throw new Error("Falha ao solicitar serviço");
      setUpsellSuccess(serviceName);
    } catch (e) {
      alert("Não foi possível solicitar o serviço no momento.");
    } finally {
      setUpsellLoading(null);
    }
  };

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // ── Load reservation info ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/checkin/${token}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e.detail ?? "Erro"));
        return r.json();
      })
      .then((data: ReservationInfo) => {
        setInfo(data);
        // Pre-fill name from reservation
        if (data.guestName && !data.alreadySubmitted) {
          setForm((f) => ({ ...f, fullName: data.guestName }));
        }
      })
      .catch((e: unknown) => setLoadError(typeof e === "string" ? e : "Link inválido ou expirado."))
      .finally(() => setIsLoading(false));
  }, [token]);

  // ── Photo capture ──────────────────────────────────────────────────────
  const capturePhoto = (side: "front" | "back", file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (side === "front") setPhotoFront(result);
      else setPhotoBack(result);
    };
    reader.readAsDataURL(file);
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setStep("submitting");
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/public/checkin/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          photoDocFront: photoFront ?? undefined,
          photoDocBack: photoBack ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail ?? "Erro ao enviar formulário.");
      }
      setStep("success");
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Erro inesperado.");
      setStep("photo");
    }
  };

  const formValid = form.fullName.trim().length >= 2 && form.document.trim().length >= 3;

  // ── Render states ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="gc-root">
        <div className="gc-card gc-loading">
          <Loader2 size={40} className="gc-spinner" />
          <p>Carregando sua reserva...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="gc-root">
        <div className="gc-card gc-error-card">
          <AlertCircle size={48} className="gc-error-icon" />
          <h2>Link inválido</h2>
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  if (info?.alreadySubmitted) {
    return (
      <div className="gc-root">
        <div className="gc-card gc-success-card">
          <CheckCircle2 size={56} className="gc-success-icon" />
          <h2>Cadastro já realizado!</h2>
          <p>
            Olá <strong>{info.guestName}</strong>, seu formulário foi enviado com
            sucesso. Nossa equipe irá processar as informações em breve.
          </p>
          <p className="gc-property-name">{info.propertyName}</p>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="gc-root">
        <div className="gc-card gc-success-card">
          <CheckCircle2 size={56} className="gc-success-icon" />
          <h2>Cadastro enviado!</h2>
          <p>
            Olá <strong>{info?.guestName}</strong>, recebemos suas informações.
            Nossa equipe irá processar e liberar seu acesso em breve.
          </p>

          <div className="gc-upsell-container">
            <h3>Que tal melhorar sua estadia?</h3>
            <p className="gc-upsell-subtitle">Selecione um serviço e nossa equipe enviará os detalhes.</p>
            
            <div className="gc-upsell-options">
              {[
                { id: "early_checkin", label: "Early Check-in", icon: "🕒", desc: "Chegue mais cedo sem preocupações." },
                { id: "cesta_cafe", label: "Cesta de Café da Manhã", icon: "🥐", desc: "Receba uma cesta recheada ao acordar." },
                { id: "transfer", label: "Transfer VIP", icon: "🚗", desc: "Motorista particular na sua chegada." }
              ].map(opt => (
                <div key={opt.id} className="gc-upsell-card">
                  <div className="gc-upsell-icon">{opt.icon}</div>
                  <div className="gc-upsell-details">
                    <h4>{opt.label}</h4>
                    <span>{opt.desc}</span>
                  </div>
                  <button 
                    disabled={upsellLoading === opt.label || upsellSuccess === opt.label}
                    onClick={() => handleUpsell(opt.label)}
                    className={`gc-upsell-btn ${upsellSuccess === opt.label ? "success" : ""}`}
                  >
                    {upsellSuccess === opt.label ? "Solicitado!" : upsellLoading === opt.label ? "Aguarde..." : "Solicitar"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <p className="gc-hint" style={{marginTop: '2rem'}}>Você pode fechar esta janela.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gc-root">
      {/* Header */}
      <div className="gc-header">
        <div className="gc-logo">✦ Conversia</div>
        <p className="gc-subtitle">Check-in Digital</p>
      </div>

      <div className="gc-card">
        {/* Welcome */}
        <div className="gc-welcome">
          <h1>Olá, {info?.guestName?.split(" ")[0]}!</h1>
          <p>
            Para liberar seu acesso em <strong>{info?.propertyName}</strong>,
            preencha o cadastro abaixo.
          </p>
        </div>

        {/* Progress */}
        <div className="gc-progress">
          <div className={`gc-step ${step === "form" ? "active" : "done"}`}>
            <span>1</span> Dados
          </div>
          <div className="gc-progress-line" />
          <div className={`gc-step ${step === "photo" || step === "submitting" ? "active" : ""}`}>
            <span>2</span> Documento
          </div>
        </div>

        {/* ── Step 1: Personal Data ── */}
        {step === "form" && (
          <div className="gc-form">
            <div className="gc-field">
              <label>
                <User size={14} /> Nome completo <span className="req">*</span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Como no documento"
                autoComplete="name"
              />
            </div>

            <div className="gc-field-row">
              <div className="gc-field">
                <label>
                  <FileText size={14} /> Tipo de documento <span className="req">*</span>
                </label>
                <select
                  value={form.documentType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, documentType: e.target.value as DocumentType }))
                  }
                >
                  <option value="passport">Passaporte</option>
                  <option value="rg">RG</option>
                  <option value="cpf">CPF</option>
                </select>
              </div>

              <div className="gc-field">
                <label>
                  Número do documento <span className="req">*</span>
                </label>
                <input
                  type="text"
                  value={form.document}
                  onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
                  placeholder={
                    form.documentType === "cpf"
                      ? "000.000.000-00"
                      : form.documentType === "passport"
                      ? "AB123456"
                      : "00.000.000-0"
                  }
                />
              </div>
            </div>

            <div className="gc-field-row">
              <div className="gc-field">
                <label>
                  <Globe size={14} /> Nacionalidade
                </label>
                <input
                  type="text"
                  value={form.nationality}
                  onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                  placeholder="Brasileira"
                />
              </div>

              <div className="gc-field">
                <label>
                  <Calendar size={14} /> Data de nascimento
                </label>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="gc-field">
              <label>WhatsApp / Telefone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+55 11 99999-9999"
                autoComplete="tel"
              />
            </div>

            <button
              className="gc-btn-primary"
              disabled={!formValid}
              onClick={() => setStep("photo")}
            >
              Continuar <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── Step 2: Document Photos ── */}
        {(step === "photo" || step === "submitting") && (
          <div className="gc-form">
            <p className="gc-photo-hint">
              Tire uma foto do seu <strong>{form.documentType === "passport" ? "passaporte" : form.documentType.toUpperCase()}</strong> para
              comprovação de identidade e cadastro no condomínio.
            </p>

            {/* Front */}
            <div className="gc-photo-slot" onClick={() => frontInputRef.current?.click()}>
              {photoFront ? (
                <>
                  <img src={photoFront} alt="Frente do documento" className="gc-photo-preview" />
                  <button
                    className="gc-photo-remove"
                    onClick={(e) => { e.stopPropagation(); setPhotoFront(null); }}
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Camera size={28} />
                  <span>Frente do documento</span>
                  <small>Toque para tirar foto ou selecionar</small>
                </>
              )}
            </div>
            <input
              ref={frontInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) capturePhoto("front", f);
              }}
            />

            {/* Back (not for passport) */}
            {form.documentType !== "passport" && (
              <>
                <div className="gc-photo-slot" onClick={() => backInputRef.current?.click()}>
                  {photoBack ? (
                    <>
                      <img src={photoBack} alt="Verso do documento" className="gc-photo-preview" />
                      <button
                        className="gc-photo-remove"
                        onClick={(e) => { e.stopPropagation(); setPhotoBack(null); }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload size={28} />
                      <span>Verso do documento</span>
                      <small>Toque para tirar foto ou selecionar</small>
                    </>
                  )}
                </div>
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) capturePhoto("back", f);
                  }}
                />
              </>
            )}

            {submitError && (
              <div className="gc-error-banner">
                <AlertCircle size={14} /> {submitError}
              </div>
            )}

            <div className="gc-form-actions">
              <button
                className="gc-btn-ghost"
                onClick={() => setStep("form")}
                disabled={step === "submitting"}
              >
                Voltar
              </button>
              <button
                className="gc-btn-primary"
                onClick={handleSubmit}
                disabled={step === "submitting" || !photoFront}
              >
                {step === "submitting" ? (
                  <><Loader2 size={16} className="gc-spinner-sm" /> Enviando...</>
                ) : (
                  <>Enviar Cadastro <ArrowRight size={16} /></>
                )}
              </button>
            </div>

            <p className="gc-privacy-note">
              🔒 Seus dados são criptografados e usados apenas para o cadastro no condomínio.
            </p>
          </div>
        )}
      </div>

      <p className="gc-footer">
        Powered by <strong>Conversia</strong> · Atendimento hoteleiro inteligente
      </p>
    </div>
  );
}
