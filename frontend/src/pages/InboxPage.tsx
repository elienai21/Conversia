import { useState, useEffect, useRef } from "react";
import { ApiService } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import "./InboxPage.css";
import { Search, Send, Bot, CheckCheck, Loader2, Sparkles, ArrowLeft, MessageCircle, Camera, Volume2, Square } from "lucide-react";
import { AudioRecorder } from "@/components/AudioRecorder";

// Internal component types (camelCase)
type Conversation = {
  id: string;
  customer: { phone: string; name?: string | null } | null;
  channel: string;
  status: string;
  updatedAt: string;
};

type Message = {
  id: string;
  senderType: "customer" | "agent" | "system";
  originalText: string;
  createdAt: string;
  suggestion?: {
    id: string;
    suggestionText: string;
    wasUsed: boolean;
  };
};

// Raw API response types (snake_case from backend)
type RawConversation = {
  id: string;
  channel: string;
  status: string;
  updated_at: string;
  customer: { phone: string; name: string | null } | null;
};

type RawMessage = {
  id: string;
  sender_type: "customer" | "agent" | "system";
  original_text: string;
  created_at: string;
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
    customer: raw.customer,
    channel: raw.channel,
    status: raw.status,
    updatedAt: raw.updated_at,
  };
}

function mapMessage(raw: RawMessage): Message {
  return {
    id: raw.id,
    senderType: raw.sender_type,
    originalText: raw.original_text,
    createdAt: raw.created_at,
  };
}

export function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [usedSuggestionId, setUsedSuggestionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingCopilotIds, setPendingCopilotIds] = useState<Set<string>>(new Set());
  const { socket, joinConversation, leaveConversation } = useSocket();
  const prevConversationRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ApiService.get<RawConversation[]>("/conversations")
      .then((raw) => setConversations(raw.map(mapConversation)))
      .catch(console.error);
  }, []);

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

  // Listen for real-time suggestion.ready events from BullMQ Worker
  useEffect(() => {
    if (!socket) return;

    const handleSuggestionReady = (data: {
      messageId: string;
      suggestion: { id: string; suggestionText: string; wasUsed: boolean };
    }) => {
      console.log("[Socket] suggestion.ready received:", data);

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

    socket.on("suggestion.ready", handleSuggestionReady);
    return () => {
      socket.off("suggestion.ready", handleSuggestionReady);
    };
  }, [socket]);

  const loadMessages = async (id: string) => {
    setActiveConversation(id);
    setPendingCopilotIds(new Set());
    setUsedSuggestionId(null);
    try {
      const raw = await ApiService.get<RawMessage[]>(`/conversations/${id}/messages`);
      setMessages(raw.map(mapMessage));
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

  const handleSendMessage = async () => {
    if (!activeConversation || !replyText.trim()) return;
    setIsSending(true);
    try {
      const body: { text: string; suggestion_id?: string } = {
        text: replyText.trim(),
      };
      if (usedSuggestionId) {
        body.suggestion_id = usedSuggestionId;
      }

      const raw = await ApiService.post<RawMessage>(
        `/conversations/${activeConversation}/messages`,
        body
      );

      // Append the new message to the list
      setMessages((prev) => [...prev, mapMessage(raw)]);
      setReplyText("");
      setUsedSuggestionId(null);
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

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = conv.customer?.name?.toLowerCase() || "";
    const phone = conv.customer?.phone?.toLowerCase() || "";
    return name.includes(q) || phone.includes(q);
  });

  const activeConv = conversations.find(c => c.id === activeConversation);

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
                className={`conversation-card ${activeConversation === conv.id ? 'active' : ''}`}
                onClick={() => loadMessages(conv.id)}
              >
                <div className="conv-avatar">{conv.customer?.name?.charAt(0) || <Bot size={20}/>}</div>
                <div className="conv-details">
                  <div className="conv-header">
                    <span className="conv-name">{conv.customer?.name || conv.customer?.phone || "Unknown"}</span>
                    <span className="conv-time">{new Date(conv.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                  <span className="conv-preview text-ellipsis">{channelIcon(conv.channel)} {conv.channel} - {conv.status}</span>
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
              <div className="chat-contact-info">
                <h3>{channelIcon(activeConv?.channel || "")} {conversations.find(c => c.id === activeConversation)?.customer?.name || "Customer"}</h3>
                <span className={`status-indicator ${activeConv?.status || ""}`}>
                  {activeConv?.status
                    ? activeConv.status.charAt(0).toUpperCase() + activeConv.status.slice(1)
                    : "Unknown"}
                </span>
              </div>
            </div>

            <div className="chat-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`message-wrapper ${msg.senderType}`}>
                  <div className="message-bubble">
                    <p>{msg.originalText}</p>
                    <div className="message-meta">
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      {msg.senderType === 'agent' && <CheckCheck size={14} />}
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
                            const originalText = btn.innerText;
                            btn.innerText = "Loading audio...";
                            btn.disabled = true;
                            try {
                              const token = localStorage.getItem("conversia_token");
                              // Use native fetch to get the binary audio stream
                              const res = await fetch("http://localhost:3000/api/v1/audio/synthesize", {
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
                              btn.innerText = originalText;
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
              <input
                type="text"
                placeholder="Type a message..."
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
    </div>
  );
}
