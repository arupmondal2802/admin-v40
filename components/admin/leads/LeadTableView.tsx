import React, { useState, useMemo } from 'react';
import {
  Phone,
  MessageSquare,
  Sparkles,
  Car,
  Clock,
  MapPin,
  Navigation,
  Flame,
  Zap,
  ArrowUpDown,
  Plus,
  Settings,
  Download,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  User
} from 'lucide-react';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import {
  calculateLeadScore,
  calculateLeadSla,
  exportLeadsToCsv,
  normalizePhoneNumber
} from './leadUtils';
import { LeadActionMenu } from './LeadActionMenu';

interface LeadTableViewProps {
  leads: ServiceRequest[];
  stages: string[];
  onStatusChange: (lead: ServiceRequest, newStatus: string) => void;
  onSelectLead: (lead: ServiceRequest) => void;
  onConvertLead?: (leadId: string) => void;
  onOpenWhatsAppModal: (lead: ServiceRequest) => void;
  onSnoozeLead?: (lead: ServiceRequest) => void;
  onAddNoteLead?: (lead: ServiceRequest) => void;
  onCallLead?: (lead: ServiceRequest) => void;
  selectedLeadIds: string[];
  onToggleSelectLead: (leadId: string) => void;
  onSelectAllLeads: (leadIds: string[]) => void;
  activeHubs: DeliveryHub[];
  getLeadHubDistanceInfo: (lead: ServiceRequest, hubs: DeliveryHub[]) => { hubName: string; distanceKm: number } | null;
  getStageColorClasses: (stage: string) => string;
  users: UserType[];
  onAssignAgent?: (lead: ServiceRequest, agent: string) => void;
}

export const LeadTableView: React.FC<LeadTableViewProps> = ({
  leads,
  stages,
  onStatusChange,
  onSelectLead,
  onConvertLead,
  onOpenWhatsAppModal,
  onSnoozeLead,
  onAddNoteLead,
  onCallLead,
  selectedLeadIds,
  onToggleSelectLead,
  onSelectAllLeads,
  activeHubs,
  getLeadHubDistanceInfo,
  getStageColorClasses,
  users,
  onAssignAgent
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [sortField, setSortField] = useState<'DATE' | 'NAME' | 'VALUE' | 'STAGE'>('DATE');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Sorted leads
  const sortedLeads = useMemo(() => {
    const arr = [...leads];
    arr.sort((a, b) => {
      let diff = 0;
      if (sortField === 'DATE') {
        diff = new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime();
      } else if (sortField === 'NAME') {
        diff = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (sortField === 'VALUE') {
        diff = (a.totalAmount || 0) - (b.totalAmount || 0);
      } else if (sortField === 'STAGE') {
        diff = (a.status || '').localeCompare(b.status || '');
      }
      return sortOrder === 'asc' ? diff : -diff;
    });
    return arr;
  }, [leads, sortField, sortOrder]);

  // Paginated leads
  const totalPages = Math.ceil(sortedLeads.length / pageSize) || 1;
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLeads.slice(start, start + pageSize);
  }, [sortedLeads, currentPage, pageSize]);

  const handleSort = (field: 'DATE' | 'NAME' | 'VALUE' | 'STAGE') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const isAllCurrentPageSelected =
    paginatedLeads.length > 0 &&
    paginatedLeads.every(l => selectedLeadIds.includes(l.id));

  const handleToggleSelectAll = () => {
    if (isAllCurrentPageSelected) {
      // Unselect current page
      const newSelected = selectedLeadIds.filter(
        id => !paginatedLeads.some(l => l.id === id)
      );
      onSelectAllLeads(newSelected);
    } else {
      // Select all in current page
      const currentIds = paginatedLeads.map(l => l.id);
      const combined = Array.from(new Set([...selectedLeadIds, ...currentIds]));
      onSelectAllLeads(combined);
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden mb-16">
      {/* Table Toolbar */}
      <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportLeadsToCsv(leads, 'crm_all_leads.csv')}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Table ({leads.length})</span>
          </button>
          <span className="text-xs text-slate-500 font-medium">
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, leads.length)}</strong> of <strong>{leads.length}</strong> records
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[10px]">
              <th className="p-3.5 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllCurrentPageSelected}
                  onChange={handleToggleSelectAll}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                />
              </th>
              <th
                onClick={() => handleSort('NAME')}
                className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Customer & Score</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="p-3.5">Contact</th>
              <th className="p-3.5">Vehicle Spec</th>
              <th className="p-3.5">Service Requested</th>
              <th
                onClick={() => handleSort('VALUE')}
                className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Quotation (₹)</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('STAGE')}
                className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Pipeline Stage</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="p-3.5">Assigned Agent</th>
              <th className="p-3.5">Hub Distance</th>
              <th
                onClick={() => handleSort('DATE')}
                className="p-3.5 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Ingested Date</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="p-3.5 text-right">Quick Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedLeads.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  No matching CRM leads found in this view.
                </td>
              </tr>
            ) : (
              paginatedLeads.map((lead) => {
                const isSelected = selectedLeadIds.includes(lead.id);
                const scoreInfo = calculateLeadScore(lead);
                const slaInfo = calculateLeadSla(lead);
                const distInfo = getLeadHubDistanceInfo(lead, activeHubs);
                const cleanPhone = normalizePhoneNumber(lead.customerPhone || (lead as any).mobileNumber);

                return (
                  <tr
                    key={lead.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      isSelected ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectLead(lead.id)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                      />
                    </td>

                    {/* Customer & Score */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <button
                          onClick={() => onSelectLead(lead)}
                          className="font-extrabold text-slate-900 hover:text-indigo-600 text-left transition-colors cursor-pointer"
                        >
                          {lead.customerName}
                        </button>
                        <div className="flex items-center gap-1.5">
                          {scoreInfo.tier === 'HOT' && (
                            <span className="text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200 px-1 rounded flex items-center gap-0.5">
                              <Flame className="w-2.5 h-2.5 fill-rose-500 text-rose-500" /> HOT
                            </span>
                          )}
                          {scoreInfo.tier === 'WARM' && (
                            <span className="text-[9px] font-black bg-amber-50 text-amber-800 border border-amber-200 px-1 rounded flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5 text-amber-500" /> WARM
                            </span>
                          )}
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 rounded font-bold uppercase">
                            {lead.source || lead.leadSource || 'Meta'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="p-3.5 font-mono text-slate-700 font-semibold">
                      {cleanPhone ? (
                        <div className="flex items-center gap-1.5">
                          <span>+91 {cleanPhone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>

                    {/* Vehicle */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-800">
                          {[lead.carBrand, lead.carModel].filter(Boolean).join(' ') || '—'}
                        </span>
                        {lead.carRegNo && (
                          <p className="text-[10px] font-mono text-slate-500 font-bold">{lead.carRegNo}</p>
                        )}
                      </div>
                    </td>

                    {/* Service */}
                    <td className="p-3.5">
                      <span className="font-semibold text-slate-700 max-w-[180px] truncate block" title={lead.requestedService}>
                        {lead.requestedService || 'General Care'}
                      </span>
                    </td>

                    {/* Value */}
                    <td className="p-3.5 font-mono font-black text-slate-900">
                      {lead.totalAmount ? `₹${lead.totalAmount.toLocaleString()}` : '—'}
                    </td>

                    {/* Inline Stage Dropdown */}
                    <td className="p-3.5">
                      <select
                        value={(lead.status || 'CREATED').toUpperCase()}
                        onChange={(e) => onStatusChange(lead, e.target.value)}
                        className={`text-[10px] font-extrabold px-2 py-1 rounded-lg border focus:outline-none cursor-pointer uppercase tracking-wider ${getStageColorClasses(
                          lead.status || 'CREATED'
                        )}`}
                      >
                        {stages.map(stage => (
                          <option key={stage} value={stage} className="bg-white text-slate-900">
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Inline Agent Assignment */}
                    <td className="p-3.5">
                      <select
                        value={lead.assignedAgent || ''}
                        onChange={(e) => onAssignAgent?.(lead, e.target.value)}
                        className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 font-semibold text-slate-700 cursor-pointer focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.username} value={u.username}>
                            {u.username}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Hub Distance */}
                    <td className="p-3.5">
                      {distInfo ? (
                        <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 font-mono">
                          {distInfo.distanceKm.toFixed(1)} km
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    {/* Ingestion Date & SLA */}
                    <td className="p-3.5 font-mono text-[10px] text-slate-500 font-bold">
                      <div>{new Date(lead.requestDate).toLocaleDateString()}</div>
                      <div className="text-[9px] text-slate-400">
                        {new Date(lead.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Quick Actions & Salesforce Action Menu */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {cleanPhone && (
                          <a
                            href={`tel:${cleanPhone}`}
                            className="p-1.5 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Call customer"
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {cleanPhone && (
                          <button
                            onClick={() => onOpenWhatsAppModal(lead)}
                            className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors cursor-pointer"
                            title="WhatsApp quick chat"
                          >
                            <MessageSquare className="w-3.5 h-3.5 fill-emerald-600" />
                          </button>
                        )}

                        {lead.status !== 'CONVERTED' && onConvertLead && (
                          <button
                            onClick={() => onConvertLead(lead.id)}
                            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all active:scale-95 cursor-pointer"
                            title="Convert to active order"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Modern Salesforce-Inspired Actions Dropdown Menu */}
                        <LeadActionMenu
                          lead={lead}
                          onCall={onCallLead}
                          onConvertToOrder={onConvertLead ? (l) => onConvertLead(l.id) : undefined}
                          onSnooze={onSnoozeLead}
                          onAddNote={onAddNoteLead}
                          onOpenWhatsApp={onOpenWhatsAppModal}
                          onViewDetails={onSelectLead}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 bg-slate-50/80 border-t border-slate-200 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-medium">
          Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
