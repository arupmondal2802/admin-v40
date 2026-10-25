import { NotificationPreferences, AppData, EmailReportConfig, AppNotification } from '../types';
import { getApiUrl } from './backendConfig';

let audioContext: AudioContext | null = null;
const getAudioContext = () => {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch(e) {
            console.error("Web Audio API is not supported in this browser.", e);
        }
    }
    return audioContext;
};

const playTone = (frequency: number, duration: number) => {
    const context = getAudioContext();
    if (!context) return;

    // A simple fade-in/out to prevent clicking sounds
    const rampTime = 0.01;
    const peakTime = duration - (rampTime * 2);

    if (peakTime <= 0) return; // Ensure duration is long enough

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    gainNode.gain.setValueAtTime(0, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + rampTime);
    gainNode.gain.setValueAtTime(0.5, context.currentTime + rampTime + peakTime);
    gainNode.gain.linearRampToValueAtTime(0, context.currentTime + duration);

    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);
};


export const isNotificationConsentGranted = (prefs: NotificationPreferences | undefined): boolean => {
    return prefs?.consentGranted === true;
};

/**
 * Evaluates whether quiet hours are currently active for the user.
 */
export const isQuietHoursActive = (prefs?: NotificationPreferences): boolean => {
  if (!prefs?.quietHoursEnabled) return false;
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = (prefs.quietHoursStart || '22:00').split(':').map(Number);
    const [endH, endM] = (prefs.quietHoursEnd || '07:00').split(':').map(Number);
    const startMinutes = (startH || 22) * 60 + (startM || 0);
    const endMinutes = (endH || 7) * 60 + (endM || 0);

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight (e.g., 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
};

/**
 * Tracks today's notification count to prevent notification fatigue / manage notification load.
 */
export const getTodayDispatchedCount = (): number => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const key = `abe_notif_count_${todayStr}`;
    return parseInt(localStorage.getItem(key) || '0', 10);
  } catch {
    return 0;
  }
};

export const incrementTodayDispatchedCount = (): number => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const key = `abe_notif_count_${todayStr}`;
    const next = getTodayDispatchedCount() + 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return 0;
  }
};

/**
 * Checks if a notification passes consent and load-management rules.
 * Enforces:
 *  1. Deactivated by default (requires explicit consent of user or admin).
 *  2. Priority-only filtering (if enabled to manage load).
 *  3. Quiet hours suppression.
 *  4. Maximum daily alert caps.
 *  5. Per-category enablement.
 */
export const shouldDispatchNotification = (
  notification: AppNotification,
  prefs?: NotificationPreferences
): { allowed: boolean; reason?: string } => {
  // 1. Strict default deactivation: Requires explicit consent of user or admin
  if (!prefs || prefs.consentGranted !== true) {
    return { allowed: false, reason: 'Notifications deactivated by default (requires user or admin consent to manage load)' };
  }

  // 2. Quiet hours
  if (isQuietHoursActive(prefs)) {
    return { allowed: false, reason: 'Quiet hours active (load management)' };
  }

  // 3. Priority only (load management)
  if (prefs.priorityOnly) {
    const isPriority = ['overdue', 'overdue-alert', 'assigned'].includes(notification.type || '');
    if (!isPriority) {
      return { allowed: false, reason: 'Suppressed by priority-only load filter' };
    }
  }

  // 4. Daily alert cap (load management)
  const maxAlerts = prefs.maxDailyAlerts || 15;
  if (maxAlerts > 0 && getTodayDispatchedCount() >= maxAlerts) {
    return { allowed: false, reason: `Daily limit of ${maxAlerts} notifications reached (load management capped)` };
  }

  // 5. Category enablement
  if (!isNotificationTypeEnabled(notification.type, prefs)) {
    return { allowed: false, reason: `Category ${notification.type} disabled in user preferences` };
  }

  return { allowed: true };
};

export const playNotificationAlert = (prefs: NotificationPreferences | undefined) => {
    // Keep notifications deactivated by default unless consent is explicitly granted
    if (!prefs || !prefs.consentGranted) return;

    // Play sound
    switch (prefs.sound) {
        case 'default':
            playTone(440, 0.2); // A4
            break;
        case 'tone1':
            playTone(660, 0.15); // E5
            setTimeout(() => playTone(880, 0.15), 160); // A5
            break;
        case 'tone2':
            playTone(880, 0.1); // A5
            setTimeout(() => playTone(660, 0.1), 110); // E5
            break;
        case 'none':
            // Do nothing
            break;
    }

    // Vibrate
    if (prefs.vibration && 'vibrate' in navigator) {
        try {
            navigator.vibrate([200, 100, 200]);
        } catch (e) {
            console.debug('Vibration not permitted or not supported', e);
        }
    }
};

/**
 * Checks if the browser environment supports the native Notification API.
 */
export const isNativeNotificationSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Returns current permission state ('granted', 'denied', 'default', or 'unsupported').
 */
export const getNativeNotificationPermission = (): NotificationPermission | 'unsupported' => {
  if (!isNativeNotificationSupported()) return 'unsupported';
  return Notification.permission;
};

/**
 * Prompts the user for native browser notification permission.
 */
export const requestNativeNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (!isNativeNotificationSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return Notification.permission;
  }
};

/**
 * Resolves a human-readable title based on notification type.
 */
export const getNotificationTitle = (type?: string): string => {
  switch (type) {
    case 'assigned':
      return '🚗 New Service Assigned';
    case 'reminder':
    case 'reminder-30min':
    case 'reminder-60min':
    case 'service-reminder':
      return '⏰ Upcoming Service Reminder';
    case 'overdue':
    case 'overdue-alert':
      return '⚠️ Service Overdue Alert';
    case 'completed':
      return '✅ Service Order Completed';
    case 'queued':
      return '📋 New Service Queued';
    case 'warranty-expiry':
      return '🛡️ Warranty Expiry Notice';
    case 'manual':
    case 'manual-admin':
    case 'manual-order':
      return '📢 A Big Engine Announcement';
    default:
      return '🔔 A Big Engine Notification';
  }
};

/**
 * Checks if a specific notification type is enabled in the user's notification preferences.
 * By default, notifications are DEACTIVATED to prevent system and device load until consent is granted.
 */
export const isNotificationTypeEnabled = (
  type: string | undefined,
  prefs: NotificationPreferences | undefined
): boolean => {
  // Deactivated by default: strictly requires explicit user or admin consent
  if (!prefs || prefs.consentGranted !== true || !prefs.enabled) {
    return false;
  }
  const enabledMap = prefs.enabled;

  switch (type) {
    case 'assigned':
      return enabledMap.assigned === true;
    case 'reminder':
    case 'reminder-30min':
    case 'reminder-60min':
    case 'service-reminder':
      return enabledMap.reminder === true;
    case 'overdue':
    case 'overdue-alert':
      return enabledMap.overdue === true;
    case 'completed':
      return enabledMap.completed === true;
    case 'queued':
      return enabledMap.queued === true;
    case 'manual':
    case 'manual-admin':
    case 'manual-order':
      return enabledMap.manual === true;
    default:
      return false;
  }
};

/**
 * Sends a native device/browser notification using the Web Notification API / Service Worker registration.
 * Respects user preferences (sound, vibration, category enablement, and consent activation).
 */
export const sendNativeNotification = async (
  notification: AppNotification,
  prefs?: NotificationPreferences,
  onClickCallback?: () => void
): Promise<boolean> => {
  // Check consent and load management gates (deactivated by default)
  const dispatchCheck = shouldDispatchNotification(notification, prefs);
  if (!dispatchCheck.allowed) {
    console.debug(`🔕 [Notification Suppressed] ${dispatchCheck.reason}`);
    return false;
  }

  if (!isNativeNotificationSupported()) {
    // Fallback: Still play in-app sound/vibration if consent given
    playNotificationAlert(prefs);
    return false;
  }

  if (Notification.permission !== 'granted') {
    playNotificationAlert(prefs);
    return false;
  }

  // Play configured in-app alert sound & haptic vibration
  playNotificationAlert(prefs);

  const title = getNotificationTitle(notification.type);
  const bodyText = notification.message || 
    (notification.customerName ? `Customer: ${notification.customerName} (${notification.carNumber || ''})` : 'New activity in A Big Engine');

  const options: Record<string, any> = {
    body: bodyText,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: notification.id || `notif_${Date.now()}`,
    renotify: true,
    data: {
      url: window.location.origin,
      serviceId: notification.serviceId,
      notificationId: notification.id,
      type: notification.type
    }
  };

  // Add vibration pattern if user has vibration enabled
  if (prefs?.vibration) {
    options.vibrate = [200, 100, 200];
  }

  try {
    // Strategy 1: Use active Service Worker registration (works best for Android / PWA background)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, options as NotificationOptions);
          incrementTodayDispatchedCount();
          return true;
        }
      } catch (swErr) {
        console.debug('ServiceWorker showNotification unavailable, falling back to Notification constructor', swErr);
      }
    }

    // Strategy 2: Standard Window Notification constructor
    const nativeNotif = new Notification(title, options as NotificationOptions);
    nativeNotif.onclick = (e) => {
      e.preventDefault();
      window.focus();
      nativeNotif.close();
      if (onClickCallback) {
        onClickCallback();
      }
    };
    incrementTodayDispatchedCount();
    return true;
  } catch (err) {
    console.warn('Could not display native notification:', err);
    return false;
  }
};

/**
 * Fires a test native notification so the user can verify their browser/device permissions and sound.
 */
export const sendTestNativeNotification = async (prefs?: NotificationPreferences): Promise<boolean> => {
  const testNotif: AppNotification = {
    id: `test_notif_${Date.now()}`,
    userId: 'current',
    serviceId: 'test_service_001',
    message: 'Native notifications are active and working smoothly for A Big Engine!',
    timestamp: new Date().toISOString(),
    isRead: false,
    type: 'manual-admin',
    customerName: 'Test Customer',
    carNumber: 'WB 01 AB 1234'
  };

  return sendNativeNotification(testNotif, prefs);
};

/**
 * Aggregates daily appointments (submissions) and upcoming tasks (raw service requests or submissions in upcoming days).
 * This filters the dataset according to date boundaries in the 'Asia/Kolkata' (IST) timezone.
 */
export const aggregateReportingData = (appData: AppData) => {
  const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const now = new Date();

  const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === todayStr;
  };

  const isUpcoming = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const diffTime = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  };

  const submissions = appData.submissions || [];
  const serviceRequests = appData.serviceRequests || [];

  const todayOrders = submissions.filter((a) => isToday(a.timestamp));
  const upcomingOrders = submissions.filter((a) => isUpcoming(a.timestamp));
  const overdueOrders = submissions.filter((a) => {
    if (a.status === 'Completed' || a.status === 'Draft') return false;
    const createdTime = new Date(a.timestamp).getTime();
    const hoursElapsed = (now.getTime() - createdTime) / (1000 * 60 * 60);
    return hoursElapsed > 24;
  });

  const todayLeads = serviceRequests.filter((sr) => isToday(sr.requestDate) || isToday(sr.createdTime));
  const upcomingLeads = serviceRequests.filter((sr) => isUpcoming(sr.requestDate));

  const completedRevenueToday = todayOrders
    .filter((o) => o.status === 'Completed')
    .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

  const pendingTodayRevenue = todayOrders
    .filter((o) => o.status !== 'Completed')
    .reduce((sum, o) => sum + Number(o.grandTotal || 0), 0);

  return {
    todayOrders,
    upcomingOrders,
    overdueOrders,
    todayLeads,
    upcomingLeads,
    completedRevenueToday,
    pendingTodayRevenue,
    metrics: {
      todayAppointmentsCount: todayOrders.length + todayLeads.length,
      upcomingTasksCount: upcomingOrders.length + upcomingLeads.length,
      overdueTasksCount: overdueOrders.length,
    }
  };
};

/**
 * Dispatches an email alert with aggregated reports to a set of configurable recipient emails via the server-side endpoint.
 */
export const triggerEmailReport = async (
  recipients: string[],
  config: EmailReportConfig,
  appData: AppData
): Promise<{ success: boolean; simulated?: boolean; message: string; previewHtml?: string }> => {
  if (!recipients || recipients.length === 0) {
    throw new Error('No recipient email addresses provided.');
  }

  // Pre-filter appointments and service requests to only send relevant records for the report.
  // This drastically reduces payload size from megabytes to just a few kilobytes!
  const todayStr = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  const now = new Date();

  const isToday = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) === todayStr;
  };

  const isUpcoming = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const diffTime = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  };

  const submissions = appData.submissions || [];
  const serviceRequests = appData.serviceRequests || [];

  // Filter only what the report will actually display: today, upcoming, or overdue
  const filteredSubmissions = submissions.filter((a) => {
    const isOverdue = a.status !== 'Completed' && a.status !== 'Draft' && 
      ((now.getTime() - new Date(a.timestamp).getTime()) / (1000 * 60 * 60) > 24);
    
    return isToday(a.timestamp) || isUpcoming(a.timestamp) || isOverdue;
  }).map((o) => {
    // Strip massive media fields and keep only what the email report uses
    return {
      timestamp: o.timestamp,
      status: o.status,
      grandTotal: o.grandTotal,
      carBrandModel: o.carBrandModel,
      carNumber: o.carNumber,
      customerFirstName: o.customerFirstName,
      customerLastName: o.customerLastName,
      mobileNumber: o.mobileNumber,
      serviceSelection: o.serviceSelection,
    };
  });

  const filteredRequests = serviceRequests.filter((sr) => {
    return isToday(sr.requestDate) || isToday(sr.createdTime) || isUpcoming(sr.requestDate);
  }).map((l) => {
    return {
      requestDate: l.requestDate,
      createdTime: l.createdTime,
      customerName: l.customerName,
      customerPhone: l.customerPhone,
      carBrand: l.carBrand,
      carModel: l.carModel,
      carRegNo: l.carRegNo,
      source: l.source,
      leadSource: l.leadSource,
      status: l.status,
      requestedService: l.requestedService,
    };
  });

  const payload = {
    recipients,
    config,
    appointments: filteredSubmissions,
    serviceRequests: filteredRequests,
  };

  const response = await fetch(getApiUrl('/api/send-report-email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || result.details || 'Failed to trigger report email.');
  }

  return {
    success: true,
    simulated: result.simulated,
    message: result.message,
    previewHtml: result.previewHtml,
  };
};

/**
 * Formats a plain text summary of daily appointments and upcoming tasks,
 * then simulates a 'sendEmail' trigger for each configured recipient.
 */
export const simulateSendEmail = (
  recipients: string[],
  appData: AppData
): { success: boolean; log: string; textSummary: string } => {
  const { todayOrders, todayLeads, metrics } = aggregateReportingData(appData);
  
  let textSummary = `--- DAILY APPOINTMENTS DIGEST ---\n`;
  textSummary += `Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)\n`;
  textSummary += `Total Today Appointments/Leads: ${metrics.todayAppointmentsCount}\n\n`;
  
  if (todayOrders.length > 0) {
    textSummary += `Active Orders:\n`;
    todayOrders.forEach(o => {
      textSummary += `- [Status: ${o.status}] ${o.carBrandModel} (${o.carNumber}) - ${o.customerFirstName} ${o.customerLastName} (Total: ₹${o.grandTotal || 0})\n`;
    });
  } else {
    textSummary += `No active service orders today.\n`;
  }
  
  if (todayLeads.length > 0) {
    textSummary += `\nRaw Appointment Requests/Leads:\n`;
    todayLeads.forEach(l => {
      textSummary += `- [Status: ${l.status || 'New'}] ${l.customerName} - ${l.requestedService || 'General Inquiry'} (${l.customerPhone})\n`;
    });
  }
  
  const logMessage = `[Simulation] Successfully simulated daily digest email to recipients: [${recipients.join(', ')}]`;
  console.log(logMessage);
  console.log(textSummary);
  
  return {
    success: true,
    log: logMessage,
    textSummary
  };
};