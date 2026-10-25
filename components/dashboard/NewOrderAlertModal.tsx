import React, { useState, useEffect } from 'react';
import { Service, WebsiteOrderItem } from '../../types';
import { 
  IconCheck, 
  IconX, 
  IconPhone, 
  IconCalendar, 
  IconClock, 
  IconCar, 
  IconSparkles, 
  IconExternalLink, 
  IconChevronRight, 
  IconChevronLeft, 
  IconCopy, 
  IconUser, 
  IconShare, 
  IconRefresh 
} from '../ui/Icon';
import { playNewOrderChime } from '../../utils/audioChime';

interface NewOrderAlertModalProps {
  orders: Service[];
  isOpen: boolean;
  onClose: () => void;
  onViewOrder: (order: Service) => void;
  onAssignOrder?: (order: Service) => void;
}

export const NewOrderAlertModal: React.FC<NewOrderAlertModalProps> = ({
  orders,
  isOpen,
  onClose,
  onViewOrder,
  onAssignOrder
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copiedId, setCopiedId] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Play audio chime when modal opens with new orders
  useEffect(() => {
    if (isOpen && orders.length > 0 && soundEnabled) {
      playNewOrderChime(0.4);
    }
  }, [isOpen, orders.length, soundEnabled]);

  // Keep index in bounds if orders change
  useEffect(() => {
    if (currentIndex >= orders.length) {
      setCurrentIndex(Math.max(0, orders.length - 1));
    }
  }, [orders.length, currentIndex]);

  if (!isOpen || orders.length === 0) return null;

  const order = orders[currentIndex] || orders[0];
  const totalOrders = orders.length;

  const handleCopyId = () => {
    if (!order) return;
    const idToCopy = order.websiteOrderId || order.submissionId || order.id || '';
    navigator.clipboard.writeText(idToCopy).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => {});
  };

  const handleReplayChime = () => {
    playNewOrderChime(0.4);
  };

  const items: WebsiteOrderItem[] = order.websiteOrderItems && order.websiteOrderItems.length > 0
    ? order.websiteOrderItems
    : (order.serviceSelection || []).map((name, i) => ({
        id: i,
        orderId: order.submissionId,
        itemName: name,
        itemQuantity: 1,
        itemPrice: order.grandTotal || 0
      }));

  const customerName = `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim() || 'Valued Customer';
  const phoneClean = (order.mobileNumber || '').replace(/\D/g, '');
  const isOnlinePayment = (order.paymentMethod || '').toLowerCase().includes('online') || 
                          (order.paymentMethod || '').toLowerCase().includes('paid');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-300/40 dark:border-amber-500/30 overflow-hidden ring-1 ring-black/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-modal-title"
      >
        {/* Top Glowing Alert Banner */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white px-5 py-3.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-xs uppercase font-extrabold tracking-wider text-amber-100 flex items-center gap-1.5">
                <IconSparkles className="w-3.5 h-3.5 text-yellow-200" /> Live Website Order Alert
              </span>
              <h2 id="new-order-modal-title" className="text-base font-bold leading-tight">
                New Order Received from Website!
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReplayChime}
              title="Replay Alert Tone"
              className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
            >
              🔔
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
              aria-label="Close popup"
            >
              <IconX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Carousel indicator if multiple orders arrive */}
        {totalOrders > 1 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 font-medium">
            <span>
              Showing order <strong>{currentIndex + 1}</strong> of <strong>{totalOrders}</strong> new orders
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 disabled:opacity-40 hover:bg-amber-100 dark:hover:bg-amber-900 transition flex items-center gap-0.5 text-xs font-semibold"
              >
                <IconChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <button
                disabled={currentIndex === totalOrders - 1}
                onClick={() => setCurrentIndex(prev => Math.min(totalOrders - 1, prev + 1))}
                className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 disabled:opacity-40 hover:bg-amber-100 dark:hover:bg-amber-900 transition flex items-center gap-0.5 text-xs font-semibold"
              >
                Next <IconChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Order Details Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-slate-800 dark:text-slate-100">
          
          {/* Header & Order ID Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Website Order ID
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                  {order.websiteOrderId || order.submissionId}
                </span>
                <button
                  onClick={handleCopyId}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                  title="Copy Order ID"
                >
                  {copiedId ? <IconCheck className="w-3.5 h-3.5 text-emerald-600" /> : <IconCopy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Order Value
              </div>
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                ₹{Number(order.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Customer & Contact Row */}
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                {customerName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                  {customerName}
                </h3>
                <div className="text-xs text-blue-700 dark:text-blue-300 font-medium mt-0.5 flex items-center gap-1">
                  <span>📞 {order.mobileNumber || 'No phone provided'}</span>
                </div>
              </div>
            </div>

            {phoneClean && (
              <div className="flex items-center gap-1.5">
                <a
                  href={`tel:${phoneClean}`}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                >
                  <IconPhone className="w-3.5 h-3.5" /> Call
                </a>
                <a
                  href={`https://wa.me/91${phoneClean.slice(-10)}?text=${encodeURIComponent(`Hello ${customerName}, thank you for booking with A Big Engine! We have received your order #${order.websiteOrderId || order.submissionId}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                >
                  💬 WhatsApp
                </a>
              </div>
            )}
          </div>

          {/* Vehicle & Scheduled Slot Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Vehicle Card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <IconCar className="w-3.5 h-3.5 text-blue-500" /> Booked Vehicle
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {order.carBrandModel || 'Vehicle details pending'}
              </div>
              {order.carVersion && (
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Version: {order.carVersion}
                </div>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {order.carNumber && order.carNumber !== 'Pending Reg' && (
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px] font-mono font-semibold">
                    {order.carNumber}
                  </span>
                )}
                {order.vehicleCategoryTag && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
                    {order.vehicleCategoryTag}
                  </span>
                )}
              </div>
            </div>

            {/* Scheduled Slot Card */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                <IconCalendar className="w-3.5 h-3.5 text-purple-500" /> Booking Slot
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {order.scheduledDate ? new Date(order.scheduledDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Date not set'}
              </div>
              <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold mt-1 flex items-center gap-1">
                <IconClock className="w-3.5 h-3.5" />
                {order.scheduledTime || 'Standard Slot'}
              </div>
              {order.hubId && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Hub: <span className="font-mono">{order.hubId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Booked Line Items from Attachment Schema */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Booked Services & Items ({items.length})</span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Payment: <strong className={isOnlinePayment ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{order.paymentMethod || 'Cash on Delivery'}</strong>
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
              {items.map((item, idx) => (
                <div key={idx} className="p-2.5 sm:p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.itemThumbnailSrc ? (
                      <img 
                        src={item.itemThumbnailSrc} 
                        alt={item.itemName} 
                        className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-white"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold text-sm">
                        🚗
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {item.itemName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Qty: {item.itemQuantity || 1} {item.bookingTime ? `• Slot: ${item.bookingTime}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      ₹{Number(item.itemPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping / Doorstep Address */}
          {order.streetAddress && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
              <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                📍 Doorstep Service / Shipping Address
              </div>
              <div className="text-slate-800 dark:text-slate-200 leading-relaxed">
                {order.streetAddress}
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.streetAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open in Google Maps <IconExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

        </div>

        {/* Action Buttons Footer */}
        <div className="bg-slate-100 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700/80 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold text-xs transition"
          >
            Acknowledge & Dismiss
          </button>

          <div className="flex items-center gap-2">
            {onAssignOrder && (
              <button
                onClick={() => {
                  onClose();
                  onAssignOrder(order);
                }}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition shadow-sm flex items-center gap-1.5"
              >
                <IconUser className="w-3.5 h-3.5" /> Assign Agent
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onViewOrder(order);
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs transition shadow-md flex items-center gap-1.5"
            >
              View Order Details <IconChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default NewOrderAlertModal;
