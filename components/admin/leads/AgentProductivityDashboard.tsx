import React, { useState, useMemo } from 'react';
import {
  Users,
  Clock,
  TrendingUp,
  Award,
  Zap,
  Target,
  CheckCircle2,
  Calendar,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Phone,
  MessageSquare,
  Sparkles,
  Download,
  Flame,
  ShieldCheck,
  Building2,
  Car,
  ChevronRight,
  Search,
  RefreshCw,
  BarChart3,
  Layers,
  HelpCircle,
  Percent
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { ServiceRequest, DeliveryHub, User as UserType } from '../../../types';
import {
  calculateAgentProductivityStats,
  AgentProductivityMetric,
  exportLeadsToCsv
} from './leadUtils';

interface AgentProductivityDashboardProps {
  leads: ServiceRequest[];
  users: UserType[];
  activeHubs: DeliveryHub[];
  onSelectRepFilter?: (repName: string) => void;
  onOpenLeadDetail?: (lead: ServiceRequest) => void;
}

export const AgentProductivityDashboard: React.FC<AgentProductivityDashboardProps> = ({
  leads,
  users,
  activeHubs,
  onSelectRepFilter,
  onOpenLeadDetail
}) => {
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS' | 'THIS_MONTH'>('ALL');
  const [selectedHubId, setSelectedHubId] = useState<string>('ALL');
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('ALL');
  const [slaTargetMinutes, setSlaTargetMinutes] = useState<number>(15);
  const [activeChartTab, setActiveChartTab] = useState<'CONVERSION' | 'RESPONSE_TIME' | 'STAGES' | 'REVENUE'>('CONVERSION');
  const [repSearchQuery, setRepSearchQuery] = useState('');
  const [selectedRepForDrilldown, setSelectedRepForDrilldown] = useState<string | null>(null);

  // Filter leads based on Date Range and Hub
  const filteredLeads = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return leads.filter(lead => {
      if (lead.isArchived) return false;

      // Date filtering
      if (dateRangePreset !== 'ALL' && lead.requestDate) {
        const leadDate = new Date(lead.requestDate);
        if (dateRangePreset === 'TODAY' && leadDate < startOfToday) return false;
        if (dateRangePreset === '7DAYS' && leadDate < sevenDaysAgo) return false;
        if (dateRangePreset === '30DAYS' && leadDate < thirtyDaysAgo) return false;
        if (dateRangePreset === 'THIS_MONTH' && leadDate < startOfMonth) return false;
      }

      // Hub filtering
      if (selectedHubId !== 'ALL') {
        const leadHub = (lead as any).assignedHubId || (lead as any).hubId;
        if (leadHub && leadHub !== selectedHubId) return false;
      }

      return true;
    });
  }, [leads, dateRangePreset, selectedHubId]);

  // Compute Productivity Statistics
  const teamStats = useMemo(() => {
    return calculateAgentProductivityStats(filteredLeads, users, slaTargetMinutes);
  }, [filteredLeads, users, slaTargetMinutes]);

  // Filtered Rep Metrics for Leaderboard & Charts
  const displayedRepMetrics = useMemo(() => {
    let list = teamStats.repMetrics;
    if (selectedRepFilter !== 'ALL') {
      list = list.filter(r => r.repName === selectedRepFilter);
    }
    if (repSearchQuery.trim()) {
      const q = repSearchQuery.toLowerCase().trim();
      list = list.filter(r => r.repName.toLowerCase().includes(q));
    }
    return list;
  }, [teamStats.repMetrics, selectedRepFilter, repSearchQuery]);

  // Rep Drilldown Leads
  const drilldownLeads = useMemo(() => {
    if (!selectedRepForDrilldown) return [];
    return filteredLeads.filter(l => {
      const agent = l.assignedAgent ? l.assignedAgent.trim() : 'Unassigned';
      return agent === selectedRepForDrilldown;
    });
  }, [filteredLeads, selectedRepForDrilldown]);

  // Data for Conversion & Volume Chart
  const conversionChartData = useMemo(() => {
    return displayedRepMetrics.map(r => ({
      name: r.repName,
      'Converted Orders': r.convertedLeads,
      'Active In-Flight': r.activeOrders,
      'Not Contactable': r.lostLeads,
      'Conversion Rate (%)': r.conversionRate,
      totalLeads: r.totalLeads
    }));
  }, [displayedRepMetrics]);

  // Data for Response Time Chart
  const responseTimeChartData = useMemo(() => {
    return displayedRepMetrics
      .filter(r => r.repName !== 'Unassigned')
      .map(r => ({
        name: r.repName,
        'Avg Response Time (min)': r.avgResponseTimeMinutes,
        'SLA Target': slaTargetMinutes,
        'SLA Compliance (%)': r.slaComplianceRate,
        isCompliant: r.avgResponseTimeMinutes <= slaTargetMinutes
      }));
  }, [displayedRepMetrics, slaTargetMinutes]);

  // Data for Stage Distribution Stacked Chart
  const stageDistributionChartData = useMemo(() => {
    return displayedRepMetrics.map(r => ({
      name: r.repName,
      Created: r.stageCounts.CREATED,
      Contacted: r.stageCounts.CONTACTED,
      'Follow Up': r.stageCounts['FOLLOW UP'],
      'High Intent': r.stageCounts['HIGH INTENT'],
      Converted: r.stageCounts.CONVERTED,
      'Not Contactable': r.stageCounts['NOT CONTACTABLE']
    }));
  }, [displayedRepMetrics]);

  // Data for Revenue Won vs Quoted Chart
  const revenueChartData = useMemo(() => {
    return displayedRepMetrics.map(r => ({
      name: r.repName,
      'Closed Revenue (₹)': r.totalRevenueWon,
      'Pipeline In-Flight (₹)': r.pipelineRevenueQuoted
    }));
  }, [displayedRepMetrics]);

  // Data for Donut Chart (Pipeline status distribution)
  const pieDistributionData = useMemo(() => {
    const totalConverted = teamStats.totalConverted;
    const totalActive = teamStats.totalActiveOrders;
    const totalLost = filteredLeads.filter(l => (l.status || '').toUpperCase() === 'NOT CONTACTABLE').length;

    return [
      { name: 'Converted (Won)', value: totalConverted, color: '#10b981' },
      { name: 'Active In-Flight', value: totalActive, color: '#6366f1' },
      { name: 'Lost / Unreachable', value: totalLost, color: '#94a3b8' }
    ].filter(d => d.value > 0);
  }, [teamStats, filteredLeads]);

  // Handle Export Productivity Report
  const handleExportProductivityCsv = () => {
    const exportRows: ServiceRequest[] = displayedRepMetrics.map((r, idx) => ({
      id: `REP_KPI_${idx + 1}`,
      customerName: `Rep: @${r.repName}`,
      customerPhone: `Active: ${r.activeOrders}`,
      requestedService: `Conv Rate: ${r.conversionRate}%`,
      requestDate: new Date().toISOString(),
      source: 'Productivity Audit',
      status: `Converted: ${r.convertedLeads}/${r.totalLeads}`,
      totalAmount: r.totalRevenueWon,
      remarks: `Avg Response: ${r.avgResponseTimeMinutes}m | SLA: ${r.slaComplianceRate}% | Pipeline: ₹${r.pipelineRevenueQuoted}`
    }));

    exportLeadsToCsv(exportRows, `agent_productivity_report_${new Date().toISOString().split('T')[0]}.csv`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header & Filtering Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Agent Productivity & SLA Dashboard
                  <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Real-time CRM Analytics
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Track response velocity, conversion benchmarks, and active order pipelines per sales & service representative
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* SLA Benchmark Control */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-[11px] font-bold text-slate-600">SLA Target:</span>
              <select
                value={slaTargetMinutes}
                onChange={e => setSlaTargetMinutes(Number(e.target.value))}
                className="bg-transparent font-black text-indigo-700 text-xs focus:outline-none cursor-pointer"
              >
                <option value={10}>10 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </div>

            <button
              onClick={handleExportProductivityCsv}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export Agent Productivity Report to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export KPI CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Pills and Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Time Range Preset */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">Date Range</label>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setDateRangePreset('ALL')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  dateRangePreset === 'ALL' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setDateRangePreset('7DAYS')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  dateRangePreset === '7DAYS' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setDateRangePreset('30DAYS')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  dateRangePreset === '30DAYS' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setDateRangePreset('THIS_MONTH')}
                className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors ${
                  dateRangePreset === 'THIS_MONTH' ? 'bg-white text-indigo-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Delivery Hub Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">Delivery Hub</label>
            <select
              value={selectedHubId}
              onChange={e => setSelectedHubId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">🏢 All Delivery Hubs</option>
              {activeHubs.map(hub => (
                <option key={hub.id} value={hub.id}>
                  🏢 {hub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sales Rep Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">Filter Specific Agent</label>
            <select
              value={selectedRepFilter}
              onChange={e => setSelectedRepFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">👥 All Active Agents ({teamStats.repMetrics.length})</option>
              {teamStats.repMetrics.map(r => (
                <option key={r.repName} value={r.repName}>
                  👤 @{r.repName} ({r.totalLeads} leads)
                </option>
              ))}
            </select>
          </div>

          {/* Search Reps */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-slate-400">Search Agent</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search agent name..."
                value={repSearchQuery}
                onChange={e => setRepSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-medium text-slate-800 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Team Average Response Time */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                Avg Lead Response Time
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {teamStats.teamAvgResponseTimeMinutes}
                </span>
                <span className="text-xs font-bold text-slate-500">minutes</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">SLA Compliance ({slaTargetMinutes}m):</span>
            <span
              className={`font-black px-2 py-0.5 rounded-full text-[11px] ${
                teamStats.overallSlaComplianceRate >= 85
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {teamStats.overallSlaComplianceRate}% On-Time
            </span>
          </div>
        </div>

        {/* KPI 2: Team Lead Conversion Rate */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                Lead Conversion Rate
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-emerald-600 tracking-tight">
                  {teamStats.overallConversionRate}%
                </span>
                <span className="text-xs font-bold text-slate-500">
                  ({teamStats.totalConverted}/{teamStats.totalLeads})
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Top Converter Rep:</span>
            <span className="font-black text-slate-800 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              @{teamStats.topPerformerRep}
            </span>
          </div>
        </div>

        {/* KPI 3: Total Active In-Flight Orders */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                Total Active Orders in Pipeline
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-indigo-600 tracking-tight">
                  {teamStats.totalActiveOrders}
                </span>
                <span className="text-xs font-bold text-slate-500">in-progress</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shadow-xs">
              <Zap className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Fastest Responder:</span>
            <span className="font-black text-indigo-700 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              @{teamStats.fastestResponderRep}
            </span>
          </div>
        </div>

        {/* KPI 4: Closed Revenue Won */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                Closed Orders Revenue Won
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  ₹{teamStats.totalRevenueWon.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-200 text-sky-600 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium">Total Pipeline Value:</span>
            <span className="font-black text-slate-800">₹{teamStats.totalPipelineValue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Recharts Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-6">
        {/* Chart View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-0.5">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              Representative Performance Visualizer
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Interactive multi-axis performance telemetry across sales and support agents
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setActiveChartTab('CONVERSION')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeChartTab === 'CONVERSION'
                  ? 'bg-white text-indigo-700 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Conversion & Volumes
            </button>
            <button
              onClick={() => setActiveChartTab('RESPONSE_TIME')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeChartTab === 'RESPONSE_TIME'
                  ? 'bg-white text-indigo-700 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Response Time vs SLA
            </button>
            <button
              onClick={() => setActiveChartTab('STAGES')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeChartTab === 'STAGES'
                  ? 'bg-white text-indigo-700 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pipeline Stages
            </button>
            <button
              onClick={() => setActiveChartTab('REVENUE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeChartTab === 'REVENUE'
                  ? 'bg-white text-indigo-700 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Revenue Pipeline
            </button>
          </div>
        </div>

        {/* Dynamic Chart Container */}
        <div className="h-[360px] w-full">
          {activeChartTab === 'CONVERSION' && (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={conversionChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Orders Count', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#f59e0b' }}
                  label={{ value: 'Conversion %', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '16px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
                  }}
                  formatter={(value: any, name: string) => [
                    name === 'Conversion Rate (%)' ? `${value}%` : `${value} leads`,
                    name
                  ]}
                />
                <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar yAxisId="left" dataKey="Converted Orders" fill="#10b981" radius={[8, 8, 0, 0]} barSize={28} />
                <Bar yAxisId="left" dataKey="Active In-Flight" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={28} />
                <Bar yAxisId="left" dataKey="Not Contactable" fill="#cbd5e1" radius={[8, 8, 0, 0]} barSize={28} />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Conversion Rate (%)"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 8 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'RESPONSE_TIME' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={responseTimeChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Response Time (Minutes)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '16px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
                  }}
                  formatter={(value: any, name: string) => [
                    name.includes('SLA') ? `${value}%` : `${value} min`,
                    name
                  ]}
                />
                <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 'bold' }} />
                <ReferenceLine
                  y={slaTargetMinutes}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `SLA Benchmark (${slaTargetMinutes}m)`,
                    fill: '#ef4444',
                    position: 'top',
                    fontSize: 11,
                    fontWeight: 'bold'
                  }}
                />
                <Bar dataKey="Avg Response Time (min)" radius={[8, 8, 0, 0]} barSize={36}>
                  {responseTimeChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry['Avg Response Time (min)'] <= slaTargetMinutes
                          ? '#10b981'
                          : entry['Avg Response Time (min)'] <= slaTargetMinutes * 2
                          ? '#f59e0b'
                          : '#f43f5e'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'STAGES' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageDistributionChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '16px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="Created" stackId="a" fill="#93c5fd" />
                <Bar dataKey="Contacted" stackId="a" fill="#c084fc" />
                <Bar dataKey="Follow Up" stackId="a" fill="#fde047" />
                <Bar dataKey="High Intent" stackId="a" fill="#f43f5e" />
                <Bar dataKey="Converted" stackId="a" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeChartTab === 'REVENUE' && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={val => `₹${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderRadius: '16px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                  formatter={(val: any) => [`₹${Number(val).toLocaleString()}`, 'Amount']}
                />
                <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="Closed Revenue (₹)" fill="#10b981" radius={[8, 8, 0, 0]} barSize={32} />
                <Bar dataKey="Pipeline In-Flight (₹)" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Rep Leaderboard & Detailed Productivity Table */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Sales & Service Representatives Leaderboard ({displayedRepMetrics.length} Agents)
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Individual agent velocity, conversion rate, response SLA, and active customer order volume
            </p>
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Rank & Agent</th>
                <th className="py-3 px-3 text-center">Active Orders</th>
                <th className="py-3 px-3 text-center">Won / Converted</th>
                <th className="py-3 px-3 text-center">Win Rate %</th>
                <th className="py-3 px-3 text-center">Avg Response Time</th>
                <th className="py-3 px-3 text-center">SLA Compliance</th>
                <th className="py-3 px-3 text-right">Revenue Closed</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {displayedRepMetrics.map((rep, idx) => {
                const isTopConverter = rep.repName === teamStats.topPerformerRep && rep.convertedLeads > 0;
                const isFastest = rep.repName === teamStats.fastestResponderRep && rep.avgResponseTimeMinutes > 0;

                return (
                  <tr
                    key={rep.repName}
                    className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    onClick={() => setSelectedRepForDrilldown(rep.repName)}
                  >
                    {/* Rank & Agent Name */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : idx === 1
                              ? 'bg-slate-200 text-slate-700'
                              : idx === 2
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          #{idx + 1}
                        </span>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-slate-900 text-xs">@{rep.repName}</span>
                            {isTopConverter && (
                              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-black rounded-full border border-amber-300 flex items-center gap-0.5">
                                <Award className="w-2.5 h-2.5 fill-amber-500" />
                                Top Converter
                              </span>
                            )}
                            {isFastest && (
                              <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 text-[9px] font-black rounded-full border border-rose-300 flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5 fill-rose-500" />
                                Fastest
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {rep.totalLeads} total leads assigned • {rep.totalActivitiesCount} activities
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Active Orders */}
                    <td className="py-3 px-3 text-center font-bold">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black border border-indigo-100">
                        {rep.activeOrders} open
                      </span>
                    </td>

                    {/* Converted Leads */}
                    <td className="py-3 px-3 text-center font-bold">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-100">
                        {rep.convertedLeads} won
                      </span>
                    </td>

                    {/* Win Rate Progress */}
                    <td className="py-3 px-3 text-center">
                      <div className="space-y-1 inline-block min-w-[75px]">
                        <span className="text-xs font-black text-slate-900">{rep.conversionRate}%</span>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, rep.conversionRate)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Avg Response Time */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black ${
                          rep.avgResponseTimeMinutes <= slaTargetMinutes
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : rep.avgResponseTimeMinutes <= slaTargetMinutes * 2
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {rep.avgResponseTimeMinutes}m
                      </span>
                    </td>

                    {/* SLA Compliance */}
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`text-xs font-black ${
                          rep.slaComplianceRate >= 85
                            ? 'text-emerald-700'
                            : rep.slaComplianceRate >= 65
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {rep.slaComplianceRate}%
                      </span>
                    </td>

                    {/* Closed Revenue */}
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                      ₹{rep.totalRevenueWon.toLocaleString()}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedRepForDrilldown(rep.repName);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                        >
                          View Orders
                        </button>
                        {onSelectRepFilter && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              onSelectRepFilter(rep.repName);
                            }}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-bold rounded-lg text-[11px] transition-colors cursor-pointer"
                            title="Filter CRM Kanban to this agent"
                          >
                            Filter CRM
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

      {/* Drilldown Drawer for Selected Rep's Active Orders */}
      {selectedRepForDrilldown && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    Orders Queue for @{selectedRepForDrilldown}
                    <span className="text-xs font-bold text-slate-500">
                      ({drilldownLeads.length} Total Leads)
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Drilldown inspection of open service inquiries and booked appointments
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRepForDrilldown(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* List of Leads */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {drilldownLeads.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-bold">
                  No active orders assigned to @{selectedRepForDrilldown} in the selected time range.
                </div>
              ) : (
                drilldownLeads.map(lead => (
                  <div
                    key={lead.id}
                    className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900">{lead.customerName}</span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                            lead.status === 'CONVERTED'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : lead.status === 'HIGH INTENT'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {lead.requestedService || 'Car Service'} •{' '}
                        {[lead.carBrand, lead.carModel].filter(Boolean).join(' ') || 'Vehicle'} •{' '}
                        <span className="font-mono text-slate-700">+91 {lead.customerPhone}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-slate-900">
                        ₹{lead.totalAmount ? lead.totalAmount.toLocaleString() : '1,999'}
                      </span>
                      {onOpenLeadDetail && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRepForDrilldown(null);
                            onOpenLeadDetail(lead);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Open Lead
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedRepForDrilldown(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
