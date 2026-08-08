import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { parseApiError } from '../utils/api';

function PasswordInput({ label, value, onChange, placeholder = '', autoComplete = 'off' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="settings-field">
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
    </div>
  );
}

function ForgotPassword({ apiUrl, isAuthenticated }) {
  const navigate = useNavigate();
  const [requestForm, setRequestForm] = useState({ email: '' });
  const [resetForm, setResetForm] = useState({ email: '', otp: '', new_password: '', confirm_password: '' });
  const [requesting, setRequesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleRequestOtp = async (event) => {
    event.preventDefault();
    setRequesting(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Unable to send reset OTP'));
      }

      const data = await response.json();
      setOtpRequested(true);
      setResetForm((current) => ({ ...current, email: requestForm.email }));
      setSuccess(data.message || 'Reset OTP sent.');
    } catch (err) {
      setError(err.message || 'Unable to send reset OTP');
    } finally {
      setRequesting(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setResetting(true);
    setError('');
    setSuccess('');

    if (resetForm.new_password !== resetForm.confirm_password) {
      setError('New password and confirmation do not match.');
      setResetting(false);
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetForm.email,
          otp: resetForm.otp,
          new_password: resetForm.new_password,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Unable to reset password'));
      }

      const data = await response.json();
      setSuccess(data.message || 'Password reset successfully. Redirecting to admin login...');
      setResetForm({ email: resetForm.email, otp: '', new_password: '', confirm_password: '' });
      window.setTimeout(() => {
        navigate('/login', { replace: true });
      }, 900);
    } catch (err) {
      setError(err.message || 'Unable to reset password');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-layout auth-layout--single">
        <section className="auth-card surface-card">
          <div className="card-title-row">
            <h3>Reset admin password</h3>
            <span>Request a one-time code first, then set a new password.</span>
          </div>

          <form className="auth-form" onSubmit={handleRequestOtp}>
            <div className="settings-field">
              <span>Admin email</span>
              <input
                className="form-input"
                type="email"
                value={requestForm.email}
                onChange={(event) => setRequestForm({ email: event.target.value })}
                placeholder="admin email"
                required
              />
            </div>
            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={requesting}>
                {requesting ? 'Sending OTP...' : 'Send OTP'}
              </button>
              <Link className="auth-link" to="/login">Back to login</Link>
            </div>
          </form>

          {otpRequested ? (
            <form className="auth-form auth-form--spaced" onSubmit={handleResetPassword}>
              <div className="settings-field">
                <span>One-time password</span>
                <input
                  className="form-input"
                  value={resetForm.otp}
                  onChange={(event) => setResetForm((current) => ({ ...current, otp: event.target.value }))}
                  placeholder="6-digit code"
                  required
                />
              </div>
              <PasswordInput
                label="New password"
                value={resetForm.new_password}
                onChange={(event) => setResetForm((current) => ({ ...current, new_password: event.target.value }))}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <PasswordInput
                label="Confirm new password"
                value={resetForm.confirm_password}
                onChange={(event) => setResetForm((current) => ({ ...current, confirm_password: event.target.value }))}
                placeholder="Repeat new password"
                autoComplete="new-password"
              />
              <div className="auth-actions">
                <button className="btn-primary" type="submit" disabled={resetting}>
                  {resetting ? 'Resetting...' : 'Reset password'}
                </button>
              </div>
            </form>
          ) : null}

          {error ? <div className="settings-alert settings-alert--error">{error}</div> : null}
          {success ? <div className="settings-alert settings-alert--success">{success}</div> : null}
        </section>
      </div>
    </div>
  );
}

export default ForgotPassword;
