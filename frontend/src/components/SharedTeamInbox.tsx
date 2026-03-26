// src/components/SharedTeamInbox.tsx
// Full-featured inbox for team/staff/owners scopes — identical chat features to InboxPage.
// Each scope-specific page (OperationalInboxPage, OwnersInboxPage) is a thin wrapper.
import { useState, useEffect, useRef, useCallback } from "react";
import { ApiService, API_URL } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import {
  Search, Send, ArrowLeft, Check, CheckCheck, Loader2,
  Sparkles, Camera, MessageCircle, Volume2, ChevronDown, Globe,
  Trash2, Zap, FileText, Paperclip, MoreVertical, X, Mail, ClipboardList,
  Wand2,
} from "lucide-react";
import "@/pages/InboxPage.css";
import { AudioRecorder } from "@/components/AudioRecorder";
import { SecureMedia } from "@/components/common/SecureMedia";
import { ServiceOrderModal } from "@/components/ServiceOrderModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Conversation = {
  id: string;
  customer: { phone: string; name?: string | null; email?: string | null; profilePictureUrl?: string | null } | null;
  channel: string;
  status: string;
  updatedAt: string;
  unreadCount: number;
  lastMessagePreview: string | null;
};

type Message = {
  id: string;
  senderType: "customer" | "agent" | "system";
  originalText: string;
  createdAt: string;
  status?: "sent" | "delivered" | "read";
  attachments?: Array<{
    id: string;
    type: "image" | "video" | "audio" | "document";
    sourceUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
  }>;
  suggestion?: { id: string; suggestionText: string; wasUsed: boolean };
  translatedTo?: string;
};

type QuickReply = { id: string; title: string; body: string; shortcut: string | null };

type RawConversation = {
  id: string; channel: string; status: string; updated_at: string;
  customer: { phone: string; name: string | null; email?: string | null; profile_picture_url?: string | null } | null;
  unread_count?: number; last_message_preview?: string | null;
};

type RawMessage = {
  id: string; sender_type: "customer" | "agent" | "system"; original_text: string;
  created_at: string; status?: string;
  attachments?: Array<{ id: string; type: "image"|"video"|"audio"|"document"; source_url?: string|null; file_name?: string|null; mime_type?: string|null }>;
  translations?: Array<{ target_language: string; translated_text: string }>;
};

// ─── Config ──────────────────────────────────────────────────────────────────

export type TeamInboxConfig = {
  scope: "operations" | "owners";
  title: string;
  icon: React.ReactNode;
  avatarFallback: (conv: Conversation) => React.ReactNode;
  tagLabel: (conv: Conversation) => string;
  tagColor: (conv: Conversation) => string;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  emptySubtitle: string;
  inputPlaceholder: string;
  tabs: Array<"all" | "unread" | "groups">;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function channelIcon(channel: string) {
  if (channel === "instagram") return <Camera size={14} />;
  if (channel === "whatsapp") return <MessageCircle size={14} />;
  return null;
}

function mapConversation(raw: RawConversation): Conversation {
  return {
    id: raw.id,
    customer: raw.customer
      ? { phone: raw.customer.phone, name: raw.customer.name, email: raw.customer.email, profilePictureUrl: raw.customer.profile_picture_url }
      : null,
    channel: raw.channel, status: raw.status, updatedAt: raw.updated_at,
    unreadCount: raw.unread_count || 0, lastMessagePreview: raw.last_message_preview || null,
  };
}

function mapMessage(raw: RawMessage): Message {
  const translation = raw.translations?.[0];
  return {
    id: raw.id, senderType: raw.sender_type,
    originalText: translation ? translation.translated_text : raw.original_text,
    createdAt: raw.created_at,
    status: (raw.status as Message["status"]) || "sent",
    attachments: raw.attachments?.map((a) => ({
      id: a.id, type: a.type, sourceUrl: a.source_url, fileName: a.file_name, mimeType: a.mime_type,
    })),
    translatedTo: translation?.target_language,
  };
}

const MEDIA_PLACEHOLDER_RE = /^\[(image|video|audio|document)\]$/i;

function formatWhatsAppText(text: string): string {
  let s = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  s = s.replace(/\*([^\n*]+?)\*/g, "<strong>$1</strong>");
  s = s.replace(/_([^\n_]+?)_/g, "<em>$1</em>");
  s = s.replace(/~([^\n~]+?)~/g, "<del>$1</del>");
  s = s.replace(/`([^\n`]+?)`/g, "<code>$1</code>");
  s = s.replace(/\n/g, "<br/>");
  return s;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const LANGUAGE_CODE_MAP: Record<string, string> = {
  Portuguese: "pt", English: "en", Spanish: "es", French: "fr", German: "de",
};
const LANGUAGES = ["Original", "Portuguese", "English", "Spanish", "French", "German"];
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// ─── Main Component ───────────────────────────────────────────────────────────

export function SharedTeamInbox({ config }: { config: TeamInboxConfig }) {
  const { scope, title, icon, avatarFallback, tagLabel, tagColor, emptyIcon, emptyTitle, emptySubtitle, inputPlaceholder, tabs } = config;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "groups">("all");
  const [pendingCopilotIds, setPendingCopilotIds] = useState<Set<string>>(new Set());
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("Original");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showOsModal, setShowOsModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Email modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isLoadingEmailSuggestion, setIsLoadingEmailSuggestion] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuggestionError, setEmailSuggestionError] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);

  const { socket, joinConversation, leaveConversation } = useSocket();
  const prevConvRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchConversations = useCallback(() => {
    ApiService.get<RawConversation[]>(`/conversations?scope=${scope}`)
      .then((raw) => setConversations(raw.map(mapConversation)))
      .catch(console.error);
  }, [scope]);

  useEffect(() => {
    fetchConversations();
    ApiService.get<QuickReply[]>("/quick-replies").then(setQuickReplies).catch(console.error);
  }, [fetchConversations]);

  // Socket room
  useEffect(() => {
    if (prevConvRef.current) leaveConversation(prevConvRef.current);
    if (activeConversation) joinConversation(activeConversation);
    prevConvRef.current = activeConversation;
  }, [activeConversation, joinConversation, leaveConversation]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Close context menu
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Real-time socket events
  useEffect(() => {
    if (!socket) return;

    const onSuggestionReady = (data: { messageId: string; suggestion: { id: string; suggestionText: string; wasUsed: boolean } }) => {
      setPendingCopilotIds((prev) => { const s = new Set(prev); s.delete(data.messageId); return s; });
      setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, suggestion: data.suggestion } : m));
    };

    const onMessageNew = (data: RawMessage & { conversation_id: string }) => {
      if (data.conversation_id !== activeConversation) { fetchConversations(); return; }
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, mapMessage(data)];
      });
    };

    const onMessageDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const onMessageStatus = (data: { messageId: string; status: string }) => {
      setMessages((prev) => prev.map((m) => m.id === data.messageId ? { ...m, status: data.status as Message["status"] } : m));
    };

    socket.on("suggestion.ready", onSuggestionReady);
    socket.on("message.new", onMessageNew);
    socket.on("conversation.updated", fetchConversations);
    socket.on("conversation.new", fetchConversations);
    socket.on("message.deleted", onMessageDeleted);
    socket.on("message.status", onMessageStatus);

    return () => {
      socket.off("suggestion.ready", onSuggestionReady);
      socket.off("message.new", onMessageNew);
      socket.off("conversation.updated", fetchConversations);
      socket.off("conversation.new", fetchConversations);
      socket.off("message.deleted", onMessageDeleted);
      socket.off("message.status", onMessageStatus);
    };
  }, [socket, activeConversation, fetchConversations]);

  // Quick-reply "/" trigger
  useEffect(() => {
    setShowQuickReplies(replyText.startsWith("/"));
  }, [replyText]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const loadMessages = async (id: string) => {
    setActiveConversation(id);
    setPendingCopilotIds(new Set());
    setUsedSuggestionId(null);
    try {
      const raw = await ApiService.get<RawMessage[]>(`/conversations/${id}/messages`);
      setMessages(raw.map(mapMessage));
      setConversations((prev) => prev.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c));
      await ApiService.post(`/conversations/${id}/read`, {}).catch(() => {});
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!activeConversation) return;

    if (pendingFile) {
      setIsSending(true);
      try {
        const raw = await ApiService.uploadFile<RawMessage>(
          `/conversations/${activeConversation}/messages/media`,
          pendingFile, replyText.trim() || undefined,
        );
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === raw.id);
          const mapped = mapMessage(raw);
          if (idx >= 0) { const u = [...prev]; u[idx] = mapped; return u; }
          return [...prev, mapped];
        });
        setReplyText(""); setPendingFile(null);
      } catch (e: any) { alert(`Erro ao enviar arquivo: ${e.message}`); }
      finally { setIsSending(false); }
      return;
    }

    if (!replyText.trim()) return;
    setIsSending(true);
    try {
      const body: Record<string, unknown> = { text: replyText.trim() };
      if (usedSuggestionId) body.suggestion_id = usedSuggestionId;
      if (targetLanguage !== "Original") body.target_language = LANGUAGE_CODE_MAP[targetLanguage] || targetLanguage.toLowerCase();
      const raw = await ApiService.post<RawMessage>(`/conversations/${activeConversation}/messages`, body);
      const mapped = mapMessage(raw);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === mapped.id);
        if (idx >= 0) { const u = [...prev]; u[idx] = mapped; return u; }
        return [...prev, mapped];
      });
      setReplyText(""); setUsedSuggestionId(null); setShowQuickReplies(false);
    } catch (e: any) { alert(`Erro ao enviar mensagem: ${e.message}`); }
    finally { setIsSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((replyText.trim() || pendingFile) && !isSending) handleSendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  };

  const handleCopilotRequest = async (messageId: string) => {
    if (!activeConversation) return;
    setPendingCopilotIds((prev) => new Set(prev).add(messageId));
    try {
      await ApiService.post(`/conversations/${activeConversation}/suggestion`, { message_id: messageId });
    } catch (e: any) {
      alert(`Erro ao solicitar sugestão: ${e.message}`);
      setPendingCopilotIds((prev) => { const s = new Set(prev); s.delete(messageId); return s; });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeConversation) return;
    try {
      await ApiService.delete(`/conversations/${activeConversation}/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) { console.error(e); }
    setContextMenu(null);
  };

  const handleCloseConversation = async () => {
    if (!activeConversation || !confirm("Deseja fechar esta conversa?")) return;
    try {
      await ApiService.patch(`/conversations/${activeConversation}/status`, { status: "closed" });
      setActiveConversation(null); setMessages([]); fetchConversations();
    } catch (e) { console.error(e); }
    setShowChatMenu(false);
  };

  const handleDeleteConversation = async () => {
    if (!activeConversation || !confirm("Apagar conversa? Todas as mensagens serão excluídas permanentemente.")) return;
    try {
      await ApiService.delete(`/conversations/${activeConversation}`);
      setActiveConversation(null); setMessages([]); fetchConversations();
    } catch (e) { console.error(e); }
    setShowChatMenu(false);
  };

  // Polish text with AI
  const handlePolishText = async () => {
    if (!activeConversation || !replyText.trim()) return;
    setIsPolishing(true);
    try {
      const res = await ApiService.post<{ polished_text: string }>(
        `/conversations/${activeConversation}/polish-text`,
        { text: replyText.trim() }
      );
      if (res.polished_text) setReplyText(res.polished_text);
    } catch (err) {
      console.error("Polish failed:", err);
    } finally {
      setIsPolishing(false);
    }
  };

  // Secure media
  const handleOpenSecureMedia = async (url: string, fileName?: string | null) => {
    if (!url) return;
    const openBlob = (blobUrl: string, type: string) => {
      if (type.startsWith("image/") || type.startsWith("video/")) {
        window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl; a.download = fileName || "attachment";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
    };
    try {
      if (url.startsWith("data:")) {
        const mime = url.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
        openBlob(url, mime); return;
      }
      let endpoint = url;
      if (url.startsWith(API_URL)) endpoint = url.replace(API_URL, "");
      else if (url.startsWith("/api/v1")) endpoint = url.replace("/api/v1", "");
      const blob = await ApiService.getBlob(endpoint);
      openBlob(URL.createObjectURL(blob), blob.type);
    } catch { alert("Não foi possível abrir o arquivo com segurança."); }
  };

  // Email
  const fetchEmailSuggestion = async (convId: string, currentTo: string) => {
    setIsLoadingEmailSuggestion(true); setEmailSuggestionError(false);
    try {
      const res = await ApiService.post<{ subject: string; body: string; detectedEmail: string | null }>(
        `/conversations/${convId}/suggest-email`, {}
      );
      setEmailSubject(res.subject || ""); setEmailBody(res.body || "");
      if (res.detectedEmail && !currentTo) setEmailTo(res.detectedEmail);
    } catch { setEmailSuggestionError(true); }
    finally { setIsLoadingEmailSuggestion(false); }
  };

  const handleOpenEmailModal = () => {
    const activeConv = conversations.find((c) => c.id === activeConversation);
    let to = activeConv?.customer?.email || "";
    if (!to) {
      for (const msg of [...messages].reverse()) {
        const match = msg.originalText?.match(EMAIL_REGEX);
        if (match) { to = match[0]; break; }
      }
    }
    setEmailTo(to); setEmailSubject(""); setEmailBody(""); setEmailError(null);
    setEmailSuggestionError(false); setShowEmailModal(true);
    if (activeConversation) fetchEmailSuggestion(activeConversation, to);
  };

  const handleSendEmail = async () => {
    if (!activeConversation || !emailSubject.trim() || !emailBody.trim()) return;
    setIsSendingEmail(true); setEmailError(null);
    try {
      await ApiService.post(`/conversations/${activeConversation}/send-email`, {
        to: emailTo.trim() || undefined, subject: emailSubject.trim(), body: emailBody.trim(),
      });
      setShowEmailModal(false); setEmailTo(""); setEmailSubject(""); setEmailBody("");
    } catch (e: any) { setEmailError(e?.message || "Falha ao enviar email."); }
    finally { setIsSendingEmail(false); }
  };

  // ── Renderers ──────────────────────────────────────────────────────────────

  const renderAttachments = (msg: Message) => {
    if (!msg.attachments?.length) return null;
    return (
      <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
        {msg.attachments.map((a) => {
          if (a.type === "image" && a.sourceUrl) return (
            <div key={a.id} className="media-clickable" onClick={() => handleOpenSecureMedia(a.sourceUrl!, a.fileName)} style={{ cursor: "pointer" }}>
              <SecureMedia src={a.sourceUrl} type="image" alt={a.fileName || "Image"} style={{ maxWidth: "220px", borderRadius: "12px", display: "block" }} />
            </div>
          );
          if (a.type === "video" && a.sourceUrl) return (
            <SecureMedia key={a.id} type="video" src={a.sourceUrl} style={{ maxWidth: "260px", borderRadius: "12px" }} />
          );
          if (a.type === "audio" && a.sourceUrl) return (
            <SecureMedia key={a.id} type="audio" src={a.sourceUrl} />
          );
          return (
            <button key={a.id} onClick={() => handleOpenSecureMedia(a.sourceUrl!, a.fileName)}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--border-color)", background: "var(--surface-secondary)", color: "var(--text-primary)", cursor: "pointer" }}>
              <FileText size={16} /><span>{a.fileName || `${a.type} attachment`}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderMessageText = (msg: Message) => {
    if (msg.attachments?.length && MEDIA_PLACEHOLDER_RE.test(msg.originalText.trim())) return null;
    return <div className="message-text-formatted" dangerouslySetInnerHTML={{ __html: formatWhatsAppText(msg.originalText) }} />;
  };

  // ── Filtering ──────────────────────────────────────────────────────────────

  const activeConv = conversations.find((c) => c.id === activeConversation);

  const filtered = conversations
    .filter((c) => {
      if (activeTab === "unread" && c.unreadCount === 0) return false;
      if (activeTab === "groups" && !c.customer?.phone?.includes("@g.us")) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (c.customer?.name?.toLowerCase().includes(q) || c.customer?.phone?.includes(q)) ?? false;
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const filteredQR = showQuickReplies
    ? quickReplies.filter((qr) => {
        if (!replyText.startsWith("/")) return true;
        const s = replyText.slice(1).toLowerCase();
        return qr.title.toLowerCase().includes(s) || (qr.shortcut?.toLowerCase().includes(s) ?? false);
      })
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`inbox-container glass-panel ${activeConversation ? "show-chat" : ""}`}>
      {/* ── Left panel ─────────────────────────────────────── */}
      <div className="inbox-sidebar">
        <div className="inbox-header flex flex-col gap-3">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {icon}
            <h3 style={{ margin: 0 }}>{title}</h3>
          </div>
          <div className="search-bar">
            <Search size={16} />
            <input type="text" placeholder="Buscar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          {tabs.length > 1 && (
            <div className="flex bg-[var(--surface-tertiary)] p-1 rounded-lg gap-0.5">
              {tabs.includes("all") && (
                <button
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === "all" ? "bg-[var(--surface-primary)] shadow-sm font-medium" : "text-muted hover:text-[var(--text-primary)]"}`}
                  onClick={() => setActiveTab("all")}
                >Todos</button>
              )}
              {tabs.includes("unread") && (
                <button
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${activeTab === "unread" ? "bg-[var(--surface-primary)] shadow-sm font-medium" : "text-muted hover:text-[var(--text-primary)]"}`}
                  onClick={() => setActiveTab("unread")}
                >
                  Não Lidos
                  {conversations.filter((c) => c.unreadCount > 0).length > 0 && (
                    <span className="inline-flex items-center justify-center bg-[var(--accent-primary)] text-white text-[10px] font-bold rounded-full w-4 h-4">
                      {conversations.filter((c) => c.unreadCount > 0).length}
                    </span>
                  )}
                </button>
              )}
              {tabs.includes("groups") && (
                <button
                  className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === "groups" ? "bg-[var(--surface-primary)] shadow-sm font-medium" : "text-muted hover:text-[var(--text-primary)]"}`}
                  onClick={() => setActiveTab("groups")}
                >Grupos</button>
              )}
            </div>
          )}
        </div>

        <div className="conversations-list">
          {filtered.length === 0 ? (
            <div className="empty-state-list" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", padding: "3rem 1rem", color: "var(--text-tertiary)" }}>
              {emptyIcon}
              <p style={{ margin: 0, fontWeight: 600 }}>{emptyTitle}</p>
              <span style={{ fontSize: "0.8rem", textAlign: "center" }}>{emptySubtitle}</span>
            </div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-card ${activeConversation === conv.id ? "active" : ""} ${conv.unreadCount > 0 ? "has-unread" : ""}`}
                onClick={() => loadMessages(conv.id)}
              >
                <div className="conv-avatar">
                  {conv.customer?.profilePictureUrl ? (
                    <img src={conv.customer.profilePictureUrl} alt="" className="conv-avatar-img" />
                  ) : avatarFallback(conv)}
                </div>
                <div className="conv-details">
                  <div className="conv-header">
                    <span className="conv-name">{conv.customer?.name || conv.customer?.phone || "—"}</span>
                    <div className="conv-header-right">
                      {conv.unreadCount > 0 && <span className="unread-badge">{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>}
                      <span className="conv-time">{new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <div className="conv-preview text-ellipsis" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 600, padding: "0.1rem 0.4rem", borderRadius: "4px", background: tagColor(conv), color: "#fff", whiteSpace: "nowrap" }}>
                      {tagLabel(conv)}
                    </span>
                    <span className="truncate text-muted">{conv.lastMessagePreview || "Sem mensagens"}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel (chat) ──────────────────────────────── */}
      <div className="chat-area">
        {!activeConversation ? (
          <div className="empty-chat flex-center">
            <div className="empty-chat-content">
              {emptyIcon}
              <h2>{emptyTitle}</h2>
              <p>Selecione uma conversa para começar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="chat-header">
              <button className="chat-back-btn" onClick={() => { setActiveConversation(null); setMessages([]); }}>
                <ArrowLeft size={20} />
              </button>
              <div className="chat-header-avatar">
                {activeConv?.customer?.profilePictureUrl ? (
                  <img src={activeConv.customer.profilePictureUrl} alt="" className="header-avatar-img" />
                ) : (
                  <div className="header-avatar-fallback">{activeConv?.customer?.name?.charAt(0) || "?"}</div>
                )}
              </div>
              <div className="chat-contact-info">
                <h3>{channelIcon(activeConv?.channel || "")} {activeConv?.customer?.name || "—"}</h3>
                <span className={`status-indicator ${activeConv?.status || ""}`}>
                  {tagLabel(activeConv!)}
                </span>
              </div>
              <div className="chat-header-actions">
                <div className="chat-menu-wrapper">
                  <button className="icon-btn-header" onClick={() => setShowChatMenu(!showChatMenu)} title="Opções">
                    <MoreVertical size={18} />
                  </button>
                  {showChatMenu && (
                    <div className="chat-menu-dropdown glass-panel">
                      <button className="chat-menu-item" onClick={() => { setShowChatMenu(false); setShowOsModal(true); }}>
                        <ClipboardList size={14} /> Abrir O.S.
                      </button>
                      <button className="chat-menu-item" onClick={handleOpenEmailModal}>
                        <Mail size={14} /> Enviar por email
                      </button>
                      <button className="chat-menu-item" onClick={handleCloseConversation}>
                        <X size={14} /> Fechar conversa
                      </button>
                      <button className="chat-menu-item danger" onClick={handleDeleteConversation}>
                        <Trash2 size={14} /> Apagar conversa
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-wrapper ${msg.senderType}`}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, messageId: msg.id }); }}
                >
                  <div className="message-bubble">
                    {renderMessageText(msg)}
                    {renderAttachments(msg)}
                    {msg.translatedTo && (
                      <div className="translation-badge">
                        <Sparkles size={12} /> Traduzido para {msg.translatedTo}
                      </div>
                    )}
                    <div className="message-meta">
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {msg.senderType === "agent" && (
                        msg.status === "read" ? <CheckCheck size={14} className="status-read" />
                        : msg.status === "delivered" ? <CheckCheck size={14} className="status-delivered" />
                        : <Check size={14} className="status-sent" />
                      )}
                    </div>
                  </div>

                  {/* Copilot */}
                  {msg.senderType === "customer" && !msg.suggestion && (
                    <button className="copilot-action-btn" onClick={() => handleCopilotRequest(msg.id)} disabled={pendingCopilotIds.has(msg.id)}>
                      {pendingCopilotIds.has(msg.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {pendingCopilotIds.has(msg.id) ? "AI Thinking..." : "Copilot Suggestion"}
                    </button>
                  )}
                  {msg.suggestion && (
                    <div className="copilot-suggestion-card">
                      <div className="suggestion-header"><Sparkles size={14} /> AI Suggestion</div>
                      <p>{msg.suggestion.suggestionText}</p>
                      <div className="suggestion-actions" style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                        <button className="use-suggestion-btn" onClick={() => { setReplyText(msg.suggestion!.suggestionText); setUsedSuggestionId(msg.suggestion!.id); }}>
                          Use this draft
                        </button>
                        <button
                          className="use-suggestion-btn secondary"
                          style={{ background: "transparent", border: "1px solid var(--border-color)", color: "var(--text-secondary)" }}
                          onClick={async (e) => {
                            const btn = e.currentTarget; const orig = btn.innerText;
                            btn.innerText = "Loading..."; btn.disabled = true;
                            try {
                              const token = localStorage.getItem("conversia_token");
                              const res = await fetch(`${API_URL}/audio/synthesize`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                                body: JSON.stringify({ text: msg.suggestion!.suggestionText }),
                              });
                              if (!res.ok) throw new Error();
                              const blob = await res.blob();
                              new Audio(URL.createObjectURL(blob)).play();
                            } catch { alert("Falha ao reproduzir áudio"); }
                            finally { btn.innerText = orig; btn.disabled = false; }
                          }}
                        >
                          <Volume2 size={16} style={{ marginRight: "6px" }} /> Speak
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
              {pendingFile && (
                <div className="attachment-preview">
                  {pendingFile.type.startsWith("image/") ? (
                    <img src={URL.createObjectURL(pendingFile)} alt="" className="attachment-preview-thumb" />
                  ) : (
                    <div className="attachment-preview-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Paperclip size={20} />
                    </div>
                  )}
                  <div className="attachment-preview-info">
                    <span className="attachment-preview-name">{pendingFile.name}</span>
                    <span className="attachment-preview-size">{formatFileSize(pendingFile.size)}</span>
                  </div>
                  <button className="attachment-remove-btn" onClick={() => setPendingFile(null)}><X size={16} /></button>
                </div>
              )}

              <div className="chat-input-row">
                <AudioRecorder
                  disabled={isSending}
                  onUpload={(blob) => ApiService.uploadAudio("/audio/transcribe", blob)}
                  onTranscription={(text) => setReplyText((prev) => prev ? `${prev} ${text}` : text)}
                />
                <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Enviar arquivo">
                  <Paperclip size={18} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: "none" }} onChange={handleFileSelect} />
                <button className="quick-reply-btn" onClick={() => setShowQuickReplies(!showQuickReplies)} title="Respostas rápidas">
                  <Zap size={18} />
                </button>
                <div className="language-selector-wrapper">
                  <button className="lang-toggle-btn" onClick={() => setShowLangMenu(!showLangMenu)} title="Idioma de saída">
                    <Globe size={18} />
                    <span className="lang-toggle-text">{targetLanguage === "Original" ? "Auto" : targetLanguage.substring(0, 3).toUpperCase()}</span>
                    <ChevronDown size={14} />
                  </button>
                  {showLangMenu && (
                    <div className="lang-menu glass-panel">
                      {LANGUAGES.map((lang) => (
                        <button key={lang} className={`lang-option ${targetLanguage === lang ? "active" : ""}`}
                          onClick={() => { setTargetLanguage(lang); setShowLangMenu(false); }}>
                          {lang === "Original" ? "Auto / Original" : lang}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {showQuickReplies && filteredQR.length > 0 && (
                  <div className="quick-replies-popup glass-panel">
                    {filteredQR.map((qr) => (
                      <button key={qr.id} className="quick-reply-option" onClick={() => { setReplyText(qr.body); setShowQuickReplies(false); }}>
                        <span className="qr-title">{qr.title}</span>
                        {qr.shortcut && <span className="qr-shortcut">/{qr.shortcut}</span>}
                        <span className="qr-preview">{qr.body.substring(0, 60)}{qr.body.length > 60 ? "..." : ""}</span>
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  placeholder={inputPlaceholder}
                  value={replyText}
                  onChange={(e) => { setReplyText(e.target.value); setUsedSuggestionId(null); }}
                  onKeyDown={handleKeyDown}
                  disabled={isSending}
                  rows={Math.max(1, Math.min(5, replyText.split("\n").length))}
                  style={{ resize: "none", paddingTop: "12px", paddingBottom: "12px", lineHeight: "1.4" }}
                />
                {replyText.trim() && (
                  <button
                    className="attach-btn"
                    onClick={handlePolishText}
                    disabled={isPolishing || isSending}
                    title="Polir texto com IA (correção gramatical)"
                    style={{ color: isPolishing ? "var(--brand-primary)" : undefined }}
                  >
                    {isPolishing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                  </button>
                )}
                <button className="send-btn" disabled={(!replyText.trim() && !pendingFile) || isSending} onClick={handleSendMessage}>
                  {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── OS Modal ─────────────────────────────────────────── */}
      <ServiceOrderModal
        open={showOsModal}
        onClose={() => setShowOsModal(false)}
        onCreated={() => {}}
        conversationId={activeConversation ?? undefined}
      />

      {/* ── Context Menu ─────────────────────────────────────── */}
      {contextMenu && (
        <div className="message-context-menu glass-panel" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button className="context-menu-item danger" onClick={() => handleDeleteMessage(contextMenu.messageId)}>
            <Trash2 size={14} /> Apagar mensagem
          </button>
        </div>
      )}

      {/* ── Email Modal ──────────────────────────────────────── */}
      {showEmailModal && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="email-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="email-modal-header">
              <div className="email-modal-title-row">
                <div>
                  <div className="email-modal-title">Enviar por Email</div>
                  <div className="email-modal-subtitle">{activeConv?.customer?.name || "—"}</div>
                </div>
              </div>
              <button className="email-modal-close" onClick={() => setShowEmailModal(false)}><X size={16} /></button>
            </div>
            <div className="email-modal-body">
              {isLoadingEmailSuggestion && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent-primary)", marginBottom: "0.75rem", fontSize: "0.83rem" }}>
                  <Loader2 size={14} className="animate-spin" /> Gerando sugestão com IA...
                </div>
              )}
              {emailSuggestionError && <div className="email-modal-error" style={{ marginBottom: "0.5rem" }}>IA indisponível. Preencha manualmente.</div>}
              <div className="email-field-group">
                <label className="email-field-label">Para</label>
                <input className="email-input" type="email" placeholder="email@exemplo.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
              </div>
              <div className="email-field-group">
                <label className="email-field-label">Assunto</label>
                <input className="email-input" type="text" placeholder="Assunto do email" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>
              <div className="email-field-group">
                <label className="email-field-label">Mensagem</label>
                <textarea className="email-textarea" rows={8} placeholder="Corpo do email..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
              </div>
              {emailError && <div className="email-modal-error">{emailError}</div>}
              <div className="email-modal-footer">
                <button className="email-modal-cancel" onClick={() => setShowEmailModal(false)}>Cancelar</button>
                <button
                  className="email-modal-send"
                  disabled={isSendingEmail || isLoadingEmailSuggestion || !emailSubject.trim() || !emailBody.trim()}
                  onClick={handleSendEmail}
                >
                  {isSendingEmail ? <Loader2 size={14} className="animate-spin" /> : null}
                  {isSendingEmail ? "Enviando..." : "Enviar Email"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
