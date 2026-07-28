import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Loader, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';

const PAGE_SIZE = 20;

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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBrands, setTotalBrands] = useState(0);

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

  const handleDelete = async (brandId, brandName) => {
    const confirmed = window.confirm(`Delete "${brandName}" from the queue?`);
    if (!confirmed) return;

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
  };

  const handleProcess = async (brandId) => {
    const brand = brands.find((item) => (item._id || item.id) === brandId);
    if (!brand) return;

    setProcessingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/trigger`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      showToast(`"${brand.brand}" processing started.`);
      setBrands((prev) => prev.map((item) => (
        (item._id || item.id) === brandId ? { ...item, processed: true } : item
      )));
    } catch (err) {
      showToast('Failed to trigger: ' + err.message, 'error');
    }
    setProcessingId(null);
  };

  const handleProcessAll = async () => {
    const pending = brands.filter((brand) => !brand.processed);
    for (const brand of pending) {
      const id = brand._id || brand.id;
      await handleProcess(id);
    }
  };

  const pendingCount = brands.filter((brand) => !brand.processed).length;
  const processedCount = brands.filter((brand) => brand.processed).length;
  const totalPages = Math.max(1, Math.ceil(totalBrands / PAGE_SIZE));

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
          <div className="stat-label">Pending on Page</div>
          <div className="stat-value amber">{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Processed on Page</div>
          <div className="stat-value green">{processedCount}</div>
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
              <button className="btn-primary" onClick={handleProcessAll} disabled={processingId !== null}>
                <Play size={14} /> Process All
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
          const isProcessed = brand.processed === true;
          const isDeleting = deletingId === id;

          return (
            <div key={id} className="brand-list-card brand-list-card--queue">
              <div className="brand-list-card__main">
                <div className="brand-icon">{(brand.brand || 'B').slice(0, 2).toUpperCase()}</div>
                <div>
                  <div className="brand-name">{brand.brand}</div>
                  <div className="brand-country">{brand.country || 'USA'}</div>
                </div>
              </div>

              <div className="brand-list-card__meta brand-list-card__meta--queue">
                <span className={`badge ${isProcessed ? 'green' : 'gray'}`}>{isProcessed ? 'Processed' : 'Pending'}</span>
                {!isProcessed && (
                  <button
                    className="btn-primary"
                    onClick={() => handleProcess(id)}
                    disabled={processingId !== null || isDeleting}
                  >
                    {isProcessing ? <><Loader size={13} className="spin-inline" /> Processing...</> : <><Play size={13} /> Process</>}
                  </button>
                )}
                <button
                  className="btn-primary btn-danger"
                  onClick={() => handleDelete(id, brand.brand)}
                  disabled={isDeleting || isProcessing}
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
    </div>
  );
}

export default Processing;
