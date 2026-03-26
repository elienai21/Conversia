// src/pages/CampaignsPage.tsx
// Broadcast / mass-message campaigns — admin-only feature.
import { useState, useEffect, useCallback } from "react";
import {
  Megaphone, Plus, Play, Trash2, RefreshCw, Send,
  CheckCircle, AlertCircle, Clock, Loader2, X, Users
} from "lucide-react";
import { ApiService } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import "./CampaignsPage.css";

interface Campaign {
  id: string;
  name: string;
  message: string;
  target_tag: string | null;
  status: "draft" | "running" | "completed" | "failed";
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  draft:     { label: "Rascunho",  color: "#a0aec0", icon: Clock },
  running:   { label: "Enviando",  color: "#6366f1", icon: Loader2 },
  completed: { label: "Concluída", color: "#48bb78", icon: CheckCircle },
  failed:    { label: "Falhou",    color: "#fc8181", icon: AlertCircle },
};

const TAG_OPTIONS = [
  { value: "",       label: "Todos os clientes" },
  { value: "guest",  label: "Hóspedes (guest)" },
  { value: "owner",  label: "Proprietários (owner)" },
  { value: "lead",   label: "Leads" },
  { value: "staff",  label: "Equipe (staff)" },
];

export function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [targetTag, setTargetTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ApiService.get<Campaign[]>("/campaigns");
      setCampaigns(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCampaigns(); }, [fetchCampaigns]);

  const openCreate = () => {
    setEditingId(null);
    setName(""); setMessage(""); setTargetTag(""); setFormError("");
    setShowModal(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setName(c.name); setMessage(c.message); setTargetTag(c.target_tag || ""); setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !message.trim()) {
      setFormError("Nome e mensagem são obrigatórios.");
      return;
    }
    setSaving(true); setFormError("");
    try {
      const body = { name: name.trim(), message: message.trim(), target_tag: targetTag || undefined };
      if (editingId) {
        await ApiService.patch(`/campaigns/${editingId}`, body);
      } else {
        await ApiService.post("/campaigns", body);
      }
      setShowModal(false);
      void fetchCampaigns();
    } catch (err: any) {
      setFormError(err.message || "Erro ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  };

  const handleExecute = async (id: string) => {
    if (!confirm("Confirmar envio em massa? As mensagens serão disparadas imediatamente para todos os clientes selecionados.")) return;
    setExecuting(id);
    try {
      await ApiService.post(`/campaigns/${id}/execute`, {});
      await fetchCampaigns();
    } catch (err: any) {
      alert(err.message || "Erro ao executar campanha.");
    } finally {
      setExecuting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir esta campanha?")) return;
    setDeleting(id);
    try {
      await ApiService.delete(`/campaigns/${id}`);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message || "Erro ao excluir campanha.");
    } finally {
      setDeleting(null);
    }
  };

  const isAdmin = user?.role === "admin";

  return (
    <div className="campaigns-page">
      {/* Header */}
      <div className="campaigns-header">
        <div className="campaigns-header__left">
          <Megaphone size={22} className="campaigns-header__icon" />
          <div>
            <h1 className="campaigns-header__title">Campanhas</h1>
            <p className="campaigns-header__subtitle">
              Disparos em massa para segmentos da sua base de clientes via WhatsApp
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="campaigns-refresh-btn" onClick={() => void fetchCampaigns()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} />
          </button>
          {isAdmin && (
            <button className="campaigns-create-btn" onClick={openCreate}>
              <Plus size={16} />
              Nova campanha
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      {campaigns.length > 0 && (
        <div className="campaigns-stats">
          {(["draft","running","completed","failed"] as const).map((status) => {
            const count = campaigns.filter((c) => c.status === status).length;
            const cfg = STATUS_CONFIG[status];
            return (
              <div key={status} className="campaigns-stat-card">
                <cfg.icon size={18} style={{ color: cfg.color }} />
                <span className="campaigns-stat-count" style={{ color: cfg.color }}>{count}</span>
                <span className="campaigns-stat-label">{cfg.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="campaigns-loading">
          <Loader2 size={28} className="spin" />
          <span>Carregando campanhas…</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="campaigns-empty">
          <Megaphone size={52} opacity={0.2} />
          <h3>Nenhuma campanha ainda</h3>
          <p>Crie sua primeira campanha para disparar mensagens em massa para segmentos de clientes.</p>
          {isAdmin && (
            <button className="campaigns-create-btn" onClick={openCreate}>
              <Plus size={16} /> Nova campanha
            </button>
          )}
        </div>
      ) : (
        <div className="campaigns-list">
          {campaigns.map((c) => {
            const cfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
            const Icon = cfg.icon;
            const tagLabel = TAG_OPTIONS.find((t) => t.value === (c.target_tag || ""))?.label || c.target_tag;
            return (
              <div key={c.id} className="campaign-card">
                <div className="campaign-card__header">
                  <div className="campaign-card__title-row">
                    <h3 className="campaign-card__name">{c.name}</h3>
                    <span
                      className="campaign-card__status"
                      style={{ color: cfg.color, borderColor: cfg.color + "40", background: cfg.color + "12" }}
                    >
                      <Icon size={12} className={c.status === "running" ? "spin" : ""} />
                      {cfg.label}
                    </span>
                  </div>
                  <div className="campaign-card__actions">
                    {isAdmin && c.status === "draft" && (
                      <>
                        <button
                          className="campaign-action-btn campaign-action-btn--edit"
                          onClick={() => openEdit(c)}
                        >
                          Editar
                        </button>
                        <button
                          className="campaign-action-btn campaign-action-btn--execute"
                          onClick={() => void handleExecute(c.id)}
                          disabled={executing === c.id}
                        >
                          {executing === c.id ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                          Disparar
                        </button>
                      </>
                    )}
                    {isAdmin && c.status !== "running" && (
                      <button
                        className="campaign-action-btn campaign-action-btn--delete"
                        onClick={() => void handleDelete(c.id)}
                        disabled={deleting === c.id}
                      >
                        {deleting === c.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                <p className="campaign-card__message">{c.message}</p>

                <div className="campaign-card__meta">
                  <span className="campaign-meta-tag">
                    <Users size={12} />
                    {tagLabel}
                  </span>
                  {c.status === "completed" && (
                    <>
                      <span className="campaign-meta-sent">
                        <Send size={12} /> {c.sent_count} enviados
                      </span>
                      {c.failed_count > 0 && (
                        <span className="campaign-meta-failed">
                          <AlertCircle size={12} /> {c.failed_count} falhas
                        </span>
                      )}
                    </>
                  )}
                  <span className="campaign-meta-date">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="campaign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="campaign-modal__header">
              <h2>{editingId ? "Editar campanha" : "Nova campanha"}</h2>
              <button onClick={() => setShowModal(false)} className="campaign-modal__close">
                <X size={18} />
              </button>
            </div>

            <div className="campaign-modal__body">
              <label className="campaign-field-label">Nome da campanha</label>
              <input
                className="campaign-field-input"
                type="text"
                placeholder="ex: Promoção de Janeiro"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />

              <label className="campaign-field-label" style={{ marginTop: "1rem" }}>
                Público-alvo
              </label>
              <select
                className="campaign-field-input"
                value={targetTag}
                onChange={(e) => setTargetTag(e.target.value)}
              >
                {TAG_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <label className="campaign-field-label" style={{ marginTop: "1rem" }}>
                Mensagem
              </label>
              <textarea
                className="campaign-field-textarea"
                placeholder="Olá, {{nome}}! Temos uma promoção especial para você..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={4096}
              />
              <p className="campaign-field-hint">{message.length}/4096 caracteres</p>

              {formError && (
                <div className="campaign-form-error">
                  <AlertCircle size={14} /> {formError}
                </div>
              )}
            </div>

            <div className="campaign-modal__footer">
              <button className="campaign-modal-cancel" onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button className="campaign-modal-save" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={15} className="spin" /> : null}
                {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar campanha"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
