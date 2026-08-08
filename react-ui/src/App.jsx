import React, { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Mail, UploadCloud, Database, Table2, Send, FileText, Shield, LogOut } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import Brands from './components/Brands';
import SMTPSettings from './components/SMTPSettings';
import EmailTemplatesSettings from './components/EmailTemplatesSettings';
import EmailActivity from './components/EmailActivity';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import AccountSettings from './components/AccountSettings';
import { clearStoredAuthSession, getStoredAuthSession, storeAuthSession } from './utils/auth';
import { installAuthenticatedFetch, parseApiError } from './utils/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/brands', label: 'Brands', icon: Table2 },
  { to: '/upload', label: 'Upload CSV', icon: UploadCloud },
  { to: '/emails', label: 'Email Activity', icon: Send },
  { to: '/settings/smtp', label: 'SMTP Settings', icon: Mail },
  { to: '/settings/email-templates', label: 'Email Templates', icon: FileText },
  { to: '/settings/account', label: 'Admin Security', icon: Shield },
];

function RequireAuth({ isAuthenticated, authReady, children }) {
  const location = useLocation();

  if (!authReady) {
    return (
      <div className="auth-shell auth-shell--loading">
        <div className="spinner spin-center" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function AppLayout({ apiUrl, admin, onLogout, onAdminRefresh }) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="logo-icon">
            <Database size={18} />
          </div>
          <div className="logo-text sidebar-brand__text">
            <h1>Brand Intelligence</h1>
            <span>Distributor Research System</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`sidebar-link ${location.pathname === to ? 'active' : ''}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="app-sidebar__spacer" />

        <div className="sidebar-footer surface-card">
          <div className="sidebar-user">
            <strong>{admin?.name || 'Admin'}</strong>
            <span>{admin?.email || ''}</span>
          </div>
          <button className="btn-primary btn-secondary sidebar-logout" type="button" onClick={onLogout}>
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-container app-content">
        <Routes>
          <Route path="/" element={<Dashboard apiUrl={apiUrl} />} />
          <Route path="/brands" element={<Brands apiUrl={apiUrl} />} />
          <Route path="/emails" element={<EmailActivity apiUrl={apiUrl} />} />
          <Route path="/upload" element={<Upload apiUrl={apiUrl} />} />
          <Route path="/processing" element={<Navigate to="/brands" replace />} />
          <Route path="/settings/smtp" element={<SMTPSettings apiUrl={apiUrl} />} />
          <Route path="/settings/email-templates" element={<EmailTemplatesSettings apiUrl={apiUrl} />} />
          <Route path="/settings/account" element={<AccountSettings apiUrl={apiUrl} admin={admin} onAdminRefresh={onAdminRefresh} />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const apiUrl = '/api';
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(() => getStoredAuthSession());

  useEffect(() => {
    installAuthenticatedFetch();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredAuthSession();
      setSession(null);
      navigate('/login', { replace: true });
    };

    window.addEventListener('brand-auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('brand-auth-unauthorized', handleUnauthorized);
  }, [navigate]);

  useEffect(() => {
    const initialize = async () => {
      const stored = getStoredAuthSession();
      if (!stored?.token) {
        setSession(null);
        setAuthReady(true);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/auth/me`);
        if (!response.ok) {
          throw new Error(await parseApiError(response, 'Session expired'));
        }
        const admin = await response.json();
        const nextSession = { token: stored.token, admin };
        storeAuthSession(nextSession);
        setSession(nextSession);
      } catch {
        clearStoredAuthSession();
        setSession(null);
      } finally {
        setAuthReady(true);
      }
    };

    initialize();
  }, []);

  const isAuthenticated = Boolean(session?.token);

  const authHandlers = useMemo(() => ({
    onLogin: (nextSession) => {
      storeAuthSession(nextSession);
      setSession(nextSession);
      navigate('/', { replace: true });
    },
    onAdminRefresh: (admin) => {
      setSession((current) => {
        const nextSession = { ...(current || {}), admin };
        storeAuthSession(nextSession);
        return nextSession;
      });
    },
  }), [navigate]);

  const handleLogout = async () => {
    try {
      await fetch(`${apiUrl}/auth/logout`, { method: 'POST' });
    } catch {
      // Best-effort logout.
    }
    clearStoredAuthSession();
    setSession(null);
    navigate('/login', { replace: true });
  };

  return (
    <Routes>
      <Route path="/login" element={<Login apiUrl={apiUrl} isAuthenticated={isAuthenticated} onLogin={authHandlers.onLogin} />} />
      <Route path="/forgot-password" element={<ForgotPassword apiUrl={apiUrl} isAuthenticated={isAuthenticated} />} />
      <Route
        path="/*"
        element={(
          <RequireAuth isAuthenticated={isAuthenticated} authReady={authReady}>
            <AppLayout apiUrl={apiUrl} admin={session?.admin} onLogout={handleLogout} onAdminRefresh={authHandlers.onAdminRefresh} />
          </RequireAuth>
        )}
      />
    </Routes>
  );
}

export default App;
