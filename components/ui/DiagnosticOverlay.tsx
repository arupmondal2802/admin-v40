import React, { useState, useEffect } from 'react';
import { 
    FetchDiagnosticLog, 
    FullDiagnosticReport, 
    subscribeDiagnosticLogs, 
    clearDiagnosticLogs, 
    runFullDiagnostics,
    DiagnosticStatus
} from '../../services/cloudDataService';
import { 
    IconX, 
    IconRefresh, 
    IconCheck, 
    IconAlertTriangle, 
    IconTrash, 
    IconCloudOff, 
    IconClock,
    IconSearch,
    IconDownload
} from './Icon';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    googleSheetsUrl?: string;
    proxyUrl?: string;
}

export const DiagnosticOverlay: React.FC<Props> = ({
    isOpen,
    onClose,
    googleSheetsUrl = 'https://script.google.com/macros/s/AKfycbyPuNQGgUfJnpcV_dCFs-2ppA6bdYW6bKr-2sTnPI1d6Ww_yjDA0q8fc6PpiY2wZncl/exec',
    proxyUrl
}) => {
    const [logs, setLogs] = useState<FetchDiagnosticLog[]>([]);
    const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'ERRORS' | 'NETWORK_DROP' | 'CORS_BLOCKED' | 'RESOURCE_404' | 'AUTH_ERROR' | 'SUCCESS'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [testReport, setTestReport] = useState<FullDiagnosticReport | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = subscribeDiagnosticLogs((updatedLogs) => {
            setLogs(updatedLogs);
        });
        return () => unsubscribe();
    }, [isOpen]);

    if (!isOpen) return null;

    const handleRunDiagnostics = async () => {
        setIsTesting(true);
        try {
            const report = await runFullDiagnostics(googleSheetsUrl, proxyUrl);
            setTestReport(report);
        } catch (err) {
            console.error('Diagnostic test runner failed:', err);
        } finally {
            setIsTesting(false);
        }
    };

    const handleCopyLogs = () => {
        const text = JSON.stringify({ testReport, logs }, null, 2);
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filteredLogs = logs.filter(log => {
        if (selectedFilter === 'ERRORS' && log.status === 'SUCCESS') return false;
        if (selectedFilter === 'NETWORK_DROP' && log.status !== 'NETWORK_DROP') return false;
        if (selectedFilter === 'CORS_BLOCKED' && log.status !== 'CORS_BLOCKED') return false;
        if (selectedFilter === 'RESOURCE_404' && log.status !== 'RESOURCE_404') return false;
        if (selectedFilter === 'AUTH_ERROR' && log.status !== 'AUTH_ERROR') return false;
        if (selectedFilter === 'SUCCESS' && log.status !== 'SUCCESS') return false;

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                log.url.toLowerCase().includes(term) ||
                log.stage.toLowerCase().includes(term) ||
                log.status.toLowerCase().includes(term) ||
                (log.action && log.action.toLowerCase().includes(term)) ||
                (log.errorDetails && log.errorDetails.toLowerCase().includes(term))
            );
        }

        return true;
    });

    const getStatusBadge = (status: DiagnosticStatus) => {
        switch (status) {
            case 'SUCCESS':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">SUCCESS</span>;
            case 'OPAQUE_REACHABLE':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">REACHABLE (no-cors)</span>;
            case 'CORS_BLOCKED':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">CORS BLOCKED</span>;
            case 'NETWORK_DROP':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">NETWORK DROP</span>;
            case 'RESOURCE_404':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">404 NOT FOUND</span>;
            case 'AUTH_ERROR':
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">AUTH ERROR</span>;
            default:
                return <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-700 text-slate-300">UNKNOWN</span>;
        }
    };

    const getStageLabel = (stage: FetchDiagnosticLog['stage']) => {
        switch (stage) {
            case 'proxy_post': return 'Proxy POST';
            case 'proxy_get': return 'Proxy GET';
            case 'direct_post': return 'Direct POST';
            case 'direct_get': return 'Direct GET';
            case 'no_cors_ping': return 'no-cors Ping';
            case 'all_origins': return 'AllOrigins Proxy';
            default: return stage;
        }
    };

    const errorCount = logs.filter(l => l.status !== 'SUCCESS' && l.status !== 'OPAQUE_REACHABLE').length;
    const networkDropCount = logs.filter(l => l.status === 'NETWORK_DROP').length;
    const corsBlockedCount = logs.filter(l => l.status === 'CORS_BLOCKED').length;
    const resource404Count = logs.filter(l => l.status === 'RESOURCE_404').length;
    const authErrorCount = logs.filter(l => l.status === 'AUTH_ERROR').length;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
                
                {/* Header */}
                <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center text-brand-accent">
                            <IconRefresh className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white flex items-center gap-2">
                                Google Sheets Fetch Diagnostics
                                {errorCount > 0 ? (
                                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-extrabold">
                                        {errorCount} Alerts
                                    </span>
                                ) : (
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-extrabold">
                                        Normal
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-slate-400">
                                Real-time fetch monitor & backend network connectivity diagnostics
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRunDiagnostics}
                            disabled={isTesting}
                            className="flex items-center gap-2 px-3.5 py-1.5 bg-brand-accent hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                            <IconRefresh className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                            <span>{isTesting ? 'Testing Backend...' : 'Run Diagnostics'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleCopyLogs}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                            title="Copy JSON report to clipboard"
                        >
                            {copied ? <IconCheck className="w-3.5 h-3.5 text-emerald-400" /> : <IconDownload className="w-3.5 h-3.5 text-slate-400" />}
                            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={clearDiagnosticLogs}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded-xl border border-slate-700 transition-all cursor-pointer"
                            title="Clear diagnostic logs"
                        >
                            <IconTrash className="w-4 h-4" />
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-all cursor-pointer"
                        >
                            <IconX className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Diagnostic Test Report Panel */}
                    {testReport && (
                        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                    <IconClock className="w-3.5 h-3.5 text-brand-accent" />
                                    Diagnostic Summary Report ({testReport.timestamp})
                                </span>
                                <span className={`px-2.5 py-0.5 text-xs font-extrabold rounded-lg border ${
                                    testReport.overallStatus === 'HEALTHY' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                    testReport.overallStatus === 'CORS_ISSUES' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                    testReport.overallStatus === 'RESOURCE_404' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                                    testReport.overallStatus === 'NETWORK_OFFLINE' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                                    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                                }`}>
                                    {testReport.overallStatus}
                                </span>
                            </div>

                            {/* 4 Test Status Cards Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div className={`p-2.5 rounded-lg border text-xs ${testReport.proxyPost.ok ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200' : 'bg-rose-950/30 border-rose-800/50 text-rose-200'}`}>
                                    <div className="font-bold text-[11px] mb-1">1. Proxy POST</div>
                                    <div className="text-[10px] font-mono">{testReport.proxyPost.ok ? `HTTP ${testReport.proxyPost.status} (${testReport.proxyPost.durationMs}ms)` : (testReport.proxyPost.error || 'Failed')}</div>
                                </div>

                                <div className={`p-2.5 rounded-lg border text-xs ${testReport.proxyGet.ok ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200' : 'bg-rose-950/30 border-rose-800/50 text-rose-200'}`}>
                                    <div className="font-bold text-[11px] mb-1">2. Proxy GET</div>
                                    <div className="text-[10px] font-mono">{testReport.proxyGet.ok ? `HTTP ${testReport.proxyGet.status} (${testReport.proxyGet.durationMs}ms)` : (testReport.proxyGet.error || 'Failed')}</div>
                                </div>

                                <div className={`p-2.5 rounded-lg border text-xs ${testReport.directCors.ok ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200' : 'bg-amber-950/30 border-amber-800/50 text-amber-200'}`}>
                                    <div className="font-bold text-[11px] mb-1">3. Direct CORS</div>
                                    <div className="text-[10px] font-mono">{testReport.directCors.ok ? `HTTP ${testReport.directCors.status} (${testReport.directCors.durationMs}ms)` : (testReport.directCors.error || 'Blocked')}</div>
                                </div>

                                <div className={`p-2.5 rounded-lg border text-xs ${testReport.noCorsPing.reachable ? 'bg-cyan-950/30 border-cyan-800/50 text-cyan-200' : 'bg-rose-950/30 border-rose-800/50 text-rose-200'}`}>
                                    <div className="font-bold text-[11px] mb-1">4. no-cors Probe</div>
                                    <div className="text-[10px] font-mono">{testReport.noCorsPing.reachable ? `Reachable (${testReport.noCorsPing.durationMs}ms)` : 'Unreachable'}</div>
                                </div>
                            </div>

                            {/* Summary & Recommendation */}
                            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-1.5 text-xs">
                                <p className="text-slate-200 font-semibold">{testReport.summary}</p>
                                <p className="text-brand-accent font-medium text-[11px] flex items-center gap-1.5">
                                    <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Action:</span>
                                    {testReport.recommendation}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Filter Tabs & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                            <button
                                onClick={() => setSelectedFilter('ALL')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'ALL' ? 'bg-brand-accent text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                            >
                                All ({logs.length})
                            </button>
                            <button
                                onClick={() => setSelectedFilter('ERRORS')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'ERRORS' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-rose-300 hover:bg-slate-700'}`}
                            >
                                Errors ({errorCount})
                            </button>
                            <button
                                onClick={() => setSelectedFilter('CORS_BLOCKED')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'CORS_BLOCKED' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'}`}
                            >
                                CORS ({corsBlockedCount})
                            </button>
                            <button
                                onClick={() => setSelectedFilter('NETWORK_DROP')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'NETWORK_DROP' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-rose-300 hover:bg-slate-700'}`}
                            >
                                Network Drop ({networkDropCount})
                            </button>
                            <button
                                onClick={() => setSelectedFilter('RESOURCE_404')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'RESOURCE_404' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-purple-300 hover:bg-slate-700'}`}
                            >
                                404 ({resource404Count})
                            </button>
                            <button
                                onClick={() => setSelectedFilter('AUTH_ERROR')}
                                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${selectedFilter === 'AUTH_ERROR' ? 'bg-yellow-500 text-slate-950' : 'bg-slate-800 text-yellow-300 hover:bg-slate-700'}`}
                            >
                                Auth ({authErrorCount})
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="relative w-full sm:w-64">
                            <IconSearch className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filter logs by URL, action..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-accent/50"
                            />
                        </div>
                    </div>

                    {/* Logs Table / Cards */}
                    {filteredLogs.length === 0 ? (
                        <div className="text-center py-12 bg-slate-950/40 rounded-xl border border-slate-800/60">
                            <IconCloudOff className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-400">No diagnostic logs matching filter.</p>
                            <p className="text-[11px] text-slate-500 mt-1">Run a diagnostic test or execute a cloud operation to monitor fetch calls.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredLogs.map((log) => (
                                <div 
                                    key={log.id} 
                                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-2 hover:border-slate-700 transition-all text-xs"
                                >
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(log.status)}
                                            <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                                {getStageLabel(log.stage)}
                                            </span>
                                            <span className="font-bold text-slate-200">
                                                {log.method} {log.action ? `[${log.action}]` : ''}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                                            {log.httpCode !== undefined && (
                                                <span>Code: {log.httpCode}</span>
                                            )}
                                            <span className="text-brand-accent">{log.durationMs}ms</span>
                                            <span>{log.timestamp}</span>
                                        </div>
                                    </div>

                                    <div className="text-[11px] font-mono text-slate-400 truncate bg-slate-900/80 p-1.5 rounded border border-slate-800/60">
                                        {log.url}
                                    </div>

                                    {log.errorDetails && (
                                        <div className="text-[11px] text-rose-300/90 bg-rose-950/30 border border-rose-800/40 p-2 rounded-lg leading-relaxed">
                                            <span className="font-bold text-rose-200 mr-1">Alert:</span>
                                            {log.errorDetails}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                    <span>Monitored Backend: <code className="text-slate-300 text-[11px]">{googleSheetsUrl.slice(0, 45)}...</code></span>
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DiagnosticOverlay;
