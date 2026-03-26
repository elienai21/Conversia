// src/components/OnboardingWizard.tsx
// 3-step onboarding overlay for new tenants after signup.
// Persists step completion to the backend so it never shows again once done.
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ApiService } from "@/services/api";
import {
  MessageCircle, Bot, Users, Check, ArrowRight, X, Sparkles,
} from "lucide-react";
import "./OnboardingWizard.css";

// ── Types ────────────────────────────────────────────────────────────────────
interface TenantMe {
  onboarding_step: number;
  plan: string;
}

interface WizardStep {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionPath: string; // where the "Configurar" button navigates
}

const STEPS: WizardStep[] = [
  {
    id: 1,
    icon: <MessageCircle size={28} />,
    title: "Conectar WhatsApp",
    description:
      "Conecte seu número de WhatsApp via Evolution API para começar a receber e responder mensagens dos seus hóspedes automaticamente.",
    actionLabel: "Ir para Integrações",
    actionPath: "/settings",
  },
  {
    id: 2,
    icon: <Bot size={28} />,
    title: "Configurar a IA",
    description:
      "Adicione sua chave da OpenAI para ativar respostas automáticas multilíngues, sugestões do Copilot e preenchimento inteligente de OS.",
    actionLabel: "Configurar IA",
    actionPath: "/settings",
  },
  {
    id: 3,
    icon: <Users size={28} />,
    title: "Convidar a equipe",
    description:
      "Adicione os membros da equipe operacional. Cada pessoa terá acesso ao inbox e às ordens de serviço do hotel.",
    actionLabel: "Gerenciar equipe",
    actionPath: "/settings",
  },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function OnboardingWizard() {
  const [show, setShow] = useState(false);
  const [currentStep, setCurrentStep] = useState(0); // index in STEPS array (0-based)
  const [completing, setCompleting] = useState(false);
  const navigate = useNavigate();

  const fetchStep = useCallback(async () => {
    try {
      const data = await ApiService.get<TenantMe>("/tenants/me");
      const step = data.onboarding_step;
      // Show wizard only for admins who haven't finished onboarding (step < 4)
      if (step < 4) {
        setCurrentStep(step); // 0 = just created, 1-3 = in progress
        setShow(true);
      }
    } catch {
      // Non-fatal: if we can't fetch, don't show wizard
    }
  }, []);

  useEffect(() => {
    fetchStep();
  }, [fetchStep]);

  const advanceStep = async (stepNumber: number) => {
    setCompleting(true);
    try {
      await ApiService.patch("/tenants/me/onboarding", { step: stepNumber });
      setCurrentStep(stepNumber);
      if (stepNumber >= 4) {
        setShow(false);
      }
    } catch {
      // Silently ignore — the user can still proceed
    } finally {
      setCompleting(false);
    }
  };

  const handleSkipAll = async () => {
    setCompleting(true);
    try {
      await ApiService.patch("/tenants/me/onboarding", { skip: true });
    } catch {
      // ignore
    } finally {
      setShow(false);
      setCompleting(false);
    }
  };

  const handleAction = async (step: WizardStep) => {
    // Mark this step as completed (step.id = 1-based)
    await advanceStep(step.id + 1 > 3 ? 4 : step.id + 1);
    navigate(step.actionPath);
    setShow(false);
  };

  const handleNextStep = async () => {
    const nextStep = currentStep + 1;
    if (nextStep > 3) {
      await advanceStep(4); // done
    } else {
      await advanceStep(nextStep);
    }
  };

  if (!show) return null;

  // displayStep: the step object to show (0-indexed into STEPS array)
  const stepIndex = Math.min(Math.max(currentStep, 0), STEPS.length - 1);
  const step = STEPS[stepIndex];
  const totalSteps = STEPS.length;
  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <>
      {/* Backdrop */}
      <div className="onboarding-backdrop" onClick={handleSkipAll} />

      {/* Wizard panel */}
      <div className="onboarding-wizard" role="dialog" aria-modal="true" aria-label="Configuração inicial">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-header-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="onboarding-title">Bem-vindo ao Conversia!</h2>
            <p className="onboarding-subtitle">Configure em 3 passos rápidos</p>
          </div>
          <button
            className="onboarding-close"
            onClick={handleSkipAll}
            aria-label="Fechar e pular"
            disabled={completing}
          >
            <X size={18} />
          </button>
        </div>

        {/* Step progress */}
        <div className="onboarding-progress">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`onboarding-progress-item ${
                i < stepIndex
                  ? "done"
                  : i === stepIndex
                  ? "active"
                  : ""
              }`}
            >
              <div className="onboarding-progress-dot">
                {i < stepIndex ? <Check size={12} strokeWidth={3} /> : <span>{i + 1}</span>}
              </div>
              <span className="onboarding-progress-label">{s.title}</span>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="onboarding-body">
          <div className="onboarding-step-icon">
            {step.icon}
          </div>
          <h3 className="onboarding-step-title">
            Passo {stepIndex + 1} — {step.title}
          </h3>
          <p className="onboarding-step-description">{step.description}</p>
        </div>

        {/* Actions */}
        <div className="onboarding-actions">
          <button
            className="onboarding-btn-skip"
            onClick={handleNextStep}
            disabled={completing}
          >
            {isLastStep ? "Finalizar" : "Fazer depois"}
          </button>

          <button
            className="onboarding-btn-primary"
            onClick={() => handleAction(step)}
            disabled={completing}
          >
            {completing ? (
              <span className="onboarding-spinner" />
            ) : (
              <>
                {step.actionLabel}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>

        <p className="onboarding-skip-all">
          <button onClick={handleSkipAll} disabled={completing}>
            Pular configuração inicial
          </button>
        </p>
      </div>
    </>
  );
}
