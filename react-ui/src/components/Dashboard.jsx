import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, MailCheck, RefreshCw, Send, Sparkles, TimerReset } from 'lucide-react';
import { Link } from 'react-router-dom';

function Dashboard({ apiUrl }) {
  const [stats, setStats] = useState({
    total_records: 0,
    total: 0,
    unprocessed: 0,
    distributors_found: 0,
    emails_found: 0,
    email_sent: 0,
    pending_emails: 0,
    queued: 0,
    running: 0,
    failed: 0,
    ready_for_outreach: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = apiUrl.replace(/\/$/, '');
      const response = await fetch(`${apiBase}/brands/stats`);
      if (!response.ok) {
        throw new Error('API Error');
      }
      const data = await response.json();
      setStats({
        total_records: data.total_records ?? 0,
        total: data.total ?? 0,
        unprocessed: data.unprocessed ?? 0,
        distributors_found: data.distributors_found ?? 0,
        emails_found: data.emails_found ?? 0,
        email_sent: data.email_sent ?? 0,
        pending_emails: data.pending_emails ?? 0,
        queued: data.queued ?? 0,
        running: data.running ?? 0,
        failed: data.failed ?? 0,
        ready_for_outreach: data.ready_for_outreach ?? 0,
      });
    } catch (err) {
      console.error(err);
      setError('Failed to load dashboard stats: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [apiUrl]);

  const coverage = useMemo(() => {
    const totalRecords = stats.total_records || 0;
    const processed = stats.total || 0;
    const outreachReady = stats.ready_for_outreach || 0;
    const processedRate = totalRecords > 0 ? Math.round((processed / totalRecords) * 100) : 0;
    const outreachRate = processed > 0 ? Math.round((outreachReady / processed) * 100) : 0;
    return { processedRate, outreachRate };
  }, [stats]);

  return (
    <div className="page-shell">
      {/*<section className="page-hero dashboard-hero">
        <div>
          <span className="eyebrow"><Sparkles size={12} /> Research overview</span>
           <h2 className="page-title">Keep the pipeline moving from intake to outreach</h2> 
          <p className="page-subtitle">
            Use this dashboard as the operating summary, then jump into Brands for reviewing results and Processing Brands for work that still needs attention.
          </p>
        </div>
        
      </section>*/}

      <div className="stats-grid stats-grid--dashboard">
        <div className="stat-card">
          <div className="stat-label">Total Brand Records</div>
          <div className="stat-value blue">{stats.total_records}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Processed Research</div>
          <div className="stat-value green">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Waiting in Queue</div>
          <div className="stat-value amber">{stats.unprocessed}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ready for Outreach</div>
          <div className="stat-value purple">{stats.ready_for_outreach}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Emails Sent</div>
          <div className="stat-value red">{stats.email_sent}</div>
        </div>
      </div>

      <div className="dashboard-overview-grid">
        <section className="surface-card dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <span className="eyebrow">Research health</span>
              <h3>Coverage snapshot</h3>
            </div>
            <span className="badge blue">{coverage.processedRate}% processed</span>
          </div>
          <div className="metric-stack">
            <div className="metric-row">
              <span>Distributor matches found</span>
              <strong>{stats.distributors_found}</strong>
            </div>
            <div className="metric-row">
              <span>Brands with emails found</span>
              <strong>{stats.emails_found}</strong>
            </div>
            <div className="metric-row">
              <span>Pending verification emails</span>
              <strong>{stats.pending_emails}</strong>
            </div>
            <div className="metric-row">
              <span>Outreach-ready within processed brands</span>
              <strong>{coverage.outreachRate}%</strong>
            </div>
          </div>
        </section>

        <section className="surface-card dashboard-panel">
          <div className="dashboard-panel__header">
            <div>
              <span className="eyebrow">Live operations</span>
              <h3>Queue activity</h3>
            </div>
            <span className="badge amber">Background processing</span>
          </div>
          <div className="ops-grid">
            <div className="ops-card">
              <TimerReset size={16} />
              <span>Queued</span>
              <strong>{stats.queued}</strong>
            </div>
            <div className="ops-card">
              <RefreshCw size={16} />
              <span>Running</span>
              <strong>{stats.running}</strong>
            </div>
            <div className="ops-card">
              <MailCheck size={16} />
              <span>Failed</span>
              <strong>{stats.failed}</strong>
            </div>
          </div>
        </section>
      </div>

      {/* <section className="dashboard-actions-grid">
        <Link to="/brands" className="surface-card action-card">
          <div className="action-card__icon"><Send size={18} /></div>
          <div>
            <h3>Open Brands</h3>
            <p>Inspect processed records, review contact pages, and send verification outreach.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/processing" className="surface-card action-card">
          <div className="action-card__icon"><RefreshCw size={18} /></div>
          <div>
            <h3>Open Processing Queue</h3>
            <p>Search the queue, retry failures, and run background processing without blocking the API.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/upload" className="surface-card action-card">
          <div className="action-card__icon"><MailCheck size={18} /></div>
          <div>
            <h3>Upload New CSV</h3>
            <p>Add fresh brands into the pipeline with a clean import-only experience.</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      </section> */}

      {error && (
        <div className="surface-card empty-inline dashboard-error">
          {error}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
