import React, { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardHeader, CardContent, Input, Button } from '../components/ui/Elements';
import { Store, Plus, Trash2, ChevronDown, ChevronRight, X, Menu } from 'lucide-react';
import { Product, ProductUser } from '../types';
import { useConfirm } from '../context/ConfirmContext';
import { MasterAdminAnalytics } from './MasterAdminAnalytics';
import { MasterAdminWallet } from './MasterAdminWallet';
import { MasterAdminSidebar } from '../components/MasterAdminSidebar';

export const MasterAdmin: React.FC = () => {
  const {
    user,
    logout,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    getUsersByProduct,
    addProductUser,
    updateProductUser,
    deleteProductUser,
  } = useAuth();

  const MASTER_VIEW_KEY = 'casifly_master_view';
  const masterViews = ['analytics', 'stores', 'wallet'] as const;
  const getInitialMasterView = (): 'analytics' | 'stores' | 'wallet' => {
    try {
      const s = localStorage.getItem(MASTER_VIEW_KEY);
      if (s && masterViews.includes(s as any)) return s as typeof masterViews[number];
    } catch (_) {}
    return 'analytics';
  };
  const [activeView, setActiveViewState] = useState<'analytics' | 'stores' | 'wallet'>(getInitialMasterView);
  const setActiveView = useCallback((v: 'analytics' | 'stores' | 'wallet') => {
    setActiveViewState(v);
    try { localStorage.setItem(MASTER_VIEW_KEY, v); } catch (_) {}
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddUser, setShowAddUser] = useState<string | null>(null);

  // Add Product form
  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductStoreType, setNewProductStoreType] = useState<'other' | 'casifly'>('other');
  const [productErrors, setProductErrors] = useState<Record<string, string>>({});

  // Add User form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [userErrors, setUserErrors] = useState<Record<string, string>>({});

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProductName.trim();
    if (!name) {
      setProductErrors({ name: 'Product name is required' });
      return;
    }
    addProduct(name, { description: newProductDesc.trim() || undefined, storeType: newProductStoreType });
    setNewProductName('');
    setNewProductDesc('');
    setNewProductStoreType('other');
    setProductErrors({});
    setShowAddProduct(false);
  };

  const handleAddUser = async (e: React.FormEvent, productId: string) => {
    e.preventDefault();
    setUserErrors({});
    const result = await addProductUser(productId, newUserEmail, newUserPassword, newUserName, 'admin');
    if (result.success) {
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setShowAddUser(null);
    } else {
      setUserErrors({ form: result.error || 'Failed to add user' });
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete Store',
      message: `Delete store "${p.name}"? All store users will be removed.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) { deleteProduct(p.id); setExpandedProduct(null); }
  };

  const handleDeleteUser = async (u: ProductUser) => {
    const ok = await confirm({
      title: 'Remove User',
      message: `Remove user "${u.email}"?`,
      confirmText: 'Remove',
      variant: 'danger',
    });
    if (ok) deleteProductUser(u.id);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <MasterAdminSidebar
        currentView={activeView}
        setView={(v) => setActiveView(v as 'analytics' | 'stores' | 'wallet')}
        mobileOpen={sidebarOpen}
        onMobileToggle={() => setSidebarOpen(o => !o)}
        onLogout={logout}
        userEmail={user?.email}
      />
      <button onClick={() => setSidebarOpen(true)} className="md:hidden fixed top-4 left-4 z-10 p-2 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700" aria-label="Open menu">
        <Menu size={24} className="text-slate-700 dark:text-slate-300" />
      </button>
      <main className="md:ml-64 min-h-screen p-6 md:p-8 pt-16 md:pt-8">
        <div className="max-w-6xl mx-auto space-y-6">
        {activeView === 'analytics' && <MasterAdminAnalytics />}
        {activeView === 'wallet' && <MasterAdminWallet />}
        {activeView === 'stores' && (
        /* Stores Section */
        <Card>
          <CardHeader
            title="Stores"
            subtitle="Create stores and add store users. Store users log in to access Swipe & Pay, Ledgers, Reports, etc."
            action={
              <Button size="sm" onClick={() => setShowAddProduct(true)}>
                <Plus size={16} />
                Add Store
              </Button>
            }
          />
          <CardContent>
            {showAddProduct && (
              <form onSubmit={handleAddProduct} className="mb-6 p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-800">Create New Store</h3>
                  <button type="button" onClick={() => setShowAddProduct(false)} className="p-2 text-slate-400 hover:text-slate-600">
                    <X size={20} />
                  </button>
                </div>
                <Input
                  label="Store Name"
                  value={newProductName}
                  onChange={(e) => { setNewProductName(e.target.value); setProductErrors({}); }}
                  error={productErrors.name}
                  placeholder="e.g. Downtown Store, Branch A"
                />
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Store Category</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    value={newProductStoreType}
                    onChange={(e) => setNewProductStoreType(e.target.value as 'other' | 'casifly')}
                  >
                    <option value="other">Other Store (o1, o2...)</option>
                    <option value="casifly">Casifly Store (c1, c2...)</option>
                  </select>
                </div>
                <Input
                  label="Description (optional)"
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  placeholder="Brief description"
                />
                <div className="flex gap-3">
                  <Button type="submit">Create Store</Button>
                  <Button type="button" variant="outline" onClick={() => setShowAddProduct(false)}>Cancel</Button>
                </div>
              </form>
            )}

            {products.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-semibold">No stores yet</p>
                <p className="text-sm mt-1">Create a store and add users. Store users log in to access Swipe & Pay, Ledgers, Reports.</p>
                <Button className="mt-4" onClick={() => setShowAddProduct(true)}>
                  <Plus size={16} />
                  Add First Store
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {products.map((p) => {
                  const users = getUsersByProduct(p.id);
                  const isExpanded = expandedProduct === p.id;
                  return (
                    <div key={p.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                        onClick={() => setExpandedProduct(isExpanded ? null : p.id)}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                          <div>
                            <p className="font-bold text-slate-900">{p.name}</p>
                            <p className="text-xs text-slate-500">{p.slug} • {p.id} • {users.length} user{users.length !== 1 ? 's' : ''}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${p.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {p.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => { setShowAddUser(p.id); setExpandedProduct(p.id); }}>
                            <Plus size={14} />
                            Add Store Admin
                          </Button>
                          <button onClick={() => handleDeleteProduct(p)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-slate-200 bg-slate-50/50 p-4">
                          {/* Users list */}
                          <div className="space-y-3">
                            {showAddUser === p.id && (
                              <form onSubmit={(e) => handleAddUser(e, p.id)} className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                                <div className="flex justify-between items-center">
                                  <h4 className="font-bold text-slate-700">Add Store Admin: {p.name}</h4>
                                  <button type="button" onClick={() => setShowAddUser(null)}><X size={18} /></button>
                                </div>
                                <p className="text-xs text-slate-500">Store admins can log in and create staff for this store. Staff are created from the store admin view after login.</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <Input label="Email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required placeholder="admin@store.com" />
                                  <Input label="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required placeholder="Store Admin name" />
                                  <Input label="Password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} required placeholder="Min 6 characters" />
                                </div>
                                {userErrors.form && <p className="text-sm text-rose-600 font-bold">{userErrors.form}</p>}
                                <Button type="submit" size="sm">Create User</Button>
                              </form>
                            )}
                            {users.length === 0 && showAddUser !== p.id ? (
                              <p className="text-sm text-slate-500 py-4">No store admins yet. Add a store admin — they log in and can create staff for this store.</p>
                            ) : (
                              users.map((u) => (
                                <div key={u.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                                  <div>
                                    <p className="font-semibold text-slate-800">{u.name}</p>
                                    <p className="text-sm text-slate-500">{u.email} • {u.role === 'admin' ? 'Admin' : 'Staff'}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      className="text-xs px-2 py-1 rounded-lg border"
                                      value={u.status}
                                      onChange={(e) => updateProductUser(u.id, { status: e.target.value as 'active' | 'inactive' })}
                                    >
                                      <option value="active">Active</option>
                                      <option value="inactive">Inactive</option>
                                    </select>
                                    <button onClick={() => handleDeleteUser(u)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        )}
        </div>
      </main>
    </div>
  );
};
