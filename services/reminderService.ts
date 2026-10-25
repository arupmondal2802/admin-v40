import { Service, AppNotification, ServiceStatus, WarrantyRecord } from '../types';

export const REMINDER_INTERVALS = {
    'Car Wash': { days: 10, label: 'Car Wash' },
    'Tyre': { days: 150, label: 'Tyre Check/Replacement' },
    'Detail': { days: 90, label: 'Car Care & Detailing' },
    'Battery': { days: 1095, label: 'Battery Check/Replacement' },
    'General': { days: 180, label: 'General Maintenance Service' },
};

export type ServiceTypeKey = keyof typeof REMINDER_INTERVALS;

const daysBetween = (date1: Date, date2: Date): number => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round((date1.getTime() - date2.getTime()) / oneDay);
};

const normalizeServiceSelection = (raw: any): string[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw.map(item => String(item || '')).filter(Boolean);
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(item => String(item || '')).filter(Boolean);
            } catch (e) { }
        }
        return trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
    }
    return [];
};

/**
 * Dynamically analyzes completed orders to generate service reminders.
 * Returns a list of generated AppNotification items.
 */
export const generateServiceReminders = (
    submissions: Service[] = [],
    existingNotifications: AppNotification[] = []
): AppNotification[] => {
    if (!Array.isArray(submissions)) return [];
    const now = new Date();
    const reminders: AppNotification[] = [];

    // 1. Identify customers with active/pending/queued orders
    // We don't want to show reminders if there is already an active job!
    const activeJobs = new Map<string, Set<string>>(); // mobile -> Set of service terms
    
    submissions.forEach(s => {
        if (!s || !s.mobileNumber || s.isDeleted) return;
        const selArr = normalizeServiceSelection(s.serviceSelection);
        if ([ServiceStatus.Queued, ServiceStatus.Assigned, ServiceStatus.InProgress].includes(s.status)) {
            const mobile = String(s.mobileNumber).trim();
            if (!activeJobs.has(mobile)) {
                activeJobs.set(mobile, new Set());
            }
            selArr.forEach(item => {
                const term = item.toLowerCase();
                activeJobs.get(mobile)!.add(term);
            });
        }
    });

    // Helper to check if a customer already has an active order for a given category
    const hasActiveJobFor = (mobile: string, key: ServiceTypeKey): boolean => {
        const jobs = activeJobs.get(mobile.trim());
        if (!jobs) return false;
        
        switch (key) {
            case 'Car Wash':
                return jobs.has('car washing') || jobs.has('wash') || jobs.has('washing');
            case 'Tyre':
                return jobs.has('tyre replacement') || jobs.has('tyre') || jobs.has('tyre checkup');
            case 'Detail':
                return jobs.has('car care') || jobs.has('detailing') || jobs.has('polish');
            case 'Battery':
                return jobs.has('battery replacement') || jobs.has('battery');
            case 'General':
                return jobs.has('general maintenance') || jobs.has('general service') || jobs.has('repair');
            default:
                return false;
        }
    };

    // Helper to map submissions' service selections to our types
    const containsServiceType = (selection: any, key: ServiceTypeKey): boolean => {
        const selArr = normalizeServiceSelection(selection);
        const lowerSelections = selArr.map(s => s.toLowerCase());
        switch (key) {
            case 'Car Wash':
                return lowerSelections.some(s => s.includes('washing') || s.includes('wash'));
            case 'Tyre':
                return lowerSelections.some(s => s.includes('tyre') || s.includes('tire'));
            case 'Detail':
                return lowerSelections.some(s => s.includes('care') || s.includes('detail') || s.includes('polish') || s.includes('ceramic'));
            case 'Battery':
                return lowerSelections.some(s => s.includes('battery'));
            case 'General':
                return lowerSelections.some(s => s.includes('general') || s.includes('maintenance') || s.includes('service') || s.includes('repair'));
            default:
                return false;
        }
    };

    // 2. Find the last completed service for each category per customer
    const lastCompleted = new Map<string, Record<ServiceTypeKey, Service | null>>();

    // Sort submissions descending (newest first)
    const sortedSubmissions = [...submissions]
        .filter(s => s && s.status === ServiceStatus.Completed && !s.isDeleted && s.mobileNumber)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    sortedSubmissions.forEach(s => {
        const mobile = String(s.mobileNumber).trim();
        if (!lastCompleted.has(mobile)) {
            lastCompleted.set(mobile, {
                'Car Wash': null,
                'Tyre': null,
                'Detail': null,
                'Battery': null,
                'General': null
            });
        }

        const record = lastCompleted.get(mobile)!;
        
        (Object.keys(REMINDER_INTERVALS) as ServiceTypeKey[]).forEach(key => {
            if (!record[key] && containsServiceType(s.serviceSelection, key)) {
                record[key] = s;
            }
        });
    });

    // 3. For each customer with completed services, evaluate if they are due
    lastCompleted.forEach((record, mobile) => {
        (Object.keys(REMINDER_INTERVALS) as ServiceTypeKey[]).forEach(key => {
            const lastService = record[key];
            if (!lastService) return;

            // Check if there is already a pending order for this customer/service
            if (hasActiveJobFor(mobile, key)) return;

            const daysSince = daysBetween(now, new Date(lastService.timestamp));
            const config = REMINDER_INTERVALS[key];

            if (daysSince >= config.days) {
                const id = `reminder-${mobile}-${key.replace(/\s+/g, '_')}`;
                
                // Lookup existing notification record to check isRead, snoozed, dismissed status
                const existing = (existingNotifications || []).find(n => n.id === id);
                
                // If it was already dismissed, don't generate/show it
                if (existing?.isDismissed) return;

                // If it was snoozed and the snooze period hasn't elapsed, don't show it
                if (existing?.snoozedUntil) {
                    const snoozeDate = new Date(existing.snoozedUntil);
                    if (snoozeDate > now) return;
                }

                const customerName = `${lastService.customerFirstName || ''} ${lastService.customerLastName || ''}`.trim() || 'Customer';
                const vehicle = lastService.carBrandModel ? `${lastService.carBrandModel} (${lastService.carNumber || 'N/A'})` : (lastService.carNumber || 'Vehicle');
                const message = `${customerName}'s ${vehicle} is due for a ${config.label} (${daysSince} days since last service, interval: ${config.days} days).`;

                reminders.push({
                    id,
                    userId: 'admin', // Default target
                    serviceId: lastService.submissionId,
                    message,
                    timestamp: lastService.timestamp,
                    isRead: existing ? existing.isRead : false,
                    type: 'service-reminder',
                    customerName,
                    mobileNumber: mobile,
                    carNumber: lastService.carNumber,
                    serviceType: key,
                    daysOverdue: daysSince - config.days,
                    snoozedUntil: existing?.snoozedUntil,
                    isDismissed: existing?.isDismissed || false
                });
            }
        });
    });

    // Cap reminders to top 50 most overdue to prevent massive memory/render overload
    return reminders
        .sort((a, b) => (b.daysOverdue || 0) - (a.daysOverdue || 0))
        .slice(0, 50);
};

/**
 * Dynamically analyzes active warranty records to generate expiry warning notifications.
 * Returns a list of generated AppNotification items for warranties close to expiry.
 */
export const generateWarrantyReminders = (
    warranties: WarrantyRecord[] = [],
    existingNotifications: AppNotification[] = []
): AppNotification[] => {
    if (!Array.isArray(warranties)) return [];
    const now = new Date();
    const reminders: AppNotification[] = [];

    warranties.forEach(w => {
        if (!w) return;
        // Exclude claimed or manually updated expired records
        if (w.status === 'Claimed' || w.status === 'Expired') return;

        const expiry = new Date(w.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const diffTime = expiry.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const alertDays = w.alertDaysBefore || 30;

        // Generate alert if we are within the alert range (even if slightly overdue/expired but not processed yet)
        if (daysLeft >= -5 && daysLeft <= alertDays) {
            const id = `warranty-expiry-${w.id}`;
            const existing = (existingNotifications || []).find(n => n.id === id);

            if (existing?.isDismissed) return;
            if (existing?.snoozedUntil && new Date(existing.snoozedUntil) > now) return;

            let message = '';
            if (daysLeft < 0) {
                message = `Warranty for ${w.customerName}'s ${w.productName} expired ${Math.abs(daysLeft)} days ago (on ${new Date(w.expiryDate).toLocaleDateString()}).`;
            } else {
                message = `Warranty for ${w.customerName}'s ${w.productName} is expiring in ${daysLeft} days (on ${new Date(w.expiryDate).toLocaleDateString()}).`;
            }

            reminders.push({
                id,
                userId: 'admin',
                serviceId: w.serviceId || w.id,
                message,
                timestamp: w.timestamp || now.toISOString(),
                isRead: existing ? existing.isRead : false,
                type: 'warranty-expiry',
                customerName: w.customerName,
                mobileNumber: w.customerPhone,
                serviceType: w.productName,
                daysOverdue: daysLeft < 0 ? Math.abs(daysLeft) : undefined,
                snoozedUntil: existing?.snoozedUntil,
                isDismissed: existing?.isDismissed || false
            });
        }
    });

    return reminders;
};
