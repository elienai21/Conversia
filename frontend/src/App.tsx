import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { BillingPage } from "./pages/BillingPage";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { InboxPage } from "./pages/InboxPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { SupportPage } from "./pages/SupportPage";
import { TaskQueuePage } from "./pages/TaskQueuePage";
import { GuestCheckinPage } from "./pages/GuestCheckinPage";
import { OperationalInboxPage } from "./pages/OperationalInboxPage";
import { OwnersInboxPage } from "./pages/OwnersInboxPage";
import { ServiceOrdersPage } from "./pages/ServiceOrdersPage";
import { StaffPage } from "./pages/StaffPage";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div className="page-container flex-center">Loading session...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  return <Outlet />;
};

const PublicRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return <div className="page-container flex-center">Loading session...</div>;
  if (isAuthenticated) return <Navigate to="/inbox" replace />;
  
  return <Outlet />;
};

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Routes>
              {/* Totalmente público — sem auth, sem layout interno */}
              <Route path="/checkin/:token" element={<GuestCheckinPage />} />

              {/* Public / Auth Routes */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>

              {/* Password reset — public but NOT redirected when authenticated */}
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected Main SaaS Routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/tasks" element={<TaskQueuePage />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/analytics" element={<AnalyticsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/support" element={<SupportPage />} />
                  <Route path="/operations" element={<OperationalInboxPage />} />
                  <Route path="/owners" element={<OwnersInboxPage />} />
                  <Route path="/service-orders" element={<ServiceOrdersPage />} />
                  <Route path="/staff" element={<StaffPage />} />
                  <Route path="/billing" element={<BillingPage />} />
                </Route>
              </Route>

              <Route path="/" element={<Navigate to="/inbox" replace />} />
              <Route path="*" element={<Navigate to="/inbox" replace />} />
            </Routes>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
