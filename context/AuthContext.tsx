import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser, Product, ProductUser, StoreType } from '../types';
import { generateId } from '../lib/utils';
import { api, USE_API } from '../lib/api';

const MASTER_ADMIN_EMAIL = 'admin@casifly.com';
const MASTER_ADMIN_PASSWORD = 'Admin@123';
const STORAGE_KEY = 'casifly_admin_data';

interface AdminData {
  products: Product[];
  productUsers: ProductUser[];
}

const DEFAULT_PRODUCT: Product = {
  id: 'P0001',
  name: 'Main Store',
  slug: 'main-store',
  description: 'Swipe & Pay, Ledgers, Money Transfer, Reports',
  status: 'active',
  storeType: 'other',
  createdAt: new Date().toISOString(),
};

const loadAdminData = (): AdminData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // Migrate old products without storeType
      if (data?.products?.length) {
        data.products = data.products.map((p: Product) => ({
          ...p,
          storeType: p.storeType || 'other',
        }));
      }
      return data;
    }
  } catch (_) {}
  return { products: [DEFAULT_PRODUCT], productUsers: [] };
};

const saveAdminData = (data: AdminData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isMasterAdmin: boolean;

  // Master Admin - Products
  products: Product[];
  addProduct: (name: string, options?: { description?: string; storeType?: StoreType }) => Product;
  updateProduct: (id: string, data: Partial<Product>) => void;
  deleteProduct: (id: string) => void;

  // Master Admin - Product Users
  productUsers: ProductUser[];
  getUsersByProduct: (productId: string) => ProductUser[];
  addProductUser: (productId: string, email: string, password: string, name: string, role?: 'admin' | 'user') => Promise<{ success: boolean; error?: string }>;
  updateProductUser: (id: string, data: Partial<ProductUser>) => void;
  deleteProductUser: (id: string) => void;

  // Current user profile (store users)
  getCurrentProductUser: () => ProductUser | null;
  updateCurrentUserProfile: (data: { name?: string; email?: string; password?: string }) => { success: boolean; error?: string };

  // Store Admin - create and manage staff (only callable by store admin)
  addStaff: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  getStaffForCurrentStore: () => ProductUser[];
  updateStaffStatus: (staffId: string, status: 'active' | 'inactive') => { success: boolean; error?: string };
  removeStaff: (staffId: string) => { success: boolean; error?: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'casifly_session';

const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [adminData, setAdminData] = useState<AdminData>(loadAdminData);
  const [productsLoaded, setProductsLoaded] = useState(false);

  useEffect(() => {
    if (USE_API && api.getToken()) {
      api.getMe()
        .then((u) => setUser({ id: u.id, email: u.email, name: u.name, role: u.role as AuthUser['role'], productId: u.productId }))
        .catch(() => { api.logout(); setUser(null); });
      return;
    }
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const u = JSON.parse(raw);
        if (u?.id && u?.email) setUser(u);
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    saveAdminData(adminData);
  }, [adminData]);

  useEffect(() => {
    if (USE_API && user?.role === 'master_admin' && !productsLoaded) {
      api.getProducts()
        .then((list: any) => {
          const products: Product[] = (list || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            status: p.status || 'active',
            storeType: p.storeType || 'other',
            createdAt: p.createdAt,
          }));
          setAdminData((d) => ({ ...d, products: products.length ? products : d.products }));
          setProductsLoaded(true);
          return Promise.all(products.map((p) => api.getProductUsers(p.id)));
        })
        .then((userArrays) => {
          if (userArrays) {
            const allUsers: ProductUser[] = (userArrays as any[]).flat().map((u: any) => ({
              id: u.id,
              productId: u.productId,
              email: u.email,
              password: '',
              name: u.name,
              role: u.role,
              status: u.status,
              createdAt: u.createdAt,
            }));
            setAdminData((d) => ({ ...d, productUsers: allUsers }));
          }
        })
        .catch(() => setProductsLoaded(true));
    }
  }, [user?.role, productsLoaded]);

  useEffect(() => {
    if (USE_API && user?.role === 'product_admin' && user.productId && !productsLoaded) {
      api.getProductUsers(user.productId)
        .then((list: any) => {
          const users: ProductUser[] = (list || []).map((u: any) => ({
            id: u.id,
            productId: u.productId,
            email: u.email,
            password: '',
            name: u.name,
            role: u.role,
            status: u.status,
            createdAt: u.createdAt,
          }));
          setAdminData((d) => ({ ...d, productUsers: users }));
          setProductsLoaded(true);
        })
        .catch(() => setProductsLoaded(true));
    }
  }, [USE_API, user?.role, user?.productId, productsLoaded]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPass = password.trim();

    if (USE_API) {
      try {
        const data = await api.login(trimmedEmail, trimmedPass);
        const u: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: data.user.role as AuthUser['role'],
          productId: data.user.productId,
        };
        setUser(u);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Invalid email or password' };
      }
    }

    // Local: Master Admin
    if (trimmedEmail === MASTER_ADMIN_EMAIL && trimmedPass === MASTER_ADMIN_PASSWORD) {
      const u: AuthUser = { id: 'master', email: MASTER_ADMIN_EMAIL, name: 'Master Admin', role: 'master_admin' };
      setUser(u);
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      return { success: true };
    }

    // Local: Product User
    const pu = adminData.productUsers.find(
      (p) => p.email.toLowerCase() === trimmedEmail && p.password === trimmedPass && p.status === 'active'
    );
    if (pu) {
      const prod = adminData.products.find((p) => p.id === pu.productId);
      if (!prod || prod.status !== 'active') return { success: false, error: 'Store is inactive' };
      const u: AuthUser = {
        id: pu.id,
        email: pu.email,
        name: pu.name,
        role: pu.role === 'admin' ? 'product_admin' : 'user',
        productId: pu.productId,
      };
      setUser(u);
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      return { success: true };
    }

    return { success: false, error: 'Invalid email or password' };
  };

  const logout = () => {
    setUser(null);
    if (USE_API) api.logout();
    else localStorage.removeItem(SESSION_KEY);
  };

  const addProduct = (name: string, options?: { description?: string; storeType?: StoreType }): Product => {
    if (USE_API) {
      const storeType = options?.storeType ?? 'other';
      api.addProduct({ name: name.trim(), description: options?.description, storeType })
        .then((p: any) => {
          const prod: Product = {
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            status: p.status || 'active',
            storeType: (p.storeType || 'other') as StoreType,
            createdAt: p.createdAt,
          };
          setAdminData((d) => ({ ...d, products: [...d.products, prod] }));
        })
        .catch(() => {});
      return { id: '', name: name.trim(), slug: '', description: options?.description, status: 'active', storeType: storeType as StoreType, createdAt: new Date().toISOString() };
    }
    const storeType = options?.storeType ?? 'other';
    const slug = slugify(name) || 'product';
    const existing = adminData.products.filter((p) => p.slug.startsWith(slug));
    const finalSlug = existing.length ? `${slug}-${existing.length + 1}` : slug;

    let id: string;
    if (storeType === 'casifly') {
      const casiflyIds = adminData.products
        .filter((p) => p.storeType === 'casifly')
        .map((p) => parseInt(p.id.replace(/^c/i, ''), 10))
        .filter((n) => !isNaN(n));
      const nextNum = casiflyIds.length > 0 ? Math.max(...casiflyIds) + 1 : 1;
      id = `c${nextNum}`;
    } else {
      const otherIds = adminData.products
        .filter((p) => (p.storeType || 'other') === 'other')
        .map((p) => parseInt(p.id.replace(/^o/i, ''), 10))
        .filter((n) => !isNaN(n));
      const nextNum = otherIds.length > 0 ? Math.max(...otherIds) + 1 : 1;
      id = `o${nextNum}`;
    }

    const prod: Product = {
      id,
      name: name.trim(),
      slug: finalSlug,
      description: options?.description,
      status: 'active',
      storeType,
      createdAt: new Date().toISOString(),
    };
    setAdminData((d) => ({ ...d, products: [...d.products, prod] }));
    return prod;
  };

  const updateProduct = (id: string, data: Partial<Product>) => {
    if (USE_API) {
      api.updateProduct(id, data).then((p: any) => {
        setAdminData((d) => ({
          ...d,
          products: d.products.map((prod) => (prod.id === id ? { ...prod, ...p } : prod)),
        }));
      }).catch(() => {});
      return;
    }
    setAdminData((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }));
  };

  const deleteProduct = (id: string) => {
    if (USE_API) {
      api.deleteProduct(id).then(() => {
        setAdminData((d) => ({
          ...d,
          products: d.products.filter((p) => p.id !== id),
          productUsers: d.productUsers.filter((u) => u.productId !== id),
        }));
      }).catch(() => {});
      return;
    }
    setAdminData((d) => ({
      ...d,
      products: d.products.filter((p) => p.id !== id),
      productUsers: d.productUsers.filter((u) => u.productId !== id),
    }));
  };

  const getUsersByProduct = (productId: string) =>
    adminData.productUsers.filter((u) => u.productId === productId);

  const addProductUser = async (
    productId: string,
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'user' = 'user'
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password.trim()) return { success: false, error: 'Email and password required' };
    if (password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };
    if (USE_API) {
      try {
        const u = await api.addProductUser(productId, { email: trimmedEmail, password: password.trim(), name: name.trim(), role });
        const pu: ProductUser = {
          id: (u as any).id,
          productId: (u as any).productId,
          email: (u as any).email,
          password: '',
          name: (u as any).name,
          role: (u as any).role,
          status: 'active',
          createdAt: (u as any).createdAt,
        };
        setAdminData((d) => ({ ...d, productUsers: [...d.productUsers, pu] }));
        return { success: true };
      } catch (e: any) {
        return { success: false, error: e?.message || 'Failed to add user' };
      }
    }
    const existsInStore = adminData.productUsers.some((u) => u.email.toLowerCase() === trimmedEmail && u.productId === productId);
    if (existsInStore) return { success: false, error: 'Email already registered for this store' };
    const existsElsewhere = adminData.productUsers.some((u) => u.email.toLowerCase() === trimmedEmail);
    if (existsElsewhere) return { success: false, error: 'Email already registered for another store' };

    const pu: ProductUser = {
      id: generateId('U'),
      productId,
      email: trimmedEmail,
      password: password.trim(),
      name: name.trim(),
      role,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setAdminData((d) => ({ ...d, productUsers: [...d.productUsers, pu] }));
    return { success: true };
  };

  const updateProductUser = (id: string, data: Partial<ProductUser>) => {
    const u = adminData.productUsers.find((x) => x.id === id);
    if (USE_API && u) {
      api.updateProductUser(u.productId, id, data).then(() => {
        setAdminData((d) => ({
          ...d,
          productUsers: d.productUsers.map((pu) => (pu.id === id ? { ...pu, ...data } : pu)),
        }));
      }).catch(() => {});
      return;
    }
    setAdminData((d) => ({
      ...d,
      productUsers: d.productUsers.map((pu) => (pu.id === id ? { ...pu, ...data } : pu)),
    }));
  };

  const deleteProductUser = (id: string) => {
    const u = adminData.productUsers.find((x) => x.id === id);
    if (USE_API && u) {
      api.deleteProductUser(u.productId, id).then(() => {
        setAdminData((d) => ({ ...d, productUsers: d.productUsers.filter((pu) => pu.id !== id) }));
      }).catch(() => {});
      return;
    }
    setAdminData((d) => ({ ...d, productUsers: d.productUsers.filter((pu) => pu.id !== id) }));
  };

  const getCurrentProductUser = (): ProductUser | null => {
    if (!user || user.role === 'master_admin') return null;
    return adminData.productUsers.find((u) => u.id === user.id) || null;
  };

  const addStaff = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string }> => {
    if (!user || user.role !== 'product_admin' || !user.productId) {
      return { success: false, error: 'Only store admins can add staff' };
    }
    return addProductUser(user.productId, email, password, name, 'user');
  };

  const getStaffForCurrentStore = (): ProductUser[] => {
    if (!user || user.role === 'master_admin' || !user.productId) return [];
    return adminData.productUsers.filter((u) => u.productId === user?.productId && u.role === 'user');
  };

  const updateStaffStatus = (staffId: string, status: 'active' | 'inactive'): { success: boolean; error?: string } => {
    if (!user || user.role !== 'product_admin' || !user.productId) return { success: false, error: 'Not authorised' };
    const target = adminData.productUsers.find((u) => u.id === staffId && u.productId === user.productId && u.role === 'user');
    if (!target) return { success: false, error: 'Staff not found' };
    updateProductUser(staffId, { status });
    return { success: true };
  };

  const removeStaff = (staffId: string): { success: boolean; error?: string } => {
    if (!user || user.role !== 'product_admin' || !user.productId) return { success: false, error: 'Not authorised' };
    const target = adminData.productUsers.find((u) => u.id === staffId && u.productId === user.productId && u.role === 'user');
    if (!target) return { success: false, error: 'Staff not found' };
    deleteProductUser(staffId);
    return { success: true };
  };

  const updateCurrentUserProfile = (data: { name?: string; email?: string; password?: string }): { success: boolean; error?: string } => {
    if (!user || user.role === 'master_admin') return { success: false, error: 'Not a store user' };
    const pu = adminData.productUsers.find((u) => u.id === user.id);
    if (!pu) return { success: false, error: 'User not found' };

    // Store users can only change password. Name and email are fixed by Master Admin.
    if (data.password !== undefined && data.password.length > 0 && data.password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    const updates: Partial<ProductUser> = {};
    if (data.password !== undefined && data.password.length > 0) updates.password = data.password;
    // Ignore name and email - store users cannot change them

    if (Object.keys(updates).length === 0) return { success: true };

    updateProductUser(pu.id, updates);
    return { success: true };
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isMasterAdmin: user?.role === 'master_admin',
    products: adminData.products,
    addProduct,
    updateProduct,
    deleteProduct,
    productUsers: adminData.productUsers,
    getUsersByProduct,
    addProductUser,
    updateProductUser,
    deleteProductUser,
    getCurrentProductUser,
    updateCurrentUserProfile,
    addStaff,
    getStaffForCurrentStore,
    updateStaffStatus,
    removeStaff,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
