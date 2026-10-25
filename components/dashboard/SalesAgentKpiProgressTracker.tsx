import React, { useState, useMemo } from 'react';
import { Service, ServiceStatus, User, Settings, RetentionKpiTargets } from '../../types';
import * as authService from '../../services/authService';
import Card from '../ui/Card';
import HorizontalProgressBar from '../ui/HorizontalProgressBar';
import { IconTrophy, IconTrendingUp, IconUsers, IconCheck, IconPhone, IconCalendar } from '../ui/Icon';

interface SalesAgentKpiProgressTrackerProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  settings?: Settings;
  className?: string;
  onSelectAgent?: (username: string) => void;
}

export const SalesAgentKpiProgressTracker: React.FC<SalesAgentKpiProgressTrackerProps> = ({
  submissions,
  users,
  settings,
  className = '',
  onSelectAgent,
}) => {
  const [period, setPeriod] = useState<'THIS_MONTH' | 'LAST_30_DAYS'>('THIS_MONTH');

  // Filter users eligible as sales agents
  const salesAgents = useMemo(() => {
    return users.filter(u => authService.isSalesAgentUser(u) || u.role === 'agent' || u.agentCategory === 'SALES_AGENT');
  }, [users]);

  // Global KPI targets from settings
  const defaultTargets: RetentionKpiTargets = useMemo(() => {
    return (
      settings?.retentionKpiTargets || {
        monthlyFollowUps: 15,
        conversionRatePercentage: 40,
        monthlyRevenue: 25000,
        monthlyOrdersTarget: 20,
        weeklyOrdersTarget: 5,
      }
    );
  }, [settings]);

  // Date boundaries based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    if (period === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { startMs: start.getTime(), endMs: now.getTime(), label: 'This Month' };
    } else {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startMs: start.getTime(), endMs: now.getTime(), label: 'Last 30 Days' };
    }
  }, [period]);

  // Calculate stats for each sales agent
  const agentProgressList = useMemo(() => {
    const completedServices = submissions.filter(
      s => s.status === ServiceStatus.Completed && !s.isDeleted
    );

    return salesAgents.map(agent => {
      // Find completed services in the selected period for this agent
      const agentServices = completedServices.filter(s => {
        const ts = new Date(s.timestamp).getTime();
        if (ts < dateRange.startMs || ts > dateRange.endMs) return false;

        return (
          s.submittedBy === agent.username ||
          (s as any).salesAgent === agent.username ||
          s.assignedTo === agent.username
        );
      });

      const ordersCompleted = agentServices.length;
      const revenueGenerated = agentServices.reduce((sum, s) => sum + (s.grandTotal || 0), 0);

      // Specific targets for agent or fallback to global settings
      const targetOrders = agent.monthlyOrdersTarget || defaultTargets.monthlyOrdersTarget || 20;
      const targetRevenue = defaultTargets.monthlyRevenue || 25000;

      const ordersPercentage = Math.round((ordersCompleted / Math.max(1, targetOrders)) * 100);
      const revenuePercentage = Math.round((revenueGenerated / Math.max(1, targetRevenue)) * 100);

      // Determine overall health status
      let status: 'ACHIEVED' | 'ON_TRACK' | 'PROGRESSING' | 'BEHIND' = 'BEHIND';
      if (ordersPercentage >= 100 && revenuePercentage >= 100) {
        status = 'ACHIEVED';
      } else if (ordersPercentage >= 75 || revenuePercentage >= 75) {
        status = 'ON_TRACK';
      } else if (ordersPercentage >= 40 || revenuePercentage >= 40) {
        status = 'PROGRESSING';
      }

      return {
        agent,
        ordersCompleted,
        targetOrders,
        ordersPercentage,
        revenueGenerated,
        targetRevenue,
        revenuePercentage,
        status,
      };
    }).sort((a, b) => b.ordersCompleted - a.ordersCompleted || b.revenueGenerated - a.revenueGenerated);
  }, [salesAgents, submissions, dateRange, defaultTargets]);

  // Team-wide aggregated metrics
  const teamStats = useMemo(() => {
    const totalOrders = agentProgressList.reduce((acc, a) => acc + a.ordersCompleted, 0);
    const totalTargetOrders = agentProgressList.reduce((acc, a) => acc + a.targetOrders, 0);
    const totalRevenue = agentProgressList.reduce((acc, a) => acc + a.revenueGenerated, 0);
    const totalTargetRevenue = agentProgressList.reduce((acc, a) => acc + a.targetRevenue, 0);
    const agentsMetTarget = agentProgressList.filter(a => a.ordersCompleted >= a.targetOrders).length;

    return {
      totalOrders,
      totalTargetOrders: Math.max(1, totalTargetOrders),
      totalRevenue,
      totalTargetRevenue: Math.max(1, totalTargetRevenue),
      agentsMetTarget,
      totalAgents: agentProgressList.length,
    };
  }, [agentProgressList]);

  return (
    <Card className={className}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
            <IconTrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <span>Sales Agents KPI Target Progress</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-extrabold bg-indigo-100 text-indigo-800">
                {agentProgressList.length} Agents
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Individual agent performance tracked against monthly completed order and revenue thresholds
            </p>
          </div>
        </div>

        {/* Period Selector Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setPeriod('THIS_MONTH')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              period === 'THIS_MONTH' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📅 This Month
          </button>
          <button
            onClick={() => setPeriod('LAST_30_DAYS')}
            className={`px-3 py-1.5 rounded-md font-bold transition-all ${
              period === 'LAST_30_DAYS' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            ⏱️ Last 30 Days
          </button>
        </div>
      </div>

      {/* Team Aggregated Benchmark Card */}
      {agentProgressList.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border border-indigo-100/80">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <IconTrophy className="w-4 h-4 text-amber-500" />
              <span>Team Overall Target Attainment ({dateRange.label})</span>
            </span>
            <span className="text-xs font-extrabold text-indigo-700">
              {teamStats.agentsMetTarget} of {teamStats.totalAgents} Agents Met Goal
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HorizontalProgressBar
              value={teamStats.totalOrders}
              target={teamStats.totalTargetOrders}
              label="Team Completed Orders"
              unit="orders"
              size="md"
              colorScheme="indigo"
              showMarker={true}
            />
            <HorizontalProgressBar
              value={teamStats.totalRevenue}
              target={teamStats.totalTargetRevenue}
              label="Team Revenue Target"
              unit=""
              size="md"
              colorScheme="emerald"
              formatValue={v => `₹${v.toLocaleString('en-IN')}`}
              formatTarget={t => `₹${t.toLocaleString('en-IN')}`}
              showMarker={true}
            />
          </div>
        </div>
      )}

      {/* Individual Sales Agents Progress List */}
      {agentProgressList.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
          <IconUsers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-600">No active Sales Agents configured.</p>
          <p className="text-xs text-slate-400 mt-1">
            Assign the Sales Agent category or enable Sales KPI Tracking in User Management.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {agentProgressList.map(item => {
            const { agent, ordersCompleted, targetOrders, revenueGenerated, targetRevenue, status } = item;
            const displayName = agent.name || agent.username;
            const isManager = agent.role === 'manager';

            return (
              <div
                key={agent.username}
                onClick={() => onSelectAgent && onSelectAgent(agent.username)}
                className="p-4 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all"
              >
                {/* Agent Header Line */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{displayName}</span>
                        <span className="text-xs text-slate-400 font-mono">(@{agent.username})</span>
                        {isManager ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Manager (Opted In)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Sales Agent
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5">
                        <span>Period: {dateRange.label}</span>
                        <span>•</span>
                        <span>Orders Target: {targetOrders}</span>
                        <span>•</span>
                        <span>Revenue Target: ₹{targetRevenue.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {status === 'ACHIEVED' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs">
                        <span>🏆</span> KPI Exceeded
                      </span>
                    ) : status === 'ON_TRACK' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                        <span>⚡</span> On Track
                      </span>
                    ) : status === 'PROGRESSING' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                        <span>⏳</span> Progressing
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                        <span>⚠️</span> Needs Attention
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress Bars Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  {/* Orders KPI Horizontal Progress Bar */}
                  <div>
                    <HorizontalProgressBar
                      value={ordersCompleted}
                      target={targetOrders}
                      label="Completed Orders"
                      unit="orders"
                      size="md"
                      colorScheme="auto"
                      showMarker={true}
                    />
                  </div>

                  {/* Revenue KPI Horizontal Progress Bar */}
                  <div>
                    <HorizontalProgressBar
                      value={revenueGenerated}
                      target={targetRevenue}
                      label="Revenue Attainment"
                      unit=""
                      size="md"
                      colorScheme="auto"
                      formatValue={v => `₹${v.toLocaleString('en-IN')}`}
                      formatTarget={t => `₹${t.toLocaleString('en-IN')}`}
                      showMarker={true}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default SalesAgentKpiProgressTracker;
