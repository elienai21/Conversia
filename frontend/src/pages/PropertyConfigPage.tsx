import { useState, useEffect } from "react";
import { Building2, Car, ScanFace, Plus, Trash2, Loader2, Save } from "lucide-react";
import { ApiService } from "@/services/api";

interface PropertyConfig {
  id: string;
  listing_id: string;
  listing_name: string | null;
  has_garage: boolean;
  has_facial_biometrics: boolean;
}

interface CrmListing {
  id: string;
  name: string;
}

export function PropertyConfigPage() {
  const [configs, setConfigs] = useState<PropertyConfig[]>([]);
  const [listings, setListings] = useState<CrmListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // New property form
  const [newListingId, setNewListingId] = useState("");
  const [newListingName, setNewListingName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [cfgs, props] = await Promise.all([
        ApiService.get<PropertyConfig[]>("/property-configs"),
        ApiService.get<CrmListing[]>("/crm/listings").catch(() => [] as CrmListing[]),
      ]);
      setConfigs(cfgs);
      setListings(props);
    } catch {
      showToast("error", "Erro ao carregar configurações.");
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleToggle = async (config: PropertyConfig, field: "has_garage" | "has_facial_biometrics") => {
    const updated = { ...config, [field]: !config[field] };
    setSaving(config.id);
    try {
      await ApiService.put("/property-configs", {
        listing_id: config.listing_id,
        listing_name: config.listing_name,
        has_garage: updated.has_garage,
        has_facial_biometrics: updated.has_facial_biometrics,
      });
      setConfigs((prev) => prev.map((c) => (c.id === config.id ? updated : c)));
      showToast("success", "Configuração salva.");
    } catch {
      showToast("error", "Erro ao salvar.");
    } finally {
      setSaving(null);
    }
  };

  const handleAdd = async () => {
    if (!newListingId.trim()) return;
    setIsAdding(true);
    try {
      const created = await ApiService.put<PropertyConfig>("/property-configs", {
        listing_id: newListingId.trim(),
        listing_name: newListingName.trim() || newListingId.trim(),
        has_garage: false,
        has_facial_biometrics: false,
      });
      setConfigs((prev) => [...prev, created]);
      setNewListingId("");
      setNewListingName("");
      showToast("success", "Imóvel adicionado.");
    } catch {
      showToast("error", "Erro ao adicionar. Verifique se o ID já não está cadastrado.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (config: PropertyConfig) => {
    if (!confirm(`Remover configuração de "${config.listing_name || config.listing_id}"?`)) return;
    try {
      await ApiService.delete(`/property-configs/${encodeURIComponent(config.listing_id)}`);
      setConfigs((prev) => prev.filter((c) => c.id !== config.id));
      showToast("success", "Removido.");
    } catch {
      showToast("error", "Erro ao remover.");
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--brand-primary)" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
      {toast && (
        <div style={{
          position: "fixed", top: "1rem", right: "1rem", zIndex: 999,
          background: toast.type === "success" ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#10b981" : "#ef4444",
          borderRadius: 10, padding: "0.6rem 1.2rem", fontSize: "0.85rem", fontWeight: 500,
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Building2 size={22} /> Configuração de Imóveis
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Configure campos extras no formulário de check-in de acordo com as características de cada imóvel.
        </p>
      </div>

      {/* Add new property */}
      <div style={{
        background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
        borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem",
      }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "1rem" }}>
          Adicionar Imóvel
        </h3>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="ID do imóvel (ex: UV02I)"
            value={newListingId}
            onChange={(e) => setNewListingId(e.target.value.toUpperCase())}
            style={{
              flex: "0 0 140px", padding: "0.5rem 0.75rem", borderRadius: 8,
              border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
              color: "var(--text-primary)", fontSize: "0.875rem",
            }}
          />
          <input
            type="text"
            placeholder="Nome do imóvel (ex: Solar Enseada)"
            value={newListingName}
            onChange={(e) => setNewListingName(e.target.value)}
            style={{
              flex: 1, minWidth: 180, padding: "0.5rem 0.75rem", borderRadius: 8,
              border: "1px solid var(--border-color)", background: "var(--bg-tertiary)",
              color: "var(--text-primary)", fontSize: "0.875rem",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={isAdding || !newListingId.trim()}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.5rem 1rem", background: "var(--brand-primary)", color: "#fff",
              border: "none", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
              cursor: "pointer", opacity: isAdding || !newListingId.trim() ? 0.6 : 1,
            }}
          >
            {isAdding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
        {listings.length > 0 && (
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Imóveis do CRM: {listings.map((l) => `${l.name} (${l.id})`).join(" · ")}
          </p>
        )}
      </div>

      {/* Config cards */}
      {configs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <Building2 size={40} style={{ margin: "0 auto 0.75rem", opacity: 0.4 }} />
          <p>Nenhum imóvel configurado ainda.</p>
          <p style={{ fontSize: "0.8rem" }}>Adicione um imóvel acima para personalizar o formulário de check-in.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {configs.map((config) => (
            <div key={config.id} style={{
              background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
              borderRadius: 12, padding: "1.25rem",
              display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap",
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                  {config.listing_name || config.listing_id}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  ID: {config.listing_id}
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <ToggleChip
                  icon={<Car size={14} />}
                  label="Garagem"
                  checked={config.has_garage}
                  disabled={saving === config.id}
                  onChange={() => handleToggle(config, "has_garage")}
                />
                <ToggleChip
                  icon={<ScanFace size={14} />}
                  label="Biometria Facial"
                  checked={config.has_facial_biometrics}
                  disabled={saving === config.id}
                  onChange={() => handleToggle(config, "has_facial_biometrics")}
                />
              </div>

              {saving === config.id && <Loader2 size={16} className="animate-spin" style={{ color: "var(--brand-primary)" }} />}

              <button
                onClick={() => handleDelete(config)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", padding: "0.25rem",
                  display: "flex", alignItems: "center",
                }}
                title="Remover"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "1.5rem", padding: "1rem", background: "rgba(99,102,241,0.06)", borderRadius: 10, border: "1px solid rgba(99,102,241,0.15)" }}>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>
          <strong style={{ color: "var(--text-secondary)" }}>Como funciona:</strong> Quando o sistema envia o magic link de check-in, ele verifica a configuração do imóvel da reserva.
          Se <strong>Garagem</strong> estiver ativado, o formulário solicita placa, marca, modelo e cor do veículo.
          Se <strong>Biometria Facial</strong> estiver ativado, o formulário solicita uma selfie do hóspede.
          O ID do imóvel deve corresponder ao código alfanumérico do Stays.net (ex: UV02I).
        </p>
      </div>
    </div>
  );
}

function ToggleChip({
  icon, label, checked, disabled, onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: "0.4rem",
        padding: "0.35rem 0.75rem", borderRadius: 20, fontSize: "0.8rem", fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer", border: "1px solid",
        transition: "all 0.15s",
        background: checked ? "rgba(16,185,129,0.12)" : "var(--bg-tertiary)",
        borderColor: checked ? "rgba(16,185,129,0.35)" : "var(--border-color)",
        color: checked ? "#10b981" : "var(--text-muted)",
      }}
    >
      {icon} {label}
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: checked ? "#10b981" : "var(--border-color)",
        marginLeft: 2,
      }} />
    </button>
  );
}
