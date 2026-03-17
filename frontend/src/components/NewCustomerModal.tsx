import { useState } from "react";
import { X, UserPlus, Phone, User, Mail, AtSign, Tag } from "lucide-react";
import { ApiService } from "@/services/api";
import "./NewCustomerModal.css";

const TAG_OPTIONS = ["VIP", "Lead", "Premium", "Regular", "New"];

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function NewCustomerModal({ open, onClose, onCreated }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [socialMedia, setSocialMedia] = useState("");
  const [tag, setTag] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setPhone("");
    setName("");
    setEmail("");
    setSocialMedia("");
    setTag("");
    setError("");
  };

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
      await ApiService.post("/customers", {
        phone: trimmedPhone,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        social_media: socialMedia.trim() || undefined,
        tag: tag || undefined,
      });
      resetForm();
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create customer";
      if (msg.includes("409") || msg.toLowerCase().includes("already exists")) {
        setError("A customer with this phone number already exists.");
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
            <UserPlus size={20} className="text-brand-primary" />
            <h2>New Customer</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="modal-fields-grid">
            <div className="modal-field">
              <label htmlFor="nc-phone">
                <Phone size={14} />
                Phone <span className="required">*</span>
              </label>
              <input
                id="nc-phone"
                type="tel"
                placeholder="+55 11 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>

            <div className="modal-field">
              <label htmlFor="nc-name">
                <User size={14} />
                Name
              </label>
              <input
                id="nc-name"
                type="text"
                placeholder="Customer name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-field">
            <label htmlFor="nc-email">
              <Mail size={14} />
              Email
            </label>
            <input
              id="nc-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="modal-field">
            <label htmlFor="nc-social">
              <AtSign size={14} />
              Social Media
            </label>
            <input
              id="nc-social"
              type="text"
              placeholder="@username or profile URL"
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
              {TAG_OPTIONS.map((t) => (
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

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="modal-btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="modal-btn-primary" disabled={saving}>
              {saving ? "Creating..." : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
