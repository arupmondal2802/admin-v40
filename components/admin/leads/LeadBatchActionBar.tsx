import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  ShoppingCart,
  Clock,
  FileText,
  User,
  CheckCircle2,
  ChevronDown,
  Download,
  Archive,
  Merge,
  X,
  Sparkles,
  Zap,
  MoreHorizontal,
  Calendar,
  Send,
  MessageSquare
} from 'lucide-react';
import { ServiceRequest } from '../../../types';
import { exportLeadsToCsv } from './leadUtils';

interface LeadBatchActionBarProps {
  selectedLeadIds: string[];
  allLeads: ServiceRequest[];
  onBatchStatusChange: (stage: string) => void;
  onBatchAssignAgent: (agent: string) => void;
  onBatchArchive: () => void;
  onBatchMerge: () => void;
  onClearSelection: () => void;
  onBatchCall?: (selectedLeads: ServiceRequest[]) => void;
  onBatchConvert?: (selectedLeadIds: string[]) => void;
  onBatchSnooze?: (selectedLeadIds: string[], snoozeUntil: string, reason?: string) => void;
  onBatchAddNote?: (selectedLeadIds: string[], note: string) => void;
  availableAgents: string[];
  leadStages: string[];
}

export const LeadBatchActionBar: React.FC<LeadBatchActionBarProps> = ({
  selectedLeadIds,
  allLeads,
  onBatchStatusChange,
  onBatchAssignAgent,
  onBatchArchive,
  onBatchMerge,
  onClearSelection,
  onBatchCall,
  onBatchConvert,
  onBatchSnooze,
  onBatchAddNote,
  availableAgents,
  leadStages
}) => {
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [isStageDropdownOpen, setIsStageDropdownOpen] = useState(false);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsActionsDropdownOpen(false);
        setIsStageDropdownOpen(false);
        setIsAgentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedLeadIds.length === 0) return null;

  const selectedLeads = allLeads.filter(l => selectedLeadIds.includes(l.id));
  const totalValue = selectedLeads.reduce((acc, l) => acc + (l.totalAmount || 0), 0);

  const handleExportSelected = () => {
    exportLeadsToCsv(selectedLeads, `selected_crm_leads_${selectedLeadIds.length}.csv`);
  };

  const handleActionClick = (actionType: 'call' | 'convert' | 'snooze' | 'add_note' | 'archive' | 'merge') => {
    setIsActionsDropdownOpen(false);
    if (actionType === 'call' && onBatchCall) {
      onBatchCall(selectedLeads);
    } else if (actionType === 'convert' && onBatchConvert) {
      onBatchConvert(selectedLeadIds);
    } else if (actionType === 'snooze' && onBatchSnooze) {
      onBatchSnooze(selectedLeadIds, 'TOMORROW_10AM');
    } else if (actionType === 'add_note' && onBatchAddNote) {
      onBatchAddNote(selectedLeadIds, '');
    } else if (actionType === 'archive') {
      onBatchArchive();
    } else if (actionType === 'merge') {
      onBatchMerge();
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-4xl w-[94%] bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-2xl animate-slideUp">
      <div className="flex flex-wrap items-center justify-between gap-3" ref={dropdownRef}>
        {/* Left Side: Salesforce Style Selected Lead Counter & Value */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-xs shadow-xs border border-indigo-400/40">
            {selectedLeadIds.length}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-black text-slate-100 tracking-tight">
                {selectedLeadIds.length} Lead{selectedLeadIds.length > 1 ? 's' : ''} Selected
              </p>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                Salesforce Action Hub
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Pipeline Value: <strong className="text-emerald-400 font-mono font-bold">₹{totalValue.toLocaleString('en-IN')}</strong>
            </p>
          </div>
        </div>

        {/* Action Controls: Modern Salesforce Dropdown-Based Menu */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Main Salesforce-Inspired Actions Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setIsActionsDropdownOpen(prev => !prev);
                setIsStageDropdownOpen(false);
                setIsAgentDropdownOpen(false);
              }}
              className="px-3.5 py-2 bg-gradient-to-r from-brand-blue to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95 cursor-pointer border border-blue-400/30"
              title="Salesforce CRM Actions: Call, Convert, Snooze, Add Note"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
              <span>CRM Actions</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isActionsDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Items */}
            {isActionsDropdownOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>Quick Lead Actions</span>
                  <span className="text-[9px] text-indigo-400 font-mono">{selectedLeadIds.length} records</span>
                </div>

                {/* 1. Call */}
                <button
                  onClick={() => handleActionClick('call')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-indigo-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-lg bg-indigo-950 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white">
                      <Phone className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <p className="font-extrabold text-xs">Call</p>
                      <p className="text-[10px] text-slate-400 group-hover:text-indigo-100">
                        {selectedLeadIds.length === 1 ? 'Direct dial customer' : 'Start batch call queue'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-indigo-200">Dialer</span>
                </button>

                {/* 2. Convert to Order */}
                <button
                  onClick={() => handleActionClick('convert')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-emerald-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-lg bg-emerald-950 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white">
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <p className="font-extrabold text-xs">Convert to Order</p>
                      <p className="text-[10px] text-slate-400 group-hover:text-emerald-100">
                        Transfer to active service job queue
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-emerald-200">Booking</span>
                </button>

                {/* 3. Snooze / Reminder */}
                <button
                  onClick={() => handleActionClick('snooze')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-amber-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-lg bg-amber-950 text-amber-400 group-hover:bg-amber-500 group-hover:text-white">
                      <Clock className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <p className="font-extrabold text-xs">Snooze</p>
                      <p className="text-[10px] text-slate-400 group-hover:text-amber-100">
                        Schedule follow-up reminder
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-amber-200">Reminder</span>
                </button>

                {/* 4. Add Note */}
                <button
                  onClick={() => handleActionClick('add_note')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-sky-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-lg bg-sky-950 text-sky-400 group-hover:bg-sky-500 group-hover:text-white">
                      <FileText className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <p className="font-extrabold text-xs">Add Note</p>
                      <p className="text-[10px] text-slate-400 group-hover:text-sky-100">
                        Append log to timeline
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-sky-200">Remarks</span>
                </button>

                <div className="border-t border-slate-800 my-1"></div>

                {/* Merge if 2+ selected */}
                {selectedLeadIds.length >= 2 && (
                  <button
                    onClick={() => handleActionClick('merge')}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-200 hover:bg-purple-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Merge className="w-3.5 h-3.5 text-purple-400 group-hover:text-white" />
                      <span>Merge Selected ({selectedLeadIds.length})</span>
                    </div>
                  </button>
                )}

                {/* Batch Archive */}
                <button
                  onClick={() => handleActionClick('archive')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-rose-300 hover:bg-rose-600 hover:text-white flex items-center justify-between transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Archive className="w-3.5 h-3.5 text-rose-400 group-hover:text-white" />
                    <span>Archive Selected</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Quick Stage Change Dropdown */}
          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onBatchStatusChange(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-indigo-300 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Stage ▾</option>
              {leadStages.map(stage => (
                <option key={stage} value={stage} className="bg-slate-900 text-white">
                  → {stage}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Assign Agent Dropdown */}
          <div className="relative">
            <select
              onChange={(e) => {
                if (e.target.value) {
                  onBatchAssignAgent(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Assign Owner ▾</option>
              <option value="UNASSIGN" className="bg-slate-900 text-white">Unassign</option>
              {availableAgents.map(agent => (
                <option key={agent} value={agent} className="bg-slate-900 text-white">
                  👤 {agent}
                </option>
              ))}
            </select>
          </div>

          {/* Export Selected CSV */}
          <button
            onClick={handleExportSelected}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer hidden md:flex"
            title="Download CSV for selected leads"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          {/* Deselect All */}
          <button
            onClick={onClearSelection}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-colors cursor-pointer ml-1"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
