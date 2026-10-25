import React, { useState, useMemo, memo } from 'react';
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
  ArrowRight,
  User,
  Plus,
  Settings,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  ArrowUpDown
} from 'lucide-react';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import {
  calculateLeadScore,
  calculateLeadSla,
  normalizePhoneNumber
} from './leadUtils';
import { LeadActionMenu } from './LeadActionMenu';

interface LeadKanbanCardProps {
  lead: ServiceRequest;
  stage: string;
  isSelected: boolean;
  activeHubs: DeliveryHub[];
  getLeadHubDistanceInfo: (lead: ServiceRequest, hubs: DeliveryHub[]) => { hubName: string; distanceKm: number } | null;
  onDragStart: (e: React.DragEvent, lead: ServiceRequest) => void;
  onToggleSelectLead: (leadId: string) => void;
  onSelectLead: (lead: ServiceRequest) => void;
  onOpenWhatsAppModal: (lead: ServiceRequest) => void;
  onCallLead?: (lead: ServiceRequest) => void;
  onConvertLead?: (leadId: string) => void;
  onSnoozeLead?: (lead: ServiceRequest) => void;
  onAddNoteLead?: (lead: ServiceRequest) => void;
}

const LeadKanbanCard = memo<LeadKanbanCardProps>(({
  lead,
  stage,
  isSelected,
  activeHubs,
  getLeadHubDistanceInfo,
  onDragStart,
  onToggleSelectLead,
  onSelectLead,
  onOpenWhatsAppModal,
  onCallLead,
  onConvertLead,
  onSnoozeLead,
  onAddNoteLead
}) => {
  const scoreInfo = useMemo(() => calculateLeadScore(lead), [lead]);
  const slaInfo = useMemo(() => calculateLeadSla(lead), [lead.requestDate, lead.status]);
  const distInfo = useMemo(() => getLeadHubDistanceInfo(lead, activeHubs), [lead, activeHubs, getLeadHubDistanceInfo]);
  const cleanPhone = useMemo(() => normalizePhoneNumber(lead.customerPhone || (lead as any).mobileNumber), [lead.customerPhone, (lead as any).mobileNumber]);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      className={`bg-white rounded-2xl p-3.5 border transition-all duration-150 shadow-2xs hover:shadow-md cursor-grab active:cursor-grabbing space-y-2.5 relative group ${
        isSelected
          ? 'border-indigo-500 ring-2 ring-indigo-400 bg-indigo-50/20'
          : 'border-slate-200/80 hover:border-indigo-300'
      }`}
    >
      {/* Top Badges: Checkbox, Score Tier, SLA Timer */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelectLead(lead.id)}
            className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
          />
          {/* Score Tier Badge */}
          {scoreInfo.tier === 'HOT' && (
            <span
              className="px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[9px] font-black flex items-center gap-0.5"
              title={`Lead Score: ${scoreInfo.score}/100 • ${scoreInfo.reasons.join(', ')}`}
            >
              <Flame className="w-2.5 h-2.5 text-rose-500 fill-rose-500" />
              <span>HOT</span>
            </span>
          )}
          {scoreInfo.tier === 'WARM' && (
            <span
              className="px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[9px] font-black flex items-center gap-0.5"
              title={`Lead Score: ${scoreInfo.score}/100 • ${scoreInfo.reasons.join(', ')}`}
            >
              <Zap className="w-2.5 h-2.5 text-amber-500" />
              <span>WARM</span>
            </span>
          )}
        </div>

        {/* SLA Timer Badge */}
        {stage === 'CREATED' && (
          <span
            className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-1 font-mono ${
              slaInfo.status === 'RED'
                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                : slaInfo.status === 'YELLOW'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
            title={`Time since ingestion: ${slaInfo.elapsedMinutes} mins`}
          >
            <Clock className="w-2.5 h-2.5" />
            <span>{slaInfo.label}</span>
          </span>
        )}
      </div>

      {/* Customer Name & Estimated Value */}
      <div className="flex items-start justify-between gap-1.5">
        <button
          onClick={() => onSelectLead(lead)}
          className="text-left font-black text-xs text-slate-900 hover:text-indigo-600 transition-colors leading-tight line-clamp-1 cursor-pointer"
        >
          {lead.customerName}
        </button>
        <span className="font-mono font-black text-xs text-slate-900 shrink-0">
          {lead.totalAmount ? `₹${lead.totalAmount.toLocaleString()}` : '—'}
        </span>
      </div>

      {/* Service Interested In */}
      <div className="text-[11px] text-slate-600 font-semibold flex items-center gap-1 line-clamp-1">
        <Sparkles className="w-3 h-3 text-indigo-500 shrink-0" />
        <span className="truncate">{lead.requestedService || 'General Car Care'}</span>
      </div>

      {/* Vehicle & Reg Badge */}
      {(lead.carBrand || lead.carModel || lead.carRegNo) && (
        <div className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-200/80 px-2 py-1 rounded-lg">
          <span className="font-bold text-slate-700 truncate flex items-center gap-1">
            <Car className="w-3 h-3 text-slate-400" />
            {[lead.carBrand, lead.carModel].filter(Boolean).join(' ') || 'Vehicle'}
          </span>
          {lead.carRegNo && (
            <span className="font-mono font-extrabold text-slate-900 bg-white px-1 py-0.2 rounded border border-slate-200">
              {lead.carRegNo}
            </span>
          )}
        </div>
      )}

      {/* Nearest Hub Distance Badge */}
      {distInfo && (
        <div className="flex items-center justify-between text-[9px] font-bold text-indigo-900 bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 rounded-lg">
          <span className="flex items-center gap-1 truncate">
            <Navigation className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
            <span>{distInfo.hubName}</span>
          </span>
          <span className="font-extrabold font-mono">{distInfo.distanceKm.toFixed(1)} km</span>
        </div>
      )}

      {/* Remarks note snippet */}
      {lead.remarks && (
        <p className="text-[10px] text-slate-500 bg-slate-50/80 p-1.5 rounded-lg border border-slate-100 italic line-clamp-2">
          "{lead.remarks}"
        </p>
      )}

      {/* Source Tag & Assigned Agent */}
      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold pt-1 border-t border-slate-100">
        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-extrabold uppercase">
          {lead.source || lead.leadSource || 'Meta'}
        </span>
        <span className="text-slate-500 flex items-center gap-1 truncate max-w-[90px]">
          <User className="w-2.5 h-2.5 text-slate-400" />
          {lead.assignedAgent || 'Unassigned'}
        </span>
      </div>

      {/* 1-Click Omnichannel Action Footer */}
      <div className="pt-2 flex items-center justify-between gap-1 border-t border-slate-100/90">
        <div className="flex items-center gap-1">
          {/* Direct Phone Call */}
          {cleanPhone && (
            <a
              href={`tel:${cleanPhone}`}
              className="p-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
              title={`Call ${cleanPhone}`}
            >
              <Phone className="w-3 h-3" />
            </a>
          )}

          {/* WhatsApp Direct Chat */}
          {cleanPhone && (
            <button
              onClick={() => onOpenWhatsAppModal(lead)}
              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors cursor-pointer"
              title="Open WhatsApp template outreach"
            >
              <MessageSquare className="w-3 h-3 fill-emerald-600" />
            </button>
          )}

          {/* Details Modal */}
          <button
            onClick={() => onSelectLead(lead)}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors cursor-pointer"
            title="Open lead drawer & full lifecycle timeline"
          >
            <Settings className="w-3 h-3" />
          </button>

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

        {/* 1-Click Convert to Order */}
        {stage !== 'CONVERTED' && onConvertLead && (
          <button
            onClick={() => onConvertLead(lead.id)}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer uppercase tracking-wider"
            title="Convert lead into scheduled service order"
          >
            <Plus className="w-2.5 h-2.5" />
            <span>Convert</span>
          </button>
        )}
      </div>
    </div>
  );
});

LeadKanbanCard.displayName = 'LeadKanbanCard';

interface LeadKanbanBoardProps {
  stages: string[];
  leads: ServiceRequest[];
  onStatusChange: (lead: ServiceRequest, newStatus: string) => void;
  onSelectLead: (lead: ServiceRequest) => void;
  onConvertLead?: (leadId: string) => void;
  onOpenWhatsAppModal: (lead: ServiceRequest) => void;
  onSnoozeLead?: (lead: ServiceRequest) => void;
  onAddNoteLead?: (lead: ServiceRequest) => void;
  onCallLead?: (lead: ServiceRequest) => void;
  selectedLeadIds: string[];
  onToggleSelectLead: (leadId: string) => void;
  activeHubs: DeliveryHub[];
  getLeadHubDistanceInfo: (lead: ServiceRequest, hubs: DeliveryHub[]) => { hubName: string; distanceKm: number } | null;
  getStageColorClasses: (stage: string) => string;
  users: UserType[];
}

export const LeadKanbanBoard: React.FC<LeadKanbanBoardProps> = ({
  stages,
  leads,
  onStatusChange,
  onSelectLead,
  onConvertLead,
  onOpenWhatsAppModal,
  onSnoozeLead,
  onAddNoteLead,
  onCallLead,
  selectedLeadIds,
  onToggleSelectLead,
  activeHubs,
  getLeadHubDistanceInfo,
  getStageColorClasses,
  users
}) => {
  const [draggedLead, setDraggedLead] = useState<ServiceRequest | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [columnSortOrder, setColumnSortOrder] = useState<Record<string, 'NEWEST' | 'VALUE' | 'SLA' | 'NAME'>>({});
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({});
  const [visiblePerColumn, setVisiblePerColumn] = useState<Record<string, number>>({});

  const INITIAL_PAGE_SIZE = 25;

  // Group leads by stage
  const groupedLeads = useMemo(() => {
    const map: Record<string, ServiceRequest[]> = {};
    stages.forEach(stage => {
      map[stage] = [];
    });

    leads.forEach(lead => {
      const rawStatus = (lead.status || 'CREATED').toUpperCase();
      let matchedStage = stages.find(s => s.toUpperCase() === rawStatus);
      if (!matchedStage) {
        if (rawStatus.includes('CONTACT') && !rawStatus.includes('NOT')) matchedStage = 'CONTACTED';
        else if (rawStatus.includes('FOLLOW')) matchedStage = 'FOLLOW UP';
        else if (rawStatus.includes('HIGH') || rawStatus.includes('INTENT')) matchedStage = 'HIGH INTENT';
        else if (rawStatus.includes('CONVERT') || rawStatus.includes('BOOKED')) matchedStage = 'CONVERTED';
        else if (rawStatus.includes('NOT') || rawStatus.includes('LOST')) matchedStage = 'NOT CONTACTABLE';
        else matchedStage = 'CREATED';
      }
      if (map[matchedStage]) {
        map[matchedStage].push(lead);
      } else {
        map['CREATED'].push(lead);
      }
    });

    // Apply column sorting
    Object.keys(map).forEach(stage => {
      const sortType = columnSortOrder[stage] || 'NEWEST';
      map[stage].sort((a, b) => {
        if (sortType === 'VALUE') {
          return (b.totalAmount || 0) - (a.totalAmount || 0);
        } else if (sortType === 'SLA') {
          const slaA = calculateLeadSla(a).elapsedMinutes;
          const slaB = calculateLeadSla(b).elapsedMinutes;
          return slaB - slaA;
        } else if (sortType === 'NAME') {
          return (a.customerName || '').localeCompare(b.customerName || '');
        } else {
          // Default NEWEST
          return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
        }
      });
    });

    return map;
  }, [leads, stages, columnSortOrder]);

  // Total Leads in pipeline for conversion rate calculation
  const totalLeadsCount = leads.length || 1;

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent, lead: ServiceRequest) => {
    setDraggedLead(lead);
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (draggedLead && draggedLead.status !== targetStage) {
      onStatusChange(draggedLead, targetStage);
    }
    setDraggedLead(null);
  };

  const toggleColumnSort = (stage: string) => {
    setColumnSortOrder(prev => {
      const current = prev[stage] || 'NEWEST';
      let next: 'NEWEST' | 'VALUE' | 'SLA' | 'NAME' = 'VALUE';
      if (current === 'NEWEST') next = 'VALUE';
      else if (current === 'VALUE') next = 'SLA';
      else if (current === 'SLA') next = 'NAME';
      else next = 'NEWEST';
      return { ...prev, [stage]: next };
    });
  };

  const toggleColumnCollapse = (stage: string) => {
    setCollapsedColumns(prev => ({ ...prev, [stage]: !prev[stage] }));
  };

  const handleShowMoreLeads = (stage: string) => {
    setVisiblePerColumn(prev => ({
      ...prev,
      [stage]: (prev[stage] || INITIAL_PAGE_SIZE) + INITIAL_PAGE_SIZE
    }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start pb-16">
      {stages.map((stage) => {
        const stageLeads = groupedLeads[stage] || [];
        const stageValue = stageLeads.reduce((sum, l) => sum + (l.totalAmount || 0), 0);
        const stageConversionPct = Math.round((stageLeads.length / totalLeadsCount) * 100);
        const isDragTarget = dragOverStage === stage;
        const isCollapsed = collapsedColumns[stage];
        const currentSort = columnSortOrder[stage] || 'NEWEST';
        const visibleLimit = visiblePerColumn[stage] || INITIAL_PAGE_SIZE;
        const visibleLeads = stageLeads.slice(0, visibleLimit);
        const hasMoreInColumn = stageLeads.length > visibleLimit;

        return (
          <div
            key={stage}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage)}
            className={`flex flex-col rounded-2xl transition-all duration-200 border ${
              isDragTarget
                ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-400 shadow-xl'
                : 'bg-slate-100/70 border-slate-200/90'
            }`}
          >
            {/* Column Header */}
            <div className="p-3 bg-white/90 rounded-t-2xl border-b border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => toggleColumnCollapse(stage)}
                    className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
                  >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <h3 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider truncate">
                    {stage}
                  </h3>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Count Pill */}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStageColorClasses(stage)}`}>
                    {stageLeads.length}
                  </span>

                  {/* Sort button */}
                  <button
                    onClick={() => toggleColumnSort(stage)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                    title={`Sort: ${currentSort} (Click to cycle)`}
                  >
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Column Metrics: Total Value & Conversion % */}
              {!isCollapsed && (
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold pt-1 border-t border-slate-100">
                  <span>₹{stageValue.toLocaleString()}</span>
                  <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                    {stageConversionPct}% of total
                  </span>
                </div>
              )}
            </div>

            {/* Column Body / Cards List */}
            {!isCollapsed && (
              <div className="p-2 space-y-2.5 min-h-[500px] max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
                {stageLeads.length === 0 ? (
                  <div className="h-36 border-2 border-dashed border-slate-300/80 rounded-xl flex flex-col items-center justify-center p-4 text-center text-slate-400">
                    <p className="text-[11px] font-bold">No leads in {stage}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Drag and drop leads here</p>
                  </div>
                ) : (
                  <>
                    {visibleLeads.map((lead) => (
                      <LeadKanbanCard
                        key={lead.id}
                        lead={lead}
                        stage={stage}
                        isSelected={selectedLeadIds.includes(lead.id)}
                        activeHubs={activeHubs}
                        getLeadHubDistanceInfo={getLeadHubDistanceInfo}
                        onDragStart={handleDragStart}
                        onToggleSelectLead={onToggleSelectLead}
                        onSelectLead={onSelectLead}
                        onOpenWhatsAppModal={onOpenWhatsAppModal}
                        onCallLead={onCallLead}
                        onConvertLead={onConvertLead}
                        onSnoozeLead={onSnoozeLead}
                        onAddNoteLead={onAddNoteLead}
                      />
                    ))}

                    {hasMoreInColumn && (
                      <button
                        onClick={() => handleShowMoreLeads(stage)}
                        className="w-full py-2 bg-white/80 hover:bg-white text-indigo-600 font-bold text-xs rounded-xl border border-indigo-100 shadow-2xs hover:shadow transition-all text-center cursor-pointer"
                      >
                        Show More ({stageLeads.length - visibleLimit} remaining)
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
