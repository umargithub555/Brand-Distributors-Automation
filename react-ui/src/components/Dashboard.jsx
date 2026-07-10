import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';

function Dashboard({ apiUrl }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  
  const [stats, setStats] = useState({
    total: 0,
    distributors_found: 0,
    emails_found: 0,
    email_sent: 0,
    pending_emails: 0
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = apiUrl.replace(/\/$/, '');
      const [brandsRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/brands?limit=200`),
        fetch(`${apiBase}/brands/stats`)
      ]);

      if (!brandsRes.ok || !statsRes.ok) {
        throw new Error('API Error');
      }

      const allBrands = await brandsRes.json();
      const statsData = await statsRes.json();

      setBrands(allBrands);
      setStats({
        total: statsData.total ?? allBrands.length,
        distributors_found: statsData.distributors_found ?? 0,
        emails_found: statsData.emails_found ?? 0,
        email_sent: statsData.email_sent ?? 0,
        pending_emails: statsData.pending_emails ?? 0
      });
      
    } catch (err) {
      console.error(err);
      setError('Failed to connect to API: ' + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [apiUrl]);

  const filteredBrands = brands.filter(b => {
    const q = search.toLowerCase();
    const matchQ = !q || (b.brand || '').toLowerCase().includes(q) || (b.country || '').toLowerCase().includes(q);
    if (!matchQ) return false;
    
    if (filter === 'distributors') return b.distributors_found;
    if (filter === 'emails') return b.emails_found;
    if (filter === 'sent') return b.email_sent;
    if (filter === 'pending') return b.emails_found && !b.email_sent;
    return true;
  });

  const getConfColor = (val) => {
    if (val >= 85) return '#10b981';
    if (val >= 65) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      <div className="stats-grid">
        <div className={`stat-card ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <div className="stat-label">Processed Brands</div>
          <div className="stat-value blue">{stats.total}</div>
        </div>
        <div className={`stat-card ${filter === 'distributors' ? 'active' : ''}`} onClick={() => setFilter('distributors')}>
          <div className="stat-label">Distributors Found</div>
          <div className="stat-value green">{stats.distributors_found}</div>
        </div>
        <div className={`stat-card ${filter === 'emails' ? 'active' : ''}`} onClick={() => setFilter('emails')}>
          <div className="stat-label">Emails Found</div>
          <div className="stat-value amber">{stats.emails_found}</div>
        </div>
        <div className={`stat-card ${filter === 'sent' ? 'active' : ''}`} onClick={() => setFilter('sent')}>
          <div className="stat-label">Emails Sent</div>
          <div className="stat-value purple">{stats.email_sent}</div>
        </div>
        <div className={`stat-card ${filter === 'pending' ? 'active' : ''}`} onClick={() => setFilter('pending')}>
          <div className="stat-label">Pending Emails</div>
          <div className="stat-value red">{stats.pending_emails}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search className="search-icon" size={16} />
          <input 
            className="search-input" 
            type="text" 
            placeholder="Search brand or country..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <button onClick={loadData} className="btn-primary" disabled={loading} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} className={loading ? 'spin-center' : ''} style={{ margin: 0 }} /> 
          Refresh Data
        </button>
      </div>

      <div className="brands-list">
        {loading && (
          <div className="empty-state">
            <div className="spinner spin-center"></div>
            <h3>Loading data...</h3>
            <p>Fetching processed brands from {apiUrl}</p>
          </div>
        )}
        
        {!loading && error && (
          <div className="empty-state">
            <AlertCircle size={48} />
            <h3>Connection Failed</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && filteredBrands.length === 0 && (
          <div className="empty-state">
            <h3>No brands found</h3>
            <p>Try adjusting your search or filters, or upload a new CSV.</p>
          </div>
        )}

        {!loading && !error && filteredBrands.map((b, index) => {
          const uId = b._id || b.id || index;
          const isExpanded = expandedId === uId;
          const initials = (b.brand || 'B').slice(0, 2);
          const distCount = b.distributors?.length || 0;

          return (
            <div key={uId} className="brand-card">
              <div className="brand-header" onClick={() => setExpandedId(isExpanded ? null : uId)}>
                <div className="brand-icon">{initials}</div>
                <div>
                  <div className="brand-name">{b.brand}</div>
                  <div className="brand-country">{b.country} {b.parent_company ? `· ${b.parent_company}` : ''}</div>
                </div>
                <div>
                  {b.distributors_found 
                    ? <span className="badge green">{distCount} distributor{distCount !== 1 ? 's' : ''}</span>
                    : <span className="badge gray">no distributors</span>}
                </div>
                <div>
                  {b.emails_found ? <span className="badge blue">email found</span> : <span className="badge gray">no email</span>}
                </div>
                <div>
                  {b.email_sent ? <span className="badge purple">email sent</span> : <span className="badge gray">not sent</span>}
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {b.processed_at ? new Date(b.processed_at).toLocaleDateString() : 'Just now'}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                  <ChevronDown size={18} />
                </div>
              </div>
              
              {isExpanded && (
                <div className="brand-body">
                  <div className="detail-grid">
                    <div className="detail-box">
                      <label>Official website</label>
                      <div className="val">{b.official_website ? <a href={b.official_website} target="_blank" rel="noreferrer">{b.official_website}</a> : <span className="null">not found</span>}</div>
                    </div>
                    <div className="detail-box">
                      <label>Brand email</label>
                      <div className="val">{b.brand_email ? <a href={`mailto:${b.brand_email}`}>{b.brand_email}</a> : <span className="null">not found</span>}</div>
                    </div>
                    <div className="detail-box">
                      <label>Parent company</label>
                      <div className="val">{b.parent_company || <span className="null">none</span>}</div>
                    </div>
                  </div>

                  {distCount > 0 ? (
                    <>
                      <div className="section-title">Distributors ({distCount})</div>
                      <div className="dist-list">
                        {b.distributors.map((d, i) => (
                          <div key={i} className="dist-row">
                            <div>
                              <div className="dist-name">{d.name}</div>
                              <div className="dist-loc">{[d.city, d.state, d.country].filter(Boolean).join(', ') || '—'}</div>
                            </div>
                            <div>
                              {d.official ? <span className="badge green">official</span> : <span className="badge gray">unverified</span>}
                            </div>
                            <div className="dist-contact">
                              {d.email && <><a href={`mailto:${d.email}`}>{d.email}</a><br/></>}
                              {d.phone && <span>{d.phone}</span>}
                            </div>
                            <div className="conf-bar">
                              <div className="conf-bg">
                                <div className="conf-fill" style={{ width: `${d.confidence || 0}%`, background: getConfColor(d.confidence) }}></div>
                              </div>
                              <span className="conf-text">{d.confidence || 0}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No distributors found for this brand.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
