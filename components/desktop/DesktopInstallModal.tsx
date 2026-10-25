import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Monitor, 
  HardDrive, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  RefreshCw, 
  FileCode, 
  ExternalLink,
  Laptop,
  Check,
  X,
  Compass,
  Layers,
  ArrowRight
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import Button from '../ui/Button';

interface DesktopInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPrecacheAll?: () => Promise<void>;
}

export const DesktopInstallModal: React.FC<DesktopInstallModalProps> = ({
  isOpen,
  onClose,
  onPrecacheAll
}) => {
  const {
    isInstallable,
    isInstalled,
    isWindows,
    isMac,
    storageStats,
    install,
    downloadWindowsDesktopLauncher,
    downloadMacDesktopLauncher,
    requestPersistentStorage,
    updateStorageStats
  } = usePWAInstall();

  // Operating system view tab: defaults to the user's detected OS
  const [selectedOs, setSelectedOs] = useState<'windows' | 'mac'>(() => isMac ? 'mac' : 'windows');
  const [activeTab, setActiveTab] = useState<'install' | 'storage' | 'windowing' | 'exe'>('install');
  const [isPreCaching, setIsPreCaching] = useState(false);
  const [preCacheMessage, setPreCacheMessage] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    if (isOpen) {
      updateStorageStats();
      if (isMac) setSelectedOs('mac');
      else if (isWindows) setSelectedOs('windows');
    }
  }, [isOpen, isMac, isWindows, updateStorageStats]);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (installed) {
        onClose();
      }
    } else {
      if (selectedOs === 'windows') {
        downloadWindowsDesktopLauncher();
      } else {
        downloadMacDesktopLauncher();
      }
    }
  };

  const handlePrecacheClick = async () => {
    setIsPreCaching(true);
    setPreCacheMessage(null);
    try {
      if (onPrecacheAll) {
        await onPrecacheAll();
      } else {
        await new Promise(r => setTimeout(r, 1200));
      }
      await updateStorageStats();
      setPreCacheMessage('All database tables, vehicle trim catalogs, and offline app shells are cached on your hard drive!');
    } catch (e: any) {
      setPreCacheMessage(`Pre-cache error: ${e.message}`);
    } finally {
      setIsPreCaching(false);
    }
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const electronCommand = `npx nativefier --name "A Big Engine" --icon "public/icons/icon-512x512.png" --width 1366 --height 860 "${currentOrigin}"`;

  const copyElectronCommand = () => {
    navigator.clipboard.writeText(electronCommand);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-950">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/30 border border-indigo-400/30 rounded-xl text-indigo-300">
              <Monitor className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Desktop PWA & Local Storage Engine</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  {isInstalled ? 'Running in Standalone Window' : 'Desktop Install Available'}
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Windows 10/11 & macOS native standalone windowing with zero-reload local disk caching.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 px-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('install')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'install'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Install on Windows / macOS</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'storage'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>Local Disk Cache & Offline</span>
          </button>

          <button
            onClick={() => setActiveTab('windowing')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'windowing'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Native Windowing Mode</span>
          </button>

          <button
            onClick={() => setActiveTab('exe')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap transition ${
              activeTab === 'exe'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Compile .EXE</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-800 dark:text-slate-200 text-sm">
          {activeTab === 'install' && (
            <div className="space-y-4">
              {/* OS Selector Tabs */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Operating System:</span>
                <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setSelectedOs('windows')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                      selectedOs === 'windows'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>🪟 Windows 10 / 11</span>
                  </button>
                  <button
                    onClick={() => setSelectedOs('mac')}
                    className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                      selectedOs === 'mac'
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>🍎 macOS (MacBook / iMac)</span>
                  </button>
                </div>
              </div>

              {/* Windows Install Instructions */}
              {selectedOs === 'windows' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 border border-blue-200 dark:border-indigo-900/60 flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <strong className="block font-semibold text-slate-900 dark:text-white">Windows Desktop Integration:</strong>
                      <p>
                        Installs directly into <strong>Windows Start Menu</strong>, <strong>Desktop Shortcuts</strong>, and <strong>Taskbar</strong>.
                        Runs in an independent borderless desktop window with no browser navigation bar.
                      </p>
                    </div>
                  </div>

                  {/* Primary 1-Click Install Card */}
                  <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Method 1: One-Click Browser Install (Chrome & Edge)</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Standard Chromium PWA protocol with native Windows registration
                        </p>
                      </div>

                      {isInstalled ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Running as Desktop App
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleInstallClick}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          <span>{isInstallable ? 'Install to Windows Desktop' : 'Install PWA / Add Shortcut'}</span>
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 1: Click Install</span>
                        <p className="text-slate-500">
                          Click the button above, or look for the <strong>⊕ App Available</strong> icon in your browser address bar.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 2: Confirm Dialog</span>
                        <p className="text-slate-500">
                          Windows will prompt: <em>"Install A Big Engine?"</em>. Click <strong>Install</strong>.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 text-xs">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 3: Pin to Taskbar</span>
                        <p className="text-slate-500">
                          Check <em>"Create Desktop shortcut"</em> and <em>"Pin to taskbar"</em> for permanent 1-click access.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Windows Launcher Script Fallback */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <FileCode className="w-4 h-4 text-amber-500" />
                          Method 2: Standalone Windows Launcher (.bat)
                        </h4>
                        <p className="text-xs text-slate-500">
                          Works on any Windows PC without browser extension or app store dependencies.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={downloadWindowsDesktopLauncher}
                        className="font-bold text-xs flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-500" />
                        <span>Download .bat Launcher</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* macOS Install Instructions */}
              {selectedOs === 'mac' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 border border-slate-200 dark:border-indigo-900/60 flex items-start gap-3">
                    <Compass className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                      <strong className="block font-semibold text-slate-900 dark:text-white">macOS Native App & Dock Integration:</strong>
                      <p>
                        On macOS, the app integrates into your <strong>Dock</strong>, <strong>Launchpad</strong>, and <strong>Applications folder</strong>.
                        Supports native macOS windowing (Cmd+Tab, native titlebar, window resizing).
                      </p>
                    </div>
                  </div>

                  {/* Safari macOS Sonoma Flow */}
                  <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Apple Safari (macOS Sonoma 14+): "Add to Dock"</span>
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        Apple Native
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs pt-1">
                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 1: Safari Menu</span>
                        <p className="text-slate-500">
                          In Safari top menu, click <strong>File</strong> &gt; <strong>Add to Dock...</strong>
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 2: Confirm Name</span>
                        <p className="text-slate-500">
                          Verify title <em>"A Big Engine"</em> and click the blue <strong>Add</strong> button.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Step 3: Native Mac App</span>
                        <p className="text-slate-500">
                          The app now runs as an independent Mac app with separate window, Dock icon, and offline storage.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chrome / Edge on Mac Flow */}
                  <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>Google Chrome / Microsoft Edge on macOS</span>
                        </h3>
                        <p className="text-xs text-slate-500">
                          1-Click native app installer with Launchpad & Applications folder registration
                        </p>
                      </div>

                      {isInstalled ? (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Installed Standalone
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={handleInstallClick}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          <span>{isInstallable ? 'Install to Mac Applications' : 'Install PWA'}</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* macOS Launcher Script */}
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <FileCode className="w-4 h-4 text-emerald-500" />
                          macOS Shell App Launcher (.command)
                        </h4>
                        <p className="text-xs text-slate-500">
                          Double-clickable terminal launcher that opens in dedicated app window.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={downloadMacDesktopLauncher}
                        className="font-bold text-xs flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Download .command</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-500">Local Disk Storage</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {formatBytes(storageStats.usageBytes)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    of {formatBytes(storageStats.quotaBytes)} available
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-500">OS Persistence</div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4" />
                    {storageStats.isPersistent ? 'Protected' : 'Standard'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Guaranteed persistent by OS
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 col-span-2 sm:col-span-1">
                  <div className="text-xs font-semibold text-slate-500">Cached Entities</div>
                  <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                    {storageStats.indexedDbRecordsCount}+ Records
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Submissions, Users, Car Trims
                  </div>
                </div>
              </div>

              {/* Zero-Reload Local Persistence Card */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-indigo-500" />
                    Instant Local Boot Engine (&lt; 20ms)
                  </h4>
                  {!storageStats.isPersistent && (
                    <button
                      onClick={requestPersistentStorage}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                    >
                      Request Persistent Storage
                    </button>
                  )}
                </div>
                
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Your application uses <strong>Dexie IndexedDB</strong>, <strong>ServiceWorker CacheStorage</strong>, and the <strong>Storage Persistence API</strong> so that all data lives directly on your computer's hard drive:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <strong className="text-emerald-600 dark:text-emerald-400 block mb-1">1. Zero Reloading Overhead:</strong>
                    <p className="text-slate-500 dark:text-slate-400">
                      When opening or refreshing the app, the UI loads straight from local storage in less than 20ms. You never have to wait for full database downloads.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <strong className="text-blue-600 dark:text-blue-400 block mb-1">2. Offline Autonomy:</strong>
                    <p className="text-slate-500 dark:text-slate-400">
                      You can log service orders, inspect vehicles, search trims, and review history with zero internet. Pending changes queue and sync when reconnected.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handlePrecacheClick}
                    disabled={isPreCaching}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreCaching ? 'animate-spin' : ''}`} />
                    <span>{isPreCaching ? 'Caching App Shell & Database...' : 'Pre-Cache All Data to Local Disk'}</span>
                  </Button>
                  <span className="text-[11px] text-slate-400">Warms offline cache for 100% offline usage</span>
                </div>

                {preCacheMessage && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs border border-emerald-200 dark:border-emerald-800 font-medium">
                    {preCacheMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'windowing' && (
            <div className="space-y-4">
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  Native-Like Desktop Windowing Architecture
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  The Web App Manifest is configured with <code>display_override: ["window-controls-overlay", "standalone"]</code>.
                  This eliminates browser chrome (URL address bar, navigation buttons, tab headers) and treats the app as a true native desktop window.
                </p>

                <div className="space-y-2.5 pt-1 text-xs">
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 dark:text-white">Seamless Titlebar Integration:</strong>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Native window minimize, maximize, and close controls blend directly into the top bar.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 dark:text-white">Dedicated Desktop Process:</strong>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Runs in its own independent desktop thread (Alt+Tab on Windows, Cmd+Tab on Mac) separate from your web browsing tabs.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 dark:text-white">Quick Taskbar Jump List Shortcuts:</strong>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        Right-clicking the Windows taskbar icon or macOS Dock icon provides quick shortcuts: <em>"New Service Order"</em>, <em>"Dashboard"</em>, and <em>"Offline Sync"</em>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'exe' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-indigo-500" />
                  Compile into a Standalone Windows .EXE Executable
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  If you want an official standalone Windows installer (<code>.exe</code> or <code>.msi</code>) that can be distributed to field service agents or run offline without a browser:
                </p>
              </div>

              {/* Method 1: PWA Builder */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <span>1. Microsoft PWABuilder (Official Microsoft Store & .exe Packager)</span>
                  </h5>
                  <a 
                    href="https://www.pwabuilder.com" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
                  >
                    pwabuilder.com <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-slate-500">
                  Enter your app URL into PWABuilder. It automatically packages the Web App Manifest and Service Worker into a signed Windows <code>.msix</code> or <code>.exe</code> installer package ready for desktop deployment.
                </p>
              </div>

              {/* Method 2: Nativefier / Electron CLI */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
                <h5 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                  2. Single-Line Command with Nativefier / Electron
                </h5>
                <p className="text-xs text-slate-500">
                  Run this command in any terminal with Node.js installed to generate a portable Windows <code>.exe</code> folder immediately:
                </p>
                <div className="relative">
                  <pre className="p-3 bg-slate-950 text-slate-200 text-xs font-mono rounded-lg overflow-x-auto border border-slate-800 select-all">
                    {electronCommand}
                  </pre>
                  <button
                    onClick={copyElectronCommand}
                    className="absolute right-2 top-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileCode className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Local Disk Cache: Active & Protected</span>
          </div>
          <Button
            size="sm"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-4"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
