import React, { useState, useMemo } from 'react';
import { RetentionActivityLog, User, RetentionKpiTargets } from '../../../types';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import {
    IconSearch, IconPhone, IconCheck, IconCalendar, IconUser, IconTrophy, IconShare, IconClipboardList, IconChartBar
} from '../../ui/Icon';

interface RetentionActivityLogTabProps {
    logs: RetentionActivityLog[];
    users?: User[];
    kpiTargets?: RetentionKpiTargets;
    onOpenFollowUpModal?: (target: any) => void;
}

export const RetentionActivityLogTab: React.FC<RetentionActivityLogTabProps> = ({
    logs = [],
    users = [],
    kpiTargets,
    onOpenFollowUpModal,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAgent, setSelectedAgent] = useState('ALL');
    const [selectedAction, setSelectedAction] = useState('ALL');
    const [selectedOutcome, setSelectedOutcome] = useState('ALL');

    // Filter logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (selectedAgent !== 'ALL' && log.agentUsername !== selectedAgent) return false;
            if (selectedAction !== 'ALL' && log.actionType !== selectedAction) return false;
            if (selectedOutcome !== 'ALL' && log.outcome !== selectedOutcome) return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = String(log.customerName || '').toLowerCase().includes(q);
                const matchPhone = String(log.customerPhone || '').toLowerCase().includes(q);
                const matchNotes = String(log.notes || '').toLowerCase().includes(q);
                const matchCar = String(log.carBrandModel || '').toLowerCase().includes(q) || String(log.carNumber || '').toLowerCase().includes(q);
                return matchName || matchPhone || matchNotes || matchCar;
            }
            return true;
        });
    }, [logs, selectedAgent, selectedAction, selectedOutcome, searchQuery]);

    // Leaderboard calculations
    const agentLeaderboard = useMemo(() => {
        const statsMap: Record<string, {
            username: string;
            name: string;
            role: string;
            totalLogs: number;
            bookings: number;
            calls: number;
            whatsapps: number;
            offersSent: number;
        }> = {};

        logs.forEach(log => {
            const agentKey = log.agentUsername || 'system';
            if (!statsMap[agentKey]) {
                const foundUser = users.find(u => u.username === agentKey);
                statsMap[agentKey] = {
                    username: agentKey,
                    name: foundUser?.username || agentKey,
                    role: foundUser?.role || 'Agent',
                    totalLogs: 0,
                    bookings: 0,
                    calls: 0,
                    whatsapps: 0,
                    offersSent: 0,
                };
            }

            const stat = statsMap[agentKey];
            stat.totalLogs++;
            if (log.outcome === 'BOOKED' || log.actionType === 'BOOKING_CREATED') {
                stat.bookings++;
            }
            if (log.actionType === 'CALL') stat.calls++;
            if (log.actionType === 'WHATSAPP') stat.whatsapps++;
            if (log.outcome === 'DISCOUNT_SENT' || log.promoCodeUsed) stat.offersSent++;
        });

        return Object.values(statsMap).sort((a, b) => b.bookings - a.bookings || b.totalLogs - a.totalLogs);
    }, [logs, users]);

    // Overall stats
    const totalLogs = logs.length;
    const totalBookings = logs.filter(l => l.outcome === 'BOOKED' || l.actionType === 'BOOKING_CREATED').length;
    const conversionRate = totalLogs > 0 ? Math.round((totalBookings / totalLogs) * 100) : 0;

    const handleExportCsv = () => {
        if (logs.length === 0) {
            alert('No activity logs available to export.');
            return;
        }

        const headers = ['Timestamp', 'Customer Name', 'Phone', 'Car Brand/Model', 'Agent', 'Channel', 'Outcome', 'Notes', 'Promo Code', 'Next Follow-up'];
        const rows = logs.map(l => [
            new Date(l.timestamp).toLocaleString(),
            `"${l.customerName || ''}"`,
            `"${l.customerPhone || ''}"`,
            `"${l.carBrandModel || l.carNumber || ''}"`,
            `"${l.agentUsername || ''}"`,
            l.actionType,
            l.outcome || '',
            `"${String(l.notes || '').replace(/"/g, '""')}"`,
            l.promoCodeUsed || '',
            l.nextFollowUpDate || '',
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Retention_Activity_Log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            {/* KPI Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                    <div className="p-3 bg-blue-50 text-brand-blue rounded-xl">
                        <IconClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">Total Touchpoints</p>
                        <p className="text-2xl font-black text-slate-800">{totalLogs}</p>
                        <p className="text-[10px] text-slate-400">Recorded follow-ups</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <IconCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">Converted Bookings</p>
                        <p className="text-2xl font-black text-emerald-700">{totalBookings}</p>
                        <p className="text-[10px] text-emerald-600 font-semibold">Direct retention orders</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                        <IconChartBar className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">Conversion Rate</p>
                        <p className="text-2xl font-black text-purple-800">{conversionRate}%</p>
                        <p className="text-[10px] text-slate-400">Target: {kpiTargets?.conversionRatePercentage || 40}%</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <IconTrophy className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase">Active Sales Agents</p>
                        <p className="text-2xl font-black text-slate-800">{agentLeaderboard.length}</p>
                        <p className="text-[10px] text-slate-400">Logging follow-ups</p>
                    </div>
                </div>
            </div>

            {/* Agent Leaderboard Section */}
            {agentLeaderboard.length > 0 && (
                <Card title="🏆 Sales Agent Retention Performance Leaderboard">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
                        {agentLeaderboard.map((agent, idx) => (
                            <div key={agent.username} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2 relative overflow-hidden">
                                {idx === 0 && (
                                    <div className="absolute top-0 right-0 bg-amber-400 text-amber-950 font-bold text-[9px] px-2 py-0.5 rounded-bl-lg flex items-center gap-1">
                                        ⭐ Top Retainer
                                    </div>
                                )}
                                <div className="flex items-center space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-brand-blue text-white flex items-center justify-center font-bold text-xs shrink-0">
                                        {agent.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="truncate">
                                        <p className="font-bold text-xs text-slate-800 truncate">{agent.name}</p>
                                        <p className="text-[10px] text-slate-500 capitalize">{agent.role}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200">
                                    <div>
                                        <span className="text-slate-400 block text-[9px]">Follow-Ups</span>
                                        <strong className="text-slate-700">{agent.totalLogs}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[9px]">Bookings</span>
                                        <strong className="text-emerald-700">{agent.bookings}</strong>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Filter Toolbar & Search */}
            <Card title="📋 Live Follow-Up & Retention Activity Stream">
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <input
                                type="text"
                                placeholder="Search by customer name, phone, vehicle, or notes..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent text-slate-800"
                            />
                        </div>

                        {/* Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={selectedAgent}
                                onChange={(e) => setSelectedAgent(e.target.value)}
                                className="text-xs p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                            >
                                <option value="ALL">All Agents</option>
                                {agentLeaderboard.map(a => (
                                    <option key={a.username} value={a.username}>{a.name}</option>
                                ))}
                            </select>

                            <select
                                value={selectedAction}
                                onChange={(e) => setSelectedAction(e.target.value)}
                                className="text-xs p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                            >
                                <option value="ALL">All Channels</option>
                                <option value="CALL">📞 Calls</option>
                                <option value="WHATSAPP">💬 WhatsApp</option>
                                <option value="EMAIL">✉️ Emails</option>
                                <option value="BOOKING_CREATED">🎉 Bookings</option>
                            </select>

                            <select
                                value={selectedOutcome}
                                onChange={(e) => setSelectedOutcome(e.target.value)}
                                className="text-xs p-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-700"
                            >
                                <option value="ALL">All Outcomes</option>
                                <option value="BOOKED">Booked</option>
                                <option value="INTERESTED">Interested</option>
                                <option value="CALLBACK_REQUESTED">Callback</option>
                                <option value="DISCOUNT_SENT">Discount Sent</option>
                                <option value="NO_ANSWER">No Answer</option>
                                <option value="NOT_INTERESTED">Declined</option>
                            </select>

                            <Button size="sm" variant="secondary" onClick={handleExportCsv} className="text-xs">
                                📥 Export CSV
                            </Button>
                        </div>
                    </div>

                    {/* Stream List */}
                    {filteredLogs.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                            <IconClipboardList className="w-10 h-10 text-slate-300 mx-auto" />
                            <p className="text-sm font-bold text-slate-600">No retention activity logs found</p>
                            <p className="text-xs text-slate-400">Initiate follow-ups from the "Due for Service" or "Predictive Churn Risk" tabs to populate this stream.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredLogs.map(log => {
                                const isBooked = log.outcome === 'BOOKED' || log.actionType === 'BOOKING_CREATED';
                                return (
                                    <div
                                        key={log.id}
                                        className={`p-4 rounded-xl border transition-all space-y-2 ${
                                            isBooked ? 'bg-sky-50/70 border-sky-200 shadow-2xs' : 'bg-white border-slate-200 hover:border-slate-300'
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center space-x-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                    log.actionType === 'CALL' ? 'bg-emerald-100 text-emerald-800' :
                                                    log.actionType === 'WHATSAPP' ? 'bg-green-100 text-green-800' :
                                                    log.actionType === 'BOOKING_CREATED' ? 'bg-sky-100 text-sky-800 font-extrabold' :
                                                    'bg-purple-100 text-purple-800'
                                                }`}>
                                                    {log.actionType}
                                                </span>
                                                <h4 className="font-bold text-xs text-slate-800">{log.customerName}</h4>
                                                <span className="font-mono text-[11px] text-slate-500">📞 {log.customerPhone}</span>
                                                {log.carBrandModel && (
                                                    <span className="text-[11px] text-slate-600 font-medium">🚗 {log.carBrandModel}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                                                <span>Agent: <strong className="text-slate-700">{log.agentUsername}</strong></span>
                                                <span>•</span>
                                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                                            </div>
                                        </div>

                                        <p className="text-xs text-slate-700 leading-relaxed pl-1 border-l-2 border-brand-blue/40">
                                            {log.notes}
                                        </p>

                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1">
                                            <div className="flex items-center space-x-3">
                                                {log.outcome && (
                                                    <span className={`font-semibold ${
                                                        isBooked ? 'text-sky-800 font-bold' : 'text-slate-600'
                                                    }`}>
                                                        Outcome: {log.outcome}
                                                    </span>
                                                )}
                                                {log.promoCodeUsed && (
                                                    <span className="bg-amber-100 text-amber-900 font-mono font-bold px-2 py-0.5 rounded text-[10px]">
                                                        🏷️ Promo: {log.promoCodeUsed}
                                                    </span>
                                                )}
                                                {log.dueService && (
                                                    <span className="text-slate-500">
                                                        Service: <strong>{log.dueService}</strong>
                                                    </span>
                                                )}
                                            </div>

                                            {log.nextFollowUpDate && (
                                                <div className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                                                    <IconCalendar className="w-3 h-3 text-amber-600" />
                                                    Next Follow-Up: {log.nextFollowUpDate}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default RetentionActivityLogTab;
