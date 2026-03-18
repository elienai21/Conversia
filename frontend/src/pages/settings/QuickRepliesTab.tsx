import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2, Plus, Edit2, Trash2, X } from "lucide-react";
import "./QuickRepliesTab.css";

type QuickReply = {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  created_at: string;
};

export function QuickRepliesTab() {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formShortcut, setFormShortcut] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadReplies = async () => {
    try {
      const data = await ApiService.get<QuickReply[]>("/quick-replies");
      setReplies(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReplies();
  }, []);

  const openCreateModal = () => {
    setEditingReply(null);
    setFormTitle("");
    setFormBody("");
    setFormShortcut("");
    setIsModalOpen(true);
  };

  const openEditModal = (reply: QuickReply) => {
    setEditingReply(reply);
    setFormTitle(reply.title);
    setFormBody(reply.body);
    setFormShortcut(reply.shortcut || "");
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formBody.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        body: formBody.trim(),
        shortcut: formShortcut.trim() || undefined,
      };

      if (editingReply) {
        await ApiService.put(`/quick-replies/${editingReply.id}`, payload);
      } else {
        await ApiService.post("/quick-replies", payload);
      }
      setIsModalOpen(false);
      loadReplies();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja apagar esta resposta r\u00e1pida?")) return;
    try {
      await ApiService.delete(`/quick-replies/${id}`);
      setReplies((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <div className="tab-loading flex-center">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="quick-replies-tab">
      <div className="tab-header">
        <div>
          <h3>Quick Replies</h3>
          <p className="tab-description">
            Crie respostas prontas para usar rapidamente no chat. Digite "/" no campo de mensagem para acessar.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> Nova Resposta
        </button>
      </div>

      {replies.length === 0 ? (
        <div className="empty-state glass-panel">
          <p>Nenhuma resposta r\u00e1pida cadastrada.</p>
          <p className="text-muted">Clique em "Nova Resposta" para criar a primeira.</p>
        </div>
      ) : (
        <div className="qr-grid">
          {replies.map((reply) => (
            <div key={reply.id} className="qr-card glass-panel">
              <div className="qr-card-header">
                <h4>{reply.title}</h4>
                <div className="qr-card-actions">
                  <button className="icon-btn" onClick={() => openEditModal(reply)} title="Editar">
                    <Edit2 size={14} />
                  </button>
                  <button className="icon-btn danger" onClick={() => handleDelete(reply.id)} title="Apagar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {reply.shortcut && (
                <span className="qr-shortcut-badge">/{reply.shortcut}</span>
              )}
              <p className="qr-card-body">{reply.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingReply ? "Editar Resposta" : "Nova Resposta R\u00e1pida"}</h3>
              <button className="icon-btn" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>T\u00edtulo</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Check-in info"
                />
              </div>
              <div className="form-group">
                <label>Atalho (opcional)</label>
                <div className="shortcut-input-wrapper">
                  <span className="shortcut-prefix">/</span>
                  <input
                    type="text"
                    value={formShortcut}
                    onChange={(e) => setFormShortcut(e.target.value.replace(/\s/g, ""))}
                    placeholder="checkin"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Mensagem</label>
                <textarea
                  rows={5}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Digite o texto da resposta..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </button>
              <button className="btn-primary" onClick={handleSave} disabled={isSaving || !formTitle.trim() || !formBody.trim()}>
                {isSaving ? <><Loader2 size={16} className="animate-spin" /> Salvando...</> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
