import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    Cell,
    Line,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ReferenceLine
} from 'recharts';
import { Service, ServiceStatus, Customer, Settings, RetentionKpiTargets, User, RetentionActivityLog, ServiceTemplate, RetentionCoupon } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import {
    IconClock, IconUser, IconPlus, IconSettings,
    IconTrophy, IconSearch, IconChartBar, IconCalendar,
    IconPhone, IconUserCheck, IconUserOff, IconX, IconCheck, IconAlertTriangle,
    IconClipboardList, IconCreditCard, IconSparkles, IconRefresh, IconShare, IconMapPin, IconFilter, IconDownload
} from '../ui/Icon';
import RetentionKPISettingsModal from './RetentionKPISettingsModal';
import FollowUpLoggerModal, { CustomerFollowUpTarget } from './retention/FollowUpLoggerModal';
import RetentionBookingModal from './retention/RetentionBookingModal';
import RetentionActivityLogTab from './retention/RetentionActivityLogTab';
import RetentionPipelineTab from './retention/RetentionPipelineTab';
import RetentionPromosTab, { DEFAULT_RETENTION_COUPONS } from './retention/RetentionPromosTab';
import { CustomerTimelineModal } from './retention/CustomerTimelineModal';
import SkeletonLoader from '../ui/SkeletonLoader';

interface RetentionDashboardProps {
    isLoading?: boolean;
    isHydrated?: boolean;
    submissions: Service[];
    onCreateFollowUp?: (customer: Customer, serviceSelection: string[]) => void;
    settings: Settings;
    onUpdateKpiTargets: (targets: RetentionKpiTargets) => void;
    currentUser?: User;
    users?: User[];
    retentionLogs?: RetentionActivityLog[];
    onSaveRetentionLog?: (log: RetentionActivityLog) => void;
    onCreateOrder?: (serviceData: any) => Promise<any> | void;
    serviceTemplates?: ServiceTemplate[];
    predefinedServices?: any[];
    predefinedServiceCategories?: any[];
}

interface CustomerProfile {
    mobileNumber: string;
    firstName: string;
    lastName: string;
    carNumber: string;
    carBrandModel: string;
    customerEmail?: string;
    streetAddress?: string;
    visits: Service[];
    totalSpend: number;
    visitCount: number;
    firstVisit: Date;
    lastVisit: Date;
    daysSinceLast: number;
    servicesUsed: Set<string>;
    averageIntervalDays?: number;
    churnScore?: number;
    churnRisk?: 'Low' | 'Medium' | 'High';
}

type CustomerSegment = 'new' | 'regular' | 'loyal' | 'at_risk' | 'churned';
type TabId = 'due' | 'repeat' | 'pipeline' | 'activity' | 'churn' | 'coupons' | 'timeline';

const SERVICE_DUE_DAYS: Record<string, number> = {
    'Car Washing': 30,
    'Car Care': 90,
    'Tyre Replacement': 180,
    'Battery Replacement': 730,
};

const daysBetween = (date1: Date, date2: Date): number => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
};

const CustomTrendTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0]?.payload;
        if (!data) return null;
        return (
            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 min-w-[180px]">
                <p className="font-extrabold text-slate-200 border-b border-slate-700 pb-1 flex justify-between items-center">
                    <span>📅 {label}</span>
                    <span className="text-[10px] text-blue-300 bg-blue-900/60 px-1.5 py-0.5 rounded font-mono">6-Mo BI</span>
                </p>
                <div className="space-y-1 pt-0.5">
                    <p className="flex justify-between items-center text-blue-300 font-bold">
                        <span>🔄 Repeat Orders:</span>
                        <strong className="text-white text-sm">{data.repeatOrders}</strong>
                    </p>
                    <p className="flex justify-between items-center text-slate-400">
                        <span>👤 New Mobiles:</span>
                        <span className="text-slate-200 font-semibold">{data.newCustomers}</span>
                    </p>
                    <p className="flex justify-between items-center text-slate-400">
                        <span>📦 Total Orders:</span>
                        <span className="text-slate-200 font-semibold">{data.totalOrders}</span>
                    </p>
                    <p className="flex justify-between items-center text-emerald-400 font-bold pt-1 border-t border-slate-800">
                        <span>🎯 Retention Rate:</span>
                        <strong className="text-emerald-300 text-sm">{data.retentionRate}%</strong>
                    </p>
                </div>
            </div>
        );
    }
    return null;
};

const CustomDropOffTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0]?.payload;
        if (!data) return null;
        return (
            <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5 min-w-[200px]">
                <p className="font-extrabold text-slate-200 border-b border-slate-700 pb-1 flex justify-between items-center">
                    <span>📍 {label}</span>
                    <span className="text-[10px] text-rose-300 bg-rose-900/60 px-1.5 py-0.5 rounded font-mono">Drop-off Point</span>
                </p>
                <div className="space-y-1 pt-0.5">
                    {'retentionRate' in data && (
                        <>
                            <p className="flex justify-between items-center text-emerald-400 font-bold">
                                <span>✅ Retention Rate:</span>
                                <strong className="text-emerald-300 text-sm">{data.retentionRate}%</strong>
                            </p>
                            <p className="flex justify-between items-center text-rose-400 font-bold">
                                <span>⚠️ Drop-Off / Attrition Rate:</span>
                                <strong className="text-rose-300 text-sm">{data.dropOffRate}%</strong>
                            </p>
                            <p className="flex justify-between items-center text-slate-400 pt-1 border-t border-slate-800">
                                <span>📦 Total Orders:</span>
                                <span className="text-slate-200 font-semibold">{data.totalOrders}</span>
                            </p>
                        </>
                    )}
                    {'activeCustomers' in data && (
                        <>
                            <p className="flex justify-between items-center text-blue-300 font-bold">
                                <span>👥 Active Customers:</span>
                                <strong className="text-white text-sm">{data.activeCustomers}</strong>
                            </p>
                            <p className="flex justify-between items-center text-emerald-400 font-bold">
                                <span>🔄 Retention %:</span>
                                <strong className="text-emerald-300">{data.retainedPct}%</strong>
                            </p>
                            {data.dropOffCount > 0 && (
                                <p className="flex justify-between items-center text-rose-400 font-bold pt-1 border-t border-slate-800">
                                    <span>🚪 Dropped Off Here:</span>
                                    <strong className="text-rose-300">{data.dropOffCount} clients ({data.dropOffPct}%)</strong>
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

interface AnimatedCountUpProps {
    value: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
    className?: string;
    formatCurrency?: boolean;
}

const AnimatedCountUp: React.FC<AnimatedCountUpProps> = ({
    value,
    prefix = '',
    suffix = '',
    decimals = 0,
    className = '',
    formatCurrency = false,
}) => {
    const [displayVal, setDisplayVal] = useState(value);
    const [isPulsing, setIsPulsing] = useState(false);
    const prevValueRef = useRef(value);

    useEffect(() => {
        if (prevValueRef.current !== value) {
            setIsPulsing(true);
            const timer = setTimeout(() => setIsPulsing(false), 850);

            const startVal = prevValueRef.current;
            const endVal = value;
            const duration = 750;
            let startTime: number | null = null;
            let frameId: number;

            const animateStep = (timestamp: number) => {
                if (!startTime) startTime = timestamp;
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                const current = startVal + (endVal - startVal) * easedProgress;

                setDisplayVal(current);

                if (progress < 1) {
                    frameId = requestAnimationFrame(animateStep);
                } else {
                    setDisplayVal(endVal);
                    prevValueRef.current = endVal;
                }
            };

            frameId = requestAnimationFrame(animateStep);

            return () => {
                cancelAnimationFrame(frameId);
                clearTimeout(timer);
            };
        } else {
            setDisplayVal(value);
        }
    }, [value]);

    const formattedNumber = useMemo(() => {
        if (formatCurrency) {
            return Math.round(displayVal).toLocaleString('en-IN');
        }
        if (decimals > 0) {
            return displayVal.toFixed(decimals);
        }
        return Math.round(displayVal).toLocaleString();
    }, [displayVal, formatCurrency, decimals]);

    return (
        <span
            className={`inline-block transition-transform duration-300 ${
                isPulsing ? 'scale-105 text-indigo-600 font-extrabold' : ''
            } ${className}`}
        >
            {prefix}{formattedNumber}{suffix}
        </span>
    );
};

interface PulsingKpiCardProps {
    children: React.ReactNode;
    className?: string;
    refreshKey?: any;
}

const PulsingKpiCard: React.FC<PulsingKpiCardProps> = ({ children, className = '', refreshKey }) => {
    const [isPulsing, setIsPulsing] = useState(false);
    const prevKeyRef = useRef(refreshKey);

    useEffect(() => {
        if (prevKeyRef.current !== undefined && prevKeyRef.current !== refreshKey) {
            setIsPulsing(true);
            const timer = setTimeout(() => setIsPulsing(false), 950);
            prevKeyRef.current = refreshKey;
            return () => clearTimeout(timer);
        } else {
            prevKeyRef.current = refreshKey;
        }
    }, [refreshKey]);

    return (
        <Card
            className={`transition-all duration-500 ${
                isPulsing
                    ? 'ring-2 ring-indigo-500/50 shadow-md shadow-indigo-100/60 scale-[1.01] bg-indigo-50/20'
                    : ''
            } ${className}`}
        >
            {children}
        </Card>
    );
};

const RetentionDashboard: React.FC<RetentionDashboardProps> = (props) => {
    const {
        submissions = [],
        onCreateFollowUp,
        settings,
        onUpdateKpiTargets,
        currentUser,
        users = [],
        retentionLogs = [],
        onSaveRetentionLog,
        onCreateOrder,
        serviceTemplates = [],
        predefinedServices = [],
        predefinedServiceCategories = [],
        isLoading,
        isHydrated
    } = props;

    // Safe fallbacks for arrays and objects
    const safeSubmissions = useMemo(() => Array.isArray(submissions) ? submissions : [], [submissions]);
    const safeRetentionLogs = useMemo(() => Array.isArray(retentionLogs) ? retentionLogs : [], [retentionLogs]);
    const safeUsers = useMemo(() => Array.isArray(users) ? users : [], [users]);
    const safeSettings = useMemo(() => settings || ({} as Settings), [settings]);
    const safeServiceTemplates = useMemo(() => Array.isArray(serviceTemplates) ? serviceTemplates : [], [serviceTemplates]);
    const safePredefinedServices = useMemo(() => Array.isArray(predefinedServices) ? predefinedServices : [], [predefinedServices]);
    const safePredefinedCategories = useMemo(() => Array.isArray(predefinedServiceCategories) ? predefinedServiceCategories : [], [predefinedServiceCategories]);

    const [activeTab, setActiveTab] = useState<TabId>('due');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Performance Date Range Filter State
    const [datePreset, setDatePreset] = useState<'current_month' | 'last_month' | 'last_30_days' | 'last_90_days' | 'this_year' | 'all_time' | 'custom'>('current_month');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');

    // Active Date Range Boundaries Calculation
    const dateRangeBounds = useMemo(() => {
        const now = new Date();
        let startTs = 0;
        let endTs = Number.MAX_SAFE_INTEGER;
        let label = 'Current Month';

        if (datePreset === 'current_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            startTs = start.getTime();
            endTs = end.getTime();
            label = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        } else if (datePreset === 'last_month') {
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            startTs = start.getTime();
            endTs = end.getTime();
            label = start.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        } else if (datePreset === 'last_30_days') {
            const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
            startTs = start.getTime();
            endTs = now.getTime();
            label = 'Last 30 Days';
        } else if (datePreset === 'last_90_days') {
            const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            start.setHours(0, 0, 0, 0);
            startTs = start.getTime();
            endTs = now.getTime();
            label = 'Last 90 Days';
        } else if (datePreset === 'this_year') {
            const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            startTs = start.getTime();
            endTs = end.getTime();
            label = `Year ${now.getFullYear()}`;
        } else if (datePreset === 'all_time') {
            startTs = 0;
            endTs = Number.MAX_SAFE_INTEGER;
            label = 'All Time';
        } else if (datePreset === 'custom') {
            if (customStartDate) {
                startTs = new Date(`${customStartDate}T00:00:00`).getTime();
            }
            if (customEndDate) {
                endTs = new Date(`${customEndDate}T23:59:59.999`).getTime();
            }
            label = `${customStartDate || 'Start'} to ${customEndDate || 'End'}`;
        }

        return { startTs, endTs, label };
    }, [datePreset, customStartDate, customEndDate]);

    // Submissions and Retention Logs filtered by selected Date Range
    const filteredPeriodSubmissions = useMemo(() => {
        return safeSubmissions.filter(s => {
            const ts = new Date(s.timestamp || (s as any).createdAt || Date.now()).getTime();
            return ts >= dateRangeBounds.startTs && ts <= dateRangeBounds.endTs;
        });
    }, [safeSubmissions, dateRangeBounds]);

    const filteredPeriodRetentionLogs = useMemo(() => {
        return safeRetentionLogs.filter(l => {
            const ts = new Date(l.timestamp || (l as any).createdAt || Date.now()).getTime();
            return ts >= dateRangeBounds.startTs && ts <= dateRangeBounds.endTs;
        });
    }, [safeRetentionLogs, dateRangeBounds]);

    // Quick overdue & location filter state
    const [daysOverdueFilter, setDaysOverdueFilter] = useState<'all' | '15' | '30' | '60' | '90'>('all');
    const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('all');
    const [carWashIntervalDays, setCarWashIntervalDays] = useState<number>(15); // Default 15 days
    const [carCareIntervalDays, setCarCareIntervalDays] = useState<number>(180); // Default 6 months (180 days), toggleable to 365 (1 year)
    const [selectedLocationFilter, setSelectedLocationFilter] = useState<string>('all');
    const [locationSearchQuery, setLocationSearchQuery] = useState<string>('');

    // Modal target state
    const [followUpTarget, setFollowUpTarget] = useState<CustomerFollowUpTarget | null>(null);
    const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);

    const [bookingTarget, setBookingTarget] = useState<CustomerFollowUpTarget | null>(null);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

    // Timeline modal state
    const [timelineCustomer, setTimelineCustomer] = useState<CustomerProfile | null>(null);
    const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);

    const openTimelineForCustomer = (profile: any) => {
        setTimelineCustomer(profile);
        setIsTimelineModalOpen(true);
    };

    // Business Intelligence Retention Rate calculation for selected Date Range
    // Requested Logic: repeat customer orders = total number of orders - count of new customer mobile numbers
    const biRetentionMetrics = useMemo(() => {
        const totalOrders = filteredPeriodSubmissions.length;
        const uniqueNewCustomerMobileNumbers = new Set(
            filteredPeriodSubmissions.map(s => String(s.mobileNumber || '').trim()).filter(Boolean)
        ).size;

        const repeatCustomerOrders = Math.max(0, totalOrders - uniqueNewCustomerMobileNumbers);

        const retentionRate = totalOrders > 0
            ? Math.round((repeatCustomerOrders / totalOrders) * 100)
            : 0;

        return {
            totalOrders,
            uniqueNewCustomerMobileNumbers,
            repeatCustomerOrders,
            retentionRate,
        };
    }, [filteredPeriodSubmissions]);

    // Chart view filter state ('all', 'repeat', 'rate')
    const [chartView, setChartView] = useState<'all' | 'repeat' | 'rate'>('all');

    // 6-Month Repeat Customer Acquisition Trends Calculation
    const monthlyRetentionTrends = useMemo(() => {
        const now = new Date();
        const months = [];

        // Generate last 6 calendar months (oldest to newest)
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthLabel = d.toLocaleString('en-US', { month: 'short' }) + " '" + d.getFullYear().toString().slice(-2);
            const year = d.getFullYear();
            const monthIndex = d.getMonth();

            const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
            const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

            months.push({
                monthLabel,
                monthStart,
                monthEnd,
            });
        }

        // Find earliest order date for each mobile number across all submissions
        const firstOrderTsByMobile = new Map<string, number>();
        safeSubmissions.forEach(s => {
            const mobile = String(s.mobileNumber || '').trim();
            if (!mobile) return;
            const orderTs = new Date(s.timestamp || (s as any).createdAt || Date.now()).getTime();
            if (!firstOrderTsByMobile.has(mobile) || orderTs < firstOrderTsByMobile.get(mobile)!) {
                firstOrderTsByMobile.set(mobile, orderTs);
            }
        });

        // Compute monthly breakdown
        const trendData = months.map(({ monthLabel, monthStart, monthEnd }) => {
            const startTs = monthStart.getTime();
            const endTs = monthEnd.getTime();

            const monthSubmissions = safeSubmissions.filter(s => {
                const ts = new Date(s.timestamp || (s as any).createdAt || Date.now()).getTime();
                return ts >= startTs && ts <= endTs;
            });

            const totalOrders = monthSubmissions.length;

            const newMobiles = new Set<string>();
            monthSubmissions.forEach(s => {
                const mobile = String(s.mobileNumber || '').trim();
                if (!mobile) return;
                const firstTs = firstOrderTsByMobile.get(mobile);
                if (firstTs && firstTs >= startTs && firstTs <= endTs) {
                    newMobiles.add(mobile);
                }
            });

            const newCustomers = newMobiles.size;
            const repeatOrders = Math.max(0, totalOrders - newCustomers);
            const retentionRate = totalOrders > 0 ? Math.round((repeatOrders / totalOrders) * 100) : 0;

            return {
                month: monthLabel,
                totalOrders,
                newCustomers,
                repeatOrders,
                retentionRate,
            };
        });

        // Aggregates over the 6 months
        const sixMonthRepeatTotal = trendData.reduce((acc, curr) => acc + curr.repeatOrders, 0);
        const sixMonthTotalOrders = trendData.reduce((acc, curr) => acc + curr.totalOrders, 0);
        const avgRetentionRate = sixMonthTotalOrders > 0
            ? Math.round((sixMonthRepeatTotal / sixMonthTotalOrders) * 100)
            : 0;

        const lastMonthRepeat = trendData[5]?.repeatOrders || 0;
        const prevMonthRepeat = trendData[4]?.repeatOrders || 0;
        const momGrowth = prevMonthRepeat > 0
            ? Math.round(((lastMonthRepeat - prevMonthRepeat) / prevMonthRepeat) * 100)
            : (lastMonthRepeat > 0 ? 100 : 0);

        const peakMonthObj = [...trendData].sort((a, b) => b.repeatOrders - a.repeatOrders)[0];

        return {
            trendData,
            sixMonthRepeatTotal,
            sixMonthTotalOrders,
            avgRetentionRate,
            momGrowth,
            peakMonth: peakMonthObj?.month || 'N/A',
            peakRepeatOrders: peakMonthObj?.repeatOrders || 0,
        };
    }, [safeSubmissions]);

    // Churn prediction state
    const [selectedChurnCustomer, setSelectedChurnCustomer] = useState<CustomerProfile | null>(null);
    const [campaignType, setCampaignType] = useState<'sms' | 'email'>('sms');
    const [customSmsBody, setCustomSmsBody] = useState('');
    const [customEmailBody, setCustomEmailBody] = useState('');
    const [customSubject, setCustomSubject] = useState('');
    const [isCampaignSimulated, setIsCampaignSimulated] = useState(false);
    const [campaignMessage, setCampaignMessage] = useState('');
    const [churnRiskFilter, setChurnRiskFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
    const [churnSortKey, setChurnSortKey] = useState<'score' | 'recency' | 'frequency'>('score');

    // Retention Engine ROI Simulator & Gamification State
    const [targetUplift, setTargetUplift] = useState<number>(5);

    // Team Leaderboard & Agent Gamification Metrics
    const agentPerformanceLeaderboard = useMemo(() => {
        const map: Record<string, { username: string; logsCount: number; bookedCount: number }> = {};
        safeRetentionLogs.forEach(log => {
            const agent = log.agentUsername || 'System';
            if (!map[agent]) {
                map[agent] = { username: agent, logsCount: 0, bookedCount: 0 };
            }
            map[agent].logsCount += 1;
            if (log.outcome === 'BOOKED' || log.actionType === 'BOOKING_CREATED') {
                map[agent].bookedCount += 1;
            }
        });
        return Object.values(map)
            .map(a => ({
                ...a,
                convRate: a.logsCount > 0 ? Math.round((a.bookedCount / a.logsCount) * 100) : 0
            }))
            .sort((a, b) => b.bookedCount - a.bookedCount || b.logsCount - a.logsCount);
    }, [safeRetentionLogs]);

    // Helper to generate direct WhatsApp web links
    const buildWhatsAppUrl = (phone: string, text: string) => {
        const cleanPhone = String(phone || '').replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        return `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    };

    // Coupons State with LocalStorage persistence
    const [coupons, setCoupons] = useState<RetentionCoupon[]>(() => {
        try {
            const saved = localStorage.getItem('retention_coupons_v1');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return DEFAULT_RETENTION_COUPONS;
    });

    const handleSaveCoupon = (newCoupon: RetentionCoupon) => {
        setCoupons(prev => {
            const updated = [newCoupon, ...prev.filter(c => c.code !== newCoupon.code)];
            try {
                localStorage.setItem('retention_coupons_v1', JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
    };

    const handleDeleteCoupon = (couponId: string) => {
        setCoupons(prev => {
            const updated = prev.filter(c => c.id !== couponId);
            try {
                localStorage.setItem('retention_coupons_v1', JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
    };

    const defaultTargets: RetentionKpiTargets = safeSettings.retentionKpiTargets || {
        monthlyFollowUps: 15,
        conversionRatePercentage: 40,
        monthlyRevenue: 25000,
    };

    // Open Modals
    const handleOpenFollowUp = (target: CustomerFollowUpTarget) => {
        setFollowUpTarget(target);
        setIsFollowUpModalOpen(true);
    };

    const handleOpenBooking = (target: CustomerFollowUpTarget) => {
        setBookingTarget(target);
        setIsBookingModalOpen(true);
    };

    const handleInternalSaveLog = (log: RetentionActivityLog) => {
        if (onSaveRetentionLog) {
            onSaveRetentionLog(log);
        }
    };

    // Build customer profiles
    const customerProfiles = useMemo(() => {
        const profiles: Record<string, CustomerProfile> = {};

        safeSubmissions.forEach(s => {
            const key = s.mobileNumber;
            if (!key) return;

            const date = new Date(s.timestamp);
            if (isNaN(date.getTime())) return;

            if (!profiles[key]) {
                profiles[key] = {
                    mobileNumber: String(s.mobileNumber || ''),
                    firstName: String(s.customerFirstName || ''),
                    lastName: String(s.customerLastName || ''),
                    carNumber: String(s.carNumber || ''),
                    carBrandModel: String(s.carBrandModel || ''),
                    customerEmail: String(s.customerEmail || ''),
                    streetAddress: String(s.streetAddress || ''),
                    visits: [],
                    totalSpend: 0,
                    visitCount: 0,
                    firstVisit: date,
                    lastVisit: date,
                    daysSinceLast: 0,
                    servicesUsed: new Set<string>(),
                };
            } else if (!profiles[key].streetAddress && s.streetAddress) {
                profiles[key].streetAddress = String(s.streetAddress);
            }

            const p = profiles[key];
            p.visits.push(s);

            const price = Number(s.grandTotal || 0);
            p.totalSpend += price;

            if (date < p.firstVisit) p.firstVisit = date;
            if (date > p.lastVisit) p.lastVisit = date;

            if (s.serviceSelection && Array.isArray(s.serviceSelection)) {
                s.serviceSelection.forEach((srv: string) => p.servicesUsed.add(srv));
            } else if (typeof s.serviceSelection === 'string') {
                p.servicesUsed.add(s.serviceSelection);
            }
        });

        const now = new Date();
        Object.values(profiles).forEach(p => {
            p.visitCount = p.visits.length;
            p.daysSinceLast = daysBetween(now, p.lastVisit);

            let avgInterval = 60;
            if (p.visitCount > 1) {
                const totalSpanDays = daysBetween(p.lastVisit, p.firstVisit);
                avgInterval = Math.max(15, Math.round(totalSpanDays / (p.visitCount - 1)));
            }
            p.averageIntervalDays = avgInterval;

            const recencyScore = Math.min(100, (p.daysSinceLast / 120) * 100);
            const frequencyScore = p.visitCount >= 4 ? 15 : p.visitCount >= 2 ? 45 : 85;

            const expectedOverdue = p.daysSinceLast - avgInterval;
            let overdueMultiplier = 1.0;
            if (expectedOverdue > 60) overdueMultiplier = 1.4;
            else if (expectedOverdue > 20) overdueMultiplier = 1.25;
            else if (expectedOverdue > 0) overdueMultiplier = 1.1;
            else overdueMultiplier = 0.75;

            let finalScore = Math.round((recencyScore * 0.65 + frequencyScore * 0.35) * overdueMultiplier);
            finalScore = Math.min(100, Math.max(5, finalScore));
            p.churnScore = finalScore;

            if (finalScore >= 75) p.churnRisk = 'High';
            else if (finalScore >= 40) p.churnRisk = 'Medium';
            else p.churnRisk = 'Low';
        });

        return Object.values(profiles);
    }, [safeSubmissions]);

    // Mode state for Recharts Month-over-Month Drop-off Chart
    const [dropOffChartMode, setDropOffChartMode] = useState<'mom' | 'funnel'>('mom');

    // Customer Drop-Off Points & Lifecycle Attrition Data
    const customerDropOffMetrics = useMemo(() => {
        const totalCustomers = customerProfiles.length;
        if (totalCustomers === 0) {
            return {
                lifecycleFunnel: [],
                momDropOffData: [],
                highestDropOffStage: 'N/A',
                firstVisitDropOffCount: 0,
                firstVisitDropOffPct: 0,
            };
        }

        const count1 = totalCustomers;
        const count2 = customerProfiles.filter(p => p.visitCount >= 2).length;
        const count3 = customerProfiles.filter(p => p.visitCount >= 3).length;
        const count5 = customerProfiles.filter(p => p.visitCount >= 5).length;

        const dropOffAfter1st = count1 - count2;
        const dropOffAfter2nd = count2 - count3;
        const dropOffAfter3rd = count3 - count5;

        const lifecycleFunnel = [
            {
                stage: '1st Visit (New)',
                activeCustomers: count1,
                retainedPct: 100,
                dropOffCount: dropOffAfter1st,
                dropOffPct: Math.round((dropOffAfter1st / count1) * 100),
                fillColor: '#3b82f6',
            },
            {
                stage: '2nd Visit (Return)',
                activeCustomers: count2,
                retainedPct: Math.round((count2 / count1) * 100),
                dropOffCount: dropOffAfter2nd,
                dropOffPct: count2 > 0 ? Math.round((dropOffAfter2nd / count2) * 100) : 0,
                fillColor: '#10b981',
            },
            {
                stage: '3rd Visit (Repeat)',
                activeCustomers: count3,
                retainedPct: Math.round((count3 / count1) * 100),
                dropOffCount: dropOffAfter3rd,
                dropOffPct: count3 > 0 ? Math.round((dropOffAfter3rd / count3) * 100) : 0,
                fillColor: '#8b5cf6',
            },
            {
                stage: '5+ Visits (Loyal)',
                activeCustomers: count5,
                retainedPct: Math.round((count5 / count1) * 100),
                dropOffCount: 0,
                dropOffPct: 0,
                fillColor: '#f59e0b',
            },
        ];

        const momDropOffData = monthlyRetentionTrends.trendData.map(item => {
            const dropOffRate = 100 - item.retentionRate;
            return {
                month: item.month,
                retentionRate: item.retentionRate,
                dropOffRate,
                totalOrders: item.totalOrders,
                repeatOrders: item.repeatOrders,
                newCustomers: item.newCustomers,
                dropOffRisk: dropOffRate >= 50 ? 'High' : dropOffRate >= 30 ? 'Medium' : 'Low',
            };
        });

        const firstVisitDropOffPct = Math.round((dropOffAfter1st / count1) * 100);

        return {
            lifecycleFunnel,
            momDropOffData,
            highestDropOffStage: 'After 1st Service',
            firstVisitDropOffCount: dropOffAfter1st,
            firstVisitDropOffPct,
        };
    }, [customerProfiles, monthlyRetentionTrends.trendData]);

    // Unique locations extracted from active customer profiles
    const locationOptions = useMemo(() => {
        const set = new Set<string>();
        customerProfiles.forEach(p => {
            const addr = String(p.streetAddress || '').trim();
            if (addr) {
                set.add(addr);
            }
        });
        return Array.from(set).sort();
    }, [customerProfiles]);

    // Unique service types extracted from profiles
    const availableServiceTypes = useMemo(() => {
        const set = new Set<string>(['Car Washing', 'Car Care', 'Tyre Replacement', 'Battery Replacement']);
        customerProfiles.forEach(p => {
            p.servicesUsed.forEach(srv => set.add(srv));
        });
        return Array.from(set).sort();
    }, [customerProfiles]);

    // Dynamic service due days mapping based on custom cycle settings
    const dynamicServiceDueDays = useMemo<Record<string, number>>(() => ({
        'Car Washing': carWashIntervalDays,
        'Car Care': carCareIntervalDays,
        'Tyre Replacement': 180,
        'Battery Replacement': 730,
    }), [carWashIntervalDays, carCareIntervalDays]);

    // Calculate due list with service-wise differentiation
    const dueCustomers = useMemo(() => {
        const list: Array<{
            profile: CustomerProfile;
            dueService: string;
            daysOverdue: number;
            lastVisitDate: Date;
        }> = [];

        customerProfiles.forEach(p => {
            p.servicesUsed.forEach(srv => {
                let interval = dynamicServiceDueDays[srv];
                if (!interval) {
                    if (srv.toLowerCase().includes('wash')) interval = carWashIntervalDays;
                    else if (srv.toLowerCase().includes('care')) interval = carCareIntervalDays;
                    else interval = 30;
                }

                const srvVisits = p.visits.filter(v => {
                    if (Array.isArray(v.serviceSelection)) {
                        return v.serviceSelection.includes(srv);
                    }
                    return v.serviceSelection === srv;
                }).map(v => new Date(v.timestamp))
                  .sort((a, b) => b.getTime() - a.getTime());

                if (srvVisits.length === 0) return;

                const lastSrvDate = srvVisits[0];
                const daysSince = daysBetween(new Date(), lastSrvDate);
                if (daysSince > interval) {
                    list.push({
                        profile: p,
                        dueService: srv,
                        daysOverdue: daysSince - interval,
                        lastVisitDate: lastSrvDate,
                    });
                }
            });
        });

        return list.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }, [customerProfiles, dynamicServiceDueDays, carWashIntervalDays, carCareIntervalDays]);

    // Repeat customers
    const repeatCustomers = useMemo(() => {
        return customerProfiles.filter(p => p.visitCount > 1)
            .sort((a, b) => b.visitCount - a.visitCount);
    }, [customerProfiles]);

    // Enhanced filtered list for Due Customers
    const filteredDue = useMemo(() => {
        return dueCustomers.filter(item => {
            const query = searchQuery.toLowerCase().trim();
            if (query) {
                const name = `${item.profile.firstName || ''} ${item.profile.lastName || ''}`.toLowerCase();
                const phone = String(item.profile.mobileNumber || '').toLowerCase();
                const car = String(item.profile.carBrandModel || '').toLowerCase();
                const srv = String(item.dueService || '').toLowerCase();
                const addr = String(item.profile.streetAddress || '').toLowerCase();
                const matchesQuery = name.includes(query) || phone.includes(query) || car.includes(query) || srv.includes(query) || addr.includes(query);
                if (!matchesQuery) return false;
            }

            if (daysOverdueFilter !== 'all') {
                const reqDays = parseInt(daysOverdueFilter, 10);
                if (item.daysOverdue < reqDays) return false;
            }

            if (selectedServiceFilter !== 'all') {
                if (item.dueService !== selectedServiceFilter && !String(item.dueService || '').toLowerCase().includes(selectedServiceFilter.toLowerCase())) {
                    return false;
                }
            }

            if (selectedLocationFilter !== 'all') {
                if (!String(item.profile.streetAddress || '').toLowerCase().includes(selectedLocationFilter.toLowerCase())) {
                    return false;
                }
            }

            if (locationSearchQuery.trim()) {
                const locQ = locationSearchQuery.toLowerCase().trim();
                if (!String(item.profile.streetAddress || '').toLowerCase().includes(locQ)) {
                    return false;
                }
            }

            return true;
        });
    }, [dueCustomers, searchQuery, daysOverdueFilter, selectedServiceFilter, selectedLocationFilter, locationSearchQuery]);

    // Enhanced filtered list for Repeat Customers
    const filteredRepeat = useMemo(() => {
        return repeatCustomers.filter(p => {
            const query = searchQuery.toLowerCase().trim();
            if (query) {
                const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
                const phone = String(p.mobileNumber || '').toLowerCase();
                const car = String(p.carBrandModel || '').toLowerCase();
                const addr = String(p.streetAddress || '').toLowerCase();
                if (!name.includes(query) && !phone.includes(query) && !car.includes(query) && !addr.includes(query)) return false;
            }

            if (daysOverdueFilter !== 'all') {
                const reqDays = parseInt(daysOverdueFilter, 10);
                if (p.daysSinceLast < reqDays) return false;
            }

            if (selectedServiceFilter !== 'all') {
                const hasSrv = Array.from(p.servicesUsed).some(s => s === selectedServiceFilter || String(s || '').toLowerCase().includes(selectedServiceFilter.toLowerCase()));
                if (!hasSrv) return false;
            }

            if (selectedLocationFilter !== 'all') {
                if (!String(p.streetAddress || '').toLowerCase().includes(selectedLocationFilter.toLowerCase())) return false;
            }

            if (locationSearchQuery.trim()) {
                const locQ = locationSearchQuery.toLowerCase().trim();
                if (!String(p.streetAddress || '').toLowerCase().includes(locQ)) return false;
            }

            return true;
        });
    }, [repeatCustomers, searchQuery, daysOverdueFilter, selectedServiceFilter, selectedLocationFilter, locationSearchQuery]);

    // Enhanced filtered list for Churn Risk
    const filteredChurn = useMemo(() => {
        let list = [...customerProfiles];

        if (churnRiskFilter !== 'All') {
            list = list.filter(p => p.churnRisk === churnRiskFilter);
        }

        if (daysOverdueFilter !== 'all') {
            const reqDays = parseInt(daysOverdueFilter, 10);
            list = list.filter(p => p.daysSinceLast >= reqDays);
        }

        if (selectedServiceFilter !== 'all') {
            list = list.filter(p => Array.from(p.servicesUsed).some(s => s === selectedServiceFilter || String(s || '').toLowerCase().includes(selectedServiceFilter.toLowerCase())));
        }

        if (selectedLocationFilter !== 'all') {
            list = list.filter(p => String(p.streetAddress || '').toLowerCase().includes(selectedLocationFilter.toLowerCase()));
        }

        if (locationSearchQuery.trim()) {
            const locQ = locationSearchQuery.toLowerCase().trim();
            list = list.filter(p => String(p.streetAddress || '').toLowerCase().includes(locQ));
        }

        const query = searchQuery.toLowerCase().trim();
        if (query) {
            list = list.filter(p => {
                const name = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
                const phone = String(p.mobileNumber || '').toLowerCase();
                const car = String(p.carBrandModel || '').toLowerCase();
                const addr = String(p.streetAddress || '').toLowerCase();
                return name.includes(query) || phone.includes(query) || car.includes(query) || addr.includes(query);
            });
        }

        list.sort((a, b) => {
            const scoreA = a.churnScore ?? 0;
            const scoreB = b.churnScore ?? 0;
            const recencyA = a.daysSinceLast ?? 0;
            const recencyB = b.daysSinceLast ?? 0;
            const freqA = a.visitCount ?? 0;
            const freqB = b.visitCount ?? 0;

            if (churnSortKey === 'score') return scoreB - scoreA;
            if (churnSortKey === 'recency') return recencyB - recencyA;
            return freqA - freqB;
        });

        return list;
    }, [customerProfiles, churnRiskFilter, churnSortKey, searchQuery, daysOverdueFilter, selectedServiceFilter, selectedLocationFilter, locationSearchQuery]);

    // Filtered Period Total Revenue
    const currentMonthRevenue = useMemo(() => {
        return filteredPeriodSubmissions.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
    }, [filteredPeriodSubmissions]);

    // ROI Growth Projection Math
    const roiProjections = useMemo(() => {
        const totalOrders = biRetentionMetrics.totalOrders || 1;
        const avgOrderValue = totalOrders > 0 ? (currentMonthRevenue / totalOrders) : 1500;
        const additionalRepeatOrdersMonthly = Math.round(totalOrders * (targetUplift / 100));
        const monthlyRevenueAddition = Math.round(additionalRepeatOrdersMonthly * avgOrderValue);
        const annualizedRevenueAddition = monthlyRevenueAddition * 12;

        return {
            additionalRepeatOrdersMonthly,
            monthlyRevenueAddition,
            annualizedRevenueAddition,
            avgOrderValue: Math.round(avgOrderValue),
        };
    }, [biRetentionMetrics.totalOrders, currentMonthRevenue, targetUplift]);

    // Live KPI Progress metrics for Selected Period
    const statsKPIs = useMemo(() => {
        const loggedCount = filteredPeriodRetentionLogs.length;
        const bookedCount = filteredPeriodRetentionLogs.filter(l => l.outcome === 'BOOKED' || l.actionType === 'BOOKING_CREATED').length;
        const actualConversion = loggedCount > 0 ? Math.round((bookedCount / loggedCount) * 100) : 0;

        const retainedRevenue = filteredPeriodSubmissions
            .filter(s => s.isFollowUp || s.submittedBy === 'followup')
            .reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);

        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysRemaining = Math.max(1, daysInMonth - currentDay);

        const targetRevenue = defaultTargets.monthlyRevenue || 1;
        const totalRevPct = Math.round((currentMonthRevenue / targetRevenue) * 100);
        const retainedRevPct = Math.round((retainedRevenue / targetRevenue) * 100);
        const revenueRemaining = Math.max(0, targetRevenue - currentMonthRevenue);
        const dailyRunRateNeeded = Math.round(revenueRemaining / daysRemaining);

        return {
            actualFollowUps: loggedCount,
            actualConversionRate: actualConversion,
            actualRevenue: retainedRevenue,
            currentMonthRevenue,
            totalRevPct,
            retainedRevPct,
            revenueRemaining,
            dailyRunRateNeeded,
            daysRemaining,
        };
    }, [filteredPeriodRetentionLogs, filteredPeriodSubmissions, currentMonthRevenue, defaultTargets.monthlyRevenue]);

    // Open Re-Engagement modal
    const openReEngagement = (p: CustomerProfile) => {
        setSelectedChurnCustomer(p);
        setIsCampaignSimulated(false);
        setCampaignMessage('');

        const code = p.churnRisk === 'High' ? 'WE_MISS_YOU_20' : p.churnRisk === 'Medium' ? 'SPARK_BACK_15' : 'VIP_LOYALTY_10';
        const discountAmount = p.churnRisk === 'High' ? '20%' : p.churnRisk === 'Medium' ? '15%' : '10%';
        const lastService = Array.from(p.servicesUsed)[0] || 'Premium Car Care';

        const sms = `Hey ${p.firstName}! It's been ${p.daysSinceLast} days since your last ${lastService} at Big Engine Service. Grab ${discountAmount} OFF on your next booking with code ${code}. Book now: https://bigengine.in/book`;
        setCustomSmsBody(sms);

        const subject = `We miss you & your ${p.carBrandModel} at Big Engine Service!`;
        setCustomSubject(subject);

        const email = `Dear ${p.firstName} ${p.lastName},\n\nWe hope you're doing well! It has been ${p.daysSinceLast} days since your last visit on ${p.lastVisit.toLocaleDateString()} for your ${p.carBrandModel}.\n\nReturn Coupon: ${code} (Get ${discountAmount} OFF)\n\nBook Online: https://bigengine.in/book`;
        setCustomEmailBody(email);
        setCampaignType('sms');
    };

    // Download CSV Handler for Retention Metrics & Customer Timelines
    const handleExportRetentionCSV = () => {
        const escapeCsvCell = (val: any): string => {
            if (val === null || val === undefined) return '""';
            const str = String(val);
            if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return `"${str}"`;
        };

        const csvRows: string[] = [];

        // Report Title & Metadata
        csvRows.push(escapeCsvCell("CUSTOMER RETENTION & TIMELINE DATA REPORT"));
        csvRows.push(escapeCsvCell(`Generated Date: ${new Date().toLocaleString()}`));
        csvRows.push("");

        // 1. KPI Metrics Section
        csvRows.push(escapeCsvCell("1. OVERALL RETENTION KPI METRICS"));
        csvRows.push([escapeCsvCell("Metric Name"), escapeCsvCell("Value"), escapeCsvCell("Unit/Description")].join(","));
        csvRows.push([escapeCsvCell("BI Retention Rate"), escapeCsvCell(`${biRetentionMetrics.retentionRate}%`), escapeCsvCell("Repeat Orders / Total Orders")].join(","));
        csvRows.push([escapeCsvCell("Total System Orders"), escapeCsvCell(biRetentionMetrics.totalOrders), escapeCsvCell("Count of all submissions")].join(","));
        csvRows.push([escapeCsvCell("Unique New Customer Mobiles"), escapeCsvCell(biRetentionMetrics.uniqueNewCustomerMobileNumbers), escapeCsvCell("Count of unique mobile numbers")].join(","));
        csvRows.push([escapeCsvCell("Repeat Customer Orders"), escapeCsvCell(biRetentionMetrics.repeatCustomerOrders), escapeCsvCell("Total Orders minus Unique New Mobiles")].join(","));
        csvRows.push([escapeCsvCell("6-Month Total Repeat Orders"), escapeCsvCell(monthlyRetentionTrends.sixMonthRepeatTotal), escapeCsvCell("Sum over past 6 months")].join(","));
        csvRows.push([escapeCsvCell("6-Month Avg Retention Rate"), escapeCsvCell(`${monthlyRetentionTrends.avgRetentionRate}%`), escapeCsvCell("6-month aggregated retention rate")].join(","));
        csvRows.push([escapeCsvCell("Month-over-Month Growth"), escapeCsvCell(`${monthlyRetentionTrends.momGrowth >= 0 ? '+' : ''}${monthlyRetentionTrends.momGrowth}%`), escapeCsvCell("Recent vs prior month repeat growth")].join(","));
        csvRows.push([escapeCsvCell("Peak Acquisition Month"), escapeCsvCell(monthlyRetentionTrends.peakMonth), escapeCsvCell(`${monthlyRetentionTrends.peakRepeatOrders} repeat orders`)].join(","));
        csvRows.push([escapeCsvCell("Follow-ups Logged"), escapeCsvCell(statsKPIs.actualFollowUps), escapeCsvCell(`Goal: ${defaultTargets.monthlyFollowUps}`)].join(","));
        csvRows.push([escapeCsvCell("Re-engagement Conversion Rate"), escapeCsvCell(`${statsKPIs.actualConversionRate}%`), escapeCsvCell(`Goal: ${defaultTargets.conversionRatePercentage}%`)].join(","));
        csvRows.push([escapeCsvCell("Retained Revenue"), escapeCsvCell(`₹${statsKPIs.actualRevenue.toLocaleString('en-IN')}`), escapeCsvCell(`Goal: ₹${defaultTargets.monthlyRevenue.toLocaleString('en-IN')}`)].join(","));
        csvRows.push("");

        // 2. 6-Month Repeat Customer Trends Section
        csvRows.push(escapeCsvCell("2. 6-MONTH REPEAT CUSTOMER ACQUISITION TRENDS"));
        csvRows.push([escapeCsvCell("Month"), escapeCsvCell("Repeat Customer Orders"), escapeCsvCell("New Customer Mobiles"), escapeCsvCell("Total Monthly Orders"), escapeCsvCell("Retention Rate (%)")].join(","));
        monthlyRetentionTrends.trendData.forEach(trend => {
            csvRows.push([
                escapeCsvCell(trend.month),
                escapeCsvCell(trend.repeatOrders),
                escapeCsvCell(trend.newCustomers),
                escapeCsvCell(trend.totalOrders),
                escapeCsvCell(`${trend.retentionRate}%`)
            ].join(","));
        });
        csvRows.push("");

        // 3. Customer Retention Profiles & Timelines Section
        csvRows.push(escapeCsvCell("3. CUSTOMER TIMELINES & RETENTION PROFILES"));
        csvRows.push([
            escapeCsvCell("Customer Name"),
            escapeCsvCell("Mobile Number"),
            escapeCsvCell("Email"),
            escapeCsvCell("Vehicle Model"),
            escapeCsvCell("Vehicle Plate"),
            escapeCsvCell("Location / Address"),
            escapeCsvCell("Total Visits"),
            escapeCsvCell("Days Since Last Visit"),
            escapeCsvCell("First Visit Date"),
            escapeCsvCell("Last Visit Date"),
            escapeCsvCell("Total Spend (₹)"),
            escapeCsvCell("Churn Risk Level"),
            escapeCsvCell("Churn Risk Score"),
            escapeCsvCell("Services Used")
        ].join(","));

        customerProfiles.forEach(p => {
            csvRows.push([
                escapeCsvCell(`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'N/A'),
                escapeCsvCell(p.mobileNumber || ''),
                escapeCsvCell(p.customerEmail || ''),
                escapeCsvCell(p.carBrandModel || 'N/A'),
                escapeCsvCell(p.carNumber || 'N/A'),
                escapeCsvCell(p.streetAddress || 'N/A'),
                escapeCsvCell(p.visitCount || 0),
                escapeCsvCell(p.daysSinceLast || 0),
                escapeCsvCell(p.firstVisit ? new Date(p.firstVisit).toISOString().split('T')[0] : 'N/A'),
                escapeCsvCell(p.lastVisit ? new Date(p.lastVisit).toISOString().split('T')[0] : 'N/A'),
                escapeCsvCell(p.totalSpend || 0),
                escapeCsvCell(p.churnRisk || 'Low'),
                escapeCsvCell(p.churnScore || 0),
                escapeCsvCell(Array.from(p.servicesUsed || []).join('; ') || 'N/A')
            ].join(","));
        });
        csvRows.push("");

        // 4. Retention Activity Logs Section
        csvRows.push(escapeCsvCell("4. RETENTION OUTREACH & ACTIVITY LOGS"));
        csvRows.push([
            escapeCsvCell("Log Date"),
            escapeCsvCell("Customer Name"),
            escapeCsvCell("Customer Phone"),
            escapeCsvCell("Agent Username"),
            escapeCsvCell("Action Type"),
            escapeCsvCell("Outcome"),
            escapeCsvCell("Notes")
        ].join(","));

        retentionLogs.forEach(log => {
            csvRows.push([
                escapeCsvCell(log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'),
                escapeCsvCell(log.customerName || 'N/A'),
                escapeCsvCell(log.customerPhone || 'N/A'),
                escapeCsvCell(log.agentUsername || 'system'),
                escapeCsvCell(log.actionType || 'N/A'),
                escapeCsvCell(log.outcome || 'N/A'),
                escapeCsvCell(log.notes || '')
            ].join(","));
        });

        // Trigger CSV File Download
        const csvString = csvRows.join("\n");
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const fileName = `Retention_Metrics_And_Timelines_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (isLoading || isHydrated === false || !submissions) {
        return <SkeletonLoader view="RETENTION" />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <span>⚡ Customer Retention Engine</span>
                        <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                            Pro Sales Hub
                        </span>
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Predict churn, log team follow-up touchpoints, dispatch promo offers, and convert due services to direct bookings.
                    </p>
                </div>
                <div className="flex items-center space-x-2">
                    <Button onClick={handleExportRetentionCSV} variant="secondary" className="shadow-2xs text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 border-none">
                        <IconDownload className="w-4 h-4 mr-1.5 text-blue-400" />
                        Download CSV Report
                    </Button>
                    <Button onClick={() => setIsSettingsOpen(true)} variant="secondary" className="shadow-2xs text-xs font-bold">
                        <IconSettings className="w-4 h-4 mr-1.5" />
                        KPI Goals
                    </Button>
                </div>
            </div>

            {/* 📅 DATE RANGE PICKER FILTER BAR */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
                            <IconCalendar className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                    Retention Performance Date Range
                                </h3>
                                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                                    📅 {dateRangeBounds.label}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                Select a date range to filter retention rates, progress bar metrics, and customer timelines ({filteredPeriodSubmissions.length} orders found)
                            </p>
                        </div>
                    </div>

                    {/* Preset Buttons */}
                    <div className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-xl text-xs font-bold border border-slate-200/80">
                        {[
                            { id: 'current_month', label: 'Current Month' },
                            { id: 'last_month', label: 'Last Month' },
                            { id: 'last_30_days', label: 'Last 30 Days' },
                            { id: 'last_90_days', label: 'Last 90 Days' },
                            { id: 'this_year', label: 'This Year' },
                            { id: 'all_time', label: 'All Time' },
                            { id: 'custom', label: 'Custom Range' },
                        ].map(preset => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => setDatePreset(preset.id as any)}
                                className={`px-2.5 py-1.5 rounded-lg transition-all text-[11px] ${
                                    datePreset === preset.id
                                        ? 'bg-white text-indigo-700 shadow-2xs font-extrabold border border-indigo-200'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                                }`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Date Picker Sub-row */}
                {datePreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 text-xs bg-indigo-50/40 p-3 rounded-xl border border-indigo-100/60">
                        <div className="flex items-center gap-2">
                            <label className="font-bold text-slate-700">Start Date:</label>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={(e) => setCustomStartDate(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-2xs"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="font-bold text-slate-700">End Date:</label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={(e) => setCustomEndDate(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white shadow-2xs"
                            />
                        </div>
                        {(customStartDate || customEndDate) && (
                            <button
                                type="button"
                                onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                                className="text-xs text-rose-600 hover:text-rose-800 font-bold underline ml-auto"
                            >
                                Reset Dates
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* KPI Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. BI Retention Rate Card */}
                <PulsingKpiCard refreshKey={`${biRetentionMetrics.retentionRate}-${biRetentionMetrics.totalOrders}-${datePreset}`} className="border-l-4 border-l-indigo-600 shadow-2xs">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">BI Retention Rate</p>
                                <span className="text-[9px] bg-indigo-100 text-indigo-900 font-bold px-1.5 py-0.2 rounded">Order Logic</span>
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                                <AnimatedCountUp value={biRetentionMetrics.retentionRate} suffix="%" />{' '}
                                <span className="text-xs font-semibold text-slate-500">
                                    (<AnimatedCountUp value={biRetentionMetrics.repeatCustomerOrders} /> Repeat)
                                </span>
                            </h3>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                            <IconChartBar className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-200/80 space-y-1">
                        <div className="flex justify-between font-bold">
                            <span>Total Orders: <strong><AnimatedCountUp value={biRetentionMetrics.totalOrders} /></strong></span>
                            <span>New Mobiles: <strong><AnimatedCountUp value={biRetentionMetrics.uniqueNewCustomerMobileNumbers} /></strong></span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-mono">
                            Repeat = Orders ({biRetentionMetrics.totalOrders}) - Unique Mobiles ({biRetentionMetrics.uniqueNewCustomerMobileNumbers}) = {biRetentionMetrics.repeatCustomerOrders}
                        </p>
                    </div>
                </PulsingKpiCard>

                {/* 2. Follow-Ups Logged Card */}
                <PulsingKpiCard refreshKey={`${statsKPIs.actualFollowUps}-${defaultTargets.monthlyFollowUps}-${datePreset}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Follow-Ups Logged</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                                <AnimatedCountUp value={statsKPIs.actualFollowUps} />{' '}
                                <span className="text-sm font-semibold text-slate-500">
                                    / <AnimatedCountUp value={defaultTargets.monthlyFollowUps} /> Goal
                                </span>
                            </h3>
                        </div>
                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                            <IconPhone className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>Monthly Goal Progress</span>
                            <span><AnimatedCountUp value={Math.round((statsKPIs.actualFollowUps / (defaultTargets.monthlyFollowUps || 1)) * 100)} suffix="%" /></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (statsKPIs.actualFollowUps / (defaultTargets.monthlyFollowUps || 1)) * 100)}%` }}></div>
                        </div>
                    </div>
                </PulsingKpiCard>

                {/* 3. Conversion Rate % Card */}
                <PulsingKpiCard refreshKey={`${statsKPIs.actualConversionRate}-${defaultTargets.conversionRatePercentage}-${datePreset}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conversion Rate %</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                                <AnimatedCountUp value={statsKPIs.actualConversionRate} suffix="%" />{' '}
                                <span className="text-sm font-semibold text-slate-500">
                                    / <AnimatedCountUp value={defaultTargets.conversionRatePercentage} suffix="%" /> Goal
                                </span>
                            </h3>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
                            <IconUserCheck className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>Conversion Target Margin</span>
                            <span><AnimatedCountUp value={Math.round((statsKPIs.actualConversionRate / (defaultTargets.conversionRatePercentage || 1)) * 100)} suffix="%" /></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (statsKPIs.actualConversionRate / (defaultTargets.conversionRatePercentage || 1)) * 100)}%` }}></div>
                        </div>
                    </div>
                </PulsingKpiCard>

                {/* 4. Retained Revenue Card */}
                <PulsingKpiCard refreshKey={`${statsKPIs.actualRevenue}-${defaultTargets.monthlyRevenue}-${datePreset}`}>
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Retained Revenue</p>
                            <h3 className="text-2xl font-bold text-slate-900 mt-1">
                                <AnimatedCountUp value={statsKPIs.actualRevenue} prefix="₹" formatCurrency />{' '}
                                <span className="text-sm font-semibold text-slate-500">
                                    / <AnimatedCountUp value={defaultTargets.monthlyRevenue} prefix="₹" formatCurrency /> Goal
                                </span>
                            </h3>
                        </div>
                        <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
                            <IconCreditCard className="w-6 h-6" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                            <span>Revenue Target Progress</span>
                            <span><AnimatedCountUp value={Math.round((statsKPIs.actualRevenue / (defaultTargets.monthlyRevenue || 1)) * 100)} suffix="%" /></span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (statsKPIs.actualRevenue / (defaultTargets.monthlyRevenue || 1)) * 100)}%` }}></div>
                        </div>
                    </div>
                </PulsingKpiCard>
            </div>

            {/* 🎯 VISUAL REVENUE KPI TARGET PROGRESS BAR WIDGET */}
            <Card className="border border-slate-200 shadow-2xs overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                            <IconCreditCard className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <span>Monthly Revenue KPI Target Tracker</span>
                                </h3>
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                                    statsKPIs.totalRevPct >= 100
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : statsKPIs.totalRevPct >= 75
                                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}>
                                    {statsKPIs.totalRevPct >= 100
                                        ? '🎉 Target Achieved!'
                                        : statsKPIs.totalRevPct >= 75
                                        ? '🚀 Near Target'
                                        : '📈 Goal In Progress'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-300 font-medium mt-0.5">
                                Filtered Period ({dateRangeBounds.label}) Revenue vs Target Goal (₹{defaultTargets.monthlyRevenue.toLocaleString('en-IN')})
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Configured KPI Target</span>
                            <span className="text-lg font-bold text-amber-300">₹{defaultTargets.monthlyRevenue.toLocaleString('en-IN')}</span>
                        </div>
                        <Button
                            onClick={() => setIsSettingsOpen(true)}
                            size="sm"
                            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold"
                        >
                            <IconSettings className="w-3.5 h-3.5 mr-1" />
                            Adjust Goal
                        </Button>
                    </div>
                </div>

                {/* Main Progress Bar Container */}
                <div className="pt-4 pb-1 space-y-4">
                    {/* Top Stats Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-700/60 text-xs">
                        <div>
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Period Total Revenue</span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-lg font-bold text-emerald-400">
                                    <AnimatedCountUp value={statsKPIs.currentMonthRevenue} prefix="₹" formatCurrency />
                                </span>
                                <span className="text-[10px] text-emerald-300 font-bold">
                                    (<AnimatedCountUp value={statsKPIs.totalRevPct} suffix="%" />)
                                </span>
                            </div>
                        </div>
                        <div>
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Retained Customer Revenue</span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-lg font-bold text-amber-300">
                                    <AnimatedCountUp value={statsKPIs.actualRevenue} prefix="₹" formatCurrency />
                                </span>
                                <span className="text-[10px] text-amber-200 font-bold">
                                    (<AnimatedCountUp value={statsKPIs.retainedRevPct} suffix="%" /> of goal)
                                </span>
                            </div>
                        </div>
                        <div>
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Remaining Target Gap</span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-lg font-bold text-slate-200">
                                    {statsKPIs.revenueRemaining > 0 ? (
                                        <AnimatedCountUp value={statsKPIs.revenueRemaining} prefix="₹" formatCurrency />
                                    ) : (
                                        'Goal Reached'
                                    )}
                                </span>
                            </div>
                        </div>
                        <div>
                            <span className="text-slate-400 font-medium text-[10px] uppercase tracking-wider block">Required Daily Pace</span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-lg font-bold text-blue-300">
                                    {statsKPIs.revenueRemaining > 0 ? (
                                        <AnimatedCountUp value={statsKPIs.dailyRunRateNeeded} prefix="₹" suffix="/day" formatCurrency />
                                    ) : (
                                        '₹0/day'
                                    )}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">({statsKPIs.daysRemaining}d left)</span>
                            </div>
                        </div>
                    </div>

                    {/* Styled Multi-Layered Visual Progress Bar */}
                    <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                            <span className="flex items-center gap-1.5">
                                <span>Progress towards ₹{defaultTargets.monthlyRevenue.toLocaleString('en-IN')} target:</span>
                                <strong className="text-emerald-400 font-bold">{statsKPIs.totalRevPct}%</strong>
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                                ₹{statsKPIs.currentMonthRevenue.toLocaleString('en-IN')} / ₹{defaultTargets.monthlyRevenue.toLocaleString('en-IN')}
                            </span>
                        </div>

                        {/* Progress Bar Track */}
                        <div className="relative w-full h-5 bg-slate-900/90 rounded-full border border-slate-700/80 p-0.5 shadow-inner">
                            {/* Retained Revenue Layer (Sub-bar) */}
                            {statsKPIs.retainedRevPct > 0 && (
                                <div
                                    className="absolute left-0.5 top-0.5 bottom-0.5 bg-amber-500/40 rounded-full z-10 transition-all duration-500"
                                    style={{ width: `${Math.min(100, statsKPIs.retainedRevPct)}%` }}
                                    title={`Retained Revenue: ₹${statsKPIs.actualRevenue.toLocaleString('en-IN')} (${statsKPIs.retainedRevPct}%)`}
                                />
                            )}

                            {/* Total Current Month Revenue Bar */}
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-700 shadow-md relative z-20 flex items-center justify-end pr-2 overflow-hidden"
                                style={{ width: `${Math.min(100, statsKPIs.totalRevPct)}%` }}
                            >
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-stripes opacity-40"></div>
                            </div>

                            {/* Milestone Marker Lines (25%, 50%, 75%, 100%) */}
                            <div className="absolute inset-0 pointer-events-none flex justify-between px-1 items-center z-30">
                                <div className="h-full border-r border-slate-700/60 left-[25%] absolute" />
                                <div className="h-full border-r border-slate-700/60 left-[50%] absolute" />
                                <div className="h-full border-r border-slate-700/60 left-[75%] absolute" />
                                <div className="h-full border-r border-emerald-400/80 left-[100%] absolute" />
                            </div>
                        </div>

                        {/* Milestone Tick Labels */}
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-1 pt-0.5 font-mono">
                            <span>0%</span>
                            <span>25%</span>
                            <span>50%</span>
                            <span>75%</span>
                            <span className="text-emerald-400 font-bold">100% Target</span>
                        </div>
                    </div>
                </div>
            </Card>

            {/* 🚀 1-CLICK RETENTION PLAYBOOK DISPATCHER & ROI SIMULATOR */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. Smart Action Playbooks (2 cols) */}
                <Card className="lg:col-span-2 border border-indigo-100 bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 shadow-2xs">
                    <div className="flex items-center justify-between pb-3 border-b border-indigo-100/80">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                                <IconSparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                                    <span>Smart Retention Playbook Engine</span>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                        ⚡ High Conversion
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">
                                    Pre-built high-impact campaigns tailored to push your retention percentage
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
                        {/* Playbook 1 */}
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2 hover:border-indigo-400 transition-all">
                            <div>
                                <div className="flex justify-between items-start">
                                    <span className="text-xs font-black text-indigo-900 flex items-center gap-1">
                                        💧 Wash Re-Engagement
                                    </span>
                                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded-full">
                                        {filteredDue.filter(d => d.dueService.toLowerCase().includes('wash')).length} Targets
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                    Trigger 15-day routine wash reminders with 1-click WhatsApp messaging.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 shadow-2xs"
                                onClick={() => {
                                    setSelectedServiceFilter('Car Washing');
                                    setDaysOverdueFilter('15');
                                    setActiveTab('due');
                                }}
                            >
                                🎯 Execute Playbook
                            </Button>
                        </div>

                        {/* Playbook 2 */}
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2 hover:border-rose-400 transition-all">
                            <div>
                                <div className="flex justify-between items-start">
                                    <span className="text-xs font-black text-rose-900 flex items-center gap-1">
                                        ⚠️ High Churn Rescue
                                    </span>
                                    <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded-full">
                                        {filteredChurn.filter(p => p.churnRisk === 'High').length} At Risk
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                    Dispatch 20% OFF VIP Return Coupon (`WE_MISS_YOU_20`) to top inactive accounts.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                className="w-full text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 shadow-2xs"
                                onClick={() => {
                                    setChurnRiskFilter('High');
                                    setActiveTab('churn');
                                }}
                            >
                                🛡️ Launch VIP Rescue
                            </Button>
                        </div>

                        {/* Playbook 3 */}
                        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between space-y-2 hover:border-emerald-400 transition-all">
                            <div>
                                <div className="flex justify-between items-start">
                                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1">
                                        🎯 Pipeline SLA Sprints
                                    </span>
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                                        SLA Board
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                                    Move uncontacted due customers into scheduled follow-ups & direct bookings.
                                </p>
                            </div>
                            <Button
                                size="sm"
                                className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 shadow-2xs"
                                onClick={() => {
                                    setActiveTab('pipeline');
                                }}
                            >
                                ⚡ Open Sales Board
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* 2. Retention ROI & Revenue Growth Calculator (1 col) */}
                <Card className="border border-emerald-200 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                                <IconCreditCard className="w-4 h-4" />
                            </div>
                            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                Retention ROI Simulator
                            </h3>
                        </div>
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                            Revenue Boost
                        </span>
                    </div>

                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center font-bold">
                            <span className="text-slate-600">Target Retention Uplift:</span>
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs font-mono">
                                +{targetUplift}% Boost
                            </span>
                        </div>

                        {/* Slider Controls */}
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            {[2, 5, 10, 15].map(val => (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => setTargetUplift(val)}
                                    className={`flex-1 py-1 text-[11px] font-bold rounded transition-all ${
                                        targetUplift === val
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    +{val}%
                                </button>
                            ))}
                        </div>

                        {/* Projected Revenue Gain Output Box */}
                        <div className="bg-slate-900 text-white p-3 rounded-xl space-y-1.5 shadow-inner">
                            <div className="flex justify-between items-center text-[11px] text-slate-300">
                                <span>Extra Repeat Bookings / Mo:</span>
                                <strong className="text-emerald-400 font-extrabold">+{roiProjections.additionalRepeatOrdersMonthly} orders</strong>
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-slate-300">
                                <span>Monthly Revenue Boost:</span>
                                <strong className="text-emerald-300 font-extrabold">₹{roiProjections.monthlyRevenueAddition.toLocaleString('en-IN')}</strong>
                            </div>
                            <div className="pt-1 border-t border-slate-700 flex justify-between items-center font-black text-xs text-amber-300">
                                <span>Annualized ARR Addition:</span>
                                <span className="text-sm text-amber-400">+₹{roiProjections.annualizedRevenueAddition.toLocaleString('en-IN')}</span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* 🏆 TEAM RETENTION GAMIFICATION & AGENT LEADERBOARD */}
            {agentPerformanceLeaderboard.length > 0 && (
                <Card className="border border-amber-200 bg-gradient-to-r from-amber-50/40 via-white to-orange-50/40 shadow-2xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-100">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                                <IconTrophy className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                    <span>Retention Champions & Team Leaderboard</span>
                                    <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                                        🏆 Live Gamification
                                    </span>
                                </h3>
                                <p className="text-xs text-slate-500 font-medium">
                                    Top team members actively saving accounts and converting retention follow-ups
                                </p>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 font-bold">
                            Total Agent Touchpoints: <strong className="text-slate-900">{retentionLogs.length}</strong>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {agentPerformanceLeaderboard.slice(0, 4).map((agent, index) => {
                            const badge = index === 0 ? '🥇 #1 Champion' : index === 1 ? '🥈 #2 Specialist' : index === 2 ? '🥉 #3 Guardian' : '⭐ Contender';
                            const badgeBg = index === 0 ? 'bg-amber-100 text-amber-900 border-amber-300' : index === 1 ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-orange-100 text-orange-900 border-orange-300';

                            return (
                                <div key={agent.username} className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5 flex flex-col justify-between">
                                    <div className="flex justify-between items-center">
                                        <span className="font-extrabold text-slate-900 truncate" title={agent.username}>
                                            👤 {agent.username}
                                        </span>
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                                            {badge}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-1 bg-slate-50 p-2 rounded-lg text-[11px] font-medium border border-slate-100">
                                        <div>
                                            <span className="text-slate-400 text-[9px] uppercase block font-bold">Contacts</span>
                                            <strong className="text-slate-800 text-xs">{agent.logsCount}</strong>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 text-[9px] uppercase block font-bold">Converted</span>
                                            <strong className="text-emerald-700 text-xs">{agent.bookedCount} ({agent.convRate}%)</strong>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* 📈 BUSINESS INTELLIGENCE: 6-MONTH REPEAT CUSTOMER ACQUISITION TREND LINE CHART */}
            <Card className="border border-slate-200 shadow-2xs overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-brand-blue rounded-xl border border-blue-100 shadow-2xs">
                            <IconChartBar className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 tracking-tight">
                                    Repeat Customer Acquisition Trends
                                </h3>
                                <span className="text-[10px] bg-blue-100 text-blue-900 font-extrabold px-2.5 py-0.5 rounded-full border border-blue-200">
                                    Last 6 Months
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Visualizing monthly repeat order volumes vs. retention rate (%) across historical orders
                            </p>
                        </div>
                    </div>

                    {/* Chart Mode Toggle */}
                    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl text-xs font-bold border border-slate-200/80 self-start md:self-auto">
                        <button
                            type="button"
                            onClick={() => setChartView('all')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                chartView === 'all'
                                    ? 'bg-white text-brand-blue shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Combined View
                        </button>
                        <button
                            type="button"
                            onClick={() => setChartView('repeat')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                chartView === 'repeat'
                                    ? 'bg-white text-brand-blue shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Repeat Orders
                        </button>
                        <button
                            type="button"
                            onClick={() => setChartView('rate')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                chartView === 'rate'
                                    ? 'bg-white text-emerald-700 shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Retention Rate (%)
                        </button>
                    </div>
                </div>

                {/* 6-Month Metric Summary Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">6-Mo Repeat Volume</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-brand-blue">{monthlyRetentionTrends.sixMonthRepeatTotal}</span>
                            <span className="text-[11px] text-slate-500 font-medium">Orders</span>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">Average Retention Rate</span>
                        <span className="text-lg font-black text-emerald-600">{monthlyRetentionTrends.avgRetentionRate}%</span>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">MoM Growth Trend</span>
                        <span className={`text-lg font-black ${monthlyRetentionTrends.momGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {monthlyRetentionTrends.momGrowth >= 0 ? `+${monthlyRetentionTrends.momGrowth}%` : `${monthlyRetentionTrends.momGrowth}%`}
                        </span>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">Peak Acquisition Month</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-slate-800">{monthlyRetentionTrends.peakMonth}</span>
                            <span className="text-[11px] text-slate-500 font-medium">({monthlyRetentionTrends.peakRepeatOrders} orders)</span>
                        </div>
                    </div>
                </div>

                {/* Interactive Recharts Container */}
                <div className="w-full h-72 pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={monthlyRetentionTrends.trendData}
                            margin={{ top: 10, right: 25, left: -10, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="repeatOrdersGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="month"
                                tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                axisLine={{ stroke: '#cbd5e1' }}
                                tickLine={false}
                            />
                            <YAxis
                                yAxisId="left"
                                allowDecimals={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                label={{ value: 'Repeat Orders', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#94a3b8', fontSize: 10, fontWeight: 700 } }}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                domain={[0, 100]}
                                tick={{ fontSize: 11, fill: '#10b981' }}
                                axisLine={false}
                                tickLine={false}
                                unit="%"
                                label={{ value: 'Retention Rate %', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#10b981', fontSize: 10, fontWeight: 700 } }}
                            />
                            <Tooltip content={<CustomTrendTooltip />} />
                            <Legend
                                wrapperStyle={{ paddingTop: '12px', fontSize: '12px', fontWeight: '600' }}
                                iconType="circle"
                            />

                            {(chartView === 'all' || chartView === 'repeat') && (
                                <Area
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="repeatOrders"
                                    name="Repeat Customer Orders"
                                    stroke="#0284c7"
                                    strokeWidth={3}
                                    fill="url(#repeatOrdersGradient)"
                                    dot={{ r: 5, fill: '#0284c7', strokeWidth: 2, stroke: '#ffffff' }}
                                    activeDot={{ r: 8, strokeWidth: 2, fill: '#0284c7', stroke: '#ffffff' }}
                                />
                            )}

                            {(chartView === 'all' || chartView === 'repeat') && (
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="newCustomers"
                                    name="New Customer Orders"
                                    stroke="#94a3b8"
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={{ r: 4, fill: '#94a3b8' }}
                                />
                            )}

                            {(chartView === 'all' || chartView === 'rate') && (
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="retentionRate"
                                    name="Retention Rate (%)"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#ffffff' }}
                                    activeDot={{ r: 8, strokeWidth: 2, fill: '#10b981', stroke: '#ffffff' }}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            {/* 📊 RECHARTS SECTION: MONTH-OVER-MONTH RETENTION RATE & CUSTOMER DROP-OFF POINTS */}
            <Card className="border border-rose-200/90 bg-white shadow-2xs overflow-hidden space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl border border-rose-100 shadow-2xs">
                            <IconAlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 tracking-tight">
                                    Month-over-Month Retention Rate & Customer Drop-Off Points
                                </h3>
                                <span className="text-[10px] bg-rose-100 text-rose-900 font-extrabold px-2.5 py-0.5 rounded-full border border-rose-200">
                                    Recharts Analytics
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                Pinpointing month-over-month retention vs. attrition rates and critical customer drop-off milestones
                            </p>
                        </div>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl text-xs font-bold border border-slate-200/80 self-start md:self-auto">
                        <button
                            type="button"
                            onClick={() => setDropOffChartMode('mom')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                dropOffChartMode === 'mom'
                                    ? 'bg-rose-600 text-white shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            📈 MoM Retention vs Drop-Off (%)
                        </button>
                        <button
                            type="button"
                            onClick={() => setDropOffChartMode('funnel')}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                dropOffChartMode === 'funnel'
                                    ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            🎯 Journey Stage Drop-Off Funnel
                        </button>
                    </div>
                </div>

                {/* Key Drop-Off Metrics Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">Average MoM Retention</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-emerald-600">{monthlyRetentionTrends.avgRetentionRate}%</span>
                            <span className="text-[11px] text-slate-500 font-medium">Retained</span>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">Average MoM Drop-Off Rate</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-rose-600">{Math.max(0, 100 - monthlyRetentionTrends.avgRetentionRate)}%</span>
                            <span className="text-[11px] text-slate-500 font-medium">Attrited</span>
                        </div>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">Critical Drop-Off Milestone</span>
                        <span className="text-base font-black text-amber-700">{customerDropOffMetrics.highestDropOffStage}</span>
                    </div>
                    <div className="space-y-0.5">
                        <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider block">1st Visit Drop-Off Volume</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-rose-700">{customerDropOffMetrics.firstVisitDropOffCount}</span>
                            <span className="text-[11px] text-slate-500 font-medium">Clients ({customerDropOffMetrics.firstVisitDropOffPct}%)</span>
                        </div>
                    </div>
                </div>

                {/* Recharts Chart Visualization Container */}
                <div className="w-full h-80 pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        {dropOffChartMode === 'mom' ? (
                            <BarChart
                                data={customerDropOffMetrics.momDropOffData}
                                margin={{ top: 15, right: 25, left: -10, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="month"
                                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                                    axisLine={{ stroke: '#cbd5e1' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={[0, 100]}
                                    unit="%"
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomDropOffTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px', fontWeight: '600' }} />
                                <ReferenceLine y={50} stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: '50% Target', position: 'insideTopLeft', fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <Bar
                                    dataKey="retentionRate"
                                    name="Retention Rate (%)"
                                    fill="#10b981"
                                    radius={[6, 6, 0, 0]}
                                    maxBarSize={45}
                                />
                                <Bar
                                    dataKey="dropOffRate"
                                    name="Customer Drop-Off Rate (%)"
                                    fill="#f43f5e"
                                    radius={[6, 6, 0, 0]}
                                    maxBarSize={45}
                                />
                            </BarChart>
                        ) : (
                            <BarChart
                                data={customerDropOffMetrics.lifecycleFunnel}
                                margin={{ top: 15, right: 25, left: -10, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="stage"
                                    tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }}
                                    axisLine={{ stroke: '#cbd5e1' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<CustomDropOffTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px', fontWeight: '600' }} />
                                <Bar
                                    dataKey="activeCustomers"
                                    name="Active Retained Customers"
                                    radius={[6, 6, 0, 0]}
                                    maxBarSize={55}
                                >
                                    {customerDropOffMetrics.lifecycleFunnel.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fillColor} />
                                    ))}
                                </Bar>
                                <Bar
                                    dataKey="dropOffCount"
                                    name="Dropped Off at this Stage"
                                    fill="#f43f5e"
                                    radius={[6, 6, 0, 0]}
                                    maxBarSize={55}
                                />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>

                {/* Drop-Off Mitigation Re-Engagement Banner */}
                <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 p-3.5 rounded-xl border border-rose-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none">💡</span>
                        <div>
                            <span className="font-extrabold text-slate-900 block">
                                Highest Attrition Point: {customerDropOffMetrics.highestDropOffStage} ({customerDropOffMetrics.firstVisitDropOffPct}% drop-off rate)
                            </span>
                            <p className="text-slate-600 mt-0.5">
                                {customerDropOffMetrics.firstVisitDropOffCount} first-time customers have not returned for a second service. Re-engage them before they become permanently inactive.
                            </p>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-1.5 px-3 whitespace-nowrap shadow-2xs self-stretch sm:self-auto"
                        onClick={() => {
                            setDaysOverdueFilter('15');
                            setActiveTab('due');
                        }}
                    >
                        🚀 Target 1st Service Drop-Offs
                    </Button>
                </div>
            </Card>

            {/* Retention Filters & Service Cycle Control Panel */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800 uppercase tracking-wider">
                        <IconFilter className="w-4 h-4 text-brand-blue" />
                        <span>Retention Quick Filters & Service Rules</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Active Reminders: <strong className="text-slate-800">{filteredDue.length}</strong></span>
                        {(daysOverdueFilter !== 'all' || selectedServiceFilter !== 'all' || selectedLocationFilter !== 'all' || locationSearchQuery || searchQuery) && (
                            <button
                                onClick={() => {
                                    setDaysOverdueFilter('all');
                                    setSelectedServiceFilter('all');
                                    setSelectedLocationFilter('all');
                                    setLocationSearchQuery('');
                                    setSearchQuery('');
                                }}
                                className="text-rose-600 hover:text-rose-800 font-bold underline ml-2 flex items-center gap-1"
                            >
                                <IconX className="w-3.5 h-3.5" />
                                Reset Filters
                            </button>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 1. Quick Overdue / Inactivity Window Filter */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                            <IconClock className="w-3.5 h-3.5 text-amber-500" />
                            Quick Overdue Window:
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {[
                                { id: 'all', label: 'All Past' },
                                { id: '15', label: '15+ Days' },
                                { id: '30', label: '30+ Days' },
                                { id: '60', label: '60+ Days' },
                                { id: '90', label: '90+ Days' },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setDaysOverdueFilter(opt.id as any)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                        daysOverdueFilter === opt.id
                                            ? 'bg-amber-500 text-white shadow-xs'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2. Service-Wise Differentiation Filter */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                            <IconSparkles className="w-3.5 h-3.5 text-brand-blue" />
                            Service Type Filter:
                        </label>
                        <select
                            value={selectedServiceFilter}
                            onChange={(e) => setSelectedServiceFilter(e.target.value)}
                            className="w-full text-xs font-bold border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        >
                            <option value="all">⚡ All Service Types ({availableServiceTypes.length})</option>
                            <option value="Car Washing">💧 Car Washing (15 - 30 Days)</option>
                            <option value="Car Care">✨ Car Care (6 Mos - 1 Year)</option>
                            <option value="Tyre Replacement">🛞 Tyre Replacement (180 Days)</option>
                            <option value="Battery Replacement">🔋 Battery Replacement (2 Years)</option>
                            {availableServiceTypes.filter(s => !['Car Washing', 'Car Care', 'Tyre Replacement', 'Battery Replacement'].includes(s)).map(s => (
                                <option key={s} value={s}>🔧 {s}</option>
                            ))}
                        </select>
                    </div>

                    {/* 3. Location / Region Dropdown Filter */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                            <IconMapPin className="w-3.5 h-3.5 text-emerald-600" />
                            Location / Area Filter:
                        </label>
                        <select
                            value={selectedLocationFilter}
                            onChange={(e) => setSelectedLocationFilter(e.target.value)}
                            className="w-full text-xs font-bold border border-slate-300 rounded-lg p-2 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                            <option value="all">📍 All Areas ({locationOptions.length} Areas Registered)</option>
                            {locationOptions.map(loc => (
                                <option key={loc} value={loc}>📍 {loc}</option>
                            ))}
                        </select>
                    </div>

                    {/* 4. Location Search Query */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                            <IconSearch className="w-3.5 h-3.5 text-slate-500" />
                            Location Search:
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by street or city..."
                                value={locationSearchQuery}
                                onChange={(e) => setLocationSearchQuery(e.target.value)}
                                className="w-full text-xs border border-slate-300 rounded-lg p-2 pl-8 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <IconMapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            {locationSearchQuery && (
                                <button onClick={() => setLocationSearchQuery('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                                    <IconX className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Service Cycle Frequency Customizer Bar */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-800">⏱️ Service Interval Cycles:</span>
                        <span className="text-slate-500 text-[11px]">Set target maintenance intervals per service type</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Car Washing Cycle Toggle */}
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-700">💧 Car Washing:</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setCarWashIntervalDays(15)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${carWashIntervalDays === 15 ? 'bg-brand-blue text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    15 Days
                                </button>
                                <button
                                    onClick={() => setCarWashIntervalDays(30)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${carWashIntervalDays === 30 ? 'bg-brand-blue text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    30 Days
                                </button>
                            </div>
                        </div>

                        {/* Car Care Cycle Toggle */}
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="font-bold text-slate-700">✨ Car Care:</span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => setCarCareIntervalDays(180)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${carCareIntervalDays === 180 ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    6 Months (180d)
                                </button>
                                <button
                                    onClick={() => setCarCareIntervalDays(365)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${carCareIntervalDays === 365 ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    1 Year (365d)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                {[
                    { id: 'due', label: '⏰ Due for Service', count: filteredDue.length },
                    { id: 'pipeline', label: '🎯 Retention Pipeline', count: filteredDue.length },
                    { id: 'timeline', label: '📜 Customer Timelines', count: customerProfiles.length },
                    { id: 'activity', label: '📊 Activity & Performance Log', count: retentionLogs.length },
                    { id: 'repeat', label: '🔄 Repeat Customers', count: filteredRepeat.length },
                    { id: 'churn', label: '⚠️ Churn Risk & Campaigns', count: filteredChurn.filter(p => p.churnRisk === 'High' || p.churnRisk === 'Medium').length },
                    { id: 'coupons', label: '🎟️ Smart Offers & Promos' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabId)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
                            activeTab === tab.id
                                ? 'bg-slate-900 text-white shadow-sm ring-1 ring-slate-900'
                                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                    >
                        <span>{tab.label}</span>
                        {tab.count !== undefined && (
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                activeTab === tab.id ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-800'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT: Due for Service */}
            {activeTab === 'due' && (
                <Card title="⏰ Customers Due for Maintenance / Service">
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <div className="relative flex-1">
                                <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="Search due customers by name, phone, service, or location..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                                />
                            </div>
                        </div>

                        {filteredDue.length === 0 ? (
                            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                                <IconCheck className="w-10 h-10 text-emerald-500 mx-auto" />
                                <p className="text-sm font-bold text-slate-700">All customers up to date!</p>
                                <p className="text-xs text-slate-400">No overdue service reminders match your current filter selection.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredDue.map(({ profile, dueService, daysOverdue }) => (
                                    <div key={`${profile.mobileNumber}_${dueService}`} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 hover:border-slate-300 transition-all flex flex-col justify-between">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900">{profile.firstName} {profile.lastName}</h4>
                                                    <p className="text-xs text-slate-600 font-mono mt-0.5">📞 {profile.mobileNumber}</p>
                                                </div>
                                                <span className="bg-rose-100 text-rose-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-rose-200">
                                                    +{daysOverdue} Days Overdue
                                                </span>
                                            </div>

                                            <div className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1 border border-slate-100">
                                                <p className="text-slate-600">🚗 Vehicle: <strong className="text-slate-900 font-semibold">{profile.carBrandModel || 'Vehicle'} ({profile.carNumber || 'No Plate'})</strong></p>
                                                <p className="text-amber-800 font-semibold">✨ Due Service: <strong className="text-amber-900">{dueService}</strong></p>
                                                <p className="text-slate-700 font-medium flex items-center gap-1 mt-1 pt-1 border-t border-slate-200/60">
                                                    <IconMapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                    <span>Location: <strong className="text-slate-900 font-semibold">{profile.streetAddress || 'Address not registered'}</strong></span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="pt-2.5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                            <Button
                                                size="sm"
                                                className="text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-semibold px-2 py-1.5"
                                                onClick={() => handleOpenFollowUp({
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
                                                📞 Log Contact
                                            </Button>
                                            <Button
                                                size="sm"
                                                className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2 py-1.5"
                                                onClick={() => handleOpenBooking({
                                                    customerName: `${profile.firstName} ${profile.lastName}`,
                                                    customerPhone: profile.mobileNumber,
                                                    carBrandModel: profile.carBrandModel,
                                                    carNumber: profile.carNumber,
                                                    customerEmail: profile.customerEmail,
                                                    streetAddress: profile.streetAddress,
                                                    dueService,
                                                })}
                                            >
                                                🗓️ Book
                                            </Button>
                                            <a
                                                href={buildWhatsAppUrl(
                                                    profile.mobileNumber,
                                                    `Hello ${profile.firstName}! Friendly reminder from Big Engine Service: Your ${profile.carBrandModel || 'vehicle'} is due for ${dueService}. Book now for special offers: https://bigengine.in/book`
                                                )}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center justify-center text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-2 py-1.5 rounded-lg shadow-2xs transition-all"
                                                title="Open direct WhatsApp chat with pre-filled reminder"
                                            >
                                                💬 WhatsApp
                                            </a>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="text-[11px] bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold px-2 py-1.5"
                                                onClick={() => openTimelineForCustomer(profile)}
                                            >
                                                📜 Timeline
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* TAB CONTENT: Retention Pipeline */}
            {activeTab === 'pipeline' && (
                <RetentionPipelineTab
                    dueCustomers={dueCustomers}
                    retentionLogs={retentionLogs}
                    onOpenFollowUpModal={handleOpenFollowUp}
                    onOpenBookingModal={handleOpenBooking}
                    onOpenTimelineModal={openTimelineForCustomer}
                />
            )}

            {/* TAB CONTENT: Dedicated Customer Timelines Tab */}
            {activeTab === 'timeline' && (
                <Card title="📜 Customer History & Lifetime Timelines Explorer">
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <div className="relative flex-1">
                                <IconSearch className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="Search customer timeline records by name, phone, car, or location..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-accent text-slate-800"
                                />
                            </div>
                            <span className="text-xs text-slate-500 font-bold self-center">
                                Showing <strong>{customerProfiles.filter(p => {
                                    if (!searchQuery.trim()) return true;
                                    const q = searchQuery.toLowerCase();
                                    return (
                                        `${String(p.firstName || '')} ${String(p.lastName || '')}`.toLowerCase().includes(q) ||
                                        String(p.mobileNumber || '').toLowerCase().includes(q) ||
                                        String(p.carBrandModel || '').toLowerCase().includes(q) ||
                                        String(p.streetAddress || '').toLowerCase().includes(q)
                                    );
                                }).length}</strong> Customers
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {customerProfiles
                                .filter(p => {
                                    if (!searchQuery.trim()) return true;
                                    const q = searchQuery.toLowerCase();
                                    return (
                                        `${String(p.firstName || '')} ${String(p.lastName || '')}`.toLowerCase().includes(q) ||
                                        String(p.mobileNumber || '').toLowerCase().includes(q) ||
                                        String(p.carBrandModel || '').toLowerCase().includes(q) ||
                                        String(p.streetAddress || '').toLowerCase().includes(q)
                                    );
                                })
                                .map(p => (
                                    <div key={p.mobileNumber} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between hover:border-brand-blue/50 transition-all">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900">{p.firstName} {p.lastName}</h4>
                                                    <p className="text-xs text-slate-500 font-mono">📞 {p.mobileNumber}</p>
                                                </div>
                                                <span className="bg-blue-100 text-blue-900 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-blue-200">
                                                    {p.visitCount} Visits
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-2.5 rounded-lg text-xs space-y-1">
                                                <p className="text-slate-600">🚗 Vehicle: <strong className="text-slate-800">{p.carBrandModel || 'Vehicle'} ({p.carNumber || 'No Plate'})</strong></p>
                                                <p className="text-emerald-800 font-medium flex items-center gap-1">
                                                    <IconMapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                                    <span>Location: <strong className="text-slate-800">{p.streetAddress || 'Address N/A'}</strong></span>
                                                </p>
                                                <p className="text-slate-500 text-[11px]">Last Visit: {p.lastVisit ? new Date(p.lastVisit).toLocaleDateString() : 'N/A'}</p>
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex gap-2">
                                            <Button
                                                size="sm"
                                                className="w-full text-xs bg-brand-blue hover:bg-brand-blue/90 font-bold"
                                                onClick={() => openTimelineForCustomer(p)}
                                            >
                                                📜 View Full Chronological Timeline
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </Card>
            )}

            {/* TAB CONTENT: Activity & Performance Log */}
            {activeTab === 'activity' && (
                <RetentionActivityLogTab
                    logs={retentionLogs}
                    users={users}
                    kpiTargets={defaultTargets}
                    onOpenFollowUpModal={handleOpenFollowUp}
                />
            )}

            {/* TAB CONTENT: Repeat Customers */}
            {activeTab === 'repeat' && (
                <Card title="🔄 Repeat Business & High-Value Loyalty Clients">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                        {filteredRepeat.map(p => (
                            <div key={p.mobileNumber} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-800">{p.firstName} {p.lastName}</h4>
                                        <p className="text-xs text-slate-500 font-mono">📞 {p.mobileNumber}</p>
                                    </div>
                                    <span className="bg-indigo-100 text-indigo-900 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-indigo-200">
                                        ⭐ {p.visitCount} Visits (₹{p.totalSpend.toLocaleString()})
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600">🚗 {p.carBrandModel || 'Vehicle'} ({p.carNumber || 'No Plate'})</p>
                                <p className="text-xs text-emerald-800 font-medium flex items-center gap-1">
                                    <IconMapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                    <span>Location: <strong className="text-slate-800">{p.streetAddress || 'Location N/A'}</strong></span>
                                </p>
                                <div className="flex gap-2 pt-2 border-t border-slate-100">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="w-1/2 text-xs font-bold"
                                        onClick={() => handleOpenFollowUp({
                                            customerName: `${p.firstName} ${p.lastName}`,
                                            customerPhone: p.mobileNumber,
                                            carBrandModel: p.carBrandModel,
                                            carNumber: p.carNumber,
                                            streetAddress: p.streetAddress,
                                            daysSinceLast: p.daysSinceLast,
                                        })}
                                    >
                                        📞 Retention Outreach
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="w-1/2 text-xs border border-slate-300 font-bold"
                                        onClick={() => openTimelineForCustomer(p)}
                                    >
                                        📜 Timeline
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* TAB CONTENT: Churn Risk & Campaign Builder */}
            {activeTab === 'churn' && (
                <Card title="⚠️ Predictive Churn Risk & Re-Engagement Campaigns">
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                            <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-600">Risk Filter:</span>
                                {['All', 'High', 'Medium', 'Low'].map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setChurnRiskFilter(r as any)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold ${
                                            churnRiskFilter === r ? 'bg-brand-blue text-white' : 'bg-white text-slate-700 border border-slate-200'
                                        }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredChurn.map(p => (
                                <div key={p.mobileNumber} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-bold text-sm text-slate-800">{p.firstName} {p.lastName}</h4>
                                            <p className="text-xs text-slate-500 font-mono">📞 {p.mobileNumber}</p>
                                        </div>
                                        <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                            p.churnRisk === 'High' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                                            p.churnRisk === 'Medium' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                                            'bg-emerald-100 text-emerald-800'
                                        }`}>
                                            Risk: {p.churnRisk} ({p.churnScore}/100)
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-600">🚗 {p.carBrandModel} • Inactive {p.daysSinceLast} days</p>
                                    <p className="text-xs text-emerald-800 font-medium flex items-center gap-1">
                                        <IconMapPin className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                        <span>Location: <strong className="text-slate-800">{p.streetAddress || 'Location N/A'}</strong></span>
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            className="w-1/2 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                            onClick={() => openReEngagement(p)}
                                        >
                                            📢 Launch Campaign
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-1/2 text-xs border border-slate-300 font-bold"
                                            onClick={() => openTimelineForCustomer(p)}
                                        >
                                            📜 Timeline
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Card>
            )}

            {/* TAB CONTENT: Smart Promos */}
            {activeTab === 'coupons' && (
                <RetentionPromosTab
                    coupons={coupons}
                    onSaveCoupon={handleSaveCoupon}
                    onDeleteCoupon={handleDeleteCoupon}
                    serviceTemplates={serviceTemplates}
                    predefinedServices={predefinedServices}
                    predefinedServiceCategories={predefinedServiceCategories}
                />
            )}

            {/* MODAL: Churn Re-Engagement Campaign Draft */}
            {selectedChurnCustomer && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 modal-backdrop" onClick={() => setSelectedChurnCustomer(null)}>
                    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden modal-content">
                        <div className="bg-gradient-to-r from-purple-800 to-indigo-900 text-white p-5 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg">Personalized Win-Back Campaign</h3>
                                <p className="text-xs text-purple-200">Re-engage {selectedChurnCustomer.firstName} ({selectedChurnCustomer.carBrandModel})</p>
                            </div>
                            <button onClick={() => setSelectedChurnCustomer(null)} className="text-white/80 hover:text-white">
                                <IconX className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <textarea
                                value={customSmsBody}
                                onChange={(e) => setCustomSmsBody(e.target.value)}
                                rows={4}
                                className="w-full text-xs p-3 border border-slate-300 rounded-lg font-mono bg-slate-50 text-slate-800"
                            />

                            <div className="flex gap-2">
                                <Button
                                    className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                                    onClick={() => {
                                        const cleanPhone = String(selectedChurnCustomer.mobileNumber || '').replace(/\D/g, '');
                                        const url = `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodeURIComponent(customSmsBody)}`;
                                        window.open(url, '_blank');
                                        handleInternalSaveLog({
                                            id: `ret_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                                            timestamp: new Date().toISOString(),
                                            customerPhone: selectedChurnCustomer.mobileNumber,
                                            customerName: `${selectedChurnCustomer.firstName} ${selectedChurnCustomer.lastName}`,
                                            carBrandModel: selectedChurnCustomer.carBrandModel,
                                            agentUsername: currentUser?.username || 'system',
                                            actionType: 'WHATSAPP',
                                            outcome: 'DISCOUNT_SENT',
                                            notes: `Dispatched campaign draft to customer on WhatsApp. Code applied.`,
                                        });
                                        setSelectedChurnCustomer(null);
                                    }}
                                >
                                    <IconShare className="w-3.5 h-3.5 mr-1" />
                                    Send via WhatsApp
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="w-1/2 text-xs font-bold"
                                    onClick={() => {
                                        navigator.clipboard.writeText(customSmsBody);
                                        alert('Copied campaign text to clipboard!');
                                    }}
                                >
                                    Copy Message
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            <FollowUpLoggerModal
                isOpen={isFollowUpModalOpen}
                onClose={() => setIsFollowUpModalOpen(false)}
                target={followUpTarget}
                currentUser={currentUser}
                users={users}
                onSaveLog={handleInternalSaveLog}
                onOpenBookingModal={(target) => {
                    setIsFollowUpModalOpen(false);
                    handleOpenBooking(target);
                }}
            />

            <RetentionBookingModal
                isOpen={isBookingModalOpen}
                onClose={() => setIsBookingModalOpen(false)}
                target={bookingTarget}
                currentUser={currentUser}
                users={users}
                onCreateOrder={onCreateOrder}
                onSaveLog={handleInternalSaveLog}
                serviceTemplates={serviceTemplates}
                predefinedServices={predefinedServices}
                predefinedServiceCategories={predefinedServiceCategories}
                coupons={coupons}
            />

            <RetentionKPISettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                onSave={onUpdateKpiTargets}
                currentTargets={defaultTargets}
            />

            <CustomerTimelineModal
                isOpen={isTimelineModalOpen}
                onClose={() => setIsTimelineModalOpen(false)}
                customerProfile={timelineCustomer}
                allSubmissions={submissions}
                retentionLogs={retentionLogs}
                onOpenFollowUpModal={handleOpenFollowUp}
                onOpenBookingModal={handleOpenBooking}
            />
        </div>
    );
};

export default RetentionDashboard;
