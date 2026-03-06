const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function getToken(): string | null {
  return localStorage.getItem('casifly_token');
}

function setToken(token: string | null) {
  if (token) localStorage.setItem('casifly_token', token);
  else localStorage.removeItem('casifly_token');
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || res.statusText || 'Request failed');
  }
  return data as T;
}

export const api = {
  getToken,
  setToken,

  async login(email: string, password: string) {
    const data = await fetchApi<{ token: string; user: { id: string; email: string; name: string; role: string; productId?: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    return data;
  },

  logout() {
    setToken(null);
  },

  async getMe() {
    return fetchApi<{ id: string; email: string; name: string; role: string; productId?: string }>('/auth/me');
  },

  async getProducts() {
    return fetchApi<unknown[]>('/products');
  },

  async addProduct(body: { name: string; description?: string; storeType?: string }) {
    return fetchApi<unknown>('/products', { method: 'POST', body: JSON.stringify(body) });
  },

  async updateProduct(id: string, body: Record<string, unknown>) {
    return fetchApi<unknown>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  async deleteProduct(id: string) {
    return fetchApi<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' });
  },

  async getProductUsers(productId: string) {
    return fetchApi<unknown[]>(`/products/${productId}/users`);
  },

  async addProductUser(productId: string, body: { email: string; password: string; name: string; role?: string }) {
    return fetchApi<unknown>(`/products/${productId}/users`, { method: 'POST', body: JSON.stringify(body) });
  },

  async updateProductUser(productId: string, userId: string, body: Record<string, unknown>) {
    return fetchApi<unknown>(`/products/${productId}/users/${userId}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  async deleteProductUser(productId: string, userId: string) {
    return fetchApi<{ ok: boolean }>(`/products/${productId}/users/${userId}`, { method: 'DELETE' });
  },

  async getAccounts() {
    return fetchApi<unknown[]>('/erp/accounts');
  },

  async addAccount(body: { name: string; category: 'Bank' | 'Cash' }) {
    return fetchApi<unknown>('/erp/accounts', { method: 'POST', body: JSON.stringify(body) });
  },

  async getCustomers() {
    return fetchApi<unknown[]>('/erp/customers');
  },

  async addCustomer(body: { name: string; phone: string; commissionRates?: Record<string, number> }) {
    return fetchApi<unknown>('/erp/customers', { method: 'POST', body: JSON.stringify(body) });
  },

  async updateCustomer(id: string, body: Record<string, unknown>) {
    return fetchApi<unknown>(`/erp/customers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  async deleteCustomer(id: string) {
    return fetchApi<{ ok: boolean }>(`/erp/customers/${id}`, { method: 'DELETE' });
  },

  async getWallets() {
    return fetchApi<unknown[]>('/erp/wallets');
  },

  async addWallet(body: { name: string; pgName?: string; charges?: Record<string, number>; storeId?: string }) {
    return fetchApi<unknown>('/erp/wallets', { method: 'POST', body: JSON.stringify(body) });
  },

  async updateWallet(id: string, body: { name?: string }) {
    return fetchApi<unknown>(`/erp/wallets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },

  async deleteWallet(id: string) {
    return fetchApi<{ ok: boolean }>(`/erp/wallets/${id}`, { method: 'DELETE' });
  },

  async addWalletPG(walletId: string, pgConfig: { name: string; charges: Record<string, number> }) {
    return fetchApi<unknown>(`/erp/wallets/${walletId}/pgs`, { method: 'PATCH', body: JSON.stringify({ action: 'add', pgConfig }) });
  },

  async updateWalletPG(walletId: string, oldPgName: string, pgConfig: { name: string; charges: Record<string, number> }) {
    return fetchApi<unknown>(`/erp/wallets/${walletId}/pgs`, { method: 'PATCH', body: JSON.stringify({ action: 'update', oldPgName, pgConfig }) });
  },

  async getTransactions() {
    return fetchApi<unknown[]>('/erp/transactions');
  },

  async postTransaction(body: { description: string; type: string; entries: unknown[]; metadata?: Record<string, unknown>; date?: string }) {
    return fetchApi<unknown>('/erp/transactions', { method: 'POST', body: JSON.stringify(body) });
  },

  async deleteTransaction(id: string) {
    return fetchApi<{ ok: boolean }>(`/erp/transactions/${id}`, { method: 'DELETE' });
  },

  async getAccountBalance(accountId: string) {
    const data = await fetchApi<{ balance: number }>(`/erp/balance/${accountId}`);
    return data.balance;
  },

  async getStaffTargets(month?: string) {
    const q = month ? `?month=${encodeURIComponent(month)}` : '';
    return fetchApi<{ storeId: string; staffId: string; month: string; target: number }[]>(`/erp/staff-targets${q}`);
  },

  async setStaffTarget(staffId: string, month: string, target: number) {
    return fetchApi<{ storeId: string; staffId: string; month: string; target: number }>('/erp/staff-targets', {
      method: 'POST',
      body: JSON.stringify({ staffId, month, target }),
    });
  },

  async getStaffAnalytics(opts?: { month?: string; dateFrom?: string; dateTo?: string; staffId?: string }) {
    const params = new URLSearchParams();
    if (opts?.month) params.set('month', opts.month);
    if (opts?.dateFrom) params.set('dateFrom', opts.dateFrom);
    if (opts?.dateTo) params.set('dateTo', opts.dateTo);
    if (opts?.staffId) params.set('staffId', opts.staffId);
    const q = params.toString() ? `?${params}` : '';
    return fetchApi<{ staffId: string; staffName: string; month: string; target: number; achieved: number; percentage: number; transactionCount: number }[]>(`/erp/staff-analytics${q}`);
  },
};

export const USE_API = import.meta.env.VITE_USE_API === 'true' || import.meta.env.VITE_USE_API === '1';
