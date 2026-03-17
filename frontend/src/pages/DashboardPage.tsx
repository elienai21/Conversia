import { useState, useEffect } from "react";
import { MessageSquare, Users, Zap, ArrowUpRight, Target, Clock, ArrowRight } from "lucide-react";
import { ApiService } from "@/services/api";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from "@/contexts/ThemeContext";
import "./DashboardPage.css";

// Mock data types
type DashboardMetrics = {
  totalConversations: number;
  activeAgents: number;
  avgResolutionTime: string;
  automationRate: string;
};

const mockChartData = [
  { name: 'Mon', total: 120, aiHandled: 90 },
  { name: 'Tue', total: 150, aiHandled: 121 },
  { name: 'Wed', total: 180, aiHandled: 160 },
  { name: 'Thu', total: 130, aiHandled: 105 },
  { name: 'Fri', total: 210, aiHandled: 180 },
  { name: 'Sat', total: 250, aiHandled: 230 },
  { name: 'Sun', total: 220, aiHandled: 195 },
];

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const { theme } = useTheme();

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

  const chartColors = {
    total: theme === 'dark' ? '#6366f1' : '#4f46e5',
    ai: theme === 'dark' ? '#10b981' : '#059669',
    text: theme === 'dark' ? '#a1a1aa' : '#71717a',
    grid: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  };

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
          <div className="panel-header border-b border-border/10 pb-4 mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Target size={18} className="text-brand-primary" /> Conversation Volume
            </h2>
          </div>
          <div className="chart-container" style={{ width: '100%', height: 300, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.total} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={chartColors.total} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.ai} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={chartColors.ai} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Area type="monotone" dataKey="total" name="Total Conversations" stroke={chartColors.total} fillOpacity={1} fill="url(#colorTotal)" strokeWidth={2} />
                <Area type="monotone" dataKey="aiHandled" name="AI Handled" stroke={chartColors.ai} fillOpacity={1} fill="url(#colorAi)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
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
