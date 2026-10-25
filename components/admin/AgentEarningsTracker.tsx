import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Service, ServiceStatus, User, ServiceTemplate, RankThresholds, Settings, ProfitLoss } from '../../types';
import Card from '../ui/Card';
import { 
  IconTrophy, IconReceipt, IconChartBar, IconUsers, IconCheck, IconClock, IconDownload, IconPencil, IconSettings, IconSearch, IconFilter, IconSparkles
} from '../ui/Icon';
import * as authService from '../../services/authService';
import { formatScheduledDate } from '../../utils/dateTimeUtils';
import { toast } from 'sonner';

// Let TypeScript know Chart and XLSX are global
declare const Chart: any;
declare const XLSX: any;

interface RankInfo {
  name: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: string;
}

export const getAgentRank = (earned: number, thresholds?: RankThresholds): RankInfo => {
  const t = thresholds || { bronze: 0, silver: 5000, gold: 15000, platinum: 40000 };
  if (earned >= t.platinum) {
    return {
      name: 'Platinum',
      bgClass: 'bg-indigo-50/80',
      textClass: 'text-indigo-800',
      borderClass: 'border-indigo-200',
      icon: '💎'
    };
  } else if (earned >= t.gold) {
    return {
      name: 'Gold',
      bgClass: 'bg-amber-50/80',
      textClass: 'text-amber-800',
      borderClass: 'border-amber-200',
      icon: '👑'
    };
  } else if (earned >= t.silver) {
    return {
      name: 'Silver',
      bgClass: 'bg-slate-100/80',
      textClass: 'text-slate-800',
      borderClass: 'border-slate-300',
      icon: '🥈'
    };
  } else {
    return {
      name: 'Bronze',
      bgClass: 'bg-orange-50/80',
      textClass: 'text-orange-800',
      borderClass: 'border-orange-200',
      icon: '🥉'
    };
  }
};

export const AgentRankBadge: React.FC<{
  earned: number;
  thresholds?: RankThresholds;
  commissionRate?: number;
}> = ({ earned, thresholds, commissionRate = 30 }) => {
  const t = thresholds || { bronze: 0, silver: 5000, gold: 15000, platinum: 40000 };
  const rankInfo = getAgentRank(earned, t);
  
  let nextRankName = '';
  let nextRankIcon = '';
  let nextRankRevenueRange = '';
  let earnedNeeded = 0;
  let revenueNeeded = 0;

  const rate = commissionRate / 100;

  if (earned < t.silver) {
    nextRankName = 'Silver';
    nextRankIcon = '🥈';
    nextRankRevenueRange = `₹${Math.round(t.silver / (rate || 0.3)).toLocaleString('en-IN')} - ₹${Math.round(t.gold / (rate || 0.3)).toLocaleString('en-IN')}`;
    earnedNeeded = t.silver - earned;
    revenueNeeded = earnedNeeded / (rate || 0.3);
  } else if (earned < t.gold) {
    nextRankName = 'Gold';
    nextRankIcon = '👑';
    nextRankRevenueRange = `₹${Math.round(t.gold / (rate || 0.3)).toLocaleString('en-IN')} - ₹${Math.round(t.platinum / (rate || 0.3)).toLocaleString('en-IN')}`;
    earnedNeeded = t.gold - earned;
    revenueNeeded = earnedNeeded / (rate || 0.3);
  } else if (earned < t.platinum) {
    nextRankName = 'Platinum';
    nextRankIcon = '💎';
    nextRankRevenueRange = `₹${Math.round(t.platinum / (rate || 0.3)).toLocaleString('en-IN')}+`;
    earnedNeeded = t.platinum - earned;
    revenueNeeded = earnedNeeded / (rate || 0.3);
  }

  return (
    <div className="relative group inline-block">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-xs cursor-help select-none transition-all hover:scale-105 active:scale-95 ${rankInfo.bgClass} ${rankInfo.textClass} ${rankInfo.borderClass}`}>
        <span>{rankInfo.icon}</span>
        <span>{rankInfo.name}</span>
      </span>
      
      {/* Tooltip Popup */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col w-64 bg-slate-950 text-white text-xs rounded-lg p-3 shadow-xl border border-slate-800 z-50 pointer-events-none transition-opacity duration-200">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
          <span className="font-semibold text-slate-400">Total Agent Earnings:</span>
          <span className="font-bold text-emerald-400">₹{Math.round(earned).toLocaleString('en-IN')}</span>
        </div>
        
        {nextRankName ? (
          <div className="space-y-1.5 text-left">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <span>Next Tier:</span>
              <span className="text-amber-300">{nextRankIcon} {nextRankName}</span>
            </div>
            
            <div className="text-[11px] text-slate-300">
              <span className="font-semibold text-slate-400">Next Tier Rev Range:</span>
              <div className="font-mono text-white mt-0.5 bg-slate-900 py-0.5 px-1.5 rounded border border-slate-800">{nextRankRevenueRange}</div>
            </div>
            
            <div className="text-[11px] text-slate-300 flex justify-between">
              <span className="text-slate-400">Needed to Rank Up:</span>
              <span className="font-bold text-amber-400">+₹{Math.round(revenueNeeded).toLocaleString('en-IN')} Revenue</span>
            </div>
            
            {/* Progress Bar */}
            <div className="mt-1">
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                {(() => {
                  const currentMin = earned < t.silver ? t.bronze : (earned < t.gold ? t.silver : t.gold);
                  const nextMin = earned < t.silver ? t.silver : (earned < t.gold ? t.gold : t.platinum);
                  const progress = ((earned - currentMin) / (nextMin - currentMin)) * 100;
                  return (
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-1 text-indigo-300 font-bold flex items-center justify-center gap-1">
            <span>✨ Max Rank Achieved! ✨</span>
          </div>
        )}
        
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-950" />
      </div>
    </div>
  );
};

export interface LaborCalculationResult {
  totalLaborCharge: number;
  origin: string;
  isCostSheet: boolean;
  isFromPL: boolean;
  hasPLRecord: boolean;
  plLaborCost?: number;
}

export const calculateServiceLaborCharge = (
  s: Service,
  serviceTemplates: ServiceTemplate[],
  serviceBatchRates: Record<string, number>,
  fixedLaborPerOrder: number,
  profitLossData?: ProfitLoss[]
): LaborCalculationResult => {
  // 1. Auto-fetch labor cost directly from Profit & Loss sheet if explicit record exists
  const pl = profitLossData?.find(p => p.serviceId === s.submissionId || (s.appointmentId && p.serviceId === s.appointmentId));
  const hasPLRecord = !!pl;
  const plLaborCost = pl?.laborCost;

  if (pl && typeof pl.laborCost === 'number' && pl.laborCost > 0) {
    return {
      totalLaborCharge: pl.laborCost,
      origin: 'Profit & Loss Sheet 📊',
      isCostSheet: true,
      isFromPL: true,
      hasPLRecord,
      plLaborCost
    };
  }

  // 2. Manual order level override
  if (s.laborCost !== undefined && s.laborCost !== null && s.laborCost > 0) {
    return {
      totalLaborCharge: s.laborCost,
      origin: 'Manual Override ✏️',
      isCostSheet: false,
      isFromPL: false,
      hasPLRecord,
      plLaborCost
    };
  }

  // 3. Check Cost Sheet (Recipe labor items or tyre labor)
  let costSheetLabor = s.tyreLaborCost || 0;
  let foundInCostSheet = (s.tyreLaborCost || 0) > 0;

  if (s.serviceSelection && s.serviceSelection.length > 0) {
    s.serviceSelection.forEach(svcName => {
      const tmpl = serviceTemplates.find(t => t.name.trim().toLowerCase() === svcName.trim().toLowerCase());
      if (tmpl && Array.isArray(tmpl.recipeItems)) {
        const laborRecipeSum = tmpl.recipeItems
          .filter(item => item.type === 'LABOR')
          .reduce((acc, item) => acc + ((item.costPerUnit || 0) * (item.quantity || 1)), 0);
        if (laborRecipeSum > 0) {
          costSheetLabor += laborRecipeSum;
          foundInCostSheet = true;
        }
      }
    });
  }

  if (foundInCostSheet && costSheetLabor > 0) {
    return {
      totalLaborCharge: costSheetLabor,
      origin: 'Cost Sheet 📜',
      isCostSheet: true,
      isFromPL: false,
      hasPLRecord,
      plLaborCost
    };
  }

  // 4. Service Batch Rates
  let batchLaborSum = 0;
  let foundInBatch = false;
  if (s.serviceSelection && s.serviceSelection.length > 0) {
    s.serviceSelection.forEach(svcName => {
      if (serviceBatchRates[svcName] !== undefined && serviceBatchRates[svcName] > 0) {
        batchLaborSum += Number(serviceBatchRates[svcName]);
        foundInBatch = true;
      }
    });
  }

  if (foundInBatch && batchLaborSum > 0) {
    return {
      totalLaborCharge: batchLaborSum,
      origin: 'Batch Service Rate 🏷️',
      isCostSheet: false,
      isFromPL: false,
      hasPLRecord,
      plLaborCost
    };
  }

  // 5. Default Fixed Labor Per Completed Order
  return {
    totalLaborCharge: fixedLaborPerOrder,
    origin: 'Fixed Per Order 📌',
    isCostSheet: false,
    isFromPL: false,
    hasPLRecord,
    plLaborCost
  };
};

export interface AgentEarningsTrackerProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  serviceTemplates: ServiceTemplate[];
  agentRankThresholds?: RankThresholds;
  settings?: Settings;
  onUpdateOrder?: (service: Service) => void;
  profitLossData?: ProfitLoss[];
  onSaveProfitLoss?: (pl: ProfitLoss) => void;
}

const ChartComponent: React.FC<{ type: string; data: any; options: any; height?: number }> = ({ type, data, options, height = 240 }) => {
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
    <div style={{ height: `${height}px`, position: 'relative' }} className="w-full">
      <canvas ref={canvasRef} />
    </div>
  );
};

export const AgentEarningsTracker: React.FC<AgentEarningsTrackerProps> = ({
  submissions,
  users,
  serviceTemplates,
  agentRankThresholds,
  settings,
  onUpdateOrder,
  profitLossData = [],
  onSaveProfitLoss
}) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [commissionRate, setCommissionRate] = useState<number>(30); // default to 30%
  const [isSetupOpen, setIsSetupOpen] = useState<boolean>(false);
  const [activeSubView, setActiveSubView] = useState<'OVERVIEW' | 'LEDGER'>('OVERVIEW');

  // Filters for the Job Ledger
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState<string>('');
  const [ledgerPLFilter, setLedgerPLFilter] = useState<'ALL' | 'COSTED_PL' | 'UNCOSTED_PL'>('ALL');

  // Fixed labor per completed order state
  const [fixedLaborPerOrder, setFixedLaborPerOrder] = useState<number>(() => {
    const saved = localStorage.getItem('agent_fixed_labor_per_order');
    return saved ? Number(saved) : (settings?.fixedLaborPerOrder ?? 100);
  });

  // Service batch rates state
  const [serviceBatchRates, setServiceBatchRates] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('agent_service_batch_labor_rates');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return settings?.serviceBatchLaborRates || {
      "Car Washing": 120,
      "Car Care": 250,
      "Car Detailing": 350,
      "Foam Wash": 150,
      "Vacuum Cleaning": 80,
      "Tyre Replacement": 150
    };
  });

  // Inline labor cost editor state for individual job rows
  const [editingLaborServiceId, setEditingLaborServiceId] = useState<string | null>(null);
  const [editingLaborValue, setEditingLaborValue] = useState<string>('');

  // Filter completed submissions
  const completedServices = useMemo(() => {
    return submissions.filter(s => s.status === ServiceStatus.Completed && !s.isDeleted);
  }, [submissions]);

  // List of unique technician / field service agents present in submissions or users
  const agentList = useMemo(() => {
    const technicianUsers = users.filter(u => authService.isTechnicianUser(u));
    const techUsernames = technicianUsers.map(u => u.username);

    const fromSubmissions = submissions.map(s => s.assignedTo).filter(Boolean) as string[];
    const validSubmissionsAssignees = fromSubmissions.filter(assignedName => {
      const u = users.find(usr => usr.username === assignedName);
      if (u) {
        return authService.isTechnicianUser(u);
      }
      return true;
    });

    const combined = Array.from(new Set([...techUsernames, ...validSubmissionsAssignees]));
    return combined.sort();
  }, [users, submissions]);

  // All unique service names across templates & completed submissions
  const allServiceNames = useMemo(() => {
    const names = new Set<string>();
    serviceTemplates.forEach(t => names.add(t.name));
    completedServices.forEach(s => {
      (s.serviceSelection || []).forEach(name => names.add(name));
    });
    return Array.from(names).sort();
  }, [serviceTemplates, completedServices]);

  // Save Batch Labor Rules to LocalStorage & Settings
  const handleSaveLaborRules = () => {
    localStorage.setItem('agent_fixed_labor_per_order', String(fixedLaborPerOrder));
    localStorage.setItem('agent_service_batch_labor_rates', JSON.stringify(serviceBatchRates));
    toast.success('Labor rules & batch rates saved successfully!');
  };

  // Batch Apply Labor Charges to Orders
  const handleBatchApplyLaborCharges = () => {
    if (!onUpdateOrder) {
      toast.error('Order update handler not provided.');
      return;
    }

    let updatedCount = 0;
    completedServices.forEach(s => {
      const currentLabor = calculateServiceLaborCharge(s, serviceTemplates, serviceBatchRates, fixedLaborPerOrder, profitLossData);
      if (s.laborCost !== currentLabor.totalLaborCharge) {
        onUpdateOrder({
          ...s,
          laborCost: currentLabor.totalLaborCharge
        });
        updatedCount++;
      }
    });

    toast.success(`Batch updated labor charges across ${updatedCount} completed service tickets!`);
  };

  // Save or update P&L Labor cost directly from the ledger
  const handleSavePLLaborCost = (service: Service, newLaborVal: number) => {
    if (isNaN(newLaborVal) || newLaborVal < 0) {
      toast.error('Please enter a valid labor cost amount');
      return;
    }

    const existingPL = profitLossData?.find(p => p.serviceId === service.submissionId || (service.appointmentId && p.serviceId === service.appointmentId));
    const matCost = existingPL ? existingPL.materialCost : (service.tyreMaterialCost || 0);
    const othCost = existingPL ? existingPL.otherExpenses : 0;
    const rev = service.grandTotal || 0;
    const totalCost = matCost + newLaborVal + othCost;

    const updatedPL: ProfitLoss = {
      serviceId: service.submissionId,
      materialCost: matCost,
      laborCost: newLaborVal,
      otherExpenses: othCost,
      dynamicCosts: existingPL?.dynamicCosts || [],
      calculatedProfit: rev - totalCost,
      notes: existingPL?.notes || `Labor cost updated directly from Agent Earnings Ledger`
    };

    if (onSaveProfitLoss) {
      onSaveProfitLoss(updatedPL);
    }

    if (onUpdateOrder) {
      onUpdateOrder({
        ...service,
        laborCost: newLaborVal
      });
    }

    setEditingLaborServiceId(null);
    toast.success(`Updated P&L labor cost to ₹${newLaborVal.toLocaleString('en-IN')} for Order #${service.appointmentId?.split('-').pop() || service.submissionId.slice(0, 8)}`);
  };

  // Main Calculations for Agents
  const stats = useMemo(() => {
    const agentMap: Record<string, {
      username: string;
      jobsCount: number;
      grossRevenue: number;
      commissionEarnings: number;
      laborEarnings: number;
      totalEarnings: number;
      servicesBreakdown: Record<string, number>;
      dailyEarnings: Record<string, number>;
      monthlyEarnings: Record<string, number>;
      jobsList: (Service & { laborCalc: LaborCalculationResult; splitFraction: number; commission: number; laborPayout: number; totalPay: number })[];
    }> = {};

    agentList.forEach(ag => {
      agentMap[ag] = {
        username: ag,
        jobsCount: 0,
        grossRevenue: 0,
        commissionEarnings: 0,
        laborEarnings: 0,
        totalEarnings: 0,
        servicesBreakdown: {},
        dailyEarnings: {},
        monthlyEarnings: {},
        jobsList: []
      };
    });

    completedServices.forEach(s => {
      const assignees = [s.assignedTo, s.secondaryAssignee].filter(Boolean) as string[];
      if (assignees.length === 0) return;

      const splitFraction = 1 / assignees.length;
      const serviceRevenue = (s.grandTotal || 0) * splitFraction;
      const serviceCommission = serviceRevenue * (commissionRate / 100);

      const laborCalc = calculateServiceLaborCharge(s, serviceTemplates, serviceBatchRates, fixedLaborPerOrder, profitLossData);
      const laborPayout = laborCalc.totalLaborCharge * splitFraction;
      const totalPay = serviceCommission + laborPayout;

      const dateSrc = s.scheduledDate || s.timestamp;
      const dateObj = new Date(dateSrc);
      const dateStr = dateObj.toISOString().split('T')[0];
      const monthStr = dateObj.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      assignees.forEach(ag => {
        if (!agentMap[ag]) {
          agentMap[ag] = {
            username: ag,
            jobsCount: 0,
            grossRevenue: 0,
            commissionEarnings: 0,
            laborEarnings: 0,
            totalEarnings: 0,
            servicesBreakdown: {},
            dailyEarnings: {},
            monthlyEarnings: {},
            jobsList: []
          };
        }

        const data = agentMap[ag];
        data.jobsCount += 1;
        data.grossRevenue += serviceRevenue;
        data.commissionEarnings += serviceCommission;
        data.laborEarnings += laborPayout;
        data.totalEarnings += totalPay;

        data.jobsList.push({
          ...s,
          laborCalc,
          splitFraction,
          commission: serviceCommission,
          laborPayout,
          totalPay
        });

        // Daily
        data.dailyEarnings[dateStr] = (data.dailyEarnings[dateStr] || 0) + totalPay;

        // Monthly
        data.monthlyEarnings[monthStr] = (data.monthlyEarnings[monthStr] || 0) + totalPay;

        // Services mix
        (s.serviceSelection || []).forEach(svcName => {
          data.servicesBreakdown[svcName] = (data.servicesBreakdown[svcName] || 0) + (totalPay / (s.serviceSelection.length || 1));
        });
      });
    });

    return agentMap;
  }, [completedServices, agentList, commissionRate, serviceTemplates, serviceBatchRates, fixedLaborPerOrder, profitLossData]);

  // Aggregate stats across all agents
  const totalStats = useMemo(() => {
    let totalJobs = 0;
    let totalGrossRevenue = 0;
    let totalCommissionPaid = 0;
    let totalLaborPaid = 0;
    let totalAgentEarnings = 0;

    Object.values(stats).forEach(agData => {
      totalJobs += agData.jobsCount;
      totalGrossRevenue += agData.grossRevenue;
      totalCommissionPaid += agData.commissionEarnings;
      totalLaborPaid += agData.laborEarnings;
      totalAgentEarnings += agData.totalEarnings;
    });

    return {
      totalJobs,
      totalGrossRevenue,
      totalCommissionPaid,
      totalLaborPaid,
      totalAgentEarnings,
      avgEarningsPerJob: totalJobs > 0 ? totalAgentEarnings / totalJobs : 0
    };
  }, [stats]);

  // All jobs enriched for global ledger
  const allEnrichedJobs = useMemo(() => {
    return completedServices.map(s => {
      const assignees = [s.assignedTo, s.secondaryAssignee].filter(Boolean) as string[];
      const splitFraction = assignees.length > 0 ? 1 / assignees.length : 1;
      const serviceRevenue = s.grandTotal || 0;
      const serviceCommission = serviceRevenue * (commissionRate / 100);
      const laborCalc = calculateServiceLaborCharge(s, serviceTemplates, serviceBatchRates, fixedLaborPerOrder, profitLossData);
      const laborPayout = laborCalc.totalLaborCharge;
      const totalPay = serviceCommission + laborPayout;

      return {
        ...s,
        assignees,
        agentDisplay: assignees.length > 0 ? assignees.join(' & ') : 'Unassigned',
        laborCalc,
        splitFraction,
        commission: serviceCommission,
        laborPayout,
        totalPay
      };
    });
  }, [completedServices, commissionRate, serviceTemplates, serviceBatchRates, fixedLaborPerOrder, profitLossData]);

  // Filtered jobs list for the Ledger view
  const filteredLedgerJobs = useMemo(() => {
    return allEnrichedJobs.filter(item => {
      // 1. Agent Filter
      if (selectedAgent) {
        if (!item.assignees.includes(selectedAgent)) return false;
      }

      // 2. P&L Costing Status Filter
      if (ledgerPLFilter === 'COSTED_PL') {
        if (!item.laborCalc.isFromPL) return false;
      } else if (ledgerPLFilter === 'UNCOSTED_PL') {
        if (item.laborCalc.isFromPL) return false;
      }

      // 3. Search Query
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase();
        const apptId = (item.appointmentId || '').toLowerCase();
        const subId = (item.submissionId || '').toLowerCase();
        const custName = `${item.customerFirstName || ''} ${item.customerLastName || ''}`.toLowerCase();
        const carDetails = `${item.carBrandModel || ''} ${item.carNumber || ''}`.toLowerCase();
        const servicesStr = (item.serviceSelection || []).join(' ').toLowerCase();
        const agentStr = item.agentDisplay.toLowerCase();

        return apptId.includes(q) || subId.includes(q) || custName.includes(q) || carDetails.includes(q) || servicesStr.includes(q) || agentStr.includes(q);
      }

      return true;
    });
  }, [allEnrichedJobs, selectedAgent, ledgerPLFilter, ledgerSearchQuery]);

  // Get data specifically for selected agent
  const agentSpecificData = useMemo(() => {
    if (!selectedAgent) return null;
    const data = stats[selectedAgent] || {
      username: selectedAgent,
      jobsCount: 0,
      grossRevenue: 0,
      commissionEarnings: 0,
      laborEarnings: 0,
      totalEarnings: 0,
      servicesBreakdown: {},
      dailyEarnings: {},
      monthlyEarnings: {},
      jobsList: []
    };

    const dailyEntries = Object.entries(data.dailyEarnings).sort((a, b) => a[0].localeCompare(b[0]));
    
    let cumulative = 0;
    const dailyTimeline = dailyEntries.map(([date, earnings]) => {
      cumulative += earnings;
      return {
        date,
        formattedDate: new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        earnings,
        cumulative
      };
    });

    const monthlyBreakdown = Object.entries(data.monthlyEarnings).sort((a, b) => {
      return new Date(a[0]).getTime() - new Date(b[0]).getTime();
    });

    const servicesBreakdown = Object.entries(data.servicesBreakdown).sort((a, b) => b[1] - a[1]);

    const rankings = Object.values(stats)
      .map(s => ({ username: s.username, earnings: s.totalEarnings }))
      .sort((a, b) => b.earnings - a.earnings);
    const rankIndex = rankings.findIndex(r => r.username === selectedAgent);
    const rank = rankIndex !== -1 ? rankIndex + 1 : rankings.length + 1;

    const topService = servicesBreakdown.length > 0 ? servicesBreakdown[0] : null;

    return {
      ...data,
      dailyTimeline,
      monthlyBreakdown,
      servicesBreakdown,
      rank,
      topService
    };
  }, [selectedAgent, stats]);

  // Global styling options for ChartJS
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#334155',
          font: { weight: 'bold', size: 11 }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 10 } }
      },
      y: {
        border: { dash: [4, 4] },
        grid: { color: '#e2e8f0' },
        ticks: { color: '#64748b', font: { size: 10 } }
      }
    }
  };

  // Generate Excel Export
  const handleExportAgentData = () => {
    if (typeof XLSX === 'undefined') {
      alert('Reporting library not loaded. Please refresh the page and try again.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    if (activeSubView === 'LEDGER' || selectedAgent) {
      const rows = filteredLedgerJobs.map(s => {
        return {
          'Service Date': s.scheduledDate ? formatScheduledDate(s) : new Date(s.timestamp).toLocaleDateString('en-IN'),
          'Invoice ID': s.appointmentId?.split('-').pop() || s.submissionId.slice(0, 8),
          'Assigned Agent(s)': s.agentDisplay,
          'Customer': `${s.customerFirstName} ${s.customerLastName}`,
          'Car Details': `${s.carBrandModel} (${s.carNumber})`,
          'Service Selection': (s.serviceSelection || []).join(', '),
          'Total Invoice (₹)': s.grandTotal,
          'P&L Labour Cost (₹)': s.laborCalc.totalLaborCharge,
          'Labour Cost Source': s.laborCalc.origin,
          'Is Costed in P&L': s.laborCalc.isFromPL ? 'Yes (P&L)' : 'No (Pending P&L Cost)',
          'Commission Earned (₹)': s.commission.toFixed(2),
          'Labour Charge Earned (₹)': s.laborPayout.toFixed(2),
          'Total Agent Pay (₹)': s.totalPay.toFixed(2),
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `Job_Labour_Ledger`);
      XLSX.writeFile(wb, `job_labour_earnings_ledger_${dateStr}.xlsx`);
    } else {
      const rows = Object.values(stats).map(ag => ({
        'Agent Name': ag.username,
        'Completed Jobs': ag.jobsCount,
        'Generated Gross Revenue (₹)': ag.grossRevenue.toFixed(2),
        'Commission Earned (₹)': ag.commissionEarnings.toFixed(2),
        'Labour Charges Earned (₹)': ag.laborEarnings.toFixed(2),
        'Total Agent Payout (₹)': ag.totalEarnings.toFixed(2),
        'Avg Payout / Job (₹)': ag.jobsCount > 0 ? (ag.totalEarnings / ag.jobsCount).toFixed(2) : '0.00',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Agent_Comparative_Report');
      XLSX.writeFile(wb, `all_agents_earnings_summary_${dateStr}.xlsx`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Header Panel */}
      <Card title="Agent Earnings & Labour Charges Analytics">
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">
                Calculates agent earnings based on service types, split rules, and auto-fetches labor costs from the Profit & Loss sheet.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* View Switcher Tabs */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                <button
                  onClick={() => setActiveSubView('OVERVIEW')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    activeSubView === 'OVERVIEW' ? 'bg-white text-brand-blue shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <IconChartBar className="w-3.5 h-3.5" />
                  Agent Performance
                </button>
                <button
                  onClick={() => setActiveSubView('LEDGER')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                    activeSubView === 'LEDGER' ? 'bg-white text-brand-blue shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <IconReceipt className="w-3.5 h-3.5" />
                  📜 Labor & Agent Job Ledger
                </button>
              </div>

              {/* Toggle Setup Drawer */}
              <button
                onClick={() => setIsSetupOpen(!isSetupOpen)}
                className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                  isSetupOpen ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                <IconSettings className="w-4 h-4" />
                {isSetupOpen ? 'Close Labor Setup' : '🔧 Labor Rates Setup'}
              </button>

              {/* Commission Split Input */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs">
                <span className="text-xs font-bold text-slate-600">Commission Rate:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={commissionRate} 
                  onChange={(e) => setCommissionRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-12 bg-white text-center font-bold text-brand-blue border border-slate-300 rounded px-1 text-xs py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-accent"
                />
                <span className="text-xs font-bold text-slate-500">%</span>
              </div>

              {/* Agent Select Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Agent:</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                >
                  <option value="">📊 All Agents Overview</option>
                  {agentList.map(ag => (
                    <option key={ag} value={ag}>👤 {ag}</option>
                  ))}
                </select>
              </div>

              {/* Export Excel */}
              <button
                onClick={handleExportAgentData}
                disabled={completedServices.length === 0}
                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:text-brand-blue hover:border-brand-blue rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-50"
              >
                <IconDownload className="w-4 h-4" />
                Export Excel
              </button>
            </div>
          </div>

          {/* Quick Info bar */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100/80">
            <div className="flex items-center gap-2 font-semibold text-indigo-900">
              <IconSparkles className="w-4 h-4 text-indigo-600" />
              <span>P&L Sync Active:</span>
              <span className="text-slate-700 font-normal">
                Labor costs are auto-fetched from Profit & Loss sheet. Uncosted jobs can be updated in 1 click directly in the ledger!
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="text-emerald-700">📊 P&L Costed: {allEnrichedJobs.filter(j => j.laborCalc.isFromPL).length} jobs</span>
              <span className="text-amber-700">⚠️ Pending P&L Cost: {allEnrichedJobs.filter(j => !j.laborCalc.isFromPL).length} jobs</span>
            </div>
          </div>
        </div>
      </Card>

      {/* LABOUR CHARGE & BATCH RATE SETUP PANEL */}
      {isSetupOpen && (
        <Card title="Labour Charge & Batch Rate Manager">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Default Fixed Labour Per Completed Order (₹)
                </label>
                <p className="text-xs text-slate-500 mb-2">
                  Applied automatically to completed jobs if no Profit & Loss sheet cost, recipe labor, or batch rate is set.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={fixedLaborPerOrder}
                    onChange={(e) => setFixedLaborPerOrder(Math.max(0, Number(e.target.value)))}
                    className="w-32 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-brand-accent"
                  />
                </div>
              </div>

              <div className="flex flex-col justify-end items-end gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveLaborRules}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                  >
                    💾 Save Batch Rules
                  </button>
                  <button
                    onClick={handleBatchApplyLaborCharges}
                    className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center gap-1.5"
                  >
                    ⚡ Batch Apply Rates to Completed Jobs
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Applies calculated labor charges across past completed orders without explicit manual overrides.
                </p>
              </div>
            </div>

            {/* Service-wise Batch Rates Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Service-Wise Labour Charges Configurator
              </h4>
              <p className="text-xs text-slate-500 mb-3">
                Specify labor cost per service. Services with labor items in their Cost Sheet recipe reflect cost sheet values automatically.
              </p>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Service Name</th>
                      <th className="px-4 py-2.5">Cost Sheet Status</th>
                      <th className="px-4 py-2.5">Batch Labour Charge Rate (₹)</th>
                      <th className="px-4 py-2.5">Applied Origin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {allServiceNames.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No services found in template catalog.</td>
                      </tr>
                    ) : (
                      allServiceNames.map(svcName => {
                        const tmpl = serviceTemplates.find(t => t.name.trim().toLowerCase() === svcName.trim().toLowerCase());
                        const costSheetLabor = tmpl && Array.isArray(tmpl.recipeItems)
                          ? tmpl.recipeItems.filter(i => i.type === 'LABOR').reduce((acc, i) => acc + ((i.costPerUnit || 0) * (i.quantity || 1)), 0)
                          : 0;

                        const currentBatchRate = serviceBatchRates[svcName] !== undefined ? serviceBatchRates[svcName] : 0;

                        return (
                          <tr key={svcName} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-semibold text-slate-800">{svcName}</td>
                            <td className="px-4 py-2.5 text-xs">
                              {costSheetLabor > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                                  📜 Cost Sheet: ₹{costSheetLabor}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Not specified in cost sheet</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400 font-bold">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={currentBatchRate}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value));
                                    setServiceBatchRates(prev => ({ ...prev, [svcName]: val }));
                                  }}
                                  className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold focus:ring-1 focus:ring-brand-accent"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs font-semibold">
                              {costSheetLabor > 0 ? (
                                <span className="text-emerald-700 font-bold">Cost Sheet (Auto)</span>
                              ) : currentBatchRate > 0 ? (
                                <span className="text-blue-700 font-bold">Batch Rate ({`₹${currentBatchRate}`})</span>
                              ) : (
                                <span className="text-slate-500 font-normal">Fixed Order Fallback ({`₹${fixedLaborPerOrder}`})</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ── SUB-VIEW 1: AGENT PERFORMANCE OVERVIEW ── */}
      {activeSubView === 'OVERVIEW' && !selectedAgent && (
        <div className="space-y-6">
          {/* KPI Cards row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
              <div className="p-2 bg-emerald-100 rounded-lg w-fit"><IconTrophy className="w-5 h-5 text-emerald-600" /></div>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Agent Payouts</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                  ₹{totalStats.totalAgentEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">Commission + Labour Charges</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
              <div className="p-2 bg-blue-100 rounded-lg w-fit"><IconReceipt className="w-5 h-5 text-blue-600" /></div>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Generated Revenue</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
                  ₹{totalStats.totalGrossRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">From {totalStats.totalJobs} completed jobs</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
              <div className="p-2 bg-indigo-100 rounded-lg w-fit"><IconChartBar className="w-5 h-5 text-indigo-600" /></div>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Labour Charges Paid</p>
                <p className="text-2xl font-extrabold text-indigo-700 mt-0.5">
                  ₹{totalStats.totalLaborPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">P&L sheet / cost sheet / batch / fixed</p>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
              <div className="p-2 bg-amber-100 rounded-lg w-fit"><IconUsers className="w-5 h-5 text-amber-600" /></div>
              <div className="mt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Agents Tracked</p>
                <p className="text-2xl font-extrabold text-slate-800 mt-0.5">{agentList.length}</p>
                <p className="text-xs text-slate-400 mt-1">Comm: ₹{totalStats.totalCommissionPaid.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({commissionRate}%)</p>
              </div>
            </div>
          </div>

          {/* Visual representations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Comparative Agent Payout Breakdown (Commission vs Labour)">
              {agentList.length > 0 ? (
                <ChartComponent 
                  type="bar" 
                  height={260}
                  data={{
                    labels: agentList,
                    datasets: [
                      {
                        label: `Commission (₹, ${commissionRate}%)`,
                        data: agentList.map(ag => stats[ag]?.commissionEarnings || 0),
                        backgroundColor: '#f8bf2a',
                        borderRadius: 6,
                      },
                      {
                        label: 'Labour Charges (₹)',
                        data: agentList.map(ag => stats[ag]?.laborEarnings || 0),
                        backgroundColor: '#6366f1',
                        borderRadius: 6,
                      },
                      {
                        label: 'Gross Generated Revenue (₹)',
                        data: agentList.map(ag => stats[ag]?.grossRevenue || 0),
                        backgroundColor: '#0D2A4F',
                        borderRadius: 6,
                      }
                    ]
                  }}
                  options={{
                    ...chartOptions,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: (value: any) => '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 0 })
                        }
                      }
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No completed service assignments found</div>
              )}
            </Card>

            <Card title="Agent Cumulative Jobs Completed">
              {agentList.length > 0 ? (
                <ChartComponent 
                  type="doughnut" 
                  height={260}
                  data={{
                    labels: agentList,
                    datasets: [{
                      data: agentList.map(ag => stats[ag]?.jobsCount || 0),
                      backgroundColor: ['#0D2A4F', '#f8bf2a', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f97316', '#06b6d4'],
                      borderWidth: 2,
                      borderColor: '#ffffff'
                    }]
                  }}
                  options={{
                    ...chartOptions,
                    cutout: '60%',
                    plugins: {
                      legend: { position: 'bottom' }
                    }
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No agent records found</div>
              )}
            </Card>
          </div>

          {/* Comparative Table */}
          <Card title="Agents Comparative Performance Overview">
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Agent Name</th>
                    <th className="px-4 py-3 text-center">Rank</th>
                    <th className="px-4 py-3 text-center">Jobs</th>
                    <th className="px-4 py-3">Gross Revenue</th>
                    <th className="px-4 py-3">Commission ({commissionRate}%)</th>
                    <th className="px-4 py-3">Labour Charges</th>
                    <th className="px-4 py-3">Total Agent Payout</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100 text-slate-700">
                  {agentList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-slate-400 font-medium">
                        No completed services data matches current filters.
                      </td>
                    </tr>
                  ) : (
                    agentList.map(agName => {
                      const agData = stats[agName];

                      return (
                        <tr key={agName} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-brand-blue/10 text-brand-blue font-bold flex items-center justify-center text-xs">
                              {agName.slice(0, 2).toUpperCase()}
                            </span>
                            {agName}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <AgentRankBadge earned={agData?.totalEarnings || 0} thresholds={agentRankThresholds} commissionRate={commissionRate} />
                          </td>
                          <td className="px-4 py-3.5 text-center font-semibold text-slate-600">
                            {agData?.jobsCount || 0}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-slate-800">
                            ₹{(agData?.grossRevenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-emerald-600">
                            ₹{(agData?.commissionEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-indigo-600">
                            ₹{(agData?.laborEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 font-black text-slate-900 bg-slate-50/50">
                            ₹{(agData?.totalEarnings || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => {
                                setSelectedAgent(agName);
                                setActiveSubView('LEDGER');
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-bold border border-indigo-200 transition-all"
                            >
                              View Jobs Ledger →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── SUB-VIEW 2: LABOR & AGENT JOB-BY-JOB LEDGER ── */}
      {(activeSubView === 'LEDGER' || selectedAgent) && (
        <div className="space-y-6">
          {/* Filter & Control Bar for Job Ledger */}
          <Card>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Box */}
                <div className="relative min-w-[220px]">
                  <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Order #, Agent, Customer, Car, Services..."
                    value={ledgerSearchQuery}
                    onChange={(e) => setLedgerSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                  />
                  {ledgerSearchQuery && (
                    <button 
                      onClick={() => setLedgerSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter by Agent */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Agent:</span>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                  >
                    <option value="">👤 All Agents</option>
                    {agentList.map(ag => (
                      <option key={ag} value={ag}>👤 {ag}</option>
                    ))}
                  </select>
                </div>

                {/* Filter by P&L Cost Status */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">P&L Status:</span>
                  <select
                    value={ledgerPLFilter}
                    onChange={(e) => setLedgerPLFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
                  >
                    <option value="ALL">All Jobs ({allEnrichedJobs.length})</option>
                    <option value="COSTED_PL">📊 Costed in P&L Sheet</option>
                    <option value="UNCOSTED_PL">⚠️ Pending P&L Costing</option>
                  </select>
                </div>
              </div>

              {/* Reset Filters / Counter badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                  Showing <span className="text-brand-blue font-extrabold">{filteredLedgerJobs.length}</span> / {allEnrichedJobs.length} jobs
                </span>
                {(ledgerSearchQuery || ledgerPLFilter !== 'ALL' || selectedAgent) && (
                  <button
                    onClick={() => {
                      setLedgerSearchQuery('');
                      setLedgerPLFilter('ALL');
                      setSelectedAgent('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* SINGLE AGENT KPI BANNER IF AGENT IS SELECTED */}
          {selectedAgent && agentSpecificData && (
            <div className="bg-gradient-to-r from-brand-blue to-slate-900 text-white p-5 rounded-2xl shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg">
                    {selectedAgent.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-extrabold text-white">{selectedAgent}</h3>
                      <AgentRankBadge earned={agentSpecificData.totalEarnings} thresholds={agentRankThresholds} commissionRate={commissionRate} />
                    </div>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Completed Jobs: <span className="font-bold text-amber-300">{agentSpecificData.jobsCount}</span> | Gross Revenue Share: <span className="font-bold text-emerald-300">₹{agentSpecificData.grossRevenue.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/15">
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-300 uppercase">Comm ({commissionRate}%):</p>
                    <p className="text-sm font-extrabold text-emerald-300">₹{agentSpecificData.commissionEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="h-6 w-px bg-white/20" />
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-300 uppercase">Labor Charges:</p>
                    <p className="text-sm font-extrabold text-indigo-300">₹{agentSpecificData.laborEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                  <div className="h-6 w-px bg-white/20" />
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-amber-400 uppercase">Net Agent Pay:</p>
                    <p className="text-base font-black text-amber-300">₹{agentSpecificData.totalEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DETAILED COMPLETED JOB-BY-JOB LABOUR & EARNINGS LEDGER */}
          <Card title={`Job-Wise Labor Charges & Agent Earnings Ledger ${selectedAgent ? `(${selectedAgent})` : ''}`}>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3.5 py-3">Date</th>
                    <th className="px-3.5 py-3">Order ID</th>
                    <th className="px-3 py-3">Assigned Agent(s)</th>
                    <th className="px-3.5 py-3">Customer & Vehicle</th>
                    <th className="px-3.5 py-3">Services Completed</th>
                    <th className="px-3.5 py-3 text-right">Invoice Revenue</th>
                    <th className="px-3.5 py-3 text-center">P&L Labor Cost</th>
                    <th className="px-3.5 py-3 text-right">Comm ({commissionRate}%)</th>
                    <th className="px-3.5 py-3 text-right">Labor Payout</th>
                    <th className="px-3.5 py-3 text-right">Net Agent Pay</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100 text-slate-700">
                  {filteredLedgerJobs.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-10 text-center text-slate-400 font-medium">
                        No completed jobs found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerJobs.map(s => {
                      const isEditing = editingLaborServiceId === s.submissionId;

                      return (
                        <tr key={s.submissionId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-3 text-slate-600 font-medium whitespace-nowrap text-xs">
                            {s.scheduledDate ? formatScheduledDate(s) : new Date(s.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </td>

                          <td className="px-3.5 py-3 font-mono font-bold text-slate-800 text-xs">
                            #{s.appointmentId?.split('-').pop() || s.submissionId.slice(0, 8)}
                          </td>

                          {/* Trailing Agent Name(s) */}
                          <td className="px-3 py-3 text-xs">
                            <div className="flex flex-wrap items-center gap-1">
                              {s.assignees.length > 0 ? (
                                s.assignees.map((agName, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold border border-slate-200">
                                    <span className="text-brand-blue">👤</span> {agName}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400 italic">Unassigned</span>
                              )}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 text-xs">
                            <p className="font-bold text-slate-800">{s.customerFirstName} {s.customerLastName}</p>
                            <p className="text-slate-500 font-mono text-[11px]">{s.carBrandModel} ({s.carNumber})</p>
                          </td>

                          <td className="px-3.5 py-3 text-xs max-w-[200px]">
                            <div className="flex flex-wrap gap-1">
                              {(s.serviceSelection || []).map((svc, i) => (
                                <span key={i} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-800 font-semibold rounded text-[11px] border border-blue-100">
                                  {svc}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="px-3.5 py-3 text-right font-bold text-slate-800 text-xs">
                            ₹{(s.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            {s.splitFraction < 1 && (
                              <span className="block text-[9px] text-slate-400 font-normal">Split 1/{Math.round(1/s.splitFraction)}</span>
                            )}
                          </td>

                          {/* P&L Labor Cost Status & Direct In-Line Costing */}
                          <td className="px-3.5 py-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1 bg-amber-50 p-1.5 rounded-lg border border-amber-300 shadow-xs">
                                <span className="text-xs text-amber-800 font-bold">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={editingLaborValue}
                                  onChange={(e) => setEditingLaborValue(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 border border-amber-400 bg-white rounded text-xs font-bold text-slate-800 text-center focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                  placeholder="Labor cost"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSavePLLaborCost(s, Number(editingLaborValue))}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-xs font-bold transition-all"
                                  title="Save to Profit & Loss sheet"
                                >
                                  Save P&L
                                </button>
                                <button
                                  onClick={() => setEditingLaborServiceId(null)}
                                  className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 text-xs"
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                {s.laborCalc.isFromPL ? (
                                  <div className="flex items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold border border-emerald-200">
                                      📊 P&L: ₹{s.laborCalc.totalLaborCharge.toLocaleString('en-IN')}
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingLaborServiceId(s.submissionId);
                                        setEditingLaborValue(String(s.laborCalc.totalLaborCharge));
                                      }}
                                      className="p-1 text-slate-400 hover:text-brand-blue transition-colors"
                                      title="Update P&L Labor Cost"
                                    >
                                      <IconPencil className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-200">
                                      ⚠️ Est: ₹{s.laborCalc.totalLaborCharge} ({s.laborCalc.origin.split(' ')[0]})
                                    </span>
                                    <button
                                      onClick={() => {
                                        setEditingLaborServiceId(s.submissionId);
                                        setEditingLaborValue(String(s.laborCalc.totalLaborCharge || 100));
                                      }}
                                      className="px-2 py-0.5 bg-brand-blue hover:bg-brand-blue/90 text-white font-extrabold text-[11px] rounded shadow-xs transition-all flex items-center gap-1"
                                      title="Set exact labor cost in Profit & Loss sheet"
                                    >
                                      ⚡ Cost Now in P&L
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-3.5 py-3 text-right font-semibold text-emerald-600 text-xs">
                            ₹{s.commission.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="px-3.5 py-3 text-right font-bold text-indigo-700 text-xs">
                            ₹{s.laborPayout.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="px-3.5 py-3 text-right font-black text-slate-900 bg-slate-50/50 text-xs">
                            ₹{s.totalPay.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AgentEarningsTracker;
