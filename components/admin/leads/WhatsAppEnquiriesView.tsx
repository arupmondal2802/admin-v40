import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Phone,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Car,
  MapPin,
  Calendar,
  DollarSign,
  User as UserIcon,
  CheckCircle,
  Clock,
  ExternalLink,
  ChevronDown,
  ArrowUpDown,
  Tag,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Share2
} from 'lucide-react';
import { ServiceRequest, User } from '../../../types';
import { normalizeStatus, normalizePhoneNumber, formatCurrency } from './leadUtils';
import { toast } from 'sonner';

interface WhatsAppEnquiriesViewProps {
  leads: ServiceRequest[];
  users: User[];
  onSyncWhatsAppLeads?: (mode?: 'incremental' | 'full') => Promise<void>;
  isSyncingWhatsAppLeads?: boolean;
  onUpdateLead?: (lead: ServiceRequest) => Promise<void>;
  onConvertLead?: (leadId: string) => void;
  onOpenTimelineDrawer?: (lead: ServiceRequest) => void;
  onOpenWhatsAppModal?: (lead: ServiceRequest) => void;
  onOpenConversionWizard?: (lead: ServiceRequest) => void;
  lastSyncDate?: string;
  whatsAppSheetUrl?: string;
}

export const WhatsAppEnquiriesView: React.FC<WhatsAppEnquiriesViewProps> = ({
  leads,
  users,
  onSyncWhatsAppLeads,
  isSyncingWhatsAppLeads = false,
  onUpdateLead,
  onConvertLead,
  onOpenTimelineDrawer,
  onOpenWhatsAppModal,
  onOpenConversionWizard,
  lastSyncDate,
  whatsAppSheetUrl
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'date' | 'name' | 'value' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter WhatsApp inquiries
  const whatsappLeads = useMemo(() => {
    return leads.filter(l => {
      const src = (l.source || l.leadSource || '').toLowerCase();
      return src === 'whatsapp' || src.includes('whatsapp') || src.includes('wa');
    });
  }, [leads]);

  // Apply filters
  const filteredLeads = useMemo(() => {
    return whatsappLeads.filter(lead => {
      // Status filter
      if (statusFilter !== 'ALL') {
        if (normalizeStatus(lead.status) !== statusFilter) return false;
      }

      // Owner filter
      if (ownerFilter !== 'ALL') {
        const owner = (lead.assignedAgent || (lead as any).leadOwner || '').trim();
        if (ownerFilter === 'UNASSIGNED' && owner) return false;
        if (ownerFilter !== 'UNASSIGNED' && owner !== ownerFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = String(lead.customerName || '').toLowerCase();
        const phone = String(lead.customerPhone || (lead as any).phone || '').toLowerCase();
        const car = `${lead.carBrand || ''} ${lead.carModel || ''}`.toLowerCase();
        const location = String(lead.streetAddress || (lead as any).location || '').toLowerCase();
        const enquiry = String(lead.requestedService || (lead as any).enquiryType || '').toLowerCase();
        const remarks = String(lead.remarks || '').toLowerCase();
        const action = String((lead as any).actionNotes || (lead as any).action || '').toLowerCase();

        return (
          name.includes(q) ||
          phone.includes(q) ||
          car.includes(q) ||
          location.includes(q) ||
          enquiry.includes(q) ||
          remarks.includes(q) ||
          action.includes(q)
        );
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        const dateA = new Date(a.requestDate || 0).getTime();
        const dateB = new Date(b.requestDate || 0).getTime();
        comparison = dateA - dateB;
      } else if (sortField === 'name') {
        comparison = (a.customerName || '').localeCompare(b.customerName || '');
      } else if (sortField === 'value') {
        comparison = (a.totalAmount || 0) - (b.totalAmount || 0);
      } else if (sortField === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [whatsappLeads, searchQuery, statusFilter, ownerFilter, sortField, sortOrder]);

  // Statistics
  const stats = useMemo(() => {
    const total = whatsappLeads.length;
    const converted = whatsappLeads.filter(l => normalizeStatus(l.status) === 'CONVERTED').length;
    const highIntent = whatsappLeads.filter(l => normalizeStatus(l.status) === 'HIGH INTENT').length;
    const followUp = whatsappLeads.filter(l => normalizeStatus(l.status) === 'FOLLOW UP').length;
    const totalValue = whatsappLeads.reduce((acc, l) => acc + (l.totalAmount || 0), 0);
    const convertedValue = whatsappLeads
      .filter(l => normalizeStatus(l.status) === 'CONVERTED')
      .reduce((acc, l) => acc + (l.totalAmount || 0), 0);
    const convRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    return { total, converted, highIntent, followUp, totalValue, convertedValue, convRate };
  }, [whatsappLeads]);

  const handleStatusChange = async (lead: ServiceRequest, newStatus: string) => {
    if (!onUpdateLead) return;
    const loadToast = toast.loading(`Updating status to ${newStatus}...`);
    try {
      await onUpdateLead({ ...lead, status: newStatus });
      toast.success(`Updated status to ${newStatus}`, { id: loadToast });
    } catch (e) {
      toast.error('Failed to update status', { id: loadToast });
    }
  };

  const handleOwnerChange = async (lead: ServiceRequest, newOwner: string) => {
    if (!onUpdateLead) return;
    const loadToast = toast.loading(`Assigning lead to ${newOwner || 'Unassigned'}...`);
    try {
      await onUpdateLead({ ...lead, assignedAgent: newOwner });
      toast.success(`Lead assigned successfully`, { id: loadToast });
    } catch (e) {
      toast.error('Failed to assign lead', { id: loadToast });
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleDirectWhatsApp = (phone: string, customerName: string) => {
    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone) {
      toast.error('No valid phone number for WhatsApp message');
      return;
    }
    const message = encodeURIComponent(`Hi ${customerName}, thank you for contacting us regarding your car care enquiry. How can we assist you today?`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const getStatusBadge = (status: string) => {
    const norm = normalizeStatus(status);
    switch (norm) {
      case 'CONVERTED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold';
      case 'HIGH INTENT':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      case 'FOLLOW UP':
        return 'bg-sky-100 text-sky-800 border-sky-300 font-semibold';
      case 'CONTACTED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'NOT CONTACTABLE':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Top Stats Overview (Zoho/Salesforce Style Metric Tiles) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Enquiries</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <MessageSquare className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{stats.total}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-0.5">WhatsApp Channel</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">Converted</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{stats.converted}</p>
          <p className="text-[10px] text-emerald-600 font-extrabold mt-0.5">{stats.convRate}% Conversion Rate</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">High Intent / Followup</span>
            <span className="p-1.5 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-amber-800 mt-2">{stats.highIntent + stats.followUp}</p>
          <p className="text-[10px] text-amber-600 font-bold mt-0.5">Warm Opportunities</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">Pipeline Value</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <p className="text-2xl font-black text-indigo-900 mt-2">₹{stats.totalValue.toLocaleString()}</p>
          <p className="text-[10px] text-indigo-600 font-bold mt-0.5">Total Deal Value Quoted</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-900 to-slate-900 text-white rounded-2xl p-4 shadow-sm col-span-2 sm:col-span-4 lg:col-span-1 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">Converted Value</span>
            <span className="text-xs bg-emerald-800/80 text-emerald-200 font-mono px-2 py-0.5 rounded-full font-bold">Closed</span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-emerald-300">₹{stats.convertedValue.toLocaleString()}</p>
            <p className="text-[10px] text-slate-300 font-medium mt-0.5">Realized revenue</p>
          </div>
        </div>
      </div>

      {/* Control & Filter Bar (Clean & Professional CRM Header) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, car, enquiry type, location..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filters & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="ALL">All Stages ({whatsappLeads.length})</option>
              <option value="CREATED">New / Created</option>
              <option value="CONTACTED">Contacted</option>
              <option value="FOLLOW UP">Follow Up</option>
              <option value="HIGH INTENT">High Intent</option>
              <option value="CONVERTED">Converted</option>
              <option value="NOT CONTACTABLE">Not Contactable</option>
            </select>

            {/* Owner Filter */}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="ALL">All Owners</option>
              <option value="UNASSIGNED">Unassigned</option>
              {users.map(u => (
                <option key={u.username} value={u.username}>{u.username}</option>
              ))}
            </select>

            {/* Sync Button */}
            {onSyncWhatsAppLeads && (
              <button
                onClick={() => onSyncWhatsAppLeads('incremental')}
                disabled={isSyncingWhatsAppLeads}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Sync WhatsApp Google Sheet Enquiries"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWhatsAppLeads ? 'animate-spin' : ''}`} />
                <span>{isSyncingWhatsAppLeads ? 'Syncing...' : 'Sync WhatsApp Sheet'}</span>
              </button>
            )}

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Table View
              </button>
              <button
                onClick={() => setViewMode('CARDS')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'CARDS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Cards View
              </button>
            </div>
          </div>
        </div>

        {/* Source Sheet Info Badge */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              WhatsApp Lead Sheet
            </span>
            <span className="font-mono text-slate-600 truncate max-w-xs">
              {whatsAppSheetUrl ? 'Google Sheet Connected' : 'Auto Configured'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastSyncDate && (
              <span>Last Synced: <strong className="text-slate-700">{new Date(lastSyncDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
            )}
            <span>Showing <strong className="text-slate-800">{filteredLeads.length}</strong> of {whatsappLeads.length} enquiries</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {filteredLeads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xs">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h3 className="text-base font-extrabold text-slate-800">No WhatsApp Enquiries Found</h3>
          <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
            {searchQuery || statusFilter !== 'ALL' || ownerFilter !== 'ALL'
              ? 'No enquiries match your current search and filter criteria. Try resetting the filters.'
              : 'Sync your WhatsApp Google Sheet to ingest customer enquiries automatically into this pipeline.'}
          </p>
          {onSyncWhatsAppLeads && (
            <button
              onClick={() => onSyncWhatsAppLeads('full')}
              disabled={isSyncingWhatsAppLeads}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingWhatsAppLeads ? 'animate-spin' : ''}`} />
              Run Full WhatsApp Sheet Sync
            </button>
          )}
        </div>
      ) : viewMode === 'TABLE' ? (
        /* CRM Table View matching exact spreadsheet columns:
           No | Lead Owner | Date | Customer Name | Phone | Car Model | Location | Enquiry Type | Lead Cost | Value | Status | Remarks | Action */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredLeads.length}
                      onChange={handleSelectAll}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-12 text-center">No</th>
                  <th className="py-3 px-3">Lead Owner</th>
                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-slate-800"
                    onClick={() => {
                      if (sortField === 'date') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortField('date'); setSortOrder('desc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Date</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th 
                    className="py-3 px-3 cursor-pointer hover:text-slate-800"
                    onClick={() => {
                      if (sortField === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortField('name'); setSortOrder('asc'); }
                    }}
                  >
                    <div className="flex items-center gap-1">
                      <span>Customer Name</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Phone</th>
                  <th className="py-3 px-3">Car Model</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3">Enquiry Type</th>
                  <th className="py-3 px-3 text-right">Lead Cost</th>
                  <th 
                    className="py-3 px-3 text-right cursor-pointer hover:text-slate-800"
                    onClick={() => {
                      if (sortField === 'value') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortField('value'); setSortOrder('desc'); }
                    }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Value</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 max-w-[150px]">Remarks</th>
                  <th className="py-3 px-3 max-w-[150px]">Action Note</th>
                  <th className="py-3 px-3 text-center">Quick Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredLeads.map((lead, index) => {
                  const isSelected = selectedIds.has(lead.id);
                  const isConverted = normalizeStatus(lead.status) === 'CONVERTED';
                  const leadOwner = lead.assignedAgent || (lead as any).leadOwner || '';
                  const rawCost = (lead as any).leadCost;
                  const formattedCost = rawCost ? (typeof rawCost === 'number' ? `₹${rawCost}` : String(rawCost)) : '—';
                  const rawDate = lead.requestDate;
                  const displayDate = rawDate ? new Date(rawDate).toLocaleDateString() : '—';
                  const actionNote = (lead as any).actionNotes || (lead as any).action || '';

                  return (
                    <tr
                      key={lead.id}
                      className={`hover:bg-emerald-50/40 transition-colors ${
                        isSelected ? 'bg-emerald-50/60' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* No */}
                      <td className="py-3 px-3 text-center font-mono text-slate-400 font-bold">
                        {(lead as any).sheetRowNumber || index + 1}
                      </td>

                      {/* Lead Owner */}
                      <td className="py-3 px-3">
                        <select
                          value={leadOwner}
                          onChange={(e) => handleOwnerChange(lead, e.target.value)}
                          className="bg-transparent hover:bg-white text-[11px] font-bold text-slate-700 py-1 px-1.5 rounded-lg border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                        >
                          <option value="">Unassigned</option>
                          {users.map(u => (
                            <option key={u.username} value={u.username}>{u.username}</option>
                          ))}
                        </select>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 whitespace-nowrap text-slate-600 font-semibold">
                        {displayDate}
                      </td>

                      {/* Customer Name */}
                      <td className="py-3 px-3">
                        <button
                          onClick={() => onOpenTimelineDrawer && onOpenTimelineDrawer(lead)}
                          className="font-bold text-slate-900 hover:text-emerald-700 text-left transition-colors cursor-pointer"
                          title="Open Timeline and Details"
                        >
                          {lead.customerName || 'Inquiry'}
                        </button>
                      </td>

                      {/* Phone + WhatsApp Button */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`tel:${lead.customerPhone || (lead as any).phone || ''}`}
                            className="font-mono text-slate-700 hover:text-indigo-600 font-semibold"
                          >
                            {lead.customerPhone || (lead as any).phone || '—'}
                          </a>
                          {(lead.customerPhone || (lead as any).phone) && (
                            <button
                              onClick={() => handleDirectWhatsApp(lead.customerPhone || (lead as any).phone || '', lead.customerName)}
                              className="p-1 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                              title="Chat on WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5 fill-emerald-600" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Car Model */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {lead.carBrand || lead.carModel ? (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                            <Car className="w-3 h-3 text-slate-500" />
                            {`${lead.carBrand || ''} ${lead.carModel || ''}`.trim()}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {lead.streetAddress || (lead as any).location ? (
                          <span className="inline-flex items-center gap-1 text-slate-600 text-[11px]">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[120px]">{lead.streetAddress || (lead as any).location}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Enquiry Type */}
                      <td className="py-3 px-3">
                        <span className="inline-block bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2 py-0.5 rounded-md border border-indigo-100 truncate max-w-[140px]">
                          {lead.requestedService || (lead as any).enquiryType || 'General Enquiry'}
                        </span>
                      </td>

                      {/* Lead Cost */}
                      <td className="py-3 px-3 text-right text-slate-500 font-mono text-[11px]">
                        {formattedCost}
                      </td>

                      {/* Value (₹) */}
                      <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap">
                        {lead.totalAmount ? (
                          <span className="text-emerald-700 font-bold">₹{lead.totalAmount.toLocaleString()}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">—</span>
                        )}
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <select
                          value={normalizeStatus(lead.status)}
                          onChange={(e) => handleStatusChange(lead, e.target.value)}
                          className={`text-[10px] font-extrabold py-1 px-2 rounded-full border cursor-pointer focus:outline-none transition-all uppercase tracking-wider ${getStatusBadge(lead.status)}`}
                        >
                          <option value="CREATED">CREATED</option>
                          <option value="CONTACTED">CONTACTED</option>
                          <option value="FOLLOW UP">FOLLOW UP</option>
                          <option value="HIGH INTENT">HIGH INTENT</option>
                          <option value="CONVERTED">CONVERTED</option>
                          <option value="NOT CONTACTABLE">NOT CONTACTABLE</option>
                        </select>
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-3 text-slate-600 text-[11px] truncate max-w-[150px]" title={lead.remarks || ''}>
                        {lead.remarks || '—'}
                      </td>

                      {/* Action Note */}
                      <td className="py-3 px-3 text-slate-600 text-[11px] truncate max-w-[150px]" title={actionNote}>
                        {actionNote ? (
                          <span className="inline-block bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                            {actionNote}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Quick Action Buttons */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* 1-Click Convert to Service */}
                          {!isConverted && onOpenConversionWizard && (
                            <button
                              onClick={() => onOpenConversionWizard(lead)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-transform active:scale-90 shadow-2xs"
                              title="Convert to Active Job Booking"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Open Drawer */}
                          <button
                            onClick={() => onOpenTimelineDrawer && onOpenTimelineDrawer(lead)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                            title="View Lifecycle Timeline"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp Modal */}
                          {onOpenWhatsAppModal && (
                            <button
                              onClick={() => onOpenWhatsAppModal(lead)}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
                              title="Template WhatsApp Message"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Responsive Cards Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => {
            const isConverted = normalizeStatus(lead.status) === 'CONVERTED';
            const actionNote = (lead as any).actionNotes || (lead as any).action || '';

            return (
              <div
                key={lead.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase">
                        #{lead.id.slice(-6)} • {lead.requestDate ? new Date(lead.requestDate).toLocaleDateString() : 'New'}
                      </span>
                      <h4 className="text-base font-black text-slate-900 mt-0.5">{lead.customerName}</h4>
                    </div>
                    <span className={`text-[10px] font-extrabold py-0.5 px-2.5 rounded-full border uppercase tracking-wider ${getStatusBadge(lead.status)}`}>
                      {lead.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Phone</p>
                      <a href={`tel:${lead.customerPhone || ''}`} className="font-bold text-slate-800 hover:text-emerald-600 font-mono">
                        {lead.customerPhone || '—'}
                      </a>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Enquiry</p>
                      <p className="font-bold text-indigo-900 truncate">{lead.requestedService || 'General'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Car Model</p>
                      <p className="font-bold text-slate-700 truncate">{`${lead.carBrand || ''} ${lead.carModel || ''}`.trim() || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Deal Value</p>
                      <p className="font-black text-emerald-700">₹{lead.totalAmount?.toLocaleString() || '0'}</p>
                    </div>
                  </div>

                  {lead.remarks && (
                    <div className="mt-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs text-slate-600">
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase">Remarks</p>
                      <p className="font-medium mt-0.5 leading-snug">{lead.remarks}</p>
                    </div>
                  )}

                  {actionNote && (
                    <div className="mt-2 bg-amber-50 p-2 rounded-xl border border-amber-100 text-[11px] text-amber-900 font-semibold">
                      Action: {actionNote}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                  <button
                    onClick={() => handleDirectWhatsApp(lead.customerPhone || '', lead.customerName)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl border border-emerald-200 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    WhatsApp
                  </button>

                  {!isConverted && onOpenConversionWizard && (
                    <button
                      onClick={() => onOpenConversionWizard(lead)}
                      className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Convert
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
