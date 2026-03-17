import { useState, useEffect } from "react";
import { BarChart3, MessageSquare, Users, Zap, Clock, TrendingUp, Bot } from "lucide-react";
import { ApiService } from "@/services/api";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useTheme } from "@/contexts/ThemeContext";
import "./AnalyticsPage.css";

type OverviewMetrics = {
  total_conversations: number;
  active_conversations: number;
  queued_conversations: number;
  closed_conversations: number;
  active_agents: number;
  total_agents: number;
  total_customers: number;
  avg_resolution_time_seconds: number;
  suggestions_used: number;
  suggestions_total: number;
  automation_rate: number;
};

type VolumePoint = {
  date: string;
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

export function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [volume7d, setVolume7d] = useState<VolumePoint[]>([]);
  const [volume30d, setVolume30d] = useState<VolumePoint[]>([]);
  const [period, setPeriod] = useState<"7" | "30">("7");
  const { theme } = useTheme();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [overview, vol7, vol30] = await Promise.all([
          ApiService.get<OverviewMetrics>("/analytics/overview"),
          ApiService.get<VolumePoint[]>("/analytics/volume?days=7"),
          ApiService.get<VolumePoint[]>("/analytics/volume?days=30"),
        ]);
        setMetrics(overview);
        setVolume7d(vol7);
        setVolume30d(vol30);
      } catch (err) {
        console.error("Failed to load analytics:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="page-container flex-center w-full">
        <div className="animate-pulse-subtle flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-t-2 border-brand-primary animate-spin"></div>
          <p className="text-muted text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const chartColors = {
    total: theme === "dark" ? "#0ea5e9" : "#0284c7",
    ai: theme === "dark" ? "#10b981" : "#059669",
    text: theme === "dark" ? "#a1a1aa" : "#71717a",
    grid: theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
  };

  const volumeData = period === "7" ? volume7d : volume30d;

  const statusData = metrics
    ? [
        { name: "Active", value: metrics.active_conversations, color: "#10b981" },
        { name: "Queued", value: metrics.queued_conversations, color: "#f59e0b" },
        { name: "Closed", value: metrics.closed_conversations, color: "#6b7280" },
      ]
    : [];

  return (
    <div className="analytics-page animate-fade-in scrollable-content">
      <div className="analytics-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Analytics</h1>
          <p className="text-muted">Performance overview and conversation insights.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="analytics-kpi-grid">
        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(14,165,233,0.1)" }}>
            <MessageSquare size={20} color="#0ea5e9" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{metrics?.total_conversations.toLocaleString() ?? 0}</span>
            <span className="kpi-label">Total Conversations</span>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(16,185,129,0.1)" }}>
            <TrendingUp size={20} color="#10b981" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{metrics?.active_conversations ?? 0}</span>
            <span className="kpi-label">Active Now</span>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(245,158,11,0.1)" }}>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{formatDuration(metrics?.avg_resolution_time_seconds ?? 0)}</span>
            <span className="kpi-label">Avg Resolution</span>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(168,85,247,0.1)" }}>
            <Users size={20} color="#a855f7" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{metrics?.total_customers?.toLocaleString() ?? 0}</span>
            <span className="kpi-label">Customers</span>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(16,185,129,0.1)" }}>
            <Bot size={20} color="#10b981" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{metrics?.automation_rate ?? 0}%</span>
            <span className="kpi-label">AI Automation</span>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrap" style={{ background: "rgba(99,102,241,0.1)" }}>
            <Zap size={20} color="#6366f1" />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{metrics?.suggestions_used ?? 0} / {metrics?.suggestions_total ?? 0}</span>
            <span className="kpi-label">AI Suggestions Used</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="analytics-charts-grid">
        {/* Volume Chart */}
        <div className="chart-panel glass-panel">
          <div className="chart-panel-header">
            <h2>
              <BarChart3 size={18} className="text-brand-primary" />
              Conversation Volume
            </h2>
            <div className="period-toggle">
              <button className={period === "7" ? "active" : ""} onClick={() => setPeriod("7")}>
                7 days
              </button>
              <button className={period === "30" ? "active" : ""} onClick={() => setPeriod("30")}>
                30 days
              </button>
            </div>
          </div>
          <div style={{ width: "100%", height: 300, marginTop: "1rem" }}>
            <ResponsiveContainer width="100%" height="100%">
              {period === "7" ? (
                <AreaChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.total} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColors.total} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="areaAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColors.ai} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartColors.ai} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--glass-border)", borderRadius: "8px", color: "var(--text-primary)" }}
                    itemStyle={{ color: "var(--text-primary)" }}
                  />
                  <Area type="monotone" dataKey="total" name="Total" stroke={chartColors.total} fillOpacity={1} fill="url(#areaTotal)" strokeWidth={2} />
                  <Area type="monotone" dataKey="aiHandled" name="AI Handled" stroke={chartColors.ai} fillOpacity={1} fill="url(#areaAi)" strokeWidth={2} />
                </AreaChart>
              ) : (
                <BarChart data={volumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" stroke={chartColors.text} fontSize={11} tickLine={false} axisLine={false} interval={2} />
                  <YAxis stroke={chartColors.text} fontSize={12} tickLine={false} axisLine={false} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--glass-border)", borderRadius: "8px", color: "var(--text-primary)" }}
                    itemStyle={{ color: "var(--text-primary)" }}
                  />
                  <Bar dataKey="total" name="Total" fill={chartColors.total} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="aiHandled" name="AI Handled" fill={chartColors.ai} radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="chart-panel glass-panel">
          <div className="chart-panel-header">
            <h2>
              <TrendingUp size={18} className="text-brand-primary" />
              Status Breakdown
            </h2>
          </div>
          <div style={{ width: "100%", height: 220, marginTop: "1rem" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {statusData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--glass-border)", borderRadius: "8px", color: "var(--text-primary)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="pie-legend">
            {statusData.map((d) => (
              <div key={d.name} className="pie-legend-item">
                <span className="pie-dot" style={{ background: d.color }} />
                <span>{d.name}</span>
                <span className="pie-val">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Performance */}
      <div className="analytics-agents glass-panel">
        <div className="chart-panel-header">
          <h2>
            <Users size={18} className="text-brand-primary" />
            Agent Overview
          </h2>
        </div>
        <div className="agent-stats-row">
          <div className="agent-stat">
            <span className="agent-stat-value">{metrics?.active_agents ?? 0}</span>
            <span className="agent-stat-label">Online</span>
          </div>
          <div className="agent-stat">
            <span className="agent-stat-value">{metrics?.total_agents ?? 0}</span>
            <span className="agent-stat-label">Total Agents</span>
          </div>
          <div className="agent-stat">
            <span className="agent-stat-value">{metrics?.queued_conversations ?? 0}</span>
            <span className="agent-stat-label">In Queue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
