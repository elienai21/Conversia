import { useState, useEffect, useRef, useCallback } from "react";
import { ApiService, API_URL } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import "./InboxPage.css";
import { Search, Send, Bot, Check, CheckCheck, Loader2, Sparkles, ArrowLeft, MessageCircle, Camera, Volume2, Globe, ChevronDown, Trash2, Zap, FileText, Paperclip, MoreVertical, X, Mail } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";
import { SecureMedia } from "@/components/common/SecureMedia";

// Internal component types (camelCase)
type Conversation = {
  id: string;
  customer: { phone: string; name?: string | null; email?: string | null; profilePictureUrl?: string | null; role?: string } | null;
  channel: string;
  status: string;
  updatedAt: string;
  unreadCount: number;
  lastMessagePreview: string | null;
  priority?: string;
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
  suggestion?: {
    id: string;
    suggestionText: string;
    wasUsed: boolean;
  };
  translatedTo?: string;
  translatedFrom?: string;
};

type QuickReply = {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
};

// Raw API response types (snake_case from backend)
type RawConversation = {
  id: string;
  channel: string;
  status: string;
  updated_at: string;
  customer: { phone: string; name: string | null; email?: string | null; profile_picture_url?: string | null; role?: string } | null;
  unread_count?: number;
  last_message_preview?: string | null;
  priority?: string;
};

type RawTranslation = {
  target_language: string;
  translated_text: string;
  provider: string;
};

type RawMessage = {
  id: string;
  sender_type: "customer" | "agent" | "system";
  original_text: string;
  created_at: string;
  status?: string;
  attachments?: Array<{
    id: string;
    type: "image" | "video" | "audio" | "document";
    source_url?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
  }>;
  translations?: RawTranslation[];
};

function channelIcon(channel: string) {
  switch (channel) {
    case "instagram":
      return <Camera size={14} />;
    case "whatsapp":
      return <MessageCircle size={14} />;
    default:
      return null;
  }
}

function mapConversation(raw: RawConversation): Conversation {
  return {
    id: raw.id,
    customer: raw.customer
      ? { phone: raw.customer.phone, name: raw.customer.name, email: raw.customer.email, profilePictureUrl: raw.customer.profile_picture_url, role: raw.customer.role }
      : null,
    channel: raw.channel,
    status: raw.status,
    updatedAt: raw.updated_at,
    unreadCount: raw.unread_count || 0,
    lastMessagePreview: raw.last_message_preview || null,
    priority: raw.priority || "normal",
  };
}

const LANGUAGE_CODE_MAP: Record<string, string> = {
  Portuguese: "pt",
  English: "en",
  Spanish: "es",
  French: "fr",
  German: "de",
};

function mapMessage(raw: RawMessage): Message {
  const translation = raw.translations?.[0];

  return {
    id: raw.id,
    senderType: raw.sender_type,
    originalText: translation ? translation.translated_text : raw.original_text,
    createdAt: raw.created_at,
    status: (raw.status as Message["status"]) || "sent",
    attachments: raw.attachments?.map((attachment) => ({
      id: attachment.id,
      type: attachment.type,
      sourceUrl: normalizeAttachmentUrl(attachment.source_url),
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
    })),
    translatedTo: translation ? translation.target_language : undefined,
  };
}

function normalizeAttachmentUrl(sourceUrl?: string | null) {
  if (!sourceUrl) {
    return sourceUrl;
  }

  // Se for um caminho interno (/api/v1/...), retornamos como está.
  // O SecureMedia irá processar via ApiService.getBlob(endpoint) com Headers.
  if (sourceUrl.startsWith("/")) {
    return sourceUrl;
  }

  return sourceUrl;
}

  const handleOpenSecureMedia = async (url: string, fileName?: string | null) => {
    if (!url) return;

    const openBlobOrDownload = (blobUrl: string, type: string) => {
      if (type.startsWith("image/") || type.startsWith("video/")) {
        window.open(blobUrl, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName || "attachment";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    };

    try {
      // data URI: use directly (works for non-truncated URIs)
      if (url.startsWith("data:")) {
        const mimeMatch = url.match(/^data:([^;]+)/);
        const mime = mimeMatch?.[1] || "application/octet-stream";
        openBlobOrDownload(url, mime);
        return;
      }

      let endpoint = url;
      if (url.startsWith(API_URL)) {
        endpoint = url.replace(API_URL, "");
      } else if (url.startsWith("/api/v1")) {
        endpoint = url.replace("/api/v1", "");
      }

      const blob = await ApiService.getBlob(endpoint);
      const blobUrl = URL.createObjectURL(blob);
      openBlobOrDownload(blobUrl, blob.type);
    } catch (err) {
      console.error("Erro ao abrir mídia segura:", err);
      alert("Não foi possível abrir o arquivo com segurança.");
    }
  };

  const renderAttachments = (message: Message) => {
    if (!message.attachments?.length) {
      return null;
    }

    return (
      <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
        {message.attachments.map((attachment) => {
          if (attachment.type === "image" && attachment.sourceUrl) {
            return (
              <div 
                key={attachment.id} 
                className="media-clickable"
                onClick={() => handleOpenSecureMedia(attachment.sourceUrl!, attachment.fileName)}
                style={{ cursor: "pointer" }}
              >
                <SecureMedia
                  src={attachment.sourceUrl}
                  type="image"
                  alt={attachment.fileName || "Image attachment"}
                  style={{ maxWidth: "220px", borderRadius: "12px", display: "block" }}
                />
              </div>
            );
          }

          if (attachment.type === "video" && attachment.sourceUrl) {
            return (
              <SecureMedia
                key={attachment.id}
                type="video"
                src={attachment.sourceUrl}
                style={{ maxWidth: "260px", borderRadius: "12px" }}
              />
            );
          }

          if (attachment.type === "audio" && attachment.sourceUrl) {
            return (
              <SecureMedia
                key={attachment.id}
                type="audio"
                src={attachment.sourceUrl}
              />
            );
          }

          return (
            <button
              key={attachment.id}
              onClick={() => handleOpenSecureMedia(attachment.sourceUrl!, attachment.fileName)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid var(--border-color)",
                background: "var(--surface-secondary)",
                color: "var(--text-primary)",
                textDecoration: "none",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <FileText size={16} />
              <span>{attachment.fileName || `${attachment.type} attachment`}</span>
            </button>
          );
        })}
      </div>
    );
  }

const MEDIA_PLACEHOLDER_RE = /^\[(image|video|audio|document)\]$/i;

function renderMessageText(message: Message) {
  // Hide placeholder text like [image], [audio] when real attachments exist
  if (
    message.attachments?.length &&
    MEDIA_PLACEHOLDER_RE.test(message.originalText.trim())
  ) {
    return null;
  }

  const formatWhatsAppText = (text: string) => {
    let safeText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Monospace block: ```text```
    safeText = safeText.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Bold: *text*
    safeText = safeText.replace(/\*([^\n*]+?)\*/g, '<strong>$1</strong>');
    // Italic: _text_
    safeText = safeText.replace(/_([^\n_]+?)_/g, '<em>$1</em>');
    // Strikethrough: ~text~
    safeText = safeText.replace(/~([^\n~]+?)~/g, '<del>$1</del>');
    // Inline Code: `text`
    safeText = safeText.replace(/`([^\n`]+?)`/g, '<code>$1</code>');
    // Newlines
    safeText = safeText.replace(/\n/g, '<br/>');

    return safeText;
  };

  return (
    <div 
      className="message-text-formatted"
      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(message.originalText) }} 
    />
  );
}

// Notification sound (short beep)
const notificationSound = typeof window !== "undefined" ? new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdGaJjIuBdHB2cISMi4J0cHR0hIyLgnRwdHaEjIuCdHB0doSMi4J0cHR2hIyLgnRwdA==") : null;

export function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "unread" | "groups" | "urgent">("all");
  const [pendingCopilotIds, setPendingCopilotIds] = useState<Set<string>>(new Set());
  const [targetLanguage, setTargetLanguage] = useState("Original");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isLoadingEmailSuggestion, setIsLoadingEmailSuggestion] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuggestionError, setEmailSuggestionError] = useState(false);

  const LANGUAGES = ["Original", "Portuguese", "English", "Spanish", "French", "German"];

  const { socket, joinConversation, leaveConversation } = useSocket();
  const prevConversationRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(() => {
    ApiService.get<RawConversation[]>("/conversations")
      .then((raw) => setConversations(raw.map(mapConversation)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    fetchConversations();
    // Load quick replies
    ApiService.get<QuickReply[]>("/quick-replies")
      .then(setQuickReplies)
      .catch(console.error);
  }, [fetchConversations]);

  // Join/leave socket rooms when active conversation changes
  useEffect(() => {
    if (prevConversationRef.current) {
      leaveConversation(prevConversationRef.current);
    }
    if (activeConversation) {
      joinConversation(activeConversation);
    }
    prevConversationRef.current = activeConversation;
  }, [activeConversation, joinConversation, leaveConversation]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  // Listen for real-time events
  useEffect(() => {
    if (!socket) return;

    const handleSuggestionReady = (data: {
      messageId: string;
      suggestion: { id: string; suggestionText: string; wasUsed: boolean };
    }) => {
      setPendingCopilotIds((prev) => {
        const next = new Set(prev);
        next.delete(data.messageId);
        return next;
      });
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, suggestion: data.suggestion }
            : msg
        )
      );
    };

    const handleMessageNew = (data: RawMessage & { conversation_id: string; contact?: any }) => {
      // Play notification sound for customer messages not in the active conversation
      if (data.sender_type === "customer") {
        if (data.conversation_id !== activeConversation) {
          notificationSound?.play().catch(() => {});
        }
        
        // Show Push Notification if document is hidden or it's a different conversation
        if ("Notification" in window && Notification.permission === "granted") {
          if (document.hidden || data.conversation_id !== activeConversation) {
            const contactName = data.contact?.name || data.contact?.phone || "Novo Cliente";
            let previewText = data.original_text || "";
            if (!previewText && data.attachments?.length) {
              previewText = `[${data.attachments[0].type.toUpperCase()}] recebido`;
            }
            if (!previewText) previewText = "Nova mensagem recebida";
            
            new Notification(`Mensagem de ${contactName}`, {
              body: previewText,
              icon: "/favicon.ico",
              tag: `nova-mensagem-${data.conversation_id}`,
            });
          }
        }

        // Update unread counts in sidebar
        fetchConversations();
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, mapMessage(data)];
      });
    };

    const handleConversationUpdated = () => {
      fetchConversations();
    };

    const handleMessageDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const handleMessageStatus = (data: { messageId: string; status: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, status: data.status as Message["status"] } : m
        )
      );
    };

    socket.on("suggestion.ready", handleSuggestionReady);
    socket.on("message.new", handleMessageNew);
    socket.on("conversation.updated", handleConversationUpdated);
    socket.on("message.deleted", handleMessageDeleted);
    socket.on("message.status", handleMessageStatus);

    return () => {
      socket.off("suggestion.ready", handleSuggestionReady);
      socket.off("message.new", handleMessageNew);
      socket.off("conversation.updated", handleConversationUpdated);
      socket.off("message.deleted", handleMessageDeleted);
      socket.off("message.status", handleMessageStatus);
    };
  }, [socket, activeConversation, fetchConversations]);

  const loadMessages = async (id: string) => {
    setActiveConversation(id);
    setPendingCopilotIds(new Set());
    setUsedSuggestionId(null);
    try {
      const raw = await ApiService.get<RawMessage[]>(`/conversations/${id}/messages`);
      setMessages(raw.map(mapMessage));
      // Mark as read - update sidebar unread count
      setConversations((prev) =>
        prev.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c)
      );
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopilotRequest = async (messageId: string) => {
    if (!activeConversation) return;
    setPendingCopilotIds((prev) => new Set(prev).add(messageId));
    try {
      const res = await ApiService.post<{ status: string; job_id: string }>(
        `/conversations/${activeConversation}/suggestion`,
        { message_id: messageId }
      );
      console.log("Copilot job enqueued:", res.job_id);
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao solicitar sugestão: ${error.message}`);
      setPendingCopilotIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const handleUseSuggestion = (suggestionId: string, text: string) => {
    setReplyText(text);
    setUsedSuggestionId(suggestionId);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!activeConversation) return;
    try {
      await ApiService.delete(`/conversations/${activeConversation}/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e) {
      console.error(e);
    }
    setContextMenu(null);
  };

  const handleCloseConversation = async () => {
    if (!activeConversation) return;
    if (!confirm("Deseja fechar esta conversa?")) return;
    try {
      await ApiService.patch(`/conversations/${activeConversation}/status`, { status: "closed" });
      setActiveConversation(null);
      setMessages([]);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
    setShowChatMenu(false);
  };

  const handleDeleteConversation = async () => {
    if (!activeConversation) return;
    if (!confirm("Deseja apagar esta conversa? Todas as mensagens serão excluídas permanentemente.")) return;
    try {
      await ApiService.delete(`/conversations/${activeConversation}`);
      setActiveConversation(null);
      setMessages([]);
      fetchConversations();
    } catch (e) {
      console.error(e);
    }
    setShowChatMenu(false);
  };

  const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

  const fetchEmailSuggestion = async (conversationId: string, currentTo: string) => {
    setIsLoadingEmailSuggestion(true);
    setEmailSuggestionError(false);
    try {
      const res = await ApiService.post<{ subject: string; body: string; detectedEmail: string | null }>(
        `/conversations/${conversationId}/suggest-email`,
        {}
      );
      setEmailSubject(res.subject || "");
      setEmailBody(res.body || "");
      if (res.detectedEmail && !currentTo) setEmailTo(res.detectedEmail);
    } catch {
      setEmailSuggestionError(true);
    } finally {
      setIsLoadingEmailSuggestion(false);
    }
  };

  const handleOpenEmailModal = () => {
    // Detect email from customer profile or from message history (most recent first)
    let detectedTo = activeConv?.customer?.email || "";
    if (!detectedTo) {
      for (const msg of [...messages].reverse()) {
        const match = msg.originalText?.match(EMAIL_REGEX);
        if (match) { detectedTo = match[0]; break; }
      }
    }
    setEmailTo(detectedTo);
    setEmailSubject("");
    setEmailBody("");
    setEmailError(null);
    setEmailSuggestionError(false);
    setShowEmailModal(true);
    setShowChatMenu(false);
    if (activeConversation) fetchEmailSuggestion(activeConversation, detectedTo);
  };

  const handleSendEmail = async () => {
    if (!activeConversation || !emailSubject.trim() || !emailBody.trim()) return;
    setIsSendingEmail(true);
    setEmailError(null);
    try {
      await ApiService.post(`/conversations/${activeConversation}/send-email`, {
        to: emailTo.trim() || undefined,
        subject: emailSubject.trim(),
        body: emailBody.trim(),
      });
      setShowEmailModal(false);
      setEmailTo("");
      setEmailSubject("");
      setEmailBody("");
    } catch (err: any) {
      setEmailError(err?.message || "Falha ao enviar email.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeConversation) return;

    // If there's a pending file, send as media
    if (pendingFile) {
      setIsSending(true);
      try {
        const raw = await ApiService.uploadFile<RawMessage>(
          `/conversations/${activeConversation}/messages/media`,
          pendingFile,
          replyText.trim() || undefined,
        );
        const newMsg = mapMessage(raw);
        setMessages((prev) => {
          // Upsert: se o socket já adicionou antes do retorno HTTP, atualiza em vez de duplicar
          const idx = prev.findIndex((m) => m.id === newMsg.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = newMsg;
            return updated;
          }
          return [...prev, newMsg];
        });
        setReplyText("");
        setPendingFile(null);
      } catch (error: any) {
        console.error(error);
        alert(`Erro ao enviar arquivo: ${error.message}`);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!replyText.trim()) return;
    setIsSending(true);

    try {
      const body: { text: string; suggestion_id?: string; target_language?: string } = {
        text: replyText.trim(),
      };
      if (usedSuggestionId) {
        body.suggestion_id = usedSuggestionId;
      }
      if (targetLanguage !== "Original") {
        body.target_language = LANGUAGE_CODE_MAP[targetLanguage] || targetLanguage.toLowerCase();
      }

      const raw = await ApiService.post<RawMessage>(
        `/conversations/${activeConversation}/messages`,
        body
      );

      const newMsg = mapMessage(raw);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === newMsg.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = newMsg;
          return updated;
        }
        return [...prev, newMsg];
      });
      setReplyText("");
      setUsedSuggestionId(null);
      setShowQuickReplies(false);
    } catch (error: any) {
      console.error(error);
      alert(`Erro ao enviar mensagem: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((replyText.trim() || pendingFile) && !isSending) {
        handleSendMessage();
      }
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId });
  };

  const filteredConversations = conversations
    .filter((conv) => {
      if (activeTab === "urgent" && conv.priority !== "urgent") return false;
      if (activeTab === "unread" && conv.unreadCount === 0) return false;
      if (activeTab === "groups" && !conv.customer?.phone?.includes("@g.us")) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = conv.customer?.name?.toLowerCase() || "";
      const phone = conv.customer?.phone?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
      // Urgent items always on top if in "all" tab, else fallback to latest
      if (activeTab === "all") {
        if (a.priority === "urgent" && b.priority !== "urgent") return -1;
        if (b.priority === "urgent" && a.priority !== "urgent") return 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    });

  const activeConv = conversations.find(c => c.id === activeConversation);

  // Filter quick replies based on input text (show when typing "/" or when picker is open)
  const filteredQuickReplies = showQuickReplies
    ? quickReplies.filter((qr) => {
        if (!replyText.startsWith("/")) return true;
        const search = replyText.slice(1).toLowerCase();
        return qr.title.toLowerCase().includes(search) || (qr.shortcut?.toLowerCase().includes(search) ?? false);
      })
    : [];

  // Detect "/" prefix to show quick replies
  useEffect(() => {
    if (replyText.startsWith("/")) {
      setShowQuickReplies(true);
    } else {
      setShowQuickReplies(false);
    }
  }, [replyText]);

  return (
    <div className={`inbox-container glass-panel ${activeConversation ? "show-chat" : ""}`}>
      {/* Sidebar - Conversation List */}
      <div className="inbox-sidebar">
        <div className="inbox-header flex flex-col gap-3">
          <h3>Mensagens</h3>
          <div className="search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex bg-[var(--surface-tertiary)] p-1 rounded-lg gap-0.5">
            <button
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'all' ? 'bg-[var(--surface-primary)] shadow-sm font-medium' : 'text-muted hover:text-[var(--text-primary)]'}`}
              onClick={() => setActiveTab('all')}
            >
              Todos
            </button>
            <button
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${activeTab === 'unread' ? 'bg-[var(--surface-primary)] shadow-sm font-medium' : 'text-muted hover:text-[var(--text-primary)]'}`}
              onClick={() => setActiveTab('unread')}
            >
              Não Lidos
              {conversations.filter(c => c.unreadCount > 0).length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-[var(--accent-error)] text-white font-bold">
                  {conversations.filter(c => c.unreadCount > 0).length}
                </span>
              )}
            </button>
            <button
              className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${activeTab === 'groups' ? 'bg-[var(--surface-primary)] shadow-sm font-medium' : 'text-muted hover:text-[var(--text-primary)]'}`}
              onClick={() => setActiveTab('groups')}
            >
              Grupos
            </button>
            <button
              className={`flex-1 text-xs sm:text-sm py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${activeTab === 'urgent' ? 'bg-red-500/10 text-red-500 shadow-sm font-medium' : 'text-muted hover:text-red-400'}`}
              onClick={() => setActiveTab('urgent')}
            >
              🔥
            </button>
          </div>
        </div>

        <div className="conversations-list">
          {conversations.length === 0 ? (
             <div className="empty-state-list">No active conversations</div>
          ) : filteredConversations.length === 0 ? (
             <div className="empty-state-list">No results found</div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-card ${activeConversation === conv.id ? 'active' : ''} ${conv.unreadCount > 0 ? 'has-unread' : ''} ${conv.priority === 'urgent' ? 'urgent-priority' : ''}`}
                onClick={() => loadMessages(conv.id)}
              >
                <div className="conv-avatar">
                  {conv.customer?.profilePictureUrl ? (
                    <img src={conv.customer.profilePictureUrl} alt="" className="conv-avatar-img" />
                  ) : (
                    conv.customer?.name?.charAt(0) || <Bot size={20}/>
                  )}
                </div>
                <div className="conv-details">
                  <div className="conv-header">
                    <span className="conv-name">{conv.customer?.name || conv.customer?.phone || "Unknown"}</span>
                    <div className="conv-header-right">
                      {conv.unreadCount > 0 && (
                        <span className="unread-badge">{conv.unreadCount > 99 ? "99+" : conv.unreadCount}</span>
                      )}
                      <span className="conv-time">{new Date(conv.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                  <div className="conv-preview text-ellipsis flex flex-col gap-1 mt-1">
                    {conv.priority === 'urgent' && conv.lastMessagePreview?.includes('Avaliação Negativa') && (
                      <span className="text-red-500 font-bold animate-pulse text-[10px] uppercase tracking-wider bg-red-500/10 rounded px-1.5 py-0.5 w-fit border border-red-500/20">
                        [ALERTA DE AVALIAÇÃO RUIM - ASSUMIR ATENDIMENTO]
                      </span>
                    )}
                    <span className="truncate text-muted">
                      {conv.lastMessagePreview || <>{channelIcon(conv.channel)} {conv.channel} - {conv.status}</>}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-area">
        {!activeConversation ? (
          <div className="empty-chat flex-center">
            <div className="empty-chat-content">
              <Bot size={48} className="empty-icon" />
              <h2>Select a conversation</h2>
              <p>Choose a customer from the left to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <button
                className="chat-back-btn"
                onClick={() => setActiveConversation(null)}
              >
                <ArrowLeft size={20} />
              </button>
              <div className="chat-header-avatar">
                {activeConv?.customer?.profilePictureUrl ? (
                  <img src={activeConv.customer.profilePictureUrl} alt="" className="header-avatar-img" />
                ) : (
                  <div className="header-avatar-fallback">
                    {activeConv?.customer?.name?.charAt(0) || "?"}
                  </div>
                )}
              </div>
              <div className="chat-contact-info">
                <h3>{channelIcon(activeConv?.channel || "")} {activeConv?.customer?.name || "Customer"}</h3>
                <span className={`status-indicator ${activeConv?.status || ""}`}>
                  {activeConv?.status
                    ? activeConv.status.charAt(0).toUpperCase() + activeConv.status.slice(1)
                    : "Unknown"}
                </span>
              </div>
              <div className="chat-header-actions">
                <div className="chat-menu-wrapper">
                  <button
                    className="icon-btn-header"
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    title="Opções"
                  >
                    <MoreVertical size={18} />
                  </button>
                  {showChatMenu && (
                    <div className="chat-menu-dropdown glass-panel">
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

            <div className="chat-messages">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`message-wrapper ${msg.senderType}`}
                  onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
                >
                  <div className="message-bubble">
                    {renderMessageText(msg)}
                    {renderAttachments(msg)}
                    {msg.translatedFrom && (
                      <div className="translation-badge">
                        <Sparkles size={12} /> Traduzido do {msg.translatedFrom}
                      </div>
                    )}
                    {msg.translatedTo && (
                      <div className="translation-badge">
                        <Sparkles size={12} /> Traduzido para {msg.translatedTo}
                      </div>
                    )}
                    <div className="message-meta">
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {msg.senderType === 'agent' && (
                        msg.status === 'read'
                          ? <CheckCheck size={14} className="status-read" />
                          : msg.status === 'delivered'
                            ? <CheckCheck size={14} className="status-delivered" />
                            : <Check size={14} className="status-sent" />
                      )}
                    </div>
                    {msg.senderType === 'customer' && (
                      <button
                        className="msg-delete-btn"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Apagar mensagem"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  {/* Copilot Action (Only for customer messages) */}
                  {msg.senderType === 'customer' && !msg.suggestion && (
                    <button
                      className="copilot-action-btn"
                      onClick={() => handleCopilotRequest(msg.id)}
                      disabled={pendingCopilotIds.has(msg.id)}
                    >
                      {pendingCopilotIds.has(msg.id) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {pendingCopilotIds.has(msg.id) ? "AI Thinking..." : "Copilot Suggestion"}
                    </button>
                  )}
                  {msg.suggestion && (
                    <div className="copilot-suggestion-card">
                      <div className="suggestion-header"><Sparkles size={14} /> AI Suggestion</div>
                      <p>{msg.suggestion.suggestionText}</p>
                      <div className="suggestion-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                          className="use-suggestion-btn"
                          onClick={() => handleUseSuggestion(msg.suggestion!.id, msg.suggestion!.suggestionText)}
                        >
                          Use this draft
                        </button>
                        <button
                          className="use-suggestion-btn secondary"
                          style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                          onClick={async (e) => {
                            const btn = e.currentTarget;
                            const originalBtnText = btn.innerText;
                            btn.innerText = "Loading audio...";
                            btn.disabled = true;
                            try {
                              const token = localStorage.getItem("conversia_token");
                              const res = await fetch(`${API_URL}/audio/synthesize`, {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                  ...(token ? { Authorization: `Bearer ${token}` } : {})
                                },
                                body: JSON.stringify({ text: msg.suggestion!.suggestionText })
                              });
                              if (!res.ok) throw new Error("Failed to load audio");
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const audio = new Audio(url);
                              audio.play();
                            } catch (err) {
                              console.error(err);
                              alert("Failed to play audio");
                            } finally {
                              btn.innerText = originalBtnText;
                              btn.disabled = false;
                            }
                          }}
                        >
                          <Volume2 size={16} style={{ marginRight: '6px' }} /> Speak Answer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              {/* Attachment preview */}
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
                  <button className="attachment-remove-btn" onClick={() => setPendingFile(null)}>
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="chat-input-row">
              <AudioRecorder
                disabled={isSending}
                onUpload={(blob) => ApiService.uploadAudio("/audio/transcribe", blob)}
                onTranscription={(text) => {
                  setReplyText((prev) => (prev ? prev + " " + text : text));
                }}
              />
              <button
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Enviar arquivo"
              >
                <Paperclip size={18} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <button
                className="quick-reply-btn"
                onClick={() => setShowQuickReplies(!showQuickReplies)}
                title="Quick Replies"
              >
                <Zap size={18} />
              </button>
              <div className="language-selector-wrapper">
                <button
                  className="lang-toggle-btn"
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  title="Output Language"
                >
                  <Globe size={18} />
                  <span className="lang-toggle-text">
                    {targetLanguage === "Original" ? "Auto" : targetLanguage.substring(0, 3).toUpperCase()}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {showLangMenu && (
                  <div className="lang-menu glass-panel">
                    {LANGUAGES.map(lang => (
                      <button
                        key={lang}
                        className={`lang-option ${targetLanguage === lang ? 'active' : ''}`}
                        onClick={() => {
                          setTargetLanguage(lang);
                          setShowLangMenu(false);
                        }}
                      >
                        {lang === "Original" ? "Auto / Original" : lang}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Replies Popup */}
              {showQuickReplies && filteredQuickReplies.length > 0 && (
                <div className="quick-replies-popup glass-panel">
                  {filteredQuickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      className="quick-reply-option"
                      onClick={() => {
                        setReplyText(qr.body);
                        setShowQuickReplies(false);
                      }}
                    >
                      <span className="qr-title">{qr.title}</span>
                      {qr.shortcut && <span className="qr-shortcut">/{qr.shortcut}</span>}
                      <span className="qr-preview">{qr.body.substring(0, 60)}{qr.body.length > 60 ? "..." : ""}</span>
                    </button>
                  ))}
                </div>
              )}

              <textarea
                placeholder='Type a message... (Shift+Enter for new line, "/" for quick replies)'
                value={replyText}
                onChange={e => { setReplyText(e.target.value); setUsedSuggestionId(null); }}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                rows={Math.max(1, Math.min(5, replyText.split("\n").length))}
                style={{ 
                  resize: "none", 
                  paddingTop: "12px", 
                  paddingBottom: "12px",
                  lineHeight: "1.4"
                }}
              />
              <button
                className="send-btn"
                disabled={(!replyText.trim() && !pendingFile) || isSending}
                onClick={handleSendMessage}
              >
                {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Email Compose Modal */}
      {showEmailModal && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="email-modal-panel" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="email-modal-header">
              <div className="email-modal-title-row">
                <div className="email-modal-icon"><Mail size={17} /></div>
                <div>
                  <div className="email-modal-title">Enviar por Email</div>
                  <div className="email-modal-subtitle">{activeConv?.customer?.name || "Cliente"}</div>
                </div>
              </div>
              <button className="email-modal-close" onClick={() => setShowEmailModal(false)}><X size={16} /></button>
            </div>

            {/* Body */}
            <div className="email-modal-body">

              {/* Para */}
              <div className="email-modal-field">
                <label className="email-modal-label">Para</label>
                <input
                  type="email"
                  className="email-modal-input"
                  value={emailTo}
                  onChange={e => setEmailTo(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>

              {/* Assunto */}
              <div className="email-modal-field">
                <div className="email-modal-label-row">
                  <label className="email-modal-label">Assunto</label>
                  <div className="email-ai-row">
                    {isLoadingEmailSuggestion ? (
                      <span className="email-ai-loading-text">
                        <Loader2 size={11} className="animate-spin" /> Gerando com IA...
                      </span>
                    ) : emailSuggestionError ? (
                      <button
                        className="email-regen-btn"
                        onClick={() => activeConversation && fetchEmailSuggestion(activeConversation, emailTo)}
                      >
                        <Sparkles size={11} /> Tentar novamente
                      </button>
                    ) : (
                      <>
                        <span className="email-ai-badge"><Sparkles size={9} /> IA</span>
                        <button
                          className="email-regen-btn"
                          disabled={isLoadingEmailSuggestion}
                          onClick={() => activeConversation && fetchEmailSuggestion(activeConversation, emailTo)}
                        >
                          Regenerar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  className="email-modal-input"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  placeholder={isLoadingEmailSuggestion ? "Gerando assunto..." : "Assunto do email"}
                  disabled={isLoadingEmailSuggestion}
                />
              </div>

              {/* Mensagem */}
              <div className="email-modal-field">
                <label className="email-modal-label">Mensagem</label>
                <textarea
                  className="email-modal-textarea"
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  rows={7}
                  placeholder={isLoadingEmailSuggestion ? "Gerando mensagem com base no histórico da conversa..." : "Escreva sua mensagem..."}
                  disabled={isLoadingEmailSuggestion}
                />
              </div>

              {emailError && <div className="email-modal-error">{emailError}</div>}

              <div className="email-modal-footer">
                <button className="email-modal-cancel" onClick={() => setShowEmailModal(false)}>Cancelar</button>
                <button
                  className="email-modal-send"
                  disabled={isSendingEmail || isLoadingEmailSuggestion || !emailSubject.trim() || !emailBody.trim()}
                  onClick={handleSendEmail}
                >
                  {isSendingEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                  {isSendingEmail ? "Enviando..." : "Enviar Email"}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Context Menu for message actions */}
      {contextMenu && (
        <div
          className="message-context-menu glass-panel"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="context-menu-item danger"
            onClick={() => handleDeleteMessage(contextMenu.messageId)}
          >
            <Trash2 size={14} /> Apagar mensagem
          </button>
        </div>
      )}
    </div>
  );
}
