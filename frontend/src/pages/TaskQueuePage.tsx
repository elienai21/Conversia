import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  Key,
  Sparkles,
  Send,
  RefreshCw,
  Pencil,
  X,
  Check,
  Trash2,
  Clock,
  AlertCircle,
  ClipboardCheck,
  ExternalLink,
  FileText,
} from "lucide-react";
import { ApiService } from "@/services/api";
import "./TaskQueuePage.css";

interface GuestFormData {
  fullName: string;
  document: string;
  documentType: string;
  nationality?: string;
  birthDate?: string;
  phone?: string;
  photoFrontUrl?: string | null;
  photoBackUrl?: string | null;
  submittedAt: string;
}

interface TaskItem {
  id: string;
  type: string;
  customerName: string;
  customerPhone: string;
  reservationId: string;
  messagePayload: string;
  scheduledFor: string;
  magicToken?: string | null;
  guestFormData?: string | null;
  guestFormAt?: string | null;
}

interface DailyResponse {
  tasks: TaskItem[];
  lastSyncAt: string | null;
}

interface SyncSummary {
  tenantsScanned: number;
  reservationsFound: number;
  tasksCreated: number;
  errors: string[];
}

export function TaskQueuePage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  // editingId → current draft text
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Guest form modal
  const [viewingFormTask, setViewingFormTask] = useState<TaskItem | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ApiService.get<DailyResponse>("/tasks/daily");
      setTasks(data.tasks);
      setLastSyncAt(data.lastSyncAt);
    } catch (e) {
      console.error("Failed to load tasks", e);
      setError("Não foi possível carregar as missões. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncSummary(null);
    setError(null);
    try {
      const res = await ApiService.post<{ success: boolean; summary: SyncSummary }>(
        "/tasks/sync",
        {}
      );
      setSyncSummary(res.summary);
      await fetchTasks();
    } catch (e) {
      console.error(e);
      setError("Falha ao sincronizar com a Stays.net.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ─── Edit helpers ────────────────────────────────────────────────────────

  const startEdit = (task: TaskItem) => {
    setEditDrafts((prev) => ({ ...prev, [task.id]: task.messagePayload }));
  };

  const cancelEdit = (taskId: string) => {
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const saveEdit = async (taskId: string) => {
    const draft = editDrafts[taskId];
    if (!draft?.trim()) return;

    setSavingIds((prev) => new Set([...prev, taskId]));
    try {
      await ApiService.patch(`/tasks/${taskId}`, { messagePayload: draft });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, messagePayload: draft } : t))
      );
      cancelEdit(taskId);
    } catch (e) {
      console.error("Failed to save edit", e);
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // ─── Approve ─────────────────────────────────────────────────────────────

  const handleApprove = async (taskIds: string[]) => {
    setApprovingIds((prev) => new Set([...prev, ...taskIds]));
    try {
      await ApiService.post("/tasks/approve", { taskIds });
      setTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
    } catch (e) {
      console.error("Failed to approve tasks", e);
      setError("Falha ao enviar mensagens. Verifique a conexão WhatsApp.");
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        taskIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  // ─── Cancel ──────────────────────────────────────────────────────────────

  const handleCancel = async (taskId: string) => {
    setCancellingIds((prev) => new Set([...prev, taskId]));
    try {
      await ApiService.delete(`/tasks/${taskId}`);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (e) {
      console.error("Failed to cancel task", e);
    } finally {
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const formatLastSync = (iso: string | null) => {
    if (!iso) return "Nunca sincronizado";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Agora mesmo";
    if (diffMin < 60) return `Há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Há ${diffH}h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  // ─── Config ──────────────────────────────────────────────────────────────

  const typeMap: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
    checkin_hoje: { label: "Check-in Hoje", icon: Key, color: "text-amber-500", bg: "bg-amber-500/10" },
    checkin_amanha: { label: "Check-in Amanhã", icon: Key, color: "text-orange-500", bg: "bg-orange-500/10" },
    checkout_hoje: { label: "Avaliações Pendentes", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10" },
    checkout_amanha: { label: "Check-out Avisos", icon: Sparkles, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  };

  const groups = tasks.reduce(
    (acc, t) => {
      if (!acc[t.type]) acc[t.type] = [];
      acc[t.type].push(t);
      return acc;
    },
    {} as Record<string, TaskItem[]>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading && tasks.length === 0) {
    return (
      <div className="page-container flex-center w-full">
        <div className="animate-pulse-subtle flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-brand-primary animate-spin"></div>
          <p className="text-muted text-sm">Carregando missões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="task-queue-page animate-fade-in scrollable-content">
      {/* ── Header ── */}
      <div className="task-queue-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Missões Diárias</h1>
          <p className="text-muted">
            Centro de Comando de mensagens agendadas e automações do CRM.
          </p>
          <div className="sync-status">
            <Clock size={13} />
            <span>{formatLastSync(lastSyncAt)}</span>
          </div>
        </div>

        <button
          onClick={handleForceSync}
          disabled={isSyncing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Buscando reservas..." : "Atualizar na Stays"}
        </button>
      </div>

      {/* ── Sync Summary ── */}
      {syncSummary && (
        <div className="sync-summary-banner">
          <CheckCircle2 size={16} className="text-success" />
          <span>
            Sincronização concluída —{" "}
            <strong>{syncSummary.reservationsFound}</strong> reservas encontradas,{" "}
            <strong>{syncSummary.tasksCreated}</strong> novas tarefas criadas.
          </span>
          {syncSummary.errors.length > 0 && (
            <span className="sync-errors">
              {syncSummary.errors.length} erro(s)
            </span>
          )}
          <button onClick={() => setSyncSummary(null)} className="sync-dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="task-error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="sync-dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Empty State ── */}
      {tasks.length === 0 ? (
        <div className="inbox-zero-container">
          <div className="inbox-zero-icon">
            <CheckCircle2 size={40} />
          </div>
          <h2>Inbox Zero! 🎉</h2>
          <p>
            Sua Fila de Missões está completamente limpa. Todos os hóspedes já
            receberam as instruções corretas via WhatsApp.
          </p>
          <p className="text-muted text-sm mt-4">
            Clique em <strong>Atualizar na Stays</strong> para verificar novas reservas.
          </p>
        </div>
      ) : (
        <div className="task-queue-groups">
          {Object.entries(groups).map(([type, list]) => {
            const cfg = typeMap[type] ?? {
              label: type,
              icon: Send,
              color: "text-blue-500",
              bg: "bg-blue-500/10",
            };
            const Icon = cfg.icon;
            const allApproving = list.every((t) => approvingIds.has(t.id));

            return (
              <div key={type} className="task-group">
                <div className="group-header">
                  <h2 className="group-title">
                    <span className={`p-1.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
                      <Icon size={18} />
                    </span>
                    {cfg.label}
                    <span className="group-badge">{list.length}</span>
                  </h2>

                  <button
                    onClick={() => handleApprove(list.map((t) => t.id))}
                    disabled={allApproving}
                    className="btn-primary flex items-center gap-2 btn-sm py-2"
                    style={{
                      background: "var(--accent-success)",
                      borderColor: "var(--accent-success)",
                    }}
                  >
                    {allApproving ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                    Aprovar Todos
                  </button>
                </div>

                <div className="tasks-grid">
                  {list.map((task) => {
                    const isApproving = approvingIds.has(task.id);
                    const isCancelling = cancellingIds.has(task.id);
                    const draftText = editDrafts[task.id];
                    const isEditing = draftText !== undefined;
                    const isSaving = savingIds.has(task.id);

                    return (
                      <div key={task.id} className="task-card glass-panel">
                        {/* Header */}
                        <div className="task-card-header">
                          <div className="task-customer-info">
                            <div className="customer-avatar">
                              {task.customerName.charAt(0).toUpperCase()}
                            </div>
                            <div className="customer-details">
                              <p className="font-medium text-[var(--accent-primary)]">
                                {task.type === "checkout_hoje" 
                                  ? `Pedir avaliação para ${task.customerName}` 
                                  : task.customerName}
                              </p>
                              <p>{task.customerPhone}</p>
                            </div>
                          </div>
                          <div className="task-header-right">
                            {task.guestFormAt && (
                              <button
                                className="guest-form-badge"
                                onClick={() => setViewingFormTask(task)}
                                title="Hóspede preencheu o formulário"
                              >
                                <ClipboardCheck size={12} />
                                Cadastro enviado
                              </button>
                            )}
                            <span className="reservation-tag">
                              #{task.reservationId.slice(-6)}
                            </span>
                          </div>
                        </div>

                        {/* Body — message (editable or read-only) */}
                        <div className="task-card-body">
                          {isEditing ? (
                            <textarea
                              className="task-message-editor"
                              value={draftText}
                              onChange={(e) =>
                                setEditDrafts((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                              rows={5}
                              autoFocus
                            />
                          ) : (
                            <p className="task-message">{task.messagePayload}</p>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="task-card-footer">
                          {isEditing ? (
                            <div className="task-edit-actions">
                              <button
                                onClick={() => cancelEdit(task.id)}
                                className="btn-ghost flex items-center gap-1 btn-sm"
                                disabled={isSaving}
                              >
                                <X size={14} /> Cancelar
                              </button>
                              <button
                                onClick={() => saveEdit(task.id)}
                                className="btn-primary flex items-center gap-1 btn-sm"
                                disabled={isSaving || !draftText.trim()}
                              >
                                {isSaving ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <Check size={14} />
                                )}
                                Salvar
                              </button>
                            </div>
                          ) : (
                            <div className="task-actions">
                              <button
                                onClick={() => handleCancel(task.id)}
                                disabled={isCancelling || isApproving}
                                className="btn-ghost flex items-center gap-1 btn-sm text-muted"
                                title="Cancelar missão"
                              >
                                {isCancelling ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>

                              <button
                                onClick={() => startEdit(task)}
                                disabled={isApproving || isCancelling}
                                className="btn-ghost flex items-center gap-1 btn-sm"
                                title="Editar mensagem"
                              >
                                <Pencil size={14} /> Editar
                              </button>

                              <button
                                onClick={() => handleApprove([task.id])}
                                disabled={isApproving || isCancelling}
                                className={`btn-primary flex items-center gap-2 btn-sm ${
                                  isApproving ? "opacity-50" : ""
                                }`}
                              >
                                {isApproving ? (
                                  "Enviando..."
                                ) : (
                                  <>
                                    Aprovar & Enviar <Send size={14} />
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Guest Form Modal ── */}
      {viewingFormTask && (() => {
        let formData: GuestFormData | null = null;
        try {
          formData = viewingFormTask.guestFormData
            ? (JSON.parse(viewingFormTask.guestFormData) as GuestFormData)
            : null;
        } catch { /* ignore */ }

        return (
          <div className="modal-overlay" onClick={() => setViewingFormTask(null)}>
            <div className="modal-panel glass-panel" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="flex items-center gap-2">
                  <FileText size={18} className="text-brand-primary" />
                  Cadastro do Hóspede
                </h3>
                <button onClick={() => setViewingFormTask(null)} className="btn-ghost p-1">
                  <X size={18} />
                </button>
              </div>

              {formData ? (
                <div className="modal-body">
                  <div className="guest-form-grid">
                    <div className="gf-field">
                      <span className="gf-label">Nome completo</span>
                      <span className="gf-value">{formData.fullName}</span>
                    </div>
                    <div className="gf-field">
                      <span className="gf-label">Documento ({formData.documentType?.toUpperCase()})</span>
                      <span className="gf-value">{formData.document}</span>
                    </div>
                    {formData.nationality && (
                      <div className="gf-field">
                        <span className="gf-label">Nacionalidade</span>
                        <span className="gf-value">{formData.nationality}</span>
                      </div>
                    )}
                    {formData.birthDate && (
                      <div className="gf-field">
                        <span className="gf-label">Data de nascimento</span>
                        <span className="gf-value">
                          {new Date(formData.birthDate + "T12:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    )}
                    {formData.phone && (
                      <div className="gf-field">
                        <span className="gf-label">Telefone</span>
                        <span className="gf-value">{formData.phone}</span>
                      </div>
                    )}
                    <div className="gf-field">
                      <span className="gf-label">Enviado em</span>
                      <span className="gf-value">
                        {new Date(formData.submittedAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  {(formData.photoFrontUrl || formData.photoBackUrl) && (
                    <div className="gf-photos">
                      {formData.photoFrontUrl && (
                        <div className="gf-photo-item">
                          <span className="gf-label">Frente</span>
                          <a href={formData.photoFrontUrl} target="_blank" rel="noopener noreferrer">
                            <img src={formData.photoFrontUrl} alt="Frente do documento" />
                            <span className="gf-photo-link"><ExternalLink size={12} /> Abrir</span>
                          </a>
                        </div>
                      )}
                      {formData.photoBackUrl && (
                        <div className="gf-photo-item">
                          <span className="gf-label">Verso</span>
                          <a href={formData.photoBackUrl} target="_blank" rel="noopener noreferrer">
                            <img src={formData.photoBackUrl} alt="Verso do documento" />
                            <span className="gf-photo-link"><ExternalLink size={12} /> Abrir</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted text-sm p-4">Dados do formulário não disponíveis.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
