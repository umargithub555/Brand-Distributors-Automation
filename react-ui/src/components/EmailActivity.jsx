import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Play, RefreshCw, Search, Send, Square, Trash2, X } from 'lucide-react';
import Pagination from './Pagination';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];
const ACTIVE_BULK_BATCH_STATUSES = ['queued', 'running', 'paused'];

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
  { value: 'cancelled', label: 'Cancelled' },
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
  const [brandPageSize, setBrandPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [distributorPageSize, setDistributorPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [brandStatusFilter, setBrandStatusFilter] = useState('all');
  const [distributorStatusFilter, setDistributorStatusFilter] = useState('all');
  const [errorTypeFilter, setErrorTypeFilter] = useState('all');
  const [viewer, setViewer] = useState({ open: false, type: null, item: null });
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkDailyLimit, setBulkDailyLimit] = useState(15);
  const [bulkStarting, setBulkStarting] = useState(false);
  const [bulkError, setBulkError] = useState(null);
  const [bulkMessage, setBulkMessage] = useState(null);
  const [bulkBatches, setBulkBatches] = useState([]);
  const [selectedBulkBatchId, setSelectedBulkBatchId] = useState('');
  const [bulkDetail, setBulkDetail] = useState(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkHistoryViewer, setBulkHistoryViewer] = useState({ open: false, loading: false, detail: null, error: null });
  const [resendingAttemptId, setResendingAttemptId] = useState('');
  const [activityMessage, setActivityMessage] = useState(null);

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
  }, [brandStatusFilter, brandPageSize]);

  useEffect(() => {
    setDistributorPage(1);
  }, [distributorStatusFilter, distributorPageSize]);

  useEffect(() => {
    setBrandPage(1);
    setDistributorPage(1);
  }, [errorTypeFilter, activeTab]);

  const brandPages = Math.max(1, Math.ceil(brandTotal / brandPageSize));
  const distributorPages = Math.max(1, Math.ceil(distributorTotal / distributorPageSize));

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const brandParams = new URLSearchParams({
        skip: String((brandPage - 1) * brandPageSize),
        limit: String(brandPageSize),
      });
      const distributorParams = new URLSearchParams({
        skip: String((distributorPage - 1) * distributorPageSize),
        limit: String(distributorPageSize),
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
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [apiUrl, search, brandPage, distributorPage, brandStatusFilter, distributorStatusFilter, errorTypeFilter, brandPageSize, distributorPageSize]);

  const loadBulkBatchDetail = async (batchId) => {
    if (!batchId) return;
    try {
      const res = await fetch(`${apiBase}/email-activity/bulk-send/batches/${batchId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const detail = await res.json();
      setBulkDetail(detail);
      setSelectedBulkBatchId(batchId);
    } catch (err) {
      setBulkError(`Failed to load bulk email batch: ${err.message}`);
    }
  };

  const getBulkBatchId = (batch) => batch?._id || batch?.batch_id || '';
  const isActiveBulkBatch = (batch) => ACTIVE_BULK_BATCH_STATUSES.includes(batch?.status);

  const loadBulkBatches = async (preferredBatchId = selectedBulkBatchId) => {
    try {
      const res = await fetch(`${apiBase}/email-activity/bulk-send/batches?skip=0&limit=25`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const batches = data.items || [];
      setBulkBatches(batches);

      const preferredBatch = batches.find((batch) => getBulkBatchId(batch) === preferredBatchId);
      const activeBatch = batches.find(isActiveBulkBatch);
      const nextBatch = preferredBatch && isActiveBulkBatch(preferredBatch) ? preferredBatch : activeBatch;
      const nextBatchId = getBulkBatchId(nextBatch);

      if (nextBatchId) await loadBulkBatchDetail(nextBatchId);
      else {
        setSelectedBulkBatchId('');
        setBulkDetail(null);
      }
    } catch (err) {
      setBulkError(`Failed to load bulk email batches: ${err.message}`);
    }
  };

  const handleStartBulkSend = async () => {
    setBulkStarting(true);
    setBulkError(null);
    setBulkMessage(null);
    try {
      const res = await fetch(`${apiBase}/email-activity/bulk-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_limit: Number(bulkDailyLimit) || 1 }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}`);
      setBulkMessage(`Queued ${payload.total_targets} additional emails for today.`);
      setShowBulkPanel(true);
      await loadBulkBatches(payload.batch_id);
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkStarting(false);
    }
  };


  const handleBulkBatchAction = async (action) => {
    if (!selectedBulkBatchId) return;
    setBulkActionLoading(true);
    setBulkError(null);
    setBulkMessage(null);
    try {
      const res = await fetch(`${apiBase}/email-activity/bulk-send/batches/${selectedBulkBatchId}/${action}`, {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}`);
      setBulkMessage(action === 'pause' ? 'Bulk sending paused. Remaining scheduled emails can be resumed later.' : action === 'resume' ? 'Bulk sending resumed with fresh randomized delays.' : 'Remaining scheduled emails were cancelled and returned to separate sending flows.');
      await loadBulkBatches(payload.batch_id);
      if (action === 'clear') await loadData({ silent: true });
    } catch (err) {
      setBulkError(err.message);
    } finally {
      setBulkActionLoading(false);
    }
  };


  const openBulkBatchViewer = async (batchId) => {
    if (!batchId) return;
    setBulkHistoryViewer({ open: true, loading: true, detail: null, error: null });
    try {
      const res = await fetch(`${apiBase}/email-activity/bulk-send/batches/${batchId}`);
      const detail = await res.json();
      if (!res.ok) throw new Error(detail.detail || `HTTP ${res.status}`);
      setBulkHistoryViewer({ open: true, loading: false, detail, error: null });
    } catch (err) {
      setBulkHistoryViewer({ open: true, loading: false, detail: null, error: err.message });
    }
  };

  const closeBulkBatchViewer = () => {
    setBulkHistoryViewer({ open: false, loading: false, detail: null, error: null });
  };


  const handleResendAttempt = async (kind, item) => {
    if (!item?._id) return;
    const resendKey = `${kind}-${item._id}`;
    setResendingAttemptId(resendKey);
    setError(null);
    setActivityMessage(null);

    const endpoint = kind === 'brand'
      ? `${apiBase}/email-activity/brand-emails/${item._id}/resend`
      : `${apiBase}/email-activity/distributor-attempts/${item._id}/resend`;

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}`);
      setActivityMessage('Email was sent again and the new attempt was recorded.');
      await loadData({ silent: true });
    } catch (err) {
      setError(`Send again failed: ${err.message}`);
      await loadData({ silent: true });
    } finally {
      setResendingAttemptId('');
    }
  };

  useEffect(() => {
    loadBulkBatches();
  }, [apiUrl]);

  useEffect(() => {
    if (!showBulkPanel || !bulkDetail?.batch?.status || !['queued', 'running', 'paused'].includes(bulkDetail.batch.status)) return undefined;
    const timer = setInterval(() => loadBulkBatches(selectedBulkBatchId), 15000);
    return () => clearInterval(timer);
  }, [showBulkPanel, selectedBulkBatchId, bulkDetail?.batch?.status]);

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
  const getBrandStatus = (item) => (item.error_type === 'cancelled' ? 'Cancelled' : item.success === false ? 'Failed' : 'Sent');
  const getBulkStatusBadgeClass = (status) => {
    if (status === 'sent') return 'green';
    if (status === 'failed' || status === 'cancelled') return 'red';
    if (status === 'sending' || status === 'running') return 'purple';
    if (status?.startsWith?.('skipped')) return 'amber';
    return 'blue';
  };


  const currentBulkBatch = bulkDetail?.batch && isActiveBulkBatch(bulkDetail.batch) ? bulkDetail.batch : null;
  const currentBulkTargets = currentBulkBatch ? bulkDetail?.targets || [] : [];
  const processedBulkBatches = bulkBatches.filter((batch) => !isActiveBulkBatch(batch));

  const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');

  return (
    <div className="page-shell">
      {/* <section className="page-hero dashboard-hero">
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
      </section> */}

      {!showBulkPanel && (
        <>
      <div className="stats-grid stats-grid--dashboard stats-grid--emails stats-grid--emails-compact">
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

      <div className="surface-card email-toolbar-card email-toolbar-card--compact">
        <div className="toolbar email-toolbar email-toolbar--compact">
          <div className="search-wrap search-wide email-toolbar__search">
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search brand, distributor, recipient, or subject..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="toolbar-actions toolbar-actions--wrap email-toolbar__actions">
            <div className="filter-pill-group">
              <button type="button" className={`filter-pill email-filter-pill ${activeTab === 'brand' ? 'active' : ''}`} onClick={() => setActiveTab('brand')}>
                Brand Emails
              </button>
              <button type="button" className={`filter-pill email-filter-pill ${activeTab === 'distributor' ? 'active' : ''}`} onClick={() => setActiveTab('distributor')}>
                Distributor Attempts
              </button>
            </div>
            {activeTab === 'brand' ? (
              <select className="form-select email-toolbar__select" value={brandStatusFilter} onChange={(e) => setBrandStatusFilter(e.target.value)}>
                <option value="all">All brand attempts</option>
                <option value="sent">Sent only</option>
                <option value="failed">Failed only</option>
              </select>
            ) : (
              <select className="form-select email-toolbar__select" value={distributorStatusFilter} onChange={(e) => setDistributorStatusFilter(e.target.value)}>
                <option value="all">All attempts</option>
                <option value="sent">Successful only</option>
                <option value="failed">Failed only</option>
              </select>
            )}
            <select className="form-select email-toolbar__select" value={errorTypeFilter} onChange={(e) => setErrorTypeFilter(e.target.value)}>
              {ERROR_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button type="button" className="btn-primary email-toolbar__bulk" onClick={() => setShowBulkPanel(true)}>
              <Send size={14} />
              Bulk send
            </button>
            <button type="button" onClick={loadData} className="btn-primary btn-secondary email-toolbar__refresh" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-inline' : ''} />
              Refresh activity
            </button>
          </div>
        </div>
      </div>

      {!showBulkPanel && activityMessage && (
        <div className="bulk-inline-message success email-activity-message">
          {activityMessage}
        </div>
      )}

      {!showBulkPanel && error && (
        <div className="surface-card empty-inline dashboard-error">
          {error}
        </div>
      )}



      {!showBulkPanel && activeTab === 'brand' && (
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
                        <div className="email-row-actions">
                          <button className="btn-primary btn-secondary" type="button" onClick={() => openViewer('brand', item)}>
                            View
                          </button>
                          {isFailed && (
                            <button
                              className="btn-primary email-resend-button"
                              type="button"
                              onClick={() => handleResendAttempt('brand', item)}
                              disabled={resendingAttemptId === `brand-${item._id}`}
                            >
                              {resendingAttemptId === `brand-${item._id}` ? <RefreshCw size={14} className="spin-inline" /> : <Send size={14} />}
                              Send again
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            className="email-pagination"
            currentPage={brandPage}
            totalPages={brandPages}
            disabled={loading}
            onPageChange={setBrandPage}
            pageSize={brandPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setBrandPageSize}
          />
        </section>
      )}

      {!showBulkPanel && activeTab === 'distributor' && (
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
                {distributorAttempts.map((item) => {
                  const isFailed = item.success === false;
                  return (
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
                      <span className={`badge ${item.error_type === 'cancelled' ? 'red' : item.success ? 'green' : 'red'}`}>
                        {item.error_type === 'cancelled' ? 'Cancelled' : item.success ? 'Sent' : 'Failed'}
                      </span>
                    </td>
                    <td>{item.error_type ? humanizeErrorType(item.error_type) : '—'}</td>
                    <td>#{item.attempt_number || 1}</td>
                    <td>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Unknown'}</td>
                    <td>
                      <div className="email-row-actions">
                        <button className="btn-primary btn-secondary" type="button" onClick={() => openViewer('distributor', item)}>
                          View
                        </button>
                        {isFailed && (
                          <button
                            className="btn-primary email-resend-button"
                            type="button"
                            onClick={() => handleResendAttempt('distributor', item)}
                            disabled={resendingAttemptId === `distributor-${item._id}`}
                          >
                            {resendingAttemptId === `distributor-${item._id}` ? <RefreshCw size={14} className="spin-inline" /> : <Send size={14} />}
                            Send again
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            className="email-pagination"
            currentPage={distributorPage}
            totalPages={distributorPages}
            disabled={loading}
            onPageChange={setDistributorPage}
            pageSize={distributorPageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={setDistributorPageSize}
          />
        </section>
      )}

        </>
      )}

      {showBulkPanel && (
        <div className="bulk-email-screen">
          <section className="surface-card bulk-email-panel bulk-email-panel--solo">
            <button
              type="button"
              className="icon-button bulk-email-back-icon"
              onClick={() => setShowBulkPanel(false)}
              aria-label="Back to activity"
              title="Back to activity"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="bulk-email-panel__header">
              <div className="bulk-email-title-row">
                <div>
                  <h3>Daily email queue</h3>
                  <p className="bulk-email-subtitle">Current active batch only. Completed and cancelled batches are listed below.</p>
                </div>
              </div>
              <div className="bulk-email-panel__controls">
                <label className="bulk-limit-control">
                  <span>Daily cap</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={bulkDailyLimit}
                    onChange={(e) => setBulkDailyLimit(e.target.value)}
                    className="form-input"
                  />
                </label>
                <button type="button" className="btn-primary" onClick={handleStartBulkSend} disabled={bulkStarting}>
                  {bulkStarting ? <><RefreshCw size={14} className="spin-inline" /> Queuing...</> : <><Send size={14} /> Apply cap</>}
                </button>
                {currentBulkBatch && ['queued', 'running'].includes(currentBulkBatch.status) && (
                  <button type="button" className="btn-primary btn-danger-soft" onClick={() => handleBulkBatchAction('pause')} disabled={bulkActionLoading}>
                    {bulkActionLoading ? <RefreshCw size={14} className="spin-inline" /> : <Square size={14} />}
                    Stop
                  </button>
                )}
                {currentBulkBatch?.status === 'paused' && (
                  <button type="button" className="btn-primary" onClick={() => handleBulkBatchAction('resume')} disabled={bulkActionLoading}>
                    {bulkActionLoading ? <RefreshCw size={14} className="spin-inline" /> : <Play size={14} />}
                    Resume
                  </button>
                )}
                {currentBulkTargets.some((target) => target.status === 'scheduled') && (
                  <button type="button" className="btn-primary btn-danger-soft" onClick={() => handleBulkBatchAction('clear')} disabled={bulkActionLoading}>
                    {bulkActionLoading ? <RefreshCw size={14} className="spin-inline" /> : <Trash2 size={14} />}
                    Empty queue
                  </button>
                )}
                <button type="button" className="btn-primary btn-secondary" onClick={() => loadBulkBatches()}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </div>

            {(bulkError || bulkMessage) && (
              <div className={`bulk-inline-message ${bulkError ? 'error' : 'success'}`}>
                {bulkError || bulkMessage}
              </div>
            )}

            <div className="bulk-email-panel__summary bulk-email-panel__summary--current">
              {currentBulkBatch ? (
                <>
                  <div className="bulk-current-meta">
                    <span>Started {formatDateTime(currentBulkBatch.created_at)}</span>
                    <strong className={`badge ${getBulkStatusBadgeClass(currentBulkBatch.status)}`}>{currentBulkBatch.status}</strong>
                  </div>
                  <div className="bulk-email-metrics">
                    <span><strong>{currentBulkBatch.total_targets}</strong> total</span>
                    <span><strong>{currentBulkBatch.queued_targets}</strong> queued</span>
                    <span><strong>{currentBulkBatch.sent_targets}</strong> sent</span>
                    <span><strong>{currentBulkBatch.failed_targets}</strong> failed</span>
                    <span><strong>{currentBulkBatch.skipped_targets}</strong> skipped</span>
                  </div>
                </>
              ) : (
                <div className="bulk-current-empty">No active bulk queue right now. Apply a cap to create today's next sending batch.</div>
              )}
            </div>

            <div className="table-wrap bulk-email-table-wrap">
              <table className="brands-table email-table bulk-email-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    <th>Brand</th>
                    <th>Recipient</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {!currentBulkTargets.length && (
                    <tr>
                      <td colSpan="8"><div className="empty-inline">No emails are currently queued or running.</div></td>
                    </tr>
                  )}
                  {currentBulkTargets.map((target) => (
                    <tr key={target.target_id}>
                      <td>{target.order_index}</td>
                      <td><span className="badge blue">{target.email_kind === 'brand' ? 'Brand' : 'Distributor'}</span></td>
                      <td>{target.brand_name}</td>
                      <td>{target.recipient_name}</td>
                      <td>{target.to_email || 'No email'}</td>
                      <td><span className={`badge ${getBulkStatusBadgeClass(target.status)}`}>{target.status}</span></td>
                      <td>{formatDateTime(target.scheduled_for)}</td>
                      <td>{target.last_error_type || target.last_error || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card bulk-history-panel">
            <div className="dashboard-panel__header email-panel__header">
              <div>
                <span className="eyebrow">Batch history</span>
                <h3>Processed bulk email batches</h3>
              </div>
              <span className="badge blue">{processedBulkBatches.length} batches</span>
            </div>
            <div className="table-wrap">
              <table className="brands-table email-table bulk-history-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Daily cap</th>
                    <th>Total</th>
                    <th>Sent</th>
                    <th>Failed</th>
                    <th>Skipped</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!processedBulkBatches.length && (
                    <tr>
                      <td colSpan="8"><div className="empty-inline">No processed bulk batches yet.</div></td>
                    </tr>
                  )}
                  {processedBulkBatches.map((batch) => {
                    const batchId = getBulkBatchId(batch);
                    return (
                      <tr key={batchId}>
                        <td>{formatDateTime(batch.created_at)}</td>
                        <td><span className={`badge ${getBulkStatusBadgeClass(batch.status)}`}>{batch.status}</span></td>
                        <td>{batch.daily_limit || batch.requested_limit || '-'}</td>
                        <td>{batch.total_targets ?? 0}</td>
                        <td>{batch.sent_targets ?? 0}</td>
                        <td>{batch.failed_targets ?? 0}</td>
                        <td>{batch.skipped_targets ?? 0}</td>
                        <td>
                          <button className="btn-primary btn-secondary" type="button" onClick={() => openBulkBatchViewer(batchId)}>
                            View batch
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {bulkHistoryViewer.open && (
        <>
          <div className="composer-backdrop" onClick={closeBulkBatchViewer} />
          <section className="composer-modal bulk-batch-modal" role="dialog" aria-modal="true">
            <div className="composer-modal__header">
              <div>
                <span className="eyebrow">Bulk batch data</span>
                <h3>{bulkHistoryViewer.detail?.batch ? `Batch from ${formatDateTime(bulkHistoryViewer.detail.batch.created_at)}` : 'Batch details'}</h3>
                {bulkHistoryViewer.detail?.batch && (
                  <p>{bulkHistoryViewer.detail.batch.total_targets} total emails - {bulkHistoryViewer.detail.batch.status}</p>
                )}
              </div>
              <button type="button" className="icon-button" onClick={closeBulkBatchViewer}>
                <X size={18} />
              </button>
            </div>
            <div className="composer-modal__body">
              {bulkHistoryViewer.loading && (
                <div className="empty-inline">Loading batch data...</div>
              )}
              {!bulkHistoryViewer.loading && bulkHistoryViewer.error && (
                <div className="bulk-inline-message error">{bulkHistoryViewer.error}</div>
              )}
              {!bulkHistoryViewer.loading && bulkHistoryViewer.detail?.batch && (
                <>
                  <div className="bulk-email-metrics bulk-email-metrics--modal">
                    <span><strong>{bulkHistoryViewer.detail.batch.total_targets}</strong> total</span>
                    <span><strong>{bulkHistoryViewer.detail.batch.queued_targets}</strong> queued</span>
                    <span><strong>{bulkHistoryViewer.detail.batch.sent_targets}</strong> sent</span>
                    <span><strong>{bulkHistoryViewer.detail.batch.failed_targets}</strong> failed</span>
                    <span><strong>{bulkHistoryViewer.detail.batch.skipped_targets}</strong> skipped</span>
                    <span><strong>{bulkHistoryViewer.detail.batch.status}</strong> status</span>
                  </div>
                  <div className="table-wrap bulk-email-table-wrap bulk-email-table-wrap--modal">
                    <table className="brands-table email-table bulk-email-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Type</th>
                          <th>Brand</th>
                          <th>Recipient</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Scheduled</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkHistoryViewer.detail.targets.map((target) => (
                          <tr key={target.target_id}>
                            <td>{target.order_index}</td>
                            <td><span className="badge blue">{target.email_kind === 'brand' ? 'Brand' : 'Distributor'}</span></td>
                            <td>{target.brand_name}</td>
                            <td>{target.recipient_name}</td>
                            <td>{target.to_email || 'No email'}</td>
                            <td><span className={`badge ${getBulkStatusBadgeClass(target.status)}`}>{target.status}</span></td>
                            <td>{formatDateTime(target.scheduled_for)}</td>
                            <td>{target.last_error_type || target.last_error || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
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

