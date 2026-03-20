import { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, Key, Sparkles, Send, X } from "lucide-react";
import { ApiService } from "@/services/api";
import { useTheme } from "@/contexts/ThemeContext";

interface TaskItem {
  id: string;
  type: string; // 'checkin' | 'checkout'
  customerName: string;
  customerPhone: string;
  reservationId: string;
  messagePayload: string;
  scheduledFor: string;
}

export function DailyTaskQueue() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const { theme } = useTheme();

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.get<TaskItem[]>("/tasks/daily");
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  if (!isLoading && tasks.length === 0) {
    return (
      <div className="w-full mb-8 animate-fade-in">
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-brand-primary" /> Fila de Missões Diárias
        </h2>
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

  const displayMap: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    checkin: { label: "Mensagens de Check-in", icon: Key, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
    checkout: { label: "Mensagens de Check-out (NPS)", icon: Sparkles, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/20" },
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
        <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-brand-primary" /> Fila de Missões Diárias
        </h2>
        
        <div className="flex gap-4 flex-wrap">
          {Object.entries(groupedTasks).map(([type, list]) => {
            const config = displayMap[type] || { label: type, icon: Send, color: "text-blue-500", bg: "bg-blue-500/10" };
            const Icon = config.icon;

            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`relative flex items-center justify-between w-full md:w-auto min-w-[300px] p-4 rounded-xl border transition-all hover:-translate-y-1 hover:shadow-lg ${config.bg} ${theme === 'dark' ? 'hover:bg-opacity-20' : 'hover:bg-opacity-30'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg bg-background shadow-sm ${config.color}`}>
                    <Icon size={24} />
                  </div>
                  <div className="text-left">
                    <p className={`font-semibold text-sm ${config.color}`}>Aprovar {list.length}</p>
                    <p className="text-foreground font-medium">{config.label}</p>
                  </div>
                </div>
                <ChevronRight className="text-muted" size={20} />
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
