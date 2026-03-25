// src/pages/ServiceOrdersPage.tsx
// Kanban board for Service Orders (O.S.) management
import { useState, useEffect, useCallback } from "react";
import { ApiService } from "@/services/api";
import { ClipboardList, MapPin, Wrench, User, Plus, GripVertical, Hash } from "lucide-react";
import "./ServiceOrdersPage.css";

type ServiceOrder = {
  id: string;
  sequentialNumber: number;
  location: string;
  description: string;
  assignedTo: string | null;
  status: string;
  createdAt: string;
  conversation?: {
    id: string;
    customer: { name: string | null; phone: string } | null;
  } | null;
};

type RawServiceOrder = {
  id: string;
  sequential_number?: number;
  sequentialNumber?: number;
  location: string;
  description: string;
  assigned_to?: string | null;
  assignedTo?: string | null;
  status: string;
  created_at?: string;
  createdAt?: string;
  conversation?: {
    id: string;
    customer: { name: string | null; phone: string } | null;
  } | null;
};

const COLUMNS: { key: string; label: string; color: string; icon: React.ReactNode }[] = [
  { key: "pending", label: "📋 Pendente", color: "#f59e0b", icon: <ClipboardList size={16} /> },
  { key: "in_progress", label: "🔧 Em Andamento", color: "#3b82f6", icon: <Wrench size={16} /> },
  { key: "done", label: "✅ Concluído", color: "#10b981", icon: null },
  { key: "cancelled", label: "❌ Cancelado", color: "#ef4444", icon: null },
];

function mapOrder(raw: RawServiceOrder): ServiceOrder {
  return {
    id: raw.id,
    sequentialNumber: raw.sequential_number ?? raw.sequentialNumber ?? 0,
    location: raw.location,
    description: raw.description,
    assignedTo: raw.assigned_to ?? raw.assignedTo ?? null,
    status: raw.status,
    createdAt: raw.created_at ?? raw.createdAt ?? "",
    conversation: raw.conversation ?? null,
  };
}

type CreateOrderModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function CreateOrderModal({ open, onClose, onCreated }: CreateOrderModalProps) {
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [assignedPhone, setAssignedPhone] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim() || !description.trim()) return;

    setSaving(true);
    try {
      await ApiService.post("/service-orders", {
        location: location.trim(),
        description: description.trim(),
        assignedTo: assignedTo.trim() || undefined,
        assignedPhone: assignedPhone.trim() || undefined,
      });
      setLocation("");
      setDescription("");
      setAssignedTo("");
      setAssignedPhone("");
      onCreated();
      onClose();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="os-modal-overlay" onClick={onClose}>
      <div className="os-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nova Ordem de Serviço</h3>
        <form onSubmit={handleSubmit}>
          <div className="os-form-group">
            <label>📍 Local</label>
            <input
              type="text"
              placeholder="Ex: Casa Praia - Banheiro Suite"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>
          <div className="os-form-group">
            <label>🔧 Descrição da Tarefa</label>
            <textarea
              placeholder="Ex: Trocar chuveiro elétrico"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
            />
          </div>
          <div className="os-form-group">
            <label>👷 Responsável (opcional)</label>
            <input
              type="text"
              placeholder="Ex: João Eletricista"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </div>
          <div className="os-form-group">
            <label>📱 WhatsApp do Responsável (opcional)</label>
            <input
              type="text"
              placeholder="Ex: 5511999998888"
              value={assignedPhone}
              onChange={(e) => setAssignedPhone(e.target.value)}
            />
          </div>
          <div className="os-modal-actions">
            <button type="button" className="os-btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="os-btn-primary" disabled={saving}>
              {saving ? "Criando..." : "Criar O.S."}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ServiceOrdersPage() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
    if (!order || order.status === targetStatus) {
      setDraggedId(null);
      return;
    }

    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === draggedId ? { ...o, status: targetStatus } : o))
    );
    setDraggedId(null);

    try {
      await ApiService.patch(`/service-orders/${draggedId}`, { status: targetStatus });
    } catch {
      fetchOrders(); // rollback
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
                    <div className="os-column-empty">
                      Arraste cards aqui
                    </div>
                  ) : (
                    columnOrders.map((order) => (
                      <div
                        key={order.id}
                        className={`os-card ${draggedId === order.id ? "os-card-dragging" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, order.id)}
                      >
                        <div className="os-card-header">
                          <span className="os-card-number">
                            <Hash size={12} />
                            {order.sequentialNumber}
                          </span>
                          <GripVertical size={14} className="os-card-grip" />
                        </div>
                        <div className="os-card-location">
                          <MapPin size={13} />
                          <span>{order.location}</span>
                        </div>
                        <p className="os-card-desc">{order.description}</p>
                        {order.assignedTo && (
                          <div className="os-card-assignee">
                            <User size={13} />
                            <span>{order.assignedTo}</span>
                          </div>
                        )}
                        <div className="os-card-time">
                          {new Date(order.createdAt).toLocaleDateString("pt-BR")}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateOrderModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchOrders}
      />
    </div>
  );
}
