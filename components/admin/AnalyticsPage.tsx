
import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Service, ServiceStatus, User, ServiceTemplate, ProfitLoss, PredefinedCost, Settings } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import {
  IconChartBar, IconReceipt, IconFileAnalytics, IconTable,
  IconCheck, IconClock, IconDownload, IconUsers, IconRefresh,
  IconAlertTriangle, IconTrophy, IconCalendar, IconTrendingUp
} from '../ui/Icon';
import Input from '../ui/Input';
import DataTableReport from './DataTableReport';
import ProfitLossPage from './ProfitLossPage';
import MonthlyAnalyticsSummary from './MonthlyAnalyticsSummary';
import ExportReportModal, { FileFormat, ReportType, DataScope, PDFReportType } from './ExportReportModal';
import AgentEarningsTracker, { getAgentRank, AgentRankBadge } from './AgentEarningsTracker';
import LaborAnalyticsView from './LaborAnalyticsView';
import SalesAgentKpiTrendChart from './SalesAgentKpiTrendChart';
import SkeletonLoader from '../ui/SkeletonLoader';
import { getServiceLocalDateStr, getLocalTodayStr } from '../../utils/dateTimeUtils';

declare const Chart: any;
declare const XLSX: any;

interface AnalyticsPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  users: Omit<User, 'password'>[];
  serviceTemplates: ServiceTemplate[];
  profitLossData: ProfitLoss[];
  onSaveProfitLoss: (pl: ProfitLoss) => void;
  predefinedCosts: PredefinedCost[];
  onUpdatePredefinedCosts: (costs: PredefinedCost[]) => void;
  settings: Settings;
  onUpdateOrder?: (service: Service) => void;
}

// ── Chart Component ──────────────────────────────────────────────────────────
const ChartComponent: React.FC<{ type: string; data: any; options: any; height?: number }> = ({ type, data, options, height = 300 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current || typeof Chart === 'undefined') return;
    const existingChart = typeof Chart.getChart === 'function' ? Chart.getChart(canvasRef.current) : null;
    if (existingChart) existingChart.destroy();
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    chartRef.current = new Chart(ctx, { type, data, options });
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, options]);

  return (
    <div style={{ height: `${height}px`, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
  trend?: { value: number; label: string };
  highlight?: boolean;
}> = ({ title, value, icon, iconBg, sub, trend, highlight }) => (
  <div className={`bg-white p-4 rounded-xl shadow-sm border transition-all hover:shadow-md ${highlight ? 'border-brand-accent ring-1 ring-brand-accent/20' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between">
      <div className={`p-2.5 rounded-lg ${iconBg}`}>{icon}</div>
      {trend && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend.value >= 0 ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
          {trend.value >= 0 ? '+' : ''}{trend.value.toFixed(1)}%
        </span>
      )}
    </div>
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
      <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  </div>
);

// ── Date range presets ────────────────────────────────────────────────────────
const getPreset = (preset: string): { start: string; end: string } => {
  const todayStr = getLocalTodayStr();
  const today = new Date();
  const fmt = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const ago = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return fmt(d); };
  switch (preset) {
    case 'today': return { start: todayStr, end: todayStr };
    case '7d': return { start: ago(6), end: todayStr };
    case '30d': return { start: ago(29), end: todayStr };
    case '90d': return { start: ago(89), end: todayStr };
    case 'thisMonth': return { start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), end: todayStr };
    case 'lastMonth': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: fmt(s), end: fmt(e) };
    }
    case 'thisYear': return { start: fmt(new Date(today.getFullYear(), 0, 1)), end: todayStr };
    default: return { start: ago(29), end: todayStr };
  }
};

// ── Safe Helper Functions ───────────────────────────────────────────────────
const getSafeStatusHistory = (statusHistory: any): any[] => {
  if (Array.isArray(statusHistory)) return statusHistory;
  if (typeof statusHistory === 'string' && statusHistory.trim()) {
    try {
      const parsed = JSON.parse(statusHistory);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  return [];
};

// ── Main Component ───────────────────────────────────────────────────────────
export const AnalyticsPage: React.FC<AnalyticsPageProps> = (props) => {
  const {
    submissions = [], users = [], serviceTemplates = [], profitLossData = [],
    onSaveProfitLoss, predefinedCosts = [], onUpdatePredefinedCosts, settings,
    onUpdateOrder, isLoading, isHydrated
  } = props;

  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions : [], [submissions]);
  const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
  const safeServiceTemplates = useMemo(() => Array.isArray(serviceTemplates) ? serviceTemplates : [], [serviceTemplates]);
  const safeProfitLossData = useMemo(() => Array.isArray(profitLossData) ? profitLossData : [], [profitLossData]);
  const safePredefinedCosts = useMemo(() => Array.isArray(predefinedCosts) ? predefinedCosts : [], [predefinedCosts]);

  const [filters, setFilters] = useState(() => {
    const { start, end } = getPreset('30d');
    return { startDate: start, endDate: end, user: '', serviceType: '', statusFilter: 'all' };
  });
  const [view, setView] = useState<'dashboard' | 'monthly' | 'table' | 'profit-loss' | 'reports' | 'agent-earnings' | 'efficiency' | 'sales-kpi'>('dashboard');
  const [activePreset, setActivePreset] = useState('30d');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setActivePreset('custom');
  };

  const applyPreset = (preset: string) => {
    const { start, end } = getPreset(preset);
    setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
    setActivePreset(preset);
  };

  // ── Filtered data ─────────────────────────────────────────────────────────
  // Include all non-draft, non-deleted orders so Queued / Assigned / In-Progress
  // jobs are visible alongside Completed ones.
  const allActive = useMemo(() =>
    safeSubmissions.filter(s => s && s.status !== ServiceStatus.Draft && !s.isDeleted),
    [safeSubmissions]);

  const allCompleted = useMemo(() =>
    allActive.filter(s => s && s.status === ServiceStatus.Completed),
    [allActive]);

  const filteredSubmissions = useMemo(() => {
    const pool = filters.statusFilter === 'completed' ? allCompleted : allActive;
    return pool.filter(s => {
      const dateStr = getServiceLocalDateStr(s);
      const matchesDate = (!filters.startDate || dateStr >= filters.startDate) &&
                          (!filters.endDate || dateStr <= filters.endDate);
      const matchesAgent = !filters.user ||
        s.assignedTo === filters.user ||
        s.secondaryAssignee === filters.user;
      return matchesDate
        && matchesAgent
        && (!filters.serviceType || (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).includes(filters.serviceType));
    });
  }, [allActive, allCompleted, filters]);

  // ── Previous period for comparison ───────────────────────────────────────
  const prevPeriodSubmissions = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return [];
    const pool = filters.statusFilter === 'completed' ? allCompleted : allActive;
    const startMs = new Date(filters.startDate + 'T00:00:00').getTime();
    const endMs = new Date(filters.endDate + 'T23:59:59').getTime();
    const rangeMs = Math.max(0, endMs - startMs);
    const prevEnd = new Date(startMs - 86400000);
    const prevStart = new Date(prevEnd.getTime() - rangeMs);
    const fmt = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const prevStartStr = fmt(prevStart);
    const prevEndStr = fmt(prevEnd);

    return pool.filter(s => {
      const dateStr = getServiceLocalDateStr(s);
      return dateStr >= prevStartStr && dateStr <= prevEndStr;
    });
  }, [allActive, allCompleted, filters.startDate, filters.endDate, filters.statusFilter]);

  // ── Cost helper ───────────────────────────────────────────────────────────
  const getCost = useCallback((s: Service) => {
    const pl = safeProfitLossData.find(p => p.serviceId === s.submissionId);
    if (pl) {
      const dynSum = (Array.isArray(pl.dynamicCosts) ? pl.dynamicCosts : []).reduce((a, c) => a + c.value, 0);
      return (pl.materialCost || 0) + (pl.laborCost || 0) + (pl.otherExpenses || 0) + dynSum;
    }
    return (s.tyreLaborCost || 0) + (s.tyreMaterialCost || 0);
  }, [safeProfitLossData]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const revenue = filteredSubmissions.reduce((s, r) => s + (r.grandTotal || 0), 0);
    const cost = filteredSubmissions.reduce((s, r) => s + getCost(r), 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const count = filteredSubmissions.length;
    const revPerJob = count > 0 ? revenue / count : 0;

    const prevRev = prevPeriodSubmissions.reduce((s, r) => s + (r.grandTotal || 0), 0);
    const revTrend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : 0;
    const prevCount = prevPeriodSubmissions.length;
    const countTrend = prevCount > 0 ? ((count - prevCount) / prevCount) * 100 : 0;

    // Best agent
    const agentRev: Record<string, number> = {};
    filteredSubmissions.forEach(s => { if (s.assignedTo) agentRev[s.assignedTo] = (agentRev[s.assignedTo] || 0) + (s.grandTotal || 0); });
    const bestAgent = Object.entries(agentRev).sort((a, b) => b[1] - a[1])[0];

    // Top service
    const svcCount: Record<string, number> = {};
    filteredSubmissions.forEach(s => (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).forEach(sv => { svcCount[sv] = (svcCount[sv] || 0) + 1; }));
    const topSvc = Object.entries(svcCount).sort((a, b) => b[1] - a[1])[0];

    // Order-wise Cash vs Bank & Balance Analytics
    let totalCash = 0;
    let totalBank = 0;
    let totalPendingPayment = 0;
    let paidOrdersCount = 0;
    let pendingOrdersCount = 0;

    filteredSubmissions.forEach(s => {
      const orderTotal = s.grandTotal || 0;
      // Dedicated accounts clearance rule: ONLY orders with paymentStatus === 'Completed' are counted towards cash/bank
      const isPaid = s.paymentStatus === 'Completed';
      if (isPaid) {
        paidOrdersCount++;
        if (s.paymentMode === 'Cash') {
          totalCash += (s.cashAmount !== undefined && s.cashAmount > 0) ? s.cashAmount : orderTotal;
        } else if (s.paymentMode === 'Online') {
          totalBank += (s.onlineAmount !== undefined && s.onlineAmount > 0) ? s.onlineAmount : orderTotal;
        } else if (s.paymentMode === 'Both') {
          totalCash += (s.cashAmount || 0);
          totalBank += (s.onlineAmount || 0);
        } else {
          totalBank += orderTotal;
        }
      } else {
        pendingOrdersCount++;
        totalPendingPayment += orderTotal;
      }
    });

    const totalRealizedBalance = totalCash + totalBank;

    return { 
      revenue, cost, profit, margin, count, revPerJob, revTrend, countTrend, bestAgent, topSvc,
      totalCash, totalBank, totalRealizedBalance, totalPendingPayment, paidOrdersCount, pendingOrdersCount
    };
  }, [filteredSubmissions, prevPeriodSubmissions, getCost]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { revenue: number; cost: number; jobs: number }>();
    const serviceMap = new Map<string, number>();
    const agentRevMap = new Map<string, number>();
    const agentJobMap = new Map<string, number>();
    const dowMap: number[] = [0, 0, 0, 0, 0, 0, 0];

    if (filters.startDate && filters.endDate) {
      let cur = new Date(filters.startDate + 'T00:00:00');
      const end = new Date(filters.endDate + 'T00:00:00');
      while (cur <= end) {
        const year = cur.getFullYear();
        const month = String(cur.getMonth() + 1).padStart(2, '0');
        const day = String(cur.getDate()).padStart(2, '0');
        dailyMap.set(`${year}-${month}-${day}`, { revenue: 0, cost: 0, jobs: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    }

    filteredSubmissions.forEach(s => {
      const date = getServiceLocalDateStr(s);
      const cur = dailyMap.get(date) || { revenue: 0, cost: 0, jobs: 0 };
      const cost = getCost(s);
      dailyMap.set(date, { revenue: cur.revenue + (s.grandTotal || 0), cost: cur.cost + cost, jobs: cur.jobs + 1 });
      (Array.isArray(s.serviceSelection) ? s.serviceSelection : []).forEach(sv => serviceMap.set(sv, (serviceMap.get(sv) || 0) + 1));
      const agents = [s.assignedTo, s.secondaryAssignee].filter(Boolean) as string[];
      agents.forEach(ag => {
        agentRevMap.set(ag, (agentRevMap.get(ag) || 0) + (s.grandTotal || 0) / agents.length);
        agentJobMap.set(ag, (agentJobMap.get(ag) || 0) + 1);
      });
      const dowSrc = s.scheduledDate || s.timestamp;
      const dowDate = dowSrc.includes('T') ? new Date(dowSrc) : new Date(dowSrc + 'T00:00:00');
      dowMap[dowDate.getDay()]++;
    });

    const sorted = Array.from(dailyMap.entries()).sort();
    const agentEntries = Array.from(agentRevMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      timeline: {
        labels: sorted.map(d => new Date(d[0]).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })),
        revenue: sorted.map(d => d[1].revenue),
        cost: sorted.map(d => d[1].cost),
        profit: sorted.map(d => d[1].revenue - d[1].cost),
        jobs: sorted.map(d => d[1].jobs),
      },
      services: {
        labels: Array.from(serviceMap.keys()),
        data: Array.from(serviceMap.values()),
      },
      agents: {
        labels: agentEntries.map(e => e[0]),
        revenue: agentEntries.map(e => e[1]),
        jobs: agentEntries.map(e => agentJobMap.get(e[0]) || 0),
      },
      dow: {
        labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        data: dowMap,
      },
    };
  }, [filteredSubmissions, filters.startDate, filters.endDate, getCost]);

  // ── Cost breakdown summary ─────────────────────────────────────────────────
  const costBreakdown = useMemo(() => {
    let material = 0, labor = 0, dynamic = 0;
    filteredSubmissions.forEach(s => {
      const pl = safeProfitLossData.find(p => p.serviceId === s.submissionId);
      if (pl) {
        material += pl.materialCost || 0;
        labor += pl.laborCost || 0;
        const dynSum = (Array.isArray(pl.dynamicCosts) ? pl.dynamicCosts : []).reduce((a, c) => a + c.value, 0);
        dynamic += dynSum + (pl.otherExpenses || 0);
      } else {
        material += s.tyreMaterialCost || 0;
        labor += s.tyreLaborCost || 0;
      }
    });
    return { material, labor, dynamic, total: material + labor + dynamic };
  }, [filteredSubmissions, safeProfitLossData]);

  // ── Service Efficiency Breakdown ──────────────────────────────────────────
  const efficiencyData = useMemo(() => {
    const agentStats: Record<string, {
      agentName: string;
      totalTimeMs: number;
      count: number;
      jobsList: {
        id: string;
        customerName: string;
        carBrandModel: string;
        carNumber: string;
        durationHours: number;
        date: string;
        services: string[];
      }[];
    }> = {};

    filteredSubmissions.forEach(s => {
      // We only measure completed services
      if (s.status !== ServiceStatus.Completed || !s.assignedTo) return;

      const history = getSafeStatusHistory(s.statusHistory);
      const assignedTransition = history.find(h => h && h.status === ServiceStatus.Assigned);
      const completedTransition = history.find(h => h && h.status === ServiceStatus.Completed);

      let startTs: number | null = null;
      let endTs: number | null = null;

      const inProgressTransition = history.find(h => h && h.status === ServiceStatus.InProgress);

      if (assignedTransition && assignedTransition.timestamp) {
        startTs = new Date(assignedTransition.timestamp).getTime();
      } else if (inProgressTransition && inProgressTransition.timestamp) {
        startTs = new Date(inProgressTransition.timestamp).getTime();
      } else {
        startTs = new Date(s.timestamp).getTime();
      }

      if (completedTransition && completedTransition.timestamp) {
        endTs = new Date(completedTransition.timestamp).getTime();
      } else {
        const latestTransition = history.length > 0 ? history[history.length - 1] : null;
        endTs = (latestTransition && latestTransition.timestamp) ? new Date(latestTransition.timestamp).getTime() : new Date(s.timestamp).getTime();
      }

      if (startTs && endTs && endTs >= startTs) {
        const diffMs = endTs - startTs;
        const agent = s.assignedTo;
        if (!agentStats[agent]) {
          agentStats[agent] = { agentName: agent, totalTimeMs: 0, count: 0, jobsList: [] };
        }
        const hours = diffMs / (1000 * 60 * 60);
        agentStats[agent].totalTimeMs += diffMs;
        agentStats[agent].count += 1;
        agentStats[agent].jobsList.push({
          id: s.appointmentId?.split('-').pop() || s.submissionId.slice(-6),
          customerName: `${s.customerFirstName} ${s.customerLastName}`,
          carBrandModel: s.carBrandModel,
          carNumber: s.carNumber,
          durationHours: hours,
          date: new Date(endTs).toLocaleDateString('en-IN'),
          services: s.serviceSelection || [],
        });
      }
    });

    const list = Object.values(agentStats).map(stat => {
      const avgHours = stat.count > 0 ? (stat.totalTimeMs / stat.count) / (1000 * 60 * 60) : 0;
      return {
        ...stat,
        avgHours,
      };
    });

    return list.sort((a, b) => a.avgHours - b.avgHours);
  }, [filteredSubmissions]);

  const efficiencyMetrics = useMemo(() => {
    if (efficiencyData.length === 0) {
      return {
        avgHours: 0,
        fastest: { agent: 'N/A', hours: 0 },
        slowest: { agent: 'N/A', hours: 0 },
        totalJobs: 0,
      };
    }

    const totalTimeMs = efficiencyData.reduce((sum, d) => sum + d.totalTimeMs, 0);
    const totalJobs = efficiencyData.reduce((sum, d) => sum + d.count, 0);
    const avgHours = totalJobs > 0 ? (totalTimeMs / totalJobs) / (1000 * 60 * 60) : 0;

    const fastest = {
      agent: efficiencyData[0].agentName,
      hours: efficiencyData[0].avgHours,
    };
    const slowest = {
      agent: efficiencyData[efficiencyData.length - 1].agentName,
      hours: efficiencyData[efficiencyData.length - 1].avgHours,
    };

    return { avgHours, fastest, slowest, totalJobs };
  }, [efficiencyData]);

  const formatDuration = (hours: number): string => {
    if (hours <= 0) return '0m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const getSpeedColor = (hours: number) => {
    if (hours < 1.5) return 'text-green-700 bg-green-50 border-green-200';
    if (hours < 3.0) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  const getSpeedLabel = (hours: number) => {
    if (hours < 1.5) return 'High Speed';
    if (hours < 3.0) return 'Moderate';
    return 'Focus Area';
  };

  const toggleAgentExpand = (agentName: string) => {
    setExpandedAgents(prev => ({ ...prev, [agentName]: !prev[agentName] }));
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(async (
    fileFormat: FileFormat,
    reportType: ReportType,
    dataScope: DataScope,
    pdfReportType: PDFReportType
  ) => {
    setIsExporting(true);
    const data = dataScope === 'full' ? allActive : filteredSubmissions;

    try {
      if (fileFormat === 'csv') {
        await exportCSV(data, reportType);
      } else {
        exportPrint(data, pdfReportType);
      }
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setIsExportOpen(false);
      }, 500);
    }
  }, [allActive, filteredSubmissions]);

  const exportCSV = async (data: Service[], reportType: ReportType) => {
    if (typeof XLSX === 'undefined') {
      alert('Excel library not loaded — please refresh and try again.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    if (reportType === 'summary' || reportType === 'agent') {
      const CHUNK_SIZE = 1000;
      const rows: any[] = [];
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        chunk.forEach(s => {
          const pl = safeProfitLossData.find(p => p.serviceId === s.submissionId);
          const mat = pl ? pl.materialCost : (s.tyreMaterialCost || 0);
          const lab = pl ? pl.laborCost : (s.tyreLaborCost || 0);
          const dyn = pl ? (Array.isArray(pl.dynamicCosts) ? pl.dynamicCosts : []).reduce((a, c) => a + c.value, 0) + (pl.otherExpenses || 0) : 0;
          const cost = mat + lab + dyn;
          rows.push({
            'Order ID': s.appointmentId?.split('-').pop() || '',
            'Date': new Date(s.timestamp).toLocaleDateString('en-IN'),
            'Customer': `${s.customerFirstName} ${s.customerLastName}`,
            'Mobile': s.mobileNumber,
            'Car': s.carBrandModel,
            'Reg. No': s.carNumber,
            'Services': (s.serviceSelection || []).join(', '),
            'Agent': s.assignedTo || 'N/A',
            'Revenue (₹)': s.grandTotal,
            'Material (₹)': mat,
            'Labour (₹)': lab,
            'Other (₹)': dyn,
            'Total Cost (₹)': cost,
            'Net Profit (₹)': s.grandTotal - cost,
            'Margin %': s.grandTotal > 0 ? (((s.grandTotal - cost) / s.grandTotal) * 100).toFixed(1) + '%' : '0%',
            'Notes': pl?.notes || '',
          });
        });
        if (data.length > CHUNK_SIZE) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'All Jobs');

      if (reportType === 'agent') {
        const agentMap: Record<string, typeof rows> = {};
        rows.forEach((r, i) => {
          const ag = data[i].assignedTo || 'Unassigned';
          if (!agentMap[ag]) agentMap[ag] = [];
          agentMap[ag].push(r);
        });
        Object.entries(agentMap).forEach(([ag, agRows]) => {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agRows), ag.slice(0, 31));
        });
      }
    } else {
      // service breakdown
      const svcMap: Record<string, Service[]> = {};
      data.forEach(s => {
        (s.serviceSelection || []).forEach(sv => {
          if (!svcMap[sv]) svcMap[sv] = [];
          svcMap[sv].push(s);
        });
      });
      Object.entries(svcMap).forEach(([sv, svcs]) => {
        const rows = svcs.map(s => ({
          'Order ID': s.appointmentId?.split('-').pop() || '',
          'Date': new Date(s.timestamp).toLocaleDateString('en-IN'),
          'Customer': `${s.customerFirstName} ${s.customerLastName}`,
          'Agent': s.assignedTo || 'N/A',
          'Revenue (₹)': s.grandTotal,
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sv.slice(0, 31));
      });
    }

    XLSX.writeFile(wb, `analytics_report_${dateStr}.xlsx`);
  };

  const exportPrint = (data: Service[], pdfType: PDFReportType) => {
    const dateLabel = `${filters.startDate} to ${filters.endDate}`;
    const totalRev = data.reduce((s, r) => s + r.grandTotal, 0);
    const totalCost = data.reduce((s, r) => s + getCost(r), 0);
    const profit = totalRev - totalCost;
    const margin = totalRev > 0 ? ((profit / totalRev) * 100).toFixed(1) : '0';

    const agentMap: Record<string, { rev: number; jobs: number }> = {};
    data.forEach(s => {
      const ag = s.assignedTo || 'Unassigned';
      if (!agentMap[ag]) agentMap[ag] = { rev: 0, jobs: 0 };
      agentMap[ag].rev += s.grandTotal;
      agentMap[ag].jobs++;
    });

    const svcMap: Record<string, { count: number; rev: number }> = {};
    data.forEach(s => (s.serviceSelection || []).forEach(sv => {
      if (!svcMap[sv]) svcMap[sv] = { count: 0, rev: 0 };
      svcMap[sv].count++;
      svcMap[sv].rev += s.grandTotal;
    }));

    // Create jsPDF instance
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // ── Draw Header ──────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(13, 42, 79); // #0D2A4F
    doc.text('A BIG ENGINE', 15, 23);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // #64748b
    doc.text('PREMIUM AUTO CARE SPECIALISTS', 15, 28);

    // Thick primary color line
    doc.setDrawColor(13, 42, 79);
    doc.setLineWidth(0.8);
    doc.line(15, 32, 195, 32);

    // Right-aligned metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85); // #334155
    doc.text('MANAGEMENT ANALYTICAL REPORT', 195, 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Reporting Period: ${dateLabel}`, 195, 23, { align: 'right' });
    doc.text(`Generated On: ${new Date().toLocaleString('en-IN')}`, 195, 27, { align: 'right' });

    // ── KPI Cards ────────────────────────────────────────────────────────────
    const startY = 38;
    const cardW = 42;
    const cardH = 22;
    const gap = 4;
    const labels = ['Total Revenue', 'Total Operating Cost', 'Net Profit', 'Profit Margin'];
    const values = [
      `₹${totalRev.toLocaleString('en-IN')}`,
      `₹${totalCost.toLocaleString('en-IN')}`,
      `₹${profit.toLocaleString('en-IN')}`,
      `${margin}%`
    ];

    for (let i = 0; i < 4; i++) {
      const x = 15 + i * (cardW + gap);
      // Background card
      doc.setFillColor(248, 250, 252); // #f8fafc
      doc.setDrawColor(226, 232, 240); // #e2e8f0
      doc.setLineWidth(0.3);
      doc.roundedRect(x, startY, cardW, cardH, 2, 2, 'FD');

      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(labels[i].toUpperCase(), x + 3.5, startY + 6);

      // Value
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.text(values[i], x + 3.5, startY + 14);
    }

    // ── Table Header / Title ─────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(13, 42, 79);

    let titleStr = '';
    let tableHead: string[][] = [];
    let tableBody: string[][] = [];

    if (pdfType === 'performance') {
      titleStr = 'Agent Revenue & Productivity Summary';
      tableHead = [['Agent', 'Jobs Completed', 'Revenue Generated', 'Average Ticket Size', 'Share of Revenue']];
      tableBody = Object.entries(agentMap)
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([ag, d]) => [
          ag,
          d.jobs.toString(),
          `₹${d.rev.toLocaleString('en-IN')}`,
          `₹${d.jobs > 0 ? Math.round(d.rev / d.jobs).toLocaleString('en-IN') : 0}`,
          `${totalRev > 0 ? ((d.rev / totalRev) * 100).toFixed(1) : 0}%`
        ]);
    } else if (pdfType === 'services') {
      titleStr = 'Service Demand & Revenue Breakdown';
      tableHead = [['Service Type', 'Times Performed', 'Revenue Generated', 'Share of Total Revenue']];
      tableBody = Object.entries(svcMap)
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([sv, d]) => [
          sv,
          d.count.toString(),
          `₹${d.rev.toLocaleString('en-IN')}`,
          `${totalRev > 0 ? ((d.rev / totalRev) * 100).toFixed(1) : 0}%`
        ]);
    } else if (pdfType === 'revenue') {
      titleStr = 'Daily Revenue Trend Analysis';
      tableHead = [['Date', 'Jobs Completed', 'Daily Revenue', 'Cumulative Revenue']];
      
      const dailyMap: Record<string, { count: number; rev: number }> = {};
      data.forEach(s => {
        const d = s.timestamp.split('T')[0];
        if (!dailyMap[d]) dailyMap[d] = { count: 0, rev: 0 };
        dailyMap[d].count++;
        dailyMap[d].rev += s.grandTotal;
      });

      let cumulative = 0;
      tableBody = Object.entries(dailyMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([d, stat]) => {
          cumulative += stat.rev;
          return [
            new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            stat.count.toString(),
            `₹${stat.rev.toLocaleString('en-IN')}`,
            `₹${cumulative.toLocaleString('en-IN')}`
          ];
        });
    } else if (pdfType === 'efficiency') {
      titleStr = 'Agent Service Efficiency & Speed Analysis';
      tableHead = [['Agent Name', 'Jobs Measured', 'Average Completion Time', 'Speed Rating']];
      
      const agentStats: Record<string, {
        agentName: string;
        totalTimeMs: number;
        count: number;
        jobsList: {
          id: string;
          customerName: string;
          carBrandModel: string;
          carNumber: string;
          durationHours: number;
          date: string;
          services: string[];
        }[];
      }> = {};

      data.forEach(s => {
        if (s.status !== ServiceStatus.Completed || !s.assignedTo) return;

        const history = getSafeStatusHistory(s.statusHistory);
        const assignedTransition = history.find(h => h && h.status === ServiceStatus.Assigned);
        const completedTransition = history.find(h => h && h.status === ServiceStatus.Completed);

        let startTs: number | null = null;
        let endTs: number | null = null;

        const inProgressTransition = history.find(h => h && h.status === ServiceStatus.InProgress);

        if (assignedTransition && assignedTransition.timestamp) {
          startTs = new Date(assignedTransition.timestamp).getTime();
        } else if (inProgressTransition && inProgressTransition.timestamp) {
          startTs = new Date(inProgressTransition.timestamp).getTime();
        } else {
          startTs = new Date(s.timestamp).getTime();
        }

        if (completedTransition && completedTransition.timestamp) {
          endTs = new Date(completedTransition.timestamp).getTime();
        } else {
          const latestTransition = history.length > 0 ? history[history.length - 1] : null;
          endTs = (latestTransition && latestTransition.timestamp) ? new Date(latestTransition.timestamp).getTime() : new Date(s.timestamp).getTime();
        }

        if (startTs && endTs && endTs >= startTs) {
          const diffMs = endTs - startTs;
          const agent = s.assignedTo;
          if (!agentStats[agent]) {
            agentStats[agent] = { agentName: agent, totalTimeMs: 0, count: 0, jobsList: [] };
          }
          const hours = diffMs / (1000 * 60 * 60);
          agentStats[agent].totalTimeMs += diffMs;
          agentStats[agent].count += 1;
          agentStats[agent].jobsList.push({
            id: s.appointmentId?.split('-').pop() || s.submissionId.slice(-6),
            customerName: `${s.customerFirstName} ${s.customerLastName}`,
            carBrandModel: s.carBrandModel,
            carNumber: s.carNumber,
            durationHours: hours,
            date: new Date(endTs).toLocaleDateString('en-IN'),
            services: s.serviceSelection || [],
          });
        }
      });

      const calculatedEfficiencyData = Object.values(agentStats).map(stat => {
        const avgHours = stat.count > 0 ? (stat.totalTimeMs / stat.count) / (1000 * 60 * 60) : 0;
        return {
          ...stat,
          avgHours,
        };
      }).sort((a, b) => a.avgHours - b.avgHours);

      tableBody = calculatedEfficiencyData.map(d => [
        d.agentName,
        d.count.toString(),
        formatDuration(d.avgHours),
        getSpeedLabel(d.avgHours)
      ]);
    }

    doc.text(titleStr, 15, 71);

    // ── Generate Main Table ──────────────────────────────────────────────────
    autoTable(doc, {
      startY: 75,
      head: tableHead,
      body: tableBody,
      theme: 'striped',
      headStyles: {
        fillColor: [13, 42, 79], // #0D2A4F
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        halign: 'left',
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [30, 41, 59], // #1e293b
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // #f8fafc
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (pageData) => {
        const pageNum = pageData.pageNumber;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(15, 282, 195, 282);
        
        doc.text('A Big Engine — Confidential Management Review', 15, 287);
        doc.text(`Page ${pageNum}`, 195, 287, { align: 'right' });

        if (pageNum > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(13, 42, 79);
          doc.text('A BIG ENGINE — ANALYTICAL REPORT', 15, 10);
          
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(148, 163, 184);
          doc.text(`Period: ${dateLabel}`, 195, 10, { align: 'right' });
          
          doc.setDrawColor(13, 42, 79);
          doc.setLineWidth(0.3);
          doc.line(15, 12, 195, 12);
        }
      }
    });

    // ── Additional Log for Efficiency Report ─────────────────────────────────
    if (pdfType === 'efficiency') {
      const lastY = (doc as any).lastAutoTable.finalY || 130;
      let detailedStartY = lastY + 15;
      if (detailedStartY > 250) {
        doc.addPage();
        detailedStartY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(13, 42, 79);
      doc.text('Detailed Agent Job Completion Logs', 15, detailedStartY - 4);

      const agentStats: Record<string, {
        agentName: string;
        totalTimeMs: number;
        count: number;
        jobsList: {
          id: string;
          customerName: string;
          carBrandModel: string;
          carNumber: string;
          durationHours: number;
          date: string;
          services: string[];
        }[];
      }> = {};

      data.forEach(s => {
        if (s.status !== ServiceStatus.Completed || !s.assignedTo) return;

        const history = getSafeStatusHistory(s.statusHistory);
        const assignedTransition = history.find(h => h && h.status === ServiceStatus.Assigned);
        const completedTransition = history.find(h => h && h.status === ServiceStatus.Completed);

        let startTs: number | null = null;
        let endTs: number | null = null;

        const inProgressTransition = history.find(h => h && h.status === ServiceStatus.InProgress);

        if (assignedTransition && assignedTransition.timestamp) {
          startTs = new Date(assignedTransition.timestamp).getTime();
        } else if (inProgressTransition && inProgressTransition.timestamp) {
          startTs = new Date(inProgressTransition.timestamp).getTime();
        } else {
          startTs = new Date(s.timestamp).getTime();
        }

        if (completedTransition && completedTransition.timestamp) {
          endTs = new Date(completedTransition.timestamp).getTime();
        } else {
          const latestTransition = history.length > 0 ? history[history.length - 1] : null;
          endTs = (latestTransition && latestTransition.timestamp) ? new Date(latestTransition.timestamp).getTime() : new Date(s.timestamp).getTime();
        }

        if (startTs && endTs && endTs >= startTs) {
          const diffMs = endTs - startTs;
          const agent = s.assignedTo;
          if (!agentStats[agent]) {
            agentStats[agent] = { agentName: agent, totalTimeMs: 0, count: 0, jobsList: [] };
          }
          const hours = diffMs / (1000 * 60 * 60);
          agentStats[agent].totalTimeMs += diffMs;
          agentStats[agent].count += 1;
          agentStats[agent].jobsList.push({
            id: s.appointmentId?.split('-').pop() || s.submissionId.slice(-6),
            customerName: `${s.customerFirstName} ${s.customerLastName}`,
            carBrandModel: s.carBrandModel,
            carNumber: s.carNumber,
            durationHours: hours,
            date: new Date(endTs).toLocaleDateString('en-IN'),
            services: s.serviceSelection || [],
          });
        }
      });

      const calculatedEfficiencyData = Object.values(agentStats).map(stat => {
        const avgHours = stat.count > 0 ? (stat.totalTimeMs / stat.count) / (1000 * 60 * 60) : 0;
        return {
          ...stat,
          avgHours,
        };
      }).sort((a, b) => a.avgHours - b.avgHours);

      const detailedJobRows: any[] = [];
      calculatedEfficiencyData.forEach(agentStat => {
        agentStat.jobsList.forEach(job => {
          detailedJobRows.push([
            `#${job.id}`,
            agentStat.agentName,
            job.customerName,
            `${job.carBrandModel} (${job.carNumber})`,
            job.services.join(', '),
            job.date,
            formatDuration(job.durationHours)
          ]);
        });
      });

      autoTable(doc, {
        startY: detailedStartY,
        head: [['ID', 'Agent', 'Customer Name', 'Vehicle Details', 'Services', 'Completed On', 'Duration']],
        body: detailedJobRows,
        theme: 'striped',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'left',
        },
        bodyStyles: {
          fontSize: 7.5,
          textColor: [30, 41, 59],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        margin: { left: 15, right: 15 },
        didDrawPage: (pageData) => {
          const pageNum = pageData.pageNumber;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184); // slate-400
          
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.3);
          doc.line(15, 282, 195, 282);
          
          doc.text('A Big Engine — Confidential Management Review', 15, 287);
          doc.text(`Page ${pageNum}`, 195, 287, { align: 'right' });

          if (pageNum > 1) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(13, 42, 79);
            doc.text('A BIG ENGINE — ANALYTICAL REPORT', 15, 10);
            
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(148, 163, 184);
            doc.text(`Period: ${dateLabel}`, 195, 10, { align: 'right' });
            
            doc.setDrawColor(13, 42, 79);
            doc.setLineWidth(0.3);
            doc.line(15, 12, 195, 12);
          }
        }
      });
    }

    doc.save(`A_Big_Engine_Analytics_${pdfType}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ── Chart palette ──────────────────────────────────────────────────────────
  const COLORS = ['#0D2A4F', '#f8bf2a', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f97316', '#06b6d4'];
  const CHART_OPTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' as const } },
  };

  const datePresets = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
    { key: '90d', label: '90 Days' },
    { key: 'thisMonth', label: 'This Month' },
    { key: 'lastMonth', label: 'Last Month' },
    { key: 'thisYear', label: 'This Year' },
  ];

  if (isLoading || isHydrated === false || !submissions || !users) {
    return <SkeletonLoader view="ANALYTICS" />;
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Business Intelligence</h1>
          <p className="text-slate-500 mt-1">Revenue analytics, cost breakdown, and reports.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-200 p-1 rounded-lg flex-wrap gap-1">
            {([
              { id: 'dashboard', label: 'Dashboard', icon: <IconChartBar className="w-4 h-4" /> },
              { id: 'sales-kpi', label: 'Sales KPI Trends', icon: <IconTrendingUp className="w-4 h-4" /> },
              { id: 'monthly', label: 'Monthly Summary', icon: <IconCalendar className="w-4 h-4" /> },
              { id: 'profit-loss', label: 'Cost Analysis', icon: <IconFileAnalytics className="w-4 h-4" /> },
              { id: 'agent-earnings', label: 'Agent Earnings', icon: <IconTrophy className="w-4 h-4" /> },
              { id: 'efficiency', label: 'Labor Analytics', icon: <IconClock className="w-4 h-4" /> },
              { id: 'table', label: 'Ledger', icon: <IconTable className="w-4 h-4" /> },
              { id: 'reports', label: 'Reports', icon: <IconDownload className="w-4 h-4" /> },
            ] as { id: typeof view; label: string; icon: React.ReactNode }[]).map(tab => (
              <button key={tab.id} onClick={() => setView(tab.id)}
                className={`px-3 py-2 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${view === tab.id ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      {view !== 'monthly' && (
        <Card title="">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {datePresets.map(p => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${activePreset === p.key ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300 hover:border-brand-blue hover:text-brand-blue'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Input label="From" name="startDate" type="date" value={filters.startDate} onChange={handleFilterChange} className="!mb-0" />
              <Input label="To" name="endDate" type="date" value={filters.endDate} onChange={handleFilterChange} className="!mb-0" />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select name="statusFilter" value={filters.statusFilter} onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent">
                  <option value="all">All Active</option>
                  <option value="completed">Completed Only</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                <select name="user" value={filters.user} onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent">
                  <option value="">All Agents</option>
                  {safeUsers.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
                <select name="serviceType" value={filters.serviceType} onChange={handleFilterChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent">
                  <option value="">All Services</option>
                  {safeServiceTemplates.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              {filteredSubmissions.length} {filters.statusFilter === 'completed' ? 'completed' : 'active'} jobs in period
              {' '}({allCompleted.length} completed of {allActive.length} total)
              {' '}· comparing to previous {activePreset === 'custom' ? 'equivalent' : 'period'}
            </p>
          </div>
        </Card>
      )}

      {/* ── Dashboard ───────────────────────────────────────────────────────── */}
      {view === 'dashboard' && (
        <div className="space-y-5">
          {/* Quick link to Monthly Summary */}
          <div className="bg-gradient-to-r from-brand-blue/10 via-brand-accent/10 to-purple-50 p-4 rounded-xl border border-brand-blue/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-brand-blue text-white rounded-lg shadow-sm">
                <IconCalendar className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">Monthly Revenue & Service Completion Analytics</h4>
                <p className="text-xs text-slate-600">Track month-by-month financial profit/loss, operating costs, and completion volume trends.</p>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setView('monthly')}
              className="flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto text-xs font-bold"
            >
              Open Monthly Summary →
            </Button>
          </div>

          {/* KPI Row 1 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Total Revenue" value={`₹${kpis.revenue.toLocaleString('en-IN')}`}
              icon={<IconReceipt className="w-5 h-5 text-green-600" />} iconBg="bg-green-100"
              trend={{ value: kpis.revTrend, label: 'vs prev period' }}
              sub={`${kpis.count} jobs`} />
            <KpiCard title="Operating Cost" value={`₹${kpis.cost.toLocaleString('en-IN')}`}
              icon={<IconClock className="w-5 h-5 text-red-600" />} iconBg="bg-red-100"
              sub={`${kpis.revenue > 0 ? ((kpis.cost / kpis.revenue) * 100).toFixed(1) : 0}% of revenue`} />
            <KpiCard title="Net Profit" value={`₹${kpis.profit.toLocaleString('en-IN')}`}
              icon={<IconChartBar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100"
              sub={`${kpis.margin.toFixed(1)}% margin`}
              highlight={kpis.margin > 30} />
            <KpiCard title={filters.statusFilter === 'completed' ? 'Jobs Closed' : 'Jobs in Period'} value={kpis.count.toString()}
              icon={<IconCheck className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-100"
              trend={{ value: kpis.countTrend, label: 'vs prev period' }}
              sub={`₹${kpis.revPerJob.toFixed(0)} avg/job`} />
          </div>

          {/* KPI Row 1.5: Order-Wise Payment Modes & Balance Breakdown */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Cash Collected"
              value={`₹${kpis.totalCash.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<span className="text-xl">💵</span>}
              iconBg="bg-emerald-100"
              sub="Physical Cash in Hand"
            />
            <KpiCard
              title="Total Bank / Online"
              value={`₹${kpis.totalBank.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<span className="text-xl">💳</span>}
              iconBg="bg-indigo-100"
              sub="Bank, UPI & Gateway"
            />
            <KpiCard
              title="Realized Balance"
              value={`₹${kpis.totalRealizedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<span className="text-xl">🏦</span>}
              iconBg="bg-emerald-100"
              sub={`${kpis.paidOrdersCount} Paid Orders Collected`}
              highlight={true}
            />
            <KpiCard
              title="Payment Pending Balance"
              value={`₹${kpis.totalPendingPayment.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<span className="text-xl">⏳</span>}
              iconBg="bg-amber-100"
              sub={`${kpis.pendingOrdersCount} Orders Awaiting Clearance`}
            />
          </div>

          {/* KPI Row 2 */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Avg Revenue / Job" value={`₹${kpis.revPerJob.toFixed(0)}`}
              icon={<IconReceipt className="w-5 h-5 text-indigo-600" />} iconBg="bg-indigo-100" />
            <KpiCard title="Avg Profit / Job"
              value={`₹${kpis.count > 0 ? (kpis.profit / kpis.count).toFixed(0) : '0'}`}
              icon={<IconChartBar className="w-5 h-5 text-teal-600" />} iconBg="bg-teal-100" />
            <KpiCard title="Top Agent"
              value={kpis.bestAgent ? kpis.bestAgent[0] : 'N/A'}
              icon={<IconUsers className="w-5 h-5 text-amber-600" />} iconBg="bg-amber-100"
              sub={kpis.bestAgent ? `₹${kpis.bestAgent[1].toLocaleString('en-IN')}` : ''} />
            <KpiCard title="Top Service"
              value={kpis.topSvc ? kpis.topSvc[0] : 'N/A'}
              icon={<IconCheck className="w-5 h-5 text-rose-600" />} iconBg="bg-rose-100"
              sub={kpis.topSvc ? `${kpis.topSvc[1]} jobs` : ''} />
          </div>

          {/* Cost Breakdown Strip */}
          {costBreakdown.total > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cost Breakdown</p>
              <div className="grid grid-cols-3 gap-4 mb-3">
                {[
                  { label: 'Material', value: costBreakdown.material, color: 'bg-red-500' },
                  { label: 'Labour', value: costBreakdown.labor, color: 'bg-orange-400' },
                  { label: 'Other / Overheads', value: costBreakdown.dynamic, color: 'bg-amber-400' },
                ].map(c => (
                  <div key={c.label}>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span className="font-semibold">{c.label}</span>
                      <span>₹{c.value.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${c.color} rounded-full`}
                        style={{ width: `${costBreakdown.total > 0 ? (c.value / costBreakdown.total) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {costBreakdown.total > 0 ? ((c.value / costBreakdown.total) * 100).toFixed(1) : 0}% of total cost
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2">
              <Card title="Revenue vs Cost vs Profit Trend">
                <ChartComponent type="line" height={280}
                  data={{
                    labels: chartData.timeline.labels,
                    datasets: [
                      { label: 'Revenue (₹)', data: chartData.timeline.revenue, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, pointRadius: 2 },
                      { label: 'Cost (₹)', data: chartData.timeline.cost, borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.08)', fill: true, tension: 0.4, pointRadius: 2 },
                      { label: 'Profit (₹)', data: chartData.timeline.profit, borderColor: '#0D2A4F', backgroundColor: 'rgba(13,42,79,0.06)', fill: true, tension: 0.4, pointRadius: 2 },
                    ],
                  }}
                  options={{ ...CHART_OPTS, plugins: { legend: { position: 'top' } } }}
                />
              </Card>
            </div>
            <Card title="Service Mix">
              <ChartComponent type="doughnut" height={280}
                data={{
                  labels: chartData.services.labels,
                  datasets: [{ data: chartData.services.data, backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff' }],
                }}
                options={{ ...CHART_OPTS, cutout: '55%', plugins: { legend: { position: 'bottom' } } }}
              />
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Agent Revenue Performance">
              {chartData.agents.labels.length > 0 ? (
                <ChartComponent type="bar" height={240}
                  data={{
                    labels: chartData.agents.labels,
                    datasets: [
                      { label: 'Revenue (₹)', data: chartData.agents.revenue, backgroundColor: COLORS[0], borderRadius: 5 },
                      { label: 'Jobs', data: chartData.agents.jobs, backgroundColor: COLORS[1], borderRadius: 5, yAxisID: 'y1' },
                    ],
                  }}
                  options={{
                    ...CHART_OPTS,
                    scales: {
                      y: { beginAtZero: true, title: { display: true, text: 'Revenue (₹)' } },
                      y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Jobs' }, grid: { drawOnChartArea: false } },
                    },
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No agent data for period</div>
              )}
            </Card>
            <Card title="Jobs by Day of Week">
              <ChartComponent type="bar" height={240}
                data={{
                  labels: chartData.dow.labels,
                  datasets: [{
                    label: 'Jobs',
                    data: chartData.dow.data,
                    backgroundColor: chartData.dow.data.map((v, i) => v === Math.max(...chartData.dow.data) ? '#f8bf2a' : '#0D2A4F'),
                    borderRadius: 6,
                  }],
                }}
                options={{ ...CHART_OPTS, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
              />
            </Card>
          </div>

          {/* Sales Agents Weekly Trends vs KPI Thresholds (Recharts) */}
          <SalesAgentKpiTrendChart
            submissions={safeSubmissions}
            users={safeUsers}
            settings={settings}
          />

          {/* Jobs per day bar */}
          <Card title="Daily Job Volume">
            <ChartComponent type="bar" height={180}
              data={{
                labels: chartData.timeline.labels,
                datasets: [{ label: 'Jobs', data: chartData.timeline.jobs, backgroundColor: 'rgba(13,42,79,0.7)', borderRadius: 4 }],
              }}
              options={{ ...CHART_OPTS, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
            />
          </Card>
        </div>
      )}

      {/* ── Sales KPI Trends Dedicated View ──────────────────────────── */}
      {view === 'sales-kpi' && (
        <div className="space-y-5">
          <SalesAgentKpiTrendChart
            submissions={safeSubmissions}
            users={safeUsers}
            settings={settings}
          />
        </div>
      )}

      {/* ── Monthly Summary Tab ───────────────────────────────────────────── */}
      {view === 'monthly' && (
        <MonthlyAnalyticsSummary
          submissions={safeSubmissions}
          profitLossData={safeProfitLossData}
          users={safeUsers}
          serviceTemplates={safeServiceTemplates}
          predefinedCosts={safePredefinedCosts}
          settings={settings}
          onUpdateOrder={onUpdateOrder}
        />
      )}

      {/* ── Cost Analysis Tab ──────────────────────────────────────────────── */}
      {view === 'profit-loss' && (
        <ProfitLossPage
          submissions={filteredSubmissions}
          profitLossData={safeProfitLossData}
          onSave={onSaveProfitLoss}
          predefinedCosts={safePredefinedCosts}
          onUpdatePredefinedCosts={onUpdatePredefinedCosts}
        />
      )}

      {/* ── Ledger Tab ─────────────────────────────────────────────────────── */}
      {view === 'table' && <DataTableReport submissions={filteredSubmissions} profitLossData={safeProfitLossData} />}

      {/* ── Agent Earnings Tab ─────────────────────────────────────────────── */}
      {view === 'agent-earnings' && (
        <AgentEarningsTracker 
          submissions={filteredSubmissions} 
          users={safeUsers} 
          serviceTemplates={safeServiceTemplates} 
          agentRankThresholds={settings?.agentRankThresholds}
          settings={settings}
          onUpdateOrder={onUpdateOrder}
          profitLossData={safeProfitLossData}
          onSaveProfitLoss={onSaveProfitLoss}
        />
      )}

      {/* ── Labor Analytics Tab ────────────────────────────────────────────── */}
      {view === 'efficiency' && (
        <LaborAnalyticsView
          submissions={filteredSubmissions}
          users={safeUsers}
          serviceTemplates={safeServiceTemplates}
          settings={settings}
          onUpdateOrder={onUpdateOrder}
        />
      )}

      {/* ── Reports Tab ─────────────────────────────────────────────────────── */}
      {view === 'reports' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quick Stats for reports */}
            <Card title="Report Summary">
              <div className="space-y-3 text-sm">
                {[
                  { label: 'Period', value: `${filters.startDate} → ${filters.endDate}` },
                  { label: 'Filtered Jobs', value: filteredSubmissions.length.toString() },
                  { label: 'Total Revenue', value: `₹${kpis.revenue.toLocaleString('en-IN')}` },
                  { label: 'Net Profit', value: `₹${kpis.profit.toLocaleString('en-IN')} (${kpis.margin.toFixed(1)}%)` },
                  { label: 'Total Cost', value: `₹${kpis.cost.toLocaleString('en-IN')}` },
                  { label: 'Agent Filter', value: filters.user || 'All Agents' },
                  { label: 'Service Filter', value: filters.serviceType || 'All Services' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-500 font-medium">{row.label}</span>
                    <span className="font-semibold text-slate-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Export options */}
            <Card title="Export Options">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Download detailed reports for the current filtered period.</p>
                <div className="space-y-2">
                  {[
                    { label: 'Excel — All Jobs Summary', desc: 'One row per completed order with costs & profit', format: 'csv' as FileFormat, type: 'summary' as ReportType },
                    { label: 'Excel — Agent Performance', desc: 'Summary + one sheet per agent', format: 'csv' as FileFormat, type: 'agent' as ReportType },
                    { label: 'Excel — Service Breakdown', desc: 'One sheet per service type', format: 'csv' as FileFormat, type: 'service' as ReportType },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => handleExport(opt.format, opt.type, 'filtered', 'performance')}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-brand-accent hover:bg-brand-accent/5 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-blue">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.desc}</p>
                      </div>
                      <IconDownload className="w-4 h-4 text-slate-400 group-hover:text-brand-blue flex-shrink-0" />
                    </button>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Print / PDF</p>
                  {[
                    { label: 'Agent Performance Report', type: 'performance' as PDFReportType },
                    { label: 'Service Popularity Report', type: 'services' as PDFReportType },
                    { label: 'Daily Revenue Summary', type: 'revenue' as PDFReportType },
                  ].map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => handleExport('pdf', 'summary', 'filtered', opt.type)}
                      className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-brand-accent hover:bg-brand-accent/5 transition-all group"
                    >
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-brand-blue">{opt.label}</p>
                        <p className="text-xs text-slate-500">Opens print dialog (save as PDF)</p>
                      </div>
                      <IconFileAnalytics className="w-4 h-4 text-slate-400 group-hover:text-brand-blue flex-shrink-0" />
                    </button>
                  ))}
                </div>

                <div className="pt-2 border-t">
                  <button
                    onClick={() => setIsExportOpen(true)}
                    className="w-full py-2.5 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:bg-brand-blue/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <IconDownload className="w-4 h-4" /> Advanced Export Options
                  </button>
                </div>
              </div>
            </Card>
          </div>

          {/* Agent table */}
          <Card title="Agent Performance Summary">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['Agent', 'Rank', 'Jobs', 'Revenue', 'Avg/Job', 'Net Profit', 'Margin', 'Revenue Share'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {chartData.agents.labels.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No data</td></tr>
                  ) : chartData.agents.labels.map((ag, i) => {
                    const rev = chartData.agents.revenue[i];
                    const jobs = chartData.agents.jobs[i];
                    const agCost = filteredSubmissions.filter(s => s.assignedTo === ag).reduce((s, r) => s + getCost(r), 0);
                    const profit = rev - agCost;
                    const margin = rev > 0 ? (profit / rev) * 100 : 0;
                    return (
                      <tr key={ag} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{ag}</td>
                        <td className="px-4 py-3">
                          <AgentRankBadge earned={rev * 0.30} thresholds={settings?.agentRankThresholds} />
                        </td>
                        <td className="px-4 py-3 text-slate-600">{jobs}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">₹{rev.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-slate-600">₹{jobs > 0 ? (rev / jobs).toFixed(0) : 0}</td>
                        <td className={`px-4 py-3 font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>₹{profit.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${margin >= 30 ? 'bg-green-500' : margin >= 15 ? 'bg-amber-400' : 'bg-red-400'}`}
                                style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 w-10">{margin.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {kpis.revenue > 0 ? ((rev / kpis.revenue) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Service Efficiency Tab ─────────────────────────────────────────── */}
      {view === 'efficiency' && (
        <div className="space-y-5">
          {/* Efficiency KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Overall Avg Completion"
              value={formatDuration(efficiencyMetrics.avgHours)}
              icon={<IconClock className="w-5 h-5 text-brand-blue" />}
              iconBg="bg-blue-100"
              sub={`Measured across ${efficiencyMetrics.totalJobs} jobs`}
            />
            <KpiCard
              title="Fastest Agent"
              value={efficiencyMetrics.fastest.agent}
              icon={<IconTrophy className="w-5 h-5 text-green-600" />}
              iconBg="bg-green-100"
              sub={`Avg: ${formatDuration(efficiencyMetrics.fastest.hours)}`}
            />
            <KpiCard
              title="Focus Area (Slowest)"
              value={efficiencyMetrics.slowest.agent}
              icon={<IconAlertTriangle className="w-5 h-5 text-red-600" />}
              iconBg="bg-red-100"
              sub={`Avg: ${formatDuration(efficiencyMetrics.slowest.hours)}`}
            />
            <KpiCard
              title="Total Jobs Measured"
              value={efficiencyMetrics.totalJobs.toString()}
              icon={<IconCheck className="w-5 h-5 text-purple-600" />}
              iconBg="bg-purple-100"
              sub="Completed orders"
            />
          </div>

          {/* Productivity & Efficiency Chart */}
          <div className="grid grid-cols-1 gap-5">
            <Card title="Average Service Duration per Agent (Hours)">
              {efficiencyData.length > 0 ? (
                <ChartComponent
                  type="bar"
                  height={240}
                  data={{
                    labels: efficiencyData.map(d => d.agentName),
                    datasets: [
                      {
                        label: 'Average Duration (Hours)',
                        data: efficiencyData.map(d => Number(d.avgHours.toFixed(2))),
                        backgroundColor: '#3b82f6',
                        borderRadius: 5,
                      }
                    ]
                  }}
                  options={{
                    ...CHART_OPTS,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Hours' }
                      }
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  No efficiency data available for selected filters. Ensure orders have transitioned from Assigned/InProgress to Completed.
                </div>
              )}
            </Card>
          </div>

          {/* Efficiency Ledger and Collapsible Individual Jobs List */}
          <Card title="Agent Productivity & Completion Details">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Jobs Measured</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Completion Time</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Speed Rating</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {efficiencyData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No efficiency data available for selected period and filters.
                      </td>
                    </tr>
                  ) : (
                    efficiencyData.map(d => {
                      const isExpanded = !!expandedAgents[d.agentName];
                      return (
                        <React.Fragment key={d.agentName}>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800">{d.agentName}</td>
                            <td className="px-4 py-3 text-slate-600">{d.count}</td>
                            <td className="px-4 py-3 font-bold text-slate-800">
                              {formatDuration(d.avgHours)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-bold border ${getSpeedColor(d.avgHours)}`}>
                                {getSpeedLabel(d.avgHours)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => toggleAgentExpand(d.agentName)}
                                className="px-3 py-1.5 text-xs font-semibold text-brand-blue border border-slate-200 rounded-md hover:bg-slate-50 transition-all"
                              >
                                {isExpanded ? 'Hide Details' : 'View Jobs'}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded list of jobs */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50/50 p-4">
                                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                  <div className="px-4 py-3 bg-slate-100/55 border-b border-slate-200 flex justify-between items-center">
                                    <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                                      Detailed Job Log for {d.agentName}
                                    </h5>
                                    <span className="text-xs text-slate-500 font-semibold">
                                      {d.count} jobs total
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs text-left">
                                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                                        <tr>
                                          <th className="px-4 py-2.5">ID</th>
                                          <th className="px-4 py-2.5">Customer</th>
                                          <th className="px-4 py-2.5">Car & Reg</th>
                                          <th className="px-4 py-2.5">Services</th>
                                          <th className="px-4 py-2.5">Completed On</th>
                                          <th className="px-4 py-2.5 text-right">Duration</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-slate-600">
                                        {d.jobsList.map(job => (
                                          <tr key={job.id} className="hover:bg-slate-50/55">
                                            <td className="px-4 py-2.5 font-semibold text-slate-800">#{job.id}</td>
                                            <td className="px-4 py-2.5 font-medium">{job.customerName}</td>
                                            <td className="px-4 py-2.5">{job.carBrandModel} ({job.carNumber})</td>
                                            <td className="px-4 py-2.5 max-w-xs truncate" title={job.services.join(', ')}>
                                              {job.services.join(', ')}
                                            </td>
                                            <td className="px-4 py-2.5">{job.date}</td>
                                            <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                                              {formatDuration(job.durationHours)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {isExportOpen && (
        <ExportReportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          onExport={handleExport}
          isExporting={isExporting}
        />
      )}
    </div>
  );
};

export default AnalyticsPage;
