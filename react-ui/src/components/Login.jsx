import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { parseApiError } from '../utils/api';

function Login({ apiUrl, isAuthenticated, onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, 'Login failed'));
      }

      const data = await response.json();
      onLogin(data);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell--centered">
      <div className="auth-layout auth-layout--compact">
        <section className="auth-card auth-card--login surface-card">
          <div className="auth-card__intro auth-card__intro--tight">
            <h1>Welcome back</h1>
            <p>Sign in with the admin account to continue into the protected workspace.</p>
          </div>

          <form className="auth-form auth-form--login" onSubmit={handleSubmit}>
            <div className="settings-field auth-field">
              <span>Email address</span>
              <input
                className="form-input"
                type="email"
                value={form.email}
                onChange={(event) => handleChange('email', event.target.value)}
                placeholder="admin email"
                autoComplete="username"
                required
              />
            </div>

            <div className="settings-field auth-field">
              <span>Password</span>
              <div className="password-field-wrap">
                <input
                  className="form-input password-field-input"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => handleChange('password', event.target.value)}
                  placeholder="password"
                  autoComplete="current-password"
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error ? <div className="settings-alert settings-alert--error">{error}</div> : null}

            <div className="auth-actions auth-actions--stacked-mobile">
              <button className="btn-primary auth-submit" type="submit" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
              <Link className="auth-link" to="/forgot-password">Forgot password?</Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

export default Login;
