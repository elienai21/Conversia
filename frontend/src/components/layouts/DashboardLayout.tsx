// src/components/layouts/DashboardLayout.tsx
import { Outlet, NavLink } from "react-router-dom";
import { MessageSquare, Users, Settings, LogOut, LayoutDashboard, Sun, Moon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useTranslation } from "react-i18next";
import "./DashboardLayout.css";

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

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
      <aside className="dashboard-sidebar glass-panel">
        <div className="sidebar-header">
          <h2 className="brand-logo">Conversia</h2>
          <div className="tenant-badge">{user?.tenantId ? "Premium" : "Free"}</div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <LayoutDashboard size={20} />
            <span>{t("Dashboard")}</span>
          </NavLink>
          <NavLink to="/inbox" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <MessageSquare size={20} />
            <span>{t("Inbox")}</span>
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Users size={20} />
            <span>{t("Customers")}</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Settings size={20} />
            <span>{t("Settings")}</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">{user?.name?.charAt(0) || "A"}</div>
            <div className="user-info">
              <span className="user-name">{user?.name || "Agent"}</span>
              <span className="user-role">{user?.role || "Staff"}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="theme-toggle-btn btn-icon" onClick={toggleTheme} title="Toggle Theme">
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="logout-btn btn-icon" onClick={logout} title="Sign Out">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  );
}
