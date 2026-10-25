import React, { useState, useMemo } from 'react';
import { RetentionActivityLog } from '../../../types';
import Button from '../../ui/Button';
import {
    IconX, IconUser, IconPhone, IconMapPin, IconCalendar,
    IconCheck, IconClock, IconSparkles, IconCreditCard,
    IconPhone as IconCall, IconShare, IconAlertTriangle, IconUserCheck, IconTag
} from '../../ui/Icon';

export interface CustomerTimelineModalProps {
    isOpen: boolean;
    onClose: () => void;
    customerProfile: {
        mobileNumber: string;
        firstName?: string;
        lastName?: string;
        carBrandModel?: string;
        carNumber?: string;
        streetAddress?: string;
        lastVisit?: Date;
        visitCount?: number;
        totalSpend?: number;
        churnRisk?: 'Low' | 'Medium' | 'High';
        churnScore?: number;
        daysSinceLast?: number;
        servicesUsed?: Set<string> | string[];
        visits?: any[];
    } | null;
    allSubmissions: any[];
    retentionLogs: RetentionActivityLog[];
    allProfiles?: any[];
    onSelectCustomer?: (profile: any) => void;
    onOpenFollowUpModal?: (target: any) => void;
    onOpenBookingModal?: (target: any) => void;
}

export const CustomerTimelineModal: React.FC<CustomerTimelineModalProps> = ({
    isOpen,
    onClose,
    customerProfile,
    allSubmissions = [],
    retentionLogs = [],
    allProfiles = [],
    onSelectCustomer,
    onOpenFollowUpModal,
    onOpenBookingModal,
}) => {
    const [searchCustomerQuery, setSearchCustomerQuery] = useState('');

    const profile = customerProfile;
    const phone = profile?.mobileNumber || '';

    // Submissions / visits for this customer
    const customerSubmissions = useMemo(() => {
        if (!phone) return [];
        return allSubmissions.filter(s => {
            const sPhone = String(s.mobileNumber || s.phone || '').trim();
            return sPhone && (sPhone === phone || sPhone.includes(phone) || phone.includes(sPhone));
        }).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    }, [allSubmissions, phone]);

    // Retention call logs for this customer
    const customerLogs = useMemo(() => {
        if (!phone) return [];
        return retentionLogs.filter(l => {
            const lPhone = String(l.customerPhone || '').trim();
            return lPhone && (lPhone === phone || lPhone.includes(phone) || phone.includes(lPhone));
        }).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    }, [retentionLogs, phone]);

    // Combined Chronological Timeline Events
    const timelineEvents = useMemo(() => {
        const events: Array<{
            id: string;
            type: 'SERVICE_BOOKING' | 'FOLLOWUP_LOG' | 'CAMPAIGN_OFFER' | 'RECONVERTED';
            date: Date;
            title: string;
            description: string;
            badgeText: string;
            badgeColor: string;
            icon: 'service' | 'phone' | 'offer' | 'check';
            details: any;
        }> = [];

        // Add service bookings
        customerSubmissions.forEach(sub => {
            const date = new Date(sub.timestamp || Date.now());
            events.push({
                id: `sub-${sub.id || Math.random()}`,
                type: 'SERVICE_BOOKING',
                date,
                title: `Service Order: ${sub.serviceSelection || 'Vehicle Service'}`,
                description: `Completed at ${sub.selectedHub || 'Main Workshop'}. Vehicle: ${sub.carBrandModel || 'Car'} (${sub.carNumber || 'N/A'})`,
                badgeText: `₹${Number(sub.grandTotal || sub.totalAmount || 0).toLocaleString()}`,
                badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                icon: 'service',
                details: sub,
            });
        });

        // Add retention activity logs
        customerLogs.forEach(log => {
            const date = new Date(log.timestamp || Date.now());
            const isBooking = log.outcome === 'BOOKED' || log.actionType === 'BOOKING_CREATED';
            events.push({
                id: `log-${log.id}`,
                type: isBooking ? 'RECONVERTED' : 'FOLLOWUP_LOG',
                date,
                title: `Follow-Up Call (${log.actionType.replace('_', ' ')})`,
                description: `Logged by agent @${log.agentUsername || 'system'}. Outcome: "${log.outcome}". ${log.notes ? `Notes: ${log.notes}` : ''}`,
                badgeText: log.outcome,
                badgeColor: isBooking
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : log.outcome === 'CALLBACK_REQUESTED'
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : log.outcome === 'NOT_INTERESTED'
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200',
                icon: isBooking ? 'check' : 'phone',
                details: log,
            });

            if (log.outcome === 'DISCOUNT_SENT' || (log.notes && String(log.notes).toLowerCase().includes('coupon'))) {
                events.push({
                    id: `promo-${log.id}`,
                    type: 'CAMPAIGN_OFFER',
                    date: new Date(date.getTime() + 1000),
                    title: `Promo Coupon Dispatched`,
                    description: `Promo / Retention Offer sent during outreach. ${log.notes || ''}`,
                    badgeText: 'Offer Sent',
                    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
                    icon: 'offer',
                    details: log,
                });
            }
        });

        return events.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, [customerSubmissions, customerLogs]);

    // Customer search dropdown for switching customer
    const filteredProfiles = useMemo(() => {
        if (!searchCustomerQuery.trim()) return allProfiles.slice(0, 8);
        const q = searchCustomerQuery.toLowerCase();
        return allProfiles.filter(p => {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
            const pPhone = String(p.mobileNumber || '');
            const car = String(p.carBrandModel || '').toLowerCase();
            return name.includes(q) || pPhone.includes(q) || car.includes(q);
        }).slice(0, 10);
    }, [allProfiles, searchCustomerQuery]);

    if (!isOpen) return null;

    const handleWhatsApp = () => {
        if (!phone) return;
        const cleanPhone = phone.replace(/\D/g, '');
        const msg = encodeURIComponent(`Hello ${profile?.firstName || 'Customer'}, following up from Big Engine Service regarding your ${profile?.carBrandModel || 'vehicle'}. How can we assist you today?`);
        window.open(`https://wa.me/91${cleanPhone}?text=${msg}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="bg-slate-900 text-white p-5 flex items-center justify-between flex-wrap gap-3 border-b border-slate-800">
                    <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-blue to-cyan-500 text-white flex items-center justify-center font-black text-xl shadow-md">
                            {profile?.firstName ? profile.firstName.charAt(0).toUpperCase() : <IconUser className="w-6 h-6" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black tracking-tight text-white">
                                    {profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : 'Customer Timeline'}
                                </h2>
                                {profile?.churnRisk && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                        profile.churnRisk === 'High' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                                        profile.churnRisk === 'Medium' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                                        'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    }`}>
                                        {profile.churnRisk} Churn Risk
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-300 font-mono flex items-center gap-3 mt-0.5">
                                <span>📞 {profile?.mobileNumber || 'N/A'}</span>
                                <span>🚗 {profile?.carBrandModel || 'Vehicle'} ({profile?.carNumber || 'No Plate'})</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {phone && (
                            <>
                                <button
                                    onClick={handleWhatsApp}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                                >
                                    <IconShare className="w-3.5 h-3.5" />
                                    WhatsApp
                                </button>
                                <a
                                    href={`tel:${phone}`}
                                    className="bg-brand-blue hover:bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                                >
                                    <IconPhone className="w-3.5 h-3.5" />
                                    Call Now
                                </a>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                        >
                            <IconX className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Customer Location & Quick Info Bar */}
                <div className="bg-slate-800 text-slate-200 px-5 py-3 flex flex-wrap items-center justify-between text-xs border-b border-slate-700 gap-3">
                    <div className="flex items-center gap-2 font-medium truncate max-w-md" title={profile?.streetAddress}>
                        <IconMapPin className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-slate-400">Address:</span>
                        <strong className="text-white truncate">{profile?.streetAddress || 'Location not recorded'}</strong>
                    </div>

                    {/* Customer Selector drop search */}
                    {allProfiles.length > 0 && onSelectCustomer && (
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Switch customer..."
                                value={searchCustomerQuery}
                                onChange={(e) => setSearchCustomerQuery(e.target.value)}
                                className="bg-slate-900 text-xs border border-slate-700 rounded-lg px-2.5 py-1 text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-blue"
                            />
                            {searchCustomerQuery && (
                                <div className="absolute right-0 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-20 max-h-48 overflow-y-auto p-1 space-y-0.5">
                                    {filteredProfiles.map(p => (
                                        <button
                                            key={p.mobileNumber}
                                            onClick={() => {
                                                onSelectCustomer(p);
                                                setSearchCustomerQuery('');
                                            }}
                                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-slate-800 transition flex items-center justify-between"
                                        >
                                            <span className="font-bold text-white truncate">{p.firstName} {p.lastName}</span>
                                            <span className="text-[10px] text-slate-400 font-mono">{p.mobileNumber}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Customer Stats Cards Banner */}
                <div className="bg-slate-50 p-4 border-b border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Service Orders</span>
                        <span className="text-lg font-black text-slate-800">{customerSubmissions.length} Orders</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Lifetime Spend</span>
                        <span className="text-lg font-black text-emerald-700">
                            ₹{customerSubmissions.reduce((acc, s) => acc + Number(s.grandTotal || s.totalAmount || 0), 0).toLocaleString()}
                        </span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Retention Call Logs</span>
                        <span className="text-lg font-black text-brand-blue">{customerLogs.length} Calls</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Days Since Last Visit</span>
                        <span className="text-lg font-black text-amber-700">{profile?.daysSinceLast ?? 0} Days Ago</span>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                            <IconClock className="w-5 h-5 text-brand-blue" />
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                                Chronological Activity & Retention History ({timelineEvents.length} Events)
                            </h3>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-2">
                            {onOpenFollowUpModal && (
                                <Button
                                    size="sm"
                                    onClick={() => onOpenFollowUpModal({
                                        customerName: profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : 'Customer',
                                        customerPhone: phone,
                                        carBrandModel: profile?.carBrandModel,
                                        carNumber: profile?.carNumber,
                                        streetAddress: profile?.streetAddress,
                                    })}
                                    className="text-xs bg-brand-blue hover:bg-blue-600 text-white font-bold"
                                >
                                    <IconPhone className="w-3.5 h-3.5 mr-1" />
                                    Log Call
                                </Button>
                            )}
                            {onOpenBookingModal && (
                                <Button
                                    size="sm"
                                    onClick={() => onOpenBookingModal({
                                        customerName: profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : 'Customer',
                                        customerPhone: phone,
                                        carBrandModel: profile?.carBrandModel,
                                        carNumber: profile?.carNumber,
                                        streetAddress: profile?.streetAddress,
                                    })}
                                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                >
                                    <IconCalendar className="w-3.5 h-3.5 mr-1" />
                                    Create Booking
                                </Button>
                            )}
                        </div>
                    </div>

                    {timelineEvents.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                            <IconClock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-sm font-bold text-slate-600">No activity recorded for this customer yet</p>
                            <p className="text-xs text-slate-400">Log a call or create a service booking to populate the retention timeline.</p>
                        </div>
                    ) : (
                        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
                            {timelineEvents.map((evt) => (
                                <div key={evt.id} className="relative group">
                                    {/* Timeline Node Dot */}
                                    <div className={`absolute -left-[31px] top-1.5 w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center text-[10px] text-white ${
                                        evt.type === 'SERVICE_BOOKING' ? 'bg-emerald-500' :
                                        evt.type === 'RECONVERTED' ? 'bg-emerald-600' :
                                        evt.type === 'CAMPAIGN_OFFER' ? 'bg-purple-600' :
                                        'bg-brand-blue'
                                    }`}>
                                        {evt.type === 'SERVICE_BOOKING' && '🚗'}
                                        {evt.type === 'RECONVERTED' && '🎉'}
                                        {evt.type === 'FOLLOWUP_LOG' && '📞'}
                                        {evt.type === 'CAMPAIGN_OFFER' && '🎟️'}
                                    </div>

                                    {/* Event Card */}
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-xs transition-all space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-extrabold text-xs text-slate-900">{evt.title}</h4>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${evt.badgeColor}`}>
                                                    {evt.badgeText}
                                                </span>
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-400 font-medium">
                                                🗓️ {evt.date.toLocaleDateString()} at {evt.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>

                                        <p className="text-xs text-slate-600 leading-relaxed font-medium">{evt.description}</p>

                                        {/* Additional Event Details */}
                                        {evt.type === 'SERVICE_BOOKING' && evt.details && (
                                            <div className="bg-slate-50 p-3 rounded-xl text-[11px] text-slate-700 space-y-1 font-mono border border-slate-100">
                                                <div className="flex justify-between">
                                                    <span>Service Type: <strong>{evt.details.serviceSelection}</strong></span>
                                                    <span>Order ID: <strong>#{evt.details.id?.substring(0, 8)}</strong></span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Payment Method: <strong>{evt.details.paymentMethod || 'Cash / Online'}</strong></span>
                                                    <span>Technician / Advisor: <strong>{evt.details.assignedStaff || 'Workshop Advisor'}</strong></span>
                                                </div>
                                                {evt.details.streetAddress && (
                                                    <div className="text-emerald-800 font-sans font-medium flex items-center gap-1 mt-1 pt-1 border-t border-slate-200">
                                                        <IconMapPin className="w-3 h-3 text-emerald-600" />
                                                        <span>Location: {evt.details.streetAddress}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {evt.type === 'FOLLOWUP_LOG' && evt.details?.nextFollowUpDate && (
                                            <div className="bg-amber-50 text-amber-900 p-2.5 rounded-xl text-xs font-bold border border-amber-200 flex items-center justify-between">
                                                <span>🗓️ Next Scheduled Follow-Up:</span>
                                                <span>{new Date(evt.details.nextFollowUpDate).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer close */}
                <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-mono">
                        Showing complete retention history for <strong>{phone}</strong>
                    </span>
                    <Button onClick={onClose} variant="secondary" className="font-bold">
                        Close Timeline
                    </Button>
                </div>
            </div>
        </div>
    );
};
