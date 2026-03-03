import React, { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn, filterDecimalInput } from '../../lib/utils';

// --- Card Components ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn(
    "bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-3xl overflow-hidden",
    "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]",
    "transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] hover:-translate-y-1",
    "border border-slate-100/80 dark:border-slate-700/80",
    className
  )}>
    {children}
  </div>
);

export const CardHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; className?: string }> = ({ title, subtitle, action, className }) => (
  <div className={cn(
    "px-8 py-6 border-b border-slate-100/80 dark:border-slate-700/80 flex justify-between items-start",
    "bg-gradient-to-br from-slate-50/90 to-white dark:from-slate-800/90 dark:to-slate-800",
    className
  )}>
    <div>
      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h3>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("p-8", className)}>{children}</div>
);

// --- Form Components ---
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className, type, onChange, ...props }) => {
  // Use type="text" with inputMode for number fields to remove spinner arrows entirely
  const inputType = type === 'number' ? 'text' : type ?? 'text';
  const inputMode = type === 'number' ? ('step' in props && String(props.step).includes('.') ? 'decimal' : 'numeric') : undefined;

  // For number inputs: only allow digits and (optionally) one decimal point
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (type === 'number') {
      const filtered = filterDecimalInput(e.target.value);
      if (filtered !== e.target.value) {
        e = { ...e, target: { ...e.target, value: filtered } } as React.ChangeEvent<HTMLInputElement>;
      }
    }
    onChange?.(e);
  };

  return (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 tracking-tight">
        {label}
      </label>
    )}
    <input 
      type={inputType}
      inputMode={inputMode}
      onChange={handleChange}
      className={cn(
        "w-full px-4 py-3.5 rounded-2xl border-2 transition-all duration-300 outline-none font-semibold",
        "focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-400",
        "dark:text-slate-100 dark:placeholder:text-slate-400",
        error 
          ? "border-rose-300 bg-rose-50/50 dark:bg-rose-900/20 dark:border-rose-700 focus:ring-rose-200 focus:border-rose-500" 
          : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 bg-white dark:bg-slate-800",
        className
      )}
      {...props}
    />
    {error && <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-1.5">{error}</p>}
  </div>
  );
};

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string | number; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className, ...props }) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-bold text-slate-700 mb-2 tracking-tight">
        {label}
      </label>
    )}
    <div className="relative">
      <select 
        className={cn(
          "w-full px-4 py-3.5 rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-slate-100 appearance-none transition-all duration-300 outline-none font-semibold",
          "focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-400 hover:border-slate-300 dark:hover:border-slate-500",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-slate-400 dark:text-slate-500">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
);

// --- Filter Components ---
export const FilterBar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn(
    "flex flex-col md:flex-row gap-4 mb-6 justify-between items-stretch md:items-center",
    "bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-6 rounded-3xl border-2 border-slate-100/80 dark:border-slate-700/80 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.06)] dark:shadow-none",
    className
  )}>
    {children}
  </div>
);

export const FilterBtn: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  isDanger?: boolean;
}> = ({ label, active, onClick, count, isDanger }) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2.5 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2",
      active 
        ? isDanger ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25' : 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
    )}
  >
    {label}
    {count !== undefined && (
      <span className={cn(
        "px-2 py-0.5 rounded-md text-[10px]",
        active ? 'bg-white/25' : 'bg-slate-200/80 text-slate-600'
      )}>
        {count}
      </span>
    )}
  </button>
);

// --- Button Component ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', size = 'md', className, ...props }) => {
  const variants = {
    primary: "bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]",
    secondary: "bg-slate-800 text-white shadow-xl shadow-slate-900/30 hover:bg-slate-900 hover:scale-[1.02] active:scale-[0.98]",
    danger: "bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-xl shadow-rose-500/30 hover:shadow-2xl hover:shadow-rose-500/40 hover:scale-[1.02] active:scale-[0.98]",
    success: "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-xl shadow-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]",
    outline: "border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30 hover:scale-[1.02] active:scale-[0.98]",
  };
  
  const sizes = {
    sm: "px-5 py-2.5 text-sm",
    md: "px-6 py-3 text-sm",
    lg: "px-8 py-4 text-base",
  };

  return (
    <button 
      className={cn(
        "rounded-2xl font-bold transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
