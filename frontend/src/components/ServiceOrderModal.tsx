// src/components/ServiceOrderModal.tsx
// Smart O.S. modal — optionally uses AI to pre-fill fields from conversation context
import { useState, useEffect } from "react";
import { Sparkles, Loader2, X } from "lucide-react";
import { ApiService } from "@/services/api";
import "./ServiceOrderModal.css";

export type OsSuggestion = {
  location: string;
  category: string;
  description: string;
  priority: string;
  origin: string;
  impactOnStay: string;
  guestName: string;
  paymentResponsible: string;
  notes: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** When provided the modal shows the AI suggestion button */
  conversationId?: string;
};

const CATEGORIES = [
  "limpeza", "manutenção", "vistoria", "enxoval",
  "check-in", "check-out", "suporte", "reposição", "emergência", "outro",
];

const PRIORITIES = [
  { value: "low",    label: "🟢 Baixa" },
  { value: "medium", label: "🔵 Média" },
  { value: "high",   label: "🟡 Alta" },
  { value: "urgent", label: "🔴 Urgente" },
];

const ORIGINS = [
  { value: "hóspede",        label: "🧳 Hóspede" },
  { value: "proprietário",   label: "🏠 Proprietário" },
  { value: "limpeza",        label: "🧹 Equipe de Limpeza" },
  { value: "vistoria",       label: "🔍 Vistoria" },
  { value: "equipe_interna", label: "👥 Equipe Interna" },
];

const IMPACTS = [
  { value: "none",          label: "✅ Sem impacto" },
  { value: "partial",       label: "⚠️ Impacto parcial" },
  { value: "blocks_checkin",label: "🚫 Impede check-in" },
];

const PAYMENT = [
  { value: "vivare", label: "🏢 Vivare" },
  { value: "owner",  label: "🏠 Proprietário" },
  { value: "guest",  label: "🧳 Hóspede" },
];

const EMPTY: OsSuggestion = {
  location: "", category: "manutenção", description: "",
  priority: "medium", origin: "hóspede", impactOnStay: "none",
  guestName: "", paymentResponsible: "vivare", notes: "",
};

export function ServiceOrderModal({ open, onClose, onCreated, conversationId }: Props) {
  const [fields, setFields] = useState<OsSuggestion>(EMPTY);
  const [assignedTo, setAssignedTo]       = useState("");
  const [assignedPhone, setAssignedPhone] = useState("");
  const [aiLoading, setAiLoading]         = useState(false);
  const [aiUsed, setAiUsed]               = useState(false);
  const [aiError, setAiError]             = useState(false);
  const [saving, setSaving]               = useState(false);

  // Auto-trigger AI when modal opens with a conversationId
  useEffect(() => {
    if (open && conversationId && !aiUsed) {
      handleAiSuggest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversationId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setFields(EMPTY);
      setAssignedTo("");
      setAssignedPhone("");
      setAiUsed(false);
      setAiError(false);
    }
  }, [open]);

  if (!open) return null;

  const set = (key: keyof OsSuggestion) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const handleAiSuggest = async () => {
    if (!conversationId) return;
    setAiLoading(true);
    setAiError(false);
    try {
      const res = await ApiService.post<OsSuggestion>(
        `/conversations/${conversationId}/suggest-os`,
        {}
      );
      setFields(res);
      setAiUsed(true);
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fields.location.trim() || !fields.description.trim()) return;
    setSaving(true);
    try {
      await ApiService.post("/service-orders", {
        conversationId: conversationId ?? undefined,
        location:           fields.location.trim(),
        category:           fields.category || undefined,
        description:        fields.description.trim(),
        priority:           fields.priority,
        origin:             fields.origin || undefined,
        impactOnStay:       fields.impactOnStay || undefined,
        guestName:          fields.guestName.trim() || undefined,
        paymentResponsible: fields.paymentResponsible || undefined,
        notes:              fields.notes.trim() || undefined,
        assignedTo:         assignedTo.trim() || undefined,
        assignedPhone:      assignedPhone.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="osm-overlay" onClick={onClose}>
      <div className="osm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="osm-header">
          <h3>Nova Ordem de Serviço</h3>
          <button className="osm-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* AI Suggestion Banner */}
        {conversationId && (
          <div className={`osm-ai-banner ${aiUsed ? "osm-ai-banner--used" : ""}`}>
            {aiLoading ? (
              <span className="osm-ai-loading">
                <Loader2 size={15} className="osm-spin" />
                Analisando conversa com IA...
              </span>
            ) : aiUsed ? (
              <span className="osm-ai-done">
                ✨ Campos preenchidos pela IA — revise e ajuste se necessário
                <button className="osm-ai-redo" onClick={handleAiSuggest}>↺ Refazer</button>
              </span>
            ) : (
              <button className="osm-ai-btn" onClick={handleAiSuggest}>
                <Sparkles size={15} />
                Analisar conversa com IA
              </button>
            )}
            {aiError && <span className="osm-ai-error">Erro ao analisar. Preencha manualmente.</span>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="osm-form">
          {/* Row 1: Location + Category */}
          <div className="osm-row">
            <div className="osm-field osm-field--grow">
              <label>📍 Local / Unidade <span className="osm-req">*</span></label>
              <input
                type="text"
                placeholder="Ex: Apto 302 - Bloco B"
                value={fields.location}
                onChange={set("location")}
                required
                className={aiUsed && fields.location ? "osm-ai-filled" : ""}
              />
            </div>
            <div className="osm-field osm-field--200">
              <label>📂 Categoria</label>
              <select value={fields.category} onChange={set("category")} className={aiUsed && fields.category ? "osm-ai-filled" : ""}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Description */}
          <div className="osm-field">
            <label>🔧 Descrição do Problema <span className="osm-req">*</span></label>
            <textarea
              placeholder="Ex: Chuveiro elétrico apresentando mau funcionamento"
              value={fields.description}
              onChange={set("description")}
              required
              rows={2}
              className={aiUsed && fields.description ? "osm-ai-filled" : ""}
            />
          </div>

          {/* Row 3: Priority + Origin + Impact */}
          <div className="osm-row">
            <div className="osm-field osm-field--160">
              <label>⚡ Prioridade</label>
              <select value={fields.priority} onChange={set("priority")} className={`osm-priority-${fields.priority} ${aiUsed ? "osm-ai-filled" : ""}`}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="osm-field osm-field--grow">
              <label>📣 Origem</label>
              <select value={fields.origin} onChange={set("origin")} className={aiUsed && fields.origin ? "osm-ai-filled" : ""}>
                {ORIGINS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="osm-field osm-field--grow">
              <label>🏨 Impacto</label>
              <select value={fields.impactOnStay} onChange={set("impactOnStay")} className={aiUsed && fields.impactOnStay ? "osm-ai-filled" : ""}>
                {IMPACTS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Guest + Payment */}
          <div className="osm-row">
            <div className="osm-field osm-field--grow">
              <label>🧳 Nome do Hóspede</label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={fields.guestName}
                onChange={set("guestName")}
                className={aiUsed && fields.guestName ? "osm-ai-filled" : ""}
              />
            </div>
            <div className="osm-field osm-field--200">
              <label>💳 Responsável Pgto.</label>
              <select value={fields.paymentResponsible} onChange={set("paymentResponsible")} className={aiUsed && fields.paymentResponsible ? "osm-ai-filled" : ""}>
                {PAYMENT.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 5: Assigned + Phone */}
          <div className="osm-row">
            <div className="osm-field osm-field--grow">
              <label>👷 Responsável pela Execução</label>
              <input
                type="text"
                placeholder="Ex: João Eletricista"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              />
            </div>
            <div className="osm-field osm-field--200">
              <label>📱 WhatsApp</label>
              <input
                type="text"
                placeholder="5511999998888"
                value={assignedPhone}
                onChange={(e) => setAssignedPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Row 6: Notes */}
          <div className="osm-field">
            <label>📝 Observações</label>
            <textarea
              placeholder="Informações adicionais relevantes..."
              value={fields.notes}
              onChange={set("notes")}
              rows={2}
              className={aiUsed && fields.notes ? "osm-ai-filled" : ""}
            />
          </div>

          {/* Actions */}
          <div className="osm-actions">
            <button type="button" className="osm-btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={`osm-btn-primary osm-btn-prio-${fields.priority}`} disabled={saving}>
              {saving ? <><Loader2 size={14} className="osm-spin" /> Criando...</> : "✅ Criar O.S."}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
