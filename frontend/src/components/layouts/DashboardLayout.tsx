// src/components/layouts/DashboardLayout.tsx
import { useState, useEffect, useCallback } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { MessageSquare, Users, Settings, LogOut, LayoutDashboard, Sun, Moon, BarChart3, HelpCircle, UserPlus, Target, ShoppingBag, HardHat, ClipboardList, Briefcase, CreditCard, Megaphone, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSocket } from "@/contexts/SocketContext";
import { useTranslation } from "react-i18next";
import { ApiService } from "@/services/api";
import { NewCustomerModal } from "@/components/NewCustomerModal";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { VerificationBanner } from "@/components/VerificationBanner";
import { AiModeToggle } from "@/components/AiModeToggle";
import "./DashboardLayout.css";


export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { socket } = useSocket();
  const { t } = useTranslation();
  const [openCount, setOpenCount] = useState(0);
  const [upsellCount, setUpsellCount] = useState(0);
  const [opsCount, setOpsCount] = useState(0);
  const [ownersCount, setOwnersCount] = useState(0);
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  const fetchOpenCount = useCallback(async () => {
    try {
      // Single query returns all scope counts — avoids 3 separate API calls
      const summary = await ApiService.get<{ main: number; operations: number; owners: number }>(
        "/conversations/unread-summary"
      );
      setOpenCount(summary.main);
      setOpsCount(summary.operations);
      setOwnersCount(summary.owners);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchOpenCount();
  }, [fetchOpenCount]);

  // Refresh count on real-time events
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchOpenCount();
    socket.on("conversation.new", refresh);
    socket.on("conversation.updated", refresh);
    socket.on("upsell.new", () => setUpsellCount((c) => c + 1));
    return () => {
      socket.off("conversation.new", refresh);
      socket.off("conversation.updated", refresh);
      socket.off("upsell.new", () => {});
    };
  }, [socket, fetchOpenCount]);

  return (
    <div className="dashboard-container">
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <h2 className="brand-logo">Conversia</h2>
        <div className="mobile-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="theme-toggle-btn btn-icon" onClick={toggleTheme} title="Toggle Theme">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="avatar" style={{ width: 32, height: 32, fontSize: "0.9rem" }}>
            {user?.name?.charAt(0) || "A"}
          </div>
          <button className="logout-btn" onClick={logout} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Sidebar (desktop) / Bottom Tab Bar (mobile) */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo-box">
            <MessageSquare size={24} color="#fff" strokeWidth={2.5} />
          </div>
          <div className="sidebar-brand-info">
            <h2 className="brand-logo">Conversia</h2>
            <p className="brand-subtitle">AI Assistant</p>
          </div>
        </div>

        <AiModeToggle />

        <nav className="sidebar-nav">
          <div className="nav-section">
            <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <LayoutDashboard size={20} />
              <span>{t("Dashboard")}</span>
            </NavLink>
            <NavLink to="/inbox" data-mobile-show className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <MessageSquare size={20} />
              <span>Hóspedes</span>
              {openCount > 0 && <span className="nav-badge">{openCount > 99 ? "99+" : openCount}</span>}
            </NavLink>
            <NavLink to="/tasks" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Target size={20} />
              <span>{t("Missões Diárias")}</span>
              {upsellCount > 0 && <span className="nav-badge" style={{ background: 'var(--accent-success)' }}>{upsellCount}</span>}
            </NavLink>
            <NavLink to="/customers" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Users size={20} />
              <span>{t("Customers")}</span>
            </NavLink>
            <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <BarChart3 size={20} />
              <span>{t("Analytics")}</span>
            </NavLink>
          </div>

          <div className="nav-section-divider">
            <span className="nav-section-label">OPERAÇÕES</span>
          </div>

          <div className="nav-section">
            <NavLink to="/owners" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Briefcase size={20} />
              <span>Inbox Diretoria</span>
              {ownersCount > 0 && <span className="nav-badge">{ownersCount > 99 ? "99+" : ownersCount}</span>}
            </NavLink>
            <NavLink to="/operations" data-mobile-show className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <HardHat size={20} />
              <span>Equipe</span>
              {opsCount > 0 && <span className="nav-badge">{opsCount > 99 ? "99+" : opsCount}</span>}
            </NavLink>
            <NavLink to="/service-orders" data-mobile-show className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <ClipboardList size={20} />
              <span>O.S.</span>
            </NavLink>
            <NavLink to="/staff" data-mobile-show className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Users size={20} />
              <span>Staff</span>
            </NavLink>
          </div>

          {user?.role === "admin" && (
            <>
              <div className="nav-section-divider">
                <span className="nav-section-label">SYSTEM</span>
              </div>

              <div className="nav-section">
                <NavLink to="/campaigns" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <Megaphone size={20} />
                  <span>Campanhas</span>
                </NavLink>
                <NavLink to="/audit-logs" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <ShieldCheck size={20} />
                  <span>Logs de Auditoria</span>
                </NavLink>
                <NavLink to="/billing" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <CreditCard size={20} />
                  <span>Plano & Cobrança</span>
                </NavLink>
                <NavLink to="/settings" data-mobile-show className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <Settings size={20} />
                  <span>{t("Settings")}</span>
                </NavLink>
                <NavLink to="/support" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
                  <HelpCircle size={20} />
                  <span>{t("Support")}</span>
                </NavLink>
              </div>
            </>
          )}

          <button className="new-customer-btn" onClick={() => setShowNewCustomer(true)}>
            <UserPlus size={18} />
            <span>New Customer</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="pro-plan-widget">
            {upsellCount > 0 ? (
              <>
                <p className="widget-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingBag size={16} style={{ color: 'var(--accent-success)' }} />
                  Upsells Adquiridos
                </p>
                <p className="widget-desc" style={{ color: 'var(--accent-success)', fontWeight: 600, fontSize: '1.25rem' }}>
                  {upsellCount} venda{upsellCount > 1 ? 's' : ''} hoje
                </p>
              </>
            ) : (
              <>
                <p className="widget-title">Pro Plan</p>
                <p className="widget-desc">{user?.tenantId ? "Premium features unlocked." : "You have 14 days left on your trial."}</p>
                {!user?.tenantId && <button className="widget-btn">Upgrade Now</button>}
              </>
            )}
          </div>

          <div className="user-profile-bar">
            <div className="user-profile">
              <div className="avatar">{user?.name?.charAt(0) || "A"}</div>
              <div className="user-info">
                <span className="user-name">{user?.name || "Agent"}</span>
                <span className="user-role">{user?.role || "Staff"}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button className="theme-toggle-btn btn-icon" onClick={toggleTheme} title="Toggle Theme">
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button className="logout-btn btn-icon" onClick={logout} title="Sign Out">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <VerificationBanner />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Outlet />
        </div>
      </main>

      <NewCustomerModal
        open={showNewCustomer}
        onClose={() => setShowNewCustomer(false)}
        onCreated={() => {
          window.dispatchEvent(new CustomEvent("customer-created"));
        }}
      />

      <InstallPrompt />
      {user?.role === "admin" && <OnboardingWizard />}
    </div>
  );
}
