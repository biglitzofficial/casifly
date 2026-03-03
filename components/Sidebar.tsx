import React from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  ArrowLeftRight, 
  Banknote, 
  BookOpen, 
  PieChart, 
  Settings,
  Users,
  UserCircle,
  UserPlus,
  LogOut,
  Menu,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  storeUser?: { name: string; productId?: string; role?: string };
  mobileOpen?: boolean;
  onMobileToggle?: () => void;
  onShortcuts?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, storeUser, mobileOpen, onMobileToggle, onShortcuts }) => {
  const { theme, toggleTheme } = useTheme();
  const handleNav = (id: string) => {
    setView(id);
    onMobileToggle?.();
  };
  const { products, logout } = useAuth();
  const storeName = storeUser?.productId ? products.find(p => p.id === storeUser.productId)?.name : null;
  const baseMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'profile', label: 'Profile', icon: UserCircle },
    { id: 'swipe-pay', label: 'Swipe & Pay', icon: CreditCard },
    { id: 'pay-swipe', label: 'Pay & Swipe', icon: ArrowLeftRight },
    { id: 'money-transfer', label: 'Money Transfer', icon: Banknote },
    { id: 'crm', label: 'CRM & Customers', icon: Users },
    { id: 'ledgers', label: 'Ledgers', icon: BookOpen },
    { id: 'reports', label: 'Reports & P&L', icon: PieChart },
    { id: 'masters', label: 'Masters', icon: Settings },
  ];
  const staffItem = { id: 'staff', label: 'Staff', icon: UserPlus };
  const menuItems = storeUser?.role === 'product_admin'
    ? [...baseMenuItems.slice(0, 2), staffItem, ...baseMenuItems.slice(2)]
    : baseMenuItems;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}
    <div className={`w-64 h-screen flex flex-col fixed left-0 top-0 z-30 border-r border-white/10 shadow-2xl transition-transform duration-300 ease-out
      md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Gradient sidebar background */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(99,102,241,0.08)_0%,transparent_50%,transparent_100%)]" />
      
      <div className="relative h-20 flex items-center justify-between px-6 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-indigo-500/40">
              F
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-indigo-500/20 blur-xl -z-10" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">FINLEDGER</span>
        </div>
        <button onClick={onMobileToggle} className="md:hidden p-2 -mr-2 text-slate-400 hover:text-white" aria-label="Close menu">
          <X size={24} />
        </button>
      </div>
      <nav className="relative flex-1 overflow-y-auto py-6 px-4">
        <ul className="space-y-1">
          {menuItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <li key={item.id} className="animate-slide-up" style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}>
                <button
                  onClick={() => handleNav(item.id)}
                  className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 font-semibold ${
                    isActive 
                      ? 'bg-white/10 text-white shadow-lg shadow-indigo-500/10 border border-white/10' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className={`p-2 rounded-xl transition-all duration-300 ${isActive ? 'bg-indigo-500/30' : 'bg-transparent group-hover:bg-white/10'}`}>
                    <Icon size={20} className="shrink-0" />
                  </div>
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="relative p-4 border-t border-white/5 text-xs text-slate-500 shrink-0">
        <div className="mb-3 space-y-2">
          <button onClick={toggleTheme} className="w-full flex items-center gap-2 text-slate-400 hover:text-white font-semibold" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {onShortcuts && (
            <button onClick={onShortcuts} className="w-full flex items-center gap-2 text-slate-400 hover:text-white font-semibold" aria-label="Keyboard shortcuts">
              <span className="text-sm font-mono">?</span> Shortcuts
            </button>
          )}
        </div>
        {storeUser && (
          <div className="mb-3 p-2 rounded-xl bg-white/5">
            <button
              onClick={() => handleNav('profile')}
              className="w-full text-left hover:bg-white/5 rounded-lg p-1 -m-1 transition-colors"
            >
              <p className="font-bold text-white truncate">{storeUser.name}</p>
              {storeName && <p className="text-slate-400 truncate">{storeName}</p>}
              <p className="mt-1 text-xs text-indigo-400 font-semibold flex items-center gap-1">
                <UserCircle size={12} /> Profile
              </p>
            </button>
            <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-semibold">
              <LogOut size={12} /> Logout
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
