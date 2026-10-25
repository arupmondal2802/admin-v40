import React, { useState } from 'react';
import { User, RetentionActivityLog } from '../../../types';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import {
    IconX, IconPhone, IconCheck, IconCalendar, IconUser, IconSparkles, IconShare, IconClipboardList
} from '../../ui/Icon';

export interface CustomerFollowUpTarget {
    customerName: string;
    customerPhone: string;
    carNumber?: string;
    carBrandModel?: string;
    customerEmail?: string;
    streetAddress?: string;
    dueService?: string;
    daysOverdue?: number;
    daysSinceLast?: number;
}

interface FollowUpLoggerModalProps {
    isOpen: boolean;
    onClose: () => void;
    target: CustomerFollowUpTarget | null;
    currentUser?: User;
    users?: User[];
    onSaveLog: (log: RetentionActivityLog) => void;
    onOpenBookingModal: (target: CustomerFollowUpTarget) => void;
}

export const FollowUpLoggerModal: React.FC<FollowUpLoggerModalProps> = ({
    isOpen,
    onClose,
    target,
    currentUser,
    users = [],
    onSaveLog,
    onOpenBookingModal,
}) => {
    const [actionType, setActionType] = useState<'CALL' | 'WHATSAPP' | 'EMAIL' | 'CAMPAIGN' | 'FOLLOWUP_SCHEDULED'>('CALL');
    const [outcome, setOutcome] = useState<'INTERESTED' | 'BOOKED' | 'NO_ANSWER' | 'CALLBACK_REQUESTED' | 'NOT_INTERESTED' | 'DISCOUNT_SENT'>('INTERESTED');
    const [notes, setNotes] = useState('');
    const [nextFollowUpDate, setNextFollowUpDate] = useState('');
    const [promoCodeUsed, setPromoCodeUsed] = useState('RETAIN15');
    const [assignedAgent, setAssignedAgent] = useState(currentUser?.username || '');
    const [isSaved, setIsSaved] = useState(false);

    if (!isOpen || !target) return null;

    const defaultWhatsAppMessage = `Hello ${target.customerName}! 👋 Greetings from Big Engine Service. It's been ${target.daysSinceLast || target.daysOverdue || 30} days since your last visit with your ${target.carBrandModel || 'car'}. Your ${target.dueService || 'service'} is due! Claim 15% OFF today with code ${promoCodeUsed}. Would you like us to reserve a slot for you?`;

    const handleWhatsAppClick = () => {
        const text = encodeURIComponent(defaultWhatsAppMessage);
        const cleanPhone = String(target.customerPhone || '').replace(/\D/g, '');
        const url = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${text}`;
        window.open(url, '_blank');
        setActionType('WHATSAPP');
        setOutcome('DISCOUNT_SENT');
    };

    const handleCallClick = () => {
        window.open(`tel:${target.customerPhone}`, '_self');
        setActionType('CALL');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const log: RetentionActivityLog = {
            id: `ret_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            customerPhone: target.customerPhone,
            customerName: target.customerName,
            carNumber: target.carNumber,
            carBrandModel: target.carBrandModel,
            agentUsername: assignedAgent || currentUser?.username || 'system',
            actionType,
            outcome,
            notes: notes.trim() || `Follow-up conducted via ${actionType}. Outcome: ${outcome}.`,
            nextFollowUpDate: nextFollowUpDate || undefined,
            promoCodeUsed: promoCodeUsed || undefined,
            dueService: target.dueService,
        };

        onSaveLog(log);
        setIsSaved(true);

        if (outcome === 'BOOKED') {
            setTimeout(() => {
                onClose();
                onOpenBookingModal(target);
            }, 600);
        } else {
            setTimeout(() => {
                onClose();
            }, 600);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden modal-content max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="p-2.5 bg-brand-blue/30 rounded-xl border border-brand-blue/50 text-brand-blue">
                            <IconPhone className="w-6 h-6 text-sky-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-white">Log Retention Follow-Up Activity</h3>
                            <p className="text-xs text-slate-300">Record sales interaction, outcome & schedule next touchpoint</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                        <IconX className="w-5 h-5" />
                    </button>
                </div>

                {/* Customer Snapshot */}
                <div className="p-4 bg-sky-50/80 border-b border-sky-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
                    <div>
                        <span className="font-bold text-slate-800 text-sm">{target.customerName}</span>
                        <span className="ml-2 font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">📞 {target.customerPhone}</span>
                        {target.carBrandModel && (
                            <span className="ml-2 font-medium text-sky-800 bg-sky-100 px-2 py-0.5 rounded">
                                🚗 {target.carBrandModel} ({target.carNumber || 'No Plate'})
                            </span>
                        )}
                    </div>
                    {target.dueService && (
                        <div className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full font-bold text-[11px] flex items-center gap-1 border border-amber-200">
                            <IconSparkles className="w-3.5 h-3.5 text-amber-600" />
                            Due: {target.dueService} {target.daysOverdue ? `(${target.daysOverdue} days overdue)` : ''}
                        </div>
                    )}
                </div>

                {/* Quick Touchpoint Bar */}
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <span className="text-xs font-bold text-slate-600">Quick Contact Actions:</span>
                    <div className="flex items-center space-x-2">
                        <Button size="sm" variant="secondary" onClick={handleCallClick} className="text-xs">
                            <IconPhone className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Call Now
                        </Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs" onClick={handleWhatsAppClick}>
                            <IconShare className="w-3.5 h-3.5 mr-1" />
                            WhatsApp Promo
                        </Button>
                        <Button size="sm" className="bg-brand-blue hover:bg-brand-blue/90 text-white text-xs" onClick={() => onOpenBookingModal(target)}>
                            <IconCalendar className="w-3.5 h-3.5 mr-1" />
                            Direct Book
                        </Button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
                    {/* Channel & Agent */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Communication Channel</label>
                            <select
                                value={actionType}
                                onChange={(e) => setActionType(e.target.value as any)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white font-semibold text-slate-700"
                            >
                                <option value="CALL">📞 Phone Call</option>
                                <option value="WHATSAPP">💬 WhatsApp Message</option>
                                <option value="EMAIL">✉️ Email Outreach</option>
                                <option value="CAMPAIGN">📢 Targeted Campaign</option>
                                <option value="FOLLOWUP_SCHEDULED">📅 Scheduled Check-in</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Sales Agent / Logger</label>
                            <select
                                value={assignedAgent}
                                onChange={(e) => setAssignedAgent(e.target.value)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white font-semibold text-slate-700"
                            >
                                {users.length > 0 ? (
                                    users.map(u => (
                                        <option key={u.username} value={u.username}>{u.username} ({u.role})</option>
                                    ))
                                ) : (
                                    <option value={currentUser?.username || 'agent'}>{currentUser?.username || 'Current Agent'}</option>
                                )}
                            </select>
                        </div>
                    </div>

                    {/* Interaction Outcome */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Interaction Outcome</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                                { id: 'INTERESTED', label: '🟢 Interested (General)', bg: 'bg-emerald-50 border-emerald-300 text-emerald-800' },
                                { id: 'BOOKED', label: '🎉 Booked Service Now', bg: 'bg-sky-50 border-sky-300 text-sky-800 font-bold' },
                                { id: 'CALLBACK_REQUESTED', label: '⏳ Callback Requested', bg: 'bg-amber-50 border-amber-300 text-amber-800' },
                                { id: 'DISCOUNT_SENT', label: '📩 Offer / Code Sent', bg: 'bg-purple-50 border-purple-300 text-purple-800' },
                                { id: 'NO_ANSWER', label: '📞 No Answer / Busy', bg: 'bg-slate-50 border-slate-300 text-slate-700' },
                                { id: 'NOT_INTERESTED', label: '🔴 Not Interested / Sold', bg: 'bg-rose-50 border-rose-300 text-rose-800' },
                            ].map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setOutcome(item.id as any)}
                                    className={`p-2 rounded-lg border text-xs text-left transition-all flex items-center justify-between ${
                                        outcome === item.id ? `${item.bg} ring-2 ring-brand-blue font-bold shadow-xs` : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>{item.label}</span>
                                    {outcome === item.id && <IconCheck className="w-3.5 h-3.5 shrink-0 ml-1" />}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Promo Code & Next Follow-Up */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Promo Discount Code Offered</label>
                            <input
                                type="text"
                                value={promoCodeUsed}
                                onChange={(e) => setPromoCodeUsed(e.target.value)}
                                placeholder="e.g. RETAIN15"
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent uppercase font-mono bg-white font-bold text-slate-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Next Follow-Up Date (Optional)</label>
                            <input
                                type="date"
                                value={nextFollowUpDate}
                                onChange={(e) => setNextFollowUpDate(e.target.value)}
                                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white font-medium text-slate-700"
                            />
                        </div>
                    </div>

                    {/* Agent Notes */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Detailed Follow-Up Notes</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="e.g. Called customer. Mentioned oil change & polishing due. Customer agreed to 15% discount code and requested appointment on Saturday..."
                            className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-accent bg-white text-slate-800"
                        />
                    </div>

                    {isSaved && (
                        <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-lg text-xs text-emerald-900 font-bold flex items-center gap-2">
                            <IconCheck className="w-4 h-4 text-emerald-700" />
                            Follow-Up Activity Log Saved & Synced to Cloud CRM!
                        </div>
                    )}

                    {/* Footer buttons */}
                    <div className="pt-3 border-t border-slate-200 flex justify-end space-x-3">
                        <Button type="button" variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold">
                            <IconClipboardList className="w-4 h-4 mr-1.5" />
                            Save Activity Log
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default FollowUpLoggerModal;
