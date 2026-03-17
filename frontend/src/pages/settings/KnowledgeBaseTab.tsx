import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2, Plus, Edit2, Trash2, X } from "lucide-react";
import "./KnowledgeBaseTab.css";

type KBEntry = {
  id: string;
  title: string;
  content: string;
  category: string;
  is_active: boolean;
  created_at: string;
};

const CATEGORIES = ["rooms", "menu", "policies", "services", "faq", "other"];

export function KnowledgeBaseTab() {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("All");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
  
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState("other");
  const [formContent, setFormContent] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.get<KBEntry[]>("/tenants/me/knowledge-base");
      setEntries(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (entry?: KBEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormTitle(entry.title);
      setFormCategory(entry.category);
      setFormContent(entry.content);
      setFormActive(entry.is_active);
    } else {
      setEditingEntry(null);
      setFormTitle("");
      setFormCategory("other");
      setFormContent("");
      setFormActive(true);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        title: formTitle,
        category: formCategory,
        content: formContent,
        is_active: formActive
      };

      if (editingEntry) {
        await ApiService.patch(`/tenants/me/knowledge-base/${editingEntry.id}`, payload);
      } else {
        await ApiService.post("/tenants/me/knowledge-base", payload);
      }
      
      handleCloseModal();
      fetchEntries();
    } catch (error) {
      console.error(error);
      alert("Failed to save entry.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    
    try {
      await ApiService.delete(`/tenants/me/knowledge-base/${id}`);
      fetchEntries();
    } catch (error) {
      console.error(error);
      alert("Failed to delete entry.");
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await ApiService.patch(`/tenants/me/knowledge-base/${id}`, { is_active: !currentActive });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, is_active: !currentActive } : e));
    } catch (error) {
      console.error(error);
    }
  };

  const filteredEntries = filterCategory === "All" 
    ? entries 
    : entries.filter(e => e.category === filterCategory.toLowerCase());

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container kb-tab">
      <div className="tab-header flex-between">
        <div>
          <h1>Knowledge Base</h1>
          <p>Train your AI Copilot with business context and answers.</p>
        </div>
        <button className="btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} /> New Entry
        </button>
      </div>

      <div className="kb-filters">
        <div className="filter-chips">
          {["All", ...CATEGORIES.map(c => c.charAt(0).toUpperCase() + c.slice(1))].map(cat => (
            <button 
              key={cat} 
              className={`filter-chip ${filterCategory === cat ? 'active' : ''}`}
              onClick={() => setFilterCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="kb-grid">
        {filteredEntries.length === 0 ? (
          <div className="empty-state-list w-full col-span-full">No knowledge entries found.</div>
        ) : (
          filteredEntries.map(entry => (
            <div key={entry.id} className={`kb-card glass-panel ${!entry.is_active ? 'inactive' : ''}`}>
              <div className="kb-card-header">
                <div>
                  <span className="kb-category">{entry.category.toUpperCase()}</span>
                  <h3 className="kb-title">{entry.title}</h3>
                </div>
                <div className="kb-actions">
                  <button className="icon-btn edit-btn" onClick={() => handleOpenModal(entry)}><Edit2 size={16} /></button>
                  <button className="icon-btn delete-btn" onClick={() => handleDelete(entry.id, entry.title)}><Trash2 size={16} /></button>
                </div>
              </div>
              <p className="kb-content-preview">{entry.content}</p>
              <div className="kb-card-footer">
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={entry.is_active} 
                    onChange={() => handleToggleActive(entry.id, entry.is_active)} 
                  />
                  <span className="slider"></span>
                </label>
                <span className="text-muted text-xs">{entry.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h2>{editingEntry ? "Edit Entry" : "New Knowledge Entry"}</h2>
              <button className="close-btn" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <form onSubmit={handleSave} className="settings-form mt-4">
              <div className="form-group">
                <label>Title</label>
                <input required type="text" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="e.g. Standard Check-in Time" />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Content / Answer</label>
                <textarea 
                  required 
                  rows={6} 
                  value={formContent} 
                  onChange={e => setFormContent(e.target.value)} 
                  placeholder="The detailed answer or context..."
                />
              </div>
              <div className="form-group row flex items-center gap-2">
                <input type="checkbox" id="activeCheckbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                <label htmlFor="activeCheckbox">Active (AI will use this)</label>
              </div>
              <div className="form-actions border-t border-[var(--border-color)] pt-4 mt-2">
                <button type="button" className="btn-secondary mr-2" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isSaving}>
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Save Entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
