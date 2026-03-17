import { useState, useEffect } from "react";
import { MessageSquare, Users, Zap, Target, Clock, ArrowRight } from "lucide-react";
import { ApiService } from "@/services/api";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from "@/contexts/ThemeContext";
import "./DashboardPage.css";

type OverviewMetrics = {
  total_conversations: number;
  active_conversations: number;
  active_agents: number;
  total_agents: number;
  total_customers: number;
  avg_resolution_time_seconds: number;
  automation_rate: number;
};

type ChartDataPoint = {
  name: string;
  total: number;
  aiHandled: number;
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const { theme } = useTheme();

  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const [overview, volume] = await Promise.all([
          ApiService.get<OverviewMetrics>("/analytics/overview"),
          ApiService.get<ChartDataPoint[]>("/analytics/volume?days=7"),
        ]);
        setMetrics(overview);
        setChartData(volume);
      } catch (error) {
        console.error("Failed to load dashboard metrics:", error);
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
    total: theme === 'dark' ? '#0ea5e9' : '#0284c7',
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
          </div>
          <div className="metric-body">
            <h3>{metrics?.total_conversations.toLocaleString() ?? 0}</h3>
            <p>Total Conversations</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-emerald/10 text-emerald"><Zap size={20} /></div>
          </div>
          <div className="metric-body">
            <h3>{metrics?.automation_rate ?? 0}%</h3>
            <p>AI Automation Rate</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-amber/10 text-amber"><Clock size={20} /></div>
          </div>
          <div className="metric-body">
            <h3>{formatDuration(metrics?.avg_resolution_time_seconds ?? 0)}</h3>
            <p>Avg Resolution Time</p>
          </div>
        </div>

        <div className="metric-card glass-panel">
          <div className="metric-header">
            <div className="metric-icon bg-purple/10 text-purple"><Users size={20} /></div>
          </div>
          <div className="metric-body">
            <h3>{metrics?.active_agents ?? 0} / {metrics?.total_agents ?? 0}</h3>
            <p>Active Agents</p>
          </div>
        </div>
      </div>

      {/* Chart + Onboarding */}
      <div className="dashboard-content-grid mt-8">
        <div className="main-panel glass-panel">
          <div className="panel-header border-b border-border/10 pb-4 mb-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <Target size={18} className="text-brand-primary" /> Conversation Volume
            </h2>
          </div>
          <div className="chart-container" style={{ width: '100%', height: 300, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
              <div className="step-check">&#10003;</div>
              <span>Connect WhatsApp</span>
            </div>
            <div className="step-item completed">
              <div className="step-check">&#10003;</div>
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
