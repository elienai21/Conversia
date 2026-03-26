import { useState, useEffect } from "react";
import { X, Users, CheckSquare, Square } from "lucide-react";
import { ApiService } from "@/services/api";

type CustomerItem = {
  id: string;
  name: string | null;
  phone: string;
};

export function NewGroupModal({
  open,
  onClose,
  onCreated,
  staffList,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  staffList: CustomerItem[];
}) {
  const [subject, setSubject] = useState("");
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSubject("");
      setSelectedPhones(new Set());
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  // Filter out any staff that don't have a phone number, or are already groups themselves
  const selectableStaff = staffList.filter(s => s.phone && !s.phone.includes("@g.us"));

  const toggleParticipant = (phone: string) => {
    const next = new Set(selectedPhones);
    if (next.has(phone)) {
      next.delete(phone);
    } else {
      next.add(phone);
    }
    setSelectedPhones(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError("O nome do grupo é obrigatório.");
      return;
    }
    if (selectedPhones.size === 0) {
      setError("Selecione pelo menos um participante.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await ApiService.post("/evolution/groups", {
        subject: subject.trim(),
        participants: Array.from(selectedPhones),
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Group creation error:", err);
      // Fallback for API error messages
      const msg = err instanceof Error ? err.message : "Erro ao criar grupo no WhatsApp.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4">
      <div 
        className="bg-[var(--surface-color)] rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-slide-up"
        style={{ border: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="text-brand-primary" size={24} />
            Criar Grupo Operacional
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Nome do Grupo (WhatsApp)</label>
            <input
              autoFocus
              className="px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary transition-all"
              placeholder="Ex: Equipe de Limpeza - Centro"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={loading}
              maxLength={25} // WhatsApp limit is usually 25 characters for group names
            />
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Participantes ({selectedPhones.size} selecionados)</span>
            </label>
            
            <div className="border border-[var(--border-color)] rounded-lg max-h-48 overflow-y-auto bg-[var(--bg-color)]">
              {selectableStaff.length === 0 ? (
                <div className="p-4 text-center text-muted text-sm">
                  Nenhum membro com telefone disponível na equipe.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--border-color)]">
                  {selectableStaff.map(staff => {
                    const isSelected = selectedPhones.has(staff.phone);
                    return (
                      <div 
                        key={staff.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${isSelected ? 'bg-brand-primary/5 dark:bg-brand-primary/10' : ''}`}
                        onClick={() => toggleParticipant(staff.phone)}
                      >
                        <div className="text-brand-primary">
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-muted" />}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium truncate">{staff.name || 'Sem nome'}</span>
                          <span className="text-xs text-muted truncate">{staff.phone}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted mt-1">
              * Apenas membros da equipe operacional aparecerão aqui.
            </p>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-brand-primary text-white rounded-lg hover:bg-brand-primary-hover transition-colors flex items-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-t-2 border-white animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Grupo'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
