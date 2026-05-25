import { getStoredToken, setStoredToken } from './authToken';

/** Same `/api` base as web (`VITE_API_URL`). Use LAN IP for physical devices / some emulators. */
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3001/api';

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  productId?: string;
};

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = (await res.json().catch(() => ({}))) as { error?: string };

  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Request failed');
  }
  return data as T;
}

export const api = {
  getBaseUrl: () => API_BASE,

  async login(email: string, password: string) {
    const data = await fetchApi<{ token: string; user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setStoredToken(data.token);
    return data;
  },

  async logout() {
    await setStoredToken(null);
  },

  async getMe() {
    return fetchApi<ApiUser>('/auth/me');
  },

  async getTransactions() {
    return fetchApi<unknown[]>('/erp/transactions');
  },
};
