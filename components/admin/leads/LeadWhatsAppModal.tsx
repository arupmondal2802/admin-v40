import React, { useState } from 'react';
import { MessageSquare, Send, Copy, Check, X, Sparkles, Phone, User, Car } from 'lucide-react';
import { ServiceRequest } from '../../../types';
import { buildWhatsAppUrl, normalizePhoneNumber } from './leadUtils';

interface LeadWhatsAppModalProps {
  lead: ServiceRequest | null;
  onClose: () => void;
}

export const LeadWhatsAppModal: React.FC<LeadWhatsAppModalProps> = ({ lead, onClose }) => {
  const [templateType, setTemplateType] = useState<'GREETING' | 'QUOTE' | 'SCHEDULE' | 'CONFIRMATION'>('GREETING');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  if (!lead) return null;

  const phone = lead.customerPhone || (lead as any).mobileNumber || '';
  const cleanPhone = normalizePhoneNumber(phone);

  // Generate template text
  const generatedUrl = buildWhatsAppUrl(phone, templateType, lead);
  const rawGeneratedMessage = decodeURIComponent(generatedUrl.split('text=')[1] || '');
  const activeMessage = customMessage || rawGeneratedMessage;

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const finalUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(activeMessage)}`;
    window.open(finalUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
              <MessageSquare className="w-5 h-5 fill-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                WhatsApp Direct Outreach
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                  Verified Template
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                To: <span className="font-bold text-slate-800">{lead.customerName}</span> ({lead.customerPhone || 'No phone'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Context Pill */}
        <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Car className="w-4 h-4 text-indigo-500" />
            <span>{[lead.carBrand, lead.carModel].filter(Boolean).join(' ') || 'Vehicle Not Specified'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>{lead.requestedService || 'General Detailing'}</span>
          </div>
          {lead.totalAmount ? (
            <div className="font-mono font-bold text-emerald-700">
              ₹{lead.totalAmount.toLocaleString()}
            </div>
          ) : null}
        </div>

        {/* Template Selector Pills */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            Select Conversation Template:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'GREETING', label: '👋 Initial Greeting & Intro' },
              { id: 'QUOTE', label: '💰 Package Quotation' },
              { id: 'SCHEDULE', label: '📅 Booking Slot Selection' },
              { id: 'CONFIRMATION', label: '✅ Order Confirmation' }
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTemplateType(t.id as any);
                  setCustomMessage('');
                }}
                className={`p-2.5 rounded-xl text-xs font-extrabold text-left border transition-all cursor-pointer ${
                  templateType === t.id && !customMessage
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-500 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Message Content (Editable):
            </label>
            <button
              onClick={handleCopyMessage}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={activeMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 leading-relaxed font-sans"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSendWhatsApp}
            disabled={!cleanPhone}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-md transition-all active:scale-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Launch WhatsApp Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
};
