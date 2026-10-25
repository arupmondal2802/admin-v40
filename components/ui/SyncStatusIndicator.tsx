
import React, { useState, useEffect, useRef } from 'react';
import { IconCloudCheck, IconDeviceFloppy, IconLoader, IconAlertTriangle, IconCloudOff, IconRefresh, IconTrash, IconClock } from './Icon';
import { clearIndexedDbStore } from '../../services/indexedDbService';

export type SyncStatus = 'SYNCED' | 'UNSAVED' | 'SYNCING' | 'ERROR' | 'OFFLINE';

interface Props {
    status: SyncStatus;
    errorMessage?: string | null;
    lastSyncedAt?: Date | string | number | null;
    onForceCacheClear?: () => void | Promise<void>;
    onRefresh?: () => void | Promise<void>;
    onOpenDiagnostics?: () => void;
}

const SyncStatusIndicator: React.FC<Props> = ({
    status,
    errorMessage,
    lastSyncedAt,
    onForceCacheClear,
    onRefresh,
    onOpenDiagnostics
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [timeAgoStr, setTimeAgoStr] = useState<string>('');
    const [formattedTimeStr, setFormattedTimeStr] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Format last synced timestamp and update relative time string dynamically
    useEffect(() => {
        if (!lastSyncedAt) {
            setTimeAgoStr('Never');
            setFormattedTimeStr('Not synced yet');
            return;
        }

        const dateObj = new Date(lastSyncedAt);
        if (isNaN(dateObj.getTime())) {
            setTimeAgoStr('Unknown');
            setFormattedTimeStr('Invalid date');
            return;
        }

        const updateTimes = () => {
            const now = new Date();
            const diffSeconds = Math.max(0, Math.floor((now.getTime() - dateObj.getTime()) / 1000));

            if (diffSeconds < 10) {
                setTimeAgoStr('Just now');
            } else if (diffSeconds < 60) {
                setTimeAgoStr(`${diffSeconds}s ago`);
            } else if (diffSeconds < 3600) {
                const mins = Math.floor(diffSeconds / 60);
                setTimeAgoStr(`${mins}m ago`);
            } else if (diffSeconds < 86400) {
                const hours = Math.floor(diffSeconds / 3600);
                setTimeAgoStr(`${hours}h ago`);
            } else {
                const days = Math.floor(diffSeconds / 86400);
                setTimeAgoStr(`${days}d ago`);
            }

            setFormattedTimeStr(dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        };

        updateTimes();
        const interval = setInterval(updateTimes, 10000);
        return () => clearInterval(interval);
    }, [lastSyncedAt]);

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClearCache = async () => {
        if (isClearing) return;
        setIsClearing(true);
        try {
            if (onForceCacheClear) {
                await onForceCacheClear();
            } else {
                await clearIndexedDbStore();
                if (onRefresh) await onRefresh();
            }
        } catch (err) {
            console.error('Failed to clear cache:', err);
        } finally {
            setIsClearing(false);
            setIsOpen(false);
        }
    };

    const statusConfig = {
        SYNCED: { Icon: IconCloudCheck, label: 'Cloud Synced', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/60', tooltip: 'All changes saved to Google Sheets & Cloud', animate: false },
        UNSAVED: { Icon: IconDeviceFloppy, label: 'Unsaved Queue', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:border-amber-500/60', tooltip: 'Local changes pending sync', animate: false },
        SYNCING: { Icon: IconLoader, label: 'Syncing...', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30 hover:border-blue-500/60', tooltip: 'Syncing in real-time with backend...', animate: true },
        ERROR: { Icon: IconAlertTriangle, label: 'Sync Error', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30 hover:border-rose-500/60', tooltip: `Sync failed: ${errorMessage || 'Unknown error'}`, animate: false },
        OFFLINE: { Icon: IconCloudOff, label: 'Offline Mode', color: 'text-slate-400 bg-slate-800/80 border-slate-700/60 hover:border-slate-600', tooltip: 'Offline. Sync will resume once online.', animate: false },
    };

    if (!status) return null;

    const config = statusConfig[status] || statusConfig.SYNCED;
    const { Icon, label, color, tooltip, animate } = config;

    return (
        <div ref={containerRef} className="relative inline-flex items-center">
            {/* Status Badge button trigger */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${color} shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-accent/50 select-none`}
                aria-expanded={isOpen}
                aria-label={`Sync status: ${status}. Last synced: ${timeAgoStr}. Click for sync details and force cache clear.`}
                title="Click to view sync status, timestamp & force clear cache"
            >
                <Icon className={`w-4 h-4 flex-shrink-0 ${animate ? 'animate-spin' : ''}`} />
                <div className="flex flex-col items-start leading-none hidden lg:flex">
                    <span className="text-[11px] uppercase tracking-wider font-extrabold">{label}</span>
                    {lastSyncedAt && (
                        <span className="text-[9px] font-semibold text-slate-300 opacity-90 mt-0.5">
                            Synced {timeAgoStr}
                        </span>
                    )}
                </div>
            </button>

            {/* Expandable Dropdown / Popover for detailed status & actions */}
            {isOpen && (
                <div 
                    role="dialog"
                    aria-label="Sync details and manual cache controls"
                    className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700/80 text-slate-100 text-xs rounded-2xl p-4 shadow-2xl z-50 animate-fadeIn backdrop-blur-xl"
                >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                        <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${color.split(' ')[0]}`} />
                            <span className="font-bold text-sm text-white">{label}</span>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${color}`}>
                            {status}
                        </span>
                    </div>

                    <div className="space-y-2.5 mb-4 text-slate-300">
                        <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                                <IconClock className="w-3.5 h-3.5 text-brand-accent" />
                                Last Synced
                            </span>
                            <span className="font-bold text-slate-100 text-right">
                                {formattedTimeStr ? `${formattedTimeStr} (${timeAgoStr})` : 'Never'}
                            </span>
                        </div>

                        {errorMessage && (
                            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
                                <p className="font-semibold text-rose-200 mb-0.5">Sync Alert:</p>
                                <p className="line-clamp-2">{errorMessage}</p>
                            </div>
                        )}

                        <p className="text-[11px] text-slate-400 leading-relaxed">
                            {tooltip}
                        </p>
                    </div>

                    {/* Action Controls */}
                    <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
                        {onOpenDiagnostics && (
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    onOpenDiagnostics();
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-brand-accent/20 hover:bg-brand-accent/30 text-amber-300 hover:text-amber-200 rounded-xl text-xs font-bold border border-brand-accent/40 shadow-sm transition-all active:scale-95 cursor-pointer"
                            >
                                <IconRefresh className="w-3.5 h-3.5 text-brand-accent" />
                                <span>Network & Fetch Diagnostics</span>
                            </button>
                        )}

                        {onRefresh && (
                            <button
                                type="button"
                                onClick={async () => {
                                    setIsOpen(false);
                                    await onRefresh();
                                }}
                                disabled={status === 'SYNCING'}
                                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold border border-slate-700/80 transition-all active:scale-95 disabled:opacity-50"
                            >
                                <IconRefresh className={`w-3.5 h-3.5 ${status === 'SYNCING' ? 'animate-spin text-brand-accent' : ''}`} />
                                Sync Now
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleClearCache}
                            disabled={isClearing}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-rose-900/40 to-amber-900/40 hover:from-rose-800/60 hover:to-amber-800/60 text-rose-200 hover:text-white rounded-xl text-xs font-bold border border-rose-500/40 hover:border-rose-400 shadow-md transition-all active:scale-95 disabled:opacity-50"
                            title="Force clear local IndexedDB and LocalStorage cache to resolve conflicts"
                        >
                            {isClearing ? (
                                <>
                                    <IconLoader className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                    <span>Clearing Cache...</span>
                                </>
                            ) : (
                                <>
                                    <IconTrash className="w-3.5 h-3.5 text-rose-400" />
                                    <span>Force Cache Clear</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SyncStatusIndicator;

