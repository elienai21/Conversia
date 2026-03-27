// src/components/ForwardMessageModal.tsx
import { useState, useEffect, useRef } from "react";
import { X, Search, Share2, Loader2, Check, MessageCircle, Camera, Bot } from "lucide-react";
import { ApiService } from "@/services/api";
import "./ForwardMessageModal.css";

interface Conversation {
  id: string;
  channel: string;
  status: string;
  customer: { phone: string; name?: string | null; profile_picture_url?: string | null } | null;
  last_message_preview?: string | null;
}

interface ForwardMessageModalProps {
  messageId: string;
  conversationId: string;
  /** Short preview of the message being forwarded */
  messagePreview: string;
  onClose: () => void;
  /** Called after a successful forward with the target conversation id */
  onForwarded?: (targetConvId: string) => void;
}

export function ForwardMessageModal({
  messageId,
  conversationId,
  messagePreview,
  onClose,
  onForwarded,
}: ForwardMessageModalProps) {
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [forwarding, setForwarding] = useState<string | null>(null); // target conv id
  const [forwarded, setForwarded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load conversations once
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    ApiService.get<Conversation[]>("/conversations?limit=100&status=open")
      .then((data) => {
        if (!cancelled) {
          // Exclude the current conversation from forward targets
          setConversations(data.filter((c) => c.id !== conversationId));
        }
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível carregar as conversas.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  const filtered = conversations.filter((c) => {
    const term = query.toLowerCase();
    if (!term) return true;
    const name = c.customer?.name?.toLowerCase() ?? "";
    const phone = c.customer?.phone?.toLowerCase() ?? "";
    return name.includes(term) || phone.includes(term);
  });

  const handleForward = async (targetConvId: string) => {
    if (forwarding || forwarded.has(targetConvId)) return;
    setForwarding(targetConvId);
    setError(null);
    try {
      await ApiService.post(
        `/conversations/${conversationId}/messages/${messageId}/forward`,
        { target_conversation_id: targetConvId },
      );
      setForwarded((prev) => new Set([...prev, targetConvId]));
      onForwarded?.(targetConvId);
    } catch (e: any) {
      setError(e.message ?? "Erro ao encaminhar mensagem.");
    } finally {
      setForwarding(null);
    }
  };

  function channelIcon(channel: string) {
    if (channel === "whatsapp") return <MessageCircle size={12} />;
    if (channel === "instagram") return <Camera size={12} />;
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="forward-modal__header">
          <div className="forward-modal__title-row">
            <Share2 size={16} className="forward-modal__icon" />
            <h2>Encaminhar mensagem</h2>
          </div>
          <button className="forward-modal__close" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        {/* Preview of the message being forwarded */}
        <div className="forward-modal__preview">
          <span className="forward-modal__preview-label">Mensagem a encaminhar:</span>
          <p className="forward-modal__preview-text">{messagePreview}</p>
        </div>

        {/* Search */}
        <div className="forward-modal__search">
          <Search size={14} className="forward-modal__search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="forward-modal__search-input"
            placeholder="Buscar conversa ou nome..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="forward-modal__error">{error}</div>
        )}

        {/* List */}
        <div className="forward-modal__list">
          {isLoading ? (
            <div className="forward-modal__loading">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="forward-modal__empty">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            filtered.map((conv) => {
              const isDone = forwarded.has(conv.id);
              const isThisForwarding = forwarding === conv.id;
              return (
                <div key={conv.id} className="forward-conv-row">
                  <div className="forward-conv-avatar">
                    {conv.customer?.profile_picture_url ? (
                      <img src={conv.customer.profile_picture_url} alt="" />
                    ) : (
                      <div className="forward-conv-avatar-fallback">
                        {conv.customer?.name?.charAt(0) || <Bot size={14} />}
                      </div>
                    )}
                  </div>
                  <div className="forward-conv-info">
                    <span className="forward-conv-name">
                      {conv.customer?.name || conv.customer?.phone || "Desconhecido"}
                    </span>
                    <span className="forward-conv-meta">
                      {channelIcon(conv.channel)}&nbsp;
                      {conv.last_message_preview
                        ? conv.last_message_preview.slice(0, 40) + (conv.last_message_preview.length > 40 ? "…" : "")
                        : conv.channel}
                    </span>
                  </div>
                  <button
                    className={`forward-conv-btn ${isDone ? "forwarded" : ""}`}
                    disabled={!!forwarding || isDone}
                    onClick={() => handleForward(conv.id)}
                    title={isDone ? "Encaminhado" : "Encaminhar"}
                  >
                    {isThisForwarding ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isDone ? (
                      <><Check size={14} /> Enviado</>
                    ) : (
                      <><Share2 size={14} /> Encaminhar</>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="forward-modal__footer">
          {forwarded.size > 0 && (
            <span className="forward-modal__done-hint">
              <Check size={12} /> Encaminhada para {forwarded.size} conversa{forwarded.size > 1 ? "s" : ""}
            </span>
          )}
          <button className="forward-modal__close-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
