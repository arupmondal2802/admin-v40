import React, { useState, useMemo } from 'react';
import {
  X,
  Compass,
  Navigation,
  User,
  CheckCircle2,
  Building2,
  Layers,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import {
  findNearestHubForLead,
  distributeLeadsRoundRobin,
  distributeLeadsWorkload
} from './leadUtils';

interface LeadSmartRoutingModalProps {
  leads: ServiceRequest[];
  onClose: () => void;
  onApplyRouting: (routingUpdates: Array<{ leadId: string; hubId?: string; assignedAgent?: string }>) => void;
  activeHubs: DeliveryHub[];
  users: UserType[];
}

export const LeadSmartRoutingModal: React.FC<LeadSmartRoutingModalProps> = ({
  leads,
  onClose,
  onApplyRouting,
  activeHubs,
  users
}) => {
  const [distributionMode, setDistributionMode] = useState<'ROUND_ROBIN' | 'WORKLOAD'>('WORKLOAD');
  const [selectedAgentUsernames, setSelectedAgentUsernames] = useState<string[]>(
    users.map(u => u.username)
  );

  // Filter unassigned or all leads
  const unassignedLeads = useMemo(() => {
    return leads.filter(
      l => !l.isArchived && (!l.assignedAgent || l.assignedAgent === 'Unassigned')
    );
  }, [leads]);

  const leadsToRoute = unassignedLeads.length > 0 ? unassignedLeads : leads.filter(l => !l.isArchived);

  // Compute proposed assignments
  const proposedAssignments = useMemo(() => {
    const agentAssignments =
      distributionMode === 'ROUND_ROBIN'
        ? distributeLeadsRoundRobin(leadsToRoute, selectedAgentUsernames)
        : distributeLeadsWorkload(leadsToRoute, leads, selectedAgentUsernames);

    return leadsToRoute.map(lead => {
      const nearestHubInfo = findNearestHubForLead(lead, activeHubs);
      return {
        lead,
        proposedHub: nearestHubInfo?.hub,
        distanceKm: nearestHubInfo?.distanceKm ?? 0,
        proposedAgent: agentAssignments[lead.id] || lead.assignedAgent || 'Unassigned'
      };
    });
  }, [leadsToRoute, leads, selectedAgentUsernames, distributionMode, activeHubs]);

  const toggleAgent = (username: string) => {
    setSelectedAgentUsernames(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  };

  const handleApply = () => {
    const updates = proposedAssignments.map(p => ({
      leadId: p.lead.id,
      hubId: p.proposedHub?.id,
      assignedAgent: p.proposedAgent
    }));
    onApplyRouting(updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                Automated Hub Geolocation & Smart Lead Routing
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Auto-assigns {leadsToRoute.length} unassigned leads to nearest operational hubs & distributes sales workload
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

        {/* Configuration Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          {/* Distribution Strategy */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
              Lead Distribution Algorithm
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDistributionMode('WORKLOAD')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  distributionMode === 'WORKLOAD'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="font-extrabold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Workload-Balanced</span>
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">Assigns to agents with fewest active leads</div>
              </button>

              <button
                type="button"
                onClick={() => setDistributionMode('ROUND_ROBIN')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  distributionMode === 'ROUND_ROBIN'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="font-extrabold flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Round-Robin</span>
                </div>
                <div className="text-[10px] opacity-80 mt-0.5">Even cyclic distribution among sales reps</div>
              </button>
            </div>
          </div>

          {/* Active Sales Reps Pool */}
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
              Active Agents Pool ({selectedAgentUsernames.length} active)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {users.map(u => {
                const isSelected = selectedAgentUsernames.includes(u.username);
                return (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => toggleAgent(u.username)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all cursor-pointer flex items-center gap-1 ${
                      isSelected
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    <User className="w-3 h-3" />
                    <span>{u.username}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Preview List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center justify-between">
            <span>Proposed Assignment Preview ({proposedAssignments.length} Leads)</span>
            <span className="text-[10px] text-slate-400 font-bold">1-Click GPS Geo-routing</span>
          </h4>

          <div className="space-y-2">
            {proposedAssignments.map(({ lead, proposedHub, distanceKm, proposedAgent }) => (
              <div
                key={lead.id}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5 min-w-[160px]">
                  <span className="font-extrabold text-slate-900">{lead.customerName}</span>
                  <p className="text-[10px] text-slate-500 truncate max-w-[200px]">
                    {lead.streetAddress || 'Doorstep Service'}
                  </p>
                </div>

                {/* Hub Assignment */}
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-bold text-slate-800">{proposedHub?.name || 'Nearest Hub'}</span>
                  <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded font-bold">
                    {distanceKm.toFixed(1)} km
                  </span>
                </div>

                {/* Agent Assignment */}
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-extrabold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    @{proposedAgent}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleApply}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer uppercase tracking-wider"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Apply Routing to {proposedAssignments.length} Leads</span>
          </button>
        </div>
      </div>
    </div>
  );
};
