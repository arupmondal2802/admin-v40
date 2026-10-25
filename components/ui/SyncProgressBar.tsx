import React, { useEffect, useState, useRef } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, Loader } from 'lucide-react';

interface SyncProgressBarProps {
    progress: number | null;
    stage?: string | null;
    entity?: string | null;
}

const SyncProgressBar: React.FC<SyncProgressBarProps> = ({ progress, stage, entity }) => {
    const [visible, setVisible] = useState(false);
    const [renderedProgress, setRenderedProgress] = useState(0);
    const [showDetails, setShowDetails] = useState(false);
    const [processedEntities, setProcessedEntities] = useState<string[]>([]);
    const listEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (progress !== null) {
            setVisible(true);
            setRenderedProgress(progress);
        } else {
            // Delay hiding the progress bar to let the user see it complete at 100%
            const timer = setTimeout(() => {
                setVisible(false);
                setRenderedProgress(0);
                setShowDetails(false);
                setProcessedEntities([]);
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [progress]);

    useEffect(() => {
        if (progress === null) {
            setProcessedEntities([]);
        } else if (entity) {
            setProcessedEntities(prev => {
                if (prev.includes(entity)) {
                    // Move it to the end if it was processed again or keep order
                    return prev;
                }
                return [...prev, entity];
            });
        }
    }, [entity, progress]);

    // Auto scroll details list to bottom when a new entity is processed
    useEffect(() => {
        if (showDetails && listEndRef.current) {
            listEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [processedEntities, showDetails]);

    if (!visible) return null;

    return (
        <div className="fixed top-0 left-0 w-full z-50 pointer-events-none transition-opacity duration-500">
            {/* The thin visual progress line */}
            <div className="h-1.5 w-full bg-slate-200/50 backdrop-blur-sm shadow-inner relative overflow-hidden">
                <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                    style={{ width: `${renderedProgress}%` }}
                />
            </div>

            {/* Elegant small progress floating card */}
            <div className="absolute top-3 right-4 md:right-8 flex flex-col items-end gap-2 pointer-events-auto max-w-sm w-72 md:w-80">
                <div className="w-full bg-slate-900/95 text-white text-xs p-3 rounded-xl shadow-xl backdrop-blur-sm border border-slate-700/50 transition-all duration-300">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {renderedProgress < 100 ? (
                                <Loader className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                            ) : (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span className="font-semibold text-slate-100">{renderedProgress}%</span>
                            {stage && (
                                <>
                                    <span className="text-slate-500 font-medium">|</span>
                                    <span className="text-slate-300 font-medium truncate max-w-[120px] md:max-w-[150px]">{stage}</span>
                                </>
                            )}
                        </div>
                        {processedEntities.length > 0 && (
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-medium text-slate-300 transition-colors"
                                title="Toggle sync details"
                                id="sync-details-toggle-btn"
                            >
                                <span>Details</span>
                                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                        )}
                    </div>

                    {/* Expandable Entity Details Section */}
                    {showDetails && processedEntities.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/80 max-h-40 overflow-y-auto custom-scrollbar transition-all duration-300">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-0.5">
                                Synced Entities ({processedEntities.length})
                            </div>
                            <div className="space-y-1.5 pr-1">
                                {processedEntities.map((ent, idx) => {
                                    const isLast = idx === processedEntities.length - 1;
                                    const isSyncComplete = renderedProgress >= 100;

                                    return (
                                        <div 
                                            key={ent + idx} 
                                            className={`flex items-center justify-between p-1 rounded transition-colors ${
                                                isLast && !isSyncComplete ? 'bg-slate-800/50' : 'hover:bg-slate-800/20'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                {isLast && !isSyncComplete ? (
                                                    <Loader className="w-3 h-3 text-blue-400 animate-spin shrink-0" />
                                                ) : (
                                                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                                )}
                                                <span className={`truncate ${isLast && !isSyncComplete ? 'font-medium text-blue-300' : 'text-slate-300'}`}>
                                                    {ent}
                                                </span>
                                            </div>
                                            <span className="text-[9px] text-slate-500 font-mono">
                                                {isLast && !isSyncComplete ? 'processing' : 'ready'}
                                            </span>
                                        </div>
                                    );
                                })}
                                <div ref={listEndRef} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SyncProgressBar;
