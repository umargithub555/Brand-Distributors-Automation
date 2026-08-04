import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Mail, UploadCloud, Workflow, Database, Table2, Send, FileText } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';
import Processing from './components/Processing';
import Brands from './components/Brands';
import SMTPSettings from './components/SMTPSettings';
import EmailTemplatesSettings from './components/EmailTemplatesSettings';
import EmailActivity from './components/EmailActivity';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/brands', label: 'Brands', icon: Table2 },
  { to: '/emails', label: 'Email Activity', icon: Send },
  { to: '/upload', label: 'Upload CSV', icon: UploadCloud },
  { to: '/processing', label: 'Processing Queue', icon: Workflow },
  { to: '/settings/smtp', label: 'SMTP Settings', icon: Mail },
  { to: '/settings/email-templates', label: 'Email Templates', icon: FileText },
];

function App() {
  const location = useLocation();
  const apiUrl = '/api';

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
      </aside>

      <main className="main-container app-content">
        <Routes>
          <Route path="/" element={<Dashboard apiUrl={apiUrl} />} />
          <Route path="/brands" element={<Brands apiUrl={apiUrl} />} />
          <Route path="/emails" element={<EmailActivity apiUrl={apiUrl} />} />
          <Route path="/upload" element={<Upload apiUrl={apiUrl} />} />
          <Route path="/processing" element={<Processing apiUrl={apiUrl} />} />
          <Route path="/settings/smtp" element={<SMTPSettings apiUrl={apiUrl} />} />
          <Route path="/settings/email-templates" element={<EmailTemplatesSettings apiUrl={apiUrl} />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
