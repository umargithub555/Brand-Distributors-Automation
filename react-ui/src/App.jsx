import React, { useState } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, Database } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Upload from './components/Upload';

function App() {
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  const location = useLocation();

  return (
    <>
      <header>
        <div className="logo-section">
          <div className="logo-icon">
            <Database size={18} />
          </div>
          <div className="logo-text">
            <h1>Brand Intelligence</h1>
            <span>Distributor Research System</span>
          </div>
          
          <div className="nav-links" style={{ marginLeft: '32px' }}>
            <Link 
              to="/" 
              className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <LayoutDashboard size={16} /> Dashboard
            </Link>
            <Link 
              to="/upload" 
              className={`nav-link ${location.pathname === '/upload' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UploadCloud size={16} /> Upload CSV
            </Link>
          </div>
        </div>
        
        <div className="api-config">
          <input 
            type="text" 
            className="input-field" 
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="Backend URL (localhost:8000)"
          />
        </div>
      </header>

      <main className="main-container">
        <Routes>
          <Route path="/" element={<Dashboard apiUrl={apiUrl} />} />
          <Route path="/upload" element={<Upload apiUrl={apiUrl} />} />
        </Routes>
      </main>
    </>
  );
}

export default App;
