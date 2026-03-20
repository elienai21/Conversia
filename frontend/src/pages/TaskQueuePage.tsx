import { useState, useEffect } from "react";
import { CheckCircle2, Key, Sparkles, Send, RefreshCw } from "lucide-react";
import { ApiService } from "@/services/api";
import "./TaskQueuePage.css";

interface TaskItem {
  id: string;
  type: string;
  customerName: string;
  customerPhone: string;
  reservationId: string;
  messagePayload: string;
  scheduledFor: string;
}

export function TaskQueuePage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.get<TaskItem[]>("/tasks/daily");
      setTasks(data);
    } catch (e) {
      console.error("Failed to load tasks", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await ApiService.post("/tasks/sync", {});
      await fetchTasks();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleApprove = async (taskIds: string[]) => {
    setApprovingIds(new Set([...approvingIds, ...taskIds]));
    try {
      await ApiService.post("/tasks/approve", { taskIds });
      setTasks((prev) => prev.filter((t) => !taskIds.includes(t.id)));
    } catch (e) {
      console.error("Failed to approve tasks", e);
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        taskIds.forEach(id => next.delete(id));
        return next;
      });
    }
  };

  // Maps para exibição
  const typeMap: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    checkin_hoje: { label: "Check-in Hoje", icon: Key, color: "text-amber-500", bg: "bg-amber-500/10" },
    checkin_amanha: { label: "Check-in Amanhã", icon: Key, color: "text-orange-500", bg: "bg-orange-500/10" },
    checkout_hoje: { label: "Check-out NPS (Hoje)", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10" },
    checkout_amanha: { label: "Check-out Avisos", icon: Sparkles, color: "text-indigo-500", bg: "bg-indigo-500/10" },
  };

  // Agrupamento vertical
  const groups = tasks.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, TaskItem[]>);

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
      <div className="task-queue-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Missões Diárias</h1>
          <p className="text-muted">Centro de Comando de mensagens agendadas e automações do CRM.</p>
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

      {tasks.length === 0 ? (
        <div className="inbox-zero-container">
          <div className="inbox-zero-icon">
            <CheckCircle2 size={40} />
          </div>
          <h2>Inbox Zero! 🎉</h2>
          <p>
            Sua Fila de Missões está completamente limpa. Todos os hóspedes já receberam as instruções corretas via WhatsApp.
          </p>
        </div>
      ) : (
        <div className="task-queue-groups">
          {Object.entries(groups).map(([type, list]) => {
            const config = typeMap[type] || { label: type, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10" };
            const Icon = config.icon;
            const isApprovingAll = list.every(t => approvingIds.has(t.id));

            return (
              <div key={type} className="task-group">
                <div className="group-header">
                  <h2 className="group-title">
                    <span className={`p-1.5 rounded-lg ${config.bg} ${config.color}`}><Icon size={18} /></span>
                    {config.label}
                    <span className="group-badge">{list.length}</span>
                  </h2>

                  <button
                    onClick={() => handleApprove(list.map(t => t.id))}
                    disabled={isApprovingAll}
                    className="btn-primary flex items-center gap-2 btn-sm py-2"
                    style={{ background: 'var(--accent-success)', borderColor: 'var(--accent-success)' }}
                  >
                    {isApprovingAll ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                    Aprovar Todos
                  </button>
                </div>

                <div className="tasks-grid">
                  {list.map(task => {
                    const isTaskApproving = approvingIds.has(task.id);
                    return (
                      <div key={task.id} className="task-card glass-panel">
                        <div className="task-card-header">
                          <div className="task-customer-info">
                            <div className="customer-avatar">
                              {task.customerName.charAt(0).toUpperCase()}
                            </div>
                            <div className="customer-details">
                              <p>{task.customerName}</p>
                              <p>{task.customerPhone}</p>
                            </div>
                          </div>
                          <span className="reservation-tag">
                            #{task.reservationId.slice(-6)}
                          </span>
                        </div>
                        
                        <div className="task-card-body">
                          <p className="task-message">
                            {task.messagePayload}
                          </p>
                        </div>

                        <div className="task-card-footer">
                          <button
                            onClick={() => handleApprove([task.id])}
                            disabled={isTaskApproving}
                            className={`btn-primary flex items-center gap-2 btn-sm ${isTaskApproving ? 'opacity-50' : ''}`}
                          >
                            {isTaskApproving ? "Enviando..." : "Aprovar & Enviar"}
                            {!isTaskApproving && <Send size={14} />}
                          </button>
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
    </div>
  );
}
