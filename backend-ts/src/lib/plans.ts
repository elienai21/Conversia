// src/lib/plans.ts
// Conversia subscription plan definitions.
// Price in BRL (cents for Stripe), limits enforced server-side.

export type PlanId = "trial" | "starter" | "professional" | "scale" | "enterprise";

export interface PlanDef {
  id: PlanId;
  label: string;
  priceMonthlyBrl: number | null; // null = custom quote
  maxUnits: number;              // hotel units/properties
  maxUsers: number;              // 999 = unlimited
  trialDays: number;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  trial: {
    id: "trial",
    label: "Trial",
    priceMonthlyBrl: 0,
    maxUnits: 5,
    maxUsers: 2,
    trialDays: 14,
    features: [
      "Até 5 unidades",
      "2 usuários",
      "WhatsApp + IA básica",
      "14 dias grátis",
    ],
  },
  starter: {
    id: "starter",
    label: "Starter",
    priceMonthlyBrl: 39900, // R$ 399,00
    maxUnits: 15,
    maxUsers: 3,
    trialDays: 0,
    features: [
      "Até 15 unidades",
      "3 usuários",
      "WhatsApp + Instagram",
      "IA multilíngue",
      "Ordens de serviço",
      "Suporte por e-mail",
    ],
  },
  professional: {
    id: "professional",
    label: "Professional",
    priceMonthlyBrl: 79900, // R$ 799,00
    maxUnits: 50,
    maxUsers: 8,
    trialDays: 0,
    features: [
      "Até 50 unidades",
      "8 usuários",
      "Tudo do Starter",
      "Analytics avançado",
      "Missões diárias (upsell)",
      "API access",
      "Suporte prioritário",
    ],
  },
  scale: {
    id: "scale",
    label: "Scale",
    priceMonthlyBrl: 149900, // R$ 1.499,00
    maxUnits: 150,
    maxUsers: 999,
    trialDays: 0,
    features: [
      "Até 150 unidades",
      "Usuários ilimitados",
      "Tudo do Professional",
      "SLA garantido",
      "Gerente de conta dedicado",
      "Onboarding guiado",
    ],
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    priceMonthlyBrl: null, // custom
    maxUnits: 9999,
    maxUsers: 9999,
    trialDays: 0,
    features: [
      "Redes e franquias",
      "150+ unidades",
      "Usuários ilimitados",
      "Tudo do Scale",
      "Contrato personalizado",
      "SLA 99.9%",
      "Suporte 24/7",
    ],
  },
};

export function getPlan(id: string): PlanDef {
  return PLANS[id as PlanId] ?? PLANS.trial;
}

/** Format price in BRL for display */
export function formatPriceBrl(cents: number | null): string {
  if (cents === null) return "Sob consulta";
  if (cents === 0) return "Grátis";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
