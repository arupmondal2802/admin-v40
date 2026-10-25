import React from 'react';
import { Monitor, Download, HardDrive } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface DesktopInstallButtonProps {
  onOpenModal: () => void;
  className?: string;
  variant?: 'compact' | 'full' | 'sidebar';
}

export const DesktopInstallButton: React.FC<DesktopInstallButtonProps> = ({
  onOpenModal,
  className = '',
  variant = 'compact'
}) => {
  const { isInstallable, isInstalled } = usePWAInstall();

  if (variant === 'sidebar') {
    return (
      <button
        onClick={onOpenModal}
        className={`w-full flex items-center px-3.5 py-2.5 text-xs font-semibold rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-all group ${className}`}
        title="Desktop App (.exe) & Local Storage Cache"
      >
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-300 group-hover:bg-indigo-500/30 transition-all flex-shrink-0">
          <Monitor className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="ml-3 text-left min-w-0">
          <div className="text-[13px] font-medium text-white truncate flex items-center gap-1.5">
            <span>Desktop App</span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 bg-indigo-600/30 text-indigo-300 rounded border border-indigo-500/40">
              {isInstalled ? 'STANDALONE' : '.EXE'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 truncate">Local Cache & Storage</div>
        </div>
      </button>
    );
  }

  if (variant === 'full') {
    return (
      <button
        onClick={onOpenModal}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-900/60 to-slate-900 border border-indigo-500/40 text-indigo-200 hover:text-white hover:border-indigo-400 text-xs font-bold shadow-xs transition-all active:scale-95 ${className}`}
      >
        <Monitor className="w-4 h-4 text-indigo-400" />
        <span>{isInstalled ? 'Desktop Storage' : 'Install Desktop App (.exe)'}</span>
      </button>
    );
  }

  // Default compact button for top header
  return (
    <button
      onClick={onOpenModal}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/80 border border-slate-700/70 hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-bold shadow-xs transition-all active:scale-95 group ${className}`}
      title={isInstalled ? 'Desktop App Standalone Mode: Manage Local Disk Cache' : 'Install as Windows Desktop Application (.exe / PWA) & Manage Local Storage'}
    >
      <Monitor className={`w-3.5 h-3.5 ${isInstalled ? 'text-emerald-400' : 'text-indigo-400 group-hover:scale-110'} transition-transform`} />
      <span className="hidden sm:inline">
        {isInstalled ? 'Desktop Mode' : 'Desktop App'}
      </span>
      {!isInstalled && isInstallable && (
        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
      )}
    </button>
  );
};
