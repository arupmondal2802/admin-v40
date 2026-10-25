

import React, { useMemo, useState, useEffect } from 'react';
import { Service, User, ServiceStatus, AttendanceStatus, AuditLog, InventoryMovement, ServiceRequest, DeliveryHub } from '../../types';
import { AppointmentCard } from './AppointmentCard';
import Button from '../ui/Button';
import { 
  IconSparkles, 
  IconChevronLeft, 
  IconChevronRight, 
  IconMapPin, 
  IconPhone, 
  IconClock, 
  IconCalendar, 
  IconCheck, 
  IconCheckCircle,
  IconUser, 
  IconEngine, 
  IconSearch, 
  IconRefresh, 
  IconFilter, 
  IconList, 
  IconShare, 
  IconBellRinging,
  IconReceipt,
  IconClipboardList,
  IconCrosshair
} from '../ui/Icon';
import AttendanceControl from './AttendanceControl';
import QuickActionMenu from './QuickActionMenu';
import ActivityFeed from './ActivityFeed';
import { parseDateTime, isSameDay, formatScheduledDate } from '../../utils/dateTimeUtils';
import { toast } from 'sonner';

const OrderTrackingMap = React.lazy(() => import('./OrderTrackingMap').then(m => ({ default: m.OrderTrackingMap })));

interface UserDashboardProps {
  submissions: Service[];
  allSubmissions: Service[];
  currentUser: User;
  onStartOrder: (serviceId: string) => void;
  onUpdateOrder: (service: Service | null) => void;
  onCompleteOrder?: (service: Service) => void;
  onSelfAssignOrder: (serviceId: string) => void;
  onDeleteOrder?: (service: Service) => void;
  onCancelOrder?: (service: Service) => void;
  onNotifyForOrder: (serviceId: string) => void;
  onUpdateAttendanceStatus: (username: string, status: AttendanceStatus) => void;
  onShareOrder: (service: Service) => void;
  setIsChatbotOpen: (isOpen: boolean) => void;
  mode?: 'active' | 'assigned';
  auditLogs?: AuditLog[];
  inventoryMovements?: InventoryMovement[];
  serviceRequests?: ServiceRequest[];
  deliveryHubs?: DeliveryHub[];
}

const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

const getDateHeaderTitle = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (isSameDay(date, today)) return "Today's Schedule";
    if (isSameDay(date, yesterday)) return "Yesterday's Schedule";
    if (isSameDay(date, tomorrow)) return "Tomorrow's Schedule";
    return `Schedule for ${date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;
};

const UserDashboard: React.FC<UserDashboardProps> = (props) => {
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT_HIGH'>('ALL');
  const [layoutView, setLayoutView] = useState<'GRID' | 'COMPACT'>('GRID');
  const [showActiveTripMap, setShowActiveTripMap] = useState(false);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [customDateInput, setCustomDateInput] = useState(new Date().toISOString().split('T')[0]);

  // Handle Date Shifts
  const handlePreviousDay = () => setViewDate(current => new Date(new Date(current).setDate(current.getDate() - 1)));
  const handleNextDay = () => setViewDate(current => new Date(new Date(current).setDate(current.getDate() + 1)));
  const handleGoToToday = () => {
    const today = new Date();
    setViewDate(today);
    setCustomDateInput(today.toISOString().split('T')[0]);
  };
  const handleGoToYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    setViewDate(y);
    setCustomDateInput(y.toISOString().split('T')[0]);
  };
  const handleGoToTomorrow = () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    setViewDate(t);
    setCustomDateInput(t.toISOString().split('T')[0]);
  };

  const handleApplyCustomDate = () => {
    if (!customDateInput) return;
    const parts = customDateInput.split('-');
    if (parts.length === 3) {
      const selected = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      setViewDate(selected);
      setShowDatePickerModal(false);
    }
  };

  // Generate 7-Day Ribbon strip around viewDate
  const sevenDayStrip = useMemo(() => {
    const strip: { date: Date; isSelected: boolean; isToday: boolean; jobCount: number }[] = [];
    const today = new Date();
    
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date(viewDate);
      d.setDate(d.getDate() + offset);
      
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const dy = d.getDate();

      // Count assigned jobs for rider on this day
      const count = props.submissions.filter(s => {
        if (s.assignedTo !== props.currentUser.username || s.isDeleted) return false;
        const sDate = parseDateTime(s);
        if (!sDate) return false;
        return sDate.getFullYear() === yr && sDate.getMonth() === mo && sDate.getDate() === dy;
      }).length;

      strip.push({
        date: d,
        isSelected: isSameDay(d, viewDate),
        isToday: isSameDay(d, today),
        jobCount: count
      });
    }
    return strip;
  }, [viewDate, props.submissions, props.currentUser.username]);

  // All Assigned Services for Current Rider
  const userAssignedSubmissions = useMemo(() => {
    return props.submissions.filter(s => s.assignedTo === props.currentUser.username && !s.isDeleted);
  }, [props.submissions, props.currentUser.username]);

  // Calculate Today's Stats
  const todayStats = useMemo(() => {
    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth();
    const dy = today.getDate();

    const todayJobs = userAssignedSubmissions.filter(s => {
      const sDate = parseDateTime(s);
      if (!sDate) return false;
      return sDate.getFullYear() === yr && sDate.getMonth() === mo && sDate.getDate() === dy;
    });

    const assignedCount = todayJobs.length;
    const inProgressCount = todayJobs.filter(s => s.status === ServiceStatus.InProgress).length;
    const completedCount = todayJobs.filter(s => s.status === ServiceStatus.Completed).length;
    const totalValue = todayJobs.reduce((sum, s) => sum + (s.grandTotal || 0), 0);

    return { assignedCount, inProgressCount, completedCount, totalValue };
  }, [userAssignedSubmissions]);

  // Find Current Active Trip / Immediate Action Order
  const activeTripJob = useMemo(() => {
    // 1. Look for InProgress job
    const inProgress = userAssignedSubmissions.find(s => s.status === ServiceStatus.InProgress);
    if (inProgress) return inProgress;

    // 2. Otherwise look for today's earliest Assigned job
    const today = new Date();
    const yr = today.getFullYear();
    const mo = today.getMonth();
    const dy = today.getDate();

    const todaysAssigned = userAssignedSubmissions
      .filter(s => s.status === ServiceStatus.Assigned)
      .filter(s => {
        const sDate = parseDateTime(s);
        if (!sDate) return true; // Keep unscheduled
        return sDate.getFullYear() === yr && sDate.getMonth() === mo && sDate.getDate() === dy;
      })
      .sort((a, b) => {
        const dateA = parseDateTime(a);
        const dateB = parseDateTime(b);
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return 0;
      });

    return todaysAssigned[0] || null;
  }, [userAssignedSubmissions]);

  // Filter Appointments for View Date
  const filteredAppointmentsForViewDate = useMemo(() => {
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();
    const viewDay = viewDate.getDate();

    let filtered = userAssignedSubmissions.filter(s => {
      const serviceDate = parseDateTime(s);
      if (!serviceDate) return false;
      return serviceDate.getFullYear() === viewYear &&
             serviceDate.getMonth() === viewMonth &&
             serviceDate.getDate() === viewDay;
    });

    // Apply Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(s => 
        String(s.customerFirstName || '').toLowerCase().includes(q) ||
        String(s.customerLastName || '').toLowerCase().includes(q) ||
        String(s.mobileNumber || '').toLowerCase().includes(q) ||
        String(s.carBrandModel || '').toLowerCase().includes(q) ||
        String(s.carNumber || '').toLowerCase().includes(q) ||
        String(s.streetAddress || '').toLowerCase().includes(q) ||
        String(s.appointmentId || '').toLowerCase().includes(q)
      );
    }

    // Apply Status Filter
    if (statusFilter === 'ASSIGNED') {
      filtered = filtered.filter(s => s.status === ServiceStatus.Assigned || s.status === ServiceStatus.Queued);
    } else if (statusFilter === 'IN_PROGRESS') {
      filtered = filtered.filter(s => s.status === ServiceStatus.InProgress);
    } else if (statusFilter === 'COMPLETED') {
      filtered = filtered.filter(s => s.status === ServiceStatus.Completed);
    }

    // Apply Priority Filter
    if (priorityFilter === 'URGENT_HIGH') {
      filtered = filtered.filter(s => s.priority === 'Urgent' || s.priority === 'High');
    }

    // Sort chronologically ascending
    return filtered.sort((a, b) => {
      const dateA = parseDateTime(a);
      const dateB = parseDateTime(b);
      if (dateA && dateB) return dateA.getTime() - dateB.getTime();
      return 0;
    });
  }, [userAssignedSubmissions, viewDate, searchQuery, statusFilter, priorityFilter]);

  // Other Appointments (Future / Unscheduled / Other Days)
  const otherAppointments = useMemo(() => {
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth();
    const viewDay = viewDate.getDate();

    return userAssignedSubmissions.filter(s => {
      const serviceDate = parseDateTime(s);
      if (!serviceDate) return true; // Keep unscheduled
      return !(serviceDate.getFullYear() === viewYear &&
             serviceDate.getMonth() === viewMonth &&
             serviceDate.getDate() === viewDay);
    }).sort((a, b) => {
      const dateA = parseDateTime(a);
      const dateB = parseDateTime(b);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    });
  }, [userAssignedSubmissions, viewDate]);

  // WhatsApp quick trigger
  const handleWhatsAppCustomer = (service: Service) => {
    const phone = service.mobileNumber ? String(service.mobileNumber).replace(/\D/g, '') : '';
    if (!phone) {
      toast.error('Customer mobile number is missing');
      return;
    }
    const name = `${service.customerFirstName || 'Customer'} ${service.customerLastName || ''}`.trim();
    const car = service.carBrandModel || 'Vehicle';
    const time = service.scheduledTime || 'today';
    const msg = encodeURIComponent(`Hello ${name}, I am your A Big Engine service technician (${props.currentUser.username}) assigned for your ${car} scheduled at ${time}. Please let me know if you have any location preferences!`);
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* 1. RIDER HERO HEADER & DUTY STATUS */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-blue to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-brand-accent/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-brand-accent text-slate-900 shadow-sm">
                Rider / Technician
              </span>
              <span className="text-xs text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2.5 py-0.5 rounded-full font-mono">
                @{props.currentUser.username}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2">
              Welcome, {props.currentUser.username}! 👋
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Manage your daily assigned orders, route directions, and live customer updates efficiently.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              onClick={() => props.setIsChatbotOpen(true)} 
              variant="secondary" 
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs shadow-sm font-semibold"
            >
              <IconSparkles className="w-4 h-4 mr-1.5 text-brand-accent" />
              AI Helper
            </Button>
          </div>
        </div>

        {/* ATTENDANCE & DUTY CONTROL INTEGRATION */}
        {(props.currentUser.role === 'agent' || props.currentUser.role === 'technician') && (
          <div className="mt-5 pt-4 border-t border-slate-800/80">
            <AttendanceControl 
              currentUser={props.currentUser} 
              onUpdateAttendanceStatus={props.onUpdateAttendanceStatus} 
            />
          </div>
        )}

        {/* TODAY'S METRIC PILLS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-slate-800/60 backdrop-blur-md border border-slate-700/60 p-3 rounded-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Today's Jobs</span>
            <span className="text-xl sm:text-2xl font-black text-white">{todayStats.assignedCount}</span>
          </div>
          <div className="bg-purple-950/40 backdrop-blur-md border border-purple-800/50 p-3 rounded-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300 block">In Progress</span>
            <span className="text-xl sm:text-2xl font-black text-purple-200">{todayStats.inProgressCount}</span>
          </div>
          <div className="bg-emerald-950/40 backdrop-blur-md border border-emerald-800/50 p-3 rounded-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block">Completed Today</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-200">{todayStats.completedCount}</span>
          </div>
          <div className="bg-amber-950/40 backdrop-blur-md border border-amber-800/50 p-3 rounded-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">Today's Value</span>
            <span className="text-xl sm:text-2xl font-black text-amber-200">₹{todayStats.totalValue.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* 2. CURRENT ACTIVE TRIP / LIVE JOURNEY HERO BANNER */}
      {activeTripJob && (
        <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border-2 border-indigo-500/50 shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-start flex-wrap gap-2 border-b border-indigo-800/60 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h2 className="text-base font-extrabold uppercase tracking-wide text-indigo-200 flex items-center gap-1.5">
                Current Trip & Active Job
              </h2>
              <span className="text-xs font-mono font-bold bg-indigo-900/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700">
                #{activeTripJob.appointmentId?.split('-').pop() || activeTripJob.submissionId.slice(-6).toUpperCase()}
              </span>
            </div>

            <span className={`px-3 py-1 text-xs font-extrabold rounded-full ${
              activeTripJob.status === ServiceStatus.InProgress 
                ? 'bg-purple-600 text-white animate-pulse' 
                : 'bg-blue-600 text-white'
            }`}>
              {activeTripJob.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* Customer & Vehicle Info */}
            <div className="space-y-1.5 md:col-span-2">
              <h3 className="text-xl font-black text-white">
                {activeTripJob.customerFirstName} {activeTripJob.customerLastName}
              </h3>
              <div className="flex items-center gap-3 text-xs text-indigo-200 flex-wrap">
                <span className="flex items-center gap-1">
                  <IconEngine className="w-4 h-4 text-amber-400" />
                  <strong>{activeTripJob.carBrandModel}</strong> ({activeTripJob.carNumber})
                </span>
                <span className="flex items-center gap-1">
                  <IconClock className="w-4 h-4 text-sky-400" />
                  Scheduled: <strong>{activeTripJob.scheduledTime || 'Today'}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <IconReceipt className="w-4 h-4 text-emerald-400" />
                  Value: <strong>₹{(activeTripJob.grandTotal || 0).toFixed(2)}</strong>
                </span>
              </div>

              {activeTripJob.streetAddress && (
                <div className="flex items-start gap-1.5 text-xs text-slate-300 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 mt-2">
                  <IconMapPin className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <span>{activeTripJob.streetAddress}</span>
                </div>
              )}

              {/* Calculated Distance if coordinates exist */}
              {activeTripJob.customerLatitude && activeTripJob.customerLongitude && props.currentUser.latitude && props.currentUser.longitude && (
                <div className="text-xs font-mono text-emerald-300 flex items-center gap-2 mt-1">
                  <IconCrosshair className="w-4 h-4 text-emerald-400" />
                  <span>
                    Distance from your position: <strong>{calculateDistanceKm(props.currentUser.latitude, props.currentUser.longitude, activeTripJob.customerLatitude, activeTripJob.customerLongitude)} km</strong> (~{Math.round((calculateDistanceKm(props.currentUser.latitude, props.currentUser.longitude, activeTripJob.customerLatitude, activeTripJob.customerLongitude) / 25) * 60)} mins driving)
                  </span>
                </div>
              )}
            </div>

            {/* Rider Quick Action Hub */}
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {activeTripJob.mobileNumber && (
                  <a href={`tel:${activeTripJob.mobileNumber}`} aria-label="Call Customer">
                    <Button variant="primary" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2">
                      <IconPhone className="w-4 h-4 mr-1" />
                      Call Customer
                    </Button>
                  </a>
                )}
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => handleWhatsAppCustomer(activeTripJob)}
                  className="w-full bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-700 text-xs font-bold py-2"
                >
                  <IconShare className="w-4 h-4 mr-1 text-emerald-400" />
                  WhatsApp
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {activeTripJob.customerLatitude && activeTripJob.customerLongitude ? (
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${activeTripJob.customerLatitude},${activeTripJob.customerLongitude}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="secondary" size="sm" className="w-full bg-indigo-900 hover:bg-indigo-800 text-white border-indigo-700 text-xs font-bold py-2">
                      <IconMapPin className="w-4 h-4 mr-1 text-rose-400" />
                      Google Maps
                    </Button>
                  </a>
                ) : (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeTripJob.streetAddress || '')}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="secondary" size="sm" className="w-full bg-indigo-900 hover:bg-indigo-800 text-white border-indigo-700 text-xs font-bold py-2">
                      <IconMapPin className="w-4 h-4 mr-1 text-rose-400" />
                      Address Map
                    </Button>
                  </a>
                )}

                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setShowActiveTripMap(!showActiveTripMap)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-white border-slate-700 text-xs font-bold py-2"
                >
                  <IconMapPin className="w-4 h-4 mr-1 text-brand-accent animate-pulse" />
                  {showActiveTripMap ? 'Hide Map' : 'Self Tracking'}
                </Button>
              </div>

              {/* Status Action Button */}
              {activeTripJob.status === ServiceStatus.Assigned && (
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={() => props.onStartOrder(activeTripJob.submissionId)}
                  className="w-full bg-brand-accent hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider py-2.5 shadow-md"
                >
                  Start Order Now
                </Button>
              )}
              {activeTripJob.status === ServiceStatus.InProgress && (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => {
                      const completedJob = { ...activeTripJob, status: ServiceStatus.Completed };
                      if (props.onCompleteOrder) props.onCompleteOrder(completedJob);
                      else props.onUpdateOrder(completedJob);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider py-2.5 shadow-md flex items-center justify-center gap-1.5"
                  >
                    <IconCheckCircle className="w-4 h-4" />
                    Complete Order
                  </Button>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => props.onUpdateOrder(activeTripJob)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider py-2.5 shadow-md"
                  >
                    Update Checklist
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Inline Order Trip Tracking Map */}
          {showActiveTripMap && (
            <div className="mt-4 pt-4 border-t border-indigo-800/80">
              <React.Suspense fallback={<div className="h-48 flex items-center justify-center text-slate-400">Loading trip map...</div>}>
                <OrderTrackingMap 
                  service={activeTripJob} 
                  currentUser={props.currentUser} 
                  deliveryHubs={props.deliveryHubs} 
                />
              </React.Suspense>
            </div>
          )}
        </section>
      )}

      {/* 3. DAILY AGENDA & DATE TOGGLES (YESTERDAY, TODAY, TOMORROW) */}
      <section className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-blue text-amber-300">
                Daily Agenda
              </span>
              <span className="text-xs font-bold text-slate-500 font-mono">
                {viewDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <IconCalendar className="w-5 h-5 text-brand-blue dark:text-brand-accent" />
              {getDateHeaderTitle(viewDate)}
            </h2>
          </div>

          {/* QUICK TOGGLE BUTTONS: YESTERDAY, TODAY, TOMORROW */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
              <button
                onClick={handleGoToYesterday}
                className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                  isSameDay(viewDate, new Date(new Date().setDate(new Date().getDate() - 1)))
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={handleGoToToday}
                className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                  isSameDay(viewDate, new Date())
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Today
              </button>
              <button
                onClick={handleGoToTomorrow}
                className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-all ${
                  isSameDay(viewDate, new Date(new Date().setDate(new Date().getDate() + 1)))
                    ? 'bg-brand-blue text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tomorrow
              </button>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="ghost" onClick={handlePreviousDay} size="sm" className="p-2 h-9 w-9" title="Previous Day">
                <IconChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="ghost" onClick={handleNextDay} size="sm" className="p-2 h-9 w-9" title="Next Day">
                <IconChevronRight className="w-5 h-5" />
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => setShowDatePickerModal(true)} 
                size="sm" 
                className="text-xs font-bold flex items-center gap-1 bg-slate-100 dark:bg-slate-800"
              >
                <IconCalendar className="w-4 h-4 text-slate-500" />
                Pick Date
              </Button>
            </div>
          </div>
        </div>

        {/* 7-DAY INTERACTIVE HORIZONTAL RIBBON */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 hide-scrollbar">
          {sevenDayStrip.map((item, idx) => {
            const dayName = item.date.toLocaleDateString('en-IN', { weekday: 'short' });
            const dayNum = item.date.getDate();
            const monthName = item.date.toLocaleDateString('en-IN', { month: 'short' });

            return (
              <button
                key={idx}
                onClick={() => setViewDate(item.date)}
                className={`flex-1 min-w-[72px] sm:min-w-[84px] py-2.5 px-2 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer relative ${
                  item.isSelected
                    ? 'bg-brand-blue text-white border-brand-blue shadow-md scale-105 z-10'
                    : item.isToday
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700'
                      : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${item.isSelected ? 'text-amber-300' : 'text-slate-400'}`}>
                  {dayName}
                </span>
                <span className={`text-base font-extrabold ${item.isSelected ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                  {dayNum}
                </span>
                <span className={`text-[10px] ${item.isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                  {monthName}
                </span>

                {/* Job Count Badge */}
                {item.jobCount > 0 && (
                  <span className={`absolute -top-1.5 -right-1.5 text-[10px] font-bold px-1.5 py-0.2 rounded-full border shadow-xs ${
                    item.isSelected
                      ? 'bg-brand-accent text-slate-950 border-white'
                      : 'bg-indigo-600 text-white border-white dark:border-slate-800'
                  }`}>
                    {item.jobCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. SEARCH & MULTI-FILTER BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          
          {/* Location / Keyword Search */}
          <div className="md:col-span-5 relative">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer, phone, car reg, city, street..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch className="w-4 h-4" />
            </div>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div className="md:col-span-5 flex items-center gap-1 overflow-x-auto hide-scrollbar">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-brand-blue text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              All ({filteredAppointmentsForViewDate.length})
            </button>
            <button
              onClick={() => setStatusFilter('ASSIGNED')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'ASSIGNED'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Assigned
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'COMPLETED'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Completed
            </button>
          </div>

          {/* Priority & Layout Toggle */}
          <div className="md:col-span-2 flex items-center justify-end gap-1.5">
            <button
              onClick={() => setPriorityFilter(prev => prev === 'ALL' ? 'URGENT_HIGH' : 'ALL')}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1 ${
                priorityFilter === 'URGENT_HIGH'
                  ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300'
                  : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
              title="Toggle Urgent/High Priority Filter"
            >
              <IconFilter className="w-3.5 h-3.5 text-red-500" />
              {priorityFilter === 'URGENT_HIGH' ? 'Urgent' : 'All Priority'}
            </button>

            <button
              onClick={() => setLayoutView(prev => prev === 'GRID' ? 'COMPACT' : 'GRID')}
              className="p-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              title="Toggle Grid/List View"
            >
              <IconList className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. APPOINTMENTS GRID / LIST */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Assigned Tasks for {viewDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ({filteredAppointmentsForViewDate.length})
          </h3>
          {(searchQuery || statusFilter !== 'ALL' || priorityFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('ALL');
                setPriorityFilter('ALL');
              }}
              className="text-xs text-brand-blue dark:text-brand-accent font-bold hover:underline"
            >
              Clear All Filters
            </button>
          )}
        </div>

        {filteredAppointmentsForViewDate.length > 0 ? (
          layoutView === 'GRID' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAppointmentsForViewDate.map(service => (
                <AppointmentCard 
                  key={service.submissionId}
                  service={service}
                  allSubmissions={props.allSubmissions}
                  currentUser={props.currentUser}
                  deliveryHubs={props.deliveryHubs}
                  auditLogs={props.auditLogs}
                  onStart={() => props.onStartOrder(service.submissionId)}
                  onUpdate={() => props.onUpdateOrder(service)}
                  onCompleteOrder={props.onCompleteOrder}
                  onDelete={props.onDeleteOrder ? () => props.onDeleteOrder!(service) : undefined}
                  onCancel={props.onCancelOrder ? () => props.onCancelOrder!(service) : undefined}
                  onNotify={() => props.onNotifyForOrder(service.submissionId)}
                  onShareOrder={props.onShareOrder}
                />
              ))}
            </div>
          ) : (
            /* COMPACT TRIP LIST VIEW FOR MOBILE SCANNING */
            <div className="space-y-2">
              {filteredAppointmentsForViewDate.map(service => {
                const isOverdue = false; // calculated internally
                const orderNo = service.appointmentId?.split('-').pop() || service.submissionId.slice(-6).toUpperCase();

                return (
                  <div 
                    key={service.submissionId}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-brand-blue bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded">
                          #{orderNo}
                        </span>
                        <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                          {service.customerFirstName} {service.customerLastName}
                        </h4>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          service.status === ServiceStatus.Completed ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                          service.status === ServiceStatus.InProgress ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {service.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1">
                          <IconEngine className="w-3.5 h-3.5 text-slate-400" />
                          {service.carBrandModel} ({service.carNumber})
                        </span>
                        <span className="flex items-center gap-1">
                          <IconClock className="w-3.5 h-3.5 text-slate-400" />
                          {service.scheduledTime || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <IconReceipt className="w-3.5 h-3.5 text-slate-400" />
                          ₹{(service.grandTotal || 0).toFixed(2)}
                        </span>
                      </div>

                      {service.streetAddress && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <IconMapPin className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                          {service.streetAddress}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {service.mobileNumber && (
                        <a href={`tel:${service.mobileNumber}`}>
                          <Button variant="secondary" size="sm" className="text-xs py-1 px-2.5">
                            <IconPhone className="w-3.5 h-3.5 text-emerald-600" />
                          </Button>
                        </a>
                      )}
                      {service.status === ServiceStatus.Assigned && (
                        <Button 
                          variant="primary" 
                          size="sm" 
                          onClick={() => props.onStartOrder(service.submissionId)}
                          className="text-xs py-1 px-3 bg-brand-accent text-slate-950 font-bold"
                        >
                          Start
                        </Button>
                      )}
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        onClick={() => props.onUpdateOrder(service)}
                        className="text-xs py-1 px-3"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <IconCalendar className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              No tasks scheduled for {viewDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} matching your filters.
            </p>
            <Button variant="secondary" onClick={handleGoToToday} size="sm" className="text-xs font-bold">
              Return to Today's Schedule
            </Button>
          </div>
        )}
      </section>

      {/* 6. UPCOMING & OTHER ASSIGNED APPOINTMENTS */}
      <section className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <div className="mb-3">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-200 tracking-tight">
            Upcoming & Other Assigned Orders ({otherAppointments.length})
          </h3>
          <p className="text-xs text-slate-500">Your future assigned tasks and unscheduled orders.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {otherAppointments.length > 0 ? (
            otherAppointments.slice(0, 8).map(service => (
              <AppointmentCard 
                key={service.submissionId}
                service={service}
                allSubmissions={props.allSubmissions}
                currentUser={props.currentUser}
                deliveryHubs={props.deliveryHubs}
                auditLogs={props.auditLogs}
                onStart={() => props.onStartOrder(service.submissionId)}
                onUpdate={() => props.onUpdateOrder(service)}
                onDelete={props.onDeleteOrder ? () => props.onDeleteOrder!(service) : undefined}
                onCancel={props.onCancelOrder ? () => props.onCancelOrder!(service) : undefined}
                onNotify={() => props.onNotifyForOrder(service.submissionId)}
                onShareOrder={props.onShareOrder}
              />
            ))
          ) : (
            <div className="md:col-span-2 lg:col-span-3 xl:col-span-4 text-center py-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">You have no other upcoming appointments assigned.</p>
            </div>
          )}
        </div>
      </section>

      {/* 7. RECENT RIDER SYSTEM ACTIVITY */}
      <section className="pt-6 border-t border-slate-200 dark:border-slate-800">
        <ActivityFeed
          auditLogs={props.auditLogs}
          submissions={props.submissions}
          inventoryMovements={props.inventoryMovements}
          serviceRequests={props.serviceRequests}
          limit={5}
          title="Recent Rider Activity & Updates"
        />
      </section>

      {/* CUSTOM DATE PICKER MODAL */}
      {showDatePickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <IconCalendar className="w-5 h-5 text-brand-blue" />
                Select Schedule Date
              </h3>
              <button onClick={() => setShowDatePickerModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Choose Date</label>
              <input 
                type="date"
                value={customDateInput}
                onChange={(e) => setCustomDateInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" size="sm" onClick={() => setShowDatePickerModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleApplyCustomDate} className="font-bold">
                Jump to Date
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Quick Action Menu */}
      <QuickActionMenu
        onViewAppointments={handleGoToToday}
        onOpenAiAssistant={() => props.setIsChatbotOpen(true)}
      />
    </div>
  );
};

export default React.memo(UserDashboard);

