import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ApiService } from "@/services/api";
import { Search, MessageCircle, Camera, ChevronDown, ChevronUp, User, Mail, AtSign, Tag, Send, Pencil, Trash2 } from "lucide-react";
import { StartConversationModal } from "@/components/StartConversationModal";
import { EditCustomerModal } from "@/components/EditCustomerModal";
import "./CustomersPage.css";

type CustomerItem = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  social_media: string | null;
  tag: string | null;
  role: string | null;
  profile_picture_url: string | null;
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
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return `há ${Math.floor(days / 30)} mês`;
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
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [msgCustomer, setMsgCustomer] = useState<CustomerItem | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"recent" | "alpha-asc" | "alpha-desc">("recent");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");

  const handleDeleteCustomer = async (customer: CustomerItem) => {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir "${customer.name || customer.phone}"? Isso também excluirá todas as conversas e mensagens desse contato.`
    );
    if (!confirmed) return;

    setDeletingId(customer.id);
    try {
      await ApiService.delete(`/customers/${customer.id}`);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      if (expandedId === customer.id) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete customer");
    } finally {
      setDeletingId(null);
    }
  };

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

  const filtered = customers
    .filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (roleFilter && c.role !== roleFilter) return false;
      if (channelFilter && c.last_channel !== channelFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = c.name?.toLowerCase() || "";
      const phone = c.phone.toLowerCase();
      return name.includes(q) || phone.includes(q);
    })
    .sort((a, b) => {
      if (sortOrder === "alpha-asc") {
        const na = (a.name || a.phone).toLowerCase();
        const nb = (b.name || b.phone).toLowerCase();
        return na.localeCompare(nb);
      }
      if (sortOrder === "alpha-desc") {
        const na = (a.name || a.phone).toLowerCase();
        const nb = (b.name || b.phone).toLowerCase();
        return nb.localeCompare(na);
      }
      // "recent" — sort by last_contact descending
      return new Date(b.last_contact).getTime() - new Date(a.last_contact).getTime();
    });

  if (isLoading) {
    return (
      <div className="page-container flex-center w-full">
        <div className="animate-pulse-subtle flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-brand-primary animate-spin"></div>
          <p className="text-muted text-sm">Carregando contatos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-page animate-fade-in">
      <div className="customers-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Contatos</h1>
          <span className="customers-count">{filtered.length} contato{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="customers-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Buscar contatos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-chips">
        {([
          { value: "all", label: "Todos" },
          { value: "active", label: "Ativos" },
          { value: "resolved", label: "Encerrados" },
        ] as const).map((f) => (
          <button
            key={f.value}
            className={`filter-chip ${filter === f.value ? "active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="customers-filter-bar">
        <div className="customers-filter-group">
          <label>Ordenar:</label>
          <select
            className="customers-filter-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "recent" | "alpha-asc" | "alpha-desc")}
          >
            <option value="recent">Mais recentes</option>
            <option value="alpha-asc">A → Z</option>
            <option value="alpha-desc">Z → A</option>
          </select>
        </div>

        <div className="customers-filter-group">
          <label>Tipo:</label>
          <select
            className="customers-filter-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="guest">Hóspede</option>
            <option value="owner">Proprietário</option>
            <option value="staff">Funcionário</option>
            <option value="lead">Lead</option>
          </select>
        </div>

        <div className="customers-filter-group">
          <label>Plataforma:</label>
          <select
            className="customers-filter-select"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="page-container flex-center" style={{ minHeight: 200 }}>
          <p className="text-muted">Nenhum contato encontrado</p>
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
                    {customer.profile_picture_url ? (
                      <img
                        src={customer.profile_picture_url}
                        alt={customer.name || ""}
                        className="customer-avatar-img"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).parentElement!.textContent =
                            customer.name ? customer.name.charAt(0).toUpperCase() : "";
                        }}
                      />
                    ) : customer.name ? (
                      customer.name.charAt(0).toUpperCase()
                    ) : (
                      <User size={20} />
                    )}
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
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditCustomer(customer);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="send-msg-btn delete-btn"
                    title="Delete"
                    disabled={deletingId === customer.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCustomer(customer);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    className="send-msg-btn"
                    title="Send Message"
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

              {(customer.email || customer.social_media || customer.tag || (customer.role && customer.role !== "guest")) && (
                <div className="customer-meta-row">
                  {customer.tag && (
                    <span className="customer-tag">
                      <Tag size={12} />
                      {customer.tag}
                    </span>
                  )}
                  {customer.role && customer.role !== "guest" && (
                    <span className="customer-tag" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                      {{ owner: "Proprietário", staff: "Funcionário", lead: "Lead" }[customer.role] || customer.role}
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
                  �ltimo contato {timeAgo(customer.last_contact)}
                </span>
              </div>

              {expandedId === customer.id && (
                <div className="customer-detail-panel">
                  {loadingDetail ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Carregando histórico...</p>
                  ) : detail?.conversations.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Nenhuma conversa ainda</p>
                  ) : (
                    detail?.conversations.map((conv) => (
                      <div
                        key={conv.id}
                        className="conversation-row"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate("/inbox", { state: { openConversationId: conv.id } });
                        }}
                        title="Abrir no chat"
                      >
                        <div className="conversation-row-left">
                          <span className={`customer-channel-icon ${conv.channel}`}>
                            {channelIcon(conv.channel)}
                          </span>
                          <span>{conv.last_message?.text || "Sem mensagens"}</span>
                        </div>
                        <div className="conversation-row-right">
                          <span className={`status-badge ${conv.status === "closed" ? "resolved" : "active"}`}>
                            {conv.status}
                          </span>
                          <span>{timeAgo(conv.updated_at)}</span>
                          <MessageCircle size={14} style={{ opacity: 0.4 }} />
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

      <EditCustomerModal
        open={!!editCustomer}
        customer={editCustomer}
        onClose={() => setEditCustomer(null)}
        onUpdated={fetchCustomers}
      />
    </div>
  );
}
