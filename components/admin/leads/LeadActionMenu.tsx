import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  Phone,
  ShoppingCart,
  Clock,
  FileText,
  MessageSquare,
  Sparkles,
  User,
  Settings,
  ChevronRight
} from 'lucide-react';
import { ServiceRequest } from '../../../types';
import { normalizePhoneNumber } from './leadUtils';

interface LeadActionMenuProps {
  lead: ServiceRequest;
  onCall?: (lead: ServiceRequest) => void;
  onConvertToOrder?: (lead: ServiceRequest) => void;
  onSnooze?: (lead: ServiceRequest) => void;
  onAddNote?: (lead: ServiceRequest) => void;
  onOpenWhatsApp?: (lead: ServiceRequest) => void;
  onViewDetails?: (lead: ServiceRequest) => void;
}

export const LeadActionMenu: React.FC<LeadActionMenuProps> = ({
  lead,
  onCall,
  onConvertToOrder,
  onSnooze,
  onAddNote,
  onOpenWhatsApp,
  onViewDetails
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cleanPhone = normalizePhoneNumber(lead.customerPhone || (lead as any).mobileNumber);

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(prev => !prev);
        }}
        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
        title="Salesforce Action Menu"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 tracking-wider">
            Salesforce Actions
          </div>

          {/* 1. Call */}
          {cleanPhone ? (
            <a
              href={`tel:${cleanPhone}`}
              onClick={() => {
                setIsOpen(false);
                if (onCall) onCall(lead);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-semibold transition-colors"
            >
              <Phone className="w-3.5 h-3.5 text-indigo-600" />
              <span>Call ({cleanPhone})</span>
            </a>
          ) : (
            <button
              onClick={() => {
                setIsOpen(false);
                if (onCall) onCall(lead);
              }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-semibold transition-colors cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-indigo-600" />
              <span>Call Customer</span>
            </button>
          )}

          {/* 2. Convert to Order */}
          <button
            onClick={() => {
              setIsOpen(false);
              if (onConvertToOrder) onConvertToOrder(lead);
            }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 font-semibold transition-colors cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
            <span>Convert to Order</span>
          </button>

          {/* 3. Snooze */}
          <button
            onClick={() => {
              setIsOpen(false);
              if (onSnooze) onSnooze(lead);
            }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-amber-50 hover:text-amber-700 font-semibold transition-colors cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Snooze / Follow-Up</span>
          </button>

          {/* 4. Add Note */}
          <button
            onClick={() => {
              setIsOpen(false);
              if (onAddNote) onAddNote(lead);
            }}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-sky-50 hover:text-sky-700 font-semibold transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-sky-600" />
            <span>Add Note / Remarks</span>
          </button>

          {/* 5. WhatsApp if available */}
          {cleanPhone && onOpenWhatsApp && (
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenWhatsApp(lead);
              }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 font-semibold transition-colors cursor-pointer border-t border-slate-100"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>WhatsApp Message</span>
            </button>
          )}

          {/* 6. View Details */}
          {onViewDetails && (
            <button
              onClick={() => {
                setIsOpen(false);
                onViewDetails(lead);
              }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-colors cursor-pointer border-t border-slate-100"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>View Full Lifecycle</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
