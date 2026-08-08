import { clearStoredAuthSession, getStoredAuthToken } from './auth';

let fetchInstalled = false;

function isApiRequest(url) {
  return typeof url === 'string' && (url.startsWith('/api') || url.includes('/api/'));
}

function isAuthExempt(url) {
  return url.includes('/auth/login') || url.includes('/auth/forgot-password') || url.includes('/auth/reset-password');
}

export function installAuthenticatedFetch() {
  if (fetchInstalled || typeof window === 'undefined') {
    return;
  }

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!isApiRequest(url)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init.headers || {});
    const token = getStoredAuthToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    const response = await nativeFetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401 && !isAuthExempt(url)) {
      clearStoredAuthSession();
      window.dispatchEvent(new Event('brand-auth-unauthorized'));
    }

    return response;
  };

  fetchInstalled = true;
}

export async function parseApiError(response, fallback = 'Request failed') {
  try {
    const data = await response.json();
    return data?.detail || data?.message || fallback;
  } catch {
    return fallback;
  }
}
