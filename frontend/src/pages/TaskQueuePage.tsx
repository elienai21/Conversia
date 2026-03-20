import { useState, useEffect } from "react";
import { CheckCircle2, Key, Sparkles, Send, RefreshCw, Target } from "lucide-react";
import { ApiService } from "@/services/api";

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
    checkin_hoje: { label: "Check-in Hoje", icon: Key, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
    checkin_amanha: { label: "Check-in Amanhã", icon: Key, color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
    checkout_hoje: { label: "Check-out NPS (Hoje)", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
    checkout_amanha: { label: "Check-out Avisos", icon: Sparkles, color: "text-indigo-500", bg: "bg-indigo-500/10 border-indigo-500/20" },
  };

  // Agrupamento vertical
  const groups = tasks.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, TaskItem[]>);

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex-center w-full h-full page-container">
        <div className="w-10 h-10 border-t-2 border-brand-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="page-container h-full flex flex-col animate-fade-in scrollable-content bg-background">
      <div className="flex-between mb-8 pb-4 border-b border-border">
        <div>
          <h1 className="text-3xl font-semibold mb-1 flex items-center gap-3">
            <Target size={28} className="text-brand-primary" /> Missões Diárias
          </h1>
          <p className="text-muted">Centro de Comando de mensagens agendadas e automações do CRM.</p>
        </div>
        
        <button 
          onClick={handleForceSync}
          disabled={isSyncing}
          className="btn-secondary flex items-center gap-2"
        >
          <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Buscando reservas..." : "Atualizar na Stays"}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex-center flex-col flex-1 pb-20 opacity-80">
          <div className="w-24 h-24 bg-brand/5 border border-brand/10 rounded-full flex-center mb-6 text-brand">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-2xl font-bold mb-2">Inbox Zero! 🎉</h2>
          <p className="text-muted text-center max-w-md text-lg">
            Sua Fila de Missões está completamente limpa. Todos os hóspedes já receberam as instruções corretas via WhatsApp.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10 pb-10">
          {Object.entries(groups).map(([type, list]) => {
            const config = typeMap[type] || { label: type, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" };
            const Icon = config.icon;
            const isApprovingAll = list.every(t => approvingIds.has(t.id));

            return (
              <div key={type} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <span className={`p-2 rounded-lg ${config.bg} ${config.color}`}><Icon size={20} /></span>
                    {config.label}
                    <span className="bg-muted px-2 py-0.5 rounded-full text-sm font-bold text-foreground ml-2">{list.length}</span>
                  </h2>

                  <button
                    onClick={() => handleApprove(list.map(t => t.id))}
                    disabled={isApprovingAll}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isApprovingAll ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                    Aprovar Todos Deste Grupo
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-6 gap-4">
                  {list.map(task => {
                    const isTaskApproving = approvingIds.has(task.id);
                    return (
                      <div key={task.id} className="bg-card border border-border shadow-sm hover:shadow-md transition-shadow rounded-xl flex flex-col overflow-hidden">
                        <div className="px-5 py-3 border-b border-border bg-muted/20 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex-center">
                              {task.customerName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-sm leading-tight">{task.customerName}</p>
                              <p className="text-xs text-muted font-mono">{task.customerPhone}</p>
                            </div>
                          </div>
                          <span className="text-xs font-medium px-2 py-1 rounded bg-background border border-border">
                            Reserva: {task.reservationId.slice(-6)}
                          </span>
                        </div>
                        
                        <div className="p-5 flex-1 bg-background/50">
                          <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 font-medium">
                            {task.messagePayload}
                          </p>
                        </div>

                        <div className="p-4 border-t border-border bg-muted/10 flex justify-end">
                          <button
                            onClick={() => handleApprove([task.id])}
                            disabled={isTaskApproving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                              isTaskApproving ? 'bg-muted text-muted-foreground' : 'bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm'
                            }`}
                          >
                            {isTaskApproving ? "Enviando..." : "Aprovar & Enviar"}
                            {!isTaskApproving && <Send size={16} />}
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
