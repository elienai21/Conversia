import { useState } from "react";
import { X, MessageCircle, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ApiService } from "@/services/api";
import "./NewCustomerModal.css";
import "./StartConversationModal.css";

type Customer = {
  id: string;
  name: string | null;
  phone: string;
};

type Props = {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
};

export function StartConversationModal({ open, customer, onClose }: Props) {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  if (!open || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!message.trim()) {
      setError("Digite uma mensagem.");
      return;
    }

    setSending(true);
    try {
      const conv = await ApiService.post<{ id: string }>("/conversations", {
        customer_id: customer.id,
        channel: "whatsapp",
        message: message.trim(),
      });
      setMessage("");
      onClose();
      navigate("/inbox", { state: { openConversationId: conv.id } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao enviar mensagem";
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const initial = (customer.name || customer.phone).charAt(0).toUpperCase();

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel animate-fade-in">
        <div className="modal-header">
          <div className="modal-title-row">
            <MessageCircle size={20} className="text-brand-primary" />
            <h2>Enviar Mensagem</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="start-conv-customer-info">
            <div className="customer-avatar-sm">{initial}</div>
            <div className="customer-detail">
              <strong>{customer.name || customer.phone}</strong>
              <span>{customer.phone}</span>
            </div>
          </div>

          <div className="modal-field">
            <label htmlFor="sc-message">
              <Send size={14} />
              Mensagem via WhatsApp
            </label>
            <textarea
              id="sc-message"
              placeholder="Digite sua mensagem..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn-secondary" onClick={onClose} disabled={sending}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-primary" disabled={sending}>
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
