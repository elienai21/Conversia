import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ShieldAlert, Settings, Webhook, BookOpen, Users, Bot, Zap } from "lucide-react";
import { GeneralTab } from "./settings/GeneralTab";
import { IntegrationsTab } from "./settings/IntegrationsTab";
import { KnowledgeBaseTab } from "./settings/KnowledgeBaseTab";
import { TeamTab } from "./settings/TeamTab";
import { AISettingsTab } from "./settings/AISettingsTab";
import { QuickRepliesTab } from "./settings/QuickRepliesTab";
import "./SettingsPage.css";

type TabId = "general" | "integrations" | "knowledge-base" | "team" | "ai" | "quick-replies";

export function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("general");

  if (user?.role !== "admin") {
    return (
      <div className="page-container flex-center">
        <div className="admin-required-card glass-panel">
          <ShieldAlert size={48} className="text-warning mb-4" />
          <h2>Admin Access Required</h2>
          <p>You don't have permission to view or edit tenant settings.</p>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "general": return <GeneralTab />;
      case "integrations": return <IntegrationsTab />;
      case "knowledge-base": return <KnowledgeBaseTab />;
      case "team": return <TeamTab />;
      case "ai": return <AISettingsTab />;
      case "quick-replies": return <QuickRepliesTab />;
      default: return null;
    }
  };

  return (
    <div className="settings-page-container">
      <div className="settings-sidebar">
        <h2 className="settings-title">Settings</h2>
        <nav className="settings-nav">
          <button 
            className={`settings-tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <Settings size={18} /> General
          </button>
          <button 
            className={`settings-tab-btn ${activeTab === "integrations" ? "active" : ""}`}
            onClick={() => setActiveTab("integrations")}
          >
            <Webhook size={18} /> Integrations
          </button>
          <button 
            className={`settings-tab-btn ${activeTab === "knowledge-base" ? "active" : ""}`}
            onClick={() => setActiveTab("knowledge-base")}
          >
            <BookOpen size={18} /> Knowledge Base
          </button>
          <button 
            className={`settings-tab-btn ${activeTab === "team" ? "active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            <Users size={18} /> Team & Agents
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "ai" ? "active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            <Bot size={18} /> AI Settings
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "quick-replies" ? "active" : ""}`}
            onClick={() => setActiveTab("quick-replies")}
          >
            <Zap size={18} /> Quick Replies
          </button>
        </nav>
      </div>

      <div className="settings-content-area">
        {renderTabContent()}
      </div>
    </div>
  );
}
