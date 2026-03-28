import { useState, useEffect, useRef } from "react";
import { ApiService } from "@/services/api";
import { Bot, UserCog, Calendar, Loader2 } from "lucide-react";
import "./AiModeToggle.css";

type AiModeStatus = {
  mode: string;
  is_auto_response_active: boolean;
};

const MODES = [
  {
    value: "manual",
    label: "Copiloto",
    desc: "IA só sugere respostas",
    icon: UserCog,
    statusClass: "copilot",
  },
  {
    value: "auto",
    label: "Automático 24h",
    desc: "IA responde sozinha",
    icon: Bot,
    statusClass: "active",
  },
  {
    value: "scheduled",
    label: "Agendado",
    desc: "Auto fora do expediente",
    icon: Calendar,
    statusClass: "scheduled",
  },
] as const;

export function AiModeToggle() {
  const [mode, setMode] = useState<string>("manual");
  const [isActive, setIsActive] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ApiService.get<AiModeStatus>("/tenants/me/ai-mode-status")
      .then((res) => {
        setMode(res.mode);
        setIsActive(res.is_auto_response_active);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleModeChange = async (newMode: string) => {
    setIsSwitching(true);
    try {
      const res = await ApiService.patch<AiModeStatus>("/tenants/me/ai-mode", {
        mode: newMode,
      });
      setMode(res.mode);
      setIsActive(res.is_auto_response_active);
    } catch (err) {
      console.error("Failed to change AI mode:", err);
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  };

  const currentMode = MODES.find((m) => m.value === mode) || MODES[0];
  // "IA ATIVA" = auto-response is firing right now
  // "COPILOTO" = manual mode OR scheduled mode but currently inside business hours (not firing)
  // "AGENDADO" = scheduled mode and will auto-respond outside business hours
  const statusLabel = isActive ? "IA ATIVA" : mode === "scheduled" ? "AGENDADO" : "COPILOTO";
  const dotClass = isActive ? "active" : mode === "scheduled" ? "scheduled" : "copilot";

  if (isLoading) {
    return (
      <div className="ai-mode-toggle" style={{ opacity: 0.5 }}>
        <div className="ai-mode-toggle-header">
          <span className="ai-mode-toggle-label">
            <Loader2 size={14} className="animate-spin" /> Modo IA
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-mode-toggle-wrapper" ref={wrapperRef}>
      <div
        className="ai-mode-toggle"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
      >
        <div className="ai-mode-toggle-header">
          <span className="ai-mode-toggle-label">
            <currentMode.icon size={14} />
            <span>{currentMode.label}</span>
          </span>
          <span className={`ai-mode-toggle-status ${currentMode.statusClass}`}>
            <span className={`ai-mode-dot ${dotClass}`} />
            {isSwitching ? "..." : statusLabel}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="ai-mode-dropdown">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`ai-mode-option ${mode === m.value ? "selected" : ""}`}
              onClick={() => handleModeChange(m.value)}
              disabled={isSwitching}
            >
              <div className={`ai-mode-option-icon ${m.value}`}>
                <m.icon size={16} />
              </div>
              <div className="ai-mode-option-text">
                <span className="ai-mode-option-title">{m.label}</span>
                <span className="ai-mode-option-desc">{m.desc}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
