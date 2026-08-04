import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';

const PAGE_SIZE = 10;
const RESEARCH_MODE_OPTIONS = [
  {
    value: 'detailed',
    label: 'Detailed research',
    helper: 'Staged brand profile, distributor discovery, and enrichment. Higher quality, higher cost.',
  },
  {
    value: 'short',
    label: 'Short research',
    helper: 'Legacy single-pass grounded research. Faster and cheaper, but usually less complete.',
  },
];

function Processing({ apiUrl }) {
  const [brands, setBrands] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [toast, setToast] = useState(null);
  const [queueFilter, setQueueFilter] = useState('all');
  const [manualBrand, setManualBrand] = useState('');
  const [manualCountry, setManualCountry] = useState('USA');
  const [addingBrand, setAddingBrand] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [processingAll, setProcessingAll] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBrands, setTotalBrands] = useState(0);
  const [researchMode, setResearchMode] = useState('detailed');
  const [confirmDelete, setConfirmDelete] = useState({ open: false, brandId: null, brandName: '' });

  const apiBase = apiUrl.replace(/\/$/, '');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [queueFilter]);

  const buildQueueQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set('skip', String((currentPage - 1) * PAGE_SIZE));
    params.set('limit', String(PAGE_SIZE));
    if (search) params.set('q', search);
    if (queueFilter === 'processed') params.set('processed', 'true');
    if (queueFilter === 'unprocessed') params.set('processed', 'false');
    return params.toString();
  }, [currentPage, queueFilter, search]);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const res = await fetch(`${apiBase}/brands/unprocessed?${buildQueueQuery()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBrands(data.items || []);
      setTotalBrands(data.total ?? 0);
    } catch (err) {
      showToast('Failed to load queue: ' + err.message, 'error');
    }
    setLoadingQueue(false);
  }, [apiBase, buildQueueQuery]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const saveBrands = async (items) => {
    const res = await fetch(`${apiBase}/brands/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brands: items }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const handleManualAdd = async () => {
    const trimmedBrand = manualBrand.trim();
    const trimmedCountry = manualCountry.trim() || 'USA';
    if (!trimmedBrand) {
      showToast('Please enter a brand name.', 'error');
      return;
    }

    setAddingBrand(true);
    try {
      const result = await saveBrands([{ brand: trimmedBrand, country: trimmedCountry }]);
      if (result.inserted > 0) {
        showToast(`Added "${trimmedBrand}" to the queue.`);
        setManualBrand('');
        setManualCountry('USA');
        setCurrentPage(1);
        await loadQueue();
      } else {
        showToast(`"${trimmedBrand}" already exists in the queue.`, 'error');
      }
    } catch (err) {
      showToast('Manual add failed: ' + err.message, 'error');
    }
    setAddingBrand(false);
  };

  const requestDelete = (brandId, brandName) => {
    setConfirmDelete({ open: true, brandId, brandName });
  };

  const closeDeleteDialog = () => {
    setConfirmDelete({ open: false, brandId: null, brandName: '' });
  };

  const handleDelete = async (brandId, brandName) => {
    setDeletingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      showToast(`Deleted "${brandName}" from the queue.`);
      if (brands.length === 1 && currentPage > 1) {
        setCurrentPage((page) => page - 1);
      } else {
        await loadQueue();
      }
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeletingId(null);
    closeDeleteDialog();
  };

  const handleProcess = async (brandId, mode = researchMode) => {
    const brand = brands.find((item) => (item._id || item.id) === brandId);
    if (!brand) return;

    setProcessingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ research_mode: mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      showToast(payload.message || `"${brand.brand}" queued for processing.`);
      setBrands((prev) => prev.map((item) => (
        (item._id || item.id) === brandId
          ? {
              ...item,
              processed: false,
              processing_status: payload.status || 'queued',
              processing_error: null,
              processing_research_mode: payload.research_mode || mode,
            }
          : item
      )));
    } catch (err) {
      showToast('Failed to trigger: ' + err.message, 'error');
    }
    setProcessingId(null);
  };

  const handleProcessAll = async () => {
    const actionable = brands.filter((brand) => {
      const status = brand.processing_status || (brand.processed ? 'completed' : 'idle');
      return !brand.processed && !['queued', 'running'].includes(status);
    });

    if (actionable.length === 0) {
      showToast('There are no pending brands on this page to queue.', 'error');
      return;
    }

    setProcessingAll(true);
    try {
      const brandIds = actionable.map((brand) => brand._id || brand.id);
      const res = await fetch(`${apiBase}/brands/trigger-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_ids: brandIds, research_mode: researchMode }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.detail || `HTTP ${res.status}`);
      }

      const queuedIds = new Set(
        (payload.results || [])
          .filter((item) => item.status === 'queued')
          .map((item) => item.brand_id),
      );

      setBrands((prev) => prev.map((item) => {
        const currentId = item._id || item.id;
        if (!queuedIds.has(currentId)) return item;
        return {
          ...item,
          processed: false,
          processing_status: 'queued',
          processing_error: null,
          processing_research_mode: payload.research_mode || researchMode,
        };
      }));

      showToast(payload.message || `Queued ${queuedIds.size} brand(s) for processing.`);
      await loadQueue();
    } catch (err) {
      showToast('Bulk queue failed: ' + err.message, 'error');
    } finally {
      setProcessingAll(false);
    }
  };

  const getProcessingState = (brand) => {
    if (brand.processed) {
      return { label: 'Processed', tone: 'green', actionable: false };
    }

    const status = brand.processing_status || 'idle';
    if (status === 'queued') {
      return { label: 'Queued', tone: 'blue', actionable: false };
    }
    if (status === 'running') {
      return { label: 'Running', tone: 'amber', actionable: false };
    }
    if (status === 'failed') {
      return { label: 'Failed', tone: 'red', actionable: true };
    }
    return { label: 'Pending', tone: 'gray', actionable: true };
  };

  const pageStates = brands.map(getProcessingState);
  const pendingCount = pageStates.filter((state) => state.label === 'Pending' || state.label === 'Failed').length;
  const activeCount = pageStates.filter((state) => state.label === 'Queued' || state.label === 'Running').length;
  const totalPages = Math.max(1, Math.ceil(totalBrands / PAGE_SIZE));
  const selectedModeMeta = RESEARCH_MODE_OPTIONS.find((option) => option.value === researchMode);

  return (
    <div className="page-shell">
      {toast && (
        <div className={`toast-banner ${toast.type === 'error' ? 'error' : 'success'}`}>
          {toast.message}
        </div>
      )}

      <section className="page-hero page-hero--compact">
        <div>
          <span className="eyebrow">Processing queue</span>
          <h2 className="page-title">Manage brands waiting for research or review</h2>
          <p className="page-subtitle">Search, filter, add, delete, and trigger research jobs from one consistent queue screen.</p>
        </div>
      </section>

      <div className="stats-grid stats-grid--three">
        <div className="stat-card active">
          <div className="stat-label">Visible in Queue</div>
          <div className="stat-value blue">{totalBrands}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Waiting or Failed</div>
          <div className="stat-value amber">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Queued or Running</div>
          <div className="stat-value purple">{activeCount}</div>
        </div>
      </div>

      <div className="surface-card split-card">
        <div className="split-card__section">
          <div className="card-title-row">
            <h3>Add Brand Manually</h3>
            <span>Quick queue management</span>
          </div>
          <div className="inline-form-row">
            <input
              type="text"
              value={manualBrand}
              onChange={(e) => setManualBrand(e.target.value)}
              placeholder="Brand name"
              className="form-input"
            />
            <input
              type="text"
              value={manualCountry}
              onChange={(e) => setManualCountry(e.target.value)}
              placeholder="Country"
              className="form-input form-input--small"
            />
            <button className="btn-primary" onClick={handleManualAdd} disabled={addingBrand}>
              {addingBrand ? <><Loader size={14} className="spin-inline" /> Adding...</> : <><Plus size={14} /> Add Brand</>}
            </button>
          </div>
        </div>

        <div className="split-card__section split-card__section--controls">
          <div className="search-wrap search-wide">
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search brand or country..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="processing-mode-card">
            <div>
              <div className="processing-mode-card__title">Brand research mode</div>
              <p className="processing-mode-card__helper">{selectedModeMeta?.helper}</p>
            </div>
            <select value={researchMode} onChange={(e) => setResearchMode(e.target.value)} className="form-select">
              {RESEARCH_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="toolbar-actions">
            <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)} className="form-select">
              <option value="all">All Brands</option>
              <option value="unprocessed">Unprocessed Only</option>
              <option value="processed">Processed Only</option>
            </select>
            <button className="btn-primary btn-secondary" onClick={loadQueue} disabled={loadingQueue}>
              <RefreshCw size={14} className={loadingQueue ? 'spin-inline' : ''} /> Refresh
            </button>
            {pendingCount > 0 && (
              <button className="btn-primary" onClick={handleProcessAll} disabled={processingId !== null || processingAll}>
                {processingAll ? <><Loader size={14} className="spin-inline" /> Queueing All...</> : <><Play size={14} /> Process All</>}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="results-meta surface-card results-meta--bottomless">
        <span>Showing {brands.length} of {totalBrands} brands</span>
        <span>Page {currentPage} of {totalPages}</span>
      </div>

      <div className="brands-list">
        {loadingQueue && (
          <div className="empty-state">
            <div className="spinner spin-center"></div>
            <h3>Loading queue...</h3>
          </div>
        )}

        {!loadingQueue && brands.length === 0 && (
          <div className="empty-state">
            <CheckCircle size={48} style={{ color: 'var(--green)' }} />
            <h3>No brands found</h3>
            <p>Try a different search or add a new brand manually.</p>
          </div>
        )}

        {!loadingQueue && brands.map((brand) => {
          const id = brand._id || brand.id;
          const isProcessing = processingId === id;
          const isDeleting = deletingId === id;
          const state = getProcessingState(brand);
          const isActionable = state.actionable && !isDeleting && !isProcessing;
          const modeLabel = brand.processing_research_mode === 'short' ? 'Short mode' : 'Detailed mode';

          return (
            <div key={id} className="brand-list-card brand-list-card--queue">
              <div className="brand-list-card__main">
                <div className="brand-icon">{(brand.brand || 'B').slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className="brand-name">{brand.brand}</div>
                  <div className="brand-country">{brand.country || 'USA'}</div>
                  <div className="queue-mode-inline">{modeLabel}</div>
                  {brand.processing_error && state.label === 'Failed' && (
                    <div className="queue-error-inline">
                      <AlertCircle size={12} /> {brand.processing_error}
                    </div>
                  )}
                </div>
              </div>

              <div className="brand-list-card__meta brand-list-card__meta--queue">
                <span className={`badge ${state.tone}`}>{state.label}</span>
                {state.label === 'Running' && (
                  <span className="queue-running-indicator"><Loader size={13} className="spin-inline" /> In progress</span>
                )}
                {isActionable && (
                  <button
                    className="btn-primary"
                    onClick={() => handleProcess(id)}
                    disabled={!isActionable}
                  >
                    {isProcessing ? <><Loader size={13} className="spin-inline" /> Queueing...</> : <><Play size={13} /> {state.label === 'Failed' ? 'Retry' : 'Process'}</>}
                  </button>
                )}
                <button
                  className="btn-primary btn-danger"
                  onClick={() => requestDelete(id, brand.brand)}
                  disabled={isDeleting || isProcessing || state.label === 'Running'}
                >
                  {isDeleting ? <><Loader size={13} className="spin-inline" /> Deleting...</> : <><Trash2 size={13} /> Delete</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loadingQueue && totalBrands > 0 && (
        <div className="pagination-bar surface-card">
          <div className="pagination-summary">Page {currentPage} of {totalPages}</div>
          <div className="pagination-actions">
            <button className="btn-primary btn-secondary" disabled={currentPage === 1 || loadingQueue} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
              Previous
            </button>
            <button className="btn-primary btn-secondary" disabled={currentPage >= totalPages || loadingQueue} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
              Next
            </button>
          </div>
        </div>
      )}

      {confirmDelete.open && (
        <>
          <div className="composer-backdrop" onClick={closeDeleteDialog} />
          <section className="confirm-dialog" role="dialog" aria-modal="true">
            <div className="confirm-dialog__body">
              <span className="eyebrow">Delete brand</span>
              <h3>Remove this brand from the queue?</h3>
              <p><strong>{confirmDelete.brandName}</strong> will be removed from the active queue.</p>
            </div>
            <div className="confirm-dialog__footer">
              <button className="btn-primary btn-secondary" type="button" onClick={closeDeleteDialog} disabled={!!deletingId}>Cancel</button>
              <button className="btn-primary btn-danger" type="button" onClick={() => handleDelete(confirmDelete.brandId, confirmDelete.brandName)} disabled={!!deletingId}>
                {deletingId === confirmDelete.brandId ? <><Loader size={13} className="spin-inline" /> Deleting...</> : <><Trash2 size={13} /> Delete</>}
              </button>
            </div>
          </section>
        </>
      )}

    </div>
  );
}

export default Processing;
