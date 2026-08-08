const STORAGE_KEY = 'brand-intelligence-admin-session';

export function getStoredAuthSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuthSession(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStoredAuthToken() {
  return getStoredAuthSession()?.token || '';
}
