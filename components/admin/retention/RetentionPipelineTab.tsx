import React from 'react';
import { RetentionActivityLog } from '../../../types';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import { IconPhone, IconCalendar, IconCheck, IconShare, IconSparkles, IconMapPin } from '../../ui/Icon';

interface RetentionPipelineTabProps {
    dueCustomers: Array<{
        profile: any;
        dueService: string;
        daysOverdue: number;
        lastVisitDate: Date;
    }>;
    retentionLogs: RetentionActivityLog[];
    onOpenFollowUpModal: (target: any) => void;
    onOpenBookingModal: (target: any) => void;
    onOpenTimelineModal?: (profile: any) => void;
}

export const RetentionPipelineTab: React.FC<RetentionPipelineTabProps> = ({
    dueCustomers = [],
    retentionLogs = [],
    onOpenFollowUpModal,
    onOpenBookingModal,
    onOpenTimelineModal,
}) => {
    // Map due customers into pipeline stages based on latest retention log
    const pipelineData = React.useMemo(() => {
        const uncontacted: typeof dueCustomers = [];
        const contacted: Array<{ item: typeof dueCustomers[0]; latestLog: RetentionActivityLog }> = [];
        const scheduled: Array<{ item: typeof dueCustomers[0]; latestLog: RetentionActivityLog }> = [];
        const converted: Array<{ item: typeof dueCustomers[0]; latestLog: RetentionActivityLog }> = [];

        dueCustomers.forEach(item => {
            if (!item || !item.profile) return;
            const phone = item.profile.mobileNumber;
            const customerLogs = retentionLogs.filter(l => l.customerPhone === phone).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (customerLogs.length === 0) {
                uncontacted.push(item);
            } else {
                const latest = customerLogs[0];
                if (latest.outcome === 'BOOKED' || latest.actionType === 'BOOKING_CREATED') {
                    converted.push({ item, latestLog: latest });
                } else if (latest.nextFollowUpDate || latest.outcome === 'CALLBACK_REQUESTED') {
                    scheduled.push({ item, latestLog: latest });
                } else {
                    contacted.push({ item, latestLog: latest });
                }
            }
        });

        return { uncontacted, contacted, scheduled, converted };
    }, [dueCustomers, retentionLogs]);

    return (
        <div className="space-y-4">
            <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div>
                    <h3 className="font-bold text-sm text-white">🎯 Sales Retention Pipeline & SLA Board</h3>
                    <p className="text-xs text-slate-300">Track customer journey from service due ➔ follow-up contact ➔ scheduled reminder ➔ retention booking</p>
                </div>
                <div className="flex gap-2 text-xs font-bold">
                    <span className="bg-rose-500/30 text-rose-300 px-2.5 py-1 rounded-lg border border-rose-500/40">Overdue: {pipelineData.uncontacted.length}</span>
                    <span className="bg-amber-500/30 text-amber-300 px-2.5 py-1 rounded-lg border border-amber-500/40">Contacted: {pipelineData.contacted.length}</span>
                    <span className="bg-sky-500/30 text-sky-300 px-2.5 py-1 rounded-lg border border-sky-500/40">Scheduled: {pipelineData.scheduled.length}</span>
                    <span className="bg-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded-lg border border-emerald-500/40">Converted: {pipelineData.converted.length}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Column 1: Overdue */}
                <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
                        <span className="font-bold text-xs text-rose-800 flex items-center gap-1.5">
                            🔴 1. Overdue / Uncontacted
                        </span>
                        <span className="bg-rose-100 text-rose-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                            {pipelineData.uncontacted.length}
                        </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                        {pipelineData.uncontacted.map(({ profile, dueService, daysOverdue }) => (
                            <div key={`${profile.mobileNumber}_${dueService}`} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-rose-300 transition-all">
                                <div>
                                    <h4 className="font-bold text-xs text-slate-800">{profile.firstName} {profile.lastName}</h4>
                                    <p className="text-[11px] text-slate-500 font-mono">📞 {profile.mobileNumber}</p>
                                    <p className="text-[11px] text-slate-600">🚗 {profile.carBrandModel || 'Vehicle'}</p>
                                    {profile.streetAddress && (
                                        <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5 truncate" title={profile.streetAddress}>
                                            <IconMapPin className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                            <span className="truncate">{profile.streetAddress}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="bg-rose-50 text-rose-900 border border-rose-200 rounded p-1.5 text-[10px] font-bold flex items-center justify-between">
                                    <span>Due: {dueService}</span>
                                    <span className="text-rose-700">+{daysOverdue} days</span>
                                </div>
                                <div className="pt-1 flex gap-1.5">
                                    <Button
                                        size="sm"
                                        className="w-1/2 text-[10px] bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1"
                                        onClick={() => onOpenFollowUpModal({
                                            customerName: `${profile.firstName} ${profile.lastName}`,
                                            customerPhone: profile.mobileNumber,
                                            carBrandModel: profile.carBrandModel,
                                            carNumber: profile.carNumber,
                                            customerEmail: profile.customerEmail,
                                            streetAddress: profile.streetAddress,
                                            dueService,
                                            daysOverdue,
                                            daysSinceLast: profile.daysSinceLast,
                                        })}
                                    >
                                        📞 Initiate Contact
                                    </Button>
                                    {onOpenTimelineModal && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-1/2 text-[10px] bg-white hover:bg-slate-100 text-slate-700 font-semibold py-1 border border-slate-300"
                                            onClick={() => onOpenTimelineModal(profile)}
                                        >
                                            📜 Timeline
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Contacted */}
                <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
                        <span className="font-bold text-xs text-amber-800 flex items-center gap-1.5">
                            🟡 2. Follow-Up In Progress
                        </span>
                        <span className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                            {pipelineData.contacted.length}
                        </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                        {pipelineData.contacted.map(({ item, latestLog }) => (
                            <div key={latestLog.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-amber-300 transition-all">
                                <div>
                                    <h4 className="font-bold text-xs text-slate-800">{latestLog.customerName}</h4>
                                    <p className="text-[11px] text-slate-500 font-mono">📞 {latestLog.customerPhone}</p>
                                    {item?.profile?.streetAddress && (
                                        <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5 truncate" title={item.profile.streetAddress}>
                                            <IconMapPin className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                            <span className="truncate">{item.profile.streetAddress}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="bg-amber-50 text-amber-900 border border-amber-200 rounded p-1.5 text-[10px] leading-snug">
                                    <span className="font-bold block">Outcome: {latestLog.outcome}</span>
                                    <span className="text-slate-600 line-clamp-2">{latestLog.notes}</span>
                                </div>
                                <div className="pt-1 flex gap-1.5">
                                    <Button
                                        size="sm"
                                        className="w-1/2 text-[10px] bg-emerald-600 hover:bg-emerald-700 py-1"
                                        onClick={() => onOpenBookingModal({
                                            customerName: latestLog.customerName,
                                            customerPhone: latestLog.customerPhone,
                                            carBrandModel: latestLog.carBrandModel,
                                            carNumber: latestLog.carNumber,
                                            streetAddress: item?.profile?.streetAddress,
                                            dueService: item.dueService,
                                        })}
                                    >
                                        🗓️ Book Now
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="w-1/2 text-[10px] py-1"
                                        onClick={() => onOpenFollowUpModal({
                                            customerName: latestLog.customerName,
                                            customerPhone: latestLog.customerPhone,
                                            carBrandModel: latestLog.carBrandModel,
                                            carNumber: latestLog.carNumber,
                                            streetAddress: item?.profile?.streetAddress,
                                            dueService: item.dueService,
                                        })}
                                    >
                                        📝 Update Log
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 3: Scheduled */}
                <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
                        <span className="font-bold text-xs text-sky-800 flex items-center gap-1.5">
                            🔵 3. Scheduled Reminder
                        </span>
                        <span className="bg-sky-100 text-sky-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                            {pipelineData.scheduled.length}
                        </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                        {pipelineData.scheduled.map(({ item, latestLog }) => (
                            <div key={latestLog.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 hover:border-sky-300 transition-all">
                                <div>
                                    <h4 className="font-bold text-xs text-slate-800">{latestLog.customerName}</h4>
                                    <p className="text-[11px] text-slate-500 font-mono">📞 {latestLog.customerPhone}</p>
                                    {item?.profile?.streetAddress && (
                                        <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5 truncate" title={item.profile.streetAddress}>
                                            <IconMapPin className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                            <span className="truncate">{item.profile.streetAddress}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="bg-sky-50 text-sky-900 border border-sky-200 rounded p-1.5 text-[10px] font-bold flex items-center justify-between">
                                    <span>🗓️ Next Check:</span>
                                    <span>{latestLog.nextFollowUpDate || 'Pending'}</span>
                                </div>
                                <div className="pt-1 flex gap-1.5">
                                    <Button
                                        size="sm"
                                        className="w-1/2 text-[10px] bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1"
                                        onClick={() => onOpenFollowUpModal({
                                            customerName: latestLog.customerName,
                                            customerPhone: latestLog.customerPhone,
                                            carBrandModel: latestLog.carBrandModel,
                                            carNumber: latestLog.carNumber,
                                            streetAddress: item?.profile?.streetAddress,
                                            dueService: item.dueService,
                                        })}
                                    >
                                        📞 Execute Follow-Up
                                    </Button>
                                    {onOpenTimelineModal && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-1/2 text-[10px] bg-white hover:bg-slate-100 text-slate-700 font-semibold py-1 border border-slate-300"
                                            onClick={() => onOpenTimelineModal(item?.profile || { mobileNumber: latestLog.customerPhone, firstName: latestLog.customerName })}
                                        >
                                            📜 Timeline
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 4: Converted */}
                <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 flex flex-col min-h-[500px]">
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-300">
                        <span className="font-bold text-xs text-emerald-800 flex items-center gap-1.5">
                            🟢 4. Converted / Retained
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded-full">
                            {pipelineData.converted.length}
                        </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                        {pipelineData.converted.map(({ item, latestLog }) => (
                            <div key={latestLog.id} className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-200 shadow-2xs space-y-2">
                                <div>
                                    <h4 className="font-bold text-xs text-emerald-950">{latestLog.customerName}</h4>
                                    <p className="text-[11px] text-emerald-800 font-mono">📞 {latestLog.customerPhone}</p>
                                    {item?.profile?.streetAddress && (
                                        <p className="text-[10px] text-emerald-800 font-medium flex items-center gap-1 mt-0.5 truncate" title={item.profile.streetAddress}>
                                            <IconMapPin className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                            <span className="truncate">{item.profile.streetAddress}</span>
                                        </p>
                                    )}
                                </div>
                                <div className="bg-white text-emerald-900 border border-emerald-200 rounded p-1.5 text-[10px] font-bold flex items-center justify-between">
                                    <span>🎉 Service Retained</span>
                                    <IconCheck className="w-4 h-4 text-emerald-600" />
                                </div>
                                {onOpenTimelineModal && (
                                    <div className="pt-1">
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-full text-[10px] py-1 border border-emerald-200 bg-white hover:bg-emerald-100 text-emerald-900"
                                            onClick={() => onOpenTimelineModal(item?.profile || { mobileNumber: latestLog.customerPhone, firstName: latestLog.customerName })}
                                        >
                                            📜 View Customer Timeline
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RetentionPipelineTab;
