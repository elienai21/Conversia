import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/services/api";
import { Search, MessageCircle, Camera, ChevronDown, ChevronUp, User, Mail, AtSign, Tag, Send } from "lucide-react";
import { StartConversationModal } from "@/components/StartConversationModal";
import "./CustomersPage.css";

type CustomerItem = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  social_media: string | null;
  tag: string | null;
  created_at: string;
  conversation_count: number;
  active_conversations: number;
  last_contact: string;
  last_channel: string | null;
  detected_language: string | null;
  status: "active" | "resolved";
};

type ConversationDetail = {
  id: string;
  channel: string;
  status: string;
  detected_language: string | null;
  assigned_agent: string | null;
  created_at: string;
  updated_at: string;
  last_message: { sender_type: string; text: string; created_at: string } | null;
};

type CustomerDetail = {
  id: string;
  name: string | null;
  phone: string;
  created_at: string;
  conversations: ConversationDetail[];
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function channelIcon(channel: string | null) {
  switch (channel) {
    case "whatsapp":
      return <MessageCircle size={18} />;
    case "instagram":
      return <Camera size={18} />;
    default:
      return null;
  }
}

function langLabel(code: string | null): string {
  if (!code) return "";
  const map: Record<string, string> = {
    en: "English", pt: "Portuguese", es: "Spanish", fr: "French",
    de: "German", it: "Italian", ja: "Japanese", zh: "Chinese",
    ko: "Korean", ar: "Arabic", ru: "Russian", nl: "Dutch",
  };
  return map[code] || code.toUpperCase();
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [msgCustomer, setMsgCustomer] = useState<CustomerItem | null>(null);

  const fetchCustomers = useCallback(() => {
    setIsLoading(true);
    ApiService.get<CustomerItem[]>("/customers")
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Refresh list when a new customer is created from the sidebar modal
  useEffect(() => {
    const handler = () => fetchCustomers();
    window.addEventListener("customer-created", handler);
    return () => window.removeEventListener("customer-created", handler);
  }, [fetchCustomers]);

  const handleExpand = async (customerId: string) => {
    if (expandedId === customerId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(customerId);
    setLoadingDetail(true);
    try {
      const res = await ApiService.get<CustomerDetail>(`/customers/${customerId}`);
      setDetail(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = customers.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.name?.toLowerCase() || "";
    const phone = c.phone.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  if (isLoading) {
    return (
      <div className="page-container flex-center w-full">
        <div className="animate-pulse-subtle flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-brand-primary animate-spin"></div>
          <p className="text-muted text-sm">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-page animate-fade-in">
      <div className="customers-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Customers</h1>
          <span className="customers-count">{filtered.length} customer{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="customers-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-chips">
        {(["all", "active", "resolved"] as const).map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="page-container flex-center" style={{ minHeight: 200 }}>
          <p className="text-muted">No customers found</p>
        </div>
      ) : (
        <div className="customers-grid">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="customer-card"
              onClick={() => handleExpand(customer.id)}
            >
              <div className="customer-card-header">
                <div className="customer-info">
                  <div className="customer-avatar">
                    {customer.name ? customer.name.charAt(0).toUpperCase() : <User size={20} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="customer-name">
                      {customer.name || customer.phone}
                    </div>
                    <div className="customer-detail">
                      {langLabel(customer.detected_language)}
                      {customer.detected_language && " · "}
                      {customer.phone}
                    </div>
                  </div>
                </div>
                <div className="customer-card-actions">
                  <button
                    className="send-msg-btn"
                    title="Enviar Mensagem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMsgCustomer(customer);
                    }}
                  >
                    <Send size={15} />
                  </button>
                  <span className={`customer-channel-icon ${customer.last_channel || ""}`}>
                    {channelIcon(customer.last_channel)}
                  </span>
                  {expandedId === customer.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {(customer.email || customer.social_media || customer.tag) && (
                <div className="customer-meta-row">
                  {customer.tag && (
                    <span className="customer-tag">
                      <Tag size={12} />
                      {customer.tag}
                    </span>
                  )}
                  {customer.email && (
                    <span className="customer-meta-item">
                      <Mail size={12} />
                      {customer.email}
                    </span>
                  )}
                  {customer.social_media && (
                    <span className="customer-meta-item">
                      <AtSign size={12} />
                      {customer.social_media}
                    </span>
                  )}
                </div>
              )}

              <div className="customer-card-footer">
                <span className={`status-badge ${customer.status}`}>
                  {customer.status}
                </span>
                <span className="last-contact">
                  Last contact {timeAgo(customer.last_contact)}
                </span>
              </div>

              {expandedId === customer.id && (
                <div className="customer-detail-panel">
                  {loadingDetail ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Loading history...</p>
                  ) : detail?.conversations.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>No conversations yet</p>
                  ) : (
                    detail?.conversations.map((conv) => (
                      <div key={conv.id} className="conversation-row">
                        <div className="conversation-row-left">
                          <span className={`customer-channel-icon ${conv.channel}`}>
                            {channelIcon(conv.channel)}
                          </span>
                          <span>{conv.last_message?.text || "No messages"}</span>
                        </div>
                        <div className="conversation-row-right">
                          <span className={`status-badge ${conv.status === "closed" ? "resolved" : "active"}`}>
                            {conv.status}
                          </span>
                          <span>{timeAgo(conv.updated_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <StartConversationModal
        open={!!msgCustomer}
        customer={msgCustomer}
        onClose={() => setMsgCustomer(null)}
      />
    </div>
  );
}
