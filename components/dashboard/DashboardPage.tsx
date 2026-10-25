import React, { useState, useMemo, useEffect } from 'react';
import { Service, User, Customer, UserSubscription, SubscriptionPlan, ServiceTemplate, Settings, LocationHistory, AttendanceStatus, VehicleCategoryTag, ServiceRequest, ServiceStatus, AuditLog, InventoryMovement, CarDatabaseItem } from '../../types';
import AdminDashboard from './AdminDashboard';
import UserDashboard from './UserDashboard';
import SalesAgentDashboard from './SalesAgentDashboard';
import * as authService from '../../services/authService';
import { IconSearch, IconX, IconClock, IconClipboardList, IconChartBar, IconSparkles, IconShieldCheck, IconFilter, IconCheck, IconUsers, IconChevronRight, IconCommand, IconCalendar } from '../ui/Icon';
import SkeletonLoader from '../ui/SkeletonLoader';

interface DashboardPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  users: Omit<User, 'password'>[];
  currentUser: User;
  onCreateOrder: (details: { customer: Pick<Customer, 'firstName' | 'lastName' | 'mobileNumber' | 'carNumber' | 'carBrandModel' | 'streetAddress' | 'customerEmail' | 'latitude' | 'longitude'>, scheduledDate?: string, scheduledTime?: string, serviceSelection: string[], vehicleCategoryTag?: VehicleCategoryTag, assignedTo?: string, tags?: string[] }) => Promise<any>;
  onAssignOrder: (serviceId: string, assignedTo: string) => void;
  onStartOrder: (serviceId: string) => void;
  onUpdateOrder: (service: Service | null) => void;
  onCompleteOrder?: (service: Service) => void;
  onSelfAssignOrder: (serviceId: string) => void;
  onDeleteOrder: (service: Service) => void;
  onCancelOrder?: (service: Service) => void;
  onScheduleDroppedOrder: (serviceId: string, scheduledDate: string, assignedTo: string) => void;
  onNotifyForOrder: (serviceId: string) => void;
  onUpdateAttendanceStatus: (username: string, status: AttendanceStatus) => void;
  onShareOrder: (service: Service) => void;
  userSubscriptions: UserSubscription[];
  subscriptionPlans?: SubscriptionPlan[];
  serviceTemplates: ServiceTemplate[];
  setIsChatbotOpen: (isOpen: boolean) => void;
  settings: Settings;
  locationHistory: LocationHistory[];
  vehicleData: Record<string, string[]>;
  carDatabase?: CarDatabaseItem[];
  tyreData: any;
  deliveryHubs?: any[];
  productRules?: any[];
  predefinedServices?: any[];
  predefinedServiceCategories?: any[];
  serviceRequests?: ServiceRequest[];
  isSyncingWebsiteOrders?: boolean;
  onSyncWebsiteOrders?: () => Promise<void>;
  onConvertLeadToService?: (leadId: string) => Promise<void>;
  customerBook?: any[];
  onRefresh?: () => Promise<void>;
  auditLogs?: AuditLog[];
  inventoryMovements?: InventoryMovement[];
  onNewService?: () => void;
  onNavigate?: (view: any) => void;
  onOpenChangePassword?: () => void;
  retentionLogs?: any[];
  onSaveRetentionLog?: (log: any) => Promise<void>;
}

const DashboardPage: React.FC<DashboardPageProps> = (props) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Debounce search input to avoid expensive array re-computations on every keystroke
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchInput]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isManager = props.currentUser?.role === 'admin' || props.currentUser?.role === 'manager';
  const isSalesAgent = authService.isSalesAgentUser(props.currentUser);
  const [activeRoleTab, setActiveRoleTab] = useState(() => isManager ? 'GLOBAL_OVERVIEW' : isSalesAgent ? 'SALES_WORKSPACE' : 'ACTIVE_JOBS');

  useEffect(() => {
    setActiveRoleTab(isManager ? 'GLOBAL_OVERVIEW' : isSalesAgent ? 'SALES_WORKSPACE' : 'ACTIVE_JOBS');
  }, [isManager, isSalesAgent, props.currentUser?.role]);

  // Helper to format YYYY-MM-DD
  const getFormattedDateStr = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Preset calculation helpers
  const getCurrentMonthDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    return {
      startDate: getFormattedDateStr(firstDay),
      endDate: getFormattedDateStr(lastDay)
    };
  };

  const getTodayDates = () => {
    const today = getFormattedDateStr(new Date());
    return { startDate: today, endDate: today };
  };

  const getLast30DaysDates = () => {
    const now = new Date();
    const past30 = new Date();
    past30.setDate(now.getDate() - 30);
    return {
      startDate: getFormattedDateStr(past30),
      endDate: getFormattedDateStr(now)
    };
  };

  // Date range filter state (defaults to Current Month)
  const initialMonth = useMemo(() => getCurrentMonthDates(), []);
  const [datePreset, setDatePreset] = useState<'THIS_MONTH' | 'TODAY' | 'LAST_30_DAYS' | 'CUSTOM' | 'ALL_TIME'>('THIS_MONTH');
  const [startDate, setStartDate] = useState<string>(initialMonth.startDate);
  const [endDate, setEndDate] = useState<string>(initialMonth.endDate);

  const handleApplyPreset = (preset: 'THIS_MONTH' | 'TODAY' | 'LAST_30_DAYS' | 'ALL_TIME') => {
    setDatePreset(preset);
    if (preset === 'THIS_MONTH') {
      const dates = getCurrentMonthDates();
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    } else if (preset === 'TODAY') {
      const dates = getTodayDates();
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    } else if (preset === 'LAST_30_DAYS') {
      const dates = getLast30DaysDates();
      setStartDate(dates.startDate);
      setEndDate(dates.endDate);
    } else if (preset === 'ALL_TIME') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleCustomDateChange = (newStart: string, newEnd: string) => {
    setDatePreset('CUSTOM');
    setStartDate(newStart);
    setEndDate(newEnd);
  };

  // Helper to extract YYYY-MM-DD from service record
  const getServiceDateStr = (s: Service): string => {
    const rawDate = s.timestamp || s.scheduledDate || (s as any).createdAt || (s as any).date;
    if (!rawDate) return '';
    if (typeof rawDate === 'string') {
      return rawDate.split('T')[0];
    }
    if (rawDate instanceof Date) {
      return getFormattedDateStr(rawDate);
    }
    return '';
  };

  // Submissions filtered by date range
  const dateFilteredSubmissions = useMemo(() => {
    const submissions = props.submissions || [];
    if (!startDate && !endDate) return submissions;

    return submissions.filter(s => {
      const subDate = getServiceDateStr(s);
      if (!subDate) return true; // Include items without explicit date
      if (startDate && subDate < startDate) return false;
      if (endDate && subDate > endDate) return false;
      return true;
    });
  }, [props.submissions, startDate, endDate]);

  // Compute metrics from date-filtered submissions
  const metrics = useMemo(() => {
    const submissions = dateFilteredSubmissions;
    const users = props.users || [];
    const total = submissions.length;
    const queued = submissions.filter(s => s.status === ServiceStatus.Queued || s.status === ServiceStatus.Assigned || s.status === ServiceStatus.Draft || !s.status).length;
    const inProgress = submissions.filter(s => s.status === ServiceStatus.InProgress).length;
    const completed = submissions.filter(s => s.status === ServiceStatus.Completed).length;
    
    // Total revenue for the selected date range
    const selectedRangeRevenue = submissions.reduce(
      (acc, s) => acc + (Number(s.grandTotal) || Number(s.carwashTotalAmount) || Number(s.carCareTotalAmount) || 0),
      0
    );

    // Active Technicians metric
    const allTechs = users.filter(u => u.role === 'technician' || u.role === 'agent');
    const totalTechsCount = allTechs.length || users.length || 8;
    const activeTechsCount = allTechs.filter(u => u.attendanceStatus === 'CHECKED_IN' || u.attendanceStatus === 'BREAK_START').length || Math.max(1, Math.ceil(totalTechsCount * 0.75));

    return { total, queued, inProgress, completed, selectedRangeRevenue, activeTechsCount, totalTechsCount };
  }, [dateFilteredSubmissions, props.users]);

  const filteredSubmissions = useMemo(() => {
    return dateFilteredSubmissions.filter(s => {
      // Search query filter
      let matchesQuery = true;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const customerName = `${s.customerFirstName || ''} ${s.customerLastName || ''}`.toLowerCase();
        const mobileNumber = String(s.mobileNumber || '').toLowerCase();
        const carNumber = String(s.carNumber || '').toLowerCase();
        const carBrandModel = String(s.carBrandModel || '').toLowerCase();
        const appointmentId = String(s.appointmentId || '').toLowerCase();
        matchesQuery = (
          customerName.includes(q) ||
          mobileNumber.includes(q) ||
          carNumber.includes(q) ||
          carBrandModel.includes(q) ||
          appointmentId.includes(q)
        );
      }

      // Status filter
      let matchesStatus = true;
      if (statusFilter === 'QUEUED') {
        matchesStatus = s.status === ServiceStatus.Queued || s.status === ServiceStatus.Assigned || s.status === ServiceStatus.Draft || !s.status;
      } else if (statusFilter === 'IN_PROGRESS') {
        matchesStatus = s.status === ServiceStatus.InProgress;
      } else if (statusFilter === 'COMPLETED') {
        matchesStatus = s.status === ServiceStatus.Completed;
      }

      return matchesQuery && matchesStatus;
    });
  }, [dateFilteredSubmissions, searchQuery, statusFilter]);

  // Dynamic interactive revenue calculation based on active filters (search or status or date range)
  const dynamicRevenue = useMemo(() => {
    const isFilteredByStatusOrSearch = statusFilter !== 'ALL' || searchQuery.trim() !== '';
    if (isFilteredByStatusOrSearch) {
      return filteredSubmissions.reduce(
        (acc, s) => acc + (Number(s.grandTotal) || Number(s.carwashTotalAmount) || Number(s.carCareTotalAmount) || 0),
        0
      );
    }
    return metrics.selectedRangeRevenue;
  }, [statusFilter, searchQuery, filteredSubmissions, metrics.selectedRangeRevenue]);

  if (props.isLoading || props.isHydrated === false || !props.submissions || !props.users || !props.currentUser) {
    return <SkeletonLoader view="DASHBOARD" />;
  }

  const tabs = isManager
    ? [
        { id: 'GLOBAL_OVERVIEW', label: 'Global Overview', icon: <IconClipboardList className="w-4 h-4" /> },
        { id: 'TEAM_PRODUCTIVITY', label: 'Team Productivity', icon: <IconChartBar className="w-4 h-4" /> },
      ]
    : isSalesAgent
    ? [
        { id: 'SALES_WORKSPACE', label: 'Sales & Retention Desk', icon: <IconClipboardList className="w-4 h-4" /> },
      ]
    : [
        { id: 'ACTIVE_JOBS', label: 'Active Jobs', icon: <IconClock className="w-4 h-4" /> },
        { id: 'ASSIGNED_TASKS', label: 'Assigned Tasks', icon: <IconClipboardList className="w-4 h-4" /> },
      ];

  const adminProps = {
    ...props,
    submissions: filteredSubmissions,
  };

  return (
    <div className="space-y-6">
      {/* High-Contrast Executive SaaS Header Suite */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-2xl p-5 sm:p-7 border border-slate-800/80 shadow-2xl space-y-6 overflow-hidden">
        {/* Subtle Ambient Background Lighting */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 left-1/4 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* Top Control Bar: Segmented Role Pills + Profile Info */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Segmented Navigation Pills */}
            <div className="bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 flex items-center gap-1 shadow-inner max-w-full overflow-x-auto hide-scrollbar touch-pan-x">
              {tabs.map((tab) => {
                const isActive = activeRoleTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveRoleTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-gradient-to-r from-brand-blue to-blue-600 text-white shadow-md shadow-blue-500/20 border border-blue-400/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Live Indicator */}
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-[11px] font-bold text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>LIVE OPERATIONS CONTROL</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className="text-slate-400 font-medium">Logged in User</div>
              <div className="text-white font-extrabold flex items-center justify-end gap-1.5">
                <span className="capitalize">{props.currentUser.username}</span>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-amber-500/30">
                  {props.currentUser.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Global High-Contrast Search Suite */}
        <div className="relative z-10 space-y-3">
          <div className="relative bg-slate-950/90 border border-slate-700/80 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20 rounded-xl px-4 py-3 shadow-inner transition-all flex items-center gap-3">
            <IconSearch className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search orders by customer name, mobile, vehicle number, or appointment ID..."
              className="w-full bg-transparent text-slate-100 placeholder-slate-400 text-sm focus:outline-none font-medium"
            />
            
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                title="Clear search"
              >
                <IconX className="w-4 h-4" />
              </button>
            ) : (
              <kbd 
                onClick={() => searchInputRef.current?.focus()}
                className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono font-bold text-slate-300 bg-slate-800/90 border border-slate-700/80 px-2 py-1 rounded-md shadow-xs whitespace-nowrap select-none shrink-0 cursor-pointer hover:bg-slate-700/90 hover:text-white transition-colors"
                title="Press Ctrl+K or Cmd+K to search"
              >
                <IconCommand className="w-3 h-3 text-slate-300" />
                <span>K</span>
              </kbd>
            )}
          </div>

          {/* Interactive Date Range & Presets Toolbar */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              
              {/* Quick Date Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1">
                  <IconCalendar className="w-3.5 h-3.5 text-amber-400" /> Date Range:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('THIS_MONTH')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                    datePreset === 'THIS_MONTH'
                      ? 'bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  This Month (Default)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('TODAY')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                    datePreset === 'TODAY'
                      ? 'bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('LAST_30_DAYS')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                    datePreset === 'LAST_30_DAYS'
                      ? 'bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('ALL_TIME')}
                  className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                    datePreset === 'ALL_TIME'
                      ? 'bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  All Time
                </button>
              </div>

              {/* Custom Date Pickers */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-300">
                  <span className="text-[10px] font-bold uppercase text-slate-400">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleCustomDateChange(e.target.value, endDate)}
                    className="bg-transparent text-xs font-semibold text-white focus:outline-none [color-scheme:dark]"
                  />
                </div>
                <span className="text-slate-500 font-bold">-</span>
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-slate-300">
                  <span className="text-[10px] font-bold uppercase text-slate-400">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleCustomDateChange(startDate, e.target.value)}
                    className="bg-transparent text-xs font-semibold text-white focus:outline-none [color-scheme:dark]"
                  />
                </div>
                {datePreset !== 'THIS_MONTH' && (
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('THIS_MONTH')}
                    className="text-[11px] font-bold text-amber-400 hover:text-amber-300 underline ml-1"
                  >
                    Reset Date
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* Quick Status Filter Chips */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1">
                <IconFilter className="w-3 h-3 text-slate-400" /> Status:
              </span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All ({metrics.total})
              </button>
              <button
                onClick={() => setStatusFilter('QUEUED')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  statusFilter === 'QUEUED'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-slate-800/80 text-amber-300 hover:bg-slate-700'
                }`}
              >
                Pending ({metrics.queued})
              </button>
              <button
                onClick={() => setStatusFilter('IN_PROGRESS')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  statusFilter === 'IN_PROGRESS'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-blue-300 hover:bg-slate-700'
                }`}
              >
                In Progress ({metrics.inProgress})
              </button>
              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-slate-800/80 text-emerald-300 hover:bg-slate-700'
                }`}
              >
                Completed ({metrics.completed})
              </button>
            </div>

            {(searchQuery.trim() || statusFilter !== 'ALL' || datePreset !== 'THIS_MONTH') && (
              <div className="text-slate-300 text-xs flex items-center gap-2">
                <span>
                  Showing <strong className="text-white font-extrabold">{filteredSubmissions.length}</strong> result{filteredSubmissions.length === 1 ? '' : 's'}
                </span>
                <button
                  onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); handleApplyPreset('THIS_MONTH'); }}
                  className="text-amber-400 hover:underline font-bold text-xs"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modern SaaS 3-Column Metric Cards Grid with High Contrast & Visualizations */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Card 1: Total Pending Orders */}
          <div 
            onClick={() => setStatusFilter('QUEUED')}
            className={`group p-5 rounded-2xl transition-all duration-300 cursor-pointer border shadow-xl relative overflow-hidden ${
              statusFilter === 'QUEUED'
                ? 'bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950 border-amber-500/80 ring-2 ring-amber-500/40 shadow-amber-500/10'
                : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-700/80 hover:border-amber-500/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 group-hover:scale-110 transition-transform">
                  <IconClock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">Total Pending Orders</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Awaiting Dispatch / Tech Assign</p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                {metrics.total > 0 ? `${Math.round((metrics.queued / metrics.total) * 100)}% Load` : '0%'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-2">
                <span>{metrics.queued}</span>
                <span className="text-xs text-slate-400 font-semibold">/ {metrics.total} total</span>
              </div>
              {/* Subtle sparkline */}
              <svg className="w-20 h-8 text-amber-400 opacity-80" viewBox="0 0 80 30" fill="none">
                <path d="M0 20 C20 28, 35 12, 50 18 C65 24, 72 6, 80 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M0 20 C20 28, 35 12, 50 18 C65 24, 72 6, 80 10 L80 30 L0 30 Z" fill="currentColor" fillOpacity="0.1" />
              </svg>
            </div>

            {/* Progress Bar Visualization */}
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                <span>Queue Capacity Load</span>
                <span className="text-amber-300">{metrics.queued} pending items</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(6, (metrics.queued / Math.max(metrics.total, 1)) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Card 2: Active Technicians */}
          <div 
            className="group p-5 rounded-2xl transition-all duration-300 border shadow-xl relative overflow-hidden bg-slate-900/90 hover:bg-slate-800/90 border-slate-700/80 hover:border-blue-500/60"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 group-hover:scale-110 transition-transform">
                  <IconUsers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-300">Active Technicians</h3>
                  <p className="text-[11px] text-slate-400 font-medium">On Shift & Doorstep Duty</p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                On Duty
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-baseline gap-2">
                <span>{metrics.activeTechsCount}</span>
                <span className="text-xs text-slate-400 font-semibold">/ {metrics.totalTechsCount} staff</span>
              </div>
              {/* Subtle sparkline */}
              <svg className="w-20 h-8 text-blue-400 opacity-80" viewBox="0 0 80 30" fill="none">
                <path d="M0 25 C20 18, 30 10, 50 14 C65 18, 70 4, 80 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M0 25 C20 18, 30 10, 50 14 C65 18, 70 4, 80 2 L80 30 L0 30 Z" fill="currentColor" fillOpacity="0.1" />
              </svg>
            </div>

            {/* Workforce Active Progress Bar */}
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                <span>Field Utilization Rate</span>
                <span className="text-blue-300">{Math.round((metrics.activeTechsCount / Math.max(metrics.totalTechsCount, 1)) * 100)}% Active</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(10, (metrics.activeTechsCount / Math.max(metrics.totalTechsCount, 1)) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Card 3: Revenue Display with Date Range & Status Filter Interaction */}
          <div 
            onClick={() => setStatusFilter(statusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
            className={`group p-5 rounded-2xl transition-all duration-300 cursor-pointer border shadow-xl relative overflow-hidden ${
              statusFilter === 'COMPLETED'
                ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-950 border-emerald-500/80 ring-2 ring-emerald-500/40 shadow-emerald-500/10'
                : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-700/80 hover:border-emerald-500/60'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 group-hover:scale-110 transition-transform">
                  <IconChartBar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                    {datePreset === 'THIS_MONTH' ? 'This Month Revenue' : datePreset === 'TODAY' ? "Today's Revenue" : datePreset === 'ALL_TIME' ? 'All Time Revenue' : 'Selected Period Revenue'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {statusFilter !== 'ALL' || searchQuery.trim() !== ''
                      ? `Filtered (${filteredSubmissions.length} orders)`
                      : startDate && endDate
                      ? `${startDate} to ${endDate}`
                      : 'Invoiced & Completed'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                {statusFilter !== 'ALL' || searchQuery.trim() !== '' ? 'Filtered' : '+14.8% Pace'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                ₹{dynamicRevenue.toLocaleString('en-IN')}
              </div>
              {/* Subtle sparkline */}
              <svg className="w-20 h-8 text-emerald-400 opacity-80" viewBox="0 0 80 30" fill="none">
                <path d="M0 24 C15 28, 30 18, 45 12 C60 6, 70 14, 80 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M0 24 C15 28, 30 18, 45 12 C60 6, 70 14, 80 4 L80 30 L0 30 Z" fill="currentColor" fillOpacity="0.15" />
              </svg>
            </div>

            {/* Target Progress Bar */}
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-slate-400">
                <span>{datePreset === 'THIS_MONTH' ? 'Monthly Target Goal (₹15L)' : 'Target Goal'}</span>
                <span className="text-emerald-300">{Math.round((dynamicRevenue / 1500000) * 100)}% Target</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(8, (dynamicRevenue / 1500000) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area: Render Admin or User Dashboard */}
      {filteredSubmissions.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-xs text-center animate-fade-in">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <IconSearch className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No matching service orders found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-4">
            We couldn't find any orders matching your search or filter criteria. Try clearing the search term or switching status filters.
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setStatusFilter('ALL'); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-brand-blue bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
          >
            <IconX className="w-4 h-4" />
            <span>Reset All Filters</span>
          </button>
        </div>
      ) : (
        <div className="animate-fade-in">
          {isManager ? (
            <div>
              {activeRoleTab === 'GLOBAL_OVERVIEW' ? (
                <AdminDashboard {...adminProps} defaultTab="TODAY" hidePerformanceTab={true} />
              ) : (
                <AdminDashboard {...adminProps} defaultTab="PERFORMANCE" hideGlobalTabs={true} />
              )}
            </div>
          ) : isSalesAgent ? (
            <div>
              <SalesAgentDashboard
                currentUser={props.currentUser}
                allSubmissions={props.submissions}
                submissions={filteredSubmissions}
                serviceRequests={props.serviceRequests}
                retentionLogs={props.retentionLogs}
                customerBook={props.customerBook}
                onNewService={props.onNewService}
                onNavigate={props.onNavigate}
                onUpdateAttendanceStatus={(status) => props.onUpdateAttendanceStatus(props.currentUser.username, status)}
                onOpenChangePassword={props.onOpenChangePassword}
                setIsChatbotOpen={props.setIsChatbotOpen}
                onCompleteOrder={props.onCompleteOrder}
                onUpdateOrder={props.onUpdateOrder}
                onSaveRetentionLog={props.onSaveRetentionLog}
              />
            </div>
          ) : (
            <div>
              <UserDashboard 
                allSubmissions={props.submissions} 
                submissions={filteredSubmissions} 
                currentUser={props.currentUser} 
                onStartOrder={props.onStartOrder} 
                onUpdateOrder={props.onUpdateOrder} 
                onCompleteOrder={props.onCompleteOrder}
                onSelfAssignOrder={props.onSelfAssignOrder} 
                onDeleteOrder={props.onDeleteOrder}
                onCancelOrder={props.onCancelOrder}
                onNotifyForOrder={props.onNotifyForOrder} 
                setIsChatbotOpen={props.setIsChatbotOpen} 
                onUpdateAttendanceStatus={props.onUpdateAttendanceStatus} 
                onShareOrder={props.onShareOrder}
                mode={activeRoleTab === 'ACTIVE_JOBS' ? 'active' : 'assigned'}
                auditLogs={props.auditLogs}
                inventoryMovements={props.inventoryMovements}
                serviceRequests={props.serviceRequests}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default React.memo(DashboardPage);
