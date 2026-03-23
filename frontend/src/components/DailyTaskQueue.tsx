import { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, Key, Sparkles, Send, X, RefreshCw } from "lucide-react";
import { ApiService } from "@/services/api";
import { useTheme } from "@/contexts/ThemeContext";

interface TaskItem {
  id: string;
  type: string; // 'checkin_hoje' | 'checkin_amanha' | 'checkout_hoje' | 'checkout_amanha'
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

export function DailyTaskQueue() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const { theme } = useTheme();

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

  useEffect(() => {
    fetchTasks();
  }, []);

  const syncHeader = (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-medium flex items-center gap-2">
        <CheckCircle2 size={18} className="text-brand-primary" /> Fila de Missões Diárias
      </h2>
      <div className="flex items-center gap-3">
        {lastSyncAt && (
          <span className="text-xs text-muted">
            Última sync: {new Date(lastSyncAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
          </span>
        )}
        <button
          onClick={handleForceSync}
          disabled={isSyncing}
          className="text-muted hover:text-foreground text-sm flex items-center gap-2 transition-colors bg-muted/10 hover:bg-muted/20 px-3 py-1.5 rounded-md"
        >
          <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? "Buscando..." : "Atualizar na Stays"}
        </button>
      </div>
    </div>
  );

  if (!isLoading && tasks.length === 0) {
    return (
      <div className="w-full mb-8 animate-fade-in">
        {syncHeader}
        <div className="p-6 rounded-xl border border-dashed flex flex-col items-center justify-center text-center bg-muted/5">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="text-foreground font-medium mb-1">Tudo limpo por aqui! 🎉</h3>
          <p className="text-muted text-sm max-w-sm">Nenhuma tarefa diária de atendimento pendente. Nossa Inteligência notificará você amanhã!</p>
        </div>
      </div>
    );
  }

  const groupedTasks = tasks.reduce((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {} as Record<string, TaskItem[]>);

  const displayMap: Record<string, {
    label: string;
    sublabel: string;
    icon: any;
    iconBg: string;
    iconColor: string;
    cardBorder: string;
    badgeBg: string;
    badgeText: string;
  }> = {
    checkin_amanha:  { label: "Check-in Amanhã",      sublabel: "Avisos de chegada para amanhã",      icon: Key,      iconBg: "bg-amber-500",   iconColor: "text-white",       cardBorder: "border-amber-500/40",  badgeBg: "bg-amber-500",  badgeText: "text-white" },
    checkin_hoje:    { label: "Check-in Hoje",         sublabel: "Boas-vindas para hoje",              icon: Key,      iconBg: "bg-orange-500",  iconColor: "text-white",       cardBorder: "border-orange-500/40", badgeBg: "bg-orange-500", badgeText: "text-white" },
    checkout_amanha: { label: "Check-out Amanhã",      sublabel: "Lembrete de saída para amanhã",      icon: Sparkles, iconBg: "bg-purple-500",  iconColor: "text-white",       cardBorder: "border-purple-500/40", badgeBg: "bg-purple-500", badgeText: "text-white" },
    checkout_hoje:   { label: "Check-out + NPS Hoje",  sublabel: "Avaliação e desconto de fidelidade", icon: Sparkles, iconBg: "bg-pink-500",    iconColor: "text-white",       cardBorder: "border-pink-500/40",   badgeBg: "bg-pink-500",   badgeText: "text-white" },
  };

  const handleApproveAll = async (type: string) => {
    if (!groupedTasks[type]) return;
    setIsApproving(true);
    try {
      const taskIds = groupedTasks[type].map(t => t.id);
      await ApiService.post("/tasks/approve", { taskIds });
      
      // Remove da UI as tasks aprovadas
      setTasks(prev => prev.filter(t => t.type !== type));
      setSelectedType(null); // Fechar Modal
    } catch(e) {
      console.error("Failed to approve tasks", e);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      <div className="w-full mb-8 animate-fade-in">
        {syncHeader}
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(groupedTasks).map(([type, list]) => {
            const config = displayMap[type] || {
              label: type, sublabel: "", icon: Send,
              iconBg: "bg-blue-500", iconColor: "text-white",
              cardBorder: "border-blue-500/40", badgeBg: "bg-blue-500", badgeText: "text-white",
            };
            const Icon = config.icon;

            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`group relative flex flex-col gap-3 p-4 rounded-xl border-2 ${config.cardBorder} bg-white/5 hover:bg-white/10 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl text-left w-full`}
              >
                {/* Top row: icon + badge */}
                <div className="flex items-center justify-between">
                  <div className={`w-10 h-10 rounded-lg ${config.iconBg} ${config.iconColor} flex items-center justify-center shadow-md`}>
                    <Icon size={20} />
                  </div>
                  <span className={`${config.badgeBg} ${config.badgeText} text-xs font-bold px-2.5 py-1 rounded-full shadow-sm`}>
                    {list.length}
                  </span>
                </div>

                {/* Labels */}
                <div>
                  <p className="text-foreground font-semibold text-sm leading-tight">{config.label}</p>
                  <p className="text-muted text-xs mt-0.5 leading-tight">{config.sublabel}</p>
                </div>

                {/* CTA */}
                <div className="flex items-center gap-1 text-xs font-medium text-muted group-hover:text-foreground transition-colors">
                  Revisar e aprovar <ChevronRight size={13} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MODAL DE REVISÃO RÁPIDA */}
      {selectedType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-card w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
              <h3 className="font-bold text-lg flex items-center gap-2">
                Revisão de {displayMap[selectedType]?.label || selectedType}
                <span className="bg-brand-primary text-primary-foreground text-xs px-2 py-1 rounded-full">{groupedTasks[selectedType]?.length}</span>
              </h3>
              <button onClick={() => setSelectedType(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="overflow-y-auto p-6 flex flex-col gap-4 bg-muted/10 h-full">
              {groupedTasks[selectedType]?.map((task) => (
                <div key={task.id} className="bg-background rounded-xl p-4 border border-border/50 shadow-sm relative">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-sm text-foreground">Hóspede: {task.customerName}</span>
                    <span className="text-xs text-muted font-mono">{task.customerPhone}</span>
                  </div>
                  <div className="text-sm bg-muted/30 p-3 rounded-lg border border-border/30 whitespace-pre-wrap leading-relaxed text-foreground/90">
                    {task.messagePayload}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border bg-card flex justify-end gap-3">
              <button onClick={() => setSelectedType(null)} className="px-5 py-2.5 rounded-lg border border-border font-medium hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => handleApproveAll(selectedType)}
                disabled={isApproving}
                className="px-6 py-2.5 rounded-lg font-medium text-white shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500"
              >
                {isApproving ? (
                  <div className="w-5 h-5 rounded-full border-t-2 border-white animate-spin"></div>
                ) : (
                  <Send size={18} />
                )}
                Aprovar Todos
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
