import { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, Key, Sparkles, Send, X, RefreshCw } from "lucide-react";
import { ApiService } from "@/services/api";
import "./DailyTaskQueue.css";

interface TaskItem {
  id: string;
  type: string;
  customerName: string;
  customerPhone: string;
  reservationId: string;
  messagePayload: string;
  scheduledFor: string;
}

interface DailyTasksResponse {
  tasks: TaskItem[];
  lastSyncAt: string | null;
}

type TaskConfig = {
  label: string;
  sublabel: string;
  icon: any;
  color: "amber" | "orange" | "purple" | "pink" | "blue";
};

const displayMap: Record<string, TaskConfig> = {
  checkin_amanha:  { label: "Check-in Amanhã",      sublabel: "Avisos de chegada para amanhã",      icon: Key,      color: "amber"  },
  checkin_hoje:    { label: "Check-in Hoje",         sublabel: "Boas-vindas para hoje",              icon: Key,      color: "orange" },
  checkout_amanha: { label: "Check-out Amanhã",      sublabel: "Lembrete de saída para amanhã",      icon: Sparkles, color: "purple" },
  checkout_hoje:   { label: "Check-out + NPS Hoje",  sublabel: "Avaliação e desconto de fidelidade", icon: Sparkles, color: "pink"   },
};

export function DailyTaskQueue() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.get<DailyTasksResponse>("/tasks/daily");
      setTasks(data.tasks ?? []);
      setLastSyncAt(data.lastSyncAt ?? null);
    } catch (e) {
      console.error(e);
      setTasks([]);
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

  const handleApproveAll = async (type: string) => {
    const group = groupedTasks[type];
    if (!group) return;
    setIsApproving(true);
    try {
      const taskIds = group.map(t => t.id);
      await ApiService.post("/tasks/approve", { taskIds });
      setTasks(prev => prev.filter(t => t.type !== type));
      setSelectedType(null);
    } catch (e) {
      console.error("Failed to approve tasks", e);
    } finally {
      setIsApproving(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const groupedTasks = tasks.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, TaskItem[]>);

  const header = (
    <div className="dtq-header">
      <h2 className="dtq-title">
        <CheckCircle2 size={18} color="var(--brand-primary)" />
        Fila de Missões Diárias
      </h2>
      <div className="dtq-header-right">
        {lastSyncAt && (
          <span className="dtq-last-sync">
            Última sync:{" "}
            {new Date(lastSyncAt).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
        )}
        <button
          className="dtq-sync-btn"
          onClick={handleForceSync}
          disabled={isSyncing}
        >
          <RefreshCw size={13} className={isSyncing ? "dtq-spin" : ""} />
          {isSyncing ? "Buscando..." : "Atualizar na Stays"}
        </button>
      </div>
    </div>
  );

  if (!isLoading && tasks.length === 0) {
    return (
      <div className="dtq-wrapper animate-fade-in">
        {header}
        <div className="dtq-empty">
          <div className="dtq-empty-icon">
            <CheckCircle2 size={24} />
          </div>
          <h3>Tudo limpo por aqui! 🎉</h3>
          <p>Nenhuma tarefa diária de atendimento pendente. Nossa Inteligência notificará você amanhã!</p>
        </div>
      </div>
    );
  }

  const entries = Object.entries(groupedTasks);

  return (
    <>
      <div className="dtq-wrapper animate-fade-in">
        {header}

        <div className="dtq-grid">
          {entries.map(([type, list]) => {
            const cfg: TaskConfig = displayMap[type] ?? {
              label: type, sublabel: "", icon: Send, color: "blue",
            };
            const Icon = cfg.icon;
            const c = cfg.color;

            return (
              <button
                key={type}
                className={`dtq-card dtq-card--${c}`}
                onClick={() => setSelectedType(type)}
              >
                <div className="dtq-card-top">
                  <div className={`dtq-icon dtq-icon--${c}`}>
                    <Icon size={18} />
                  </div>
                  <span className={`dtq-badge dtq-badge--${c}`}>{list.length}</span>
                </div>

                <div className="dtq-card-body">
                  <p className="dtq-label">{cfg.label}</p>
                  <p className="dtq-sublabel">{cfg.sublabel}</p>
                </div>

                <div className="dtq-cta">
                  Revisar e aprovar <ChevronRight size={12} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedType && (
        <div className="dtq-backdrop animate-fade-in">
          <div className="dtq-modal">
            <div className="dtq-modal-header">
              <h3 className="dtq-modal-title">
                {displayMap[selectedType]?.label ?? selectedType}
                <span className="dtq-modal-count">{groupedTasks[selectedType]?.length}</span>
              </h3>
              <button className="dtq-modal-close" onClick={() => setSelectedType(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="dtq-modal-body">
              {groupedTasks[selectedType]?.map(task => (
                <div key={task.id} className="dtq-task-card">
                  <div className="dtq-task-card-header">
                    <span className="dtq-task-name">{task.customerName}</span>
                    <span className="dtq-task-phone">{task.customerPhone}</span>
                  </div>
                  <div className="dtq-task-message">{task.messagePayload}</div>
                </div>
              ))}
            </div>

            <div className="dtq-modal-footer">
              <button className="dtq-btn-cancel" onClick={() => setSelectedType(null)}>
                Cancelar
              </button>
              <button
                className="dtq-btn-approve"
                onClick={() => handleApproveAll(selectedType)}
                disabled={isApproving}
              >
                {isApproving
                  ? <div style={{ width: 16, height: 16, borderRadius: "50%", borderTop: "2px solid #fff", animation: "dtq-spin 0.8s linear infinite" }} />
                  : <Send size={15} />
                }
                Aprovar Todos
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
