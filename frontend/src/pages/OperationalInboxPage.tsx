// src/pages/OperationalInboxPage.tsx
// Isolated inbox that shows only STAFF/GROUP_STAFF conversations (operations scope)
import { useState, useEffect, useRef, useCallback } from "react";
import { ApiService } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import { Search, Send, ArrowLeft, Users, HardHat, Wrench } from "lucide-react";
import "./OperationalInboxPage.css";

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
  return "Staff";
}

function tagColor(tag?: string | null): string {
  if (tag === "GROUP_STAFF") return "var(--accent-info, #3b82f6)";
  if (tag === "STAFF") return "var(--accent-warning, #f59e0b)";
  return "var(--text-tertiary)";
}

export function OperationalInboxPage() {
  const [conversations, setConversations] = useState<StaffConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "groups">("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket } = useSocket();

  const fetchConversations = useCallback(async () => {
    try {
      const raw = await ApiService.get<RawConversation[]>("/conversations?scope=operations");
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
      } catch {
        // ignore
      }
    };

    fetchMessages();
    return () => { cancelled = true; };
  }, [selectedId]);

  // Real-time new messages
  useEffect(() => {
    if (!socket || !selectedId) return;
    const handler = (data: { conversation_id?: string; original_text?: string; sender_type?: string; id?: string; created_at?: string }) => {
      if (data.conversation_id !== selectedId) return;
      const newMsg: Message = {
        id: data.id || crypto.randomUUID(),
        senderType: (data.sender_type || "system") as Message["senderType"],
        originalText: data.original_text || "",
        createdAt: data.created_at || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newMsg]);
    };
    socket.on("message.new", handler);
    return () => { socket.off("message.new", handler); };
  }, [socket, selectedId]);

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

  const filtered = conversations.filter((c) => {
    if (activeTab === "unread" && c.unreadCount === 0) return false;
    if (activeTab === "groups" && c.customer?.tag !== "GROUP_STAFF") return false;
    if (search) {
      const q = search.toLowerCase();
      return c.customer?.name?.toLowerCase().includes(q) || c.customer?.phone?.includes(q);
    }
    return true;
  });

  const selectedConv = conversations.find((c) => c.id === selectedId);

  return (
    <div className="ops-inbox-container">
      {/* Conversations List (left panel) */}
      <aside className={`ops-inbox-list ${selectedId ? "ops-hidden-mobile" : ""}`}>
        <div className="ops-inbox-list-header">
          <div className="ops-inbox-title">
            <HardHat size={22} />
            <h2>Inbox Operacional</h2>
          </div>
          <div className="ops-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar equipe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ops-tabs">
            <button
              className={`ops-tab ${activeTab === "all" ? "ops-tab-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              Todos
            </button>
            <button
              className={`ops-tab ${activeTab === "unread" ? "ops-tab-active" : ""}`}
              onClick={() => setActiveTab("unread")}
            >
              Não Lidos
              {conversations.filter(c => c.unreadCount > 0).length > 0 && (
                <span className="ops-tab-badge">
                  {conversations.filter(c => c.unreadCount > 0).length}
                </span>
              )}
            </button>
            <button
              className={`ops-tab ${activeTab === "groups" ? "ops-tab-active" : ""}`}
              onClick={() => setActiveTab("groups")}
            >
              Grupos
            </button>
          </div>
        </div>

        <div className="ops-inbox-items">
          {loading ? (
            <div className="ops-empty-state">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="ops-empty-state">
              <Users size={40} strokeWidth={1} />
              <p>Nenhuma conversa operacional</p>
              <span>Adicione membros da equipe ou grupos WhatsApp</span>
            </div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className={`ops-inbox-item ${selectedId === conv.id ? "ops-active" : ""} ${conv.unreadCount > 0 ? "ops-unread" : ""}`}
                onClick={() => setSelectedId(conv.id)}
              >
                <div className="ops-item-avatar">
                  {conv.customer?.tag === "GROUP_STAFF" ? (
                    <Users size={20} />
                  ) : (
                    <HardHat size={20} />
                  )}
                </div>
                <div className="ops-item-info">
                  <div className="ops-item-name-row">
                    <span className="ops-item-name">
                      {conv.customer?.name || conv.customer?.phone || "Staff"}
                    </span>
                    <span
                      className="ops-tag-badge"
                      style={{ background: tagColor(conv.customer?.tag), color: "#fff" }}
                    >
                      {tagLabel(conv.customer?.tag)}
                    </span>
                  </div>
                  <span className="ops-item-preview">
                    {conv.lastMessagePreview || "Sem mensagens"}
                  </span>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="ops-unread-badge">{conv.unreadCount}</span>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat Panel (right) */}
      <section className={`ops-chat-panel ${!selectedId ? "ops-hidden-mobile" : ""}`}>
        {selectedId ? (
          <>
            <div className="ops-chat-header">
              <button className="ops-back-btn" onClick={() => setSelectedId(null)}>
                <ArrowLeft size={20} />
              </button>
              <div className="ops-chat-header-info">
                <span className="ops-chat-name">
                  {selectedConv?.customer?.name || selectedConv?.customer?.phone || "Staff"}
                </span>
                <span
                  className="ops-tag-badge"
                  style={{ background: tagColor(selectedConv?.customer?.tag), color: "#fff" }}
                >
                  {tagLabel(selectedConv?.customer?.tag)}
                </span>
              </div>
              <button className="ops-create-os-btn" title="Criar Ordem de Serviço">
                <Wrench size={16} />
                <span>Nova O.S.</span>
              </button>
            </div>

            <div className="ops-chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`ops-msg ops-msg-${msg.senderType}`}>
                  <div className="ops-msg-bubble">
                    <p>{msg.originalText}</p>
                    <span className="ops-msg-time">
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

            <div className="ops-chat-input-bar">
              <textarea
                className="ops-chat-input"
                placeholder="Responder ao staff..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                rows={1}
              />
              <button
                className="ops-send-btn"
                onClick={sendMessage}
                disabled={!draft.trim() || sending}
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="ops-empty-chat">
            <HardHat size={56} strokeWidth={1} />
            <h3>Inbox Operacional</h3>
            <p>Selecione uma conversa com a equipe para começar</p>
          </div>
        )}
      </section>
    </div>
  );
}
