import React, { useState } from 'react';
import { FileSpreadsheet, Loader, UploadCloud } from 'lucide-react';

function Upload({ apiUrl }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const apiBase = apiUrl.replace(/\/$/, '');

  const setStatus = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3500);
  };

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

  const handleFile = (file) => {
    if (!file.name.endsWith('.csv')) {
      setStatus('Please upload a valid .csv file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

      if (lines.length < 2) {
        setStatus('CSV is empty or has no data rows.', 'error');
        return;
      }

      const brands = lines.slice(1).map((line) => {
        const cols = line.split(',');
        return {
          brand: (cols[0] || '').replace(/"/g, '').trim(),
          country: cols[1] ? cols[1].replace(/"/g, '').trim() : 'USA',
        };
      }).filter((brand) => brand.brand !== '');

      if (brands.length === 0) {
        setStatus('No valid brand names found in CSV.', 'error');
        return;
      }

      setUploading(true);
      try {
        const res = await fetch(`${apiBase}/brands/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brands }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        setStatus(`Imported ${result.inserted} brands. ${result.skipped} already existed.`);
      } catch (err) {
        setStatus('Upload failed: ' + err.message, 'error');
      }
      setUploading(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="page-shell page-shell--narrow upload-page">
      {message && (
        <div className={`toast-banner ${message.type === 'error' ? 'error' : 'success'}`}>
          {message.text}
        </div>
      )}

      <section className="upload-header">
        <div>
          <span className="eyebrow">CSV import</span>
          <h2 className="upload-header__title">Import brands</h2>
          <p className="upload-header__subtitle">Upload a CSV to add brands into the processing queue.</p>
        </div>
        <div className="upload-format-card">
          <div className="upload-format-card__icon">
            <FileSpreadsheet size={18} />
          </div>
          <div>
            <strong>Expected columns</strong>
            <div className="upload-format-chips">
              <span className="upload-format-chip">brand_name</span>
              <span className="upload-format-chip">country</span>
            </div>
          </div>
        </div>
      </section>

      <section className="upload-workspace surface-card">
        <div
          className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="upload-dropzone__icon">
            <UploadCloud size={30} />
          </div>
          <div className="upload-dropzone__content">
            <h3>Drop CSV here</h3>
            <p>Only CSV files are accepted for queue import.</p>
          </div>
          <div className="file-input-wrapper">
            <button className="btn-primary" disabled={uploading}>
              {uploading ? <><Loader size={14} className="spin-inline" /> Uploading...</> : 'Choose CSV'}
            </button>
            <input type="file" accept=".csv" onChange={handleChange} disabled={uploading} />
          </div>
        </div>

        <div className="upload-notes">
          <div className="upload-note">
            <span className="upload-note__label">Format</span>
            <span className="upload-note__value">Header row required</span>
          </div>
          <div className="upload-note">
            <span className="upload-note__label">Country</span>
            <span className="upload-note__value">Defaults to USA if blank</span>
          </div>
          <div className="upload-note">
            <span className="upload-note__label">Next step</span>
            <span className="upload-note__value">Run processing from the queue page</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Upload;
