import { useState, useEffect } from "react";
import { MessageSquare, Users, Zap, ArrowUpRight, Target, Clock, ArrowRight } from "lucide-react";
import { ApiService } from "@/services/api";
import { Link } from "react-router-dom";
import "./DashboardPage.css";

// Mock data types
type DashboardMetrics = {
  totalConversations: number;
  activeAgents: number;
  avgResolutionTime: string;
  automationRate: string;
};

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    // Simulando chamada à API de métricas
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        // Na prática seria: const res = await ApiService.get("/analytics/overview");
        await new Promise(r => setTimeout(r, 600)); 
        setMetrics({
          totalConversations: 1284,
          activeAgents: 3,
          avgResolutionTime: "4m 12s",
          automationRate: "85%"
        });
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (isLoading) {
    return (
      <div className="page-container flex-center w-full">
        <div className="animate-pulse-subtle flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-brand-primary animate-spin"></div>
          <p className="text-muted text-sm">Loading insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page animate-fade-in scrollable-content">
      <div className="dashboard-header flex-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Welcome back, Agent.</h1>
          <p className="text-muted">Here's what's happening in your tenant today.</p>
        </div>
        <Link to="/inbox" className="btn-primary">
          Open Inbox <ArrowRight size={16} />
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid mt-8">
        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-brand/10 text-brand"><MessageSquare size={20} /></div>
            <span className="metric-trend positive"><ArrowUpRight size={14} /> +12%</span>
          </div>
          <div className="metric-body">
            <h3>{metrics?.totalConversations.toLocaleString()}</h3>
            <p>Total Conversations</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-emerald/10 text-emerald"><Zap size={20} /></div>
            <span className="metric-trend positive"><ArrowUpRight size={14} /> +5%</span>
          </div>
          <div className="metric-body">
            <h3>{metrics?.automationRate}</h3>
            <p>AI Automation Rate</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-amber/10 text-amber"><Clock size={20} /></div>
            <span className="metric-trend neutral">-</span>
          </div>
          <div className="metric-body">
            <h3>{metrics?.avgResolutionTime}</h3>
            <p>Avg Resolution Time</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-purple/10 text-purple"><Users size={20} /></div>
          </div>
          <div className="metric-body">
            <h3>{metrics?.activeAgents}</h3>
            <p>Active Agents</p>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recent Activity Area */}
      <div className="dashboard-content-grid mt-8">
        <div className="main-panel glass-panel">
          <div className="panel-header border-b border-white/10 pb-4 mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Target size={18} className="text-brand-primary" /> Copilot Insights
            </h2>
          </div>
          <div className="insight-card">
            <h4>Highest AI Resolution Topics</h4>
            <div className="progress-bar-container mt-4">
              <div className="flex-between text-sm mb-1"><span>Breakfast Inquiries</span> <span className="font-medium text-brand">92% AI Handled</span></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: '92%' }}></div></div>
              
              <div className="flex-between text-sm mb-1 mt-4"><span>Check-in Instructions</span> <span className="font-medium text-brand">88% AI Handled</span></div>
              <div className="progress-track"><div className="progress-fill emerald" style={{ width: '88%' }}></div></div>
              
              <div className="flex-between text-sm mb-1 mt-4"><span>Room Upgrades (Human Handover)</span> <span className="font-medium text-amber">15% AI Handled</span></div>
              <div className="progress-track"><div className="progress-fill amber" style={{ width: '15%' }}></div></div>
            </div>
            <p className="insight-hint mt-6 text-sm text-muted">
              💡 Tip: Add more knowledge base entries about Room Upgrades to improve AI automation rate.
            </p>
          </div>
        </div>

        <div className="side-panel glass-panel">
          <div className="panel-header border-b border-white/10 pb-4 mb-4">
            <h2 className="text-lg font-medium">Getting Started</h2>
          </div>
          <div className="onboarding-steps">
            <div className="step-item completed">
              <div className="step-check">✓</div>
              <span>Connect WhatsApp</span>
            </div>
            <div className="step-item completed">
              <div className="step-check">✓</div>
              <span>Configure OpenAI API</span>
            </div>
            <Link to="/settings" className="step-item active">
              <div className="step-check pulse"></div>
              <span>Add Knowledge Base Entries</span>
            </Link>
            <div className="step-item">
              <div className="step-check empty"></div>
              <span>Invite Team Members</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
