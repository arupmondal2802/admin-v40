import React, { useState, useEffect } from 'react';
import { SyncStatus } from './SyncStatusIndicator';
import { IconRefresh, IconCloudCheck, IconCloudOff, IconAlertTriangle, IconLoader } from './Icon';

interface PremiumSyncIndicatorProps {
  status: SyncStatus;
  progress: number | null;
  stage?: string | null;
  entity?: string | null;
  onRefresh: () => Promise<void> | void;
}

export const PremiumSyncIndicator: React.FC<PremiumSyncIndicatorProps> = ({
  status,
  progress,
  stage,
  entity,
  onRefresh,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    return localStorage.getItem('sync_indicator_minimized') === 'true';
  });

  const toggleMinimized = () => {
    const newState = !isMinimized;
    setIsMinimized(newState);
    localStorage.setItem('sync_indicator_minimized', String(newState));
  };

  const handleManualClick = async () => {
    if (isRefreshing || status === 'SYNCING') return;
    setIsRefreshing(true);
    setNotificationMsg('Connecting to cloud server...');
    setShowNotification(true);

    try {
      await onRefresh();
      setNotificationMsg('All databases fully synchronized!');
    } catch (err) {
      setNotificationMsg('Sync failed. Loaded local data.');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => {
        setShowNotification(false);
      }, 3000);
    }
  };

  // Listen to status changes to trigger a quick badge notification
  useEffect(() => {
    if (status === 'SYNCING') {
      setNotificationMsg(stage ? `Syncing: ${stage}` : 'Synchronizing cloud assets...');
      setShowNotification(true);
    } else if (status === 'SYNCED') {
      setNotificationMsg('Cloud synchronization successful!');
      setShowNotification(true);
      const t = setTimeout(() => setShowNotification(false), 3000);
      return () => clearTimeout(t);
    } else if (status === 'ERROR') {
      setNotificationMsg('Database sync failed. Offline mode active.');
      setShowNotification(true);
      const t = setTimeout(() => setShowNotification(false), 4000);
      return () => clearTimeout(t);
    }
  }, [status, stage]);

  // Determine glow and color configs based on current state
  const isSyncActive = status === 'SYNCING' || isRefreshing;
  
  // Custom styles to inject the 3D rotating globe animations
  const styles = `
    @keyframes orbit-y {
      0% { transform: rotateY(0deg); }
      100% { transform: rotateY(360deg); }
    }
    @keyframes orbit-x {
      0% { transform: rotateX(0deg); }
      100% { transform: rotateX(360deg); }
    }
    @keyframes orbit-diagonal {
      0% { transform: rotateX(45deg) rotateY(0deg) rotateZ(0deg); }
      100% { transform: rotateX(45deg) rotateY(360deg) rotateZ(360deg); }
    }
    @keyframes float-indicator {
      0% { transform: translateY(0px); }
      50% { transform: translateY(-6px); }
      100% { transform: translateY(0px); }
    }
    .sphere-container {
      perspective: 300px;
      transform-style: preserve-3d;
    }
    .ring-3d {
      position: absolute;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      transform-style: preserve-3d;
    }
    .animate-orbit-y-fast {
      animation: orbit-y 3s linear infinite;
    }
    .animate-orbit-y-slow {
      animation: orbit-y 8s linear infinite;
    }
    .animate-orbit-x-fast {
      animation: orbit-x 2.5s linear infinite;
    }
    .animate-orbit-x-slow {
      animation: orbit-x 7s linear infinite;
    }
    .animate-orbit-diagonal-fast {
      animation: orbit-diagonal 4s linear infinite;
    }
    .animate-orbit-diagonal-slow {
      animation: orbit-diagonal 10s linear infinite;
    }
    .animate-float-premium {
      animation: float-indicator 4s ease-in-out infinite;
    }
  `;

  if (isMinimized) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        
        {/* Floating Sync Control Center - Minimized FAB */}
        <div 
          id="premium-sync-control-minimized"
          className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 pointer-events-none no-print"
        >
          {showNotification && (
            <div className="bg-slate-900/95 text-white text-[11px] px-3 py-1.5 rounded-xl shadow-xl border border-slate-700/60 backdrop-blur-md flex items-center gap-1.5 max-w-xs pointer-events-auto transform transition-all duration-300 animate-fadeIn mb-1">
              {isSyncActive ? (
                <IconLoader className="w-3.5 h-3.5 text-brand-accent animate-spin" />
              ) : status === 'SYNCED' ? (
                <IconCloudCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : status === 'ERROR' ? (
                <IconAlertTriangle className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <IconCloudOff className="w-3.5 h-3.5 text-amber-400" />
              )}
              <div className="flex flex-col">
                <span className="font-semibold text-slate-100">{notificationMsg}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleMinimized}
            className="pointer-events-auto relative w-12 h-12 rounded-full bg-slate-950/95 hover:bg-slate-900 border border-slate-800 hover:border-brand-accent/50 text-slate-200 hover:text-white flex items-center justify-center shadow-2xl backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95 group shadow-slate-950/50"
            title="Expand Cloud Sync Status"
          >
            {/* Soft pulsing halo */}
            <div className={`absolute inset-0 rounded-full blur-sm opacity-30 transition-all duration-500 ${
              isSyncActive 
                ? 'bg-brand-accent scale-110' 
                : status === 'SYNCED' 
                ? 'bg-emerald-500' 
                : status === 'ERROR' 
                ? 'bg-red-500' 
                : 'bg-brand-blue'
            }`} />

            {/* Rotating 3D wireframe or status icon */}
            {isSyncActive ? (
              <IconLoader className="relative w-5 h-5 text-brand-accent animate-spin z-10" />
            ) : status === 'SYNCED' ? (
              <IconCloudCheck className="relative w-5 h-5 text-emerald-400 transition-transform group-hover:scale-110 z-10" />
            ) : status === 'ERROR' ? (
              <IconAlertTriangle className="relative w-5 h-5 text-red-400 transition-transform group-hover:scale-110 z-10" />
            ) : (
              <IconCloudOff className="relative w-5 h-5 text-amber-400 transition-transform group-hover:scale-110 z-10" />
            )}

            {/* Micro badge indicator */}
            <span className={`absolute top-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-950 flex items-center justify-center text-[8px] font-bold z-20 ${
              isSyncActive 
                ? 'bg-brand-accent text-brand-blue animate-pulse' 
                : status === 'SYNCED' 
                ? 'bg-emerald-500 text-white' 
                : status === 'ERROR' 
                ? 'bg-red-500 text-white' 
                : 'bg-slate-500 text-white'
            }`}>
              {status === 'SYNCED' ? '✓' : '!'}
            </span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      
      {/* Floating Sync Control Center - Bottom Right of Viewport */}
      <div 
        id="premium-sync-control"
        className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 pointer-events-none no-print animate-float-premium"
      >
        {/* Dynamic sliding message notification */}
        {showNotification && (
          <div className="bg-slate-900/90 text-white text-xs px-4 py-2.5 rounded-xl shadow-xl border border-slate-700/60 backdrop-blur-md flex items-center gap-2 max-w-sm pointer-events-auto transform transition-all duration-300 translate-y-0 opacity-100 animate-fadeIn">
            {isSyncActive ? (
              <IconLoader className="w-3.5 h-3.5 text-brand-accent animate-spin" />
            ) : status === 'SYNCED' ? (
              <IconCloudCheck className="w-4 h-4 text-emerald-400" />
            ) : status === 'ERROR' ? (
              <IconAlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <IconCloudOff className="w-4 h-4 text-amber-400" />
            )}
            <div className="flex flex-col">
              <span className="font-semibold text-slate-100">{notificationMsg}</span>
              {entity && (
                <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                  Entity: {entity}
                </span>
              )}
            </div>
            {progress !== null && progress > 0 && (
              <span className="bg-brand-accent/20 text-brand-accent text-[10px] font-bold px-1.5 py-0.5 rounded ml-auto">
                {progress}%
              </span>
            )}
          </div>
        )}

        {/* The 3D Glassmorphic Widget Container */}
        <div className="bg-slate-950/90 text-slate-100 p-4 rounded-2xl shadow-2xl border border-slate-800/80 backdrop-blur-lg flex items-center gap-4 pointer-events-auto transition-all duration-300 hover:border-brand-accent/50 hover:shadow-[0_12px_24px_rgba(248,191,42,0.12)]">
          
          {/* Interactive 3D Sphere & Visual Indicator */}
          <div className="relative w-12 h-12 flex items-center justify-center sphere-container flex-shrink-0">
            {/* Ambient shadow glow */}
            <div className={`absolute inset-0 rounded-full blur-md opacity-30 transition-all duration-500 ${
              isSyncActive 
                ? 'bg-brand-accent scale-110' 
                : status === 'SYNCED' 
                ? 'bg-emerald-500' 
                : status === 'ERROR' 
                ? 'bg-red-500' 
                : 'bg-brand-blue'
            }`} />

            {/* 3D Sphere Wireframe Rings */}
            <div className={`w-10 h-10 ring-3d ${
              isSyncActive 
                ? 'text-brand-accent animate-orbit-y-fast' 
                : status === 'SYNCED' 
                ? 'text-emerald-400 animate-orbit-y-slow' 
                : status === 'ERROR' 
                ? 'text-red-500' 
                : 'text-slate-600 animate-orbit-y-slow'
            }`} style={{ transform: 'rotateY(0deg)' }}></div>
            
            <div className={`w-10 h-10 ring-3d ${
              isSyncActive 
                ? 'text-brand-blue animate-orbit-x-fast' 
                : status === 'SYNCED' 
                ? 'text-brand-blue/60 animate-orbit-x-slow' 
                : status === 'ERROR' 
                ? 'text-red-400' 
                : 'text-slate-700 animate-orbit-x-slow'
            }`} style={{ transform: 'rotateX(90deg)' }}></div>

            <div className={`w-10 h-10 ring-3d ${
              isSyncActive 
                ? 'text-brand-accent/80 animate-orbit-diagonal-fast' 
                : status === 'SYNCED' 
                ? 'text-emerald-500/40 animate-orbit-diagonal-slow' 
                : status === 'ERROR' 
                ? 'text-red-500/80' 
                : 'text-slate-500/40 animate-orbit-diagonal-slow'
            }`} style={{ transform: 'rotateX(45deg) rotateY(45deg)' }}></div>

            {/* Core sphere center */}
            <div className={`absolute w-3.5 h-3.5 rounded-full shadow-inner transition-all duration-500 ${
              isSyncActive
                ? 'bg-brand-accent animate-ping scale-110 shadow-amber-300'
                : status === 'SYNCED'
                ? 'bg-emerald-400 scale-100 shadow-emerald-200'
                : status === 'ERROR'
                ? 'bg-red-500 animate-pulse'
                : 'bg-brand-blue border border-slate-700'
            }`} />
          </div>

          {/* Texts & Manual Trigger Deck */}
          <div className="flex flex-col gap-1.5 min-w-[150px]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400">
                  Cloud Sync
                </span>
                <span className={`inline-block w-2 h-2 rounded-full ${
                  isSyncActive 
                    ? 'bg-brand-accent animate-pulse' 
                    : status === 'SYNCED' 
                    ? 'bg-emerald-400' 
                    : 'bg-slate-500'
                }`} />
              </div>

              {/* Close/Minimize Toggle Button */}
              <button
                type="button"
                onClick={toggleMinimized}
                className="text-[10px] text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-800 hover:border-slate-700 transition-all focus:outline-none pointer-events-auto"
                title="Minimize Sync Widget"
              >
                Hide
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Premium Manual Sync Action Button */}
              <button
                onClick={handleManualClick}
                disabled={isSyncActive}
                className={`relative overflow-hidden group flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all duration-300 pointer-events-auto ${
                  isSyncActive
                    ? 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
                    : 'bg-gradient-to-r from-brand-blue to-slate-900 hover:from-brand-accent hover:to-amber-400 hover:text-brand-blue text-white border border-brand-blue/50 hover:border-brand-accent shadow-md hover:shadow-brand-accent/20 active:scale-95'
                }`}
                title="Force deep synchronization across all databases and devices"
                id="manual-sync-indicator-btn"
              >
                {/* Micro-gleam hover effect */}
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                
                <IconRefresh className={`w-3.5 h-3.5 ${isSyncActive ? 'animate-spin text-brand-accent' : 'text-brand-accent group-hover:text-brand-blue'}`} />
                <span>{isSyncActive ? 'Syncing...' : 'Sync Now'}</span>
              </button>

              <span className="text-[10px] text-slate-500 font-medium">
                {status === 'SYNCED' ? 'All Secure' : status === 'OFFLINE' ? 'Offline' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PremiumSyncIndicator;
