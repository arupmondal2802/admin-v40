import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Layers,
  CheckCircle2,
  X,
  Phone,
  Car,
  Calendar,
  ArrowRight,
  AlertTriangle,
  Merge,
  Archive,
  Info
} from 'lucide-react';
import { ServiceRequest } from '../../../types';
import { detectDuplicateLeads, DuplicateLeadCluster } from './leadUtils';

interface LeadDeduplicationModalProps {
  leads: ServiceRequest[];
  onClose: () => void;
  onMergeLeads: (primaryLead: ServiceRequest, duplicateIdsToArchive: string[]) => void;
}

export const LeadDeduplicationModal: React.FC<LeadDeduplicationModalProps> = ({
  leads,
  onClose,
  onMergeLeads
}) => {
  const [mergedCount, setMergedCount] = useState<number>(0);

  // Detect duplicate clusters
  const clusters = useMemo(() => {
    return detectDuplicateLeads(leads);
  }, [leads]);

  const handleMergeCluster = (cluster: DuplicateLeadCluster) => {
    if (cluster.leads.length < 2) return;

    // Pick the lead with the most complete data or earliest creation as primary
    const sorted = [...cluster.leads].sort((a, b) => {
      const dateA = new Date(a.requestDate).getTime();
      const dateB = new Date(b.requestDate).getTime();
      return dateA - dateB;
    });

    const primary = { ...sorted[0] };
    const duplicates = sorted.slice(1);
    const duplicateIds = duplicates.map(d => d.id);

    // Merge notes & fields
    const allRemarks = [
      primary.remarks,
      ...duplicates.map(d => d.remarks).filter(Boolean)
    ].filter(Boolean).join(' | ');

    const highestAmount = Math.max(
      primary.totalAmount || 0,
      ...duplicates.map(d => d.totalAmount || 0)
    );

    const mergedLead: ServiceRequest = {
      ...primary,
      remarks: allRemarks,
      totalAmount: highestAmount,
      carBrand: primary.carBrand || duplicates.find(d => d.carBrand)?.carBrand || '',
      carModel: primary.carModel || duplicates.find(d => d.carModel)?.carModel || '',
      carRegNo: primary.carRegNo || duplicates.find(d => d.carRegNo)?.carRegNo || '',
      streetAddress: primary.streetAddress || duplicates.find(d => d.streetAddress)?.streetAddress || '',
      assignedAgent: primary.assignedAgent || duplicates.find(d => d.assignedAgent)?.assignedAgent || ''
    };

    onMergeLeads(mergedLead, duplicateIds);
    setMergedCount(prev => prev + duplicates.length);
  };

  const handleMergeAll = () => {
    clusters.forEach(cluster => {
      handleMergeCluster(cluster);
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                Smart Deduplication & Conflict Resolver
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase tracking-wider">
                  {clusters.length} Conflict Clusters Found
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Detects multi-channel inquiries with matching phone numbers, car registrations, or emails
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Header */}
        {clusters.length > 0 && (
          <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-amber-900 font-medium leading-relaxed">
              Merging consolidates remarks, retains earliest registration timestamps, keeps highest quotation values, and archives duplicate entries.
            </div>
            <button
              onClick={handleMergeAll}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Merge className="w-3.5 h-3.5" />
              <span>Merge All ({clusters.length})</span>
            </button>
          </div>
        )}

        {/* Clusters List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {clusters.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-slate-900">Zero Duplicates Detected!</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                All {leads.length} customer records in your CRM pipeline have unique phone numbers and distinct vehicle profiles.
              </p>
            </div>
          ) : (
            clusters.map((cluster, idx) => (
              <div
                key={cluster.matchKey + idx}
                className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 space-y-3"
              >
                {/* Cluster Match Badge */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      Matched By: {cluster.matchType}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">{cluster.matchKey}</span>
                  </div>
                  <button
                    onClick={() => handleMergeCluster(cluster)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Merge className="w-3 h-3" />
                    <span>Merge Cluster ({cluster.leads.length} Leads)</span>
                  </button>
                </div>

                {/* Compare Duplicate Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {cluster.leads.map((lead, leadIdx) => (
                    <div
                      key={lead.id}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        leadIdx === 0
                          ? 'bg-white border-indigo-200 ring-1 ring-indigo-500/20'
                          : 'bg-white/80 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          {leadIdx === 0 && <span className="text-[9px] bg-indigo-100 text-indigo-800 px-1.5 py-0.2 rounded font-bold">PRIMARY</span>}
                          {lead.customerName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(lead.requestDate).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 flex items-center gap-2">
                        <span className="font-bold text-slate-700">Source:</span>
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">{lead.source || lead.leadSource || 'Web'}</span>
                        <span className="font-bold text-slate-700">Stage:</span>
                        <span className="text-indigo-700 font-extrabold">{lead.status}</span>
                      </div>

                      <div className="text-[11px] text-slate-600">
                        <span className="font-bold">Service:</span> {lead.requestedService || 'General Inquiry'}
                        {lead.totalAmount ? <span className="ml-2 font-mono font-bold text-emerald-700">₹{lead.totalAmount}</span> : null}
                      </div>

                      {lead.remarks && (
                        <div className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100 italic truncate">
                          "{lead.remarks}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            {mergedCount > 0 && `${mergedCount} duplicate records consolidated into primary leads.`}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Close Deduplicator
          </button>
        </div>
      </div>
    </div>
  );
};
