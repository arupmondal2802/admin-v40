import React from 'react';
import {
  Globe,
  Flame,
  Layers,
  Search,
  Filter,
  X,
  Sparkles,
  TrendingUp,
  Share2,
  PhoneCall
} from 'lucide-react';
import { ServiceRequest } from '../../../types';

interface LeadCampaignFilterBarProps {
  leads: ServiceRequest[];
  selectedSource: string;
  onSelectSource: (source: string) => void;
  selectedSubsheet: string;
  onSelectSubsheet: (tab: string) => void;
  availableSubsheets: string[];
  selectedTier: 'ALL' | 'HOT' | 'WARM';
  onSelectTier: (tier: 'ALL' | 'HOT' | 'WARM') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  assignedAgentFilter: string;
  onAssignedAgentChange: (agent: string) => void;
  availableAgents: string[];
  onResetFilters: () => void;
}

export const LeadCampaignFilterBar: React.FC<LeadCampaignFilterBarProps> = ({
  leads,
  selectedSource,
  onSelectSource,
  selectedSubsheet,
  onSelectSubsheet,
  availableSubsheets,
  selectedTier,
  onSelectTier,
  searchQuery,
  onSearchChange,
  assignedAgentFilter,
  onAssignedAgentChange,
  availableAgents,
  onResetFilters
}) => {
  // Compute counts per source channel
  const sourceStats = React.useMemo(() => {
    const stats: Record<string, { count: number; totalValue: number }> = {
      ALL: { count: leads.length, totalValue: leads.reduce((acc, l) => acc + (l.totalAmount || 0), 0) },
      Meta: { count: 0, totalValue: 0 },
      WhatsApp: { count: 0, totalValue: 0 },
      Website: { count: 0, totalValue: 0 },
      'Google Ads': { count: 0, totalValue: 0 },
      Organic: { count: 0, totalValue: 0 },
      Referral: { count: 0, totalValue: 0 },
      Manual: { count: 0, totalValue: 0 }
    };

    leads.forEach(l => {
      const src = l.source || l.leadSource || 'Manual';
      let key = 'Manual';
      if (src.toLowerCase().includes('meta') || src.toLowerCase().includes('fb') || src.toLowerCase().includes('instagram')) key = 'Meta';
      else if (src.toLowerCase().includes('whatsapp') || src.toLowerCase().includes('wa')) key = 'WhatsApp';
      else if (src.toLowerCase().includes('web') || src.toLowerCase().includes('storefront')) key = 'Website';
      else if (src.toLowerCase().includes('google') || src.toLowerCase().includes('adwords')) key = 'Google Ads';
      else if (src.toLowerCase().includes('organic')) key = 'Organic';
      else if (src.toLowerCase().includes('referral') || src.toLowerCase().includes('ref')) key = 'Referral';

      if (!stats[key]) stats[key] = { count: 0, totalValue: 0 };
      stats[key].count += 1;
      stats[key].totalValue += (l.totalAmount || 0);
    });

    return stats;
  }, [leads]);

  // Compute Hot vs Warm count
  const hotLeadsCount = React.useMemo(() => {
    return leads.filter(l => (l.totalAmount && l.totalAmount >= 2500) || (l.status === 'HIGH INTENT')).length;
  }, [leads]);

  const hasActiveFilters =
    selectedSource !== 'ALL' ||
    selectedSubsheet !== 'ALL' ||
    selectedTier !== 'ALL' ||
    searchQuery.trim().length > 0 ||
    assignedAgentFilter !== 'ALL';

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3.5 mb-6">
      {/* Top Row: Search input + Agent Filter + Hot Leads Filter */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search leads by customer name, phone, car model, reg plate, campaign..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Right Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority Tier Filter */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 text-xs">
            <button
              onClick={() => onSelectTier('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                selectedTier === 'ALL'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All Tiers
            </button>
            <button
              onClick={() => onSelectTier('HOT')}
              className={`px-2.5 py-1 rounded-lg font-extrabold flex items-center gap-1 transition-all ${
                selectedTier === 'HOT'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Hot ({hotLeadsCount})</span>
            </button>
          </div>

          {/* Assigned Agent Filter */}
          <div className="relative">
            <select
              value={assignedAgentFilter}
              onChange={(e) => onAssignedAgentChange(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
            >
              <option value="ALL">All Agents</option>
              <option value="UNASSIGNED">Unassigned</option>
              {availableAgents.map(agent => (
                <option key={agent} value={agent}>Agent: {agent}</option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          {hasActiveFilters && (
            <button
              onClick={onResetFilters}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
              title="Reset all filters"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Channels / UTM Ingestion Source Pills */}
      <div className="pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1 mr-1">
          <Globe className="w-3.5 h-3.5 text-indigo-500" /> Source:
        </span>

        {[
          { id: 'ALL', label: 'All Ingestion Channels', count: sourceStats.ALL?.count || 0 },
          { id: 'Meta', label: 'Meta Ads (FB/IG)', count: sourceStats.Meta?.count || 0 },
          { id: 'WhatsApp', label: 'WhatsApp Enquiries', count: sourceStats.WhatsApp?.count || 0 },
          { id: 'Website', label: 'Storefront Orders', count: sourceStats.Website?.count || 0 },
          { id: 'Google Ads', label: 'Google Search', count: sourceStats['Google Ads']?.count || 0 },
          { id: 'Organic', label: 'Organic Inbound', count: sourceStats.Organic?.count || 0 },
          { id: 'Referral', label: 'Referral', count: sourceStats.Referral?.count || 0 },
          { id: 'Manual', label: 'Manual Phone Inquiries', count: sourceStats.Manual?.count || 0 }
        ].map((src) => {
          const isSelected = selectedSource.toLowerCase() === src.id.toLowerCase();
          return (
            <button
              key={src.id}
              onClick={() => onSelectSource(src.id)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 border cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs scale-102'
                  : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span>{src.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-black ${
                  isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {src.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subsheet Tab Pills (if multiple sheets exist) */}
      {availableSubsheets.length > 0 && (
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5 text-amber-500" /> Subsheet Tab:
          </span>

          <button
            onClick={() => onSelectSubsheet('ALL')}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
              selectedSubsheet === 'ALL'
                ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                : 'bg-amber-50/70 text-amber-900 border-amber-200/60 hover:bg-amber-100'
            }`}
          >
            All Subsheets ({leads.length})
          </button>

          {availableSubsheets.map(tab => {
            const isSelected = selectedSubsheet.toLowerCase() === tab.toLowerCase();
            const count = leads.filter(l => (l.subsheetName || '').toLowerCase() === tab.toLowerCase()).length;
            return (
              <button
                key={tab}
                onClick={() => onSelectSubsheet(tab)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  isSelected
                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                <span>{tab}</span>
                <span className="ml-1.5 text-[10px] opacity-80 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
