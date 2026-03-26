import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Clock, Phone, Save, CheckCircle, Loader2, Bot } from "lucide-react";
import "./BusinessHoursTab.css";

const WEEKDAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
];

type AISettings = {
  business_hours_start: string;
  business_hours_end: string;
  business_hours_days: number[];
  emergency_phone_number: string | null;
  auto_response_mode: string;
};

export function BusinessHoursTab() {
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("18:00");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [mode, setMode] = useState("manual");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    ApiService.get<AISettings>("/tenants/me/ai-settings")
      .then((res) => {
        setStartTime(res.business_hours_start || "08:00");
        setEndTime(res.business_hours_end || "18:00");
        setSelectedDays(res.business_hours_days || [1, 2, 3, 4, 5]);
        setEmergencyPhone(res.emergency_phone_number || "");
        setMode(res.auto_response_mode || "manual");
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setShowSuccess(false);
    try {
      await ApiService.patch("/tenants/me/ai-settings", {
        business_hours_start: startTime,
        business_hours_end: endTime,
        business_hours_days: selectedDays,
        emergency_phone_number: emergencyPhone || null,
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save:", err);
      alert("Erro ao salvar configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  // Check if scheduled mode is active now
  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  const isBusinessHoursNow = selectedDays.includes(currentDay) && currentMinutes >= startMins && currentMinutes < endMins;

  // Effective status: if scheduled, auto when outside bh; if auto, always auto; otherwise copilot
  const isAutoActiveNow = mode === "auto" || (mode === "scheduled" && !isBusinessHoursNow);

  return (
    <div className="bh-tab">
      {/* Status preview */}
      <div className={`bh-status-preview ${isAutoActiveNow ? "active" : "inactive"}`}>
        <Bot size={16} />
        {mode === "manual" && "Modo Manual — IA funciona como Copiloto"}
        {mode === "auto" && "Modo Automático — IA responde 24h"}
        {mode === "scheduled" && (
          isAutoActiveNow
            ? "Fora do expediente — IA está respondendo automaticamente"
            : "Horário comercial — IA funciona como Copiloto"
        )}
      </div>

      {/* Business Hours */}
      <div className="bh-section">
        <h3 className="bh-section-title">
          <Clock size={18} /> Horário de Expediente
        </h3>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 1rem 0" }}>
          Quando o modo &quot;Agendado&quot; estiver ativo, a IA responderá automaticamente fora deste horário.
        </p>

        <div className="bh-days-grid" style={{ marginBottom: "1.25rem" }}>
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              className={`bh-day-btn ${selectedDays.includes(day.value) ? "selected" : ""}`}
              onClick={() => toggleDay(day.value)}
              title={day.label}
            >
              {day.short}
            </button>
          ))}
        </div>

        <div className="bh-time-row">
          <div className="bh-time-group">
            <span className="bh-time-label">Início</span>
            <input
              type="time"
              className="bh-time-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <span className="bh-time-separator">→</span>
          <div className="bh-time-group">
            <span className="bh-time-label">Fim</span>
            <input
              type="time"
              className="bh-time-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Emergency Phone */}
      <div className="bh-section">
        <h3 className="bh-section-title">
          <Phone size={18} /> Telefone de Emergência
        </h3>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 0.75rem 0" }}>
          Quando uma emergência for detectada no modo automático, um alerta será enviado para este número via WhatsApp.
        </p>
        <input
          type="tel"
          className="bh-phone-input"
          value={emergencyPhone}
          onChange={(e) => setEmergencyPhone(e.target.value)}
          placeholder="5511999998888"
        />
        <p className="bh-phone-hint">Formato: código do país + DDD + número (sem espaços)</p>
      </div>

      {/* Save */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button className="bh-save-btn" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? "Salvando..." : "Salvar Configurações"}
        </button>
        {showSuccess && (
          <span className="bh-success-msg">
            <CheckCircle size={16} /> Salvo com sucesso!
          </span>
        )}
      </div>
    </div>
  );
}
