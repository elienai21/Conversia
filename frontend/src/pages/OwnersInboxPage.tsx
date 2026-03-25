// src/pages/OwnersInboxPage.tsx
// Isolated inbox that shows only OWNER conversations (owners scope)
import { useState, useEffect, useRef, useCallback } from "react";
import { ApiService } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import { Search, Send, ArrowLeft, Users, Briefcase, Wrench } from "lucide-react";
import "./OwnersInboxPage.css";

type StaffConversation = {
  id: string;
  customer: { phone: string; name?: string | null; tag?: string | null } | null;
  channel: string;
  status: string;
  updatedAt: string;
  unreadCount: number;
  lastMessagePreview: string | null;
};

type RawConversation = {
  id: string;
  channel: string;
  status: string;
  updated_at: string;
  customer: { phone: string; name: string | null; tag?: string | null } | null;
  unread_count?: number;
  last_message_preview?: string | null;
};

type Message = {
  id: string;
  senderType: "customer" | "agent" | "system";
  originalText: string;
  createdAt: string;
};

type RawMessage = {
  id: string;
  sender_type: "customer" | "agent" | "system";
  original_text: string;
  created_at: string;
};

function tagLabel(tag?: string | null): string {
  if (tag === "GROUP_STAFF") return "Grupo";
  if (tag === "STAFF") return "Equipe";
  return "Diretoria";
}

function tagColor(tag?: string | null): string {
  if (tag === "GROUP_STAFF") return "var(--accent-info, #3b82f6)";
  if (tag === "STAFF") return "var(--accent-warning, #f59e0b)";
  return "var(--accent-primary, #6366f1)";
}

export function OwnersInboxPage() {
  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  const fetchConversations = useCallback(async () => {
    try {
      const raw = await ApiService.get<RawConversation[]>("/conversations?scope=owners");
      const mapped: StaffConversation[] = raw.map((c) => ({
        id: c.id,
        customer: c.customer
          ? { phone: c.customer.phone, name: c.customer.name, tag: c.customer.tag }
          : null,
        channel: c.channel,
        status: c.status,
        updatedAt: c.updated_at,
        unreadCount: c.unread_count || 0,
        lastMessagePreview: c.last_message_preview || null,
      }));
      setConversations(mapped);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Real-time updates
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchConversations();
    socket.on("conversation.new", refresh);
    socket.on("conversation.updated", refresh);
    return () => {
      socket.off("conversation.new", refresh);
      socket.off("conversation.updated", refresh);
    };
  }, [socket, fetchConversations]);

  // Fetch messages when a conversation is selected
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const fetchMessages = async () => {
      try {
        const rawMsgs = await ApiService.get<RawMessage[]>(`/conversations/${selectedId}/messages`);
        if (cancelled) return;
        setMessages(
          rawMsgs.map((m) => ({
            id: m.id,
            senderType: m.sender_type,
            originalText: m.original_text,
            createdAt: m.created_at,
          }))
        );
        // Mark as read
        await ApiService.post(`/conversations/${selectedId}/read`, {});
        fetchConversations();
      } catch {
        // ignore
      }
    };

    fetchMessages();
    return () => { cancelled = true; };
  }, [selectedId, fetchConversations]);

  // Real-time new messages
  useEffect(() => {
    if (!socket || !selectedId) return;
    const handler = (data: { conversationId?: string; originalText?: string; senderType?: string; id?: string; createdAt?: string }) => {
      // Use both camelCase and snake_case for safety depending on socket event structure
      const convId = data.conversationId;
      if (convId !== selectedId) return;
      const newMsg: Message = {
        id: data.id || crypto.randomUUID(),
        senderType: (data.senderType || "system") as Message["senderType"],
        originalText: data.originalText || "",
        createdAt: data.createdAt || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
      // Auto-read
      ApiService.post(`/conversations/${selectedId}/read`, {}).then(() => fetchConversations());
    };
    socket.on("message.new", handler);
    return () => { socket.off("message.new", handler); };
  }, [socket, selectedId, fetchConversations]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || !selectedId || sending) return;
    setSending(true);
    try {
      await ApiService.post(`/conversations/${selectedId}/messages`, { text: draft.trim() });
      setDraft("");
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.customer?.name?.toLowerCase().includes(search.toLowerCase()) ||
          c.customer?.phone?.includes(search)
      )
    : conversations;

  const selectedConv = conversations.find((c) => c.id === selectedId);

  return (
    <div className="owners-inbox-container">
      {/* Conversations List (left panel) */}
      <aside className={`owners-inbox-list ${selectedId ? "owners-hidden-mobile" : ""}`}>
        <div className="owners-inbox-list-header">
          <div className="owners-inbox-title">
            <Briefcase size={22} />
            <h2>Inbox Diretoria</h2>
          </div>
          <div className="owners-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar dono ou sócio..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="owners-inbox-items">
          {loading ? (
            <div className="owners-empty-state">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="owners-empty-state">
              <Users size={40} strokeWidth={1} />
              <p>Nenhuma conversa com diretoria</p>
              <span>Adicione donos ou sócios com a role OWNER</span>
            </div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className={`owners-inbox-item ${selectedId === conv.id ? "owners-active" : ""} ${conv.unreadCount > 0 ? "owners-unread" : ""}`}
                onClick={() => setSelectedId(conv.id)}
              >
                <div className="owners-item-avatar">
                  {conv.customer?.tag === "GROUP_STAFF" ? (
                    <Users size={20} />
                  ) : (
                    <Briefcase size={20} />
                  )}
                </div>
                <div className="owners-item-info">
                  <div className="owners-item-name-row">
                    <span className="owners-item-name">
                      {conv.customer?.name || conv.customer?.phone || "Dono"}
                    </span>
                    <span
                      className="owners-tag-badge"
                      style={{ background: tagColor(conv.customer?.tag), color: "#fff" }}
                    >
                      {tagLabel(conv.customer?.tag)}
                    </span>
                  </div>
                  <span className="owners-item-preview">
                    {conv.lastMessagePreview || "Sem mensagens"}
                  </span>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="owners-unread-badge">{conv.unreadCount}</span>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat Panel (right) */}
      <section className={`owners-chat-panel ${!selectedId ? "owners-hidden-mobile" : ""}`}>
        {selectedId ? (
          <>
            <div className="owners-chat-header">
              <button className="owners-back-btn" onClick={() => setSelectedId(null)}>
                <ArrowLeft size={20} />
              </button>
              <div className="owners-chat-header-info">
                <span className="owners-chat-name">
                  {selectedConv?.customer?.name || selectedConv?.customer?.phone || "Owner"}
                </span>
                <span
                  className="owners-tag-badge"
                  style={{ background: tagColor(selectedConv?.customer?.tag), color: "#fff" }}
                >
                  {tagLabel(selectedConv?.customer?.tag)}
                </span>
              </div>
              <button className="owners-create-os-btn" title="Criar Ordem de Serviço">
                <Wrench size={16} />
                <span>Nova O.S.</span>
              </button>
            </div>

            <div className="owners-chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`owners-msg owners-msg-${msg.senderType}`}>
                  <div className="owners-msg-bubble">
                    <p>{msg.originalText}</p>
                    <span className="owners-msg-time">
                      {new Date(msg.createdAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="owners-chat-input-bar">
              <textarea
                className="owners-chat-input"
                placeholder="Escreva para a diretoria..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
              />
              <button
                className="owners-send-btn"
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="owners-empty-chat">
            <Briefcase size={56} strokeWidth={1} />
            <h3>Inbox Diretoria</h3>
            <p>Selecione uma conversa com a diretoria para começar</p>
          </div>
        )}
      </section>
    </div>
  );
}
