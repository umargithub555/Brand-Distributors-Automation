import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Mail, RefreshCw, Search, X } from 'lucide-react';

const PAGE_SIZE = 12;

const ERROR_TYPE_OPTIONS = [
  { value: 'all', label: 'All error types' },
  { value: 'address_not_found', label: 'Address not found' },
  { value: 'mailbox_unavailable', label: 'Mailbox unavailable' },
  { value: 'authentication_failed', label: 'Authentication failed' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'rate_limited', label: 'Rate limited' },
  { value: 'policy_blocked', label: 'Policy blocked' },
  { value: 'connection_failed', label: 'Connection failed' },
  { value: 'invalid_address', label: 'Invalid address' },
  { value: 'unknown', label: 'Unknown error' },
];

function humanizeErrorType(errorType) {
  const match = ERROR_TYPE_OPTIONS.find((option) => option.value === errorType);
  return match?.label || 'Unknown error';
}

function EmailActivity({ apiUrl }) {
  const [summary, setSummary] = useState({
    brand_emails_sent: 0,
    brand_emails_pending: 0,
    brand_emails_failed: 0,
    distributor_attempts: 0,
    distributor_sent: 0,
    distributor_failed: 0,
    distributor_campaigns: 0,
  });
  const [brandEmails, setBrandEmails] = useState([]);
  const [distributorAttempts, setDistributorAttempts] = useState([]);
  const [brandTotal, setBrandTotal] = useState(0);
  const [distributorTotal, setDistributorTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('brand');
  const [brandPage, setBrandPage] = useState(1);
  const [distributorPage, setDistributorPage] = useState(1);
  const [brandStatusFilter, setBrandStatusFilter] = useState('all');
  const [distributorStatusFilter, setDistributorStatusFilter] = useState('all');
  const [errorTypeFilter, setErrorTypeFilter] = useState('all');
  const [viewer, setViewer] = useState({ open: false, type: null, item: null });

  const apiBase = apiUrl.replace(/\/$/, '');

  useEffect(() => {
    const timer = setTimeout(() => {
      setBrandPage(1);
      setDistributorPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setBrandPage(1);
  }, [brandStatusFilter]);

  useEffect(() => {
    setDistributorPage(1);
  }, [distributorStatusFilter]);

  useEffect(() => {
    setBrandPage(1);
    setDistributorPage(1);
  }, [errorTypeFilter, activeTab]);

  const brandPages = Math.max(1, Math.ceil(brandTotal / PAGE_SIZE));
  const distributorPages = Math.max(1, Math.ceil(distributorTotal / PAGE_SIZE));

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const brandParams = new URLSearchParams({
        skip: String((brandPage - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      const distributorParams = new URLSearchParams({
        skip: String((distributorPage - 1) * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });

      if (search) {
        brandParams.set('q', search);
        distributorParams.set('q', search);
      }

      if (brandStatusFilter === 'sent') brandParams.set('success', 'true');
      if (brandStatusFilter === 'failed') brandParams.set('success', 'false');
      if (distributorStatusFilter === 'sent') distributorParams.set('success', 'true');
      if (distributorStatusFilter === 'failed') distributorParams.set('success', 'false');
      if (errorTypeFilter !== 'all') {
        brandParams.set('error_type', errorTypeFilter);
        distributorParams.set('error_type', errorTypeFilter);
      }

      const [summaryRes, brandRes, distributorRes] = await Promise.all([
        fetch(`${apiBase}/email-activity/summary`),
        fetch(`${apiBase}/email-activity/brand-emails?${brandParams.toString()}`),
        fetch(`${apiBase}/email-activity/distributor-attempts?${distributorParams.toString()}`),
      ]);

      if (!summaryRes.ok || !brandRes.ok || !distributorRes.ok) {
        throw new Error('API Error');
      }

      const summaryData = await summaryRes.json();
      const brandData = await brandRes.json();
      const distributorData = await distributorRes.json();

      setSummary({
        brand_emails_sent: summaryData.brand_emails_sent ?? 0,
        brand_emails_pending: summaryData.brand_emails_pending ?? 0,
        brand_emails_failed: summaryData.brand_emails_failed ?? 0,
        distributor_attempts: summaryData.distributor_attempts ?? 0,
        distributor_sent: summaryData.distributor_sent ?? 0,
        distributor_failed: summaryData.distributor_failed ?? 0,
        distributor_campaigns: summaryData.distributor_campaigns ?? 0,
      });
      setBrandEmails(brandData.items || []);
      setBrandTotal(brandData.total ?? 0);
      setDistributorAttempts(distributorData.items || []);
      setDistributorTotal(distributorData.total ?? 0);
    } catch (err) {
      console.error(err);
      setError(`Failed to load email activity: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiUrl, search, brandPage, distributorPage, brandStatusFilter, distributorStatusFilter, errorTypeFilter]);

  const activityRate = useMemo(() => {
    if (!summary.distributor_attempts) return 0;
    return Math.round((summary.distributor_sent / summary.distributor_attempts) * 100);
  }, [summary]);

  const openViewer = (type, item) => setViewer({ open: true, type, item });
  const closeViewer = () => setViewer({ open: false, type: null, item: null });

  const getBrandName = (item) => item.brand || item.brand_name || 'Unknown brand';
  const getBrandRecipient = (item) => item.email_sent_to || item.to_email || 'Not recorded';
  const getBrandType = (item) => item.email_sent_type || item.email_type || 'brand';
  const getBrandSubject = (item) => item.email_subject || item.subject || 'No subject stored';
  const getBrandBody = (item) => item.email_body || item.body || 'No message body stored';
  const getBrandTimestamp = (item) => item.email_sent_at || item.created_at;
  const getBrandStatus = (item) => (item.success === false ? 'Failed' : 'Sent');

  return (
    <div className="page-shell">
      <section className="page-hero dashboard-hero">
        <div>
          <span className="eyebrow"><Mail size={12} /> Email operations</span>
          <h2 className="page-title">Track brand outreach and distributor email activity</h2>
          <p className="page-subtitle">
            Review who received what, when messages were sent, and how distributor outreach attempts are performing from one professional activity view.
          </p>
        </div>
        <button onClick={loadData} className="btn-primary btn-secondary" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin-inline' : ''} />
          Refresh activity
        </button>
      </section>

      <div className="stats-grid stats-grid--dashboard stats-grid--emails">
        <div className="stat-card">
          <div className="stat-label">Brand Emails Sent</div>
          <div className="stat-value blue">{summary.brand_emails_sent}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Brand Emails Pending</div>
          <div className="stat-value amber">{summary.brand_emails_pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Brand Email Failures</div>
          <div className="stat-value red">{summary.brand_emails_failed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Distributor Attempts</div>
          <div className="stat-value purple">{summary.distributor_attempts}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Distributor Sent</div>
          <div className="stat-value green">{summary.distributor_sent}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Distributor Failures</div>
          <div className="stat-value red">{summary.distributor_failed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Success Rate</div>
          <div className="stat-value blue">{activityRate}%</div>
        </div>
      </div>

      <div className="surface-card email-toolbar-card">
        <div className="toolbar toolbar-stacked">
          <div className="search-wrap search-wide">
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search brand, distributor, recipient, or subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="toolbar-actions toolbar-actions--wrap">
            <div className="filter-pill-group">
              <button type="button" className={`filter-pill ${activeTab === 'brand' ? 'active' : ''}`} onClick={() => setActiveTab('brand')}>
                Brand Emails
              </button>
              <button type="button" className={`filter-pill ${activeTab === 'distributor' ? 'active' : ''}`} onClick={() => setActiveTab('distributor')}>
                Distributor Attempts
              </button>
            </div>
            {activeTab === 'brand' ? (
              <select className="form-select" value={brandStatusFilter} onChange={(e) => setBrandStatusFilter(e.target.value)}>
                <option value="all">All brand attempts</option>
                <option value="sent">Sent only</option>
                <option value="failed">Failed only</option>
              </select>
            ) : (
              <select className="form-select" value={distributorStatusFilter} onChange={(e) => setDistributorStatusFilter(e.target.value)}>
                <option value="all">All attempts</option>
                <option value="sent">Successful only</option>
                <option value="failed">Failed only</option>
              </select>
            )}
            <select className="form-select" value={errorTypeFilter} onChange={(e) => setErrorTypeFilter(e.target.value)}>
              {ERROR_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="surface-card empty-inline dashboard-error">
          {error}
        </div>
      )}

      {activeTab === 'brand' && (
        <section className="surface-card email-panel">
          <div className="dashboard-panel__header email-panel__header">
            <div>
              <span className="eyebrow">Brand outreach</span>
              <h3>Brand email attempts</h3>
            </div>
            <span className="badge blue">{brandTotal} records</span>
          </div>

          <div className="table-wrap">
            <table className="brands-table email-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Recipient</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Error Type</th>
                  <th>Subject</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading && brandEmails.length === 0 && (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-inline">No brand email activity found for the current filters.</div>
                    </td>
                  </tr>
                )}
                {brandEmails.map((item) => {
                  const type = getBrandType(item);
                  const isFailed = item.success === false;
                  return (
                    <tr key={item._id}>
                      <td>
                        <div className="email-primary-cell">
                          <strong>{getBrandName(item)}</strong>
                          <span>{item.country || 'USA'}{item.parent_company ? ` - ${item.parent_company}` : ''}</span>
                        </div>
                      </td>
                      <td>{getBrandRecipient(item)}</td>
                      <td>
                        <span className={`badge ${type === 'parent' ? 'purple' : 'blue'}`}>
                          {type === 'parent' ? 'Parent company' : 'Brand'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isFailed ? 'red' : 'green'}`}>
                          {getBrandStatus(item)}
                        </span>
                      </td>
                      <td>{item.error_type ? humanizeErrorType(item.error_type) : '—'}</td>
                      <td className="email-subject-cell">{getBrandSubject(item)}</td>
                      <td>{getBrandTimestamp(item) ? new Date(getBrandTimestamp(item)).toLocaleString() : 'Unknown'}</td>
                      <td>
                        <button className="btn-primary btn-secondary" type="button" onClick={() => openViewer('brand', item)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar email-pagination">
            <div className="pagination-summary">Page {brandPage} of {brandPages}</div>
            <div className="pagination-actions">
              <button className="btn-primary btn-secondary" disabled={brandPage === 1 || loading} onClick={() => setBrandPage((page) => Math.max(1, page - 1))}>Previous</button>
              <button className="btn-primary btn-secondary" disabled={brandPage >= brandPages || loading} onClick={() => setBrandPage((page) => Math.min(brandPages, page + 1))}>Next</button>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'distributor' && (
        <section className="surface-card email-panel">
          <div className="dashboard-panel__header email-panel__header">
            <div>
              <span className="eyebrow">Distributor outreach</span>
              <h3>Attempt history</h3>
            </div>
            <span className="badge purple">{distributorTotal} attempts</span>
          </div>

          <div className="table-wrap">
            <table className="brands-table email-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Distributor</th>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Error Type</th>
                  <th>Attempt</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {!loading && distributorAttempts.length === 0 && (
                  <tr>
                    <td colSpan="8">
                      <div className="empty-inline">No distributor attempts found for the current filters.</div>
                    </td>
                  </tr>
                )}
                {distributorAttempts.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <div className="email-primary-cell">
                        <strong>{item.brand_name}</strong>
                        <span>{item.subject || 'No subject stored'}</span>
                      </div>
                    </td>
                    <td>{item.distributor_name || 'Unknown distributor'}</td>
                    <td>{item.to_email || 'No email'}</td>
                    <td>
                      <span className={`badge ${item.success ? 'green' : 'red'}`}>
                        {item.success ? 'Sent' : 'Failed'}
                      </span>
                    </td>
                    <td>{item.error_type ? humanizeErrorType(item.error_type) : '—'}</td>
                    <td>#{item.attempt_number || 1}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown'}</td>
                    <td>
                      <button className="btn-primary btn-secondary" type="button" onClick={() => openViewer('distributor', item)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar email-pagination">
            <div className="pagination-summary">Page {distributorPage} of {distributorPages}</div>
            <div className="pagination-actions">
              <button className="btn-primary btn-secondary" disabled={distributorPage === 1 || loading} onClick={() => setDistributorPage((page) => Math.max(1, page - 1))}>Previous</button>
              <button className="btn-primary btn-secondary" disabled={distributorPage >= distributorPages || loading} onClick={() => setDistributorPage((page) => Math.min(distributorPages, page + 1))}>Next</button>
            </div>
          </div>
        </section>
      )}

      {viewer.open && viewer.item && (
        <>
          <div className="composer-backdrop" onClick={closeViewer} />
          <section className="composer-modal email-viewer-modal" role="dialog" aria-modal="true">
            <div className="composer-modal__header">
              <div>
                <span className="eyebrow">Email detail</span>
                <h3>{viewer.type === 'brand' ? getBrandName(viewer.item) : viewer.item.distributor_name}</h3>
                <p>{viewer.type === 'brand' ? getBrandRecipient(viewer.item) : viewer.item.to_email}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeViewer}>
                <X size={18} />
              </button>
            </div>
            <div className="composer-modal__body">
              <div className="composer-summary-card composer-summary-card--inline">
                <div className="composer-summary-card__row">
                  <span>Subject</span>
                  <strong>{viewer.type === 'brand' ? getBrandSubject(viewer.item) : viewer.item.subject || 'No subject stored'}</strong>
                </div>
                <div className="composer-summary-card__row">
                  <span>Status</span>
                  <strong>
                    {viewer.type === 'brand'
                      ? viewer.item.success === false
                        ? `Failed${viewer.item.error ? `: ${viewer.item.error}` : ''}`
                        : 'Sent successfully'
                      : viewer.item.success
                        ? 'Sent successfully'
                        : `Failed${viewer.item.error ? `: ${viewer.item.error}` : ''}`}
                  </strong>
                </div>
                <div className="composer-summary-card__row">
                  <span>Error type</span>
                  <strong>{viewer.item.error_type ? humanizeErrorType(viewer.item.error_type) : '—'}</strong>
                </div>
              </div>
              {viewer.item.error && (
                <div className="surface-card" style={{ padding: '14px 16px', marginBottom: '16px' }}>
                  <div className="composer-summary-card__row" style={{ alignItems: 'flex-start', gap: '12px' }}>
                    <span><AlertCircle size={16} /></span>
                    <strong style={{ whiteSpace: 'pre-wrap' }}>{viewer.item.error}</strong>
                  </div>
                </div>
              )}
              <div className="composer-editor-card">
                <div className="composer-field">
                  <span>Message body</span>
                  <pre className="email-body-preview">{viewer.type === 'brand' ? getBrandBody(viewer.item) : viewer.item.body || 'No message body stored'}</pre>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default EmailActivity;

