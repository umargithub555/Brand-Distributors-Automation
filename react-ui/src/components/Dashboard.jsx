import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ExternalLink,
  Globe,
  Phone,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';

const PAGE_SIZE = 20;

function Dashboard({ apiUrl }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBrands, setTotalBrands] = useState(0);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [emailingBrands, setEmailingBrands] = useState({});
  const [stats, setStats] = useState({
    total: 0,
    distributors_found: 0,
    emails_found: 0,
    email_sent: 0,
    pending_emails: 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const totalPages = Math.max(1, Math.ceil(totalBrands / PAGE_SIZE));

  const buildBrandQuery = () => {
    const params = new URLSearchParams();
    params.set('skip', String((currentPage - 1) * PAGE_SIZE));
    params.set('limit', String(PAGE_SIZE));
    if (search) params.set('q', search);
    if (filter === 'distributors') params.set('distributors_found', 'true');
    if (filter === 'emails') params.set('emails_found', 'true');
    if (filter === 'sent') params.set('email_sent', 'true');
    if (filter === 'pending') {
      params.set('emails_found', 'true');
      params.set('email_sent', 'false');
    }
    return params.toString();
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = apiUrl.replace(/\/$/, '');
      const query = buildBrandQuery();
      const [brandsRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/brands?${query}`),
        fetch(`${apiBase}/brands/stats`),
      ]);

      if (!brandsRes.ok || !statsRes.ok) {
        throw new Error('API Error');
      }

      const brandsPayload = await brandsRes.json();
      const statsData = await statsRes.json();
      const items = brandsPayload.items || [];

      setBrands(items);
      setTotalBrands(brandsPayload.total ?? items.length);
      setStats({
        total: statsData.total ?? items.length,
        distributors_found: statsData.distributors_found ?? 0,
        emails_found: statsData.emails_found ?? 0,
        email_sent: statsData.email_sent ?? 0,
        pending_emails: statsData.pending_emails ?? 0,
      });

      if (selectedBrand) {
        const updatedSelectedBrand = items.find((item) => (item._id || item.id) === (selectedBrand._id || selectedBrand.id));
        if (updatedSelectedBrand) {
          setSelectedBrand(updatedSelectedBrand);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to connect to API: ' + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [apiUrl, filter, currentPage, search]);

  const handleSendEmail = async (brandId) => {
    setEmailingBrands((prev) => ({ ...prev, [brandId]: true }));
    try {
      const apiBase = apiUrl.replace(/\/$/, '');
      const res = await fetch(`${apiBase}/brands/${brandId}/send-email`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to send email');
      }

      setBrands((prevBrands) => prevBrands.map((brand) => {
        const currentId = brand._id || brand.id;
        if (currentId !== brandId) return brand;
        return {
          ...brand,
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        };
      }));

      setSelectedBrand((prevBrand) => {
        if (!prevBrand) return prevBrand;
        const currentId = prevBrand._id || prevBrand.id;
        if (currentId !== brandId) return prevBrand;
        return {
          ...prevBrand,
          email_sent: true,
          email_sent_at: new Date().toISOString(),
        };
      });

      setStats((prev) => ({
        ...prev,
        email_sent: prev.email_sent + 1,
        pending_emails: Math.max(0, prev.pending_emails - 1),
      }));

      alert('Email triggered successfully.');
    } catch (err) {
      console.error(err);
      alert('Error triggering email: ' + err.message);
    } finally {
      setEmailingBrands((prev) => ({ ...prev, [brandId]: false }));
    }
  };

  const getConfColor = (val) => {
    if (val >= 85) return '#10b981';
    if (val >= 65) return '#f59e0b';
    return '#ef4444';
  };

  const selectedBrandPrimaryEmail = useMemo(() => {
    if (!selectedBrand) return null;
    return selectedBrand.brand_email || selectedBrand.parent_company_email || null;
  }, [selectedBrand]);

  return (
    <div className="page-shell">
      <section className="page-hero">
        <div>
          <span className="eyebrow">Research dashboard</span>
          <h2 className="page-title">Track processed brands and outreach readiness</h2>
          <p className="page-subtitle">Review distributor research, inspect contact details, and send verification emails from a cleaner control surface.</p>
        </div>
      </section>

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

      <div className="surface-card controls-card">
        <div className="toolbar toolbar-stacked">
          <div className="search-wrap search-wide">
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search brand, country, or parent company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button onClick={loadData} className="btn-primary btn-secondary" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin-inline' : ''} />
            Refresh Data
          </button>
        </div>
        <div className="results-meta">
          <span>Showing {brands.length} of {totalBrands} brands</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      </div>

      <div className="brands-list">
        {loading && (
          <div className="empty-state">
            <div className="spinner spin-center"></div>
            <h3>Loading dashboard</h3>
            <p>Fetching processed brands from the backend.</p>
          </div>
        )}

        {!loading && error && (
          <div className="empty-state">
            <AlertCircle size={48} />
            <h3>Connection Failed</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && brands.length === 0 && (
          <div className="empty-state">
            <h3>No brands found</h3>
            <p>Try adjusting your search or filters, or upload a new CSV.</p>
          </div>
        )}

        {!loading && !error && brands.map((b, index) => {
          const uId = b._id || b.id || index;
          const initials = (b.brand || 'B').slice(0, 2).toUpperCase();
          const distCount = b.distributors?.length || 0;

          return (
            <button
              key={uId}
              type="button"
              className="brand-list-card"
              onClick={() => setSelectedBrand(b)}
            >
              <div className="brand-list-card__main">
                <div className="brand-icon">{initials}</div>
                <div>
                  <div className="brand-name">{b.brand}</div>
                  <div className="brand-country">{b.country}{b.parent_company ? ` - ${b.parent_company}` : ''}</div>
                </div>
              </div>
              <div className="brand-list-card__meta">
                <span className={`badge ${b.distributors_found ? 'green' : 'gray'}`}>{b.distributors_found ? `${distCount} distributor${distCount !== 1 ? 's' : ''}` : 'No distributors'}</span>
                <span className={`badge ${b.emails_found ? 'blue' : 'gray'}`}>{b.emails_found ? 'Email found' : 'No email'}</span>
                <span className={`badge ${b.email_sent ? 'purple' : 'gray'}`}>{b.email_sent ? 'Email sent' : 'Not sent'}</span>
                <span className="brand-date">{b.processed_at ? new Date(b.processed_at).toLocaleDateString() : 'Just now'}</span>
              </div>
            </button>
          );
        })}
      </div>

      {!loading && !error && totalBrands > 0 && (
        <div className="pagination-bar surface-card">
          <div className="pagination-summary">Page {currentPage} of {totalPages}</div>
          <div className="pagination-actions">
            <button className="btn-primary btn-secondary" disabled={currentPage === 1 || loading} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            <button className="btn-primary btn-secondary" disabled={currentPage >= totalPages || loading} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </button>
          </div>
        </div>
      )}

      {selectedBrand && (
        <>
          <div className="detail-backdrop" onClick={() => setSelectedBrand(null)} />
          <aside className="detail-panel">
            <div className="detail-panel__header">
              <div>
                <span className="eyebrow">Brand details</span>
                <h3>{selectedBrand.brand}</h3>
                <p>{selectedBrand.country}{selectedBrand.parent_company ? ` - ${selectedBrand.parent_company}` : ''}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedBrand(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="detail-panel__badges">
              <span className={`badge ${selectedBrand.distributors_found ? 'green' : 'gray'}`}>{selectedBrand.distributors_found ? `${selectedBrand.distributors?.length || 0} distributors` : 'No distributors'}</span>
              <span className={`badge ${selectedBrand.emails_found ? 'blue' : 'gray'}`}>{selectedBrand.emails_found ? 'Email found' : 'No email'}</span>
              <span className={`badge ${selectedBrand.email_sent ? 'purple' : 'gray'}`}>{selectedBrand.email_sent ? 'Email sent' : 'Not sent'}</span>
            </div>

            <div className="detail-stack">
              <div className="detail-group">
                <div className="detail-group__title"><Globe size={16} /> Contact surfaces</div>
                <div className="detail-grid detail-grid--panel">
                  <div className="detail-box">
                    <label>Official website</label>
                    <div className="val">{selectedBrand.official_website ? <a href={selectedBrand.official_website} target="_blank" rel="noreferrer">{selectedBrand.official_website}</a> : <span className="null">Not found</span>}</div>
                  </div>
                  <div className="detail-box">
                    <label>Brand contact page</label>
                    <div className="val">{selectedBrand.brand_contact_page ? <a href={selectedBrand.brand_contact_page} target="_blank" rel="noreferrer">{selectedBrand.brand_contact_page}</a> : <span className="null">Not found</span>}</div>
                  </div>
                  <div className="detail-box">
                    <label>Parent contact page</label>
                    <div className="val">{selectedBrand.parent_company_contact_page ? <a href={selectedBrand.parent_company_contact_page} target="_blank" rel="noreferrer">{selectedBrand.parent_company_contact_page}</a> : <span className="null">Not found</span>}</div>
                  </div>
                </div>
              </div>

              <div className="detail-group">
                <div className="detail-group__title"><Phone size={16} /> Contact details</div>
                <div className="detail-grid detail-grid--panel">
                  <div className="detail-box">
                    <label>Primary email</label>
                    <div className="val">{selectedBrandPrimaryEmail ? <a href={`mailto:${selectedBrandPrimaryEmail}`}>{selectedBrandPrimaryEmail}</a> : <span className="null">Not found</span>}</div>
                  </div>
                  <div className="detail-box">
                    <label>Brand phone</label>
                    <div className="val">{selectedBrand.brand_phone ? <a href={`tel:${selectedBrand.brand_phone}`}>{selectedBrand.brand_phone}</a> : <span className="null">Not found</span>}</div>
                  </div>
                  <div className="detail-box">
                    <label>Parent company phone</label>
                    <div className="val">{selectedBrand.parent_company_phone ? <a href={`tel:${selectedBrand.parent_company_phone}`}>{selectedBrand.parent_company_phone}</a> : <span className="null">Not found</span>}</div>
                  </div>
                  <div className="detail-box">
                    <label>All brand emails</label>
                    <div className="val detail-list-inline">
                      {(selectedBrand.all_brand_emails || selectedBrand.brand_emails || []).length > 0
                        ? (selectedBrand.all_brand_emails || selectedBrand.brand_emails).map((email) => (
                            <a key={email} href={`mailto:${email}`}>{email}</a>
                          ))
                        : <span className="null">Not found</span>}
                    </div>
                  </div>
                  <div className="detail-box">
                    <label>Parent company email</label>
                    <div className="val">{selectedBrand.parent_company_email ? <a href={`mailto:${selectedBrand.parent_company_email}`}>{selectedBrand.parent_company_email}</a> : <span className="null">Not found</span>}</div>
                  </div>
                </div>
              </div>

              <div className="detail-group">
                <div className="detail-group__title"><Building2 size={16} /> Outreach</div>
                <div className="detail-action-card">
                  <div>
                    <h4>Send distributor verification email</h4>
                    <p>Use the best available brand or parent-company contact email from this research record.</p>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => handleSendEmail(selectedBrand._id || selectedBrand.id)}
                    disabled={emailingBrands[selectedBrand._id || selectedBrand.id] || selectedBrand.email_sent}
                  >
                    {emailingBrands[selectedBrand._id || selectedBrand.id]
                      ? 'Sending...'
                      : selectedBrand.email_sent
                        ? 'Email Already Sent'
                        : 'Send Email'}
                  </button>
                </div>
              </div>

              <div className="detail-group">
                <div className="detail-group__title"><ExternalLink size={16} /> Distributors</div>
                {(selectedBrand.distributors || []).length > 0 ? (
                  <div className="dist-list dist-list--panel">
                    {selectedBrand.distributors.map((d, i) => (
                      <div key={i} className="dist-row dist-row--panel">
                        <div>
                          <div className="dist-name">{d.name}</div>
                          <div className="dist-loc">{[d.city, d.state, d.country].filter(Boolean).join(', ') || 'Location not found'}</div>
                        </div>
                        <div className="dist-side-block">
                          <span className={`badge ${d.official ? 'green' : 'gray'}`}>{d.official ? 'Official' : 'Unverified'}</span>
                          <div className="dist-contact">
                            {d.email && <a href={`mailto:${d.email}`}>{d.email}</a>}
                            {d.phone && <a href={`tel:${d.phone}`}>{d.phone}</a>}
                          </div>
                        </div>
                        <div className="conf-bar conf-bar--panel">
                          <div className="conf-bg">
                            <div className="conf-fill" style={{ width: `${d.confidence || 0}%`, background: getConfColor(d.confidence || 0) }}></div>
                          </div>
                          <span className="conf-text">{d.confidence || 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline">No distributors found for this brand.</div>
                )}
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

export default Dashboard;
