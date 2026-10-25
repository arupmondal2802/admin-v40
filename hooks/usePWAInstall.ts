import { useEffect, useState, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface StorageStats {
  quotaBytes: number;
  usageBytes: number;
  percentageUsed: number;
  isPersistent: boolean;
  indexedDbRecordsCount: number;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isWindows, setIsWindows] = useState<boolean>(false);
  const [isMac, setIsMac] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    quotaBytes: 0,
    usageBytes: 0,
    percentageUsed: 0,
    isPersistent: false,
    indexedDbRecordsCount: 0,
  });

  // Check display mode and platform
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches ||
        (window.navigator as any).standalone === true;
      setIsInstalled(isStandaloneMode);
    };

    checkStandalone();
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener?.('change', checkStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsWindows(/win/.test(ua));
    setIsMac(/mac/.test(ua) && !/iphone|ipad|ipod/.test(ua));
    setIsIOS(/iphone|ipad|ipod/.test(ua));
    setIsAndroid(/android/.test(ua));

    // Request persistent storage so Windows/browser never purges local data
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        console.log(`💾 [PWA Storage] Disk persistence: ${persistent ? 'GRANTED' : 'STANDARD'}`);
        updateStorageStats();
      }).catch(() => {});
    } else {
      updateStorageStats();
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const updateStorageStats = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;

    try {
      const estimate = await navigator.storage.estimate();
      const isPersistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 1;
      const percentageUsed = Math.min(100, Math.round((usage / quota) * 1000) / 10);

      // Estimate local records count from localStorage keys
      let recordCount = 0;
      try {
        const subs = localStorage.getItem('service_app_submissions');
        if (subs) recordCount += (JSON.parse(subs) || []).length;
        const users = localStorage.getItem('service_app_users');
        if (users) recordCount += (JSON.parse(users) || []).length;
        const reqs = localStorage.getItem('service_app_service_requests');
        if (reqs) recordCount += (JSON.parse(reqs) || []).length;
      } catch {}

      setStorageStats({
        quotaBytes: quota,
        usageBytes: usage,
        percentageUsed,
        isPersistent,
        indexedDbRecordsCount: recordCount,
      });
    } catch (err) {
      console.warn('Storage estimate notice:', err);
    }
  }, []);

  // Standard PWA install prompt trigger
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) {
      return false;
    }
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('PWA install error:', e);
      return false;
    }
  }, [deferredPrompt]);

  // Generate and download a Windows Desktop Launcher script (.bat) that launches the app in standalone native app window
  const downloadWindowsDesktopLauncher = useCallback(() => {
    if (typeof window === 'undefined') return;

    const currentUrl = window.location.href.split('#')[0];
    const appTitle = 'A Big Engine Desktop App';

    // Windows batch script that opens Microsoft Edge or Google Chrome in dedicated isolated app mode
    const batContent = `@echo off
:: ==============================================================
:: A Big Engine - Windows Desktop Application Launcher
:: Launches in native standalone window with local storage persistence
:: ==============================================================
title ${appTitle}
echo Starting ${appTitle}...

:: Check for Microsoft Edge (installed on 100% of Windows 10/11 PCs)
where msedge >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "" msedge.exe --app="${currentUrl}" --window-size=1280,800
    exit /b 0
)

:: Fallback to Google Chrome
where chrome >nul 2>nul
if %ERRORLEVEL% equ 0 (
    start "" chrome.exe --app="${currentUrl}" --window-size=1280,800
    exit /b 0
)

:: Default browser fallback
start "" "${currentUrl}"
exit /b 0
`;

    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Launch-A-Big-Engine-Desktop.bat';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Generate and download a macOS Desktop Launcher script (.command) that launches in isolated window mode
  const downloadMacDesktopLauncher = useCallback(() => {
    if (typeof window === 'undefined') return;

    const currentUrl = window.location.href.split('#')[0];
    const shContent = `#!/bin/bash
# ==============================================================
# A Big Engine - macOS Desktop Application Launcher
# ==============================================================
echo "Launching A Big Engine Desktop Application..."

if open -na "Google Chrome" --args --app="${currentUrl}" 2>/dev/null; then
    exit 0
elif open -na "Microsoft Edge" --args --app="${currentUrl}" 2>/dev/null; then
    exit 0
elif open -na "Brave Browser" --args --app="${currentUrl}" 2>/dev/null; then
    exit 0
else
    open "${currentUrl}"
    exit 0
fi
`;

    const blob = new Blob([shContent], { type: 'application/x-sh;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Launch-A-Big-Engine-macOS.command';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  // Request disk persistence manually
  const requestPersistentStorage = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      await updateStorageStats();
      return granted;
    }
    return false;
  }, [updateStorageStats]);

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isWindows,
    isMac,
    isIOS,
    isAndroid,
    storageStats,
    install,
    updateStorageStats,
    downloadWindowsDesktopLauncher,
    downloadMacDesktopLauncher,
    requestPersistentStorage,
  };
}
