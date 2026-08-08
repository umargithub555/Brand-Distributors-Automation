import React, { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { parseApiError } from '../utils/api';

function PasswordInput({ label, value, onChange, placeholder = '', autoComplete = 'off' }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="settings-field">
      <span>{label}</span>
      <div className="password-field-wrap">
        <input
          className="form-input password-field-input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
        />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </label>
  );
}

function AccountSettings({ apiUrl, admin, onAdminRefresh }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const setField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    if (form.new_password !== form.confirm_password) {
      setError('New password and confirmation do not match.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Unable to change password'));
      }

      const data = await response.json();
      setSuccess(data.message || 'Password changed successfully.');
      setForm({ current_password: '', new_password: '', confirm_password: '' });
      if (data.admin) {
        onAdminRefresh?.(data.admin);
      }
    } catch (err) {
      setError(err.message || 'Unable to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell page-shell--narrow">
      <section className="page-hero page-hero--compact">
        <span className="eyebrow"><ShieldCheck size={14} /> Admin Security</span>
        <h1 className="page-title">Manage admin access</h1>
        <p className="page-subtitle">
          Update the single admin password regularly, keep the inbox for OTP recovery secure, and use logout when the ngrok session is shared temporarily.
        </p>
      </section>

      <section className="surface-card settings-panel">
        <div className="settings-meta">
          <span className="settings-meta__item"><LockKeyhole size={14} /> Signed in as {admin?.email || 'admin'}</span>
        </div>

        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-grid">
            <PasswordInput
              label="Current password"
              value={form.current_password}
              onChange={(event) => setField('current_password', event.target.value)}
              autoComplete="current-password"
            />
            <div />
            <PasswordInput
              label="New password"
              value={form.new_password}
              onChange={(event) => setField('new_password', event.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <PasswordInput
              label="Confirm new password"
              value={form.confirm_password}
              onChange={(event) => setField('confirm_password', event.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error ? <div className="settings-alert settings-alert--error">{error}</div> : null}
          {success ? <div className="settings-alert settings-alert--success">{success}</div> : null}

          <div className="settings-actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? 'Updating password...' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AccountSettings;
