import React, { useMemo } from 'react';
import { Service, ServiceStatus, StatusTransition, AuditLog } from '../../types';
import { Calendar, ClipboardCheck, UserCheck, Truck, Package, ArrowRight, Clock, User as UserIcon, XCircle, CheckCircle2, AlertTriangle, MapPin, Bell, Activity, FileText } from 'lucide-react';
import { parseDateTime } from '../../utils/dateTimeUtils';

interface OrderTimelineProps {
  service: Service;
  className?: string;
  onViewDetails?: () => void;
  auditLogs?: AuditLog[];
}

type ActivityEventType = 'creation' | 'status' | 'reschedule' | 'cancel' | 'notify' | 'audit' | 'completion' | 'assignment' | 'in_progress' | 'remarks';

const STATUS_STEPS = [
  { status: ServiceStatus.Queued, label: 'Confirmed', icon: ClipboardCheck, desc: 'Order confirmed & placed' },
  { status: ServiceStatus.Assigned, label: 'Assigned', icon: UserCheck, desc: 'Technician assigned' },
  { status: ServiceStatus.InProgress, label: 'In progress', icon: Truck, desc: 'Service in progress' },
  { status: ServiceStatus.Completed, label: 'Delivered', icon: Package, desc: 'Order completed & delivered' }
];

const getRelativeTime = (isoString: string): string => {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

const formatFullTimestamp = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
};

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ service, className = '', onViewDetails, auditLogs }) => {
  const currentStatus = service.status || ServiceStatus.Queued;
  const isCancelled = currentStatus === ServiceStatus.Cancelled;

  // Safely parse statusHistory
  const rawHistory: StatusTransition[] = useMemo(() => {
    if (Array.isArray(service.statusHistory)) {
      return service.statusHistory;
    } else if (typeof service.statusHistory === 'string') {
      try {
        const parsed = JSON.parse(service.statusHistory);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, [service.statusHistory]);

  // Synthesize unified chronological activity timeline events
  const activityEvents = useMemo(() => {
    const events: Array<{
      id: string;
      title: string;
      status?: ServiceStatus | string;
      timestamp: string;
      user: string;
      notes: string;
      location?: string;
      type: ActivityEventType;
    }> = [];

    // 1. Convert statusHistory array to events
    rawHistory.forEach((item, idx) => {
      let title = `Status changed to ${item.status}`;
      let type: ActivityEventType = 'status';

      const notesLower = (item.notes || '').toLowerCase();
      if (item.status === ServiceStatus.Cancelled || notesLower.includes('cancel')) {
        title = 'Order Cancelled';
        type = 'cancel';
      } else if (notesLower.includes('reschedul')) {
        title = 'Order Rescheduled';
        type = 'reschedule';
      } else if (notesLower.includes('notif') || notesLower.includes('message') || notesLower.includes('sms')) {
        title = 'Customer Notified';
        type = 'notify';
      } else if (notesLower.includes('remark') || notesLower.includes('internal note') || notesLower.includes('notes updated')) {
        title = 'Internal Note Updated';
        type = 'remarks';
      } else if (notesLower.includes('created') || notesLower.includes('placed') || item.status === ServiceStatus.Queued) {
        title = 'Order Confirmed & Placed';
        type = 'creation';
      } else if (item.status === ServiceStatus.Assigned || notesLower.includes('assign')) {
        title = 'Technician Assigned';
        type = 'assignment';
      } else if (item.status === ServiceStatus.InProgress || notesLower.includes('start')) {
        title = 'Service In Progress';
        type = 'in_progress';
      } else if (item.status === ServiceStatus.Completed || notesLower.includes('complet')) {
        title = 'Order Completed & Finalized';
        type = 'completion';
      }

      events.push({
        id: `hist-${idx}-${item.timestamp}`,
        title,
        status: item.status,
        timestamp: item.timestamp || service.timestamp || new Date().toISOString(),
        user: item.updatedBy || service.submittedBy || 'system',
        notes: item.notes || `Status transitioned to ${item.status}`,
        type
      });
    });

    // 2. Ensure Order Creation event exists
    const hasCreation = events.some(e => e.type === 'creation' || e.notes.toLowerCase().includes('created'));
    if (!hasCreation && service.timestamp) {
      events.push({
        id: `created-${service.submissionId}`,
        title: 'Order Confirmed & Placed',
        status: ServiceStatus.Queued,
        timestamp: service.timestamp,
        user: service.submittedBy || 'Customer / System',
        notes: `Order #${service.appointmentId || service.submissionId.slice(-6)} created for vehicle ${service.carBrandModel || 'Vehicle'} (${service.carNumber || 'N/A'})`,
        type: 'creation'
      });
    }

    // 3. Ensure Cancellation event exists if cancelled
    const hasCancel = events.some(e => e.type === 'cancel');
    if (isCancelled && !hasCancel) {
      events.push({
        id: `cancel-${service.submissionId}`,
        title: 'Order Cancelled',
        status: ServiceStatus.Cancelled,
        timestamp: service.cancellationTimestamp || service.timestamp || new Date().toISOString(),
        user: service.cancellationLoggedBy || service.submittedBy || 'System',
        notes: `Reason: ${service.cancellationReason || 'Order cancelled'}${service.cancellationLocation ? ` | Location: ${service.cancellationLocation}` : ''}`,
        location: service.cancellationLocation,
        type: 'cancel'
      });
    }

    // 4. Ensure Assignment event exists if assigned
    const hasAssign = events.some(e => e.status === ServiceStatus.Assigned || e.type === 'assignment' || e.notes.toLowerCase().includes('assign'));
    if (service.assignedTo && !hasAssign) {
      events.push({
        id: `assign-${service.submissionId}`,
        title: 'Technician Assigned',
        status: ServiceStatus.Assigned,
        timestamp: service.timestamp,
        user: service.submittedBy || 'System',
        notes: `Assigned primary technician: ${service.assignedTo}${service.secondaryAssignee ? `, secondary: ${service.secondaryAssignee}` : ''}`,
        type: 'assignment'
      });
    }

    // 5. Merge explicit matching AuditLogs if provided
    if (auditLogs && Array.isArray(auditLogs)) {
      const matchedLogs = auditLogs.filter(
        a => a.serviceId === service.submissionId || a.leadId === service.submissionId
      );
      matchedLogs.forEach((log) => {
        // Skip duplicate if already represented by timestamp and user
        const isDup = events.some(
          e => Math.abs(new Date(e.timestamp).getTime() - new Date(log.timestamp).getTime()) < 2000 && e.user === log.changedBy
        );
        if (!isDup) {
          let auditType: ActivityEventType = 'audit';
          const changeType = (log.changeType || '').toUpperCase();
          const notesLower = (log.notes || log.reason || '').toLowerCase();

          if (changeType === 'REMARKS' || notesLower.includes('internal note') || notesLower.includes('remark')) {
            auditType = 'remarks';
          } else if (changeType === 'RESCHEDULE' || notesLower.includes('reschedul')) {
            auditType = 'reschedule';
          } else if (changeType === 'CANCEL' || notesLower.includes('cancel')) {
            auditType = 'cancel';
          } else if (log.newValue === ServiceStatus.Completed || notesLower.includes('complet')) {
            auditType = 'completion';
          } else if (log.newValue === ServiceStatus.InProgress || notesLower.includes('start')) {
            auditType = 'in_progress';
          } else if (log.newValue === ServiceStatus.Assigned || notesLower.includes('assign')) {
            auditType = 'assignment';
          } else if (notesLower.includes('notif')) {
            auditType = 'notify';
          }

          events.push({
            id: `audit-${log.id}`,
            title: log.changeType === 'REMARKS' ? 'Internal Notes Updated' : `Audit: ${log.changeType || 'Update'}`,
            status: (log.newValue as ServiceStatus) || service.status,
            timestamp: log.timestamp,
            user: log.changedBy || 'system',
            notes: log.notes || log.reason || `Changed from ${log.oldValue || 'N/A'} to ${log.newValue || 'N/A'}`,
            location: log.locationStamp,
            type: auditType
          });
        }
      });
    }

    // 6. Deduplicate by unique timestamp + title + user
    const uniqueMap = new Map<string, typeof events[0]>();
    events.forEach(evt => {
      const key = `${evt.timestamp.slice(0, 16)}-${evt.title}-${evt.user}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, evt);
      }
    });

    // 7. Sort in descending order (newest first)
    return Array.from(uniqueMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [rawHistory, service, isCancelled, auditLogs]);

  const statusOrder = [
    ServiceStatus.Queued,
    ServiceStatus.Assigned,
    ServiceStatus.InProgress,
    ServiceStatus.Completed
  ];

  let currentIndex = statusOrder.indexOf(currentStatus as ServiceStatus);
  if (currentIndex === -1) {
    const sLower = String(currentStatus).toLowerCase();
    if (sLower.includes('complete') || sLower.includes('deliver')) currentIndex = 3;
    else if (sLower.includes('progress') || sLower.includes('ship')) currentIndex = 2;
    else if (sLower.includes('assign')) currentIndex = 1;
    else currentIndex = 0;
  }

  const getStepState = (stepIndex: number) => {
    if (isCancelled) return 'cancelled';
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const primaryServiceTitle = (service.serviceSelection && service.serviceSelection.length > 0)
    ? service.serviceSelection.join(' + ')
    : 'Doorstep Auto Service';

  const formattedDateTime = (() => {
    try {
      const dateObj = parseDateTime(service) || (service.timestamp ? new Date(service.timestamp) : new Date());
      if (!dateObj || isNaN(dateObj.getTime())) return service.scheduledDate || 'Scheduled Service';
      return dateObj.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return service.scheduledDate || 'Scheduled Service';
    }
  })();

  const getEventStyle = (type: ActivityEventType, statusStr?: string) => {
    let resolvedType: ActivityEventType = type;
    if (resolvedType === 'status' && statusStr) {
      if (statusStr === ServiceStatus.Completed) resolvedType = 'completion';
      else if (statusStr === ServiceStatus.InProgress) resolvedType = 'in_progress';
      else if (statusStr === ServiceStatus.Assigned) resolvedType = 'assignment';
      else if (statusStr === ServiceStatus.Queued) resolvedType = 'creation';
      else if (statusStr === ServiceStatus.Cancelled) resolvedType = 'cancel';
    }

    switch (resolvedType) {
      case 'completion':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
          nodeBg: 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-100 dark:ring-emerald-900/40',
          badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        };
      case 'reschedule':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />,
          nodeBg: 'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-700 ring-2 ring-amber-100 dark:ring-amber-900/40',
          badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        };
      case 'cancel':
        return {
          icon: <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />,
          nodeBg: 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-700 ring-2 ring-rose-100 dark:ring-rose-900/40',
          badgeStyle: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        };
      case 'assignment':
        return {
          icon: <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />,
          nodeBg: 'bg-blue-50 dark:bg-blue-950/90 border-blue-300 dark:border-blue-700 ring-2 ring-blue-100 dark:ring-blue-900/40',
          badgeStyle: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
        };
      case 'in_progress':
        return {
          icon: <Truck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />,
          nodeBg: 'bg-purple-50 dark:bg-purple-950/90 border-purple-300 dark:border-purple-700 ring-2 ring-purple-100 dark:ring-purple-900/40',
          badgeStyle: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
        };
      case 'creation':
        return {
          icon: <ClipboardCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />,
          nodeBg: 'bg-indigo-50 dark:bg-indigo-950/90 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-100 dark:ring-indigo-900/40',
          badgeStyle: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
        };
      case 'notify':
        return {
          icon: <Bell className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />,
          nodeBg: 'bg-sky-50 dark:bg-sky-950/90 border-sky-300 dark:border-sky-700 ring-2 ring-sky-100 dark:ring-sky-900/40',
          badgeStyle: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
        };
      case 'remarks':
        return {
          icon: <FileText className="w-3.5 h-3.5 text-yellow-700 dark:text-yellow-400 shrink-0" />,
          nodeBg: 'bg-yellow-50 dark:bg-yellow-950/90 border-yellow-300 dark:border-yellow-700 ring-2 ring-yellow-100 dark:ring-yellow-900/40',
          badgeStyle: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-800',
        };
      case 'audit':
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />,
          nodeBg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 ring-2 ring-slate-100 dark:ring-slate-800',
          badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        };
    }
  };

  const getBadgeStyle = (statusStr?: string, type?: string) => {
    if (type === 'cancel' || statusStr === ServiceStatus.Cancelled) {
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900';
    }
    if (type === 'reschedule') {
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900';
    }
    if (type === 'notify') {
      return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-900';
    }
    switch (statusStr) {
      case ServiceStatus.Completed:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900';
      case ServiceStatus.InProgress:
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900';
      case ServiceStatus.Assigned:
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900';
      case ServiceStatus.Queued:
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  const getEventIcon = (type: string, statusStr?: string) => {
    if (type === 'cancel' || statusStr === ServiceStatus.Cancelled) {
      return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    }
    if (type === 'reschedule') {
      return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    }
    if (type === 'notify') {
      return <Bell className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    }
    switch (statusStr) {
      case ServiceStatus.Completed:
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case ServiceStatus.InProgress:
        return <Truck className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
      case ServiceStatus.Assigned:
        return <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case ServiceStatus.Queued:
      default:
        return <ClipboardCheck className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-sm p-5 text-slate-800 dark:text-slate-200 font-sans space-y-6 ${className}`}>
      {/* Top Product Header */}
      <div className="flex items-start gap-3.5 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="w-12 h-12 rounded-xl bg-blue-950 text-amber-400 shrink-0 border border-blue-900 shadow-xs flex flex-col items-center justify-center p-1 text-center font-bold">
          <Activity className="w-5 h-5 text-amber-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 tracking-tight truncate">
              {primaryServiceTitle}
            </h3>
            {isCancelled && (
              <span className="px-2 py-0.5 text-[10px] font-black tracking-wider uppercase rounded bg-rose-100 text-rose-800 border border-rose-200">
                CANCELLED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
            Vehicle: <strong className="text-slate-700 dark:text-slate-300">{service.carBrandModel || 'N/A'} ({service.carNumber || 'N/A'})</strong>
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-semibold mt-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>Scheduled: {formattedDateTime}</span>
          </div>
        </div>
      </div>

      {/* Order Status Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Order Status Step
          </h4>
          <span className="text-xs font-bold text-slate-500">
            Current: <strong className={isCancelled ? 'text-rose-600' : 'text-blue-900 dark:text-blue-400'}>{service.status}</strong>
          </span>
        </div>

        {/* 4 Step Timeline Progress */}
        {isCancelled ? (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-rose-900 dark:text-rose-200 block">Order was Cancelled</span>
              <span className="text-rose-700 dark:text-rose-300">
                Reason: {service.cancellationReason || 'Order cancelled'}
              </span>
            </div>
          </div>
        ) : (
          <div className="relative flex justify-between items-center max-w-lg mx-auto px-2">
            {/* Background Connector Line */}
            <div className="absolute top-1/2 left-6 right-6 h-0.5 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 z-0" />

            {/* Active Progress Connector Line */}
            <div
              className="absolute top-1/2 left-6 h-0.5 bg-blue-900 dark:bg-blue-500 -translate-y-1/2 z-0 transition-all duration-500"
              style={{
                width: `calc(${currentIndex >= 0 ? (currentIndex / (STATUS_STEPS.length - 1)) * 100 : 0}% - 1rem)`
              }}
            />

            {STATUS_STEPS.map((step, idx) => {
              const stepState = getStepState(idx);
              const StepIcon = step.icon;
              const isDoneOrActive = stepState === 'completed' || stepState === 'active';

              return (
                <div key={step.label} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isDoneOrActive
                        ? 'bg-blue-950 dark:bg-blue-600 text-white shadow-md'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                    title={`${step.label} - ${step.desc}`}
                  >
                    <StepIcon className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={`text-[11px] mt-1.5 font-bold transition-colors ${
                      isDoneOrActive ? 'text-blue-950 dark:text-blue-300' : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chronological Detailed Activity & Status Audit History */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Order Activity & Change Timeline</span>
          </div>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            {activityEvents.length} Event{activityEvents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {activityEvents.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">No order history recorded yet.</p>
        ) : (
          <div className="relative pl-4 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {activityEvents.map((evt) => {
              const relTime = getRelativeTime(evt.timestamp);
              const fullTimeStr = formatFullTimestamp(evt.timestamp);
              const style = getEventStyle(evt.type, evt.status as string);

              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline Dot Icon */}
                  <div className={`absolute -left-[23px] top-0.5 w-6 h-6 rounded-full border shadow-xs flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${style.nodeBg}`}>
                    {style.icon}
                  </div>

                  {/* Event Card Content */}
                  <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                          {evt.title}
                        </span>
                        {evt.status && (
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${style.badgeStyle}`}>
                            {evt.status}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <span>{fullTimeStr}</span>
                        {relTime && <span className="text-[10px] bg-slate-200/60 dark:bg-slate-700/60 px-1.5 py-0.2 rounded font-bold">{relTime}</span>}
                      </div>
                    </div>

                    {/* Username tag */}
                    <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      <span>Updated by: <strong className="text-slate-900 dark:text-slate-100">{evt.user}</strong></span>
                    </div>

                    {/* Notes / Details */}
                    {evt.notes && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800 leading-relaxed whitespace-pre-line">
                        {evt.notes}
                      </p>
                    )}

                    {/* Location Stamp */}
                    {evt.location && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 pt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span>Location: {evt.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer View Details Link */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        {onViewDetails ? (
          <button
            onClick={onViewDetails}
            className="text-xs font-black text-blue-950 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1.5 transition-colors group cursor-pointer"
          >
            <span>View Full Order Details</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <span className="text-[11px] font-bold text-slate-500">Order Audit History Log</span>
        )}

        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-900/60">
          Sync: Realtime Active
        </span>
      </div>
    </div>
  );
};
