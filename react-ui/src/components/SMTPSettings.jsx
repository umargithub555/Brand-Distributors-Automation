import { useEffect, useState } from 'react';
import { KeyRound, Loader, Mail, Save, ShieldCheck } from 'lucide-react';

const DEFAULT_FORM = {
  smtp_host: '',
  smtp_port: 587,
  smtp_username: '',
  smtp_password: '',
  smtp_from_email: '',
  smtp_from_name: '',
  smtp_use_tls: true,
  smtp_use_ssl: false,
  clear_password: false,
};

function SMTPSettings({ apiUrl }) {
  const apiBase = apiUrl.replace(/\/$/, '');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState({ has_password: false, password_source: 'unset', updated_at: null });

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${apiBase}/settings/smtp`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to load SMTP settings');
        }
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || 587,
          smtp_username: data.smtp_username || '',
          smtp_password: '',
          smtp_from_email: data.smtp_from_email || '',
          smtp_from_name: data.smtp_from_name || '',
          smtp_use_tls: data.smtp_use_tls ?? true,
          smtp_use_ssl: data.smtp_use_ssl ?? false,
          clear_password: false,
        }));
        setMeta({
          has_password: data.has_password ?? false,
          password_source: data.password_source || 'unset',
          updated_at: data.updated_at || null,
        });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load SMTP settings');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onToggleSsl = (checked) => {
    setForm((prev) => ({
      ...prev,
      smtp_use_ssl: checked,
      smtp_use_tls: checked ? false : prev.smtp_use_tls,
    }));
  };

  const onToggleTls = (checked) => {
    setForm((prev) => ({
      ...prev,
      smtp_use_tls: checked,
      smtp_use_ssl: checked ? false : prev.smtp_use_ssl,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port),
        smtp_username: form.smtp_username.trim(),
        smtp_from_email: form.smtp_from_email.trim(),
        smtp_from_name: form.smtp_from_name.trim(),
        smtp_use_tls: !!form.smtp_use_tls,
        smtp_use_ssl: !!form.smtp_use_ssl,
        clear_password: !!form.clear_password,
      };
      if (form.smtp_password) {
        payload.smtp_password = form.smtp_password;
      }

      const res = await fetch(`${apiBase}/settings/smtp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save SMTP settings');
      }

      setForm((prev) => ({ ...prev, smtp_password: '', clear_password: false }));
      setMeta({
        has_password: data.has_password ?? false,
        password_source: data.password_source || 'unset',
        updated_at: data.updated_at || null,
      });
      setMessage('SMTP settings saved successfully. New email sends will use these credentials.');
    } catch (err) {
      setError(err.message || 'Failed to save SMTP settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell page-shell--narrow">
      <section className="page-hero">
        <span className="eyebrow"><Mail size={12} /> SMTP Settings</span>
        <h2 className="page-title">Mail Delivery Configuration</h2>
        <p className="page-subtitle">
          Save SMTP credentials in MongoDB so brand verification emails can be managed from the app instead of only from environment variables.
        </p>
      </section>

      <section className="surface-card settings-panel">
        {loading ? (
          <div className="settings-loading"><Loader size={18} className="spin-inline" /> Loading settings...</div>
        ) : (
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="settings-grid">
              <label className="settings-field">
                <span>SMTP host</span>
                <input className="form-input" value={form.smtp_host} onChange={(e) => setField('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
              </label>
              <label className="settings-field settings-field--small">
                <span>Port</span>
                <input className="form-input" type="number" min="1" max="65535" value={form.smtp_port} onChange={(e) => setField('smtp_port', e.target.value)} />
              </label>
              <label className="settings-field">
                <span>SMTP username</span>
                <input className="form-input" value={form.smtp_username} onChange={(e) => setField('smtp_username', e.target.value)} placeholder="username or mailbox" />
              </label>
              <label className="settings-field">
                <span>SMTP password</span>
                <input className="form-input" type="password" value={form.smtp_password} onChange={(e) => setField('smtp_password', e.target.value)} placeholder={meta.has_password ? 'Leave blank to keep current password' : 'Enter password'} />
              </label>
              <label className="settings-field">
                <span>From email</span>
                <input className="form-input" type="email" value={form.smtp_from_email} onChange={(e) => setField('smtp_from_email', e.target.value)} placeholder="team@example.com" />
              </label>
              <label className="settings-field">
                <span>From name</span>
                <input className="form-input" value={form.smtp_from_name} onChange={(e) => setField('smtp_from_name', e.target.value)} placeholder="Brand Intelligence" />
              </label>
            </div>

            <div className="settings-toggles">
              <label className="settings-check">
                <input type="checkbox" checked={form.smtp_use_tls} onChange={(e) => onToggleTls(e.target.checked)} />
                <span>Use STARTTLS</span>
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={form.smtp_use_ssl} onChange={(e) => onToggleSsl(e.target.checked)} />
                <span>Use SSL</span>
              </label>
              {/* 
              <label className="settings-check">
                <input type="checkbox" checked={form.clear_password} onChange={(e) => setField('clear_password', e.target.checked)} />
                <span>Clear saved password on next save</span>
              </label>
               */}
            </div>

            <div className="settings-meta">
              <div className="settings-meta__item"><KeyRound size={14} /> Password stored: <strong>{meta.has_password ? 'Yes' : 'No'}</strong></div>
              <div className="settings-meta__item"><ShieldCheck size={14} /> Source: <strong>{meta.password_source}</strong></div>
              <div className="settings-meta__item">Updated at: <strong>{meta.updated_at || 'Not saved yet'}</strong></div>
            </div>

            {error && <div className="settings-alert settings-alert--error">{error}</div>}
            {message && <div className="settings-alert settings-alert--success">{message}</div>}

            <div className="settings-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? <><Loader size={14} className="spin-inline" /> Saving...</> : <><Save size={14} /> Save SMTP settings</>}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export default SMTPSettings;
