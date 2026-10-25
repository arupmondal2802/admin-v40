import React, { useState, useEffect } from 'react';
import { Monitor, Download, X, HardDrive, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import Button from '../ui/Button';

interface PWAInstallBannerProps {
  onOpenModal: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ onOpenModal }) => {
  const { isInstallable, isInstalled, isWindows, isMac, install } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return sessionStorage.getItem('pwa_banner_dismissed') === 'true';
  });

  // If already running in standalone desktop mode or dismissed, hide the banner
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      onOpenModal();
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pwa_banner_dismissed', 'true');
    }
  };

  const osLabel = isWindows ? 'Windows' : isMac ? 'macOS' : 'Desktop';

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-b border-indigo-900/60 px-3 sm:px-4 py-2 sm:py-2.5 shadow-md flex items-center justify-between gap-3 text-xs z-20 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 flex-shrink-0 border border-indigo-500/30">
          <Monitor className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="truncate">
          <span className="font-bold text-white mr-1.5">Install {osLabel} Desktop App:</span>
          <span className="text-indigo-200 hidden sm:inline">
            Enable native borderless windowing, offline disk caching, and taskbar shortcuts without reloading.
          </span>
          <span className="text-indigo-200 sm:hidden">
            Native desktop window & offline cache.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isInstallable ? 'Install Now' : 'Desktop Setup'}</span>
        </button>

        <button
          onClick={onOpenModal}
          className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-medium text-xs transition"
        >
          <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
          <span>Storage Guide</span>
        </button>

        <button
          onClick={handleDismiss}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition"
          title="Dismiss banner"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
