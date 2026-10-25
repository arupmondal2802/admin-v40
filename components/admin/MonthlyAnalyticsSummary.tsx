import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Service, ServiceStatus, User, ServiceTemplate, ProfitLoss, PredefinedCost, Settings } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  IconCalendar, IconReceipt, IconChartBar, IconCheck, IconClock,
  IconDownload, IconUsers, IconFilter, IconChevronDown, IconChevronUp,
  IconTrophy, IconFileAnalytics, IconRefresh, IconArrowUp, IconArrowDown,
  IconEngine, IconSparkles
} from '../ui/Icon';
import { getServiceLocalDateStr, getLocalTodayStr } from '../../utils/dateTimeUtils';

declare const Chart: any;
declare const XLSX: any;

export interface MonthlyAnalyticsSummaryProps {
  submissions: Service[];
  profitLossData: ProfitLoss[];
  users: Omit<User, 'password'>[];
  serviceTemplates: ServiceTemplate[];
  predefinedCosts?: PredefinedCost[];
  settings?: Settings;
  onUpdateOrder?: (service: Service) => void;
}

export interface MonthlyDataPoint {
  monthKey: string; // 'YYYY-MM'
  year: number;
  monthNum: number; // 1-12
  monthLabel: string; // 'Aug 2026'
  fullMonthLabel: string; // 'August 2026'
  completionCount: number;
  activeJobsCount: number;
  totalRevenue: number;
  materialCost: number;
  laborCost: number;
  otherExpenses: number;
  totalCost: number;
  netProfit: number;
  marginPct: number;
  avgRevenuePerJob: number;
  avgProfitPerJob: number;
  revenueMomGrowth: number; // % change vs prev month
  completionMomGrowth: number; // % change vs prev month
  profitMomGrowth: number;
  topServices: { name: string; count: number; revenue: number }[];
  topAgents: { name: string; count: number; revenue: number }[];
  jobs: Service[];
}

// ── Chart Component ──────────────────────────────────────────────────────────
const ChartComponent: React.FC<{ type: string; data: any; options: any; height?: number }> = ({ type, data, options, height = 280 }) => {
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

export const MonthlyAnalyticsSummary: React.FC<MonthlyAnalyticsSummaryProps> = ({
  submissions = [],
  profitLossData = [],
  users = [],
  serviceTemplates = [],
  settings,
}) => {
  const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions : [], [submissions]);
  const safeProfitLossData = useMemo(() => Array.isArray(profitLossData) ? profitLossData : [], [profitLossData]);
  const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
  const safeServiceTemplates = useMemo(() => Array.isArray(serviceTemplates) ? serviceTemplates : [], [serviceTemplates]);

  // Filters
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'completed' | 'all'>('completed');
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<'month-desc' | 'month-asc' | 'revenue-desc' | 'completions-desc' | 'profit-desc'>('month-desc');

  // Helper to extract cost using ProfitLoss record or fallbacks
  const getServiceCost = useCallback((s: Service) => {
    const pl = safeProfitLossData.find(p => p.serviceId === s.submissionId);
    if (pl) {
      const mat = Number(pl.materialCost) || 0;
      const lab = Number(pl.laborCost) || 0;
      const other = Number(pl.otherExpenses) || 0;
      const dynSum = (Array.isArray(pl.dynamicCosts) ? pl.dynamicCosts : []).reduce((acc, c) => acc + (Number(c.value) || 0), 0);
      return {
        material: mat,
        labor: lab,
        other: other + dynSum,
        total: mat + lab + other + dynSum,
      };
    }
    const mat = Number(s.tyreMaterialCost) || 0;
    const lab = Number(s.tyreLaborCost) || 0;
    return {
      material: mat,
      labor: lab,
      other: 0,
      total: mat + lab,
    };
  }, [safeProfitLossData]);

  // Filter raw jobs first based on agent / service / status
  const baseFilteredJobs = useMemo(() => {
    return safeSubmissions.filter(s => {
      if (!s || s.isDeleted) return false;
      if (statusFilter === 'completed' && s.status !== ServiceStatus.Completed) return false;
      if (statusFilter === 'all' && s.status === ServiceStatus.Draft) return false;

      if (selectedAgent && s.assignedTo !== selectedAgent && s.secondaryAssignee !== selectedAgent) {
        return false;
      }

      if (selectedService) {
        const selections = Array.isArray(s.serviceSelection) ? s.serviceSelection : [];
        if (!selections.includes(selectedService)) return false;
      }

      return true;
    });
  }, [safeSubmissions, statusFilter, selectedAgent, selectedService]);

  // Discover all available years in data
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    safeSubmissions.forEach(s => {
      if (!s || s.isDeleted) return;
      const dateStr = getServiceLocalDateStr(s);
      if (dateStr && dateStr.length >= 4) {
        const y = parseInt(dateStr.slice(0, 4), 10);
        if (!isNaN(y) && y >= 2000 && y <= 2100) {
          yearsSet.add(y);
        }
      }
    });
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    if (years.length === 0) {
      years.push(new Date().getFullYear());
    }
    return years;
  }, [safeSubmissions]);

  // Group into Monthly Data Points
  const monthlyAggregations = useMemo(() => {
    const monthMap = new Map<string, {
      year: number;
      monthNum: number;
      completionCount: number;
      activeJobsCount: number;
      totalRevenue: number;
      materialCost: number;
      laborCost: number;
      otherExpenses: number;
      jobs: Service[];
      servicesCount: Record<string, { count: number; rev: number }>;
      agentsCount: Record<string, { count: number; rev: number }>;
    }>();

    baseFilteredJobs.forEach(s => {
      const dateStr = getServiceLocalDateStr(s);
      if (!dateStr || dateStr.length < 7) return;
      const monthKey = dateStr.slice(0, 7); // 'YYYY-MM'
      const year = parseInt(monthKey.slice(0, 4), 10);
      const monthNum = parseInt(monthKey.slice(5, 7), 10);

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          year,
          monthNum,
          completionCount: 0,
          activeJobsCount: 0,
          totalRevenue: 0,
          materialCost: 0,
          laborCost: 0,
          otherExpenses: 0,
          jobs: [],
          servicesCount: {},
          agentsCount: {},
        });
      }

      const entry = monthMap.get(monthKey)!;
      entry.activeJobsCount++;
      const isCompleted = s.status === ServiceStatus.Completed;
      if (isCompleted || statusFilter === 'all') {
        if (isCompleted) entry.completionCount++;
        const rev = Number(s.grandTotal) || 0;
        entry.totalRevenue += rev;
        entry.jobs.push(s);

        const costs = getServiceCost(s);
        entry.materialCost += costs.material;
        entry.laborCost += costs.labor;
        entry.otherExpenses += costs.other;

        // Service distribution
        const selections = Array.isArray(s.serviceSelection) ? s.serviceSelection : [];
        selections.forEach(sv => {
          if (!entry.servicesCount[sv]) entry.servicesCount[sv] = { count: 0, rev: 0 };
          entry.servicesCount[sv].count++;
          entry.servicesCount[sv].rev += rev / Math.max(1, selections.length);
        });

        // Agent distribution
        const ag = s.assignedTo || 'Unassigned';
        if (!entry.agentsCount[ag]) entry.agentsCount[ag] = { count: 0, rev: 0 };
        entry.agentsCount[ag].count++;
        entry.agentsCount[ag].rev += rev;
      }
    });

    // Chronologically sort month keys to compute month-over-month growth correctly
    const sortedKeys = Array.from(monthMap.keys()).sort();
    const result: MonthlyDataPoint[] = [];

    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesFull = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let prevPoint: MonthlyDataPoint | null = null;

    sortedKeys.forEach(mKey => {
      const raw = monthMap.get(mKey)!;
      const totalCost = raw.materialCost + raw.laborCost + raw.otherExpenses;
      const netProfit = raw.totalRevenue - totalCost;
      const marginPct = raw.totalRevenue > 0 ? (netProfit / raw.totalRevenue) * 100 : 0;
      const count = statusFilter === 'completed' ? raw.completionCount : raw.activeJobsCount;
      const avgRevenuePerJob = count > 0 ? raw.totalRevenue / count : 0;
      const avgProfitPerJob = count > 0 ? netProfit / count : 0;

      // MoM growth
      let revenueMomGrowth = 0;
      let completionMomGrowth = 0;
      let profitMomGrowth = 0;
      if (prevPoint && prevPoint.totalRevenue > 0) {
        revenueMomGrowth = ((raw.totalRevenue - prevPoint.totalRevenue) / prevPoint.totalRevenue) * 100;
      }
      if (prevPoint && prevPoint.completionCount > 0) {
        completionMomGrowth = ((count - prevPoint.completionCount) / prevPoint.completionCount) * 100;
      }
      if (prevPoint && prevPoint.netProfit !== 0) {
        profitMomGrowth = ((netProfit - prevPoint.netProfit) / Math.abs(prevPoint.netProfit)) * 100;
      }

      // Top services
      const topServices = Object.entries(raw.servicesCount)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.rev }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Top agents
      const topAgents = Object.entries(raw.agentsCount)
        .map(([name, data]) => ({ name, count: data.count, revenue: data.rev }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      const dp: MonthlyDataPoint = {
        monthKey: mKey,
        year: raw.year,
        monthNum: raw.monthNum,
        monthLabel: `${monthNamesShort[raw.monthNum - 1]} ${raw.year}`,
        fullMonthLabel: `${monthNamesFull[raw.monthNum - 1]} ${raw.year}`,
        completionCount: count,
        activeJobsCount: raw.activeJobsCount,
        totalRevenue: raw.totalRevenue,
        materialCost: raw.materialCost,
        laborCost: raw.laborCost,
        otherExpenses: raw.otherExpenses,
        totalCost,
        netProfit,
        marginPct,
        avgRevenuePerJob,
        avgProfitPerJob,
        revenueMomGrowth,
        completionMomGrowth,
        profitMomGrowth,
        topServices,
        topAgents,
        jobs: raw.jobs,
      };

      result.push(dp);
      prevPoint = dp;
    });

    return result;
  }, [baseFilteredJobs, statusFilter, getServiceCost]);

  // Filter monthly list by selected year
  const displayedMonthlyData = useMemo(() => {
    let list = monthlyAggregations;
    if (selectedYear !== 'ALL') {
      const yr = parseInt(selectedYear, 10);
      list = list.filter(d => d.year === yr);
    }

    const sorted = [...list];
    switch (sortBy) {
      case 'month-asc':
        sorted.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        break;
      case 'revenue-desc':
        sorted.sort((a, b) => b.totalRevenue - a.totalRevenue);
        break;
      case 'completions-desc':
        sorted.sort((a, b) => b.completionCount - a.completionCount);
        break;
      case 'profit-desc':
        sorted.sort((a, b) => b.netProfit - a.netProfit);
        break;
      case 'month-desc':
      default:
        sorted.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        break;
    }
    return sorted;
  }, [monthlyAggregations, selectedYear, sortBy]);

  // Overall totals across displayed data
  const summaryTotals = useMemo(() => {
    const totalRev = displayedMonthlyData.reduce((acc, m) => acc + m.totalRevenue, 0);
    const totalCost = displayedMonthlyData.reduce((acc, m) => acc + m.totalCost, 0);
    const totalMaterial = displayedMonthlyData.reduce((acc, m) => acc + m.materialCost, 0);
    const totalLabor = displayedMonthlyData.reduce((acc, m) => acc + m.laborCost, 0);
    const totalOther = displayedMonthlyData.reduce((acc, m) => acc + m.otherExpenses, 0);
    const totalCompletions = displayedMonthlyData.reduce((acc, m) => acc + m.completionCount, 0);
    const netProfit = totalRev - totalCost;
    const margin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;
    const monthCount = displayedMonthlyData.length;
    const avgMonthlyRev = monthCount > 0 ? totalRev / monthCount : 0;
    const avgMonthlyCompletions = monthCount > 0 ? totalCompletions / monthCount : 0;
    const avgTicket = totalCompletions > 0 ? totalRev / totalCompletions : 0;

    // Peak months
    const peakRevMonth = [...displayedMonthlyData].sort((a, b) => b.totalRevenue - a.totalRevenue)[0];
    const peakCompletionsMonth = [...displayedMonthlyData].sort((a, b) => b.completionCount - a.completionCount)[0];

    return {
      totalRev,
      totalCost,
      totalMaterial,
      totalLabor,
      totalOther,
      totalCompletions,
      netProfit,
      margin,
      monthCount,
      avgMonthlyRev,
      avgMonthlyCompletions,
      avgTicket,
      peakRevMonth,
      peakCompletionsMonth,
    };
  }, [displayedMonthlyData]);

  // Chronological data for charts (always left to right)
  const chartChronologicalData = useMemo(() => {
    return [...displayedMonthlyData].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [displayedMonthlyData]);

  // Toggle single month expansion
  const toggleMonthExpand = (mKey: string) => {
    setExpandedMonths(prev => ({ ...prev, [mKey]: !prev[mKey] }));
  };

  // Toggle expand all
  const toggleExpandAll = () => {
    const allExpanded = displayedMonthlyData.every(d => expandedMonths[d.monthKey]);
    if (allExpanded) {
      setExpandedMonths({});
    } else {
      const next: Record<string, boolean> = {};
      displayedMonthlyData.forEach(d => { next[d.monthKey] = true; });
      setExpandedMonths(next);
    }
  };

  // ── Export to Excel (.xlsx) ──────────────────────────────────────────────
  const handleExportExcel = () => {
    if (typeof XLSX === 'undefined') {
      alert('Excel export library is loading. Please try again in a moment.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    // Sheet 1: Monthly Summary
    const summaryRows = displayedMonthlyData.map(m => ({
      'Month': m.fullMonthLabel,
      'Completed Services': m.completionCount,
      'Gross Revenue (₹)': Math.round(m.totalRevenue),
      'Material Cost (₹)': Math.round(m.materialCost),
      'Labour Cost (₹)': Math.round(m.laborCost),
      'Overhead / Dynamic Cost (₹)': Math.round(m.otherExpenses),
      'Total Cost (₹)': Math.round(m.totalCost),
      'Net Profit (₹)': Math.round(m.netProfit),
      'Profit Margin (%)': m.marginPct.toFixed(1) + '%',
      'Avg Revenue / Job (₹)': Math.round(m.avgRevenuePerJob),
      'Avg Profit / Job (₹)': Math.round(m.avgProfitPerJob),
      'Revenue MoM Growth (%)': m.revenueMomGrowth ? `${m.revenueMomGrowth >= 0 ? '+' : ''}${m.revenueMomGrowth.toFixed(1)}%` : 'N/A',
      'Completion MoM Growth (%)': m.completionMomGrowth ? `${m.completionMomGrowth >= 0 ? '+' : ''}${m.completionMomGrowth.toFixed(1)}%` : 'N/A',
    }));

    // Add Totals row
    summaryRows.push({
      'Month': 'TOTAL / AVERAGE',
      'Completed Services': summaryTotals.totalCompletions,
      'Gross Revenue (₹)': Math.round(summaryTotals.totalRev),
      'Material Cost (₹)': Math.round(summaryTotals.totalMaterial),
      'Labour Cost (₹)': Math.round(summaryTotals.totalLabor),
      'Overhead / Dynamic Cost (₹)': Math.round(summaryTotals.totalOther),
      'Total Cost (₹)': Math.round(summaryTotals.totalCost),
      'Net Profit (₹)': Math.round(summaryTotals.netProfit),
      'Profit Margin (%)': summaryTotals.margin.toFixed(1) + '%',
      'Avg Revenue / Job (₹)': Math.round(summaryTotals.avgTicket),
      'Avg Profit / Job (₹)': Math.round(summaryTotals.totalCompletions > 0 ? summaryTotals.netProfit / summaryTotals.totalCompletions : 0),
      'Revenue MoM Growth (%)': '-',
      'Completion MoM Growth (%)': '-',
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Monthly Summary');

    // Sheet 2: Monthly Services Mix
    const serviceMixRows: any[] = [];
    displayedMonthlyData.forEach(m => {
      m.topServices.forEach(s => {
        serviceMixRows.push({
          'Month': m.fullMonthLabel,
          'Service Name': s.name,
          'Jobs Completed': s.count,
          'Estimated Revenue (₹)': Math.round(s.revenue),
          'Share of Month (%)': m.completionCount > 0 ? `${((s.count / m.completionCount) * 100).toFixed(1)}%` : '0%',
        });
      });
    });
    const mixSheet = XLSX.utils.json_to_sheet(serviceMixRows);
    XLSX.utils.book_append_sheet(wb, mixSheet, 'Services Breakdown');

    // Sheet 3: All Jobs in Period
    const allJobsRows: any[] = [];
    displayedMonthlyData.forEach(m => {
      m.jobs.forEach(s => {
        const costs = getServiceCost(s);
        allJobsRows.push({
          'Month': m.monthLabel,
          'Order ID': s.appointmentId?.split('-').pop() || s.submissionId.slice(-6),
          'Date': getServiceLocalDateStr(s),
          'Customer': `${s.customerFirstName || ''} ${s.customerLastName || ''}`.trim(),
          'Vehicle': `${s.carBrandModel || ''} (${s.carNumber || ''})`,
          'Services': (s.serviceSelection || []).join(', '),
          'Agent': s.assignedTo || 'Unassigned',
          'Revenue (₹)': s.grandTotal || 0,
          'Material Cost (₹)': costs.material,
          'Labour Cost (₹)': costs.labor,
          'Other Cost (₹)': costs.other,
          'Total Cost (₹)': costs.total,
          'Net Profit (₹)': (s.grandTotal || 0) - costs.total,
          'Margin (%)': (s.grandTotal || 0) > 0 ? `${((((s.grandTotal || 0) - costs.total) / s.grandTotal) * 100).toFixed(1)}%` : '0%',
        });
      });
    });
    const allJobsSheet = XLSX.utils.json_to_sheet(allJobsRows);
    XLSX.utils.book_append_sheet(wb, allJobsSheet, 'Completed Orders');

    XLSX.writeFile(wb, `monthly_analytics_summary_${selectedYear}_${dateStr}.xlsx`);
  };

  // ── Export / Print PDF Report ────────────────────────────────────────────
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const periodLabel = selectedYear === 'ALL' ? 'All Recorded Months' : `Calendar Year ${selectedYear}`;
    const dateStr = new Date().toLocaleDateString('en-IN');

    // Header Branding
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(13, 42, 79); // #0D2A4F
    doc.text('A BIG ENGINE', 15, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('MONTHLY BUSINESS REVENUE & SERVICE COMPLETION SUMMARY', 15, 25);

    doc.setDrawColor(13, 42, 79);
    doc.setLineWidth(0.7);
    doc.line(15, 28, 195, 28);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Period: ${periodLabel}`, 195, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated: ${dateStr}`, 195, 23, { align: 'right' });

    // Executive Summary Metrics (4 cards)
    const startY = 34;
    const cardW = 42;
    const cardH = 20;
    const gap = 4;
    const labels = ['Total Revenue', 'Completed Services', 'Net Operating Profit', 'Overall Margin'];
    const values = [
      `₹${Math.round(summaryTotals.totalRev).toLocaleString('en-IN')}`,
      `${summaryTotals.totalCompletions} Jobs`,
      `₹${Math.round(summaryTotals.netProfit).toLocaleString('en-IN')}`,
      `${summaryTotals.margin.toFixed(1)}%`
    ];

    for (let i = 0; i < 4; i++) {
      const x = 15 + i * (cardW + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, startY, cardW, cardH, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(labels[i], x + 3.5, startY + 6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(13, 42, 79);
      doc.text(values[i], x + 3.5, startY + 14);
    }

    // Main Table
    const tableHead = [['Month', 'Services', 'Revenue (₹)', 'Cost (₹)', 'Net Profit (₹)', 'Margin', 'Avg/Job', 'MoM Growth']];
    const tableBody = displayedMonthlyData.map(m => [
      m.fullMonthLabel,
      m.completionCount.toString(),
      `₹${Math.round(m.totalRevenue).toLocaleString('en-IN')}`,
      `₹${Math.round(m.totalCost).toLocaleString('en-IN')}`,
      `₹${Math.round(m.netProfit).toLocaleString('en-IN')}`,
      `${m.marginPct.toFixed(1)}%`,
      `₹${Math.round(m.avgRevenuePerJob).toLocaleString('en-IN')}`,
      m.revenueMomGrowth ? `${m.revenueMomGrowth >= 0 ? '+' : ''}${m.revenueMomGrowth.toFixed(1)}%` : '-'
    ]);

    // Add Totals row
    tableBody.push([
      'TOTAL / AVG',
      summaryTotals.totalCompletions.toString(),
      `₹${Math.round(summaryTotals.totalRev).toLocaleString('en-IN')}`,
      `₹${Math.round(summaryTotals.totalCost).toLocaleString('en-IN')}`,
      `₹${Math.round(summaryTotals.netProfit).toLocaleString('en-IN')}`,
      `${summaryTotals.margin.toFixed(1)}%`,
      `₹${Math.round(summaryTotals.avgTicket).toLocaleString('en-IN')}`,
      '-'
    ]);

    autoTable(doc, {
      startY: 60,
      head: tableHead,
      body: tableBody,
      theme: 'striped',
      headStyles: {
        fillColor: [13, 42, 79],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8,
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
        doc.setTextColor(148, 163, 184);
        doc.text('A Big Engine — Confidential Monthly Performance Audit', 15, 287);
        doc.text(`Page ${pageNum}`, 195, 287, { align: 'right' });
      }
    });

    doc.save(`A_Big_Engine_Monthly_Summary_${selectedYear}_${dateStr.replace(/\//g, '-')}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* ── Top Bar & KPI Highlights ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-brand-blue/10 text-brand-blue rounded-lg">
                <IconCalendar className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Monthly Performance & Completion Summary</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Month-by-month financial performance, operating cost analysis from ProfitLoss, and service completion volume.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <IconDownload className="w-3.5 h-3.5 text-green-600" />
              Export Excel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <IconFileAnalytics className="w-3.5 h-3.5 text-brand-blue" />
              Print / PDF
            </Button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
          {/* Year selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Calendar Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="ALL">All Recorded Years</option>
              {availableYears.map(yr => (
                <option key={yr} value={yr.toString()}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Status Scope */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Scope</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="completed">Completed Services Only</option>
              <option value="all">All Active & Completed</option>
            </select>
          </div>

          {/* Service Category */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Service Type</label>
            <select
              value={selectedService}
              onChange={e => setSelectedService(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="">All Services</option>
              {safeServiceTemplates.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Agent Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Agent / Tech</label>
            <select
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="">All Agents</option>
              {safeUsers.map(u => (
                <option key={u.username} value={u.username}>{u.username}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">Sort Months</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
            >
              <option value="month-desc">Newest Month First</option>
              <option value="month-asc">Oldest Month First</option>
              <option value="revenue-desc">Highest Revenue</option>
              <option value="completions-desc">Most Completed Services</option>
              <option value="profit-desc">Highest Net Profit</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Summary KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-700">
              <IconReceipt className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {summaryTotals.monthCount} Months
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">
              ₹{Math.round(summaryTotals.totalRev).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Avg ₹{Math.round(summaryTotals.avgMonthlyRev).toLocaleString('en-IN')} / month
            </p>
          </div>
        </div>

        {/* Total Service Completions */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-purple-100 text-purple-700">
              <IconCheck className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
              Avg {summaryTotals.avgMonthlyCompletions.toFixed(1)} / mo
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Service Completions</p>
            <p className="text-2xl font-bold text-slate-800 mt-0.5">
              {summaryTotals.totalCompletions} <span className="text-sm font-normal text-slate-500">jobs</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Avg ticket: ₹{Math.round(summaryTotals.avgTicket).toLocaleString('en-IN')} / job
            </p>
          </div>
        </div>

        {/* Net Profit & Margin */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-blue-100 text-blue-700">
              <IconChartBar className="w-5 h-5" />
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${summaryTotals.margin >= 30 ? 'bg-emerald-100 text-emerald-800' : summaryTotals.margin >= 15 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
              {summaryTotals.margin.toFixed(1)}% Margin
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Operating Profit</p>
            <p className={`text-2xl font-bold mt-0.5 ${summaryTotals.netProfit >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
              ₹{Math.round(summaryTotals.netProfit).toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Total Cost: ₹{Math.round(summaryTotals.totalCost).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Peak Performance Month */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-amber-100 text-amber-700">
              <IconTrophy className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
              Top Month
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Highest Revenue Month</p>
            <p className="text-lg font-bold text-slate-800 mt-0.5 truncate">
              {summaryTotals.peakRevMonth ? summaryTotals.peakRevMonth.fullMonthLabel : 'N/A'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {summaryTotals.peakRevMonth ? (
                <>₹{Math.round(summaryTotals.peakRevMonth.totalRevenue).toLocaleString('en-IN')} · {summaryTotals.peakRevMonth.completionCount} jobs</>
              ) : 'No data'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Interactive Monthly Visual Charts ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue vs Operating Cost vs Net Profit */}
        <div className="lg:col-span-2">
          <Card title="Monthly Revenue vs Cost vs Net Profit Trend">
            {chartChronologicalData.length > 0 ? (
              <ChartComponent
                type="bar"
                height={280}
                data={{
                  labels: chartChronologicalData.map(d => d.monthLabel),
                  datasets: [
                    {
                      label: 'Gross Revenue (₹)',
                      data: chartChronologicalData.map(d => Math.round(d.totalRevenue)),
                      backgroundColor: '#10b981',
                      borderRadius: 4,
                    },
                    {
                      label: 'Total Cost (₹)',
                      data: chartChronologicalData.map(d => Math.round(d.totalCost)),
                      backgroundColor: '#f43f5e',
                      borderRadius: 4,
                    },
                    {
                      label: 'Net Profit (₹)',
                      data: chartChronologicalData.map(d => Math.round(d.netProfit)),
                      backgroundColor: '#0D2A4F',
                      borderRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: {
                      callbacks: {
                        label: (context: any) => `${context.dataset.label}: ₹${Number(context.raw).toLocaleString('en-IN')}`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (v: any) => `₹${(v / 1000).toFixed(0)}k`,
                        font: { size: 10 },
                      },
                    },
                    x: {
                      ticks: { font: { size: 10 } },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                No monthly data recorded yet for the selected filters.
              </div>
            )}
          </Card>
        </div>

        {/* Monthly Service Completion Volume */}
        <div>
          <Card title="Monthly Service Completions">
            {chartChronologicalData.length > 0 ? (
              <ChartComponent
                type="bar"
                height={280}
                data={{
                  labels: chartChronologicalData.map(d => d.monthLabel),
                  datasets: [
                    {
                      type: 'bar',
                      label: 'Completed Services',
                      data: chartChronologicalData.map(d => d.completionCount),
                      backgroundColor: '#8b5cf6',
                      borderRadius: 4,
                      yAxisID: 'y',
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context: any) => `${context.raw} completed service jobs`,
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: { stepSize: 1, font: { size: 10 } },
                      title: { display: true, text: 'Jobs Count', font: { size: 10 } },
                    },
                    x: {
                      ticks: { font: { size: 10 } },
                    },
                  },
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
                No service completion data available.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Month-by-Month Detailed Breakdown Table ───────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Month-by-Month Financial & Operational Ledger</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click on any month row to view operating cost allocation, top services, and technician breakdown.
            </p>
          </div>
          <button
            onClick={toggleExpandAll}
            className="text-xs font-semibold text-brand-blue hover:text-brand-blue/80 transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            {displayedMonthlyData.every(d => expandedMonths[d.monthKey]) ? 'Collapse All Months' : 'Expand All Months'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100/75">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Month</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Completions</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Gross Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Operating Cost</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Net Profit</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Margin %</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Avg / Job</th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">MoM Trend</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {displayedMonthlyData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    No monthly records match the selected year and filters.
                  </td>
                </tr>
              ) : (
                displayedMonthlyData.map(month => {
                  const isExpanded = !!expandedMonths[month.monthKey];
                  const hasProfit = month.netProfit >= 0;

                  return (
                    <React.Fragment key={month.monthKey}>
                      <tr
                        onClick={() => toggleMonthExpand(month.monthKey)}
                        className={`cursor-pointer transition-colors ${isExpanded ? 'bg-brand-blue/5' : 'hover:bg-slate-50'}`}
                      >
                        {/* Month Name & Badge */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="font-bold text-slate-800">{month.fullMonthLabel}</div>
                            {summaryTotals.peakRevMonth?.monthKey === month.monthKey && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                                Peak Rev
                              </span>
                            )}
                            {summaryTotals.peakCompletionsMonth?.monthKey === month.monthKey && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-purple-100 text-purple-800 rounded">
                                Most Jobs
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Completion Count */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            {month.completionCount} jobs
                          </span>
                        </td>

                        {/* Gross Revenue */}
                        <td className="px-4 py-3.5 text-right font-bold text-slate-900">
                          ₹{Math.round(month.totalRevenue).toLocaleString('en-IN')}
                        </td>

                        {/* Operating Cost */}
                        <td className="px-4 py-3.5 text-right font-medium text-slate-600">
                          ₹{Math.round(month.totalCost).toLocaleString('en-IN')}
                        </td>

                        {/* Net Profit */}
                        <td className={`px-4 py-3.5 text-right font-bold ${hasProfit ? 'text-emerald-700' : 'text-red-600'}`}>
                          ₹{Math.round(month.netProfit).toLocaleString('en-IN')}
                        </td>

                        {/* Margin % */}
                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${month.marginPct >= 30 ? 'bg-emerald-100 text-emerald-800' : month.marginPct >= 15 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                            {month.marginPct.toFixed(1)}%
                          </span>
                        </td>

                        {/* Avg per Job */}
                        <td className="px-4 py-3.5 text-right text-slate-600 text-xs">
                          ₹{Math.round(month.avgRevenuePerJob).toLocaleString('en-IN')}
                        </td>

                        {/* MoM Trend */}
                        <td className="px-4 py-3.5 text-center">
                          {month.revenueMomGrowth !== 0 ? (
                            <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${month.revenueMomGrowth > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {month.revenueMomGrowth > 0 ? <IconArrowUp className="w-3 h-3" /> : <IconArrowDown className="w-3 h-3" />}
                              {Math.abs(month.revenueMomGrowth).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Action toggle */}
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMonthExpand(month.monthKey);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-brand-blue hover:bg-slate-100 transition-colors"
                          >
                            {isExpanded ? <IconChevronUp className="w-4 h-4" /> : <IconChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Month Deep Dive */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="bg-slate-50/80 px-5 py-4 border-b border-slate-200">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
                              {/* 1. Cost breakdown bar */}
                              <div>
                                <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1.5">
                                  <span>{month.fullMonthLabel} Operating Cost Breakdown (from ProfitLoss)</span>
                                  <span className="text-slate-500">
                                    Total: ₹{Math.round(month.totalCost).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                  {/* Material */}
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-semibold text-slate-600">Material Cost</span>
                                      <span className="font-bold text-slate-800">₹{Math.round(month.materialCost).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-red-500 h-full rounded-full"
                                        style={{ width: `${month.totalCost > 0 ? (month.materialCost / month.totalCost) * 100 : 0}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                      {month.totalCost > 0 ? ((month.materialCost / month.totalCost) * 100).toFixed(1) : 0}% of monthly cost
                                    </span>
                                  </div>

                                  {/* Labour */}
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-semibold text-slate-600">Labour Cost</span>
                                      <span className="font-bold text-slate-800">₹{Math.round(month.laborCost).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-orange-500 h-full rounded-full"
                                        style={{ width: `${month.totalCost > 0 ? (month.laborCost / month.totalCost) * 100 : 0}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                      {month.totalCost > 0 ? ((month.laborCost / month.totalCost) * 100).toFixed(1) : 0}% of monthly cost
                                    </span>
                                  </div>

                                  {/* Overheads */}
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-semibold text-slate-600">Other / Overheads</span>
                                      <span className="font-bold text-slate-800">₹{Math.round(month.otherExpenses).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                      <div
                                        className="bg-amber-500 h-full rounded-full"
                                        style={{ width: `${month.totalCost > 0 ? (month.otherExpenses / month.totalCost) * 100 : 0}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 block">
                                      {month.totalCost > 0 ? ((month.otherExpenses / month.totalCost) * 100).toFixed(1) : 0}% of monthly cost
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* 2. Top Services and Agents side-by-side */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                                {/* Services */}
                                <div>
                                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Top Services in {month.fullMonthLabel}
                                  </h4>
                                  <div className="space-y-1.5">
                                    {month.topServices.length === 0 ? (
                                      <p className="text-xs text-slate-400">No service breakdown available.</p>
                                    ) : (
                                      month.topServices.map((svc, i) => (
                                        <div key={svc.name} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                                          <div className="flex items-center gap-2">
                                            <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                                              {i + 1}
                                            </span>
                                            <span className="font-medium text-slate-800">{svc.name}</span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px]">
                                              {svc.count} {svc.count === 1 ? 'job' : 'jobs'}
                                            </span>
                                            <span className="font-bold text-slate-700">
                                              ₹{Math.round(svc.revenue).toLocaleString('en-IN')}
                                            </span>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* Agents */}
                                <div>
                                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                    Top Technicians / Agents in {month.fullMonthLabel}
                                  </h4>
                                  <div className="space-y-1.5">
                                    {month.topAgents.length === 0 ? (
                                      <p className="text-xs text-slate-400">No agent assignments recorded.</p>
                                    ) : (
                                      month.topAgents.map((ag, i) => (
                                        <div key={ag.name} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                                          <div className="flex items-center gap-2">
                                            <span className="w-4 h-4 rounded-full bg-blue-100 text-brand-blue flex items-center justify-center font-bold text-[10px]">
                                              {i + 1}
                                            </span>
                                            <span className="font-medium text-slate-800">{ag.name}</span>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className="font-semibold text-slate-600 text-[11px]">
                                              {ag.count} completed
                                            </span>
                                            <span className="font-bold text-emerald-700">
                                              ₹{Math.round(ag.revenue).toLocaleString('en-IN')}
                                            </span>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 3. Sample completed orders for this month */}
                              <div className="pt-2 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                                  Completed Orders Log ({month.jobs.length} total)
                                </h4>
                                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                                  <table className="min-w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 border-b border-slate-200">
                                      <tr>
                                        <th className="px-3 py-2">ID</th>
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Customer</th>
                                        <th className="px-3 py-2">Vehicle</th>
                                        <th className="px-3 py-2">Services</th>
                                        <th className="px-3 py-2">Agent</th>
                                        <th className="px-3 py-2 text-right">Revenue</th>
                                        <th className="px-3 py-2 text-right">Net Profit</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-600">
                                      {month.jobs.map(job => {
                                        const cost = getServiceCost(job);
                                        const profit = (job.grandTotal || 0) - cost.total;
                                        return (
                                          <tr key={job.submissionId} className="hover:bg-slate-50/70">
                                            <td className="px-3 py-2 font-semibold text-slate-800">
                                              #{job.appointmentId?.split('-').pop() || job.submissionId.slice(-6)}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{getServiceLocalDateStr(job)}</td>
                                            <td className="px-3 py-2 font-medium">{job.customerFirstName} {job.customerLastName}</td>
                                            <td className="px-3 py-2">{job.carBrandModel} ({job.carNumber})</td>
                                            <td className="px-3 py-2 max-w-xs truncate" title={(job.serviceSelection || []).join(', ')}>
                                              {(job.serviceSelection || []).join(', ')}
                                            </td>
                                            <td className="px-3 py-2">{job.assignedTo || 'Unassigned'}</td>
                                            <td className="px-3 py-2 text-right font-bold text-slate-800">
                                              ₹{(job.grandTotal || 0).toLocaleString('en-IN')}
                                            </td>
                                            <td className={`px-3 py-2 text-right font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                                              ₹{Math.round(profit).toLocaleString('en-IN')}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
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
            {/* Table Footer Totals */}
            {displayedMonthlyData.length > 0 && (
              <tfoot className="bg-slate-100/90 font-bold text-slate-800 border-t-2 border-slate-300">
                <tr>
                  <td className="px-4 py-3.5 uppercase tracking-wider text-xs">Total / Average</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="px-2.5 py-1 rounded-full text-xs bg-purple-100 text-purple-900">
                      {summaryTotals.totalCompletions} jobs
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-slate-900">
                    ₹{Math.round(summaryTotals.totalRev).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-slate-700">
                    ₹{Math.round(summaryTotals.totalCost).toLocaleString('en-IN')}
                  </td>
                  <td className={`px-4 py-3.5 text-right font-extrabold ${summaryTotals.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                    ₹{Math.round(summaryTotals.netProfit).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">
                      {summaryTotals.margin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-xs">
                    ₹{Math.round(summaryTotals.avgTicket).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3.5 text-center text-xs text-slate-400">-</td>
                  <td className="px-4 py-3.5 text-right text-xs text-slate-400">-</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

export default MonthlyAnalyticsSummary;
