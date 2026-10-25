

import React, { useState, useMemo, useEffect, useRef, Suspense, lazy } from 'react';
import { toast } from 'sonner';
// FIX: Removed obsolete 'PredefinedAddon' from imports.
import { Service, User, Customer, ServiceStatus, UserSubscription, SubscriptionPlan, ServiceTemplate, Settings, LocationHistory, AttendanceStatus, VehicleCategoryTag, ServiceRequest, AuditLog, InventoryMovement, InventoryItem, CarDatabaseItem } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
// FIX: Added missing Icon imports
import { IconPlus, IconClipboardList, IconClock, IconRefresh, IconCheck, IconFilter, IconSparkles, IconChartBar, IconCalendar, IconChevronLeft, IconChevronRight, IconMapPin, IconSettings } from '../ui/Icon';
import { AppointmentCard } from './AppointmentCard';
import UserPerformanceTracker from './UserPerformanceTracker';
import SalesAgentKpiProgressTracker from './SalesAgentKpiProgressTracker';
import ServiceCalendar from './ServiceCalendar';
import StatCard from './StatCard';
import Card from '../ui/Card';
import RouteOverview from './RouteOverview';
import QuickActionMenu from './QuickActionMenu';
import ActivityFeed from './ActivityFeed';
import { parseDateTime, isSameDay, isTodayService, getServiceLocalDateStr, getLocalTodayStr, toISTDateString } from '../../utils/dateTimeUtils';

const AssignOrderModal = lazy(() => import('./AssignOrderModal'));
const CreateOrderModal = lazy(() => import('./CreateOrderModal'));
const ScheduleOnDropModal = lazy(() => import('./ScheduleOnDropModal'));
const AppointmentsMap = lazy(() => import('./AppointmentsMap').then(m => ({ default: m.AppointmentsMap })));
const CsvImportModal = lazy(() => import('./CsvImportModal').then(m => ({ default: m.CsvImportModal })));
const CaptureLeadModal = lazy(() => import('./CaptureLeadModal').then(m => ({ default: m.CaptureLeadModal })));

// Declare Chart.js to TypeScript, as it's loaded from a CDN
declare const Chart: any;

interface AdminDashboardProps {
  submissions: Service[];
  users: Omit<User, 'password'>[];
  currentUser: User;
  onCreateOrder: (details: {
  customer: Pick<Customer, 'firstName' | 'lastName' | 'mobileNumber' | 'carNumber' | 'carBrandModel' | 'streetAddress' | 'customerEmail' | 'latitude' | 'longitude'>,
  scheduledDate?: string,
  scheduledTime?: string,
  serviceSelection: string[],
  vehicleCategoryTag?: VehicleCategoryTag,
  assignedTo?: string,
  tags?: string[]
}) => Promise<any>;
  onAssignOrder: (serviceId: string, assignedTo: string) => void;
  onStartOrder: (serviceId: string) => void;
  onUpdateOrder: (service: Service | null) => void;
  onCompleteOrder?: (service: Service) => void;
  onDeleteOrder: (service: Service) => void;
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
  tyreData: any;
  deliveryHubs?: any[];
  productRules?: any[];
  carDatabase?: CarDatabaseItem[];
  predefinedServices?: any[];
  predefinedServiceCategories?: any[];
  inventoryItems?: InventoryItem[];
  serviceRequests?: ServiceRequest[];
  isSyncingWebsiteOrders?: boolean;
  onSyncWebsiteOrders?: () => Promise<void>;
  onConvertLeadToService?: (leadId: string) => Promise<void>;
  onCaptureLead?: (lead: Omit<ServiceRequest, 'id' | 'status' | 'requestDate'>) => Promise<void>;
  onUpdateServiceRequest?: (lead: ServiceRequest) => Promise<void>;
  customerBook?: any[];
  onRefresh?: () => Promise<void>;
  defaultTab?: DashboardTab;
  hidePerformanceTab?: boolean;
  hideGlobalTabs?: boolean;
  auditLogs?: AuditLog[];
  inventoryMovements?: InventoryMovement[];
}

const ITEMS_PER_PAGE = 10;
type DashboardTab = 'APPOINTMENTS' | 'PERFORMANCE' | 'TODAY' | 'ROUTE_OVERVIEW';

const getDateDisplay = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (isSameDay(date, today)) return "Appointments for Today";
    if (isSameDay(date, yesterday)) return "Appointments for Yesterday";
    if (isSameDay(date, tomorrow)) return "Appointments for Tomorrow";
    return `Appointments for ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
};

const ChartComponent: React.FC<{ type: 'bar' | 'line' | 'doughnut' | 'pie', data: any, options: any }> = ({ type, data, options }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || typeof Chart === 'undefined') return;
        const existingChart = typeof Chart.getChart === 'function' ? Chart.getChart(canvasRef.current) : null;
        if (existingChart) existingChart.destroy();
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
            chartInstanceRef.current = null;
        }
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        chartInstanceRef.current = new Chart(ctx, { type, data, options });

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [type, data, options]);

    return <canvas ref={canvasRef}></canvas>;
};


const AdminDashboard: React.FC<AdminDashboardProps> = (props) => {
  const [assigningService, setAssigningService] = useState<Service | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [isCaptureLeadOpen, setIsCaptureLeadOpen] = useState(false);
  const [schedulingOnDrop, setSchedulingOnDrop] = useState<{ service: Service, date: Date } | null>(null);

  const [resourceFilter, setResourceFilter] = useState<'ALL' | 'HIGH_LOAD' | 'OPTIMAL' | 'AVAILABLE'>('ALL');
  const [webLeadsSearch, setWebLeadsSearch] = useState('');
  const [webLeadsSourceFilter, setWebLeadsSourceFilter] = useState('ALL');
  const [webLeadsStatusFilter, setWebLeadsStatusFilter] = useState('ALL');
  const [funnelSourceFilter, setFunnelSourceFilter] = useState<'ALL' | 'Web' | 'Meta' | 'Google' | 'Referral'>('ALL');
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const [filters, setFilters] = useState({ date: '', user: '', customer: '', serviceType: '', status: '', location: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [appointmentsView, setAppointmentsView] = useState<'LIST' | 'CALENDAR' | 'MAP'>('LIST');
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    if (props.hideGlobalTabs) return 'PERFORMANCE';
    return props.defaultTab || 'TODAY';
  });

  useEffect(() => {
    if (props.hideGlobalTabs) {
      setActiveTab('PERFORMANCE');
    } else if (props.defaultTab) {
      setActiveTab(props.defaultTab);
    }
  }, [props.hideGlobalTabs, props.defaultTab]);

  const [viewDate, setViewDate] = useState(new Date());

  const now = new Date();

  const handlePreviousDay = () => setViewDate(current => new Date(new Date(current).setDate(current.getDate() - 1)));
  const handleNextDay = () => setViewDate(current => new Date(new Date(current).setDate(current.getDate() + 1)));
  const handleGoToToday = () => setViewDate(new Date());

  const { 
    totalAppointments, 
    activeAppointments, 
    draftAppointments, 
    pendingAppointments, 
    inProgress, 
    completedToday,
    todayRevenue,
    todayCompletedRevenue
  } = useMemo(() => {
    let totalAppointments = 0;
    let activeAppointments = 0;
    let draftAppointments = 0;
    let pendingAppointments = 0;
    let inProgress = 0;
    let completedToday = 0;
    let todayRevenue = 0;
    let todayCompletedRevenue = 0;

    props.submissions.forEach(s => {
        if (s.isDeleted) return;
        totalAppointments++;
        if (s.status === ServiceStatus.Draft) {
            draftAppointments++;
        } else {
            activeAppointments++;
        }
        if (s.status === ServiceStatus.Queued || s.status === ServiceStatus.Assigned) {
            pendingAppointments++;
        }
        if (s.status === ServiceStatus.InProgress) {
            inProgress++;
        }

        if (isTodayService(s)) {
            todayRevenue += Number(s.grandTotal || 0);
            if (s.status === ServiceStatus.Completed) {
                completedToday++;
                todayCompletedRevenue += Number(s.grandTotal || 0);
            }
        }
    });
    return { 
      totalAppointments, 
      activeAppointments, 
      draftAppointments, 
      pendingAppointments, 
      inProgress, 
      completedToday,
      todayRevenue,
      todayCompletedRevenue
    };
  }, [props.submissions]);

  const websiteOrdersCount = useMemo(() => {
    return props.submissions.filter(s => s.isWebsiteOrder || s.submissionId?.startsWith('ABE-') || (s as any).websiteOrderId).length;
  }, [props.submissions]);
  
  const queuedServices = useMemo(() => {
    console.log("[DEBUG] AdminDashboard: Recalculating queuedServices. Total submissions:", props.submissions.length);
    const queued = props.submissions
        .filter(s => !s.isDeleted && s.status === ServiceStatus.Queued)
        .filter(s => !filters.location || String(s.streetAddress || '').toLowerCase().includes(filters.location.toLowerCase()))
        .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    console.log("[DEBUG] AdminDashboard: Found queued services:", queued.length);
    return queued;
  }, [props.submissions, filters.location]);


  const scheduledAppointments = useMemo(() => {
    return props.submissions.filter(s => {
      if (s.isDeleted) return false;
      
      // Apply user filters
      const scheduledDate = s.scheduledDate ? toISTDateString(s.scheduledDate) : '';
      const matchesDate = !filters.date || scheduledDate === filters.date;
      const matchesUser = !filters.user || s.assignedTo === filters.user;
      const customerName = `${s.customerFirstName || ''} ${s.customerLastName || ''}`.toLowerCase();
      const matchesCustomer = !filters.customer || customerName.includes(filters.customer.toLowerCase());
      const matchesService = !filters.serviceType || (Array.isArray(s.serviceSelection) ? s.serviceSelection.includes(filters.serviceType) : String(s.serviceSelection).includes(filters.serviceType));
      const matchesStatus = !filters.status || s.status === filters.status;
      const matchesLocation = !filters.location || String(s.streetAddress || '').toLowerCase().includes(filters.location.toLowerCase());

      return matchesDate && matchesUser && matchesCustomer && matchesService && matchesStatus && matchesLocation;
    }).sort((a, b) => {
        const dateA = parseDateTime(a);
        const dateB = parseDateTime(b);
        if (!dateA && !dateB) {
            // If both are unscheduled, sort by creation time descending
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        }
        if (!dateA) return 1; // Unscheduled items go to the end
        if (!dateB) return -1;
        return dateB.getTime() - dateA.getTime(); // Sort scheduled items descending
    });
  }, [props.submissions, filters]);
  
  const paginatedAppointments = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return scheduledAppointments.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [scheduledAppointments, currentPage]);

  const totalPages = Math.ceil(scheduledAppointments.length / ITEMS_PER_PAGE);
  
    const todaysAppointments = useMemo(() => {
        const viewYear = viewDate.getFullYear();
        const viewMonth = viewDate.getMonth();
        const viewDay = viewDate.getDate();

        return props.submissions
            .filter(s => {
                if (s.status === ServiceStatus.Draft) return false;
                
                const serviceDate = parseDateTime(s);
                if (!serviceDate) return false;

                const matchesDate = serviceDate.getFullYear() === viewYear &&
                       serviceDate.getMonth() === viewMonth &&
                       serviceDate.getDate() === viewDay;

                const matchesLocation = !filters.location || String(s.streetAddress || '').toLowerCase().includes(filters.location.toLowerCase());

                return matchesDate && matchesLocation;
            })
            .sort((a, b) => { // Sort by time, earlier first
                const dateA = parseDateTime(a);
                const dateB = parseDateTime(b);
                if (dateA && dateB) {
                    return dateA.getTime() - dateB.getTime();
                }
                if (dateA) return -1;
                if (dateB) return 1;
                return 0;
            });
    }, [props.submissions, viewDate, filters.location]);


  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setCurrentPage(1);
  };

  const handleDropOnCalendar = (serviceId: string, date: Date) => {
    const serviceToSchedule = props.submissions.find(s => s.submissionId === serviceId);
    if (serviceToSchedule && serviceToSchedule.status === ServiceStatus.Queued) {
        setSchedulingOnDrop({ service: serviceToSchedule, date });
    } else {
        console.warn("Attempted to drag a non-queued service or service not found.");
    }
  };
  
  const TabButton: React.FC<{ label: string; value: DashboardTab; }> = ({ label, value }) => (
    <button
        onClick={() => setActiveTab(value)}
        className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
            activeTab === value ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-200'
        }`}
    >
        {label}
    </button>
  );

  const retentionKpis = useMemo(() => {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const followUpsInPeriod = props.submissions.filter(s => 
        s.isFollowUp && new Date(s.timestamp) >= thirtyDaysAgo
    );
    const convertedFollowUps = followUpsInPeriod.filter(s => s.status === ServiceStatus.Completed);

    const actualFollowUps = followUpsInPeriod.length;
    const actualRevenue = convertedFollowUps.reduce((sum, s) => sum + s.grandTotal, 0);
    const actualConversionRate = actualFollowUps > 0 ? (convertedFollowUps.length / actualFollowUps) * 100 : 0;
    
    const targets = props.settings.retentionKpiTargets || { monthlyFollowUps: 0, conversionRatePercentage: 0, monthlyRevenue: 0 };

    return {
        actual: {
            followUps: actualFollowUps,
            revenue: actualRevenue,
            conversionRate: actualConversionRate,
        },
        targets: {
            followUps: targets.monthlyFollowUps,
            revenue: targets.monthlyRevenue,
            conversionRate: targets.conversionRatePercentage,
        }
    }
  }, [props.submissions, props.settings, now]);

  const conversionChartData = {
      labels: ['Converted', 'Not Converted'],
      datasets: [{
          data: [retentionKpis.actual.conversionRate, 100 - retentionKpis.actual.conversionRate],
          backgroundColor: ['#C5A57E', '#e2e8f0'],
          borderColor: '#ffffff',
          borderWidth: 2,
      }]
  };
  const followUpChartData = {
    labels: ['Follow-ups'],
    datasets: [
        { label: 'Actual', data: [retentionKpis.actual.followUps], backgroundColor: '#C5A57E' },
        { label: 'Target', data: [retentionKpis.targets.followUps], backgroundColor: '#64748b' }
    ]
  };
  const revenueChartData = {
    labels: ['Revenue'],
    datasets: [
        { label: 'Actual', data: [retentionKpis.actual.revenue], backgroundColor: '#C5A57E' },
        { label: 'Target', data: [retentionKpis.targets.revenue], backgroundColor: '#64748b' }
    ]
  };

  // Helper for relative time display
  const getRelativeTime = (timestamp: string | Date) => {
    const d = new Date(timestamp);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  // Widget visibility state
  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem('dashboard_visible_widgets');
      return saved ? JSON.parse(saved) : {
        statCards: true,
        activityFeed: true,
        recentActivity: true,
        monthlyRevenue: true,
        resourceAllocation: true,
        webLeads: true,
        leadFunnel: true,
      };
    } catch {
      return {
        statCards: true,
        activityFeed: true,
        recentActivity: true,
        monthlyRevenue: true,
        resourceAllocation: true,
        webLeads: true,
        leadFunnel: true,
      };
    }
  });

  const handleToggleWidget = (widgetKey: string) => {
    const updated = {
      ...visibleWidgets,
      [widgetKey]: !visibleWidgets[widgetKey as keyof typeof visibleWidgets],
    };
    setVisibleWidgets(updated);
    localStorage.setItem('dashboard_visible_widgets', JSON.stringify(updated));
  };

  // 1. Monthly Revenue Widget calculations
  const monthlyRevenueData = useMemo(() => {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    let currentMonthRevenue = 0;
    let lastMonthRevenue = 0;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Monthly trend for the last 6 months
    const monthlyTrend: { [key: string]: number } = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyTrend[key] = 0;
    }

    props.submissions.forEach(s => {
      if (s.status === ServiceStatus.Completed) {
        const date = new Date(s.timestamp);
        if (!isNaN(date.getTime())) {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (key in monthlyTrend) {
            monthlyTrend[key] += s.grandTotal;
          }
          
          if (date.getFullYear() === currentYear && date.getMonth() === currentMonth) {
            currentMonthRevenue += s.grandTotal;
          } else if (
            (currentMonth === 0 && date.getFullYear() === currentYear - 1 && date.getMonth() === 11) ||
            (currentMonth > 0 && date.getFullYear() === currentYear && date.getMonth() === currentMonth - 1)
          ) {
            lastMonthRevenue += s.grandTotal;
          }
        }
      }
    });

    const trendLabels = Object.keys(monthlyTrend).map(key => {
      const [year, month] = key.split('-');
      return `${monthNames[parseInt(month, 10) - 1]} ${year.substring(2)}`;
    });
    const trendValues = Object.values(monthlyTrend);

    return {
      currentMonthRevenue,
      lastMonthRevenue,
      trendLabels,
      trendValues
    };
  }, [props.submissions, now]);

  const revenueTrendChartData = useMemo(() => {
    return {
      labels: monthlyRevenueData.trendLabels,
      datasets: [{
        label: 'Revenue',
        data: monthlyRevenueData.trendValues,
        borderColor: '#0e213e',
        backgroundColor: 'rgba(14, 33, 62, 0.05)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#0e213e',
        pointHoverRadius: 6
      }]
    };
  }, [monthlyRevenueData]);

  const revenueTrendChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context: any) {
              return `₹${context.raw.toLocaleString('en-IN')}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, callback: (val: any) => '₹' + val.toLocaleString('en-IN') } }
      }
    };
  }, []);

  // 2. Recent Activity Widget calculations
  const recentActivity = useMemo(() => {
    return [...props.submissions]
      .filter(s => s.status !== ServiceStatus.Draft)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [props.submissions]);

  // 3. Resource Allocation Widget calculations & filters
  const resourceAllocation = useMemo(() => {
    const allocation: { [username: string]: { userObj?: Omit<User, 'password'>, active: number, completed: number, total: number } } = {};
    
    props.users.forEach(u => {
      allocation[u.username] = { userObj: u, active: 0, completed: 0, total: 0 };
    });

    props.submissions.forEach(s => {
      if (!s.isDeleted && s.assignedTo && s.assignedTo in allocation) {
        allocation[s.assignedTo].total++;
        if (s.status === ServiceStatus.Assigned || s.status === ServiceStatus.InProgress) {
          allocation[s.assignedTo].active++;
        } else if (s.status === ServiceStatus.Completed) {
          allocation[s.assignedTo].completed++;
        }
      }
    });

    return Object.entries(allocation).map(([username, stats]) => ({
      username,
      role: stats.userObj?.role || 'Technician',
      ...stats
    })).sort((a, b) => b.active - a.active || b.completed - a.completed);
  }, [props.submissions, props.users]);

  const filteredResourceAllocation = useMemo(() => {
    return resourceAllocation.filter(agent => {
      if (resourceFilter === 'HIGH_LOAD') return agent.active > 2;
      if (resourceFilter === 'OPTIMAL') return agent.active >= 1 && agent.active <= 2;
      if (resourceFilter === 'AVAILABLE') return agent.active === 0;
      return true;
    });
  }, [resourceAllocation, resourceFilter]);

  const resourceStats = useMemo(() => {
    const totalAgents = props.users.length;
    const activeTasks = resourceAllocation.reduce((sum, a) => sum + a.active, 0);
    const highLoadCount = resourceAllocation.filter(a => a.active > 2).length;
    const availableCount = resourceAllocation.filter(a => a.active === 0).length;
    return { totalAgents, activeTasks, highLoadCount, availableCount };
  }, [props.users.length, resourceAllocation]);

  // Web Leads Helper & Filtering
  const filteredWebLeads = useMemo(() => {
    const allLeads = props.serviceRequests || [];
    return allLeads.filter(lead => {
      // Status filter
      if (webLeadsStatusFilter !== 'ALL') {
        if (lead.status !== webLeadsStatusFilter) return false;
      } else {
        if (lead.status === 'Booked' || lead.status === 'Cancelled') return false;
      }

      // Source filter
      if (webLeadsSourceFilter !== 'ALL') {
        const src = (lead.leadSource || lead.source || 'Web').toLowerCase();
        if (!src.includes(webLeadsSourceFilter.toLowerCase())) return false;
      }

      // Search query
      if (webLeadsSearch.trim()) {
        const q = webLeadsSearch.toLowerCase();
        const phone = String(lead.customerPhone || (lead as any).mobileNumber || '');
        const nameMatch = (lead.customerName || '').toLowerCase().includes(q);
        const mobileMatch = phone.toLowerCase().includes(q);
        const serviceMatch = (lead.requestedService || '').toLowerCase().includes(q);
        const carMatch = (lead.carRegNo || lead.carBrand || '').toLowerCase().includes(q);
        if (!nameMatch && !mobileMatch && !serviceMatch && !carMatch) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.requestDate || 0).getTime() - new Date(a.requestDate || 0).getTime());
  }, [props.serviceRequests, webLeadsSearch, webLeadsSourceFilter, webLeadsStatusFilter]);

  const leadSourceCounts = useMemo(() => {
    const leads = props.serviceRequests || [];
    const counts = { All: 0, Web: 0, Meta: 0, Google: 0, Organic: 0, Referral: 0 };
    leads.forEach(l => {
      if (l.status === 'Booked' || l.status === 'Cancelled') return;
      counts.All++;
      const src = (l.leadSource || l.source || 'Web').toLowerCase();
      if (src.includes('meta')) counts.Meta++;
      else if (src.includes('google')) counts.Google++;
      else if (src.includes('organic')) counts.Organic++;
      else if (src.includes('referral')) counts.Referral++;
      else counts.Web++;
    });
    return counts;
  }, [props.serviceRequests]);

  const formatLeadTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    const time = new Date(dateStr).getTime();
    if (isNaN(time)) return 'Recently';
    const diffMins = Math.floor((Date.now() - time) / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Funnel Visualization Metrics computation
  const leadFunnelMetrics = useMemo(() => {
    const allLeads = props.serviceRequests || [];
    const submissions = props.submissions || [];

    const filteredLeads = allLeads.filter(lead => {
      if (funnelSourceFilter === 'ALL') return true;
      const src = (lead.leadSource || lead.source || 'Web').toLowerCase();
      return src.includes(funnelSourceFilter.toLowerCase());
    });

    const totalInquiries = filteredLeads.length;

    let contactedCount = 0;
    let bookedCount = 0;
    let completedCount = 0;

    const submissionPhoneMap = new Map<string, Service[]>();
    submissions.forEach(sub => {
      if (sub.isDeleted) return;
      const phone = String(sub.mobileNumber || '').replace(/[^0-9]/g, '');
      if (phone) {
        const list = submissionPhoneMap.get(phone) || [];
        list.push(sub);
        submissionPhoneMap.set(phone, list);
      }
    });

    filteredLeads.forEach(lead => {
      const statusUpper = (lead.status || 'NEW').toUpperCase();
      const phone = String(lead.customerPhone || (lead as any).mobileNumber || '').replace(/[^0-9]/g, '');
      const matchedSubs = phone ? (submissionPhoneMap.get(phone) || []) : [];

      const isContacted = [
        'CONTACTED', 'CONTACT', 'FOLLOW UP', 'HIGH INTENT', 'BOOKED', 'CONVERTED', 'COMPLETED', 'CREATED'
      ].some(s => statusUpper.includes(s)) || matchedSubs.length > 0;

      const isBooked = [
        'BOOKED', 'CONVERTED', 'COMPLETED'
      ].some(s => statusUpper.includes(s)) || matchedSubs.length > 0;

      const isCompleted = statusUpper.includes('COMPLETED') || matchedSubs.some(s => s.status === ServiceStatus.Completed || (s as any).status === 'Completed');

      if (isContacted) contactedCount++;
      if (isBooked) bookedCount++;
      if (isCompleted) completedCount++;
    });

    const stage1_new = totalInquiries;
    const stage2_contacted = Math.min(stage1_new, Math.max(contactedCount, bookedCount, completedCount));
    const stage3_booked = Math.min(stage2_contacted, Math.max(bookedCount, completedCount));
    const stage4_completed = Math.min(stage3_booked, completedCount);

    const pctContacted = stage1_new > 0 ? Math.round((stage2_contacted / stage1_new) * 100) : 0;
    const pctBooked = stage1_new > 0 ? Math.round((stage3_booked / stage1_new) * 100) : 0;
    const pctCompleted = stage1_new > 0 ? Math.round((stage4_completed / stage1_new) * 100) : 0;

    const step1To2 = stage1_new > 0 ? Math.round((stage2_contacted / stage1_new) * 100) : 0;
    const step2To3 = stage2_contacted > 0 ? Math.round((stage3_booked / stage2_contacted) * 100) : 0;
    const step3To4 = stage3_booked > 0 ? Math.round((stage4_completed / stage3_booked) * 100) : 0;

    return {
      stage1_new,
      stage2_contacted,
      stage3_booked,
      stage4_completed,
      pctContacted,
      pctBooked,
      pctCompleted,
      step1To2,
      step2To3,
      step3To4,
      winRate: pctCompleted,
    };
  }, [props.serviceRequests, props.submissions, funnelSourceFilter]);

  const activeWidgetsCount = [
    visibleWidgets.recentActivity,
    visibleWidgets.monthlyRevenue,
    visibleWidgets.resourceAllocation,
    visibleWidgets.webLeads,
    visibleWidgets.leadFunnel,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8 pb-20 sm:pb-0">
      {/* Executive Welcome Hero Header */}
      <div className="relative bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-slate-800 overflow-hidden">
        {/* Background ambient glow effect */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-brand-blue/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-0 right-1/3 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs font-semibold text-brand-accent">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Operations Control Hub
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
              {now.getHours() < 12 ? 'Good Morning' : now.getHours() < 17 ? 'Good Afternoon' : 'Good Evening'}, <span className="text-brand-accent capitalize">{props.currentUser.username}</span>!
            </h1>
            <p className="text-slate-300 text-sm max-w-xl">
              Here is your real-time business overview, order queue stats, and operational performance metrics for today.
            </p>

            {/* Quick Metrics Chips */}
            <div className="pt-2 flex flex-wrap gap-2">
              <div className="bg-slate-800/90 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="font-bold text-white">{totalAppointments}</span> Total ({activeAppointments} Active, {draftAppointments} Drafts)
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="font-bold text-white">{pendingAppointments}</span> Pending
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-bold text-white">{completedToday}</span> Completed Today
              </div>
              <div className="bg-slate-800/90 border border-slate-700/60 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
                Today's Revenue: <span className="font-bold text-white">₹{todayRevenue.toLocaleString('en-IN')}</span>
              </div>
              <div className="bg-slate-800/90 border border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Website Orders (Neon DB):</span>
                <span className="font-bold text-amber-300">{websiteOrdersCount}</span>
                {props.onSyncWebsiteOrders && (
                  <button
                    onClick={props.onSyncWebsiteOrders}
                    disabled={props.isSyncingWebsiteOrders}
                    className="ml-1 text-amber-300 hover:text-white p-0.5 rounded transition hover:bg-slate-700/60"
                    title="Sync Website Orders from Neon DB"
                  >
                    <IconRefresh className={`w-3.5 h-3.5 ${props.isSyncingWebsiteOrders ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row gap-3 self-start lg:self-center">
            {props.onSyncWebsiteOrders && (
              <button 
                onClick={props.onSyncWebsiteOrders}
                disabled={props.isSyncingWebsiteOrders}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-amber-500/50 hover:border-amber-400 text-amber-300 rounded-xl font-bold text-sm shadow-md transition-all duration-200 flex items-center justify-center gap-2 group active:scale-95 disabled:opacity-50"
                title="Sync website orders directly from Neon PostgreSQL orders table"
              >
                <IconRefresh className={`w-4 h-4 text-amber-400 ${props.isSyncingWebsiteOrders ? 'animate-spin' : ''}`} />
                <span>{props.isSyncingWebsiteOrders ? 'Syncing Orders...' : 'Sync Website Orders'}</span>
              </button>
            )}

            <button 
              onClick={() => props.setIsChatbotOpen(true)} 
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-xl font-bold text-sm shadow-md transition-all duration-200 flex items-center justify-center gap-2 group hover:border-slate-600 active:scale-95"
            >
              <IconSparkles className="w-5 h-5 text-amber-400 group-hover:rotate-12 transition-transform" />
              <span>Use AI Assistant</span>
            </button>

            <button 
              onClick={() => setIsCreateModalOpen(true)} 
              className="px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl font-extrabold text-sm shadow-lg shadow-amber-500/20 transition-all duration-200 flex items-center justify-center gap-2 active:scale-95"
            >
              <IconPlus className="w-5 h-5 stroke-[2.5]" />
              <span>Create New Order</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dashboard Customize Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-blue/10 text-brand-blue rounded-lg">
            <IconSettings className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Dashboard Widget Layout</h3>
            <p className="text-xs text-slate-500">Enable or disable specific executive visual widgets for your custom view.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.activityFeed}
              onChange={() => handleToggleWidget('activityFeed')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Activity Feed</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.statCards}
              onChange={() => handleToggleWidget('statCards')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Summary Cards</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.recentActivity}
              onChange={() => handleToggleWidget('recentActivity')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Recent Activity</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.monthlyRevenue}
              onChange={() => handleToggleWidget('monthlyRevenue')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Monthly Revenue</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.resourceAllocation}
              onChange={() => handleToggleWidget('resourceAllocation')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Resource Allocation</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.webLeads}
              onChange={() => handleToggleWidget('webLeads')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Web Leads</span>
          </label>
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={visibleWidgets.leadFunnel}
              onChange={() => handleToggleWidget('leadFunnel')}
              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
            />
            <span>Conversion Funnel</span>
          </label>
        </div>
      </div>

       {/* Stat Cards */}
       {visibleWidgets.statCards && (
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
             <StatCard label="Total Appointments" value={totalAppointments} icon={<IconClipboardList className="w-6 h-6 text-blue-600"/>} iconBgColor="bg-blue-100" />
             <StatCard label="Pending" value={pendingAppointments} icon={<IconClock className="w-6 h-6 text-amber-600"/>} iconBgColor="bg-amber-100" />
             <StatCard label="In Progress" value={inProgress} icon={<IconRefresh className="w-6 h-6 text-purple-600"/>} iconBgColor="bg-purple-100" />
             <StatCard label="Completed Today" value={completedToday} icon={<IconCheck className="w-6 h-6 text-green-600"/>} iconBgColor="bg-green-100" />
             <StatCard label="Today's Revenue" value={`₹${todayRevenue.toLocaleString('en-IN')}`} icon={<IconSparkles className="w-6 h-6 text-emerald-600"/>} iconBgColor="bg-emerald-100" />
         </div>
       )}

       {/* System Activity Feed (Displays last 5 significant system events) */}
       {visibleWidgets.activityFeed && (
         <ActivityFeed
           auditLogs={props.auditLogs}
           submissions={props.submissions}
           inventoryMovements={props.inventoryMovements}
           serviceRequests={props.serviceRequests}
           limit={5}
           title="System Activity Feed"
         />
       )}

      {/* Dynamic Widget Grid System */}
      {activeWidgetsCount > 0 && (
        <div className={`grid grid-cols-1 ${
          activeWidgetsCount === 1 ? 'grid-cols-1' :
          activeWidgetsCount === 2 ? 'lg:grid-cols-2' :
          activeWidgetsCount === 3 ? 'lg:grid-cols-3' :
          'lg:grid-cols-2 xl:grid-cols-4'
        } gap-6`}>
          
          {/* Monthly Revenue Card Widget */}
          {visibleWidgets.monthlyRevenue && (
            <Card className="hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                    <IconChartBar className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-700 text-base">Monthly Revenue</h3>
                </div>
                {/* Trend Badge */}
                <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  monthlyRevenueData.currentMonthRevenue >= monthlyRevenueData.lastMonthRevenue
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {monthlyRevenueData.currentMonthRevenue >= monthlyRevenueData.lastMonthRevenue ? '▲' : '▼'}{' '}
                  {Math.abs(
                    ((monthlyRevenueData.currentMonthRevenue - monthlyRevenueData.lastMonthRevenue) /
                      (monthlyRevenueData.lastMonthRevenue || 1)) *
                      100
                  ).toFixed(1)}
                  %
                </div>
              </div>

              <div className="mb-4">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Current Month</span>
                <div className="flex flex-col xl:flex-row xl:items-baseline xl:space-x-2">
                  <span className="text-2xl font-extrabold text-[#0e213e]">
                    ₹{monthlyRevenueData.currentMonthRevenue.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    vs ₹{monthlyRevenueData.lastMonthRevenue.toLocaleString('en-IN')} last month
                  </span>
                </div>
              </div>

              {/* Mini Trend Chart */}
              <div className="h-40 relative">
                {typeof Chart !== 'undefined' ? (
                  <ChartComponent
                    type="line"
                    data={revenueTrendChartData}
                    options={revenueTrendChartOptions}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                    Trend Chart Loading...
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recent Activity Card Widget */}
          {visibleWidgets.recentActivity && (
            <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                      <IconClipboardList className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-700 text-base">Recent Activity</h3>
                  </div>
                  {/* Pulsing Live Badge */}
                  <div className="flex items-center space-x-1.5 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Live</span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[170px] overflow-y-auto pr-1">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((activity) => {
                      const relativeTime = getRelativeTime(activity.timestamp);
                      const statusColor =
                        activity.status === ServiceStatus.Completed ? 'text-green-700 bg-green-50 border-green-100' :
                        activity.status === ServiceStatus.InProgress ? 'text-purple-700 bg-purple-50 border-purple-100' :
                        activity.status === ServiceStatus.Assigned ? 'text-blue-700 bg-blue-50 border-blue-100' :
                        'text-amber-700 bg-amber-50 border-amber-100';

                      return (
                        <div key={activity.submissionId} className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">
                              {activity.customerFirstName} {activity.customerLastName}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {activity.carBrandModel} • {activity.serviceSelection.slice(0, 2).join(', ')}
                            </p>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusColor}`}>
                              {activity.status}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                              {relativeTime}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-center text-slate-400 text-xs py-8">No recent activity.</p>
                  )}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                <button
                  onClick={() => setActiveTab('APPOINTMENTS')}
                  className="text-xs font-bold text-brand-blue hover:text-brand-blue/80 hover:underline inline-flex items-center gap-1 transition-colors"
                >
                  View all appointments →
                </button>
              </div>
            </Card>
          )}

          {/* Resource Allocation Card Widget */}
          {visibleWidgets.resourceAllocation && (
            <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between border border-slate-200/80 bg-white">
              <div>
                {/* Header with Title & Aggregate Stats */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-gradient-to-br from-blue-50 to-indigo-50 text-brand-blue rounded-xl shadow-xs border border-blue-100">
                      <IconClock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        Resource Allocation
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-50 text-brand-blue border border-blue-100">
                          {resourceStats.activeTasks} Active Tasks
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">Agent load balance & execution pipeline</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60">
                    {resourceStats.totalAgents} Field Agents
                  </span>
                </div>

                {/* Quick Filter Bar */}
                <div className="flex items-center justify-between gap-1 mb-3 text-[10px]">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60">
                    {(['ALL', 'HIGH_LOAD', 'OPTIMAL', 'AVAILABLE'] as const).map((filterKey) => {
                      const labels = { ALL: 'All', HIGH_LOAD: 'High Load', OPTIMAL: 'Optimal', AVAILABLE: 'Available' };
                      const isActive = resourceFilter === filterKey;
                      return (
                        <button
                          key={filterKey}
                          onClick={() => setResourceFilter(filterKey)}
                          className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                            isActive
                              ? 'bg-white text-slate-800 shadow-xs border border-slate-200/50'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {labels[filterKey]}
                        </button>
                      );
                    })}
                  </div>
                  {resourceStats.highLoadCount > 0 && (
                    <span className="text-[9px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 animate-pulse">
                      ⚠️ {resourceStats.highLoadCount} Overloaded
                    </span>
                  )}
                </div>

                {/* Agent Load Bar List */}
                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredResourceAllocation.map((agent) => {
                    const loadLabel =
                      agent.active === 0 ? 'Available' :
                      agent.active <= 2 ? 'Optimal' :
                      'High Workload';
                    const loadColor =
                      agent.active === 0 ? 'bg-slate-100 text-slate-600 border-slate-200' :
                      agent.active <= 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-rose-50 text-rose-700 border-rose-200';
                    const activeBarColor =
                      agent.active === 0 ? 'bg-slate-300' :
                      agent.active <= 2 ? 'bg-emerald-500' :
                      'bg-rose-500';
                    const statusDotColor =
                      agent.active === 0 ? 'bg-slate-400' :
                      agent.active <= 2 ? 'bg-emerald-500' :
                      'bg-rose-500';

                    const maxCapacity = 5;
                    const activePct = Math.min((agent.active / maxCapacity) * 100, 100);
                    const completedPct = Math.min((agent.completed / maxCapacity) * 100, 100 - activePct);

                    return (
                      <div key={agent.username} className="p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 border border-slate-100 transition-all space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <div className="w-6 h-6 rounded-full bg-slate-800 text-white font-extrabold text-[10px] flex items-center justify-center uppercase shadow-xs">
                                {agent.username.slice(0, 2)}
                              </div>
                              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${statusDotColor}`}></span>
                            </div>
                            <div>
                              <span className="font-bold text-slate-800 text-xs block leading-tight">{agent.username}</span>
                              <span className="text-[9px] text-slate-400 capitalize">{agent.role}</span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${loadColor}`}>
                              {loadLabel}
                            </span>
                            <span className="text-[10px] text-slate-600 font-bold">
                              <strong className="text-slate-900">{agent.active}</strong> active / {agent.completed} done
                            </span>
                          </div>
                        </div>

                        {/* Stacked Workload Meter Bar */}
                        <div className="h-2 w-full bg-slate-200/60 rounded-full overflow-hidden flex">
                          <div
                            className={`h-full ${activeBarColor} transition-all duration-500`}
                            style={{ width: `${activePct}%` }}
                            title={`${agent.active} Active Orders`}
                          ></div>
                          <div
                            className="h-full bg-slate-400/50 transition-all duration-500"
                            style={{ width: `${completedPct}%` }}
                            title={`${agent.completed} Completed Orders`}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredResourceAllocation.length === 0 && (
                    <div className="text-center text-slate-400 text-xs py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="font-semibold text-slate-600">No agents in this load category</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Try selecting "All" to view all field resources.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 text-center flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400 font-medium">
                  Capacity: ~5 orders per agent
                </span>
                <button
                  onClick={() => setActiveTab('PERFORMANCE')}
                  className="font-bold text-brand-blue hover:text-brand-blue/80 hover:underline inline-flex items-center gap-1 transition-colors text-xs"
                >
                  Analyze performance →
                </button>
              </div>
            </Card>
          )}

          {/* Web Leads Card Widget */}
          {visibleWidgets.webLeads && (
            <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between border border-slate-200/80 bg-white">
              <div>
                {/* Header with Quick Action Toolbar */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 rounded-xl shadow-xs border border-emerald-100">
                      <IconClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        Web Leads Queue
                        <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {leadSourceCounts.All} Active
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">Real-time web inquiries & conversions</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    {props.onSyncWebsiteOrders && (
                      <button
                        onClick={props.onSyncWebsiteOrders}
                        disabled={props.isSyncingWebsiteOrders}
                        className="p-1.5 text-slate-500 hover:text-brand-blue hover:bg-slate-100 rounded-lg transition-all border border-slate-200/60 bg-white shadow-xs"
                        title="Sync website orders from Neon DB (Single Source of Truth)"
                      >
                        <IconRefresh className={`w-3.5 h-3.5 ${props.isSyncingWebsiteOrders ? 'animate-spin' : ''}`} />
                      </button>
                    )}

                    <button
                      onClick={() => setIsCaptureLeadOpen(true)}
                      className="px-2 py-1 text-brand-blue hover:bg-blue-50 rounded-lg transition-all flex items-center gap-1 border border-blue-200/80 bg-blue-50/50 shadow-xs"
                      title="Capture New Lead Manually"
                    >
                      <svg className="w-3.5 h-3.5 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] font-bold">Capture</span>
                    </button>
                    
                    <button
                      onClick={() => setIsCsvImportOpen(true)}
                      className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all flex items-center gap-1 border border-emerald-200/80 bg-emerald-50/50 shadow-xs"
                      title="Upload Historical Leads CSV"
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span className="text-[10px] font-bold">CSV</span>
                    </button>
                  </div>
                </div>

                {/* Source Channel Mini Pills */}
                <div className="flex items-center gap-1 mb-2.5 overflow-x-auto pb-1 scrollbar-none text-[9px]">
                  <button
                    onClick={() => setWebLeadsSourceFilter('ALL')}
                    className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                      webLeadsSourceFilter === 'ALL'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All ({leadSourceCounts.All})
                  </button>
                  <button
                    onClick={() => setWebLeadsSourceFilter('Web')}
                    className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                      webLeadsSourceFilter === 'Web'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    Web ({leadSourceCounts.Web})
                  </button>
                  <button
                    onClick={() => setWebLeadsSourceFilter('Meta')}
                    className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                      webLeadsSourceFilter === 'Meta'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    Meta ({leadSourceCounts.Meta})
                  </button>
                  <button
                    onClick={() => setWebLeadsSourceFilter('Google')}
                    className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                      webLeadsSourceFilter === 'Google'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    Google ({leadSourceCounts.Google})
                  </button>
                  <button
                    onClick={() => setWebLeadsSourceFilter('Referral')}
                    className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                      webLeadsSourceFilter === 'Referral'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    Referral ({leadSourceCounts.Referral})
                  </button>
                </div>

                {/* Search & Quick Status Filter */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search lead name, phone, car..."
                      value={webLeadsSearch}
                      onChange={(e) => setWebLeadsSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue focus:bg-white"
                    />
                    <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <select
                    value={webLeadsStatusFilter}
                    onChange={(e) => setWebLeadsStatusFilter(e.target.value)}
                    className="py-1 px-2 text-[10px] font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue text-slate-700 cursor-pointer"
                  >
                    <option value="ALL">Active Leads</option>
                    <option value="New">New Only</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Booked">Converted (Booked)</option>
                  </select>
                </div>

                {/* Lead Items List */}
                <div className="divide-y divide-slate-100 max-h-[180px] overflow-y-auto pr-1 scrollbar-thin">
                  {filteredWebLeads.length > 0 ? (
                    filteredWebLeads.slice(0, 6).map((lead) => {
                      const getSourceBadgeColor = (source: string) => {
                        const s = (source || '').toLowerCase();
                        if (s.includes('meta')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
                        if (s.includes('google')) return 'bg-amber-50 text-amber-700 border-amber-200';
                        if (s.includes('organic')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        if (s.includes('reference') || s.includes('referral')) return 'bg-purple-50 text-purple-700 border-purple-200';
                        return 'bg-blue-50 text-blue-700 border-blue-200';
                      };

                      const phone = String(lead.customerPhone || (lead as any).mobileNumber || '');
                      const isConverting = convertingLeadId === lead.id;

                      return (
                        <div key={lead.id} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/50 p-1.5 rounded-lg transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {lead.customerName}
                              </span>
                              
                              <select
                                value={lead.leadSource || lead.source || 'Web'}
                                onChange={async (e) => {
                                  const newSource = e.target.value;
                                  const updatedLead = { 
                                    ...lead, 
                                    source: newSource,
                                    leadSource: newSource as any
                                  };
                                  try {
                                    if (props.onUpdateServiceRequest) {
                                      await props.onUpdateServiceRequest(updatedLead);
                                      toast.success(`Updated source to ${newSource}`);
                                    }
                                  } catch {
                                    toast.error("Failed to update lead source");
                                  }
                                }}
                                className={`text-[8px] px-1.5 py-0.5 rounded font-extrabold border uppercase cursor-pointer focus:outline-none ${getSourceBadgeColor(lead.leadSource || lead.source)}`}
                              >
                                <option value="Web">Web</option>
                                <option value="Meta">Meta</option>
                                <option value="Google Ads">Google Ads</option>
                                <option value="Organic">Organic</option>
                                <option value="Referral">Referral</option>
                              </select>

                              <span className="text-[9px] font-semibold text-slate-400">
                                {formatLeadTimeAgo(lead.requestDate)}
                              </span>
                            </div>

                            <p className="text-[10px] text-slate-600 truncate mt-0.5 font-medium">
                              {lead.requestedService} {lead.totalAmount ? `• ₹${lead.totalAmount}` : ''}
                            </p>
                            
                            <div className="flex items-center gap-2 mt-0.5">
                              {lead.carBrand && (
                                <span className="text-[9px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.2 rounded">
                                  🚗 {lead.carBrand} {lead.carModel} {lead.carRegNo ? `(${lead.carRegNo})` : ''}
                                </span>
                              )}
                              {phone && (
                                <span className="text-[9px] text-slate-400 font-mono">
                                  📞 {phone}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Quick Action Buttons */}
                          <div className="flex items-center sm:justify-end gap-1.5">
                            {phone && (
                              <a
                                href={`tel:${phone}`}
                                className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-md border border-slate-200 transition-all"
                                title={`Call ${lead.customerName}`}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                              </a>
                            )}

                            {phone && (
                              <a
                                href={`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${lead.customerName}, regarding your service inquiry for ${lead.requestedService}...`)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-md border border-slate-200 transition-all"
                                title="Send WhatsApp Message"
                              >
                                <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
                                </svg>
                              </a>
                            )}

                            {props.onConvertLeadToService && (
                              <button
                                onClick={async () => {
                                  try {
                                    setConvertingLeadId(lead.id);
                                    await props.onConvertLeadToService?.(lead.id);
                                    toast.success(`Successfully converted ${lead.customerName} to an active order ticket!`);
                                  } catch {
                                    toast.error("Failed to convert lead");
                                  } finally {
                                    setConvertingLeadId(null);
                                  }
                                }}
                                disabled={isConverting}
                                className="text-[10px] font-bold text-white bg-brand-blue hover:bg-brand-blue/90 px-2.5 py-1 rounded-md transition-all shadow-xs whitespace-nowrap hover:scale-105 active:scale-95 flex items-center gap-1 disabled:opacity-50"
                                title="Convert to active queued ticket"
                              >
                                {isConverting ? (
                                  <IconRefresh className="w-3 h-3 animate-spin" />
                                ) : (
                                  <IconCheck className="w-3 h-3" />
                                )}
                                <span>{isConverting ? 'Converting...' : 'Convert'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-slate-400 text-xs py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="font-semibold text-slate-600">No leads match filter</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Adjust channel filter or clear search box.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-500 font-semibold">
                  Total Booked: <strong className="text-emerald-700">{(props.serviceRequests || []).filter(r => r.status === 'Booked').length}</strong>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {filteredWebLeads.length} visible in list
                </span>
              </div>
            </Card>
          )}

          {/* Lead Conversion Funnel Card Widget */}
          {visibleWidgets.leadFunnel && (
            <Card className="hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between border border-slate-200/80 bg-white">
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-gradient-to-br from-indigo-50 to-purple-50 text-indigo-600 rounded-xl shadow-xs border border-indigo-100">
                      <IconFilter className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                        Lead Conversion Funnel
                        <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                          {leadFunnelMetrics.winRate}% Win Rate
                        </span>
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium">Path: New → Contacted → Booked → Completed</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60">
                    {leadFunnelMetrics.stage1_new} Total Leads
                  </span>
                </div>

                {/* Source Channel Filters */}
                <div className="flex items-center gap-1 mb-3 text-[9px]">
                  {(['ALL', 'Web', 'Meta', 'Google', 'Referral'] as const).map((sourceKey) => {
                    const isActive = funnelSourceFilter === sourceKey;
                    return (
                      <button
                        key={sourceKey}
                        onClick={() => setFunnelSourceFilter(sourceKey)}
                        className={`px-2 py-0.5 rounded-full font-bold whitespace-nowrap transition-all ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {sourceKey === 'ALL' ? 'All Channels' : sourceKey}
                      </button>
                    );
                  })}
                </div>

                {/* Funnel Visual Stack */}
                <div className="space-y-2.5 my-2">
                  {/* Stage 1: New */}
                  <div className="relative p-2.5 rounded-xl bg-indigo-50/40 border border-indigo-100/80 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-extrabold shadow-xs">1</span>
                        <span>1. New Inquiries</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-indigo-900">{leadFunnelMetrics.stage1_new}</span>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/80 px-1.5 py-0.2 rounded">100%</span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-indigo-100/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-500 rounded-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>

                  {/* Stage 2: Contacted */}
                  <div className="relative p-2.5 rounded-xl bg-blue-50/40 border border-blue-100/80 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-extrabold shadow-xs">2</span>
                        <span>2. Contacted & Nurtured</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-blue-900">{leadFunnelMetrics.stage2_contacted}</span>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100/80 px-1.5 py-0.2 rounded">
                          {leadFunnelMetrics.pctContacted}% of total
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">({leadFunnelMetrics.step1To2}% conv)</span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-blue-100/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(leadFunnelMetrics.pctContacted, 10)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stage 3: Booked */}
                  <div className="relative p-2.5 rounded-xl bg-teal-50/40 border border-teal-100/80 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-teal-600 text-white text-[10px] flex items-center justify-center font-extrabold shadow-xs">3</span>
                        <span>3. Booked / Converted</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-teal-900">{leadFunnelMetrics.stage3_booked}</span>
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-100/80 px-1.5 py-0.2 rounded">
                          {leadFunnelMetrics.pctBooked}% of total
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">({leadFunnelMetrics.step2To3}% conv)</span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-teal-100/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-600 to-teal-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(leadFunnelMetrics.pctBooked, 8)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Stage 4: Completed */}
                  <div className="relative p-2.5 rounded-xl bg-emerald-50/40 border border-emerald-100/80 transition-all">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-extrabold shadow-xs">4</span>
                        <span>4. Service Completed</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-extrabold text-emerald-900">{leadFunnelMetrics.stage4_completed}</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded">
                          {leadFunnelMetrics.pctCompleted}% win rate
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">({leadFunnelMetrics.step3To4}% conv)</span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-emerald-100/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(leadFunnelMetrics.pctCompleted, 6)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Insight Banner */}
                <div className="mt-3 p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-start gap-2">
                  <IconSparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-600 leading-snug">
                    <strong className="text-slate-800">Pipeline Insight: </strong>
                    {leadFunnelMetrics.stage1_new === 0 ? (
                      'No lead inquiries captured yet. Use the Web Leads widget or CSV import to add inquiries.'
                    ) : leadFunnelMetrics.step1To2 < 50 ? (
                      'Outreach rate is low. Reach out to new leads sooner to increase conversion.'
                    ) : leadFunnelMetrics.step2To3 < 50 ? (
                      'Noticeable drop between Contacted and Booked. Consider offering special promotion rates.'
                    ) : (
                      'Strong progression rate across all conversion stages.'
                    )}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] text-slate-400 font-medium">
                  Updated in real-time
                </span>
                <button
                  onClick={() => setIsCaptureLeadOpen(true)}
                  className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1 transition-colors text-xs"
                >
                  + Capture New Lead
                </button>
              </div>
            </Card>
          )}

        </div>
      )}

       {/* Tab Navigation */}
      {!props.hideGlobalTabs && (
        <div className="border-b border-slate-200">
            <div className="flex space-x-2 overflow-x-auto pb-1 hide-scrollbar touch-pan-x">
                <TabButton label="Daily View" value="TODAY" />
                <TabButton label="All Appointments" value="APPOINTMENTS" />
                {!props.hidePerformanceTab && <TabButton label="Performance" value="PERFORMANCE" />}
                <TabButton label="Route Overview" value="ROUTE_OVERVIEW" />
            </div>
        </div>
      )}

       {/* Tab Content */}

      {(activeTab === 'TODAY' || activeTab === 'APPOINTMENTS') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content Area */}
            <div className="lg:col-span-2 space-y-6">
                {activeTab === 'TODAY' && (
                    <Card>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-2">
                            <h2 className="text-xl font-bold text-slate-700 tracking-tight">
                                {getDateDisplay(viewDate)}
                            </h2>
                            <div className="flex items-center space-x-2">
                                <Button variant="ghost" onClick={handlePreviousDay} className="p-2 h-9 w-9" title="Previous Day">
                                    <IconChevronLeft className="w-5 h-5" />
                                </Button>
                                <Button variant="secondary" onClick={handleGoToToday} size="sm">Today</Button>
                                <Button variant="ghost" onClick={handleNextDay} className="p-2 h-9 w-9" title="Next Day">
                                    <IconChevronRight className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>

                        {/* Quick filter by location */}
                        <div className="mb-4 relative">
                            <input 
                                type="text"
                                name="location"
                                value={filters.location}
                                onChange={handleFilterChange}
                                placeholder="Quick filter today's view & queued services by location (e.g. Kolkata, street address)..."
                                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent bg-white shadow-sm"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <IconMapPin className="w-4 h-4" />
                            </div>
                            {filters.location && (
                                <button 
                                    onClick={() => setFilters(prev => ({ ...prev, location: '' }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 bg-white px-1"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <div className="space-y-4">
                            {todaysAppointments.length > 0 ? todaysAppointments.map(service => (
                                <AppointmentCard 
                                    key={service.submissionId} service={service} allSubmissions={props.submissions} currentUser={props.currentUser} auditLogs={props.auditLogs}
                                    onAssign={() => setAssigningService(service)} onStart={() => props.onStartOrder(service.submissionId)}
                                    onUpdate={() => props.onUpdateOrder(service)} onCompleteOrder={props.onCompleteOrder} onDelete={() => props.onDeleteOrder(service)}
                                    onNotify={() => props.onNotifyForOrder(service.submissionId)} onShareOrder={props.onShareOrder}
                                    isOverdue={service.status === ServiceStatus.Assigned && !!parseDateTime(service) && parseDateTime(service)! < now}
                                    isToday={isSameDay(parseDateTime(service), now)}
                                />
                            )) : (
                                <p className="text-center text-slate-500 py-8">No appointments scheduled for this day.</p>
                            )}
                        </div>
                    </Card>
                )}

                {activeTab === 'APPOINTMENTS' && (
                    <Card>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
                            <h2 className="text-xl font-bold text-slate-700 tracking-tight">All Appointments <span className="text-sm font-normal text-slate-500">({scheduledAppointments.length} total)</span></h2>
                            <div className="flex rounded-md shadow-sm">
                                <button onClick={() => setAppointmentsView('LIST')} className={`px-4 py-2 text-sm font-medium rounded-l-md transition-colors ${appointmentsView === 'LIST' ? 'bg-[#0e213e] text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}>List</button>
                                <button onClick={() => setAppointmentsView('CALENDAR')} className={`-ml-px px-4 py-2 text-sm font-medium transition-colors ${appointmentsView === 'CALENDAR' ? 'bg-[#0e213e] text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}><IconCalendar className="w-5 h-5" /></button>
                                <button onClick={() => setAppointmentsView('MAP')} className={`-ml-px px-4 py-2 text-sm font-medium rounded-r-md transition-colors flex items-center gap-1.5 ${appointmentsView === 'MAP' ? 'bg-[#0e213e] text-white z-10' : 'bg-white text-slate-700 hover:bg-slate-50 border'}`}><IconMapPin className="w-4 h-4" />Map</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-slate-200 items-end">
                            <Input label="Filter By Date" type="date" name="date" value={filters.date} onChange={handleFilterChange} />
                            <Input label="Filter By Customer" type="text" name="customer" value={filters.customer} onChange={handleFilterChange} placeholder="Name or mobile..." />
                            <div>
                                <label htmlFor="user-filter" className="block text-sm font-medium text-slate-700 mb-1">Filter By User</label>
                                <select id="user-filter" name="user" value={filters.user} onChange={handleFilterChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm h-[38px]">
                                    <option value="">All Users</option>
                                    {props.users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-1">Filter By Status</label>
                                <select id="status-filter" name="status" value={filters.status} onChange={handleFilterChange} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm h-[38px]">
                                    <option value="">All Statuses ({props.submissions.filter(s => !s.isDeleted).length})</option>
                                    <option value={ServiceStatus.Queued}>Queued</option>
                                    <option value={ServiceStatus.Assigned}>Assigned</option>
                                    <option value={ServiceStatus.InProgress}>In Progress</option>
                                    <option value={ServiceStatus.Completed}>Completed</option>
                                    <option value={ServiceStatus.Draft}>Draft</option>
                                </select>
                            </div>
                            <Input label="Filter By Location" type="text" name="location" value={filters.location} onChange={handleFilterChange} placeholder="City, area, or street..." />
                            <div className="flex items-center h-10">
                                <button 
                                    onClick={() => setFilters({ date: '', user: '', customer: '', serviceType: '', status: '', location: '' })}
                                    className="text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                                >
                                    Clear Filters
                                </button>
                            </div>
                        </div>
                        {appointmentsView === 'LIST' && (
                            <>
                                <div className="space-y-4 mt-4">
                                    {paginatedAppointments.length > 0 ? paginatedAppointments.map(service => (
                                        <AppointmentCard 
                                            key={service.submissionId} service={service} allSubmissions={props.submissions} currentUser={props.currentUser} auditLogs={props.auditLogs}
                                            onAssign={() => setAssigningService(service)} onStart={() => props.onStartOrder(service.submissionId)}
                                            onUpdate={() => props.onUpdateOrder(service)} onCompleteOrder={props.onCompleteOrder} onDelete={() => props.onDeleteOrder(service)}
                                            onNotify={() => props.onNotifyForOrder(service.submissionId)} onShareOrder={props.onShareOrder}
                                            isOverdue={service.status === ServiceStatus.Assigned && !!parseDateTime(service) && parseDateTime(service)! < now}
                                            isToday={isSameDay(parseDateTime(service), now)}
                                        />
                                    )) : (
                                        <p className="text-center text-slate-500 py-8">No appointments match your criteria.</p>
                                    )}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center space-x-4 mt-6">
                                        <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} variant="secondary">Previous</Button>
                                        <span className="text-slate-600 font-semibold">Page {currentPage} of {totalPages}</span>
                                        <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} variant="secondary">Next</Button>
                                    </div>
                                )}
                            </>
                        )}
                        {appointmentsView === 'CALENDAR' && (
                            <div className="mt-4">
                                <ServiceCalendar services={scheduledAppointments} onScheduleService={() => setIsCreateModalOpen(true)} onDropOnDate={handleDropOnCalendar} />
                            </div>
                        )}
                        {appointmentsView === 'MAP' && (
                            <div className="mt-4">
                                <Suspense fallback={<div className="h-64 flex items-center justify-center text-slate-400">Loading map...</div>}>
                                    <AppointmentsMap services={scheduledAppointments} settings={props.settings} />
                                </Suspense>
                            </div>
                        )}
                    </Card>
                )}
            </div>

            {/* Side Panel - Always visible in Today and Appointments tabs */}
            <div className="lg:col-span-1">
                <Card className="bg-red-50 border-red-200">
                    <div className="flex items-center space-x-3 mb-3">
                        <h2 className="text-xl font-bold text-red-800 tracking-tight">Action Required</h2>
                        <span className="px-2.5 py-1 text-sm font-semibold rounded-full bg-red-200 text-red-800">{queuedServices.length}</span>
                    </div>
                    <p className="text-sm text-red-700 mb-4">Drag an order onto the calendar to schedule it, or click to assign.</p>
                    <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-2 -mr-2">
                        {queuedServices.length > 0 ? queuedServices.map(service => (
                            <AppointmentCard 
                                key={service.submissionId} service={service} allSubmissions={props.submissions} currentUser={props.currentUser} auditLogs={props.auditLogs}
                                onAssign={() => setAssigningService(service)} onUpdate={() => props.onUpdateOrder(service)}
                                onDelete={() => props.onDeleteOrder(service)} onNotify={() => props.onNotifyForOrder(service.submissionId)}
                                onShareOrder={props.onShareOrder} 
                            />
                        )) : <p className="text-center py-4 text-slate-500">The queue is clear!</p>}
                    </div>
                </Card>
            </div>
        </div>
      )}

      {activeTab === 'PERFORMANCE' && (
        <div className="space-y-8">
            {/* Sales Agents KPI Target Progress with Horizontal Progress Bars */}
            <SalesAgentKpiProgressTracker
              submissions={props.submissions}
              users={props.users}
              settings={props.settings}
            />

            <UserPerformanceTracker submissions={props.submissions} users={props.users} agentRankThresholds={props.settings?.agentRankThresholds} />
            <Card>
                <div className="flex items-center space-x-3 mb-4">
                    <IconChartBar className="w-6 h-6 text-brand-blue" />
                    <h2 className="text-xl font-bold text-slate-700 tracking-tight">Retention KPIs (Last 30 Days)</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                    <div className="text-center">
                        <h3 className="font-bold text-slate-700 mb-2">Conversion Rate</h3>
                        <div className="relative w-40 h-40 mx-auto">
                            <ChartComponent type="doughnut" data={conversionChartData} options={{ responsive: true, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-3xl font-bold text-brand-blue">{retentionKpis.actual.conversionRate.toFixed(1)}%</span>
                                <span className="text-sm text-slate-500">Target: {retentionKpis.targets.conversionRate}%</span>
                            </div>
                        </div>
                    </div>
                     <div className="text-center">
                        <h3 className="font-bold text-slate-700 mb-2">Follow-ups Created</h3>
                        <div className="h-48">
                            <ChartComponent type="bar" data={followUpChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
                        </div>
                    </div>
                     <div className="text-center">
                        <h3 className="font-bold text-slate-700 mb-2">Revenue from Follow-ups</h3>
                         <div className="h-48">
                            <ChartComponent type="bar" data={revenueChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} />
                        </div>
                    </div>
                </div>
            </Card>
        </div>
      )}

      {activeTab === 'ROUTE_OVERVIEW' && (
        <RouteOverview
          submissions={props.submissions}
          users={props.users}
          settings={props.settings}
          viewDate={viewDate}
          onViewDateChange={setViewDate}
        />
      )}
      
      <Suspense fallback={null}>
        {assigningService && (
          <AssignOrderModal
            isOpen={!!assigningService}
            onClose={() => setAssigningService(null)}
            service={assigningService}
            users={props.users}
            onAssign={props.onAssignOrder}
          />
        )}

        {schedulingOnDrop && (
          <ScheduleOnDropModal
              isOpen={!!schedulingOnDrop}
              onClose={() => setSchedulingOnDrop(null)}
              service={schedulingOnDrop.service}
              date={schedulingOnDrop.date}
              users={props.users}
              onSchedule={props.onScheduleDroppedOrder}
          />
        )}

        {isCreateModalOpen && (
          <CreateOrderModal 
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onCreateOrder={props.onCreateOrder}
            userSubscriptions={props.userSubscriptions}
            subscriptionPlans={props.subscriptionPlans || []}
            serviceTemplates={props.serviceTemplates}
            allSubmissions={props.submissions}
            vehicleData={props.vehicleData}
            users={props.users} // Pass users for assignment
            settings={props.settings}
            deliveryHubs={props.deliveryHubs}
            productRules={props.productRules}
            predefinedServices={props.predefinedServices}
            predefinedServiceCategories={props.predefinedServiceCategories}
            inventoryItems={props.inventoryItems}
            carDatabase={props.carDatabase}
            customerBook={props.customerBook}
            serviceRequests={props.serviceRequests}
          />
        )}

        {isCsvImportOpen && (
          <CsvImportModal 
            onClose={() => setIsCsvImportOpen(false)}
            onRefresh={props.onRefresh || (async () => {})}
            sheetsUrl={props.settings.googleSheetsUrl}
          />
        )}

        {isCaptureLeadOpen && props.onCaptureLead && (
          <CaptureLeadModal
            isOpen={isCaptureLeadOpen}
            onClose={() => setIsCaptureLeadOpen(false)}
            onCapture={props.onCaptureLead}
          />
        )}
      </Suspense>

       {/* Floating Quick Action Menu for Agents & Admins */}
       <QuickActionMenu
         onCreateLead={props.onCaptureLead ? () => setIsCaptureLeadOpen(true) : undefined}
         onViewAppointments={() => setActiveTab('TODAY')}
         onSyncInventory={props.onRefresh}
         onCreateOrder={() => setIsCreateModalOpen(true)}
         onOpenAiAssistant={() => props.setIsChatbotOpen(true)}
       />
    </div>
  );
};

export default React.memo(AdminDashboard);
