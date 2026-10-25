import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Service, ServiceStatus, User, ServiceTemplate, Settings } from '../../types';
import Card from '../ui/Card';
import { 
  IconClock, IconCheck, IconChartBar, IconUsers, IconDownload, IconPencil, IconRefresh, IconSettings
} from '../ui/Icon';
import { toast } from 'sonner';
import { formatScheduledDate } from '../../utils/dateTimeUtils';

declare const Chart: any;
declare const XLSX: any;

interface LaborAnalyticsViewProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  serviceTemplates: ServiceTemplate[];
  settings?: Settings;
  onUpdateOrder?: (service: Service) => void;
}

// Chart JS helper wrapper
const ChartComponent: React.FC<{ type: string; data: any; options: any; height?: number }> = ({ type, data, options, height = 260 }) => {
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

// Default service duration benchmarks in minutes
const SERVICE_DURATION_BENCHMARKS: Record<string, number> = {
  'Car Washing': 45,
  'Foam Wash': 30,
  'Vacuum Cleaning': 25,
  'Car Care': 90,
  'Polishing & Coating': 120,
  'Car Detailing': 150,
  'Tyre Replacement': 40,
  'Battery Replacement': 30,
  'Engine Washing': 35,
  'Interior Sanitization': 45,
  'Custom Services': 45
};

export interface CalculatedJobLabor {
  service: Service;
  estimatedMinutes: number;
  actualMinutes: number;
  varianceMinutes: number; // positive = saved time, negative = overrun
  efficiencyRatio: number; // e.g. 1.15 = 115%
  isManualOverride: boolean;
  leadTech: string;
  helperTech?: string;
  startTime?: string;
  endTime?: string;
}

export const calculateJobLaborTimes = (
  s: Service,
  serviceTemplates: ServiceTemplate[]
): CalculatedJobLabor => {
  // 1. Calculate Estimated Minutes
  let estimatedMins = 0;
  if (s.serviceSelection && s.serviceSelection.length > 0) {
    s.serviceSelection.forEach(svcName => {
      const tmpl = serviceTemplates.find(t => t.name.trim().toLowerCase() === svcName.trim().toLowerCase());
      if (tmpl && tmpl.estimatedLaborMinutes && tmpl.estimatedLaborMinutes > 0) {
        estimatedMins += tmpl.estimatedLaborMinutes;
      } else {
        // Fall back to predefined benchmark
        const benchmarkKey = Object.keys(SERVICE_DURATION_BENCHMARKS).find(
          k => k.toLowerCase() === svcName.trim().toLowerCase()
        );
        estimatedMins += benchmarkKey ? SERVICE_DURATION_BENCHMARKS[benchmarkKey] : 45;
      }
    });
  } else {
    estimatedMins = 45; // default fallback
  }

  // 2. Calculate Actual Minutes
  let actualMins = 0;
  let isManualOverride = false;
  let startTime: string | undefined;
  let endTime: string | undefined;

  // Check explicit override
  const customFieldLabor = s.customFieldData?.find(f => f.fieldId === 'actualLaborMinutes' || f.fieldId === 'actualMins')?.value;
  if (customFieldLabor && Number(customFieldLabor) > 0) {
    actualMins = Number(customFieldLabor);
    isManualOverride = true;
  } else if (s.statusHistory && s.statusHistory.length > 0) {
    const inProgressEntry = s.statusHistory.find(h => h.status === ServiceStatus.InProgress);
    const completedEntry = s.statusHistory.find(h => h.status === ServiceStatus.Completed);

    if (inProgressEntry && completedEntry) {
      startTime = inProgressEntry.timestamp;
      endTime = completedEntry.timestamp;
      const t1 = new Date(inProgressEntry.timestamp).getTime();
      const t2 = new Date(completedEntry.timestamp).getTime();
      if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
        actualMins = Math.round((t2 - t1) / (1000 * 60));
      }
    }
  }

  // Fallback if actual time is unrecorded or zero
  if (actualMins <= 0) {
    actualMins = estimatedMins; // assume on-par if unrecorded
  }

  const varianceMinutes = estimatedMins - actualMins; // >0 means completed faster than estimated
  const efficiencyRatio = actualMins > 0 ? (estimatedMins / actualMins) : 1.0;

  return {
    service: s,
    estimatedMinutes: estimatedMins,
    actualMinutes: actualMins,
    varianceMinutes,
    efficiencyRatio,
    isManualOverride,
    leadTech: s.assignedTo || 'Unassigned',
    helperTech: s.secondaryAssignee || undefined,
    startTime,
    endTime
  };
};

export const LaborAnalyticsView: React.FC<LaborAnalyticsViewProps> = ({
  submissions,
  users,
  serviceTemplates,
  onUpdateOrder
}) => {
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'ALL' | 'LEAD' | 'HELPER'>('ALL');
  const [selectedWorker, setSelectedWorker] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editing Actual Time Modal / State
  const [editingJob, setEditingJob] = useState<CalculatedJobLabor | null>(null);
  const [editActualMinsInput, setEditActualMinsInput] = useState<string>('');

  // Completed jobs filter
  const completedJobs = useMemo(() => {
    return submissions.filter(s => s.status === ServiceStatus.Completed && !s.isDeleted);
  }, [submissions]);

  // List of all technician and helper usernames
  const allWorkers = useMemo(() => {
    const workerSet = new Set<string>();
    users.forEach(u => {
      if (u.role === 'technician' || u.agentCategory === 'TECHNICIAN' || u.isEarningsCalculated) {
        workerSet.add(u.username);
      }
    });
    completedJobs.forEach(s => {
      if (s.assignedTo) workerSet.add(s.assignedTo);
      if (s.secondaryAssignee) workerSet.add(s.secondaryAssignee);
    });
    return Array.from(workerSet).sort();
  }, [users, completedJobs]);

  // Calculated labor metrics for all completed jobs
  const jobLaborList = useMemo(() => {
    return completedJobs.map(s => calculateJobLaborTimes(s, serviceTemplates));
  }, [completedJobs, serviceTemplates]);

  // Aggregated Worker Metrics Map
  const workerStatsMap = useMemo(() => {
    const map: Record<string, {
      username: string;
      roleInJobs: { leadCount: number; helperCount: number };
      totalJobs: number;
      totalEstimatedMins: number;
      totalActualMins: number;
      savedMins: number;
      efficiencyRatio: number;
      onTimeJobsCount: number;
      jobDetails: CalculatedJobLabor[];
    }> = {};

    allWorkers.forEach(w => {
      map[w] = {
        username: w,
        roleInJobs: { leadCount: 0, helperCount: 0 },
        totalJobs: 0,
        totalEstimatedMins: 0,
        totalActualMins: 0,
        savedMins: 0,
        efficiencyRatio: 1.0,
        onTimeJobsCount: 0,
        jobDetails: []
      };
    });

    jobLaborList.forEach(job => {
      const leads = [job.leadTech].filter(w => w && w !== 'Unassigned');
      const helpers = [job.helperTech].filter(Boolean) as string[];

      // Attribute metrics to Lead
      leads.forEach(w => {
        if (!map[w]) {
          map[w] = {
            username: w,
            roleInJobs: { leadCount: 0, helperCount: 0 },
            totalJobs: 0,
            totalEstimatedMins: 0,
            totalActualMins: 0,
            savedMins: 0,
            efficiencyRatio: 1.0,
            onTimeJobsCount: 0,
            jobDetails: []
          };
        }
        const st = map[w];
        st.roleInJobs.leadCount += 1;
        st.totalJobs += 1;
        st.totalEstimatedMins += job.estimatedMinutes;
        st.totalActualMins += job.actualMinutes;
        st.savedMins += job.varianceMinutes;
        if (job.actualMinutes <= job.estimatedMinutes) st.onTimeJobsCount += 1;
        st.jobDetails.push(job);
      });

      // Attribute metrics to Helper
      helpers.forEach(w => {
        if (!map[w]) {
          map[w] = {
            username: w,
            roleInJobs: { leadCount: 0, helperCount: 0 },
            totalJobs: 0,
            totalEstimatedMins: 0,
            totalActualMins: 0,
            savedMins: 0,
            efficiencyRatio: 1.0,
            onTimeJobsCount: 0,
            jobDetails: []
          };
        }
        const st = map[w];
        st.roleInJobs.helperCount += 1;
        st.totalJobs += 1;
        st.totalEstimatedMins += job.estimatedMinutes;
        st.totalActualMins += job.actualMinutes;
        st.savedMins += job.varianceMinutes;
        if (job.actualMinutes <= job.estimatedMinutes) st.onTimeJobsCount += 1;
        st.jobDetails.push(job);
      });
    });

    // Recompute overall efficiency ratio per worker
    Object.values(map).forEach(st => {
      st.efficiencyRatio = st.totalActualMins > 0 ? (st.totalEstimatedMins / st.totalActualMins) : 1.0;
    });

    return map;
  }, [allWorkers, jobLaborList]);

  // Total Summary KPI Calculations across selected scope
  const summaryKpi = useMemo(() => {
    let totEstMins = 0;
    let totActMins = 0;
    let onTimeCount = 0;
    let totalJobCount = jobLaborList.length;

    jobLaborList.forEach(j => {
      totEstMins += j.estimatedMinutes;
      totActMins += j.actualMinutes;
      if (j.actualMinutes <= j.estimatedMinutes) onTimeCount += 1;
    });

    const overallEfficiency = totActMins > 0 ? (totEstMins / totActMins) * 100 : 100;
    const onTimeRate = totalJobCount > 0 ? (onTimeCount / totalJobCount) * 100 : 100;
    const timeSavedHours = (totEstMins - totActMins) / 60;

    return {
      totalJobs: totalJobCount,
      totEstHours: totEstMins / 60,
      totActHours: totActMins / 60,
      overallEfficiency,
      onTimeRate,
      timeSavedHours
    };
  }, [jobLaborList]);

  // Filtered workers for leaderboard table
  const filteredWorkersList = useMemo(() => {
    let list = Object.values(workerStatsMap);

    if (selectedRoleFilter === 'LEAD') {
      list = list.filter(w => w.roleInJobs.leadCount > 0);
    } else if (selectedRoleFilter === 'HELPER') {
      list = list.filter(w => w.roleInJobs.helperCount > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(w => w.username.toLowerCase().includes(q));
    }

    // Sort by Total Jobs descending
    return list.sort((a, b) => b.totalJobs - a.totalJobs);
  }, [workerStatsMap, selectedRoleFilter, searchQuery]);

  // Filtered jobs ledger
  const filteredJobLedger = useMemo(() => {
    let list = jobLaborList;

    if (selectedWorker) {
      list = list.filter(j => j.leadTech === selectedWorker || j.helperTech === selectedWorker);
    }

    return list.sort((a, b) => new Date(b.service.timestamp).getTime() - new Date(a.service.timestamp).getTime());
  }, [jobLaborList, selectedWorker]);

  // Save manual actual labor minutes override to job order
  const handleSaveActualLaborMins = () => {
    if (!editingJob || !onUpdateOrder) return;
    const val = Number(editActualMinsInput);
    if (isNaN(val) || val < 1) {
      toast.error('Please enter a valid positive number of minutes');
      return;
    }

    const updatedCustomData = editingJob.service.customFieldData ? [...editingJob.service.customFieldData] : [];
    const existingIndex = updatedCustomData.findIndex(f => f.fieldId === 'actualLaborMinutes');
    if (existingIndex !== -1) {
      updatedCustomData[existingIndex] = { fieldId: 'actualLaborMinutes', value: val };
    } else {
      updatedCustomData.push({ fieldId: 'actualLaborMinutes', value: val });
    }

    onUpdateOrder({
      ...editingJob.service,
      customFieldData: updatedCustomData
    });

    toast.success(`Updated actual labor time to ${val} mins for Order #${editingJob.service.appointmentId?.split('-').pop() || editingJob.service.submissionId.slice(0, 8)}`);
    setEditingJob(null);
  };

  // Export Excel Report
  const handleExportLaborReport = () => {
    if (typeof XLSX === 'undefined') {
      alert('Spreadsheet library not loaded. Please refresh and try again.');
      return;
    }

    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    // Sheet 1: Worker Efficiency Performance
    const workerRows = filteredWorkersList.map(w => ({
      'Worker Username': w.username,
      'Lead Jobs Count': w.roleInJobs.leadCount,
      'Helper Jobs Count': w.roleInJobs.helperCount,
      'Total Jobs Completed': w.totalJobs,
      'Total Estimated Hours': (w.totalEstimatedMins / 60).toFixed(2),
      'Total Actual Hours Logged': (w.totalActualMins / 60).toFixed(2),
      'Efficiency Score (%)': (w.efficiencyRatio * 100).toFixed(1) + '%',
      'Variance (Mins Saved)': w.savedMins,
      'On-Time Rate (%)': w.totalJobs > 0 ? ((w.onTimeJobsCount / w.totalJobs) * 100).toFixed(1) + '%' : '100%'
    }));

    const wsWorkers = XLSX.utils.json_to_sheet(workerRows);
    XLSX.utils.book_append_sheet(wb, wsWorkers, 'Worker_Efficiency_Summary');

    // Sheet 2: Detailed Job Labor Ledger
    const jobRows = filteredJobLedger.map(j => ({
      'Appointment / Order ID': j.service.appointmentId?.split('-').pop() || j.service.submissionId.slice(0, 8),
      'Service Date': j.service.scheduledDate ? formatScheduledDate(j.service) : new Date(j.service.timestamp).toLocaleDateString('en-IN'),
      'Customer': `${j.service.customerFirstName} ${j.service.customerLastName}`,
      'Vehicle': `${j.service.carBrandModel} (${j.service.carNumber})`,
      'Services Selected': (j.service.serviceSelection || []).join(', '),
      'Lead Technician': j.leadTech,
      'Helper Assignee': j.helperTech || 'None',
      'Estimated Mins': j.estimatedMinutes,
      'Actual Mins Logged': j.actualMinutes,
      'Time Variance (Mins)': j.varianceMinutes > 0 ? `+${j.varianceMinutes} (Saved)` : `${j.varianceMinutes} (Overrun)`,
      'Efficiency %': (j.efficiencyRatio * 100).toFixed(1) + '%',
      'Data Source': j.isManualOverride ? 'Manual Override ✏️' : 'Status Timestamps ⏱️'
    }));

    const wsJobs = XLSX.utils.json_to_sheet(jobRows);
    XLSX.utils.book_append_sheet(wb, wsJobs, 'Job_Labor_Ledger');

    XLSX.writeFile(wb, `labor_efficiency_analytics_${dateStr}.xlsx`);
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { font: { weight: 'bold', size: 11 } }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { border: { dash: [4, 4] }, grid: { color: '#e2e8f0' }, ticks: { font: { size: 10 } } }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <Card title="Technician & Helper Labor Efficiency Analytics">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-1">
          <div>
            <p className="text-xs text-slate-500">
              Real-time audit comparing estimated service duration against actual logged time for Lead Technicians & Helpers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filter by Worker Select */}
            <select
              value={selectedWorker}
              onChange={(e) => setSelectedWorker(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <option value="">👥 All Technicians & Helpers</option>
              {allWorkers.map(w => (
                <option key={w} value={w}>👤 {w}</option>
              ))}
            </select>

            {/* Export Excel */}
            <button
              onClick={handleExportLaborReport}
              disabled={completedJobs.length === 0}
              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:text-brand-blue hover:border-brand-blue rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <IconDownload className="w-4 h-4" />
              Export Excel Report
            </button>
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <div className="p-2 bg-indigo-100 rounded-lg"><IconClock className="w-5 h-5 text-indigo-600" /></div>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
              summaryKpi.overallEfficiency >= 100 
                ? 'bg-emerald-100 text-emerald-800' 
                : summaryKpi.overallEfficiency >= 85 
                ? 'bg-amber-100 text-amber-800' 
                : 'bg-rose-100 text-rose-800'
            }`}>
              {summaryKpi.overallEfficiency.toFixed(1)}%
            </span>
          </div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Labor Efficiency Index</p>
            <p className="text-2xl font-extrabold text-slate-800 mt-0.5">
              {summaryKpi.overallEfficiency >= 100 ? '🚀 Faster than Target' : summaryKpi.overallEfficiency >= 85 ? '🎯 On Target' : '⏳ Time Overrun'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Target benchmark ratio = 100%</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
          <div className="p-2 bg-emerald-100 rounded-lg w-fit"><IconCheck className="w-5 h-5 text-emerald-600" /></div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">On-Time Completion Rate</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-0.5">
              {summaryKpi.onTimeRate.toFixed(1)}%
            </p>
            <p className="text-xs text-slate-400 mt-1">Jobs completed within estimated duration</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
          <div className="p-2 bg-blue-100 rounded-lg w-fit"><IconChartBar className="w-5 h-5 text-blue-600" /></div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Est. vs Actual Logged Hours</p>
            <p className="text-2xl font-extrabold text-brand-blue mt-0.5">
              {summaryKpi.totEstHours.toFixed(1)}h <span className="text-slate-400 font-normal text-base">vs</span> {summaryKpi.totActHours.toFixed(1)}h
            </p>
            <p className="text-xs text-slate-400 mt-1">Across {summaryKpi.totalJobs} completed service jobs</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200 hover:shadow-md transition-all">
          <div className="p-2 bg-amber-100 rounded-lg w-fit"><IconUsers className="w-5 h-5 text-amber-600" /></div>
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hours Saved / Net Variance</p>
            <p className={`text-2xl font-extrabold mt-0.5 ${summaryKpi.timeSavedHours >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {summaryKpi.timeSavedHours >= 0 ? `+${summaryKpi.timeSavedHours.toFixed(1)} hrs` : `${summaryKpi.timeSavedHours.toFixed(1)} hrs`}
            </p>
            <p className="text-xs text-slate-400 mt-1">{summaryKpi.timeSavedHours >= 0 ? 'Saved vs standard time' : 'Exceeded estimated time'}</p>
          </div>
        </div>
      </div>

      {/* Graphical Comparisons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Technician & Helper Hours Comparison (Estimated vs Actual)">
          {filteredWorkersList.length > 0 ? (
            <ChartComponent
              type="bar"
              height={260}
              data={{
                labels: filteredWorkersList.slice(0, 10).map(w => w.username),
                datasets: [
                  {
                    label: 'Estimated Hours (Benchmark)',
                    data: filteredWorkersList.slice(0, 10).map(w => Number((w.totalEstimatedMins / 60).toFixed(1))),
                    backgroundColor: '#0D2A4F',
                    borderRadius: 5
                  },
                  {
                    label: 'Actual Hours Logged',
                    data: filteredWorkersList.slice(0, 10).map(w => Number((w.totalActualMins / 60).toFixed(1))),
                    backgroundColor: '#3b82f6',
                    borderRadius: 5
                  }
                ]
              }}
              options={{
                ...chartOptions,
                scales: {
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Hours', font: { size: 10 } }
                  }
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No technician logs found</div>
          )}
        </Card>

        <Card title="Individual Efficiency Score Distribution (%)">
          {filteredWorkersList.length > 0 ? (
            <ChartComponent
              type="bar"
              height={260}
              data={{
                labels: filteredWorkersList.slice(0, 10).map(w => w.username),
                datasets: [
                  {
                    label: 'Efficiency Index (%)',
                    data: filteredWorkersList.slice(0, 10).map(w => Number((w.efficiencyRatio * 100).toFixed(1))),
                    backgroundColor: filteredWorkersList.slice(0, 10).map(w => 
                      w.efficiencyRatio >= 1.0 ? '#10b981' : w.efficiencyRatio >= 0.85 ? '#f59e0b' : '#f43f5e'
                    ),
                    borderRadius: 5
                  }
                ]
              }}
              options={{
                ...chartOptions,
                scales: {
                  y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Efficiency %', font: { size: 10 } }
                  }
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No efficiency data available</div>
          )}
        </Card>
      </div>

      {/* Leaderboard & Worker Efficiency Table */}
      <Card title="Technician & Helper Efficiency Scorecard">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search & Role filters */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search worker by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-brand-accent w-48"
              />
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                {(['ALL', 'LEAD', 'HELPER'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => setSelectedRoleFilter(role)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${
                      selectedRoleFilter === role ? 'bg-white text-brand-blue shadow-xs' : 'text-slate-600 hover:text-slate-800'
                    }`}
                  >
                    {role === 'ALL' ? 'All Roles' : role === 'LEAD' ? 'Lead Techs' : 'Helpers'}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-400 font-medium">
              Showing {filteredWorkersList.length} staff members
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Worker Name</th>
                  <th className="px-4 py-3 text-center">Lead / Helper Jobs</th>
                  <th className="px-4 py-3 text-center">Total Est. Time</th>
                  <th className="px-4 py-3 text-center">Total Logged Time</th>
                  <th className="px-4 py-3 text-center">Efficiency Score</th>
                  <th className="px-4 py-3 text-center">Variance (Saved/Over)</th>
                  <th className="px-4 py-3 text-center">Status Badge</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-slate-700">
                {filteredWorkersList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                      No technician/helper performance records match current filters.
                    </td>
                  </tr>
                ) : (
                  filteredWorkersList.map(w => {
                    const effPct = w.efficiencyRatio * 100;
                    const estHrs = (w.totalEstimatedMins / 60).toFixed(1);
                    const actHrs = (w.totalActualMins / 60).toFixed(1);
                    const savedHrs = (w.savedMins / 60).toFixed(1);

                    return (
                      <tr 
                        key={w.username}
                        onClick={() => setSelectedWorker(selectedWorker === w.username ? '' : w.username)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedWorker === w.username ? 'bg-indigo-50/50' : ''}`}
                      >
                        <td className="px-4 py-3.5 font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-brand-blue/10 text-brand-blue font-bold flex items-center justify-center text-xs">
                            {w.username.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <div>{w.username}</div>
                            <div className="text-[10px] text-slate-400 font-normal">
                              {w.roleInJobs.leadCount > 0 && w.roleInJobs.helperCount > 0 
                                ? 'Lead Tech & Helper' 
                                : w.roleInJobs.leadCount > 0 
                                ? 'Lead Technician' 
                                : 'Helper Assignee'}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-center font-semibold text-slate-700">
                          <span className="text-brand-blue font-bold">{w.roleInJobs.leadCount} Lead</span>
                          {w.roleInJobs.helperCount > 0 && (
                            <span className="text-indigo-600 font-medium text-xs ml-1">({w.roleInJobs.helperCount} Helper)</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                          {estHrs} hrs
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold text-blue-700">
                          {actHrs} hrs
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black border ${
                            effPct >= 100 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                              : effPct >= 85 
                              ? 'bg-amber-50 text-amber-800 border-amber-200' 
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}>
                            {effPct.toFixed(1)}%
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-center font-bold text-xs">
                          {w.savedMins >= 0 ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              +{savedHrs} hrs saved
                            </span>
                          ) : (
                            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              {savedHrs} hrs overrun
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-center text-xs font-bold">
                          {effPct >= 105 ? (
                            <span className="text-emerald-700">🚀 Highly Efficient</span>
                          ) : effPct >= 90 ? (
                            <span className="text-blue-700">🎯 On Target</span>
                          ) : (
                            <span className="text-amber-700">⏳ Needs Optimization</span>
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
      </Card>

      {/* Detailed Job Labor Audit Ledger */}
      <Card title={`Detailed Job Labor Audit Ledger ${selectedWorker ? `(Filtered for ${selectedWorker})` : ''}`}>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-xs text-slate-500">
              Audit actual hours logged from job status transitions (`In Progress` → `Completed`) or click edit to manually adjust actual duration.
            </p>
            {selectedWorker && (
              <button
                onClick={() => setSelectedWorker('')}
                className="text-xs text-brand-blue hover:underline font-bold"
              >
                Clear Worker Filter ({selectedWorker})
              </button>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Order / Customer</th>
                  <th className="px-4 py-3">Services Selected</th>
                  <th className="px-4 py-3">Lead / Helper</th>
                  <th className="px-4 py-3 text-center">Estimated Mins</th>
                  <th className="px-4 py-3 text-center">Actual Mins</th>
                  <th className="px-4 py-3 text-center">Efficiency %</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100 text-slate-700">
                {filteredJobLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400 font-medium">
                      No completed service jobs recorded.
                    </td>
                  </tr>
                ) : (
                  filteredJobLedger.slice(0, 50).map(job => {
                    const apptId = job.service.appointmentId?.split('-').pop() || job.service.submissionId.slice(0, 8);
                    const dateStr = job.service.scheduledDate ? formatScheduledDate(job.service) : new Date(job.service.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

                    return (
                      <tr key={job.service.submissionId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-brand-blue">#{apptId}</span>
                            <span className="text-xs text-slate-400">({dateStr})</span>
                          </div>
                          <div className="text-xs text-slate-600 font-medium mt-0.5">
                            {job.service.customerFirstName} {job.service.customerLastName} · {job.service.carBrandModel}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs font-medium text-slate-600 max-w-xs truncate">
                          {(job.service.serviceSelection || []).join(', ')}
                        </td>

                        <td className="px-4 py-3 text-xs">
                          <div className="font-bold text-slate-800">👤 {job.leadTech}</div>
                          {job.helperTech && (
                            <div className="text-indigo-600 font-semibold mt-0.5">🤝 Helper: {job.helperTech}</div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center font-bold text-slate-800 text-xs">
                          {job.estimatedMinutes} mins
                        </td>

                        <td className="px-4 py-3 text-center font-bold text-blue-700 text-xs">
                          {job.actualMinutes} mins
                          {job.isManualOverride && (
                            <span className="block text-[10px] text-amber-600 font-normal">✏️ Override</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            job.efficiencyRatio >= 1.0 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {(job.efficiencyRatio * 100).toFixed(0)}%
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setEditingJob(job);
                              setEditActualMinsInput(String(job.actualMinutes));
                            }}
                            className="p-1.5 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded-md transition-colors"
                            title="Edit Actual Time Logged"
                          >
                            <IconPencil className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Edit Actual Labor Minutes Modal */}
      {editingJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              Adjust Logged Labor Duration
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Order #{editingJob.service.appointmentId?.split('-').pop() || editingJob.service.submissionId.slice(0, 8)} · {editingJob.service.customerFirstName} {editingJob.service.customerLastName}
            </p>

            <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200 mb-5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Estimated Benchmark Duration:</span>
                <span className="font-bold text-slate-800">{editingJob.estimatedMinutes} Mins</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Assigned Lead Tech:</span>
                <span className="font-bold text-slate-800">{editingJob.leadTech}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Actual Logged Labor Time (Minutes)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={editActualMinsInput}
                    onChange={(e) => setEditActualMinsInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-brand-accent"
                  />
                  <span className="text-xs font-bold text-slate-500">Mins</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingJob(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveActualLaborMins}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                Save Duration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LaborAnalyticsView;
