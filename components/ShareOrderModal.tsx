import React, { useState } from 'react';
import { Service } from '../types';
import Button from './ui/Button';
import { IconX, IconCheck, IconShare, IconDownload } from './ui/Icon';
import { parseDateTime } from '../utils/dateTimeUtils';

interface ShareOrderModalProps {
  service: Service;
  onClose: () => void;
}

const cleanSelectionArray = (arr: any): string[] => {
  if (!arr) return [];
  if (typeof arr === 'string') {
    const trimmed = arr.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return cleanSelectionArray(parsed);
      } catch { }
    }
    return trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
  }
  if (!Array.isArray(arr)) return [];
  const cleaned: string[] = [];
  arr.forEach(item => {
    if (typeof item === 'string') {
      try {
        if (item.startsWith('[') && item.endsWith(']')) {
          const parsed = JSON.parse(item);
          if (Array.isArray(parsed)) cleaned.push(...cleanSelectionArray(parsed));
          else if (parsed) cleaned.push(String(parsed));
        } else if (item) cleaned.push(item);
      } catch { if (item) cleaned.push(item); }
    } else if (item) {
      cleaned.push(String(item));
    }
  });
  return [...new Set(cleaned)].filter(Boolean);
};

export const ShareOrderModal: React.FC<ShareOrderModalProps> = ({ service, onClose }) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [copyTrackerStatus, setCopyTrackerStatus] = useState<'idle' | 'copied'>('idle');

  const cleanedServiceSelection = cleanSelectionArray(service.serviceSelection);
  if (service.carWashDetails && !cleanedServiceSelection.includes('Car Washing')) {
    cleanedServiceSelection.push('Car Washing');
  }
  if (service.carCareDetails && !cleanedServiceSelection.includes('Car Care')) {
    cleanedServiceSelection.push('Car Care');
  }

  // ── Build line items ─────────────────────────────────────────────────────
  type LineItem = { label: string; detail?: string; amount: number };
  const lineItems: LineItem[] = [];

  if (cleanedServiceSelection.includes('Car Washing') && service.carWashDetails) {
    lineItems.push({ label: 'Car Washing', detail: service.carWashDetails.washType, amount: service.carWashDetails.price || 0 });
  }
  if (cleanedServiceSelection.includes('Car Care') && service.carCareDetails) {
    lineItems.push({ label: 'Car Care', detail: service.carCareDetails.careType, amount: service.carCareDetails.price || 0 });
  }
  if (cleanedServiceSelection.includes('Tyre Replacement')) {
    lineItems.push({ label: 'Tyre Replacement', detail: `Qty: ${service.tyreReplacementQuantity}`, amount: service.tyreReplacementTotalAmount });
  }
  if (cleanedServiceSelection.includes('Battery Replacement')) {
    lineItems.push({ label: 'Battery Replacement', amount: service.batteryReplacementTotalAmount });
  }
  (service.dynamicAddons || []).filter(a => a.quantity > 0).forEach(a => {
    lineItems.push({ label: a.name, detail: `×${a.quantity}`, amount: a.quantity * a.price });
  });
  (service.categorizedAddons || []).filter(a => a.quantity > 0 && a.productName).forEach(a => {
    lineItems.push({ label: a.productName, detail: `×${a.quantity}`, amount: a.quantity * a.amount });
  });
  (service.customServices || []).filter(cs => cs.serviceDescription).forEach(cs => {
    lineItems.push({ label: cs.serviceDescription, amount: cs.amount });
  });
  if (service.travelCharge && service.travelCharge > 0) {
    lineItems.push({ label: 'Doorstep Travel Charge', amount: service.travelCharge });
  }

  // Add any service from cleanedServiceSelection that isn't already included in lineItems
  cleanedServiceSelection.forEach(srv => {
    if (srv !== 'Add-ons' && !lineItems.some(li => li.label === srv)) {
      lineItems.push({ label: srv, amount: 0 });
    }
  });

  // Normalize the date: use parseDateTime to robustly handle scheduledDate without timezone shifts
  const parsedDate = parseDateTime(service) || (service.timestamp ? new Date(service.timestamp) : null);
  const formattedDate = parsedDate && !isNaN(parsedDate.getTime())
    ? parsedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Date not set';
  const rawDateStr = service.scheduledDate || service.timestamp || '';

  let displayTime = service.scheduledTime || '';
  if (!displayTime && rawDateStr.includes('T')) {
    const timePart = rawDateStr.split('T')[1];
    if (timePart && timePart.length >= 5) {
      displayTime = timePart.slice(0, 5);
    }
  }

  const orderNo = service.appointmentId?.split('-').pop() || service.submissionId?.slice(-6);

  const agents = [service.assignedTo, service.secondaryAssignee].filter(Boolean).join(' & ') || 'Not assigned';

  const trackId = service.submissionId || service.appointmentId || '';
  const trackingUrl = `${window.location.origin}/?track=${encodeURIComponent(trackId)}`;

  // ── WhatsApp-friendly plain text ─────────────────────────────────────────
  const shareText = [
    `🚗 *A Big Engine — Service Order #${orderNo}*`,
    ``,
    `📅 *Date & Time:* ${formattedDate}${displayTime ? ` (${displayTime})` : ''}`,
    `👤 *Customer:* ${service.customerFirstName} ${service.customerLastName}`,
    `📞 *Mobile:* ${service.mobileNumber}`,
    service.streetAddress ? `📍 *Address:* ${service.streetAddress}` : null,
    `🚘 *Vehicle:* ${service.carBrandModel} (${service.carNumber})`,
    service.vehicleCategoryTag ? `   Category: ${service.vehicleCategoryTag}` : null,
    ``,
    `🔧 *Services:*`,
    ...lineItems.map(li => `  • ${li.label}${li.detail ? ` (${li.detail})` : ''}${li.amount > 0 ? ` — ₹${li.amount.toFixed(2)}` : ' (Predefined / Included)'}`),
    lineItems.length === 0 ? `  No chargeable services recorded.` : null,
    ``,
    `💰 *Grand Total: ₹${service.grandTotal.toFixed(2)}*`,
    service.paymentMode ? `   Payment: ${service.paymentMode}` : null,
    ``,
    `🔧 *Technician:* ${agents}`,
    ``,
    `🔗 *Live Doorstep Service Tracker:*`,
    trackingUrl,
  ].filter(Boolean).join('\n');

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2500);
      if (navigator.share) {
        await navigator.share({ title: `Service Order #${orderNo}`, text: shareText });
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        alert('Copied to clipboard. You can now paste it into WhatsApp or any messenger.');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 p-4 pt-6 sm:pt-4 modal-backdrop" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[92vh] modal-content overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-brand-blue to-brand-blue/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-white font-bold text-base">Service Order #{orderNo}</h3>
            <p className="text-blue-200 text-xs mt-0.5">{formattedDate}{displayTime ? ` · ${displayTime}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30">
            <IconX className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Scheduled Date — prominent row */}
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
            <span className="text-lg">📅</span>
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Scheduled Date & Time</p>
              <p className="font-semibold text-slate-800 text-sm">{formattedDate}{displayTime ? ` · ${displayTime}` : ''}</p>
            </div>
          </div>

          {/* Customer + Vehicle */}
          <div className="px-5 py-4 border-b border-slate-100 space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</p>
                <p className="font-semibold text-slate-800 text-sm">{service.customerFirstName} {service.customerLastName}</p>
                <p className="text-xs text-slate-500">{service.mobileNumber}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vehicle</p>
                <p className="font-semibold text-slate-800 text-sm">{service.carBrandModel}</p>
                <p className="text-xs text-slate-500">{service.carNumber}{service.vehicleCategoryTag ? ` · ${service.vehicleCategoryTag}` : ''}</p>
              </div>
            </div>
            {service.streetAddress && (
              <div className="mt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Address</p>
                <p className="text-xs text-slate-600">{service.streetAddress}</p>
              </div>
            )}
          </div>

          {/* Services */}
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Services</p>
            {lineItems.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No chargeable services recorded.</p>
            ) : (
              <div className="space-y-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-slate-700">{li.label}</span>
                      {li.detail && <span className="ml-1 text-xs text-slate-400">({li.detail})</span>}
                    </div>
                    {li.amount > 0 ? (
                      <span className="text-sm font-semibold text-slate-800">₹{li.amount.toFixed(2)}</span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">Predefined / Included</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total + Payment */}
          <div className="px-5 py-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">Grand Total</span>
              <span className="text-2xl font-black text-brand-blue">₹{service.grandTotal.toFixed(2)}</span>
            </div>
            {service.paymentMode && (
              <p className="text-xs text-slate-500 mt-1 text-right">
                Payment: {service.paymentMode}
                {service.paymentMode === 'Both' && service.cashAmount && service.onlineAmount
                  ? ` (Cash ₹${service.cashAmount} + Online ₹${service.onlineAmount})`
                  : ''}
              </p>
            )}
          </div>

          {/* Technician */}
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Technician</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{agents}</p>
          </div>

          {/* Customer Live Tracker Link */}
          <div className="px-5 py-4 bg-blue-50/40 border-b border-slate-100">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping shrink-0" />
              <p className="text-[10px] font-bold text-brand-blue uppercase tracking-wider">
                Customer Live Tracker Link
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                readOnly 
                value={trackingUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 text-[11px] bg-white border border-slate-200 rounded px-2 py-1.5 text-slate-600 font-mono select-all focus:outline-none"
              />
              <button 
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(trackingUrl);
                    setCopyTrackerStatus('copied');
                    setTimeout(() => setCopyTrackerStatus('idle'), 2000);
                  } catch (err) {
                    console.warn('Failed to copy tracker link:', err);
                  }
                }}
                className="px-3 py-1.5 bg-brand-blue hover:bg-brand-blue/95 text-white rounded text-[11px] font-bold transition-all shrink-0"
              >
                {copyTrackerStatus === 'copied' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Share this secure link with the customer to track their doorstep service lifecycle, technician progress, and estimated arrival time in real-time.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3 flex-shrink-0 bg-white">
          <Button variant="ghost" onClick={onClose} className="flex-1">Close</Button>
          <Button onClick={handleShare} className="flex-1">
            {copyStatus === 'copied'
              ? <><IconCheck className="w-4 h-4 mr-2" /> Copied!</>
              : <><IconShare className="w-4 h-4 mr-2" /> Share</>}
          </Button>
        </div>
      </div>
    </div>
  );
};
