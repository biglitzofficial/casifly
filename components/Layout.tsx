import React, { ReactNode } from 'react';

export const Layout: React.FC<{ children: ReactNode; title: string; headerAction?: ReactNode }> = ({ children, title, headerAction }) => {
  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {title}
            </h1>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-1.5 w-20 rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-400 shadow-lg shadow-indigo-500/30" />
              <div className="h-1 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
              <div className="h-0.5 w-8 rounded-full bg-slate-200 dark:bg-slate-600" />
            </div>
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      </header>
      <div className="space-y-8">
        {children}
      </div>
    </div>
  );
};
