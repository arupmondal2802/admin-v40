import React, { useState, useRef, useEffect } from 'react';
import { Service, ServiceStatus, User } from '../../types';
import { downloadOrderInvoicePDF } from '../../utils/pdfGenerator';
import { FileText } from 'lucide-react';
import { 
  IconDotsVertical, 
  IconPencil, 
  IconCalendar, 
  IconTrash, 
  IconClock, 
  IconEye, 
  IconBellRinging, 
  IconShare, 
  IconPhone, 
  IconMapPin, 
  IconEngine, 
  IconClipboardList,
  IconAlertTriangle 
} from '../ui/Icon';

export interface OrderActionMenuProps {
  service: Service;
  currentUser: User;
  onEdit?: () => void;
  onOrderAction?: () => void;
  orderActionLabel?: string;
  onReschedule?: () => void;
  onCancel?: () => void;
  onViewDetails?: () => void;
  onTimeline?: () => void;
  onNotify?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onCall?: () => void;
  onMapToggle?: () => void;
  onRebook?: () => void;
  isMapActive?: boolean;
  isTimelineActive?: boolean;
}

export const OrderActionMenu: React.FC<OrderActionMenuProps> = ({
  service,
  currentUser,
  onEdit,
  onOrderAction,
  orderActionLabel,
  onReschedule,
  onCancel,
  onViewDetails,
  onTimeline,
  onNotify,
  onDelete,
  onShare,
  onCall,
  onMapToggle,
  onRebook,
  isMapActive,
  isTimelineActive
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAction = (callback?: () => void) => {
    setIsOpen(false);
    if (callback) {
      callback();
    }
  };

  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const hasLocation = !!(service.customerLatitude && service.customerLongitude);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Smart Three Dot Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        title="Smart Order Options"
        aria-label="Order Options Menu"
        aria-expanded={isOpen}
      >
        <IconDotsVertical className="w-5 h-5" />
      </button>

      {/* Floating Dropdown Options Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 z-50 animate-in fade-in zoom-in-95 duration-150">
          
          {/* PRIMARY ORDER ACTIONS */}
          <div className="p-1.5 space-y-0.5">
            {/* 1. Edit Order */}
            {onEdit && (
              <button
                type="button"
                onClick={() => handleAction(onEdit)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-brand-blue rounded-lg transition-colors"
              >
                <IconPencil className="w-4 h-4 text-blue-500" />
                <span>Edit Order</span>
              </button>
            )}

            {/* 2. Primary Order Action (Start / Claim / Assign / Update) */}
            {onOrderAction && orderActionLabel && (
              <button
                type="button"
                onClick={() => handleAction(onOrderAction)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors"
              >
                <IconEngine className="w-4 h-4 text-emerald-500" />
                <span>{orderActionLabel}</span>
              </button>
            )}

            {/* 3. Reschedule Order */}
            {onReschedule && (
              <button
                type="button"
                onClick={() => handleAction(onReschedule)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 rounded-lg transition-colors"
              >
                <IconCalendar className="w-4 h-4 text-amber-500" />
                <span>Reschedule Order</span>
              </button>
            )}

            {/* Cancel Order */}
            {onCancel && service.status !== ServiceStatus.Cancelled && service.status !== ServiceStatus.Completed && (
              <button
                type="button"
                onClick={() => handleAction(onCancel)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
              >
                <IconAlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Cancel Order</span>
              </button>
            )}

            {/* 4. View Details */}
            {onViewDetails && (
              <button
                type="button"
                onClick={() => handleAction(onViewDetails)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 rounded-lg transition-colors"
              >
                <IconEye className="w-4 h-4 text-indigo-500" />
                <span>View Full Details</span>
              </button>
            )}

            {/* Download PDF Invoice */}
            <button
              type="button"
              onClick={() => handleAction(() => downloadOrderInvoicePDF(service))}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 rounded-lg transition-colors"
            >
              <FileText className="w-4 h-4 text-blue-500" />
              <span>Download PDF Invoice</span>
            </button>

            {/* 5. Order Timeline */}
            {onTimeline && (
              <button
                type="button"
                onClick={() => handleAction(onTimeline)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 rounded-lg transition-colors"
              >
                <IconClock className="w-4 h-4 text-purple-500" />
                <span>{isTimelineActive ? 'Hide Timeline' : 'Order Timeline'}</span>
              </button>
            )}

            {/* 6. Notify Customer / Tech */}
            {onNotify && (isAdminOrManager || service.status !== ServiceStatus.Completed) && (
              <button
                type="button"
                onClick={() => handleAction(onNotify)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:text-sky-600 rounded-lg transition-colors"
              >
                <IconBellRinging className="w-4 h-4 text-sky-500" />
                <span>Send Notification</span>
              </button>
            )}
          </div>

          {/* SECONDARY UTILITY ACTIONS */}
          {(onShare || onCall || (onMapToggle && hasLocation) || onRebook) && (
            <div className="p-1.5 space-y-0.5">
              {onShare && (
                <button
                  type="button"
                  onClick={() => handleAction(onShare)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <IconShare className="w-4 h-4 text-slate-500" />
                  <span>Share Order</span>
                </button>
              )}

              {onCall && service.mobileNumber && (
                <button
                  type="button"
                  onClick={() => handleAction(onCall)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <IconPhone className="w-4 h-4 text-emerald-500" />
                  <span>Call Customer</span>
                </button>
              )}

              {onMapToggle && hasLocation && (
                <button
                  type="button"
                  onClick={() => handleAction(onMapToggle)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <IconMapPin className="w-4 h-4 text-rose-500" />
                  <span>{isMapActive ? 'Hide Map' : 'Track Location'}</span>
                </button>
              )}

              {onRebook && service.status === ServiceStatus.Completed && (
                <button
                  type="button"
                  onClick={() => handleAction(onRebook)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-blue hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                >
                  <IconClipboardList className="w-4 h-4 text-brand-blue" />
                  <span>Quick Re-book</span>
                </button>
              )}
            </div>
          )}

          {/* DANGER ZONE (DELETE) */}
          {onDelete && (
            <div className="p-1.5">
              <button
                type="button"
                onClick={() => handleAction(onDelete)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
              >
                <IconTrash className="w-4 h-4 text-rose-500" />
                <span>Delete Order</span>
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default OrderActionMenu;
