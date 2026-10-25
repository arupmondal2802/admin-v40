import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Zap,
  Clock,
  Settings,
  Webhook,
  Copy,
  Layers,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';
import { SyncPerformanceStats } from '../../../types';

interface LeadFastSyncBarProps {
  isSyncing: boolean;
  onSyncMetaLeads: (mode?: 'incremental' | 'full') => Promise<any>;
  onSyncWhatsAppLeads?: (mode?: 'incremental' | 'full') => Promise<any>;
  onSyncWebsiteOrders?: (mode?: 'incremental' | 'full') => Promise<any>;
  onSyncAllLeads?: (mode?: 'incremental' | 'full') => Promise<any>;
  syncStats?: SyncPerformanceStats | null;
  onOpenWebhookModal: () => void;
  onOpenDeduplicationModal: () => void;
  onOpenSubsheetsModal: () => void;
  onOpenSyncPerformanceModal: () => void;
  onOpenSettingsTab: () => void;
  activeLeadsCount: number;
}

export const LeadFastSyncBar: React.FC<LeadFastSyncBarProps> = ({
  isSyncing,
  onSyncMetaLeads,
  onSyncWhatsAppLeads,
  onSyncWebsiteOrders,
  onSyncAllLeads,
  syncStats,
  onOpenWebhookModal,
  onOpenDeduplicationModal,
  onOpenSubsheetsModal,
  onOpenSyncPerformanceModal,
  onOpenSettingsTab,
  activeLeadsCount
}) => {
  // Auto-refresh interval (0 = Off, seconds)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [relativeTime, setRelativeTime] = useState<string>('Just now');
  const [syncSuccessFlash, setSyncSuccessFlash] = useState<boolean>(false);

  // Update relative time display every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const diffSec = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000);
      if (diffSec < 15) setRelativeTime('Just now');
      else if (diffSec < 60) setRelativeTime(`${diffSec}s ago`);
      else if (diffSec < 3600) setRelativeTime(`${Math.floor(diffSec / 60)}m ago`);
      else setRelativeTime(`${Math.floor(diffSec / 3600)}h ago`);
    }, 10000);
    return () => clearInterval(timer);
  }, [lastSyncTime]);

  // Auto-refresh countdown logic
  useEffect(() => {
    if (autoRefreshInterval <= 0) {
      setSecondsRemaining(0);
      return;
    }

    setSecondsRemaining(autoRefreshInterval);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (!isSyncing) {
            handleFastSync('incremental');
          }
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefreshInterval, isSyncing]);

  const handleFastSync = async (mode: 'incremental' | 'full') => {
    try {
      if (onSyncAllLeads) {
        await onSyncAllLeads(mode);
      } else {
        await onSyncMetaLeads(mode);
        if (onSyncWhatsAppLeads) {
          await onSyncWhatsAppLeads(mode);
        }
        if (onSyncWebsiteOrders) {
          await onSyncWebsiteOrders(mode);
        }
      }
      setLastSyncTime(new Date());
      setSyncSuccessFlash(true);
      setTimeout(() => setSyncSuccessFlash(false), 2500);
    } catch (e) {
      console.error('Fast sync error', e);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-3.5 sm:p-4 shadow-xl mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Sync Status & Engine Speed */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center shadow-md">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {isSyncing && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm text-slate-100 flex items-center gap-1.5">
                Fast Ingestion & Live Sync Engine
              </h3>
              {syncSuccessFlash ? (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 animate-fadeIn">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Synced!
                </span>
              ) : (
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  {syncStats?.mode === 'full' ? 'Deep Mode' : 'Incremental Mode'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>Last updated: {relativeTime}</span>
              </span>
              <span>•</span>
              <span className="text-slate-300 font-semibold">{activeLeadsCount} CRM Leads Active</span>
            </div>
          </div>
        </div>

        {/* Right Side: Sync Controls & Enterprise Integrations */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Auto Refresh Dropdown */}
          <div className="relative flex items-center bg-slate-800/80 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-xs text-slate-200">
            <span className="text-[11px] text-amber-400 mr-2 font-semibold">Sync Mode:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
              className="bg-transparent font-bold text-indigo-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value={0} className="bg-slate-900 text-white">Manual Trigger (Bandwidth Saver)</option>
              <option value={1800} className="bg-slate-900 text-white">Every 30m</option>
              <option value={3600} className="bg-slate-900 text-white">Every 60m</option>
            </select>
            {autoRefreshInterval > 0 && (
              <span className="ml-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
                {secondsRemaining}s
              </span>
            )}
          </div>

          {/* Incremental Fast Sync Button */}
          <button
            onClick={() => handleFastSync('incremental')}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold rounded-xl transition-all shadow-md active:scale-95 text-xs cursor-pointer"
            title="Fast Incremental Sync (Pulls only newly arrived rows since last sync)"
          >
            <Zap className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
            <span>Fast Fetch</span>
          </button>

          {/* Full Re-sync Button */}
          <button
            onClick={() => handleFastSync('full')}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold rounded-xl transition-all border border-slate-700 text-xs cursor-pointer"
            title="Full Re-Scan across all sheets and storefront orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Deep Scan</span>
          </button>

          {/* Enterprise Action Menu Buttons */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-2">
            {/* Deduplication */}
            <button
              onClick={onOpenDeduplicationModal}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 rounded-xl transition-all text-xs flex items-center gap-1 cursor-pointer"
              title="Duplicate Leads Detector & Merger"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline font-bold">Deduplicate</span>
            </button>

            {/* Webhook */}
            <button
              onClick={onOpenWebhookModal}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-sky-200 border border-slate-700 rounded-xl transition-all text-xs flex items-center gap-1 cursor-pointer"
              title="Webhook Direct Ingestion URL & Zapier Config"
            >
              <Webhook className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden xl:inline font-bold">Webhooks</span>
            </button>

            {/* Subsheets Manager */}
            <button
              onClick={onOpenSubsheetsModal}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl transition-all text-xs flex items-center gap-1 cursor-pointer"
              title="Manage Subsheets & Tabs"
            >
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden xl:inline font-bold">Tabs</span>
            </button>

            {/* Sync Performance Speed Report */}
            <button
              onClick={onOpenSyncPerformanceModal}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border border-slate-700 rounded-xl transition-all text-xs flex items-center gap-1 cursor-pointer"
              title="Sync Metrics & Speed Optimization Report"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline font-bold">Speed</span>
            </button>

            {/* CRM Settings */}
            <button
              onClick={onOpenSettingsTab}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl transition-all text-xs cursor-pointer"
              title="Google Sheet CRM Config"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
