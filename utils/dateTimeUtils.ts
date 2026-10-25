import { Service } from '../types';

/**
 * Normalizes any date string, ISO string, or Date object into a clean YYYY-MM-DD date string
 * in the IST (Asia/Kolkata) timezone, preventing any UTC offset date-shifting errors.
 */
export const toISTDateString = (dateInput?: string | Date | null): string => {
  if (!dateInput) return '';
  
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';
    // If it's already a plain YYYY-MM-DD string without time component, return directly.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!(d instanceof Date) || isNaN(d.getTime())) {
    if (typeof dateInput === 'string') {
      const match = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return '';
  }

  // Format to YYYY-MM-DD using Asia/Kolkata timezone
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);

    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error("Error formatting IST date string:", e);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Robustly parses a service's scheduledDate and scheduledTime into a JavaScript Date
 * using IST timezone components to prevent UTC ISO string timezone shifting errors.
 */
export const parseDateTime = (service: Service): Date | null => {
  if (!service || !service.scheduledDate) return null;
  
  try {
    let hour = 10; // Default 10:00 AM
    let minute = 0;
    
    if (service.scheduledTime) {
      const timePart = service.scheduledTime.split(' - ')[0].trim(); // e.g., "10:00" or "10:00 AM"
      const match = timePart.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        hour = Number(match[1]);
        minute = Number(match[2]);
        if (timePart.toLowerCase().includes('pm') && hour < 12) hour += 12;
        if (timePart.toLowerCase().includes('am') && hour === 12) hour = 0;
      }
    }

    const istDateStr = toISTDateString(service.scheduledDate);
    if (!istDateStr) return null;

    const parts = istDateStr.split('-');
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const localDate = new Date(year, month, day, hour, minute);
        return isNaN(localDate.getTime()) ? null : localDate;
      }
    }

    return null;
  } catch (e) {
    console.error("Error parsing scheduled date/time:", service.scheduledDate, service.scheduledTime, e);
    return null;
  }
};

/**
 * Checks if two dates refer to the exact same calendar day in IST timezone.
 */
export const isSameDay = (d1: Date | null, d2: Date | null): boolean => {
  if (!d1 || !d2) return false;
  return toISTDateString(d1) === toISTDateString(d2);
};

/**
 * Formats a service's scheduled date reliably for display (e.g. "1 Aug, 2026").
 */
export const formatScheduledDate = (service: Service): string => {
  if (!service || !service.scheduledDate) return 'N/A';
  const istDateStr = toISTDateString(service.scheduledDate);
  if (!istDateStr) return String(service.scheduledDate);

  const parts = istDateStr.split('-');
  if (parts.length === 3) {
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return istDateStr;
};

/**
 * Returns the effective JS Date for a service, preferring parsed scheduledDate and falling back to timestamp.
 */
export const getServiceDate = (s: Service): Date => {
  const parsedScheduled = parseDateTime(s);
  if (parsedScheduled) return parsedScheduled;
  if (s.timestamp) {
    const createdDate = new Date(s.timestamp);
    if (!isNaN(createdDate.getTime())) return createdDate;
  }
  return new Date();
};

/**
 * Returns a local YYYY-MM-DD date string in IST for a service.
 */
export const getServiceLocalDateStr = (s: Service): string => {
  if (s.scheduledDate) {
    const str = toISTDateString(s.scheduledDate);
    if (str) return str;
  }
  if (s.timestamp) {
    return toISTDateString(s.timestamp);
  }
  return toISTDateString(new Date());
};

/**
 * Returns today's YYYY-MM-DD date string in IST timezone.
 */
export const getLocalTodayStr = (): string => {
  return toISTDateString(new Date());
};

/**
 * Returns true if the service is scheduled or created on today's IST calendar date.
 */
export const isTodayService = (s: Service): boolean => {
  const todayStr = getLocalTodayStr();
  const serviceDateStr = getServiceLocalDateStr(s);
  return todayStr === serviceDateStr;
};

