// src/pages/ServiceOrdersPage.tsx
import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/services/api";
import { ClipboardList, MapPin, User, Plus, GripVertical, Hash } from "lucide-react";
import { ServiceOrderModal } from "@/components/ServiceOrderModal";
import "./ServiceOrdersPage.css";

type ServiceOrder = {
  id: string;
  sequentialNumber: number;
  location: string;
  category: string | null;
  description: string;
  priority: string;
  assignedTo: string | null;
  guestName: string | null;
  impactOnStay: string | null;
  paymentResponsible: string | null;
  status: string;
  createdAt: string;
  conversation?: { id: string; customer: { name: string | null; phone: string } | null } | null;
};

type RawServiceOrder = {
  id: string;
  sequential_number?: number;  sequentialNumber?: number;
  location: string;
  category?: string | null;
  description: string;
  priority?: string;
  assigned_to?: string | null;   assignedTo?: string | null;
  guest_name?: string | null;    guestName?: string | null;
  impact_on_stay?: string | null; impactOnStay?: string | null;
  payment_responsible?: string | null; paymentResponsible?: string | null;
  status: string;
  created_at?: string;  createdAt?: string;
  conversation?: { id: string; customer: { name: string | null; phone: string } | null } | null;
};

function mapOrder(raw: RawServiceOrder): ServiceOrder {
  return {
    id: raw.id,
    sequentialNumber: raw.sequential_number ?? raw.sequentialNumber ?? 0,
    location: raw.location,
    category: raw.category ?? null,
    description: raw.description,
    priority: raw.priority ?? "medium",
    assignedTo: raw.assigned_to ?? raw.assignedTo ?? null,
    guestName: raw.guest_name ?? raw.guestName ?? null,
    impactOnStay: raw.impact_on_stay ?? raw.impactOnStay ?? null,
    paymentResponsible: raw.payment_responsible ?? raw.paymentResponsible ?? null,
    status: raw.status,
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    conversation: raw.conversation ?? null,
  };
}

const COLUMNS: { key: string; label: string; color: string }[] = [
  { key: "pending",          label: "📋 Pendente",          color: "#f59e0b" },
  { key: "in_progress",      label: "🔧 Em Andamento",      color: "#3b82f6" },
  { key: "waiting_material", label: "📦 Aguard. Material",  color: "#8b5cf6" },
  { key: "done",             label: "✅ Concluído",          color: "#10b981" },
  { key: "cancelled",        label: "❌ Cancelado",          color: "#ef4444" },
];

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  low:    { label: "Baixa",   cls: "os-prio-low"    },
  medium: { label: "Média",   cls: "os-prio-medium" },
  high:   { label: "Alta",    cls: "os-prio-high"   },
  urgent: { label: "Urgente", cls: "os-prio-urgent" },
};

const IMPACT_BADGE: Record<string, string> = {
  partial:       "⚠️",
  blocks_checkin: "🚫",
};

export function ServiceOrdersPage() {
  const [orders, setOrders]       = useState<ServiceOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const raw = await ApiService.get<RawServiceOrder[]>("/service-orders");
      setOrders(raw.map(mapOrder));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const getColumnOrders = (status: string) => orders.filter((o) => o.status === status);

  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    setDraggedId(orderId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    if (!draggedId) return;
    const order = orders.find((o) => o.id === draggedId);
    if (!order || order.status === targetStatus) { setDraggedId(null); return; }

    setOrders((prev) => prev.map((o) => (o.id === draggedId ? { ...o, status: targetStatus } : o)));
    setDraggedId(null);

    try {
      await ApiService.patch(`/service-orders/${draggedId}`, { status: targetStatus });
    } catch {
      fetchOrders();
    }
  };

  return (
    <div className="os-page">
      <div className="os-page-header">
        <div className="os-header-title">
          <ClipboardList size={24} />
          <h2>Ordens de Serviço</h2>
        </div>
        <button className="os-new-btn" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          <span>Nova O.S.</span>
        </button>
      </div>

      {loading ? (
        <div className="os-loading">Carregando ordens de serviço...</div>
      ) : (
        <div className="os-kanban">
          {COLUMNS.map((col) => {
            const columnOrders = getColumnOrders(col.key);
            return (
              <div
                key={col.key}
                className="os-kanban-column"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="os-column-header" style={{ borderTopColor: col.color }}>
                  <span className="os-column-title">{col.label}</span>
                  <span className="os-column-count" style={{ background: col.color }}>
                    {columnOrders.length}
                  </span>
                </div>

                <div className="os-column-body">
                  {columnOrders.length === 0 ? (
                    <div className="os-column-empty">Arraste cards aqui</div>
                  ) : (
                    columnOrders.map((order) => {
                      const prio = PRIORITY_BADGE[order.priority] ?? PRIORITY_BADGE.medium;
                      return (
                        <div
                          key={order.id}
                          className={`os-card ${draggedId === order.id ? "os-card-dragging" : ""}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, order.id)}
                        >
                          <div className="os-card-header">
                            <span className="os-card-number">
                              <Hash size={11} />
                              {order.sequentialNumber}
                            </span>
                            <div className="os-card-badges">
                              <span className={`os-prio-badge ${prio.cls}`}>{prio.label}</span>
                              {order.category && (
                                <span className="os-cat-badge">{order.category}</span>
                              )}
                              {order.impactOnStay && IMPACT_BADGE[order.impactOnStay] && (
                                <span title={order.impactOnStay}>{IMPACT_BADGE[order.impactOnStay]}</span>
                              )}
                            </div>
                            <GripVertical size={14} className="os-card-grip" />
                          </div>

                          <div className="os-card-location">
                            <MapPin size={12} />
                            <span>{order.location}</span>
                          </div>

                          <p className="os-card-desc">{order.description}</p>

                          {order.guestName && (
                            <div className="os-card-guest">🧳 {order.guestName}</div>
                          )}

                          {order.assignedTo && (
                            <div className="os-card-assignee">
                              <User size={12} />
                              <span>{order.assignedTo}</span>
                            </div>
                          )}

                          <div className="os-card-footer">
                            {order.paymentResponsible && (
                              <span className="os-payment-badge">
                                {order.paymentResponsible === "guest" ? "🧳" :
                                 order.paymentResponsible === "owner" ? "🏠" : "🏢"}
                                {" "}{order.paymentResponsible}
                              </span>
                            )}
                            <span className="os-card-time">
                              {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ServiceOrderModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchOrders}
      />
    </div>
  );
}
