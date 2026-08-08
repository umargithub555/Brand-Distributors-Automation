import { useEffect, useState } from 'react';
import { FileText, Loader, Save } from 'lucide-react';

const DEFAULT_FORM = {
  brand_with_distributors: { subject: '', body: '' },
  brand_without_distributors: { subject: '', body: '' },
  distributor_outreach: { subject: '', body: '' },
};

const TEMPLATE_META = [
  {
    key: 'brand_with_distributors',
    title: 'Brand email with distributors found',
    description: 'Used when a brand or parent-company contact exists and the research already found distributor candidates.',
    placeholders: ['{brand_name}', '{country}', '{parent_company}', '{recipient_label}', '{distributor_list}'],
  },
  {
    key: 'brand_without_distributors',
    title: 'Brand email without distributors found',
    description: 'Used when no distributors were found and the message asks the brand or parent company to share them.',
    placeholders: ['{brand_name}', '{country}', '{parent_company}', '{recipient_label}'],
  },
  {
    key: 'distributor_outreach',
    title: 'Distributor outreach email',
    description: 'Used for distributor verification campaigns queued from a processed brand record.',
    placeholders: ['{brand_name}', '{country}', '{distributor_name}'],
  },
];

function EmailTemplatesSettings({ apiUrl }) {
  const apiBase = apiUrl.replace(/\/$/, '');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTemplates() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${apiBase}/settings/email-templates`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to load email templates');
        }
        if (cancelled) return;
        setForm({
          brand_with_distributors: {
            subject: data.brand_with_distributors?.subject || '',
            body: data.brand_with_distributors?.body || '',
          },
          brand_without_distributors: {
            subject: data.brand_without_distributors?.subject || '',
            body: data.brand_without_distributors?.body || '',
          },
          distributor_outreach: {
            subject: data.distributor_outreach?.subject || '',
            body: data.distributor_outreach?.body || '',
          },
        });
        setUpdatedAt(data.updated_at || null);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load email templates');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  const setTemplateField = (templateKey, field, value) => {
    setForm((prev) => ({
      ...prev,
      [templateKey]: {
        ...prev[templateKey],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        brand_with_distributors: {
          subject: form.brand_with_distributors.subject.trim(),
          body: form.brand_with_distributors.body.trim(),
        },
        brand_without_distributors: {
          subject: form.brand_without_distributors.subject.trim(),
          body: form.brand_without_distributors.body.trim(),
        },
        distributor_outreach: {
          subject: form.distributor_outreach.subject.trim(),
          body: form.distributor_outreach.body.trim(),
        },
      };

      const res = await fetch(`${apiBase}/settings/email-templates`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to save email templates');
      }

      setUpdatedAt(data.updated_at || null);
      setMessage('Email templates saved successfully. New brand and distributor sends will use this copy.');
    } catch (err) {
      setError(err.message || 'Failed to save email templates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <section className="page-hero">
        <span className="eyebrow"><FileText size={12} /> Email Templates</span>
        <h2 className="page-title">Manage the outreach copy used by the system</h2>
        <p className="page-subtitle">
          Review and update the subject lines and message bodies used for brand verification emails and distributor outreach.
        </p>
      </section>

      <section className="surface-card settings-panel">
        {loading ? (
          <div className="settings-loading"><Loader size={18} className="spin-inline" /> Loading templates...</div>
        ) : (
          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="settings-meta">
              <div className="settings-meta__item">Updated at: <strong>{updatedAt || 'Not saved yet'}</strong></div>
            </div>

            {TEMPLATE_META.map((templateMeta) => (
              <section key={templateMeta.key} className="settings-template-card">
                <div className="settings-template-card__header">
                  <div>
                    <h3>{templateMeta.title}</h3>
                    <p>{templateMeta.description}</p>
                  </div>
                  <div className="settings-placeholder-box">
                    <span>Available placeholders</span>
                    <div className="settings-placeholder-list">
                      {templateMeta.placeholders.map((placeholder) => (
                        <code key={placeholder} className="settings-placeholder-pill">{placeholder}</code>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-template-grid">
                  <label className="settings-field settings-field--full">
                    <span>Subject</span>
                    <input
                      className="form-input"
                      value={form[templateMeta.key].subject}
                      onChange={(e) => setTemplateField(templateMeta.key, 'subject', e.target.value)}
                      placeholder="Enter subject line"
                    />
                  </label>
                  <label className="settings-field settings-field--full">
                    <span>Body</span>
                    <textarea
                      className="composer-textarea settings-template-textarea"
                      value={form[templateMeta.key].body}
                      onChange={(e) => setTemplateField(templateMeta.key, 'body', e.target.value)}
                      placeholder="Enter email body"
                    />
                  </label>
                </div>
              </section>
            ))}

            {error && <div className="settings-alert settings-alert--error">{error}</div>}
            {message && <div className="settings-alert settings-alert--success">{message}</div>}

            <div className="settings-actions">
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? <><Loader size={14} className="spin-inline" /> Saving...</> : <><Save size={14} /> Save email templates</>}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export default EmailTemplatesSettings;
