import React, { useState } from 'react';
import {
  X,
  Clock,
  FileText,
  Phone,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  User,
  Car,
  Check,
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { ServiceRequest } from '../../../types';
import { normalizePhoneNumber } from './leadUtils';

// ==========================================
// 1. Batch Snooze Modal
// ==========================================
interface LeadBatchSnoozeModalProps {
  selectedLeads: ServiceRequest[];
  onClose: () => void;
  onConfirmSnooze: (snoozeDate: string, snoozeNote: string) => void;
}

export const LeadBatchSnoozeModal: React.FC<LeadBatchSnoozeModalProps> = ({
  selectedLeads,
  onClose,
  onConfirmSnooze
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('tomorrow_10am');
  const [customDateTime, setCustomDateTime] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [snoozeNote, setSnoozeNote] = useState<string>('Customer requested follow-up call');

  const presets = [
    { id: '1_hour', label: 'In 1 Hour', timeDesc: 'Quick check-back today', getVal: () => {
      const d = new Date();
      d.setHours(d.getHours() + 1);
      return d.toISOString();
    }},
    { id: 'tomorrow_10am', label: 'Tomorrow at 10:00 AM', timeDesc: 'Next business morning', getVal: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      return d.toISOString();
    }},
    { id: '3_days', label: 'In 3 Days', timeDesc: 'Mid-week follow up', getVal: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(11, 0, 0, 0);
      return d.toISOString();
    }},
    { id: '1_week', label: 'In 1 Week', timeDesc: 'Next week reminder', getVal: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(10, 0, 0, 0);
      return d.toISOString();
    }},
    { id: 'custom', label: 'Custom Date & Time', timeDesc: 'Pick exact schedule', getVal: () => new Date(customDateTime).toISOString() }
  ];

  const handleApply = () => {
    let finalDateIso = '';
    const preset = presets.find(p => p.id === selectedPreset);
    if (selectedPreset === 'custom') {
      finalDateIso = new Date(customDateTime).toISOString();
    } else if (preset) {
      finalDateIso = preset.getVal();
    }
    onConfirmSnooze(finalDateIso, snoozeNote);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Clock className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900">Snooze & Schedule Follow-Up</h3>
              <p className="text-xs text-slate-500">
                Applying reminder to <strong>{selectedLeads.length}</strong> selected lead{selectedLeads.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets List */}
        <div className="space-y-2">
          <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
            Choose Snooze Preset
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presets.map(p => {
              const isSel = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPreset(p.id)}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSel 
                      ? 'bg-amber-50/70 border-amber-400 text-amber-950 ring-2 ring-amber-300/40' 
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="font-extrabold text-xs">{p.label}</span>
                  <span className="text-[10px] text-slate-500">{p.timeDesc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Date Time Picker if selected */}
        {selectedPreset === 'custom' && (
          <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 space-y-1">
            <label className="block text-xs font-bold text-slate-700">Select Date & Time</label>
            <input
              type="datetime-local"
              value={customDateTime}
              onChange={(e) => setCustomDateTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}

        {/* Optional Snooze Note */}
        <div className="space-y-1">
          <label className="block text-xs font-bold text-slate-700">Follow-Up Note / Action</label>
          <input
            type="text"
            value={snoozeNote}
            onChange={(e) => setSnoozeNote(e.target.value)}
            placeholder="e.g. Call back regarding quote discount..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Confirm Snooze ({selectedLeads.length})
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. Batch Add Note Modal
// ==========================================
interface LeadBatchNoteModalProps {
  selectedLeads: ServiceRequest[];
  onClose: () => void;
  onConfirmAddNote: (note: string, mode: 'append' | 'replace') => void;
}

export const LeadBatchNoteModal: React.FC<LeadBatchNoteModalProps> = ({
  selectedLeads,
  onClose,
  onConfirmAddNote
}) => {
  const [noteContent, setNoteContent] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');

  const handleApply = () => {
    if (!noteContent.trim()) return;
    onConfirmAddNote(noteContent.trim(), mode);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-200">
              <FileText className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900">Add Batch Note / Activity</h3>
              <p className="text-xs text-slate-500">
                Updating remarks for <strong>{selectedLeads.length}</strong> selected lead{selectedLeads.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Note / Remarks Content
            </label>
            <textarea
              rows={4}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="e.g. Spoke to customer; requested inspection on Saturday morning. Sent WhatsApp catalog."
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
            />
          </div>

          <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <span className="font-bold text-slate-700">Save Mode:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="noteMode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
                className="text-sky-600 focus:ring-sky-500"
              />
              <span className="text-slate-700 font-semibold">Append with Timestamp</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="noteMode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
                className="text-sky-600 focus:ring-sky-500"
              />
              <span className="text-slate-700 font-semibold">Replace Existing</span>
            </label>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!noteContent.trim()}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Save Note to Leads
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. Batch Call Queue Modal
// ==========================================
interface LeadBatchCallModalProps {
  selectedLeads: ServiceRequest[];
  onClose: () => void;
  onUpdateLeadStatus: (leadId: string, newStatus: string, remarkNote: string) => void;
}

export const LeadBatchCallModal: React.FC<LeadBatchCallModalProps> = ({
  selectedLeads,
  onClose,
  onUpdateLeadStatus
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [callNotes, setCallNotes] = useState('');

  const currentLead = selectedLeads[currentIndex] || selectedLeads[0];
  const cleanPhone = currentLead ? normalizePhoneNumber(currentLead.customerPhone || (currentLead as any).mobileNumber) : '';

  const handleLogOutcome = (status: 'CONTACTED' | 'FOLLOW UP' | 'HIGH INTENT' | 'NOT CONTACTABLE') => {
    if (!currentLead) return;
    const finalRemark = callNotes.trim() ? `[Call Log]: ${callNotes.trim()}` : `[Call Log: Marked as ${status}]`;
    onUpdateLeadStatus(currentLead.id, status, finalRemark);
    setCallNotes('');

    if (currentIndex < selectedLeads.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn space-y-5">
        {/* Header with Queue Progress */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Phone className="w-5 h-5 animate-pulse" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900">CRM Dialer & Call Queue</h3>
              <p className="text-xs text-slate-500">
                Lead <strong>{currentIndex + 1}</strong> of <strong>{selectedLeads.length}</strong>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Lead Dial Card */}
        {currentLead && (
          <div className="p-5 bg-gradient-to-br from-indigo-50/60 to-slate-50 rounded-2xl border border-indigo-100 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-lg font-black text-slate-900">{currentLead.customerName}</h4>
                <p className="text-xs font-semibold text-slate-500">{currentLead.requestedService || 'General Inquiry'}</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-100 text-indigo-800">
                {currentLead.source}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <p className="text-[10px] font-extrabold uppercase text-slate-400">Phone Number</p>
                <p className="text-sm font-black text-slate-900 font-mono mt-0.5">{cleanPhone || 'No Phone'}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <p className="text-[10px] font-extrabold uppercase text-slate-400">Car Details</p>
                <p className="text-xs font-bold text-slate-800 mt-0.5">
                  {[currentLead.carBrand, currentLead.carModel].filter(Boolean).join(' ') || 'Not specified'}
                </p>
              </div>
            </div>

            {/* Direct Trigger Dial Button */}
            {cleanPhone ? (
              <a
                href={`tel:${cleanPhone}`}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
              >
                <Phone className="w-4 h-4 fill-white" />
                <span>Dial {cleanPhone} Now</span>
              </a>
            ) : (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs font-bold text-center">
                No phone number available for this contact.
              </div>
            )}

            {/* Call Outcome Note */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">Call Notes</label>
              <input
                type="text"
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                placeholder="Log customer remarks..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Outcome Disposition Buttons */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Log Call Outcome & Next</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handleLogOutcome('CONTACTED')}
                  className="px-2.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-bold text-xs rounded-xl transition-all"
                >
                  Connected
                </button>
                <button
                  type="button"
                  onClick={() => handleLogOutcome('FOLLOW UP')}
                  className="px-2.5 py-2 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-700 font-bold text-xs rounded-xl transition-all"
                >
                  Follow-Up
                </button>
                <button
                  type="button"
                  onClick={() => handleLogOutcome('HIGH INTENT')}
                  className="px-2.5 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl transition-all"
                >
                  Hot Lead
                </button>
                <button
                  type="button"
                  onClick={() => handleLogOutcome('NOT CONTACTABLE')}
                  className="px-2.5 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 font-bold text-xs rounded-xl transition-all"
                >
                  No Answer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Footer */}
        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex(p => Math.max(0, p - 1))}
            disabled={currentIndex === 0}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40 rounded-xl"
          >
            ← Previous
          </button>

          <span className="text-xs text-slate-500 font-semibold font-mono">
            {currentIndex + 1} / {selectedLeads.length}
          </span>

          <button
            onClick={() => setCurrentIndex(p => Math.min(selectedLeads.length - 1, p + 1))}
            disabled={currentIndex >= selectedLeads.length - 1}
            className="px-3.5 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 rounded-xl flex items-center gap-1"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
