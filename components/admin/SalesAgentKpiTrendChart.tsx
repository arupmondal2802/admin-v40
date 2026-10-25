import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Service, ServiceStatus, User, Settings } from '../../types';
import * as authService from '../../services/authService';
import Card from '../ui/Card';
import { IconCheck, IconTrophy, IconTrendingUp, IconUsers } from '../ui/Icon';

interface SalesAgentKpiTrendChartProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  settings?: Settings;
  className?: string;
}

interface WeeklyDataPoint {
  weekKey: string;
  weekLabel: string;
  startDateStr: string;
  endDateStr: string;
  completedOrders: number;
  kpiTarget: number;
  variance: number;
  revenue: number;
}

export const SalesAgentKpiTrendChart: React.FC<SalesAgentKpiTrendChartProps> = ({
  submissions,
  users,
  settings,
  className = '',
}) => {
  // 1. Identify all sales agents (agents, sales category, or opted-in managers)
  const salesAgents = useMemo(() => {
    const list = users.filter(u => authService.isSalesAgentUser(u) || u.role === 'agent' || u.agentCategory === 'SALES_AGENT');
    if (list.length === 0) {
      // Fallback: any user that has logged an order or is an agent
      return users.filter(u => u.role !== 'technician');
    }
    return list;
  }, [users]);

  // Selected agent username (or '__ALL__' for team average / aggregate)
  const [selectedAgent, setSelectedAgent] = useState<string>(() => {
    return salesAgents.length > 0 ? salesAgents[0].username : '__ALL__';
  });

  // Selected window: 4, 8, or 12 weeks
  const [weeksCount, setWeeksCount] = useState<number>(8);

  // Fallback default weekly target derived from settings (monthly / 4) or 5
  const defaultWeeklyTarget = useMemo(() => {
    const monthlyFollowUps = settings?.retentionKpiTargets?.monthlyFollowUps;
    const weeklyConfigured = settings?.retentionKpiTargets?.weeklyOrdersTarget;
    if (weeklyConfigured && weeklyConfigured > 0) return weeklyConfigured;
    if (monthlyFollowUps && monthlyFollowUps > 0) return Math.max(1, Math.round(monthlyFollowUps / 4));
    return 5; // Default 5 orders/week
  }, [settings]);

  // User-adjustable target threshold override
  const [targetOverride, setTargetOverride] = useState<number | null>(null);

  // Active target threshold for the selected agent
  const activeTargetThreshold = useMemo(() => {
    if (targetOverride !== null && targetOverride > 0) return targetOverride;
    if (selectedAgent !== '__ALL__') {
      const agentObj = salesAgents.find(a => a.username === selectedAgent);
      if (agentObj?.weeklyOrdersTarget && agentObj.weeklyOrdersTarget > 0) {
        return agentObj.weeklyOrdersTarget;
      }
    }
    return defaultWeeklyTarget;
  }, [targetOverride, selectedAgent, salesAgents, defaultWeeklyTarget]);

  // Generate the weekly intervals backwards from the current date
  const weeklyData: WeeklyDataPoint[] = useMemo(() => {
    const points: WeeklyDataPoint[] = [];
    const now = new Date();

    // Find the Monday of current week
    const currentDay = now.getDay(); // 0 is Sunday
    const distanceToMonday = (currentDay + 6) % 7;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - distanceToMonday);
    currentMonday.setHours(0, 0, 0, 0);

    // Active completed services
    const completedServices = submissions.filter(
      s => s.status === ServiceStatus.Completed && !s.isDeleted
    );

    for (let i = weeksCount - 1; i >= 0; i--) {
      const weekStart = new Date(currentMonday);
      weekStart.setDate(currentMonday.getDate() - i * 7);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const startMs = weekStart.getTime();
      const endMs = weekEnd.getTime();

      // Filter services falling inside this week
      const weekServices = completedServices.filter(s => {
        const dateMs = new Date(s.timestamp).getTime();
        if (dateMs < startMs || dateMs > endMs) return false;

        if (selectedAgent === '__ALL__') {
          // Check if attributed to any sales agent
          const isBySalesAgent = salesAgents.some(
            ag => s.submittedBy === ag.username || (s as any).salesAgent === ag.username || s.assignedTo === ag.username
          );
          return isBySalesAgent;
        } else {
          return (
            s.submittedBy === selectedAgent ||
            (s as any).salesAgent === selectedAgent ||
            s.assignedTo === selectedAgent
          );
        }
      });

      const count = weekServices.length;
      const revenue = weekServices.reduce((acc, s) => acc + (s.grandTotal || 0), 0);
      const target = selectedAgent === '__ALL__' ? activeTargetThreshold * Math.max(1, salesAgents.length) : activeTargetThreshold;

      const formatShort = (d: Date) =>
        d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });

      points.push({
        weekKey: `W-${i}`,
        weekLabel: `${formatShort(weekStart)} - ${formatShort(weekEnd)}`,
        startDateStr: formatShort(weekStart),
        endDateStr: formatShort(weekEnd),
        completedOrders: count,
        kpiTarget: target,
        variance: count - target,
        revenue,
      });
    }

    return points;
  }, [submissions, selectedAgent, salesAgents, weeksCount, activeTargetThreshold]);

  // Aggregate stats across the weekly window
  const stats = useMemo(() => {
    const totalOrders = weeklyData.reduce((sum, p) => sum + p.completedOrders, 0);
    const avgOrders = weeklyData.length > 0 ? (totalOrders / weeklyData.length).toFixed(1) : '0';
    const weeksMet = weeklyData.filter(p => p.completedOrders >= p.kpiTarget).length;
    const hitRate = weeklyData.length > 0 ? Math.round((weeksMet / weeklyData.length) * 100) : 0;
    const peakWeek = Math.max(0, ...weeklyData.map(p => p.completedOrders));
    const totalRevenue = weeklyData.reduce((sum, p) => sum + p.revenue, 0);

    return { totalOrders, avgOrders, weeksMet, hitRate, peakWeek, totalRevenue };
  }, [weeklyData]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: WeeklyDataPoint = payload[0].payload;
      const isTargetMet = data.completedOrders >= data.kpiTarget;
      const diff = data.completedOrders - data.kpiTarget;

      return (
        <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-2 min-w-[200px]">
          <div className="border-b border-slate-700 pb-1.5 flex items-center justify-between">
            <span className="font-bold text-slate-200">{data.weekLabel}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                isTargetMet ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isTargetMet ? `Target Met (+${diff})` : `Below Target (${diff})`}
            </span>
          </div>

          <div className="space-y-1.5 font-mono">
            <div className="flex justify-between items-center text-indigo-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                Completed Orders:
              </span>
              <span className="font-black text-white text-sm">{data.completedOrders}</span>
            </div>

            <div className="flex justify-between items-center text-amber-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                KPI Threshold:
              </span>
              <span className="font-black text-white text-sm">{data.kpiTarget}</span>
            </div>

            {data.revenue > 0 && (
              <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
                <span>Revenue Booked:</span>
                <span className="font-semibold text-emerald-400">₹{data.revenue.toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const selectedAgentObj = salesAgents.find(a => a.username === selectedAgent);

  return (
    <Card className={className}>
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              <IconTrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Sales Agent Weekly Trends vs. KPI Target Threshold
              </h3>
              <p className="text-xs text-slate-500">
                Weekly completed order volume tracked against performance threshold benchmark
              </p>
            </div>
          </div>
        </div>

        {/* Filters & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 self-stretch sm:self-auto">
          {/* Agent Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <IconUsers className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-600">Agent:</span>
            <select
              value={selectedAgent}
              onChange={e => {
                setSelectedAgent(e.target.value);
                setTargetOverride(null); // Reset manual override on agent switch
              }}
              className="bg-transparent text-xs font-bold text-indigo-700 outline-none cursor-pointer focus:ring-0"
            >
              {salesAgents.map(ag => (
                <option key={ag.username} value={ag.username}>
                  {ag.name ? `${ag.name} (@${ag.username})` : ag.username} {ag.role === 'manager' ? '(Manager)' : ''}
                </option>
              ))}
              <option value="__ALL__">👥 All Sales Agents (Combined Team)</option>
            </select>
          </div>

          {/* Time Window (4, 8, 12 weeks) */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            {[
              { label: '4W', value: 4 },
              { label: '8W', value: 8 },
              { label: '12W', value: 12 },
            ].map(tab => (
              <button
                key={tab.value}
                onClick={() => setWeeksCount(tab.value)}
                className={`px-2.5 py-1 rounded font-bold transition-all ${
                  weeksCount === tab.value
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* KPI Target Threshold Stepper */}
          <div className="flex items-center gap-1 bg-amber-50/80 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs">
            <span className="font-bold text-amber-900" title="Weekly threshold target for completed orders">
              Target:
            </span>
            <input
              type="number"
              min="1"
              max="100"
              value={activeTargetThreshold}
              onChange={e => setTargetOverride(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 bg-white text-center font-mono font-bold text-amber-900 border border-amber-300 rounded px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-amber-400"
              title="Adjust KPI target threshold"
            />
            <span className="text-[10px] text-amber-700 font-semibold">/wk</span>
          </div>
        </div>
      </div>

      {/* KPI Metric Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Completed</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black text-slate-800">{stats.totalOrders}</span>
            <span className="text-xs text-slate-500 font-medium">orders</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Over past {weeksCount} weeks</p>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Weekly Average</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black text-indigo-700">{stats.avgOrders}</span>
            <span className="text-xs text-slate-500 font-medium">orders/wk</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">
            vs {activeTargetThreshold} weekly target
          </p>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Target Met Rate</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black text-emerald-700">{stats.hitRate}%</span>
            <span className="text-xs text-slate-500 font-medium">
              ({stats.weeksMet}/{weeksCount} wks)
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                stats.hitRate >= 75 ? 'bg-emerald-500' : stats.hitRate >= 50 ? 'bg-indigo-500' : 'bg-amber-500'
              }`}
              style={{ width: `${stats.hitRate}%` }}
            />
          </div>
        </div>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Peak Week Volume</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black text-amber-600">{stats.peakWeek}</span>
            <span className="text-xs text-slate-500 font-medium">orders peak</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Best week in period</p>
        </div>
      </div>

      {/* Recharts Line Chart */}
      <div className="w-full h-80 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weeklyData} margin={{ top: 15, right: 25, left: -10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="startDateStr"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              dy={10}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              dx={-5}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ paddingBottom: 12, fontSize: 12, fontWeight: 700 }}
            />

            {/* Threshold Reference Line */}
            <ReferenceLine
              y={activeTargetThreshold}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `KPI Threshold: ${activeTargetThreshold}`,
                fill: '#b45309',
                fontSize: 10,
                fontWeight: 700,
                position: 'insideTopRight',
              }}
            />

            {/* KPI Target Threshold Line */}
            <Line
              type="monotone"
              dataKey="kpiTarget"
              name="KPI Target Threshold"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4, stroke: '#f59e0b', strokeWidth: 2, fill: '#fff' }}
            />

            {/* Completed Orders Line */}
            <Line
              type="monotone"
              dataKey="completedOrders"
              name="Completed Orders"
              stroke="#4f46e5"
              strokeWidth={3}
              dot={{ r: 4, stroke: '#4f46e5', strokeWidth: 2, fill: '#ffffff' }}
              activeDot={{ r: 6, stroke: '#3730a3', strokeWidth: 3, fill: '#818cf8' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Info / Status */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs text-slate-500 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>
            Showing weekly performance for{' '}
            <strong className="text-slate-700">
              {selectedAgent === '__ALL__'
                ? 'All Sales Agents (Team Combined)'
                : selectedAgentObj?.name
                ? `${selectedAgentObj.name} (@${selectedAgentObj.username})`
                : `@${selectedAgent}`}
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-indigo-600 inline-block" /> Completed Orders
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 border-b border-dashed border-amber-500 inline-block" /> Target Threshold
          </span>
        </div>
      </div>
    </Card>
  );
};

export default SalesAgentKpiTrendChart;
