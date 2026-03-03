import React from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Elements';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['?'], action: 'Show this help' },
  { keys: ['Esc'], action: 'Close modal / Cancel' },
  { keys: ['Ctrl', 'S'], action: 'Save (when in form)' },
  { keys: ['1'], action: 'Dashboard' },
  { keys: ['2'], action: 'Profile' },
  { keys: ['3'], action: 'Swipe & Pay' },
  { keys: ['4'], action: 'Pay & Swipe' },
  { keys: ['5'], action: 'Money Transfer' },
  { keys: ['6'], action: 'CRM' },
  { keys: ['7'], action: 'Ledgers' },
  { keys: ['8'], action: 'Reports' },
  { keys: ['9'], action: 'Masters' },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-auto">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
          <h2 id="shortcuts-title" className="text-lg font-bold text-slate-900">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex justify-between items-center gap-4">
              <span className="text-slate-600">{s.action}</span>
              <kbd className="px-2 py-1 bg-slate-100 rounded text-sm font-mono text-slate-700">
                {s.keys.join(' + ')}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
