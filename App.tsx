import React, { useState, useEffect, useRef } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { SwipePay } from './pages/SwipePay';
import { PaySwipe } from './pages/PaySwipe';
import { MoneyTransfer } from './pages/MoneyTransfer';
import { Ledgers } from './pages/Ledgers';
import { Reports } from './pages/Reports';
import { Masters } from './pages/Masters';
import { Staff } from './pages/Staff';
import { StaffAnalytics } from './pages/StaffAnalytics';
import { CRM } from './pages/CRM';
import { Profile } from './pages/Profile';
import { Home } from './pages/Home';
import { StoreLogin } from './pages/StoreLogin';
import { DistributorLogin } from './pages/DistributorLogin';
import { MasterAdmin } from './pages/MasterAdmin';
import { ERPProvider } from './context/ERPContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';

const views = ['dashboard','profile','staff','staff-analytics','swipe-pay','pay-swipe','money-transfer','crm','ledgers','reports','masters'];
const landingHashes = ['home', 'store-login', 'distributor-login'] as const;
const VIEW_STORAGE_KEY = 'casifly_view';

const getHashUrl = (view: string) => {
  const base = window.location.pathname + window.location.search;
  return `${base}${base.endsWith('#') ? '' : '#'}${view}`;
};

const getInitialView = () => {
  try {
    const hash = window.location.hash.slice(1);
    if (hash && views.includes(hash)) return hash;
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved && views.includes(saved)) return saved;
  } catch (_) {}
  return 'dashboard';
};

const getInitialLandingView = (): 'home' | 'store-login' | 'distributor-login' => {
  try {
    const hash = window.location.hash.slice(1);
    if (hash === 'store-login') return 'store-login';
    if (hash === 'distributor-login') return 'distributor-login';
  } catch (_) {}
  return 'home';
};

const AppContent: React.FC = () => {
  const { user, authLoading } = useAuth();
  const [landingView, setLandingViewState] = useState<'home' | 'store-login' | 'distributor-login'>(getInitialLandingView);
  const [currentView, setViewState] = useState(getInitialView);

  const setLandingView = React.useCallback((view: 'home' | 'store-login' | 'distributor-login') => {
    setLandingViewState(view);
    try { window.history.pushState({ casifly: view }, '', getHashUrl(view)); } catch (_) {}
  }, []);

  const setView = React.useCallback((view: string) => {
    if (!views.includes(view)) return;
    setViewState(view);
    try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch (_) {}
    try { window.history.pushState({ casifly: view }, '', getHashUrl(view)); } catch (_) {}
  }, []);

  // Handle browser Back/Forward - use state when available, fallback to hash
  useEffect(() => {
    const syncFromHistory = (e?: PopStateEvent) => {
      const state = e?.state as { casifly?: string } | null;
      const hash = window.location.hash.slice(1);
      const fromState = state?.casifly && (views.includes(state.casifly) || landingHashes.includes(state.casifly as any));
      const viewOrLanding = fromState ? state!.casifly! : hash;

      if (user) {
        if (viewOrLanding && views.includes(viewOrLanding)) {
          setViewState(viewOrLanding);
          try { localStorage.setItem(VIEW_STORAGE_KEY, viewOrLanding); } catch (_) {}
        } else if (viewOrLanding && landingHashes.includes(viewOrLanding as any)) {
          setViewState('dashboard');
          try { localStorage.setItem(VIEW_STORAGE_KEY, 'dashboard'); } catch (_) {}
          try { window.history.replaceState({ casifly: 'dashboard' }, '', getHashUrl('dashboard')); } catch (_) {}
        } else {
          setViewState('dashboard');
          try { localStorage.setItem(VIEW_STORAGE_KEY, 'dashboard'); } catch (_) {}
        }
      } else {
        if (viewOrLanding === 'store-login') setLandingViewState('store-login');
        else if (viewOrLanding === 'distributor-login') setLandingViewState('distributor-login');
        else setLandingViewState('home');
      }
    };
    const handler = (e: PopStateEvent) => syncFromHistory(e);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [user]);

  // Sync URL when showing main app (establish history entry so Back stays in-app)
  const hasMainAppSynced = useRef(false);
  useEffect(() => {
    if (!user || user.role === 'master_admin') return;
    if (hasMainAppSynced.current) return;
    const raf = requestAnimationFrame(() => {
      const cur = window.location.hash.slice(1);
      if (!views.includes(cur)) {
        try { window.history.replaceState({ casifly: currentView }, '', getHashUrl(currentView)); } catch (_) {}
      }
      hasMainAppSynced.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [user?.role, user]);

  // Sync URL when showing pre-login (Home, Store Login, Distributor Login)
  useEffect(() => {
    if (user) return;
    const cur = window.location.hash.slice(1);
    const expected = landingView === 'store-login' ? 'store-login' : landingView === 'distributor-login' ? 'distributor-login' : 'home';
    if (cur !== expected) {
      try { window.history.replaceState({ casifly: expected }, '', getHashUrl(expected)); } catch (_) {}
    }
  }, [user, landingView]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) {
          e.preventDefault();
          setShortcutsOpen(o => !o);
        }
      }
      if (e.key === 'Escape') setShortcutsOpen(false);
      const num = parseInt(e.key, 10);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && num >= 1 && num <= 9 && views[num - 1]) {
        const target = e.target as HTMLElement;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')) {
          setView(views[num - 1]);
          setSidebarOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    if (landingView === 'store-login')     return <StoreLogin onBackToHome={() => window.history.back()} />;
    if (landingView === 'distributor-login') return <DistributorLogin onBackToHome={() => window.history.back()} />;
    return <Home onNavigateToLogin={(type) => setLandingView(type === 'store' ? 'store-login' : 'distributor-login')} />;
  }
  if (user.role === 'master_admin') return <ERPProvider><MasterAdmin /></ERPProvider>;

  const renderView = () => {
    switch(currentView) {
      case 'dashboard': return <Dashboard onNavigate={setView} />;
      case 'profile': return <Profile />;
      case 'staff': return user?.role === 'product_admin' ? <Staff /> : <Dashboard onNavigate={setView} />;
      case 'staff-analytics': return (user?.role === 'product_admin' || user?.role === 'user') ? <StaffAnalytics /> : <Dashboard onNavigate={setView} />;
      case 'swipe-pay': return <SwipePay />;
      case 'pay-swipe': return <PaySwipe />;
      case 'money-transfer': return <MoneyTransfer />;
      case 'crm': return <CRM />;
      case 'ledgers': return <Ledgers />;
      case 'reports': return <Reports />;
      case 'masters': return <Masters />;
      default: return <Dashboard onNavigate={setView} />;
    }
  };

  return (
    <ERPProvider>
      <div className="flex min-h-screen font-sans overflow-hidden bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100">
        {/* Ambient gradient orbs */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-400/20 dark:bg-indigo-500/10 rounded-full blur-3xl animate-float" />
          <div className="absolute top-1/2 -left-32 w-80 h-80 bg-violet-400/15 dark:bg-violet-500/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
          <div className="absolute -bottom-20 right-1/3 w-72 h-72 bg-cyan-400/10 dark:bg-cyan-500/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        </div>
        <Sidebar currentView={currentView} setView={setView} storeUser={user} mobileOpen={sidebarOpen} onMobileToggle={() => setSidebarOpen(o => !o)} onShortcuts={() => setShortcutsOpen(true)} />
        <button onClick={() => setSidebarOpen(true)} className="md:hidden fixed top-4 left-4 z-10 p-2 bg-white/95 rounded-xl shadow-lg border border-slate-200" aria-label="Open menu">
          <Menu size={24} className="text-slate-700" />
        </button>
        <main className="flex-1 min-h-screen p-6 md:p-8 overflow-x-hidden md:ml-64 pt-16 md:pt-6">
          {renderView()}
        </main>
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </ERPProvider>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppContent />
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  </AuthProvider>
);

export default App;
