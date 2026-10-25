import React, { useState } from 'react';
import { Service, User } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { IconBellRinging, IconPhone, IconCheck } from '../ui/Icon';
import { saveRecord } from '../../services/cloudDataService';
import { formatScheduledDate } from '../../utils/dateTimeUtils';
import { toast } from 'sonner';

interface NotifyCustomerModalProps {
  service: Service;
  currentUser: User;
  isOpen: boolean;
  onClose: () => void;
  onNotificationSent?: (updatedService: Service) => void;
}

export const NotifyCustomerModal: React.FC<NotifyCustomerModalProps> = ({
  service,
  currentUser,
  isOpen,
  onClose,
  onNotificationSent,
}) => {
  const [channel, setChannel] = useState<'SMS' | 'WhatsApp' | 'Email'>('WhatsApp');
  const [template, setTemplate] = useState<string>('scheduled');
  const [recipient, setRecipient] = useState<string>(service.mobileNumber || '');
  
  const orderNo = service.appointmentId?.split('-').pop() || service.submissionId.slice(-6).toUpperCase();
  const dateStr = service.scheduledDate ? formatScheduledDate(service) : 'Today';
  const timeStr = service.scheduledTime || '10:00 AM';

  const templatesMap: Record<string, string> = {
    scheduled: `Hello ${service.customerFirstName}, your service order #${orderNo} for ${service.carBrandModel} is scheduled for ${dateStr} at ${timeStr}.`,
    enroute: `Hello ${service.customerFirstName}, technician ${service.assignedTo || 'our team'} is en-route for order #${orderNo} (${service.carBrandModel}).`,
    in_progress: `Hello ${service.customerFirstName}, work has started on your ${service.carBrandModel} for order #${orderNo}.`,
    completed: `Hello ${service.customerFirstName}, your ${service.carBrandModel} service (Order #${orderNo}) is completed! Total amount: ₹${(service.grandTotal || 0).toFixed(2)}.`,
    custom: `Hello ${service.customerFirstName}, regarding your order #${orderNo}: `,
  };

  const [message, setMessage] = useState<string>(templatesMap.scheduled);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleTemplateChange = (tmplKey: string) => {
    setTemplate(tmplKey);
    setMessage(templatesMap[tmplKey] || templatesMap.custom);
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error('Please write a message to send');
      return;
    }

    setIsSending(true);
    try {
      // Append entry to statusHistory log
      const newHistoryLog = {
        status: service.status,
        timestamp: new Date().toISOString(),
        notes: `Customer notified via ${channel}: "${message}"`,
        updatedBy: currentUser.username || 'system',
      };

      const existingHistory = Array.isArray(service.statusHistory) ? service.statusHistory : [];
      const updatedService: Service = {
        ...service,
        statusHistory: [...existingHistory, newHistoryLog],
        timestamp: new Date().toISOString(),
      };

      // Save updated record
      await saveRecord('Submissions', updatedService, '');

      toast.success(`Notification sent to ${service.customerFirstName} via ${channel}!`, {
        description: `Logged in audit trail for Order #${orderNo}`,
      });

      if (onNotificationSent) {
        onNotificationSent(updatedService);
      }

      onClose();
    } catch (err: any) {
      toast.error('Failed to log notification');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-300 rounded-xl">
              <IconBellRinging className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Notify Customer
              </h3>
              <p className="text-xs text-slate-500">Order #{orderNo} • {service.customerFirstName} {service.customerLastName}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4">
          
          {/* Recipient Details */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs grid grid-cols-2 gap-2">
            <div>
              <span className="text-slate-400 block font-medium">Customer Name</span>
              <strong className="text-slate-800 dark:text-slate-200">{service.customerFirstName} {service.customerLastName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Phone Number</span>
              <strong className="text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <IconPhone className="w-3.5 h-3.5 text-emerald-500" />
                {service.mobileNumber || 'N/A'}
              </strong>
            </div>
          </div>

          {/* Delivery Channel Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
              Notification Channel
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['WhatsApp', 'SMS', 'Email'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                    channel === ch
                      ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Message Templates */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
              Quick Templates
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[
                { key: 'scheduled', label: '📅 Scheduled' },
                { key: 'enroute', label: '🚗 Tech En-Route' },
                { key: 'in_progress', label: '🔧 In Progress' },
                { key: 'completed', label: '✅ Ready/Done' },
                { key: 'custom', label: '✍️ Custom' },
              ].map((tmpl) => (
                <button
                  key={tmpl.key}
                  type="button"
                  onClick={() => handleTemplateChange(tmpl.key)}
                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border text-left transition-colors truncate ${
                    template === tmpl.key
                      ? 'bg-brand-blue/10 border-brand-blue text-brand-blue dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message Text Area */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Message Content
            </label>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 outline-none transition-all font-sans"
              placeholder="Type your notification message..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            onClick={handleSend} 
            disabled={isSending}
            className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold px-4 shadow-sm"
          >
            {isSending ? 'Sending...' : `Send via ${channel}`}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default NotifyCustomerModal;
