import React, { useState } from 'react';
import {
  X,
  Phone,
  MessageSquare,
  Sparkles,
  Car,
  Clock,
  MapPin,
  Navigation,
  Flame,
  Zap,
  CheckCircle2,
  Calendar,
  Send,
  Plus,
  User,
  Tag,
  ShieldCheck,
  Building2,
  ExternalLink,
  History,
  FileText,
  AlertCircle
} from 'lucide-react';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import {
  calculateLeadScore,
  calculateLeadSla,
  normalizePhoneNumber,
  buildWhatsAppUrl,
  buildSmsText,
  CALL_DISPOSITIONS,
  LeadActivityLog,
  LeadScoreInfo,
  LeadSlaInfo,
  findNearestHubForLead
} from './leadUtils';

interface LeadTimelineDrawerProps {
  lead: ServiceRequest | null;
  allLeads: ServiceRequest[];
  onClose: () => void;
  onUpdateLead: (updatedLead: ServiceRequest) => void;
  onOpenConvertWizard: (lead: ServiceRequest) => void;
  onOpenWhatsAppModal: (lead: ServiceRequest) => void;
  stages: string[];
  activeHubs: DeliveryHub[];
  users: UserType[];
  currentUser?: string;
}

export const LeadTimelineDrawer: React.FC<LeadTimelineDrawerProps> = ({
  lead,
  allLeads,
  onClose,
  onUpdateLead,
  onOpenConvertWizard,
  onOpenWhatsAppModal,
  stages,
  activeHubs,
  users,
  currentUser = 'Admin'
}) => {
  const [activeTab, setActiveTab] = useState<'TIMELINE' | 'COMMUNICATION' | 'DETAILS'>('TIMELINE');
  const [newNote, setNewNote] = useState('');
  const [selectedDisposition, setSelectedDisposition] = useState('INTERESTED');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSuccessMessage, setSmsSuccessMessage] = useState<string | null>(null);

  const cleanPhone = normalizePhoneNumber(lead?.customerPhone || (lead as any)?.mobileNumber);
  const scoreInfo: LeadScoreInfo = lead ? calculateLeadScore(lead, allLeads) : { score: 0, tier: 'NORMAL', reasons: [] };
  const slaInfo: LeadSlaInfo = lead ? calculateLeadSla(lead) : { elapsedMinutes: 0, isOverdue: false, status: 'GREEN', label: 'On Time' };
  const nearestHubInfo = lead ? findNearestHubForLead(lead, activeHubs) : { hub: null, distanceKm: 0 };

  // Parse existing activity logs from lead metadata / remarks
  const activityLogs: LeadActivityLog[] = React.useMemo(() => {
    if (!lead) return [];
    if ((lead as any).activityLogs && Array.isArray((lead as any).activityLogs)) {
      return (lead as any).activityLogs;
    }
    // Generate initial history timeline from creation & remarks
    const logs: LeadActivityLog[] = [];
    if (lead.requestDate) {
      logs.push({
        id: 'initial_creation',
        timestamp: lead.requestDate,
        actor: lead.source || 'Website Lead Capture',
        action: 'STATUS_CHANGE',
        details: `Inquiry received via ${lead.source || 'Meta Ad Campaign'}`
      });
    }
    if (lead.remarks) {
      logs.push({
        id: 'initial_remark',
        timestamp: lead.requestDate || new Date().toISOString(),
        actor: 'Customer / System',
        action: 'NOTE_ADDED',
        details: lead.remarks
      });
    }
    return logs;
  }, [lead]);

  if (!lead) return null;

  const handleAddNoteAndDisposition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() && !selectedDisposition) return;

    const dispObj = CALL_DISPOSITIONS.find(d => d.id === selectedDisposition);
    const logItem: LeadActivityLog = {
      id: `act_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser,
      action: 'CALL_ATTEMPT',
      disposition: dispObj?.label || selectedDisposition,
      details: newNote.trim() || `Marked disposition as ${dispObj?.label}`
    };

    const updatedLogs = [logItem, ...activityLogs];

    // If disposition indicates hot or reschedule, update lead remarks/stage accordingly
    let updatedStatus = lead.status;
    if (selectedDisposition === 'INTERESTED') {
      updatedStatus = 'HIGH INTENT';
    } else if (selectedDisposition === 'RESCHEDULED' || selectedDisposition === 'CALLBACK_REQUESTED') {
      updatedStatus = 'FOLLOW UP';
    } else if (selectedDisposition === 'NOT_REACHABLE') {
      updatedStatus = 'NOT CONTACTABLE';
    }

    const updatedLead: ServiceRequest = {
      ...lead,
      status: updatedStatus,
      remarks: newNote.trim() ? `${lead.remarks ? lead.remarks + ' | ' : ''}[${dispObj?.label}]: ${newNote.trim()}` : lead.remarks,
      ...({ activityLogs: updatedLogs } as any)
    };

    onUpdateLead(updatedLead);
    setNewNote('');
  };

  const handleQuickStatusChange = (newStatus: string) => {
    const logItem: LeadActivityLog = {
      id: `act_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser,
      action: 'STATUS_CHANGE',
      details: `Pipeline stage updated from ${lead.status || 'CREATED'} to ${newStatus}`
    };

    const updatedLogs = [logItem, ...activityLogs];
    const updatedLead: ServiceRequest = {
      ...lead,
      status: newStatus,
      ...({ activityLogs: updatedLogs } as any)
    };
    onUpdateLead(updatedLead);
  };

  const handleAssignAgent = (agent: string) => {
    const logItem: LeadActivityLog = {
      id: `act_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser,
      action: 'ASSIGNED',
      details: `Lead assigned to sales agent @${agent || 'Unassigned'}`
    };

    const updatedLogs = [logItem, ...activityLogs];
    const updatedLead: ServiceRequest = {
      ...lead,
      assignedAgent: agent,
      ...({ activityLogs: updatedLogs } as any)
    };
    onUpdateLead(updatedLead);
  };

  const handleSendQuickSms = (template: 'GREETING' | 'QUOTE' | 'SCHEDULE' | 'CONFIRMATION') => {
    setIsSendingSms(true);
    const smsText = buildSmsText(template, lead);

    // Simulate MSG91 SMS dispatch and record log
    setTimeout(() => {
      setIsSendingSms(false);
      setSmsSuccessMessage(`SMS triggered successfully to +91 ${cleanPhone}`);
      setTimeout(() => setSmsSuccessMessage(null), 4000);

      const logItem: LeadActivityLog = {
        id: `act_${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor: currentUser,
        action: 'SMS_SENT',
        details: `MSG91 SMS sent (${template}): "${smsText}"`
      };

      const updatedLogs = [logItem, ...activityLogs];
      const updatedLead: ServiceRequest = {
        ...lead,
        ...({ activityLogs: updatedLogs } as any)
      };
      onUpdateLead(updatedLead);
    }, 600);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-slideLeft">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900 leading-tight">
              {lead.customerName || 'Inquiry Profile'}
            </h2>
            {scoreInfo.tier === 'HOT' && (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black flex items-center gap-1 border border-rose-200">
                <Flame className="w-3 h-3 fill-rose-600 text-rose-600" />
                HOT ({scoreInfo.score}/100)
              </span>
            )}
            {scoreInfo.tier === 'WARM' && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black flex items-center gap-1 border border-amber-200">
                <Zap className="w-3 h-3 text-amber-600" />
                WARM ({scoreInfo.score}/100)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            ID: <span className="font-mono text-slate-700">{lead.id}</span> • Ingested:{' '}
            {lead.requestDate ? new Date(lead.requestDate).toLocaleString() : 'Just now'}
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Action Top Bar: Call / WhatsApp / Convert */}
      <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cleanPhone && (
            <a
              href={`tel:${cleanPhone}`}
              className="px-3 py-2 bg-white hover:bg-indigo-600 hover:text-white text-indigo-700 font-extrabold rounded-xl text-xs border border-indigo-200 shadow-2xs flex items-center gap-1.5 transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Call (+91 {cleanPhone})</span>
            </a>
          )}

          {cleanPhone && (
            <button
              onClick={() => onOpenWhatsAppModal(lead)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 fill-white" />
              <span>WhatsApp Chat</span>
            </button>
          )}
        </div>

        {/* 1-Click Convert to Order Button */}
        {lead.status !== 'CONVERTED' && (
          <button
            onClick={() => onOpenConvertWizard(lead)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Convert to Order</span>
          </button>
        )}
      </div>

      {/* SLA & Nearest Hub Banner */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
        {/* SLA Status */}
        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-black text-slate-400 block">SLA Response Status</span>
            <span className={`text-xs font-black ${slaInfo.status === 'RED' ? 'text-rose-600' : 'text-slate-800'}`}>
              {slaInfo.label}
            </span>
          </div>
        </div>

        {/* Nearest Hub */}
        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <Navigation className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-black text-slate-400 block">Assigned / Nearest Hub</span>
            <span className="text-xs font-extrabold text-slate-800 truncate block">
              {nearestHubInfo ? `${nearestHubInfo.hub.name} (${nearestHubInfo.distanceKm.toFixed(1)} km)` : 'Central Hub'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white">
        <button
          onClick={() => setActiveTab('TIMELINE')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'TIMELINE'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Timeline & Notes ({activityLogs.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('COMMUNICATION')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'COMMUNICATION'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Omnichannel Outreach</span>
        </button>
        <button
          onClick={() => setActiveTab('DETAILS')}
          className={`flex-1 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === 'DETAILS'
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/20'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Vehicle & Meta</span>
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* TAB 1: TIMELINE & CALL DISPOSITIONS */}
        {activeTab === 'TIMELINE' && (
          <div className="space-y-6">
            {/* Quick Disposition & Note Logger Form */}
            <form
              onSubmit={handleAddNoteAndDisposition}
              className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  Log Call Disposition & Agent Note
                </span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Log as @{currentUser}</span>
              </div>

              {/* Disposition Selector Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CALL_DISPOSITIONS.map(disp => (
                  <button
                    key={disp.id}
                    type="button"
                    onClick={() => setSelectedDisposition(disp.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-left text-[11px] font-extrabold border transition-all cursor-pointer ${
                      selectedDisposition === disp.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {disp.label}
                  </button>
                ))}
              </div>

              {/* Note Textarea */}
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Type customer call notes, quote details, customer objection or follow-up preferences..."
                rows={2}
                className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Log Activity</span>
                </button>
              </div>
            </form>

            {/* Pipeline Stage & Agent Quick Changer */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Change Pipeline Stage</label>
                <select
                  value={lead.status || 'CREATED'}
                  onChange={e => handleQuickStatusChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  {stages.map(stage => (
                    <option key={stage} value={stage}>
                      → {stage}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-400">Assign Sales Agent</label>
                <select
                  value={lead.assignedAgent || ''}
                  onChange={e => handleAssignAgent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {users.map(u => (
                    <option key={u.username} value={u.username}>
                      👤 {u.username}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Timeline Stream */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Activity History Log</h4>
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {activityLogs.map((log, idx) => (
                  <div key={log.id + idx} className="relative group">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-indigo-50 border-2 border-indigo-600 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                      •
                    </div>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 uppercase">
                            {log.action}
                          </span>
                          {log.disposition && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                              {log.disposition}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-800">@{log.actor}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} •{' '}
                          {new Date(log.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{log.details}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OMNICHANNEL OUTREACH */}
        {activeTab === 'COMMUNICATION' && (
          <div className="space-y-5">
            {smsSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{smsSuccessMessage}</span>
              </div>
            )}

            {/* WhatsApp Templates */}
            <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                  Instant WhatsApp Message Dispatcher
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  1-Click wa.me
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['GREETING', 'QUOTE', 'SCHEDULE', 'CONFIRMATION'] as const).map(tmpl => {
                  const url = buildWhatsAppUrl(cleanPhone, tmpl, lead);
                  return (
                    <a
                      key={tmpl}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 bg-white hover:bg-emerald-600 hover:text-white rounded-xl border border-emerald-200 text-xs font-bold text-slate-800 transition-all flex items-center justify-between shadow-2xs group"
                    >
                      <div className="space-y-0.5 text-left">
                        <span className="block text-[11px] font-black uppercase text-emerald-700 group-hover:text-emerald-100">
                          {tmpl} Template
                        </span>
                        <span className="text-[10px] text-slate-500 group-hover:text-white line-clamp-1">
                          Click to open WhatsApp
                        </span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white" />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* SMS / MSG91 Triggers */}
            <div className="bg-sky-50/60 border border-sky-200/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-sky-900 flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-sky-600" />
                  MSG91 SMS Gateway Dispatcher
                </span>
                <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                  DLT Approved SMS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(['GREETING', 'QUOTE', 'SCHEDULE', 'CONFIRMATION'] as const).map(tmpl => (
                  <button
                    key={tmpl}
                    disabled={isSendingSms}
                    onClick={() => handleSendQuickSms(tmpl)}
                    className="p-3 bg-white hover:bg-sky-600 hover:text-white rounded-xl border border-sky-200 text-xs font-bold text-slate-800 transition-all flex items-center justify-between shadow-2xs cursor-pointer group text-left"
                  >
                    <div className="space-y-0.5">
                      <span className="block text-[11px] font-black uppercase text-sky-700 group-hover:text-sky-100">
                        Send {tmpl} SMS
                      </span>
                      <span className="text-[10px] text-slate-500 group-hover:text-white line-clamp-1">
                        Dispatch via MSG91 API
                      </span>
                    </div>
                    <Send className="w-3.5 h-3.5 text-sky-600 group-hover:text-white" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DETAILS & VEHICLE INFO */}
        {activeTab === 'DETAILS' && (
          <div className="space-y-4">
            {/* Score Factors */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Automated Score Breakdown ({scoreInfo.score}/100)
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-600">
                {scoreInfo.reasons.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Vehicle & Customer Table */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
              <h4 className="font-black text-slate-800 uppercase tracking-wider">Customer & Vehicle Data</h4>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Phone Number</span>
                  <span className="font-mono font-bold text-slate-900">+91 {cleanPhone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Requested Service</span>
                  <span className="font-bold text-slate-900">{lead.requestedService || 'General Inquiry'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Vehicle Brand & Model</span>
                  <span className="font-bold text-slate-900">
                    {[lead.carBrand, lead.carModel].filter(Boolean).join(' ') || 'Not specified'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Registration Plate</span>
                  <span className="font-mono font-bold text-slate-900">{lead.carRegNo || 'Not provided'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Service Address</span>
                  <span className="font-medium text-slate-800">{lead.streetAddress || 'No address provided'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Lead Source / Campaign</span>
                  <span className="font-medium text-slate-800">
                    {lead.source || lead.leadSource || 'Meta Ads'} • {lead.campaignName || 'General Organic'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-100 transition-colors"
        >
          Close Drawer
        </button>

        {lead.status !== 'CONVERTED' && (
          <button
            onClick={() => onOpenConvertWizard(lead)}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Open Conversion Wizard</span>
          </button>
        )}
      </div>
    </div>
  );
};
