// FIX: Imports are now valid as types.ts has been updated.
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Service, ServiceStatus, User, ServiceTemplate } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { 
  IconChevronDown, 
  IconSparkles, 
  IconFilter, 
  IconCheck,
  IconTrash,
  IconX,
  IconRefresh,
  IconEye,
  IconEdit,
  IconReceipt
} from './ui/Icon';
import { MetricsReport } from './MetricsReport';
import Input from './ui/Input';
import { parseDateTime, formatScheduledDate } from '../utils/dateTimeUtils';
import { OrderActionMenu } from './dashboard/OrderActionMenu';
import SkeletonLoader from './ui/SkeletonLoader';
import { StatusPill } from './ui/StatusPill';
import { OrderTagBadge } from './ui/OrderTagsManager';
import { toast } from 'sonner';
import { haptic } from '../utils/haptics';

interface SubmissionListProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  submissions: Service[];
  users: Omit<User, 'password'>[];
  onEdit: (service: Service) => void;
  onCompleteOrder?: (service: Service) => void;
  onPrint: (service: Service) => void;
  onSummarize: (service: Service) => void;
  currentUser: User;
  serviceTemplates: ServiceTemplate[];
}

type SortField = 'scheduledDate' | 'timestamp';
type SortOrder = 'asc' | 'desc';

// Robust helper to format date strings safely
const formatDateString = (dateStr?: string): string => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return 'N/A';
  }
};

const DetailItem: React.FC<{ label: string; value?: React.ReactNode | null; children?: React.ReactNode }> = ({ label, value, children }) => {
  const displayValue = value ?? children;
  if (!displayValue && typeof displayValue !== 'number' && displayValue !== '0') return null;
  return (
    <div className="py-2 break-words">
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
      <dd className="text-sm text-slate-900 dark:text-slate-100 font-medium">{displayValue}</dd>
    </div>
  );
};

const ServiceDetailsView: React.FC<{ service: Service; serviceTemplates: ServiceTemplate[] }> = ({ service, serviceTemplates }) => {
  const customFieldDetails = useMemo(() => {
    if (!service.customFieldData || service.customFieldData.length === 0) return null;
    const allCustomFields = serviceTemplates.flatMap(st => st.customFields);
    return (
      <div>
        <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Service-Specific Details</h5>
        <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4">
          {service.customFieldData.map(data => {
            const fieldDef = allCustomFields.find(f => f.id === data.fieldId);
            if (!fieldDef) return null;
            let displayValue: React.ReactNode = data.value;
            if (fieldDef.type === 'PHOTO' && typeof data.value === 'string') {
              displayValue = <a href={data.value} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Photo</a>;
            }
            return <DetailItem key={data.fieldId} label={fieldDef.label} value={displayValue} />;
          })}
        </dl>
      </div>
    );
  }, [service.customFieldData, serviceTemplates]);

  return (
    <div className="space-y-4 text-sm">
      <h4 className="font-bold text-slate-700 dark:text-slate-200 mt-2 border-b border-slate-200 dark:border-slate-700 pb-1">Full Details</h4>
      <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4">
        <DetailItem label="Appointment ID" value={service.appointmentId ? `#${String(service.appointmentId).split('-').pop()}`: undefined} />
        <DetailItem label="Submitted By" value={service.submittedBy} />
        <DetailItem label="Assigned To" value={service.assignedTo} />
        <DetailItem label="Secondary Helper / Labour" value={service.secondaryAssignee} />
        <DetailItem label="Scheduled Date" value={service.scheduledDate ? formatScheduledDate(service) : undefined} />
        <DetailItem label="Scheduled Time" value={service.scheduledTime} />
      </dl>
      
      {service.serviceSelection && service.serviceSelection.includes("Car Washing") && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Car Washing</h5>
          {service.carWashDetails ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4">
              <DetailItem label="Wash Type" value={service.carWashDetails.washType} />
              <DetailItem label="Is Subscription?" value={service.isSubscription ? 'Yes' : 'No'} />
              <DetailItem label="Total" value={`₹${(service.carWashDetails.price || 0).toFixed(2)}`} />
            </dl>
          ) : <DetailItem label="Details" value="N/A (Legacy Record)" />}

          <div className="mt-2 space-y-2">
            <DetailItem label="Before Wash Photo" value={service.beforeWashingPhoto} />
            <DetailItem label="Before Inventory Video" value={service.beforeVideoInventory} />
            <DetailItem label="Before Top Body Video" value={service.beforeVideoTopBody} />
            <DetailItem label="Before Underchassis Video" value={service.beforeVideoUnderchassis} />
            <DetailItem label="After Wash Photo" value={service.afterWashingPhoto} />
            <DetailItem label="After Interior Video" value={service.afterVideoInterior} />
            <DetailItem label="After Exterior Video" value={service.afterVideoExterior} />
            <DetailItem label="After Underchassis Video" value={service.afterVideoUnderchassis} />
          </div>
        </div>
      )}
      
      {service.serviceSelection && service.serviceSelection.includes("Car Care") && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Car Care</h5>
          {service.carCareDetails ? (
            <dl className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4">
              <DetailItem label="Package Type" value={service.carCareDetails.careType} />
              <DetailItem label="Total" value={`₹${(service.carCareDetails.price || 0).toFixed(2)}`} />
            </dl>
          ) : <DetailItem label="Details" value="N/A (Legacy Record)" />}
        </div>
      )}

      {service.serviceSelection && service.serviceSelection.includes("Tyre Replacement") && Array.isArray(service.tyreDetails) && service.tyreDetails.length > 0 && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Tyre Replacement</h5>
          {service.tyreDetails.map((tyre, index) => (
            <div key={tyre.tyreId} className="p-2 mt-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <p className="font-semibold text-xs text-slate-600 dark:text-slate-400">Tyre {index + 1}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
                <DetailItem label="DOT Code" value={tyre.dotCode} />
                <DetailItem label="Tyre Size" value={tyre.tyreSize} />
                <DetailItem label="Brand" value={tyre.brand} />
                <DetailItem label="Model" value={tyre.model} />
              </dl>
              <DetailItem label="Serial Image" value={tyre.dotSerialNumberImage} />
            </div>
          ))}
        </div>
      )}
      
      {service.serviceSelection && service.serviceSelection.includes("Battery Replacement") && Array.isArray(service.batteryDetails) && service.batteryDetails.length > 0 && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Battery Replacement</h5>
          {service.batteryDetails.map((battery, index) => (
            <div key={battery.batteryId} className="p-2 mt-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <p className="font-semibold text-xs text-slate-600 dark:text-slate-400">Battery {index + 1}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4">
                <DetailItem label="Serial #" value={battery.serialNumber} />
                <DetailItem label="Brand" value={battery.brand} />
                <DetailItem label="New Cost" value={`₹${battery.newBatteryAmount}`} />
                <DetailItem label="Exchange Value" value={`₹${battery.exchangeValue}`} />
              </dl>
            </div>
          ))}
        </div>
      )}

      {customFieldDetails}

      {((Array.isArray(service.dynamicAddons) && service.dynamicAddons.length > 0) || (Array.isArray(service.categorizedAddons) && service.categorizedAddons.length > 0)) && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Add-ons</h5>
          {(Array.isArray(service.dynamicAddons) ? service.dynamicAddons : []).map(item => (
            <div key={item.name} className="p-2 mt-1 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <DetailItem label={item.name} value={`Qty: ${item.quantity} @ ₹${item.price.toFixed(2)}`} />
            </div>
          ))}
          {(Array.isArray(service.categorizedAddons) ? service.categorizedAddons : []).map((addon) => (
            <div key={addon.id} className="p-2 mt-1 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <DetailItem label={`${addon.productName} (${addon.category})`} value={`Qty: ${addon.quantity} @ ₹${addon.amount}`} />
            </div>
          ))}
        </div>
      )}
      
      {Array.isArray(service.customServices) && service.customServices.length > 0 && (
        <div>
          <h5 className="font-semibold text-brand-blue dark:text-brand-blue-300 mt-2">Custom Services</h5>
          {service.customServices.map((cs, index) => (
            <div key={cs.customServiceId} className="p-2 mt-1 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
              <DetailItem label={cs.serviceDescription || `Custom Service ${index+1}`} value={`₹${cs.amount}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Animated Full Detail Sheet / Modal for mobile & desktop
const ServiceDetailModal: React.FC<{
  service: Service | null;
  serviceTemplates: ServiceTemplate[];
  onClose: () => void;
  onEdit: (service: Service) => void;
  onPrint: (service: Service) => void;
  onSummarize: (service: Service) => void;
  onCompleteOrder?: (service: Service) => void;
}> = ({ service, serviceTemplates, onClose, onEdit, onPrint, onSummarize, onCompleteOrder }) => {
  if (!service) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, y: 120, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 120, scale: 0.96 }}
          transition={{ type: 'spring', damping: 26, stiffness: 280 }}
          className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-slate-50 dark:bg-slate-950/60">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {service.customerFirstName} {service.customerLastName}
                </h3>
                {service.appointmentId && (
                  <span className="text-xs font-mono text-brand-blue dark:text-blue-400 bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 rounded-md font-semibold">
                    #{String(service.appointmentId).split('-').pop()}
                  </span>
                )}
                <StatusPill status={service.status} />
                {service.paymentStatus === 'Completed' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span>Payment: Completed ({service.paymentMode === 'Cash' ? '💵 Cash' : service.paymentMode === 'Online' ? '💳 Online' : '🔀 Split'})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Payment: Pending</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {service.carBrandModel} • {service.carNumber}
              </p>
              {Array.isArray(service.tags) && service.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {service.tags.map(tag => (
                    <OrderTagBadge key={tag} tag={tag} size="xs" />
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto flex-1 space-y-4">
            <ServiceDetailsView service={service} serviceTemplates={serviceTemplates} />
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <div className="flex items-center gap-2">
              {service.status === ServiceStatus.InProgress && onCompleteOrder && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onCompleteOrder({ ...service, status: ServiceStatus.Completed, paymentStatus: 'Pending' });
                    onClose();
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  <IconCheck className="w-4 h-4 mr-1 stroke-[3]" />
                  Complete Order
                </Button>
              )}
              {service.status !== ServiceStatus.Completed && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onEdit(service);
                    onClose();
                  }}
                >
                  <IconEdit className="w-4 h-4 mr-1" />
                  Edit Details
                </Button>
              )}
              {service.status === ServiceStatus.Completed && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onSummarize(service);
                      onClose();
                    }}
                    className="text-brand-blue hover:bg-brand-blue/10"
                  >
                    <IconSparkles className="w-4 h-4 mr-1" />
                    Summarize
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onPrint(service);
                      onClose();
                    }}
                  >
                    <IconReceipt className="w-4 h-4 mr-1" />
                    Receipt
                  </Button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Swipeable Service Request Card Component
const SwipeableServiceCard: React.FC<{
  service: Service;
  serviceTemplates: ServiceTemplate[];
  currentUser: User;
  isExpanded: boolean;
  onToggleDetails: () => void;
  onOpenModal: () => void;
  onEdit: () => void;
  onCompleteOrder?: () => void;
  onPrint: () => void;
  onSummarize: () => void;
  onDismiss: () => void;
}> = ({
  service,
  serviceTemplates,
  currentUser,
  isExpanded,
  onToggleDetails,
  onOpenModal,
  onEdit,
  onCompleteOrder,
  onPrint,
  onSummarize,
  onDismiss,
}) => {
  const [dragX, setDragX] = useState(0);

  const selections = useMemo(() => {
    return Array.isArray(service.serviceSelection)
      ? (service.serviceSelection as string[])
      : typeof service.serviceSelection === 'string'
      ? (service.serviceSelection as string).split(',').filter(Boolean)
      : [];
  }, [service.serviceSelection]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: dragX < 0 ? -280 : 280, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-2xl overflow-hidden select-none"
    >
      {/* Background Reveal Layers for Swipe Actions */}
      <div className="absolute inset-0 rounded-2xl flex items-center justify-between pointer-events-none z-0 overflow-hidden">
        {/* Left Swipe Background (Dismiss Action - Red) */}
        <div
          className={`absolute inset-0 bg-rose-600 rounded-2xl flex items-center justify-end px-6 transition-opacity duration-150 ${
            dragX < -15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wide">
            <span>Dismiss</span>
            <IconTrash className="w-6 h-6 stroke-2" />
          </div>
        </div>

        {/* Right Swipe Background (Quick Action - Green) */}
        <div
          className={`absolute inset-0 bg-emerald-600 rounded-2xl flex items-center justify-start px-6 transition-opacity duration-150 ${
            dragX > 15 ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-2 text-white font-black text-sm uppercase tracking-wide">
            <IconCheck className="w-6 h-6 stroke-[3]" />
            <span>{service.status === ServiceStatus.InProgress ? 'Complete' : 'View'}</span>
          </div>
        </div>
      </div>

      {/* Foreground Draggable Card Surface */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.65}
        onDrag={(_, info) => setDragX(info.offset.x)}
        onDragEnd={(_, info) => {
          setDragX(0);
          if (info.offset.x < -110 || info.velocity.x < -450) {
            onDismiss();
          } else if (info.offset.x > 110 || info.velocity.x > 450) {
            haptic.medium();
            if (service.status === ServiceStatus.InProgress && onCompleteOrder) {
              onCompleteOrder();
            } else {
              onOpenModal();
            }
          }
        }}
        className={`relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between ${
          service.priority === 'Urgent'
            ? 'border-l-4 border-l-red-500 bg-red-50/20'
            : service.priority === 'High'
            ? 'border-l-4 border-l-amber-500 bg-amber-50/20'
            : service.status === ServiceStatus.Queued
            ? 'border-l-4 border-l-amber-400'
            : service.status === ServiceStatus.InProgress
            ? 'border-l-4 border-l-blue-500'
            : service.status === ServiceStatus.Completed
            ? 'border-l-4 border-l-emerald-500'
            : ''
        }`}
      >
        <div>
          {/* Card Header */}
          <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 rounded-t-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>{service.customerFirstName} {service.customerLastName}</span>
                  {service.appointmentId && (
                    <span className="text-xs font-mono text-brand-blue dark:text-blue-400 bg-blue-100 dark:bg-blue-950/80 px-2 py-0.5 rounded-md font-semibold">
                      #{String(service.appointmentId).split('-').pop()}
                    </span>
                  )}
                  {service.priority && (
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        service.priority === 'Urgent'
                          ? 'bg-red-600 text-white animate-pulse'
                          : service.priority === 'High'
                          ? 'bg-amber-500 text-white'
                          : service.priority === 'Low'
                          ? 'bg-slate-200 text-slate-700'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {service.priority}
                    </span>
                  )}
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {service.carBrandModel} ({service.carNumber})
                </p>
                {Array.isArray(service.tags) && service.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
                    {service.tags.map(tag => (
                      <OrderTagBadge key={tag} tag={tag} size="xs" />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 flex-shrink-0 ml-2 flex-wrap sm:flex-nowrap">
                {service.paymentStatus === 'Completed' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-700 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span>Payment: Completed</span>
                    <span className="text-[10px] font-black px-1 rounded bg-emerald-200 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-100">
                      {service.paymentMode === 'Cash' ? '💵 Cash' : service.paymentMode === 'Online' ? '💳 Online' : '🔀 Split'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span>Payment: Pending</span>
                  </span>
                )}
                <StatusPill status={service.status} />
                <OrderActionMenu
                  service={service}
                  currentUser={currentUser}
                  onEdit={onEdit}
                  onViewDetails={onOpenModal}
                  onShare={onPrint}
                  onCall={service.mobileNumber ? () => window.open(`tel:${service.mobileNumber}`, '_self') : undefined}
                  onOrderAction={
                    service.status === ServiceStatus.InProgress && onCompleteOrder
                      ? onCompleteOrder
                      : onEdit
                  }
                  orderActionLabel={
                    service.status === ServiceStatus.InProgress && onCompleteOrder
                      ? 'Complete Order'
                      : 'Edit Details'
                  }
                />
              </div>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-5">
            <div className="space-y-2.5 text-xs sm:text-sm">
              <p>
                <strong className="font-semibold text-slate-600 dark:text-slate-400">Services:</strong>{' '}
                <span className="text-slate-900 dark:text-slate-200 font-medium">{selections.join(', ') || 'N/A'}</span>
              </p>
              <p>
                <strong className="font-semibold text-slate-600 dark:text-slate-400">Last Update:</strong>{' '}
                <span className="text-slate-900 dark:text-slate-200 font-medium">{formatDateString(service.timestamp)}</span>
              </p>
              {service.scheduledDate && (
                <p>
                  <strong className="font-semibold text-slate-600 dark:text-slate-400">Scheduled:</strong>{' '}
                  <span className="text-slate-900 dark:text-slate-200 font-medium">
                    {formatScheduledDate(service)} {service.scheduledTime ? `at ${service.scheduledTime}` : ''}
                  </span>
                </p>
              )}
              <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">Total Amount</span>
                  <span className="text-[11px] font-bold">
                    {service.paymentStatus === 'Completed' ? (
                      <span className="text-emerald-700 dark:text-emerald-400">Paid ({service.paymentMode || 'Online'})</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">Payment Pending</span>
                    )}
                  </span>
                </div>
                <span className="text-lg font-black text-slate-900 dark:text-white">₹{(service.grandTotal || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Expandable Inline Details with Fluid Motion Transition */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20"
              >
                <div className="p-5">
                  <ServiceDetailsView service={service} serviceTemplates={serviceTemplates} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card Footer Actions */}
        <div className="p-3.5 bg-slate-50/90 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl flex justify-between items-center gap-2">
          <Button variant="ghost" onClick={onToggleDetails} size="sm" className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {isExpanded ? 'Hide Fields' : 'View All Fields'}
            <IconChevronDown
              className={`w-4 h-4 ml-1.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </Button>

          <div className="flex items-center space-x-1.5">
            {service.status === ServiceStatus.InProgress && onCompleteOrder && (
              <Button
                variant="primary"
                size="sm"
                onClick={onCompleteOrder}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
              >
                <IconCheck className="w-3.5 h-3.5 mr-1 stroke-[3]" />
                Complete
              </Button>
            )}
            {service.status !== ServiceStatus.Completed && (
              <Button variant="secondary" size="sm" onClick={onEdit} className="text-xs">
                Edit
              </Button>
            )}
            {service.status === ServiceStatus.Completed && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onSummarize}
                  className="text-brand-blue hover:bg-brand-blue/10 text-xs"
                  title="AI Summary"
                >
                  <IconSparkles className="w-4 h-4 mr-1" />
                  AI Summary
                </Button>
                <Button variant="secondary" size="sm" onClick={onPrint} className="text-xs">
                  Print
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const SubmissionList: React.FC<SubmissionListProps> = (props) => {
  const { submissions, users, onEdit, onCompleteOrder, onPrint, onSummarize, currentUser, serviceTemplates, isLoading, isHydrated } = props;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalService, setModalService] = useState<Service | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ textSearch: '', customerName: '', startDate: '', endDate: '', status: '', assignedUser: '' });
  const [sortField, setSortField] = useState<SortField>('scheduledDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleApplyDatePreset = (preset: 'today' | '7days' | '30days' | 'thismonth' | 'clear') => {
    const today = new Date();
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (preset === 'today') {
      const todayStr = formatDate(today);
      setFilters(prev => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (preset === '7days') {
      const past = new Date();
      past.setDate(today.getDate() - 7);
      setFilters(prev => ({ ...prev, startDate: formatDate(past), endDate: formatDate(today) }));
    } else if (preset === '30days') {
      const past = new Date();
      past.setDate(today.getDate() - 30);
      setFilters(prev => ({ ...prev, startDate: formatDate(past), endDate: formatDate(today) }));
    } else if (preset === 'thismonth') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setFilters(prev => ({ ...prev, startDate: formatDate(startOfMonth), endDate: formatDate(today) }));
    } else if (preset === 'clear') {
      setFilters(prev => ({ ...prev, startDate: '', endDate: '' }));
    }
    setCurrentPage(1);
  };

  const handleToggleDetails = (id: string) => {
    setExpandedId(currentId => (currentId === id ? null : id));
  };

  const handleDismissService = (service: Service) => {
    setDismissedIds(prev => [...prev, service.submissionId]);
    haptic.medium();
    const name = `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Service request';
    const appointmentSuffix = service.appointmentId ? ` #${String(service.appointmentId).split('-').pop()}` : '';
    
    toast.info(`Dismissed ${name}${appointmentSuffix} from view`, {
      action: {
        label: 'Undo',
        onClick: () => {
          setDismissedIds(prev => prev.filter(id => id !== service.submissionId));
          haptic.light();
        },
      },
      duration: 5000,
    });
  };

  const handleRestoreAllDismissed = () => {
    setDismissedIds([]);
    haptic.medium();
    toast.success('Restored all dismissed service cards');
  };

  const filteredAndSortedSubmissions = useMemo(() => {
    const list = submissions || [];
    const filtered = list.filter(service => {
      if (service.isDeleted) return false;
      if (dismissedIds.includes(service.submissionId)) return false;
      
      const searchTerm = filters.textSearch.toLowerCase().trim();
      const fullName = `${service.customerFirstName || ''} ${service.customerLastName || ''}`.toLowerCase();
      const mobile = String(service.mobileNumber || '').toLowerCase();
      const carNum = String(service.carNumber || '').toLowerCase();
      const appIdSuffix = (service.appointmentId ? String(service.appointmentId).split('-').pop() || '' : '').toLowerCase();

      const matchesSearch = searchTerm === '' ||
        fullName.includes(searchTerm) ||
        mobile.includes(searchTerm) ||
        carNum.includes(searchTerm) ||
        appIdSuffix.includes(searchTerm) ||
        (service.carBrandModel && service.carBrandModel.toLowerCase().includes(searchTerm)) ||
        (Array.isArray(service.serviceSelection) && (service.serviceSelection as string[]).some((s: string) => String(s).toLowerCase().includes(searchTerm))) ||
        (typeof service.serviceSelection === 'string' && String(service.serviceSelection).toLowerCase().includes(searchTerm));

      const matchesSpecificCustomerName = !filters.customerName ||
        fullName.includes(filters.customerName.toLowerCase().trim());

      let matchesDate = true;
      if (filters.startDate || filters.endDate) {
        const rawDate = service.scheduledDate || service.timestamp;
        if (rawDate) {
          const serviceDateStr = rawDate.split('T')[0];
          if (filters.startDate && serviceDateStr < filters.startDate) matchesDate = false;
          if (filters.endDate && serviceDateStr > filters.endDate) matchesDate = false;
        } else {
          matchesDate = false;
        }
      }

      const matchesStatus = !filters.status || service.status === filters.status;

      let matchesUser = true;
      if (filters.assignedUser === 'UNASSIGNED') {
        matchesUser = !service.assignedTo || service.assignedTo.trim() === '';
      } else if (filters.assignedUser === 'ASSIGNED') {
        matchesUser = !!service.assignedTo && service.assignedTo.trim() !== '';
      } else if (filters.assignedUser) {
        matchesUser = service.assignedTo === filters.assignedUser;
      }

      return matchesSearch && matchesSpecificCustomerName && matchesDate && matchesStatus && matchesUser;
    });

    filtered.sort((a, b) => {
      if (sortField === 'scheduledDate') {
        const dateA = parseDateTime(a);
        const dateB = parseDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return sortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    return filtered;
  }, [submissions, filters, sortField, sortOrder, dismissedIds]);

  const totalPages = Math.ceil(filteredAndSortedSubmissions.length / itemsPerPage);
  const paginatedSubmissions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedSubmissions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedSubmissions, currentPage, itemsPerPage]);

  if (isLoading || isHydrated === false || !submissions || !users || !currentUser) {
    return <SkeletonLoader view="LIST" />;
  }

  const statusCounts = {
    ALL: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId)).length,
    [ServiceStatus.Queued]: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId) && s.status === ServiceStatus.Queued).length,
    [ServiceStatus.InProgress]: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId) && s.status === ServiceStatus.InProgress).length,
    [ServiceStatus.Completed]: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId) && s.status === ServiceStatus.Completed).length,
    [ServiceStatus.Assigned]: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId) && s.status === ServiceStatus.Assigned).length,
    [ServiceStatus.Draft]: (submissions || []).filter(s => !s.isDeleted && !dismissedIds.includes(s.submissionId) && s.status === ServiceStatus.Draft).length,
  };

  return (
    <div className="space-y-6">
       <MetricsReport submissions={filteredAndSortedSubmissions} users={users} currentUser={currentUser} />
       
       {/* Mobile Swipe Gesture Tip */}
       <div className="md:hidden flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60 font-medium">
         <div className="flex items-center gap-2">
           <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
           <span>Swipe card <strong>← left to dismiss</strong> or <strong>right → to quick-complete</strong></span>
         </div>
       </div>

       {/* Dismissed Items Recovery Banner */}
       <AnimatePresence>
         {dismissedIds.length > 0 && (
           <motion.div
             initial={{ opacity: 0, y: -10 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -10 }}
             className="flex items-center justify-between p-3.5 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-medium shadow-md"
           >
             <div className="flex items-center gap-2">
               <IconEye className="w-4 h-4 text-emerald-400" />
               <span>Showing active list ({dismissedIds.length} item{dismissedIds.length > 1 ? 's' : ''} dismissed)</span>
             </div>
             <button
               onClick={handleRestoreAllDismissed}
               className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 text-xs"
             >
               <IconRefresh className="w-3.5 h-3.5" />
               Restore All
             </button>
           </motion.div>
         )}
       </AnimatePresence>
       
       <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
         <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Service Requests & History</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Showing {filteredAndSortedSubmissions.length} active service record{filteredAndSortedSubmissions.length === 1 ? '' : 's'}
            </p>
         </div>
         <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className="flex items-center gap-2"
            >
              <IconFilter className="w-4 h-4" />
              <span>{isFilterPanelOpen ? 'Hide Filters' : 'Filter & Search'}</span>
            </Button>
         </div>
       </div>

       {/* Visually Distinct Quick Status Filter Pills */}
       <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
         <button
           id="status-filter-all"
           onClick={() => {
             setFilters(prev => ({ ...prev, status: '' }));
             setCurrentPage(1);
           }}
           className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
             !filters.status
               ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white ring-2 ring-slate-400/30'
               : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
           }`}
         >
           <span>All Requests</span>
           <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${!filters.status ? 'bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
             {statusCounts.ALL}
           </span>
         </button>

         <button
           id="status-filter-queued"
           onClick={() => {
             setFilters(prev => ({ ...prev, status: prev.status === ServiceStatus.Queued ? '' : ServiceStatus.Queued }));
             setCurrentPage(1);
           }}
           className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
             filters.status === ServiceStatus.Queued
               ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-400/40'
               : 'bg-amber-50 text-amber-900 border-amber-200/80 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
           }`}
         >
           <span className={`w-2 h-2 rounded-full ${filters.status === ServiceStatus.Queued ? 'bg-white' : 'bg-amber-500'}`} />
           <span>Queued</span>
           <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${filters.status === ServiceStatus.Queued ? 'bg-white/30 text-white' : 'bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200'}`}>
             {statusCounts[ServiceStatus.Queued]}
           </span>
         </button>

         <button
           id="status-filter-inprogress"
           onClick={() => {
             setFilters(prev => ({ ...prev, status: prev.status === ServiceStatus.InProgress ? '' : ServiceStatus.InProgress }));
             setCurrentPage(1);
           }}
           className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
             filters.status === ServiceStatus.InProgress
               ? 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400/40'
               : 'bg-blue-50 text-blue-900 border-blue-200/80 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
           }`}
         >
           <span className="relative flex h-2 w-2">
             <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${filters.status === ServiceStatus.InProgress ? 'bg-white' : 'bg-blue-400'}`} />
             <span className={`relative inline-flex rounded-full h-2 w-2 ${filters.status === ServiceStatus.InProgress ? 'bg-white' : 'bg-blue-600 dark:bg-blue-400'}`} />
           </span>
           <span>In Progress</span>
           <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${filters.status === ServiceStatus.InProgress ? 'bg-white/30 text-white' : 'bg-blue-200/70 dark:bg-blue-900/80 text-blue-900 dark:text-blue-200'}`}>
             {statusCounts[ServiceStatus.InProgress]}
           </span>
         </button>

         <button
           id="status-filter-completed"
           onClick={() => {
             setFilters(prev => ({ ...prev, status: prev.status === ServiceStatus.Completed ? '' : ServiceStatus.Completed }));
             setCurrentPage(1);
           }}
           className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
             filters.status === ServiceStatus.Completed
               ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400/40'
               : 'bg-emerald-50 text-emerald-900 border-emerald-200/80 hover:bg-emerald-100/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
           }`}
         >
           <IconCheck className={`w-3.5 h-3.5 stroke-[3] ${filters.status === ServiceStatus.Completed ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
           <span>Completed</span>
           <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${filters.status === ServiceStatus.Completed ? 'bg-white/30 text-white' : 'bg-emerald-200/70 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200'}`}>
             {statusCounts[ServiceStatus.Completed]}
           </span>
         </button>

         {statusCounts[ServiceStatus.Assigned] > 0 && (
           <button
             id="status-filter-assigned"
             onClick={() => {
               setFilters(prev => ({ ...prev, status: prev.status === ServiceStatus.Assigned ? '' : ServiceStatus.Assigned }));
               setCurrentPage(1);
             }}
             className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
               filters.status === ServiceStatus.Assigned
                 ? 'bg-sky-600 text-white border-sky-700 ring-2 ring-sky-400/40'
                 : 'bg-sky-50 text-sky-900 border-sky-200/80 hover:bg-sky-100/80 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60'
             }`}
           >
             <span className={`w-2 h-2 rounded-full ${filters.status === ServiceStatus.Assigned ? 'bg-white' : 'bg-sky-500'}`} />
             <span>Assigned</span>
             <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${filters.status === ServiceStatus.Assigned ? 'bg-white/30 text-white' : 'bg-sky-200/70 dark:bg-sky-900/80 text-sky-900 dark:text-sky-200'}`}>
               {statusCounts[ServiceStatus.Assigned]}
             </span>
           </button>
         )}

         {statusCounts[ServiceStatus.Draft] > 0 && (
           <button
             id="status-filter-draft"
             onClick={() => {
               setFilters(prev => ({ ...prev, status: prev.status === ServiceStatus.Draft ? '' : ServiceStatus.Draft }));
               setCurrentPage(1);
             }}
             className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shadow-2xs flex items-center gap-1.5 ${
               filters.status === ServiceStatus.Draft
                 ? 'bg-slate-700 text-white border-slate-800 ring-2 ring-slate-400/40'
                 : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
             }`}
           >
             <span className={`w-2 h-2 rounded-full ${filters.status === ServiceStatus.Draft ? 'bg-white' : 'bg-slate-400'}`} />
             <span>Draft</span>
             <span className={`px-1.5 py-0.2 text-[11px] rounded-full font-extrabold ${filters.status === ServiceStatus.Draft ? 'bg-white/30 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
               {statusCounts[ServiceStatus.Draft]}
             </span>
           </button>
         )}
       </div>

       {/* Filter Panel */}
       <AnimatePresence>
         {isFilterPanelOpen && (
           <motion.div
             initial={{ opacity: 0, height: 0 }}
             animate={{ opacity: 1, height: 'auto' }}
             exit={{ opacity: 0, height: 0 }}
             transition={{ duration: 0.25 }}
             className="overflow-hidden"
           >
             <Card className="p-4 sm:p-5 space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                 <div>
                   <Input
                     label="Search Keywords"
                     name="textSearch"
                     value={filters.textSearch}
                     onChange={handleFilterChange}
                     placeholder="Name, Car #, Mobile, ID..."
                   />
                 </div>
                 <div>
                   <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
                   <select
                     name="status"
                     value={filters.status}
                     onChange={handleFilterChange}
                     className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                   >
                     <option value="">All Statuses</option>
                     {Object.values(ServiceStatus).map(st => (
                       <option key={st} value={st}>{st}</option>
                     ))}
                   </select>
                 </div>
                 <div>
                   <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">Assigned Staff</label>
                   <select
                     name="assignedUser"
                     value={filters.assignedUser}
                     onChange={handleFilterChange}
                     className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                   >
                     <option value="">All Staff</option>
                     <option value="ASSIGNED">Any Assigned Staff</option>
                     <option value="UNASSIGNED">Unassigned Orders</option>
                     {users.map(u => (
                       <option key={u.username} value={u.username}>{u.name || u.username}</option>
                     ))}
                   </select>
                 </div>
               </div>

               {/* Quick Date Presets */}
               <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200 dark:border-slate-700">
                 <span className="text-xs text-slate-500 font-semibold">Date presets:</span>
                 <button
                   onClick={() => handleApplyDatePreset('today')}
                   className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
                 >
                   Today
                 </button>
                 <button
                   onClick={() => handleApplyDatePreset('7days')}
                   className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
                 >
                   Last 7 Days
                 </button>
                 <button
                   onClick={() => handleApplyDatePreset('30days')}
                   className="text-xs px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium"
                 >
                   Last 30 Days
                 </button>
                 <button
                   onClick={() => handleApplyDatePreset('clear')}
                   className="text-xs px-2.5 py-1 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950 font-medium ml-auto"
                 >
                   Reset Filters
                 </button>
               </div>
             </Card>
           </motion.div>
         )}
       </AnimatePresence>

       {/* Submissions List Grid */}
       {submissions.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-500 font-medium">No service history found.</p>
          </Card>
        ) : filteredAndSortedSubmissions.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-slate-500 font-medium">No services found matching your filters.</p>
            {dismissedIds.length > 0 && (
              <Button variant="secondary" size="sm" onClick={handleRestoreAllDismissed} className="mt-3">
                Restore {dismissedIds.length} Dismissed Items
              </Button>
            )}
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {paginatedSubmissions.map(service => (
                  <SwipeableServiceCard
                    key={service.submissionId}
                    service={service}
                    serviceTemplates={serviceTemplates}
                    currentUser={currentUser}
                    isExpanded={expandedId === service.submissionId}
                    onToggleDetails={() => handleToggleDetails(service.submissionId)}
                    onOpenModal={() => setModalService(service)}
                    onEdit={() => onEdit(service)}
                    onCompleteOrder={
                      onCompleteOrder
                        ? () => onCompleteOrder({ ...service, status: ServiceStatus.Completed })
                        : undefined
                    }
                    onPrint={() => onPrint(service)}
                    onSummarize={() => onSummarize(service)}
                    onDismiss={() => handleDismissService(service)}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>Show</span>
                    <select
                        value={itemsPerPage}
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        className="rounded-md border-slate-300 dark:border-slate-700 shadow-xs focus:ring-brand-blue focus:border-brand-blue sm:text-sm p-1 bg-white dark:bg-slate-800"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                    </select>
                    <span>per page</span>
                </div>

                <div className="flex items-center space-x-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Page {currentPage} of {totalPages || 1}
                    </span>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(p => p + 1)}
                    >
                        Next
                    </Button>
                </div>
            </div>
          </>
        )}

      {/* Animated Full Detail Sheet / Modal */}
      <ServiceDetailModal
        service={modalService}
        serviceTemplates={serviceTemplates}
        onClose={() => setModalService(null)}
        onEdit={onEdit}
        onPrint={onPrint}
        onSummarize={onSummarize}
        onCompleteOrder={onCompleteOrder}
      />
    </div>
  );
};

export default SubmissionList;
