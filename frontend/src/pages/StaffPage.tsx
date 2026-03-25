import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/services/api";
import { Search, MessageCircle, Camera, ChevronDown, ChevronUp, User, Mail, AtSign, Tag, Send, Pencil, Trash2, Users } from "lucide-react";
import { StartConversationModal } from "@/components/StartConversationModal";
import { EditCustomerModal } from "@/components/EditCustomerModal";
import { NewCustomerModal } from "@/components/NewCustomerModal";
import "./CustomersPage.css";

type CustomerItem = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  social_media: string | null;
  tag: string | null;
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

export function StaffPage() {
  const [staffList, setStaffList] = useState<CustomerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [msgCustomer, setMsgCustomer] = useState<CustomerItem | null>(null);
  const [editCustomer, setEditCustomer] = useState<CustomerItem | null>(null);
  const [showNewStaff, setShowNewStaff] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteCustomer = async (customer: CustomerItem) => {
    const confirmed = window.confirm(
      `Confirma a exclusão do membro "${customer.name || customer.phone}"?`
    );
    if (!confirmed) return;

    setDeletingId(customer.id);
    try {
      await ApiService.delete(`/customers/${customer.id}`);
      setStaffList((prev) => prev.filter((c) => c.id !== customer.id));
      if (expandedId === customer.id) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to delete staff");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchStaff = useCallback(() => {
    setIsLoading(true);
    ApiService.get<CustomerItem[]>("/customers?tag=STAFF,GROUP_STAFF")
      .then(setStaffList)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    const handler = () => fetchStaff();
    window.addEventListener("customer-created", handler);
    return () => window.removeEventListener("customer-created", handler);
  }, [fetchStaff]);

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

  const filtered = staffList.filter((c) => {
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
          <p className="text-muted text-sm">Carregando equipe operacional...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-page animate-fade-in">
      <div className="customers-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1 flex items-center gap-3">
            <Users className="text-brand-primary" size={28} />
            Equipe Operacional
          </h1>
          <span className="customers-count">{filtered.length} membro(s) cadastrado(s)</span>
        </div>
        <div className="flex gap-4">
          <div className="customers-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button 
            className="px-4 py-2 bg-brand-primary text-white rounded-md hover:bg-brand-primary-hover font-medium transition-colors"
            onClick={() => setShowNewStaff(true)}
          >
            Novo Membro
          </button>
        </div>
      </div>

      <div className="filter-chips">
        <span className="text-sm text-muted mb-2">
          Membros da equipe (Tag <strong>STAFF</strong> ou <strong>GROUP_STAFF</strong>) recebem agendamentos automáticos de faxina e lavanderia, além de Ordens de Serviço.
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="page-container flex-center" style={{ minHeight: 200 }}>
          <p className="text-muted">Nenhum membro operacional encontrado</p>
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

              {expandedId === customer.id && (
                <div className="customer-detail-panel">
                  {loadingDetail ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Carregando histórico...</p>
                  ) : detail?.conversations.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>Sem conversas registradas</p>
                  ) : (
                    detail?.conversations.map((conv) => (
                      <div key={conv.id} className="conversation-row">
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
        onUpdated={fetchStaff}
      />

      <NewCustomerModal
        open={showNewStaff}
        onClose={() => setShowNewStaff(false)}
        onCreated={fetchStaff}
      />
    </div>
  );
}
