// src/pages/BillingPage.tsx
// Subscription management: plan cards, current plan status, upgrade/cancel.
import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/services/api";
import {
  CreditCard, Check, Zap, AlertTriangle, Loader2,
  ExternalLink, Crown, Shield, Building2, Sparkles,
} from "lucide-react";
import "./BillingPage.css";

// ── Types ────────────────────────────────────────────────────────────────────
type PlanId = "trial" | "starter" | "professional" | "scale" | "enterprise";

interface Plan {
  id: PlanId;
  label: string;
  priceMonthlyBrl: number | null;
  maxUnits: number;
  maxUsers: number;
  features: string[];
  stripePriceId: string | null;
  isCurrent: boolean;
}

interface BillingStatus {
  plan: PlanId;
  status: "trial" | "active" | "past_due" | "cancelled";
  trialEndsAt: string | null;
  stripeEnabled: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatBrl(cents: number | null): string {
  if (cents === null) return "Sob consulta";
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function daysLeft(isoDate: string | null): number {
  if (!isoDate) return 0;
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  trial:        <Sparkles size={20} />,
  starter:      <Zap size={20} />,
  professional: <Crown size={20} />,
  scale:        <Shield size={20} />,
  enterprise:   <Building2 size={20} />,
};

// ── Component ─────────────────────────────────────────────────────────────────
export function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ApiService.get<{ plans: Plan[]; current: BillingStatus }>("/billing/plans");
      setPlans(data.plans);
      setBilling(data.current);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar planos.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // Check for redirect from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      // Refetch to get updated plan
      fetchPlans();
      window.history.replaceState({}, "", "/billing");
    }
  }, [fetchPlans]);

  const handleUpgrade = async (planId: PlanId) => {
    setError("");
    setCheckoutLoading(planId);
    try {
      const { url } = await ApiService.post<{ url: string }>("/billing/checkout", { plan: planId });
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout.";
      setError(msg);
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setError("");
    setPortalLoading(true);
    try {
      const { url } = await ApiService.post<{ url: string }>("/billing/portal", {});
      window.location.href = url;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao abrir portal.";
      setError(msg);
      setPortalLoading(false);
    }
  };

  // ── Status banner ─────────────────────────────────────────────────────────
  const renderStatusBanner = () => {
    if (!billing) return null;

    if (billing.status === "trial") {
      const days = daysLeft(billing.trialEndsAt);
      return (
        <div className={`billing-banner billing-banner--${days <= 3 ? "warning" : "info"}`}>
          <AlertTriangle size={18} />
          <span>
            {days > 0
              ? `Seu trial expira em ${days} dia${days > 1 ? "s" : ""}. Faça upgrade para continuar.`
              : "Seu período de trial expirou. Faça upgrade para continuar usando o Conversia."}
          </span>
        </div>
      );
    }

    if (billing.status === "past_due") {
      return (
        <div className="billing-banner billing-banner--error">
          <AlertTriangle size={18} />
          <span>Pagamento em atraso. Atualize seu método de pagamento para evitar a suspensão.</span>
          <button className="billing-banner-btn" onClick={handlePortal} disabled={portalLoading}>
            {portalLoading ? <Loader2 size={14} className="animate-spin" /> : "Atualizar pagamento"}
          </button>
        </div>
      );
    }

    if (billing.status === "cancelled") {
      return (
        <div className="billing-banner billing-banner--warning">
          <AlertTriangle size={18} />
          <span>Assinatura cancelada. Faça upgrade para reativar.</span>
        </div>
      );
    }

    return null;
  };

  // ── Plan card ─────────────────────────────────────────────────────────────
  const renderPlanCard = (plan: Plan) => {
    const isCurrent = plan.isCurrent;
    const isHighlighted = plan.id === "professional";
    const isEnterprise = plan.id === "enterprise";
    const isUpgrade = !isCurrent && plan.id !== "trial";

    return (
      <div
        key={plan.id}
        className={`billing-plan-card ${isCurrent ? "billing-plan-card--current" : ""} ${isHighlighted ? "billing-plan-card--highlighted" : ""}`}
      >
        {isHighlighted && <div className="billing-plan-badge">Mais popular</div>}
        {isCurrent && <div className="billing-plan-badge billing-plan-badge--current">Plano atual</div>}

        <div className="billing-plan-icon" data-plan={plan.id}>
          {PLAN_ICONS[plan.id]}
        </div>

        <h3 className="billing-plan-name">{plan.label}</h3>

        <div className="billing-plan-price">
          {plan.priceMonthlyBrl === null ? (
            <>
              <span className="billing-price-custom">Personalizado</span>
              <span className="billing-price-period">entre em contato</span>
            </>
          ) : (
            <>
              <span className="billing-price-value">{formatBrl(plan.priceMonthlyBrl)}</span>
              {plan.priceMonthlyBrl > 0 && <span className="billing-price-period">/mês</span>}
            </>
          )}
        </div>

        <div className="billing-plan-limits">
          <span>{plan.maxUnits >= 9999 ? "Unidades ilimitadas" : `Até ${plan.maxUnits} unidades`}</span>
          <span>·</span>
          <span>{plan.maxUsers >= 999 ? "Usuários ilimitados" : `${plan.maxUsers} usuários`}</span>
        </div>

        <ul className="billing-plan-features">
          {plan.features.map((f) => (
            <li key={f}>
              <Check size={14} />
              {f}
            </li>
          ))}
        </ul>

        <div className="billing-plan-action">
          {isCurrent ? (
            billing?.status === "active" ? (
              <button className="billing-btn billing-btn--manage" onClick={handlePortal} disabled={portalLoading}>
                {portalLoading ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /> Gerenciar assinatura</>}
              </button>
            ) : (
              <span className="billing-current-label">Plano atual (trial)</span>
            )
          ) : isEnterprise ? (
            <a
              href="mailto:comercial@conversia.app?subject=Enterprise - Interesse"
              className="billing-btn billing-btn--enterprise"
            >
              <ExternalLink size={16} />
              Falar com vendas
            </a>
          ) : isUpgrade ? (
            billing?.stripeEnabled ? (
              <button
                className={`billing-btn billing-btn--upgrade ${isHighlighted ? "billing-btn--primary" : ""}`}
                onClick={() => handleUpgrade(plan.id)}
                disabled={checkoutLoading !== null}
              >
                {checkoutLoading === plan.id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Zap size={16} />
                    Fazer upgrade
                  </>
                )}
              </button>
            ) : (
              <span className="billing-stripe-note">Configure o Stripe para ativar</span>
            )
          ) : null}
        </div>
      </div>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="billing-page">
        <div className="billing-loading">
          <Loader2 size={32} className="animate-spin" />
          <p>Carregando planos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <CreditCard size={24} />
        <div>
          <h1>Planos e Cobrança</h1>
          <p>Escolha o plano ideal para o tamanho da sua operação.</p>
        </div>
      </div>

      {error && (
        <div className="billing-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {renderStatusBanner()}

      <div className="billing-plans-grid">
        {plans.map(renderPlanCard)}
      </div>

      <p className="billing-footer-note">
        Todos os planos incluem suporte técnico, atualizações contínuas e segurança de dados (LGPD).
        Preços em BRL, cobrados mensalmente. Cancele a qualquer momento.
      </p>
    </div>
  );
}
