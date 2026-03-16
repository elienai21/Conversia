import { useState, useEffect, useRef } from "react";
import { ApiService } from "@/services/api";
import { useSocket } from "@/contexts/SocketContext";
import "./InboxPage.css";
import { Search, Send, Bot, CheckCheck, Loader2, Sparkles, ArrowLeft } from "lucide-react";

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
  const [pendingCopilotIds, setPendingCopilotIds] = useState<Set<string>>(new Set());
  const { socket, joinConversation, leaveConversation } = useSocket();
  const prevConversationRef = useRef<string | null>(null);

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

  return (
    <div className={`inbox-container glass-panel ${activeConversation ? "show-chat" : ""}`}>
      {/* Sidebar - Conversation List */}
      <div className="inbox-sidebar">
        <div className="inbox-header">
          <h3>Messages</h3>
          <div className="search-bar">
            <Search size={16} />
            <input type="text" placeholder="Search conversations..." />
          </div>
        </div>

        <div className="conversations-list">
          {conversations.length === 0 ? (
             <div className="empty-state-list">No active conversations</div>
          ) : (
            conversations.map(conv => (
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
                  <span className="conv-preview text-ellipsis">{conv.channel} - {conv.status}</span>
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
                <h3>{conversations.find(c => c.id === activeConversation)?.customer?.name || "Customer"}</h3>
                <span className="status-indicator online">Online</span>
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
                      <button
                        className="use-suggestion-btn"
                        onClick={() => handleUseSuggestion(msg.suggestion!.id, msg.suggestion!.suggestionText)}
                      >
                        Use this draft
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="chat-input-area">
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
