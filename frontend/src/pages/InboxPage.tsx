import { useState, useEffect, useRef, useCallback } from "react";
import { ApiService, API_URL } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import "./InboxPage.css";
import { Search, Send, Bot, Check, Loader2, Sparkles, ArrowLeft, MessageCircle, Camera, Volume2, Globe, ChevronDown, Trash2, Zap, FileText } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";

// Internal component types (camelCase)
type Conversation = {
  id: string;
  customer: { phone: string; name?: string | null; profilePictureUrl?: string | null } | null;
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
  customer: { phone: string; name: string | null; profile_picture_url?: string | null } | null;
  unread_count?: number;
  last_message_preview?: string | null;
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
      ? { phone: raw.customer.phone, name: raw.customer.name, profilePictureUrl: raw.customer.profile_picture_url }
      : null,
    channel: raw.channel,
    status: raw.status,
    updatedAt: raw.updated_at,
    unreadCount: raw.unread_count || 0,
    lastMessagePreview: raw.last_message_preview || null,
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

  if (sourceUrl.startsWith("/")) {
    return `${API_URL}${sourceUrl}`;
  }

  return sourceUrl;
}

function renderAttachments(message: Message) {
  if (!message.attachments?.length) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
      {message.attachments.map((attachment) => {
        if (attachment.type === "image" && attachment.sourceUrl) {
          return (
            <a key={attachment.id} href={attachment.sourceUrl} target="_blank" rel="noreferrer">
              <img
                src={attachment.sourceUrl}
                alt={attachment.fileName || "Image attachment"}
                style={{ maxWidth: "220px", borderRadius: "12px", display: "block" }}
              />
            </a>
          );
        }

        if (attachment.type === "video" && attachment.sourceUrl) {
          return (
            <video
              key={attachment.id}
              controls
              src={attachment.sourceUrl}
              style={{ maxWidth: "260px", borderRadius: "12px" }}
            />
          );
        }

        if (attachment.type === "audio" && attachment.sourceUrl) {
          return (
            <audio
              key={attachment.id}
              controls
              src={attachment.sourceUrl}
              style={{ width: "100%" }}
            />
          );
        }

        return (
          <a
            key={attachment.id}
            href={attachment.sourceUrl || "#"}
            target={attachment.sourceUrl ? "_blank" : undefined}
            rel={attachment.sourceUrl ? "noreferrer" : undefined}
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
            }}
          >
            <FileText size={16} />
            <span>{attachment.fileName || `${attachment.type} attachment`}</span>
          </a>
        );
      })}
    </div>
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
  const [pendingCopilotIds, setPendingCopilotIds] = useState<Set<string>>(new Set());
  const [targetLanguage, setTargetLanguage] = useState("Original");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string } | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  const LANGUAGES = ["Original", "Portuguese", "English", "Spanish", "French", "German"];

  const { socket, joinConversation, leaveConversation } = useSocket();
  const prevConversationRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(() => {
    ApiService.get<RawConversation[]>("/conversations")
      .then((raw) => setConversations(raw.map(mapConversation)))
      .catch(console.error);
  }, []);

  useEffect(() => {
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

    const handleMessageNew = (data: RawMessage & { conversation_id: string }) => {
      // Play notification sound for customer messages not in the active conversation
      if (data.sender_type === "customer") {
        if (data.conversation_id !== activeConversation) {
          notificationSound?.play().catch(() => {});
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

    socket.on("suggestion.ready", handleSuggestionReady);
    socket.on("message.new", handleMessageNew);
    socket.on("conversation.updated", handleConversationUpdated);
    socket.on("message.deleted", handleMessageDeleted);

    return () => {
      socket.off("suggestion.ready", handleSuggestionReady);
      socket.off("message.new", handleMessageNew);
      socket.off("conversation.updated", handleConversationUpdated);
      socket.off("message.deleted", handleMessageDeleted);
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
    } catch (error) {
      console.error(error);
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

  const handleSendMessage = async () => {
    if (!activeConversation || !replyText.trim()) return;
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
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMessageContextMenu = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, messageId });
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = conv.customer?.name?.toLowerCase() || "";
    const phone = conv.customer?.phone?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q);
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
        <div className="inbox-header">
          <h3>Messages</h3>
          <div className="search-bar">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
                className={`conversation-card ${activeConversation === conv.id ? 'active' : ''} ${conv.unreadCount > 0 ? 'has-unread' : ''}`}
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
                  <span className="conv-preview text-ellipsis">
                    {conv.lastMessagePreview || <>{channelIcon(conv.channel)} {conv.channel} - {conv.status}</>}
                  </span>
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
            </div>

            <div className="chat-messages">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`message-wrapper ${msg.senderType}`}
                  onContextMenu={(e) => handleMessageContextMenu(e, msg.id)}
                >
                  <div className="message-bubble">
                    <p>{msg.originalText}</p>
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
                      {msg.senderType === 'agent' && <Check size={14} />}
                    </div>
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
              <AudioRecorder
                disabled={isSending}
                onUpload={(blob) => ApiService.uploadAudio("/audio/transcribe", blob)}
                onTranscription={(text) => {
                  setReplyText((prev) => (prev ? prev + " " + text : text));
                }}
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

              <input
                type="text"
                placeholder='Type a message... (type "/" for quick replies)'
                value={replyText}
                onChange={e => { setReplyText(e.target.value); setUsedSuggestionId(null); }}
                onKeyDown={handleKeyDown}
                disabled={isSending}
              />
              <button
                className="send-btn"
                disabled={!replyText.trim() || isSending}
                onClick={handleSendMessage}
              >
                {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </div>
          </>
        )}
      </div>

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
