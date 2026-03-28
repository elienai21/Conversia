import { useState, useEffect } from "react";
import { Plus, Trash2, Tag, Shield, Loader2, Check } from "lucide-react";
import { ApiService } from "@/services/api";
import type { RoleOption } from "@/hooks/useContactOptions";
import "./ContactOptionsTab.css";

const DEFAULT_TAGS = ["VIP", "Lead", "Premium", "Regular", "Novo", "Equipe", "Diretoria", "Parceiro"];
const DEFAULT_ROLES: RoleOption[] = [
  { value: "guest", label: "Hóspede" },
  { value: "owner", label: "Proprietário" },
  { value: "staff", label: "Funcionário" },
  { value: "lead", label: "Lead" },
];

export function ContactOptionsTab() {
  const [tags, setTags] = useState<string[]>(DEFAULT_TAGS);
  const [roles, setRoles] = useState<RoleOption[]>(DEFAULT_ROLES);
  const [newTag, setNewTag] = useState("");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newRoleValue, setNewRoleValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ApiService.get<{ tags: string[]; roles: RoleOption[] }>("/tenants/me/contact-options")
      .then((data) => {
        setTags(data.tags);
        setRoles(data.roles);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddRole = () => {
    const label = newRoleLabel.trim();
    if (!label) return;
    const value = newRoleValue.trim() || label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (roles.some((r) => r.value === value)) return;
    setRoles([...roles, { value, label }]);
    setNewRoleLabel("");
    setNewRoleValue("");
  };

  const handleRemoveRole = (value: string) => {
    setRoles(roles.filter((r) => r.value !== value));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await ApiService.put("/tenants/me/contact-options", { tags, roles });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="contact-options-loading">
        <Loader2 size={24} className="spinning" />
      </div>
    );
  }

  return (
    <div className="contact-options-tab">
      <div className="contact-options-header">
        <h2>Tags &amp; Tipos de Contato</h2>
        <p>Personalize as opções disponíveis ao criar ou editar contatos.</p>
      </div>

      {/* Tags Section */}
      <div className="contact-options-card">
        <div className="contact-options-card-header">
          <Tag size={18} />
          <h3>Tags</h3>
        </div>
        <p className="contact-options-desc">Etiquetas para categorizar seus contatos.</p>

        <div className="contact-options-chips">
          {tags.map((tag) => (
            <span key={tag} className="contact-option-chip">
              {tag}
              <button type="button" onClick={() => handleRemoveTag(tag)} title="Remover">
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {tags.length === 0 && <span className="contact-options-empty">Nenhuma tag cadastrada.</span>}
        </div>

        <div className="contact-options-add-row">
          <input
            type="text"
            placeholder="Nova tag (ex: Investidor)"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
            className="contact-options-input"
          />
          <button type="button" className="contact-options-add-btn" onClick={handleAddTag}>
            <Plus size={16} /> Adicionar
          </button>
        </div>
      </div>

      {/* Roles Section */}
      <div className="contact-options-card">
        <div className="contact-options-card-header">
          <Shield size={18} />
          <h3>Tipos de Contato</h3>
        </div>
        <p className="contact-options-desc">Categorias de tipo de contato (ex: Hóspede, Proprietário).</p>

        <div className="contact-options-list">
          {roles.map((role) => (
            <div key={role.value} className="contact-option-row">
              <span className="contact-option-label">{role.label}</span>
              <span className="contact-option-value">{role.value}</span>
              <button type="button" className="contact-option-delete" onClick={() => handleRemoveRole(role.value)} title="Remover">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {roles.length === 0 && <span className="contact-options-empty">Nenhum tipo cadastrado.</span>}
        </div>

        <div className="contact-options-add-role">
          <input
            type="text"
            placeholder="Rótulo (ex: Inquilino)"
            value={newRoleLabel}
            onChange={(e) => setNewRoleLabel(e.target.value)}
            className="contact-options-input"
          />
          <input
            type="text"
            placeholder="Valor interno (ex: inquilino)"
            value={newRoleValue}
            onChange={(e) => setNewRoleValue(e.target.value)}
            className="contact-options-input"
          />
          <button type="button" className="contact-options-add-btn" onClick={handleAddRole}>
            <Plus size={16} /> Adicionar
          </button>
        </div>
        <p className="contact-options-hint">
          O "Valor interno" é usado no banco de dados. Se deixar em branco, será gerado automaticamente a partir do rótulo.
        </p>
      </div>

      <div className="contact-options-footer">
        <button className="contact-options-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? (
            <><Loader2 size={16} className="spinning" /> Salvando...</>
          ) : saved ? (
            <><Check size={16} /> Salvo!</>
          ) : (
            "Salvar Alterações"
          )}
        </button>
      </div>
    </div>
  );
}
