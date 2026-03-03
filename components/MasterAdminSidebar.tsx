import React from 'react';
import { BarChart3, Store, Wallet, LogOut, X, Menu } from 'lucide-react';

interface MasterAdminSidebarProps {
  currentView: string;
  setView: (view: string) => void;
  mobileOpen?: boolean;
  onMobileToggle?: () => void;
  onLogout: () => void;
  userEmail?: string;
}

const MENU_ITEMS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'stores', label: 'Stores', icon: Store },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

export const MasterAdminSidebar: React.FC<MasterAdminSidebarProps> = ({
  currentView,
  setView,
  mobileOpen,
  onMobileToggle,
  onLogout,
  userEmail,
}) => {
  const handleNav = (id: string) => {
    setView(id);
    onMobileToggle?.();
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}
      <div
        className={`w-64 h-screen flex flex-col fixed left-0 top-0 z-30 border-r border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 shadow-xl transition-transform duration-300 ease-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-base font-black text-slate-900 dark:text-white">Master Admin</span>
              {userEmail && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{userEmail}</p>
              )}
            </div>
          </div>
          <button onClick={onMobileToggle} className="md:hidden p-2 -mr-2 text-slate-500 hover:text-slate-700" aria-label="Close menu">
            <X size={24} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-6 px-4">
          <ul className="space-y-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleNav(item.id)}
                    className={`group w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-semibold ${
                      isActive
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon size={20} className="shrink-0" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-semibold"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>
    </>
  );
};
