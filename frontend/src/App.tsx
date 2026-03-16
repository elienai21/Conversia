import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";
import { LoginPage } from "./pages/LoginPage";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { InboxPage } from "./pages/InboxPage";

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
    <AuthProvider>
      <SocketProvider>
      <BrowserRouter>
        <Routes>
          {/* Public / Auth Routes */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          {/* Protected Main SaaS Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<div className="page-container flex-center"><h1>Dashboard coming soon</h1></div>} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/customers" element={<div className="page-container flex-center"><h1>Customers coming soon</h1></div>} />
              <Route path="/settings" element={<div className="page-container flex-center"><h1>Settings coming soon</h1></div>} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
