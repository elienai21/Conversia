import { useState, useEffect } from "react";
import { X, UserCog, Phone, User, Mail, AtSign, Tag, Shield } from "lucide-react";
import { ApiService } from "@/services/api";
import { useContactOptions } from "@/hooks/useContactOptions";
import "./NewCustomerModal.css";

type CustomerData = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  social_media: string | null;
  tag: string | null;
  role?: string | null;
};

type Props = {
  open: boolean;
  customer: CustomerData | null;
  onClose: () => void;
  onUpdated: () => void;
};

export function EditCustomerModal({ open, customer, onClose, onUpdated }: Props) {
  const { options } = useContactOptions();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [socialMedia, setSocialMedia] = useState("");
  const [tag, setTag] = useState("");
  const [role, setRole] = useState("guest");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setPhone(customer.phone || "");
      setName(customer.name || "");
      setEmail(customer.email || "");
      setSocialMedia(customer.social_media || "");
      setTag(customer.tag || "");
      setRole(customer.role || "guest");
      setError("");
    }
  }, [customer]);

  if (!open || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError("Phone number is required.");
      return;
    }

    setSaving(true);
    try {
      await ApiService.patch(`/customers/${customer.id}`, {
        phone: trimmedPhone,
        name: name.trim() || null,
        email: email.trim() || null,
        social_media: socialMedia.trim() || null,
        tag: tag || null,
        role: role || "guest",
      });
      onUpdated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update customer";
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
        setError("Another customer with this phone number already exists.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel animate-fade-in">
        <div className="modal-header">
          <div className="modal-title-row">
            <UserCog size={20} className="text-brand-primary" />
            <h2>Editar Contato</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-fields-grid">
            <div className="modal-field">
              <label htmlFor="ec-phone">
                <Phone size={14} />
                Telefone <span className="required">*</span>
              </label>
              <input
                id="ec-phone"
                type="tel"
                placeholder="+55 11 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-field">
              <label htmlFor="ec-name">
                <User size={14} />
                Nome
              </label>
              <input
                id="ec-name"
                type="text"
                placeholder="Nome do contato"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-field">
            <label htmlFor="ec-email">
              <Mail size={14} />
              Email
            </label>
            <input
              id="ec-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <label htmlFor="ec-social">
              <AtSign size={14} />
              Rede Social
            </label>
            <input
              id="ec-social"
              type="text"
              placeholder="@usuario ou URL do perfil"
              value={socialMedia}
              onChange={(e) => setSocialMedia(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <label>
              <Tag size={14} />
              Tag
            </label>
            <div className="tag-chips">
              {options.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`tag-chip ${tag === t ? "selected" : ""}`}
                  onClick={() => setTag(tag === t ? "" : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-field">
            <label>
              <Shield size={14} />
              Tipo de contato
            </label>
            <div className="tag-chips">
              {options.roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`tag-chip ${role === r.value ? "selected" : ""}`}
                  onClick={() => setRole(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="modal-btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
