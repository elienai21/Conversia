import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import "./TeamTab.css";

type Agent = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_online: boolean;
};

export function TeamTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [invitePassword, setInvitePassword] = useState(""); // Temporary password for simplicity
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.get<Agent[]>("/tenants/me/agents");
      setAgents(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInviting(true);
    try {
      await ApiService.post("/tenants/me/agents", {
        email: inviteEmail,
        full_name: inviteName,
        password: invitePassword,
        role: inviteRole
      });
      alert("Agent created successfully!");
      setIsModalOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePassword("");
      fetchAgents();
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Failed to create agent");
    } finally {
      setIsInviting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to completely deactivate ${name}?`)) return;
    try {
      await ApiService.delete(`/tenants/me/agents/${id}`);
      fetchAgents();
    } catch (error) {
      console.error(error);
      alert("Failed to deactivate agent.");
    }
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container team-tab">
      <div className="tab-header flex-between">
        <div>
          <h1>Team & Agents</h1>
          <p>Manage your agents, admins, and roles.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <UserPlus size={18} /> Invite Agent
        </button>
      </div>

      <div className="agents-list glass-panel">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(agent => (
              <tr key={agent.id} className={!agent.is_active ? "inactive" : ""}>
                <td className="font-medium text-[var(--text-primary)]">
                  {agent.full_name}
                </td>
                <td className="text-sm text-[var(--text-secondary)]">{agent.email}</td>
                <td>
                  <span className={`role-badge ${agent.role}`}>{agent.role.toUpperCase()}</span>
                </td>
                <td>
                  {agent.is_active ? 
                    (agent.is_online ? <span className="status-badge connected">Online</span> : <span className="status-badge inactive">Offline</span>) : 
                    <span className="status-badge error">Deactivated</span>
                  }
                </td>
                <td className="text-right">
                  <button className="icon-btn delete-btn" title="Deactivate" onClick={() => handleDelete(agent.id, agent.full_name)}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <div className="modal-header">
              <h2>Invite New Agent</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleInvite} className="settings-form mt-4">
              <div className="form-group">
                <label>Full Name</label>
                <input required type="text" value={inviteName} onChange={e => setInviteName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input required type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Temporary Password</label>
                <input required type="text" value={invitePassword} onChange={e => setInvitePassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  <option value="agent">Agent (Replies to customers)</option>
                  <option value="admin">Admin (Full Access & Settings)</option>
                </select>
              </div>
              <div className="form-actions mt-6">
                <button type="button" className="btn-secondary mr-2" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isInviting}>
                  {isInviting ? <Loader2 size={16} className="animate-spin" /> : "Create Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
