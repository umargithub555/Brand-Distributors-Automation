import React, { useState, useEffect, useCallback } from 'react';
import { UploadCloud, Play, Loader, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

function Upload({ apiUrl }) {
  const [unprocessed, setUnprocessed] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [toast, setToast] = useState(null);

  const apiBase = apiUrl.replace(/\/$/, '');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load unprocessed brands from backend on mount
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const res = await fetch(`${apiBase}/brands/unprocessed`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUnprocessed(data);
    } catch (err) {
      showToast('Failed to load queue: ' + err.message, 'error');
    }
    setLoadingQueue(false);
  }, [apiBase]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  // Parse CSV and POST to /brands/bulk
  const handleFile = (file) => {
    if (!file.name.endsWith('.csv')) {
      showToast('Please upload a valid .csv file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 2) {
        showToast('CSV is empty or has no data rows', 'error');
        return;
      }

      // Parse: skip header row (line 0), each subsequent line is brand[,country]
      const brands = lines.slice(1).map(line => {
        const cols = line.split(',');
        return {
          brand: (cols[0] || '').replace(/"/g, '').trim(),
          country: cols[1] ? cols[1].replace(/"/g, '').trim() : 'USA',
        };
      }).filter(b => b.brand !== '');

      if (brands.length === 0) {
        showToast('No valid brand names found in CSV', 'error');
        return;
      }

      // Save to MongoDB via backend
      setUploading(true);
      try {
        const res = await fetch(`${apiBase}/brands/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brands }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        showToast(`Saved ${result.inserted} brands. ${result.skipped} already existed.`);
        // Refresh the queue from server
        await loadQueue();
      } catch (err) {
        showToast('Upload failed: ' + err.message, 'error');
      }
      setUploading(false);
    };
    reader.readAsText(file);
  };

  // Trigger n8n via FastAPI proxy (avoids CORS)
  const handleProcess = async (brandId) => {
    const brand = unprocessed.find(b => (b._id || b.id) === brandId);
    if (!brand) return;

    setProcessingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/trigger`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      showToast(`"${brand.brand}" sent to n8n — processing started!`);
      // Mark optimistically — n8n will update the DB when done
      setUnprocessed(prev =>
        prev.map(b => (b._id || b.id) === brandId ? { ...b, processed: true } : b)
      );
    } catch (err) {
      showToast('Failed to trigger: ' + err.message, 'error');
    }
    setProcessingId(null);
  };

  const handleProcessAll = async () => {
    const pending = unprocessed.filter(b => !b.processed);
    for (const b of pending) {
      const id = b._id || b.id;
      await handleProcess(id);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
          background: toast.type === 'error' ? 'var(--red-light)' : 'var(--green-light)',
          color: toast.type === 'error' ? '#991b1b' : '#065f46',
          border: `1px solid ${toast.type === 'error' ? '#f87171' : '#34d399'}`,
          padding: '12px 20px', borderRadius: '10px', fontSize: '14px',
          fontWeight: '500', boxShadow: 'var(--shadow-md)', transition: 'all 0.2s'
        }}>
          {toast.message}
        </div>
      )}

      {/* Upload Zone */}
      <div
        className="upload-zone"
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{
          borderColor: dragActive ? 'var(--accent-color)' : 'var(--border-color)',
          backgroundColor: dragActive ? 'var(--accent-light)' : 'var(--surface-color)'
        }}
      >
        <UploadCloud className="upload-icon" size={48} />
        <h2 className="upload-title">Upload Brands CSV</h2>
        <p className="upload-subtitle">
          Drag and drop your CSV file here, or click to browse.
        </p>
        <div className="file-input-wrapper">
          <button className="btn-primary" disabled={uploading}>
            {uploading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Uploading...</> : 'Browse Files'}
          </button>
          <input type="file" accept=".csv" onChange={handleChange} disabled={uploading} />
        </div>
        <p style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          CSV must have a header row. Columns: <strong>brand_name</strong>, country (optional, defaults to USA).
        </p>
      </div>

      {/* Queue Header */}
      <div className="toolbar" style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
          Upload Queue
          <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: '400', color: 'var(--text-secondary)' }}>
            ({unprocessed.filter(b => !b.processed).length} pending · {unprocessed.filter(b => b.processed).length} processed)
          </span>
        </h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={loadQueue} disabled={loadingQueue}
            style={{ background: 'var(--surface-color)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
            <RefreshCw size={14} style={loadingQueue ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
          </button>
          {unprocessed.filter(b => !b.processed).length > 0 && (
            <button
              className="btn-primary"
              onClick={handleProcessAll}
              disabled={processingId !== null}
              style={{ background: 'var(--purple)' }}
            >
              <Play size={14} /> Process All
            </button>
          )}
        </div>
      </div>

      {/* Queue List */}
      <div className="brands-list">
        {loadingQueue && (
          <div className="empty-state">
            <div className="spinner spin-center"></div>
            <h3>Loading queue...</h3>
          </div>
        )}

        {!loadingQueue && unprocessed.length === 0 && (
          <div className="empty-state">
            <CheckCircle size={48} style={{ color: 'var(--green)' }} />
            <h3>Queue is empty</h3>
            <p>Upload a CSV to add brands to the processing queue.</p>
          </div>
        )}

        {!loadingQueue && unprocessed.map((b) => {
          const id = b._id || b.id;
          const isProcessing = processingId === id;
          const isProcessed = b.processed === true;

          return (
            <div key={id} className="brand-card">
              <div className="brand-header unprocessed">
                <div className="brand-icon" style={{
                  background: isProcessed ? 'var(--green-light)' : 'var(--bg-color)',
                  color: isProcessed ? 'var(--green)' : 'var(--text-secondary)',
                  borderColor: isProcessed ? 'var(--green)' : 'var(--border-color)'
                }}>
                  {(b.brand || 'B').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="brand-name">{b.brand}</div>
                  <div className="brand-country">{b.country || 'USA'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isProcessed && (
                    <span className="badge green">
                      <CheckCircle size={11} /> Processed
                    </span>
                  )}
                  {!isProcessed && (
                    <button
                      className="btn-process"
                      onClick={() => handleProcess(id)}
                      disabled={processingId !== null}
                    >
                      {isProcessing ? (
                        <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                      ) : (
                        <><Play size={13} /> Process</>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Upload;
