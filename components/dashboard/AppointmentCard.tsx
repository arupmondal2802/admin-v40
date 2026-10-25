
import React, { useMemo, useState, useEffect } from 'react';
import { Service, ServiceStatus, User, DeliveryHub, AuditLog } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { 
  IconBellRinging, 
  IconClipboardList, 
  IconClock, 
  IconUser, 
  IconEngine, 
  IconPhone, 
  IconLink, 
  IconCheck, 
  IconShare, 
  IconReceipt, 
  IconMapPin,
  IconCalendar,
  IconEye,
  IconPencil,
  IconTrash,
  IconPlay,
  IconNavigation,
  IconAlertTriangle,
  IconLock
} from '../ui/Icon';
import { getUncompletedDependencies } from '../../services/dependencyService';
import { formatScheduledDate, toISTDateString, getLocalTodayStr } from '../../utils/dateTimeUtils';
import { downloadOrderInvoicePDF } from '../../utils/pdfGenerator';
import { FileText } from 'lucide-react';
import { OrderTrackingMap } from './OrderTrackingMap';
import { OrderTimeline } from './OrderTimeline';
import { OrderActionMenu } from './OrderActionMenu';
import { NotifyCustomerModal } from './NotifyCustomerModal';
import { StatusPill } from '../ui/StatusPill';
import { OrderTagBadge } from '../ui/OrderTagsManager';
import { saveRecord } from '../../services/cloudDataService';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { getGeographicalLocationStamp } from '../../utils/locationUtils';
import { isAccountsUser } from '../../services/authService';
import CompletePaymentModal from './CompletePaymentModal';
import { toast } from 'sonner';

interface AppointmentCardProps {
  service: Service;
  currentUser: User;
  allSubmissions: Service[];
  deliveryHubs?: DeliveryHub[];
  auditLogs?: AuditLog[];
  onAssign?: () => void;
  onStart?: () => void;
  onUpdate?: () => void;
  onCompleteOrder?: (service: Service) => void;
  onClaim?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  onNotify?: () => void;
  onShareOrder?: (service: Service) => void;
  onRebook?: (service: Service) => void;
  onReschedule?: (service: Service, newDate?: string, newTime?: string) => void;
  onViewDetails?: (service: Service) => void;
  isOverdue?: boolean;
  isToday?: boolean;
}

const AppointmentCardComponent: React.FC<AppointmentCardProps> = ({ 
  service: initialService, 
  currentUser, 
  allSubmissions, 
  deliveryHubs, 
  auditLogs,
  onAssign, 
  onStart, 
  onUpdate, 
  onCompleteOrder,
  onClaim, 
  onDelete, 
  onCancel,
  onNotify, 
  onShareOrder, 
  onRebook, 
  onReschedule,
  onViewDetails,
  isOverdue, 
  isToday 
}) => {
  const [service, setService] = useState<Service>(initialService);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  
  // Reschedule & View Details & Notify Modal States
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<string>(
    service.scheduledDate ? toISTDateString(service.scheduledDate) : getLocalTodayStr()
  );
  const [rescheduleTime, setRescheduleTime] = useState<string>(service.scheduledTime || '10:00 AM');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');
  const [rescheduleLocation, setRescheduleLocation] = useState<string>('Acquiring GPS...');
  const [rescheduleError, setRescheduleError] = useState<string>('');
  const [isLocatingReschedule, setIsLocatingReschedule] = useState<boolean>(false);
  const [isSavingReschedule, setIsSavingReschedule] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const isAccounts = useMemo(() => isAccountsUser(currentUser), [currentUser]);

  // Determine Missing Information (Before / After Photos, Serials) for selected services
  const missingInfo = useMemo(() => {
    const list: string[] = [];
    const selection = Array.isArray(service.serviceSelection) ? service.serviceSelection : [];
    
    // Check if services include cleaning, washing, polishing, detailing, tyre, or battery
    const requiresVisualPhotos = selection.some(s => {
      const lower = s.toLowerCase();
      return lower.includes('wash') || lower.includes('care') || lower.includes('polish') ||
        lower.includes('coating') || lower.includes('detail') || lower.includes('clean') ||
        lower.includes('ceramic') || lower.includes('rubbing') || lower.includes('interior');
    }) || selection.length > 0;
    
    if (requiresVisualPhotos) {
      const hasBefore = Boolean(service.beforeWashingPhoto && service.beforeWashingPhoto.trim());
      const hasAfter = Boolean(service.afterWashingPhoto && service.afterWashingPhoto.trim());

      if (!hasBefore) {
        list.push('Before Inspection Photo');
      }
      if (!hasAfter) {
        list.push('After Completion Photo');
      }
    }

    if (selection.includes('Tyre Replacement') && (service.tyreReplacementQuantity || 0) > 0) {
      const hasTyreSerial = (service.tyreDetails || []).some(t => Boolean(t.dotSerialNumberImage && t.dotSerialNumberImage.trim()));
      if (!hasTyreSerial) {
        list.push('Tyre DOT Serial Photo');
      }
    }

    if (selection.includes('Battery Replacement') && (service.batteryReplacementQuantity || 0) > 0) {
      const hasBatterySerial = (service.batteryDetails || []).some(b => Boolean(b.batteryPhoto && b.batteryPhoto.trim()));
      if (!hasBatterySerial) {
        list.push('Battery Serial Photo');
      }
    }

    return list;
  }, [service]);

  // Payment status
  const isPaymentCompleted = service.paymentStatus === 'Completed';
  const isPaymentPending = service.status === ServiceStatus.Completed && service.paymentStatus !== 'Completed';

  const handleSavePayment = async (updatedService: Service) => {
    setService(updatedService);
    if (onCompleteOrder) {
      onCompleteOrder(updatedService);
    } else if (onUpdate) {
      onUpdate();
    }
  };

  // Internal Notes State & Handler
  const [internalNotesState, setInternalNotesState] = useState<string>(service.internalNotes || '');
  const [isEditingInternalNotes, setIsEditingInternalNotes] = useState<boolean>(false);
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);

  useEffect(() => {
    setInternalNotesState(service.internalNotes || '');
  }, [service.internalNotes]);

  const handleSaveInternalNotes = async () => {
    setIsSavingNotes(true);
    try {
      const updatedService: Service = {
        ...service,
        internalNotes: internalNotesState.trim()
      };

      const loggerUser = currentUser?.username || 'system';
      const nowIso = new Date().toISOString();
      
      const auditLog = {
        id: `audit-notes-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        leadId: service.submissionId,
        serviceId: service.submissionId,
        timestamp: nowIso,
        changedBy: loggerUser,
        changeType: 'REMARKS',
        oldValue: service.internalNotes || '',
        newValue: internalNotesState.trim(),
        notes: `Internal notes updated for order #${orderNo} by ${loggerUser}`,
      };

      try {
        await saveRecord('AuditLogs', auditLog, '');
      } catch (e) {
        console.warn('Could not save audit log for internal notes update:', e);
      }

      await saveRecord('Submissions', updatedService, '');
      setService(updatedService);
      toast.success('Internal notes saved and persisted successfully!');
      setIsEditingInternalNotes(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Failed to save internal notes:', err);
      toast.error('Failed to save internal notes. Please try again.');
    } finally {
      setIsSavingNotes(false);
    }
  };

  useEffect(() => {
    if (showRescheduleModal) {
      setRescheduleReason('');
      setRescheduleError('');
      setIsLocatingReschedule(true);
      getGeographicalLocationStamp(currentUser)
        .then((loc) => setRescheduleLocation(loc))
        .finally(() => setIsLocatingReschedule(false));
    }
  }, [showRescheduleModal, currentUser]);

  useEffect(() => {
    setService(initialService);
    if (initialService.scheduledDate) {
      setRescheduleDate(toISTDateString(initialService.scheduledDate));
    }
    if (initialService.scheduledTime) {
      setRescheduleTime(initialService.scheduledTime);
    }
  }, [initialService]);

  useEffect(() => {
    if (service.status === ServiceStatus.Completed) {
      setShowCompletionAnimation(true);
      const timer = setTimeout(() => setShowCompletionAnimation(false), 1500); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [service.status]);

  const uncompletedDependencies = useMemo(() => getUncompletedDependencies(service, allSubmissions), [service, allSubmissions]);
  const canStart = onStart && uncompletedDependencies.length === 0;

  // Distance from hub to customer address
  const hubDistanceInfo = useMemo(() => {
    if (typeof service.customerLatitude === 'number' && typeof service.customerLongitude === 'number' && service.customerLatitude !== 0 && service.customerLongitude !== 0) {
      const serviceType = service.serviceSelection?.[0] || 'washing';
      const hubs = deliveryHubs && deliveryHubs.length > 0 ? deliveryHubs : DEFAULT_DELIVERY_HUBS;
      const result = findNearestHub(serviceType, service.customerLatitude, service.customerLongitude, hubs);
      return {
        hubName: result.hub.name,
        distanceKm: result.distanceKm
      };
    }
    if (typeof service.customerDistanceKm === 'number' && service.customerDistanceKm > 0) {
      return {
        hubName: 'Nearest Hub',
        distanceKm: service.customerDistanceKm
      };
    }
    return null;
  }, [service.customerLatitude, service.customerLongitude, service.customerDistanceKm, service.serviceSelection, deliveryHubs]);

  const statusConfig = {
    [ServiceStatus.Completed]: { bg: 'bg-green-100 dark:bg-green-950/60', text: 'text-green-800 dark:text-green-300', border: 'border-green-400' },
    [ServiceStatus.InProgress]: { bg: 'bg-purple-100 dark:bg-purple-950/60', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-400' },
    [ServiceStatus.Assigned]: { bg: 'bg-blue-100 dark:bg-blue-950/60', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-400' },
    [ServiceStatus.Queued]: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-800 dark:text-slate-200', border: 'border-slate-400' },
    [ServiceStatus.Draft]: { bg: 'bg-yellow-100 dark:bg-yellow-950/60', text: 'text-yellow-800 dark:text-yellow-300', border: 'border-yellow-400' },
  };
  
  const isCompleted = service.status === ServiceStatus.Completed;
  const currentStatusConfig = statusConfig[service.status] || statusConfig.Draft;
  const isAdminOrManager = currentUser.role === 'admin' || currentUser.role === 'manager';
  const isDraggable = isAdminOrManager && service.status === ServiceStatus.Queued;
  const canNotify = isAdminOrManager && onNotify && service.status !== ServiceStatus.Completed && service.status !== ServiceStatus.Draft;
  const canViewNotes = true;
  
  const cardBorderColor = isOverdue 
    ? 'border-red-400' 
    : isToday 
      ? 'border-brand-accent' 
      : isCompleted 
        ? (isPaymentCompleted ? 'border-emerald-500' : 'border-amber-500')
        : currentStatusConfig.border;
  
  const canShare = onShareOrder && service.status !== ServiceStatus.Draft;
  const canCall = service.mobileNumber && service.status !== ServiceStatus.Draft;
  const hasActions = onAssign || onStart || onUpdate || onClaim || onDelete;

  // Check if location is pinned
  const hasLocation = !!(service.customerLatitude && service.customerLongitude);

  const orderNo = service.appointmentId?.split('-').pop() || service.submissionId.slice(-6).toUpperCase();

  const serviceSummary = useMemo(() => {
    const rawList = Array.isArray(service.serviceSelection) 
      ? service.serviceSelection 
      : (typeof service.serviceSelection === 'string' ? (service.serviceSelection as string).split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    const services = rawList.map((s: string) => {
        if (s === 'Car Washing' && service.carWashDetails?.washType) {
            return service.carWashDetails.washType;
        }
         if (s === 'Car Care' && service.carCareDetails?.careType) {
            return service.carCareDetails.careType;
        }
        return s;
    });
    return services.join(', ') || 'N/A';
  }, [service.serviceSelection, service.carWashDetails, service.carCareDetails]);

  // Determine primary order action for the smart menu
  const primaryOrderAction = useMemo(() => {
    const isAssignedToCurrentUser = service.assignedTo === currentUser.username;

    switch (service.status) {
      case ServiceStatus.Queued:
        if (isAdminOrManager && onAssign) {
          return { label: 'Assign Order', action: onAssign };
        }
        if (onClaim) {
          return { label: 'Claim Order', action: onClaim };
        }
        return undefined;

      case ServiceStatus.Assigned:
        if ((isAssignedToCurrentUser || isAdminOrManager) && onStart) {
          return { 
            label: 'Start Order', 
            action: () => {
              if (!canStart) {
                toast.error(`Order is blocked by prerequisite task(s): ${uncompletedDependencies.map(s => `#${s.appointmentId?.split('-').pop()}`).join(', ')}`);
                return;
              }
              onStart();
            } 
          };
        }
        return undefined;

      case ServiceStatus.InProgress:
        if (onCompleteOrder) {
          return {
            label: 'Complete Order',
            action: () => onCompleteOrder({ ...service, status: ServiceStatus.Completed, paymentStatus: 'Pending' })
          };
        }
        if (onUpdate) {
          return { label: 'Update Order Details', action: onUpdate };
        }
        return undefined;

      default:
        if (onUpdate) {
          return { label: 'Edit Order', action: onUpdate };
        }
        return undefined;
    }
  }, [service.status, service.assignedTo, service, currentUser.username, isAdminOrManager, onAssign, onClaim, onStart, canStart, uncompletedDependencies, onUpdate, onCompleteOrder]);

  // Reschedule Preset Handler
  const handlePresetReschedule = (preset: 'today' | 'tomorrow' | 'in2days' | 'nextweek') => {
    const d = new Date();
    if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
    if (preset === 'in2days') d.setDate(d.getDate() + 2);
    if (preset === 'nextweek') d.setDate(d.getDate() + 7);

    const dateStr = d.toISOString().split('T')[0];
    setRescheduleDate(dateStr);
  };

  // Confirm Reschedule Handler
  const handleConfirmReschedule = async () => {
    if (!rescheduleDate) {
      toast.error('Please select a valid scheduled date');
      return;
    }
    if (!rescheduleReason.trim()) {
      setRescheduleError('A reason for reschedule is required for audit logs.');
      return;
    }

    setIsSavingReschedule(true);
    try {
      const nowIso = new Date().toISOString();
      const loggerUser = currentUser.username || 'system';
      const finalLoc = rescheduleLocation || await getGeographicalLocationStamp(currentUser);

      const newHistoryLog = {
        status: service.status,
        timestamp: nowIso,
        notes: `Rescheduled to ${rescheduleDate} at ${rescheduleTime || '10:00 AM'}. Reason: ${rescheduleReason.trim()}. Location: ${finalLoc}`,
        updatedBy: loggerUser,
      };
      const existingHistory = Array.isArray(service.statusHistory) ? service.statusHistory : [];

      const updatedService: Service = {
        ...service,
        scheduledDate: rescheduleDate,
        scheduledTime: rescheduleTime || '10:00 AM',
        rescheduleReason: rescheduleReason.trim(),
        rescheduleLoggedBy: loggerUser,
        rescheduleTimestamp: nowIso,
        rescheduleLocation: finalLoc,
        statusHistory: [...existingHistory, newHistoryLog],
        timestamp: nowIso,
      };

      setService(updatedService);

      // Save Audit Log
      const auditLog = {
        id: `audit-res-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        leadId: service.submissionId,
        serviceId: service.submissionId,
        timestamp: nowIso,
        changedBy: loggerUser,
        changeType: 'RESCHEDULE',
        oldValue: `${service.scheduledDate || 'Unscheduled'} ${service.scheduledTime || ''}`,
        newValue: `${rescheduleDate} ${rescheduleTime || '10:00 AM'}`,
        notes: `Rescheduled order #${orderNo}. Reason: ${rescheduleReason.trim()}. Location: ${finalLoc}`,
        locationStamp: finalLoc,
        reason: rescheduleReason.trim()
      };

      try {
        await saveRecord('AuditLogs', auditLog, '');
      } catch (err) {
        console.warn('Could not save audit log directly:', err);
      }

      // Save updated service to storage
      await saveRecord('Submissions', updatedService, '');

      if (onReschedule) {
        onReschedule(updatedService, rescheduleDate, rescheduleTime);
      } else if (onUpdate) {
        onUpdate();
      }

      toast.success(`Order #${orderNo} rescheduled to ${rescheduleDate} at ${rescheduleTime}`);
      setShowRescheduleModal(false);
    } catch (err: any) {
      toast.error('Failed to reschedule order');
    } finally {
      setIsSavingReschedule(false);
    }
  };

  // Delete Confirm Handler
  const handleDeleteConfirm = () => {
    if (window.confirm(`Are you sure you want to delete Order #${orderNo}? This action cannot be undone.`)) {
      if (onDelete) onDelete();
    }
  };

  // View Details Trigger
  const handleTriggerViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(service);
    }
    setShowDetailsModal(true);
  };

  const renderAdminButtons = () => {
    return (
      <>
           {service.status === ServiceStatus.Assigned && onStart && (
             <Button onClick={onStart} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
               Start Order
             </Button>
           )}
           {service.status === ServiceStatus.InProgress && onCompleteOrder && (
             <Button onClick={() => onCompleteOrder({ ...service, status: ServiceStatus.Completed, paymentStatus: 'Pending' })} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
               Complete Order
             </Button>
           )}
           {onUpdate && service.status !== ServiceStatus.Queued && <Button variant="secondary" size="sm" onClick={onUpdate}>Edit</Button>}
           {service.status === ServiceStatus.Queued && onAssign && <Button onClick={onAssign} size="sm">Assign</Button>}
      </>
    );
  }

  const renderUserButtons = () => {
    const isAssignedToCurrentUser = service.assignedTo === currentUser.username;
    
    switch (service.status) {
      case ServiceStatus.Queued:
        return onClaim && <Button onClick={onClaim} size="sm">Claim Order</Button>;
      
      case ServiceStatus.Assigned:
        if (isAssignedToCurrentUser) {
          return (
            onStart && (
                <Button 
                  onClick={onStart} 
                  size="sm" 
                  disabled={!canStart}
                  title={!canStart ? `Blocked by prerequisite task(s): ${uncompletedDependencies.map(s => `#${s.appointmentId?.split('-').pop()}`).join(', ')}` : 'Start Order'}
                >
                  Start Order
                </Button>
            )
          );
        }
        return null;

      case ServiceStatus.InProgress:
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {onCompleteOrder && (
              <Button onClick={() => onCompleteOrder({ ...service, status: ServiceStatus.Completed, paymentStatus: 'Pending' })} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                Complete Order
              </Button>
            )}
            {onUpdate && <Button onClick={onUpdate} size="sm" variant="secondary">Update Details</Button>}
          </div>
        );

      case ServiceStatus.Completed:
           return <Button variant="ghost" disabled size="sm">Completed</Button>;
      default:
        return onUpdate && <Button variant="secondary" size="sm" onClick={onUpdate}>Edit</Button>;
    }
  }


  const mapUrl = hasLocation
    ? `https://www.google.com/maps/search/?api=1&query=${service.customerLatitude},${service.customerLongitude}`
    : service.streetAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.streetAddress)}`
    : undefined;

  return (
    <div 
      className={`relative ${
        isPaymentCompleted
          ? 'bg-emerald-50/25 dark:bg-emerald-950/20 ring-1 ring-emerald-300/80 dark:ring-emerald-800/80 border-emerald-300 dark:border-emerald-700'
          : isCompleted
            ? 'bg-amber-50/30 dark:bg-amber-950/20 ring-1 ring-amber-300/80 dark:ring-amber-800/80 border-amber-300 dark:border-amber-700'
            : service.priority === 'Urgent'
              ? 'bg-red-50/60 dark:bg-red-950/20 ring-2 ring-red-500 hover:shadow-md border-slate-200/80 dark:border-slate-800'
              : service.priority === 'High'
                ? 'bg-amber-50/50 dark:bg-amber-950/20 ring-1 ring-amber-500 hover:shadow-md border-slate-200/80 dark:border-slate-800'
                : 'bg-white dark:bg-slate-900 hover:shadow-md border-slate-200/80 dark:border-slate-800'
      } rounded-xl shadow-sm border-l-4 ${cardBorderColor} flex flex-col ${isDraggable ? 'cursor-grab' : ''} transition-all duration-300 border`}
      style={{ transition: 'background-color 500ms ease-in-out' }}
      draggable={isDraggable}
      onDragStart={isDraggable ? (e) => e.dataTransfer.setData('text/plain', service.submissionId) : undefined}
    >
      <div className="p-4 flex-grow">
         
         {/* HEADER BAR: CUSTOMER NAME, STATUS, & SMART THREE DOT MENU */}
         <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{service.customerFirstName} {service.customerLastName}</h3>
              {service.appointmentId && <span className="text-xs font-mono font-bold text-brand-blue bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-md">#{orderNo}</span>}
              {(service.isWebsiteOrder || service.websiteOrderId || service.submissionId?.startsWith('ABE-')) && (
                <span 
                  title={`Booked on Website • Method: ${service.paymentMethod || 'Cash on Delivery'}${service.websiteOrderItems?.length ? ` • ${service.websiteOrderItems.length} item(s)` : ''}`}
                  className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1 shadow-2xs"
                >
                  🌐 Website
                </span>
              )}
              {isOverdue && <span className="text-xs font-semibold text-red-800 bg-red-100 dark:bg-red-950 dark:text-red-300 px-2 py-0.5 rounded-full">Overdue</span>}
              {isToday && !isOverdue && <span className="text-xs font-semibold text-amber-800 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">Today</span>}
              {service.isAutoScheduled && (
                  <span title="This was automatically scheduled" className="text-xs font-semibold text-purple-800 bg-purple-100 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded-full">Auto</span>
              )}

              {/* MISSING INFO BADGE IN HEADER */}
              {missingInfo.length > 0 && (service.status === ServiceStatus.InProgress || service.status === ServiceStatus.Completed) && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700 flex items-center gap-1">
                  📷 Missing Photos ({missingInfo.length})
                </span>
              )}

              {service.priority && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  service.priority === 'Urgent' ? 'bg-red-600 text-white animate-pulse border border-red-700 shadow-xs' :
                  service.priority === 'High' ? 'bg-amber-500 text-white shadow-xs' :
                  service.priority === 'Low' ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                  'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  {service.priority}
                </span>
              )}

              {/* Order Tags / Custom Labels (VIP, Urgent, Return-Visit, etc.) */}
              {Array.isArray(service.tags) && service.tags.length > 0 && (
                service.tags.map(tag => (
                  <OrderTagBadge key={tag} tag={tag} size="xs" />
                ))
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap sm:flex-nowrap">
              {/* DEDICATED PAYMENT STATUS BADGE ('Completed' or 'Pending') WITH PAYMENT METHOD (Cash/Online) */}
              {isPaymentCompleted ? (
                <span
                  title={`Payment Completed via ${service.paymentMode || 'Online'}${service.paymentCompletedBy ? ` • Verified by ${service.paymentCompletedBy}` : ''}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-700 shadow-2xs whitespace-nowrap"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-600 ring-2 ring-emerald-200 dark:ring-emerald-800 shrink-0" />
                  <span>Payment:</span>
                  <span className="font-extrabold text-emerald-800 dark:text-emerald-300">Completed</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-200/90 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100 border border-emerald-300/80 dark:border-emerald-700 uppercase tracking-tight">
                    {service.paymentMode === 'Cash' ? '💵 Cash' : service.paymentMode === 'Online' ? '💳 Online' : '🔀 Split'}
                  </span>
                </span>
              ) : (
                <span
                  title="Payment is pending accounts verification and clearance"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700 shadow-2xs whitespace-nowrap"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  <span>Payment:</span>
                  <span className="font-extrabold text-amber-800 dark:text-amber-300">Pending</span>
                </span>
              )}

              <StatusPill status={service.status} />

              {/* SMART THREE DOT MENU */}
              <OrderActionMenu
                service={service}
                currentUser={currentUser}
                onEdit={onUpdate}
                onOrderAction={primaryOrderAction?.action}
                orderActionLabel={primaryOrderAction?.label}
                onReschedule={() => setShowRescheduleModal(true)}
                onCancel={onCancel}
                onViewDetails={handleTriggerViewDetails}
                onTimeline={() => setShowTimeline(!showTimeline)}
                onNotify={() => setShowNotifyModal(true)}
                onDelete={onDelete ? handleDeleteConfirm : undefined}
                onShare={canShare ? () => onShareOrder!(service) : undefined}
                onCall={canCall ? () => window.open(`tel:${service.mobileNumber}`, '_self') : undefined}
                onMapToggle={hasLocation ? () => setShowMap(!showMap) : undefined}
                onRebook={onRebook ? () => onRebook(service) : undefined}
                isMapActive={showMap}
                isTimelineActive={showTimeline}
              />
            </div>
        </div>
        
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center">
                <IconEngine className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0" />
                <span>{service.carBrandModel} ({service.carNumber})</span>
            </div>
            <div className="flex items-center flex-wrap gap-1.5 sm:col-span-2">
                <IconUser className="w-4 h-4 mr-1 text-slate-400 flex-shrink-0" />
                <span className="font-medium text-slate-500 dark:text-slate-400 mr-1">Assigned:</span>
                {service.assignedTo ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-200 dark:border-blue-700 shadow-2xs">
                    🔧 {service.assignedTo} <span className="ml-1 text-[10px] uppercase font-bold text-blue-600 dark:text-blue-300">(Primary)</span>
                  </span>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">Unassigned</span>
                )}
                {service.secondaryAssignee && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-700 shadow-2xs">
                    🤝 {service.secondaryAssignee} <span className="ml-1 text-[10px] uppercase font-bold text-purple-600 dark:text-purple-300">(Helper)</span>
                  </span>
                )}
            </div>
            {service.streetAddress && (
                <div className="flex items-start sm:col-span-2">
                    <IconMapPin className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0 mt-0.5" />
                    <span>{service.streetAddress}</span>
                </div>
            )}
            
            {hasLocation && (
                <div className="flex items-start sm:col-span-2 text-emerald-700 dark:text-emerald-400">
                     <IconMapPin className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                     <span className="font-medium text-[11px] bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">Exact Location Pinned</span>
                </div>
            )}

            {hubDistanceInfo && (
                <div className="flex items-center sm:col-span-2 text-indigo-700 dark:text-indigo-300">
                    <IconNavigation className="w-4 h-4 mr-2 flex-shrink-0 text-indigo-500" />
                    <span className="font-semibold text-xs bg-indigo-50 dark:bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
                        Distance from Hub ({hubDistanceInfo.hubName}): <strong className="font-extrabold text-indigo-900 dark:text-indigo-100">{hubDistanceInfo.distanceKm.toFixed(1)} km</strong>
                    </span>
                </div>
            )}

            <div className="flex items-start sm:col-span-2">
                <IconClipboardList className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>Services: <strong className="font-semibold text-slate-800 dark:text-slate-200">{serviceSummary}</strong></span>
            </div>
            <div className="flex items-center">
                <IconClock className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0" />
                <span>Scheduled: <strong className="font-semibold text-slate-800 dark:text-slate-200">{formatScheduledDate(service)} at {service.scheduledTime || 'N/A'}</strong></span>
            </div>
             <div className="flex items-center">
                <IconReceipt className="w-4 h-4 mr-2 text-slate-400 flex-shrink-0" />
                <span>Value: <strong className="font-extrabold text-slate-900 dark:text-slate-100">₹{service.grandTotal.toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center">
                <span className="w-4 h-4 mr-2 text-center text-xs flex-shrink-0 leading-none">
                  {isPaymentCompleted ? (service.paymentMode === 'Cash' ? '💵' : '💳') : '⏳'}
                </span>
                <span>
                  Payment:{' '}
                  {isPaymentCompleted ? (
                    <strong className="font-extrabold text-emerald-700 dark:text-emerald-400">
                      Completed ({service.paymentMode || 'Online'})
                    </strong>
                  ) : (
                    <strong className="font-extrabold text-amber-700 dark:text-amber-400">
                      Pending
                    </strong>
                  )}
                </span>
            </div>
        </div>

        {/* VISUAL DISTINCTION CONTAINER: ORDER COMPLETION DETAILS & PAYMENT DETAILS & MISSING INFO */}
        <div className="mt-3 space-y-2.5">
          {/* 1. Job Completion & Payment Details Container */}
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
            isPaymentCompleted
              ? 'bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800'
              : isPaymentPending
                ? 'bg-amber-50/90 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700'
                : 'bg-slate-50 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                isPaymentCompleted 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : isPaymentPending 
                    ? 'bg-amber-500 text-white shadow-xs' 
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}>
                {isPaymentCompleted ? <IconCheck className="w-4 h-4 stroke-[3]" /> : <IconReceipt className="w-4 h-4" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Job completion status pill */}
                  {service.status === ServiceStatus.Completed && (
                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                      <IconCheck className="w-3 h-3" /> Job Completed
                    </span>
                  )}

                  {/* Payment Details Badge */}
                  {isPaymentCompleted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-800 dark:text-emerald-200 bg-emerald-100/90 dark:bg-emerald-900/90 border border-emerald-300 dark:border-emerald-600 px-2.5 py-0.5 rounded-full shadow-2xs">
                      {service.paymentMode === 'Cash' ? (
                        <>💵 Paid via Cash</>
                      ) : service.paymentMode === 'Online' ? (
                        <>💳 Paid via Bank / Online</>
                      ) : service.paymentMode === 'Both' ? (
                        <>🔀 Paid via Split (Cash + Bank)</>
                      ) : (
                        <>✅ Payment Completed</>
                      )}
                      <span className="ml-1 text-emerald-900 dark:text-emerald-100 font-black">
                        • ₹{service.grandTotal.toFixed(2)}
                      </span>
                    </span>
                  ) : isPaymentPending ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/80 border border-amber-300 dark:border-amber-600 px-2.5 py-0.5 rounded-full shadow-2xs">
                      ⚠️ Payment Pending Clearance • ₹{service.grandTotal.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-500">
                      Payment Unprocessed (₹{service.grandTotal.toFixed(2)})
                    </span>
                  )}
                </div>

                {/* Subtext with verifier info, payment breakdown, or clearance requirement */}
                <div className="text-[11px] text-slate-600 dark:text-slate-300">
                  {isPaymentCompleted ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Verified by <strong className="text-slate-800 dark:text-slate-100 font-bold">{service.paymentCompletedBy || 'Accounts Staff'}</strong>
                      </span>
                      {service.paymentCompletedAt && (
                        <span className="text-slate-400">
                          on {new Date(service.paymentCompletedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      {service.paymentTransactionId && (
                        <span className="font-mono bg-white/70 dark:bg-slate-900/70 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-[10px]">
                          Ref: {service.paymentTransactionId}
                        </span>
                      )}
                      {service.paymentBankName && (
                        <span className="text-slate-500 font-medium">({service.paymentBankName})</span>
                      )}
                      {service.paymentMode === 'Both' && (
                        <span className="font-semibold text-purple-700 dark:text-purple-300">
                          [Cash: ₹{(service.cashAmount || 0).toFixed(2)} | Bank: ₹{(service.onlineAmount || 0).toFixed(2)}]
                        </span>
                      )}
                    </div>
                  ) : isPaymentPending ? (
                    <span className="text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1">
                      <IconAlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      Order completed. Dedicated accounts user clearance required to mark payment completed.
                    </span>
                  ) : (
                    <span>Estimated total: ₹{service.grandTotal.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action button for Accounts user to complete payment */}
            {isPaymentPending && (
              <div className="shrink-0 self-start sm:self-center">
                {isAccounts ? (
                  <Button
                    size="sm"
                    onClick={() => setShowPaymentModal(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs flex items-center gap-1.5 px-3 py-1.5"
                  >
                    <IconReceipt className="w-3.5 h-3.5" />
                    Complete Payment
                  </Button>
                ) : (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-md flex items-center gap-1">
                    <IconLock className="w-3 h-3 text-amber-700" />
                    Accounts Clearance Required
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 2. Missing Information Alert (Before / After Photos for selected services) */}
          {missingInfo.length > 0 ? (
            <div className="p-3 rounded-xl bg-rose-50/90 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">📷</span>
                <div>
                  <div className="font-extrabold text-rose-900 dark:text-rose-100 flex items-center gap-1.5">
                    <span>Missing Service Documentation:</span>
                    <span className="text-[10px] uppercase font-black bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-100 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {missingInfo.map((info, idx) => (
                      <span key={idx} className="bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 px-2 py-0.5 rounded-md font-bold text-[11px]">
                        ⚠️ {info}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-rose-700 dark:text-rose-300 italic self-end sm:self-center">
                Photos required for sign-off
              </span>
            </div>
          ) : (
            (service.status === ServiceStatus.InProgress || service.status === ServiceStatus.Completed) && (
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50/60 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <IconCheck className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                  All Service Documentation & Inspection Photos Complete
                </span>
                <span className="text-[10px] text-emerald-600 font-bold uppercase">Verified</span>
              </div>
            )
          )}
        </div>

        {(service.internalNotes || isEditingInternalNotes) && (
            <div className="mt-3 p-2.5 bg-yellow-50 dark:bg-yellow-950/40 border-l-4 border-yellow-300 dark:border-yellow-600 rounded-r-md">
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center space-x-1.5">
                        <IconClipboardList className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-xs font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wide">Internal Notes</p>
                    </div>
                    {!isEditingInternalNotes && (
                        <button 
                            onClick={() => setIsEditingInternalNotes(true)}
                            className="text-[11px] font-bold text-yellow-800 dark:text-yellow-200 hover:underline cursor-pointer"
                        >
                            {service.internalNotes ? 'Edit' : '+ Add Note'}
                        </button>
                    )}
                </div>
                {isEditingInternalNotes ? (
                    <div className="space-y-2 mt-1">
                        <textarea
                            rows={2}
                            value={internalNotesState}
                            onChange={(e) => setInternalNotesState(e.target.value)}
                            placeholder="Add or update internal remarks..."
                            className="w-full p-2 text-xs border border-yellow-300 dark:border-yellow-700 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-yellow-500 font-sans"
                        />
                        <div className="flex justify-end space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => { setInternalNotesState(service.internalNotes || ''); setIsEditingInternalNotes(false); }}>
                                Cancel
                            </Button>
                            <Button variant="primary" size="sm" disabled={isSavingNotes} onClick={handleSaveInternalNotes}>
                                {isSavingNotes ? 'Saving...' : 'Save Notes'}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap font-sans">
                        {service.internalNotes}
                    </p>
                )}
            </div>
        )}
        {uncompletedDependencies.length > 0 && (
            <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-950/40 border-l-4 border-amber-300 dark:border-amber-600 rounded-r-md flex items-start space-x-3">
                <IconLink className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Blocked by Prerequisite</p>
                    <p className="text-xs text-amber-900 dark:text-amber-200">
                        Cannot be started until task(s) {uncompletedDependencies.map(dep => ` #${dep.appointmentId?.split('-').pop()}`).join(', ')} are complete.
                    </p>
                </div>
            </div>
        )}
      </div>

      {showMap && hasLocation && (
         <div className="border-t border-slate-200 dark:border-slate-800 p-2 bg-slate-50 dark:bg-slate-900">
             <OrderTrackingMap service={service} currentUser={currentUser} deliveryHubs={deliveryHubs} />
         </div>
      )}

      {showTimeline && (
         <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-slate-50 dark:bg-slate-900">
             <OrderTimeline service={service} auditLogs={auditLogs} />
         </div>
      )}

      {/* QUICK ACTIONS ROW: COMPACT ICON-ONLY BUTTONS (CALL/MAP/START/SHARE/NOTIFY/VIEW) */}
      <div className="px-3 py-2.5 bg-slate-50/90 dark:bg-slate-800/60 border-t border-slate-200/80 dark:border-slate-800 rounded-b-xl flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* ICON-ONLY QUICK ACTION BUTTONS */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 1. CALL QUICK ACTION */}
          {canCall && (
            <a 
              href={`tel:${service.mobileNumber}`} 
              aria-label={`Call ${service.customerFirstName} (${service.mobileNumber})`}
              title={`Call ${service.customerFirstName} (${service.mobileNumber})`}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all hover:scale-105 active:scale-95 shadow-2xs"
            >
              <IconPhone className="w-4 h-4" />
            </a>
          )}

          {/* 2. MAP / NAVIGATION QUICK ACTION */}
          {mapUrl && (
            <a 
              href={mapUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              aria-label="Navigate on Google Maps"
              title={hasLocation ? "Navigate via GPS on Google Maps" : "Search address on Google Maps"}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 transition-all hover:scale-105 active:scale-95 shadow-2xs"
            >
              <IconNavigation className="w-4 h-4" />
            </a>
          )}

          {/* 3. IN-APP TRACKING MAP TOGGLE */}
          {hasLocation && (
            <button 
              type="button"
              onClick={() => setShowMap(!showMap)}
              aria-label={showMap ? "Hide tracking map" : "Show tracking map"}
              title={showMap ? "Hide live map" : "Show live tracking map"}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95 shadow-2xs ${
                showMap 
                  ? 'bg-indigo-600 text-white border border-indigo-700' 
                  : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
              }`}
            >
              <IconMapPin className="w-4 h-4" />
            </button>
          )}

          {/* 4. START QUICK ACTION (ICON-ONLY BUTTON) */}
          {service.status === ServiceStatus.Assigned && (service.assignedTo === currentUser.username || isAdminOrManager) && onStart && (
            <button 
              type="button"
              onClick={() => {
                if (!canStart) {
                  toast.error(`Order is blocked by prerequisite task(s): ${uncompletedDependencies.map(s => `#${s.appointmentId?.split('-').pop()}`).join(', ')}`);
                  return;
                }
                onStart();
              }}
              disabled={!canStart}
              aria-label="Start Order"
              title={!canStart ? `Blocked by prerequisite task(s): ${uncompletedDependencies.map(s => `#${s.appointmentId?.split('-').pop()}`).join(', ')}` : 'Start Order'}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all hover:scale-105 active:scale-95 shadow-xs disabled:opacity-50 disabled:hover:scale-100"
            >
              <IconPlay className="w-4 h-4 fill-current" />
            </button>
          )}

          {/* 5. SHARE QUICK ACTION */}
          {canShare && (
            <button 
              type="button"
              onClick={() => onShareOrder!(service)}
              aria-label="Share order details"
              title="Share order details"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition-all hover:scale-105 active:scale-95 shadow-2xs"
            >
              <IconShare className="w-4 h-4" />
            </button>
          )}

          {/* 6. NOTIFY QUICK ACTION */}
          {canNotify && (
            <button 
              type="button"
              onClick={() => setShowNotifyModal(true)}
              aria-label="Send notification to customer"
              title="Send notification to customer"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 transition-all hover:scale-105 active:scale-95 shadow-2xs"
            >
              <IconBellRinging className="w-4 h-4" />
            </button>
          )}

          {/* 7. VIEW DETAILS QUICK ACTION */}
          <button 
            type="button"
            onClick={handleTriggerViewDetails}
            aria-label="View full order details"
            title="View full order details"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-500/30 transition-all hover:scale-105 active:scale-95 shadow-2xs"
          >
            <IconEye className="w-4 h-4" />
          </button>
        </div>

        {/* PRIMARY STATUS ACTION (COMPACT BUTTON / BADGE) */}
        <div className="flex items-center justify-end space-x-2 ml-auto">
          {isAdminOrManager ? renderAdminButtons() : renderUserButtons()}
        </div>
      </div>

      {/* RESCHEDULE ORDER MODAL */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <IconCalendar className="w-5 h-5 text-amber-500" />
                Reschedule Order #{orderNo}
              </h3>
              <button onClick={() => setShowRescheduleModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1">✕</button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reschedule order date & time for <strong>{service.customerFirstName} {service.customerLastName}</strong> ({service.carBrandModel}).
              </p>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Quick Presets</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePresetReschedule('today')}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-brand-blue/10 hover:text-brand-blue dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetReschedule('tomorrow')}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-brand-blue/10 hover:text-brand-blue dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePresetReschedule('in2days')}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-brand-blue/10 hover:text-brand-blue dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                  >
                    In 2 Days
                  </button>
                </div>
              </div>

              {/* Custom Date & Time Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input
                    label="New Date"
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
                <div>
                  <Input
                    label="New Time"
                    type="text"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    placeholder="e.g. 10:00 AM"
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              {/* Audit Metadata Box */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Audit Record Metadata</div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <IconUser className="w-3.5 h-3.5 text-brand-blue" />
                  <span>Logger: <strong>{currentUser.username || 'System User'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <IconClock className="w-3.5 h-3.5 text-amber-500" />
                  <span>Timestamp: <strong className="font-mono">{new Date().toLocaleString()}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <IconMapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>Location: <strong className="font-mono text-[11px]">{isLocatingReschedule ? 'Acquiring GPS...' : rescheduleLocation}</strong></span>
                </div>
              </div>

              {/* Required Reason for Reschedule Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Reason for Reschedule <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rescheduleReason}
                  onChange={(e) => {
                    setRescheduleReason(e.target.value);
                    if (e.target.value.trim()) setRescheduleError('');
                  }}
                  placeholder="e.g. Customer requested time change, parts delayed, weather conditions..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  rows={2.5 as any}
                />
                {rescheduleError && <p className="text-red-500 text-xs font-semibold">{rescheduleError}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button variant="ghost" size="sm" onClick={() => setShowRescheduleModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmReschedule} disabled={isSavingReschedule} className="font-bold">
                {isSavingReschedule ? 'Rescheduling...' : 'Confirm Reschedule'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW FULL DETAILS MODAL */}
      {showDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    {service.customerFirstName} {service.customerLastName}
                  </h3>
                  <span className="text-xs font-mono font-bold text-brand-blue bg-blue-100 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-md">
                    #{orderNo}
                  </span>
                  <span className={`px-2.5 py-0.5 text-xs font-extrabold rounded-full ${currentStatusConfig.bg} ${currentStatusConfig.text}`}>
                    {service.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Vehicle: <strong className="text-slate-800 dark:text-slate-200">{service.carBrandModel} ({service.carNumber})</strong>
                </p>
                {Array.isArray(service.tags) && service.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    {service.tags.map(tag => (
                      <OrderTagBadge key={tag} tag={tag} size="xs" />
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg p-1">✕</button>
            </div>

            {/* Full Order Breakdown */}
            <div className="space-y-4 text-xs">
              {/* Customer & Schedule Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-slate-400 font-medium block">Mobile</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{service.mobileNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Scheduled Date</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{service.scheduledDate ? formatScheduledDate(service) : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Scheduled Time</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{service.scheduledTime || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Assigned To</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{service.assignedTo || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Priority</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{service.priority || 'Normal'}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Total Value</span>
                  <span className="font-extrabold text-emerald-600 text-sm">₹{(service.grandTotal || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Address */}
              {service.streetAddress && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 font-medium block mb-0.5">Address</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{service.streetAddress}</span>
                </div>
              )}

              {/* Hub Distance */}
              {hubDistanceInfo && (
                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
                  <div>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[10px] tracking-wider block">Hub Distance</span>
                    <span className="font-extrabold text-indigo-950 dark:text-indigo-100 text-sm">{hubDistanceInfo.distanceKm.toFixed(1)} km</span>
                  </div>
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2.5 py-1 rounded-lg">
                    Nearest: {hubDistanceInfo.hubName}
                  </span>
                </div>
              )}

              {/* Selected Services Breakdown */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider block">Service Breakdown</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">{serviceSummary}</p>
              </div>

              {/* Media Attachments */}
              {(service.beforeWashingPhoto || service.afterWashingPhoto || service.beforeVideoInventory) && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <span className="text-slate-400 font-bold uppercase tracking-wider block">Media Attachments</span>
                  <div className="flex flex-wrap gap-2">
                    {service.beforeWashingPhoto && (
                      <a href={service.beforeWashingPhoto} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-blue-600 hover:underline">
                        📷 Before Photo
                      </a>
                    )}
                    {service.afterWashingPhoto && (
                      <a href={service.afterWashingPhoto} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-emerald-600 hover:underline">
                        📷 After Photo
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Internal Agent Notes Block */}
              <div className="p-3.5 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-yellow-800 dark:text-yellow-300 font-bold uppercase tracking-wider block text-xs flex items-center gap-1.5">
                    <IconClipboardList className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    <span>Internal Agent Notes</span>
                  </span>
                  {!isEditingInternalNotes && (
                    <button
                      onClick={() => setIsEditingInternalNotes(true)}
                      className="text-xs font-bold text-yellow-800 dark:text-yellow-200 hover:underline cursor-pointer"
                    >
                      {service.internalNotes ? 'Edit Notes' : '+ Add Notes'}
                    </button>
                  )}
                </div>

                {isEditingInternalNotes ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={internalNotesState}
                      onChange={(e) => setInternalNotesState(e.target.value)}
                      placeholder="Add internal remarks, instructions, or updates for this order..."
                      className="w-full p-2.5 text-xs border border-yellow-300 dark:border-yellow-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-yellow-500 font-sans"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setInternalNotesState(service.internalNotes || '');
                          setIsEditingInternalNotes(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isSavingNotes}
                        onClick={handleSaveInternalNotes}
                      >
                        {isSavingNotes ? 'Saving Notes...' : 'Save Internal Notes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-yellow-900 dark:text-yellow-200 whitespace-pre-wrap font-sans">
                    {service.internalNotes || <em className="text-yellow-700/60 dark:text-yellow-400/60">No internal notes added. Click "+ Add Notes" to append.</em>}
                  </p>
                )}
              </div>

              {/* Order Timeline embedded */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 font-bold uppercase tracking-wider block mb-2">Order Activity Timeline</span>
                <OrderTimeline service={service} auditLogs={auditLogs} />
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-slate-200 dark:border-slate-800 pt-3">
              <Button variant="secondary" size="sm" onClick={() => downloadOrderInvoicePDF(service)}>
                <FileText className="w-4 h-4 mr-1.5 text-blue-600" />
                Download PDF Invoice
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowDetailsModal(false)}>
                Close Details
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFY CUSTOMER MODAL */}
      <NotifyCustomerModal
        service={service}
        currentUser={currentUser}
        isOpen={showNotifyModal}
        onClose={() => setShowNotifyModal(false)}
        onNotificationSent={(updated) => {
          setService(updated);
          if (onUpdate) onUpdate();
        }}
      />

      {/* DEDICATED ACCOUNTS COMPLETE PAYMENT MODAL */}
      {showPaymentModal && (
        <CompletePaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          service={service}
          currentUser={currentUser}
          onSavePayment={handleSavePayment}
        />
      )}
    </div>
  );
};

export const AppointmentCard = React.memo(AppointmentCardComponent);
export default AppointmentCard;
