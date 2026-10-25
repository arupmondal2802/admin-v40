import { Service, Settings, Msg91Config } from '../types';
import { formatScheduledDate } from '../utils/dateTimeUtils';
import { toast } from 'sonner';
import { getApiUrl } from './backendConfig';

export type Msg91EventType = 'order_created' | 'order_rescheduled' | 'order_completed' | 'feedback_request' | 'test';

export interface SendMsg91SmsPayload {
  eventType: Msg91EventType;
  customerPhone: string;
  customerName: string;
  carNumber: string;
  carBrandModel?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  grandTotal?: number;
  feedbackUrl?: string;
  serviceName?: string;
  msg91Config?: Msg91Config;
}

export interface SendMsg91SmsResult {
  success: boolean;
  message: string;
  simulated?: boolean;
  msg91Response?: any;
  details?: string;
}

/**
 * Normalizes phone numbers to include country code (default 91 for India if 10 digits)
 */
export const formatPhoneNumber = (phone: string | number | undefined | null): string => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
};

/**
 * Sends SMS via backend API route connected to MSG91 Flow API
 */
export const sendMsg91Sms = async (
  payload: SendMsg91SmsPayload
): Promise<SendMsg91SmsResult> => {
  try {
    const response = await fetch(getApiUrl('/api/send-msg91-sms'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      const errMsg = result.error || result.details || 'Failed to send SMS via MSG91';
      console.warn('[MSG91 Service] SMS Send Notice/Error:', errMsg);
      return {
        success: false,
        message: errMsg,
        details: result.details,
      };
    }

    return {
      success: true,
      message: result.message || 'SMS dispatched successfully via MSG91',
      simulated: result.simulated,
      msg91Response: result.msg91Response,
    };
  } catch (error: any) {
    console.error('[MSG91 Service] Network/API Error:', error);
    return {
      success: false,
      message: error.message || 'Network error attempting to send MSG91 SMS',
    };
  }
};

/**
 * Triggers Order Created / Booked SMS Intimation
 */
export const triggerOrderCreatedSms = async (
  service: Service,
  settings?: Settings
): Promise<SendMsg91SmsResult | null> => {
  const config = settings?.msg91Config;
  if (config && !config.enabled) {
    return null; // Disabled in settings
  }

  const payload: SendMsg91SmsPayload = {
    eventType: 'order_created',
    customerPhone: service.mobileNumber,
    customerName: `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Valued Customer',
    carNumber: service.carNumber || 'N/A',
    carBrandModel: service.carBrandModel || 'Vehicle',
    scheduledDate: service.scheduledDate ? formatScheduledDate(service) : new Date(service.timestamp).toLocaleDateString(),
    scheduledTime: service.scheduledTime || 'As scheduled',
    grandTotal: service.grandTotal || 0,
    serviceName: service.serviceSelection?.[0] || 'Car Service',
    msg91Config: config,
  };

  const res = await sendMsg91Sms(payload);
  if (res.success) {
    toast.success(`MSG91 Order Booking SMS sent to ${service.customerFirstName} (${service.mobileNumber})`, {
      icon: '💬',
    });
  }
  return res;
};

/**
 * Triggers Order Rescheduled SMS Intimation
 */
export const triggerOrderRescheduledSms = async (
  service: Service,
  settings?: Settings
): Promise<SendMsg91SmsResult | null> => {
  const config = settings?.msg91Config;
  if (config && !config.enabled) {
    return null;
  }

  const payload: SendMsg91SmsPayload = {
    eventType: 'order_rescheduled',
    customerPhone: service.mobileNumber,
    customerName: `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Valued Customer',
    carNumber: service.carNumber || 'N/A',
    carBrandModel: service.carBrandModel || 'Vehicle',
    scheduledDate: service.scheduledDate ? formatScheduledDate(service) : new Date().toLocaleDateString(),
    scheduledTime: service.scheduledTime || 'Updated time',
    grandTotal: service.grandTotal || 0,
    serviceName: service.serviceSelection?.[0] || 'Car Service',
    msg91Config: config,
  };

  const res = await sendMsg91Sms(payload);
  if (res.success) {
    toast.success(`MSG91 Reschedule SMS sent to ${service.customerFirstName} (${service.mobileNumber})`, {
      icon: '📅',
    });
  }
  return res;
};

/**
 * Triggers Service Completion SMS Intimation
 */
export const triggerOrderCompletedSms = async (
  service: Service,
  settings?: Settings
): Promise<SendMsg91SmsResult | null> => {
  const config = settings?.msg91Config;
  if (config && !config.enabled) {
    return null;
  }

  const payload: SendMsg91SmsPayload = {
    eventType: 'order_completed',
    customerPhone: service.mobileNumber,
    customerName: `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Valued Customer',
    carNumber: service.carNumber || 'N/A',
    carBrandModel: service.carBrandModel || 'Vehicle',
    grandTotal: service.grandTotal || 0,
    serviceName: service.serviceSelection?.join(', ') || 'Auto Service',
    msg91Config: config,
  };

  const res = await sendMsg91Sms(payload);
  if (res.success) {
    toast.success(`MSG91 Completion SMS sent to ${service.customerFirstName} (${service.mobileNumber})`, {
      icon: '✅',
    });
  }
  return res;
};

/**
 * Triggers Customer Feedback Collection SMS
 */
export const triggerFeedbackSms = async (
  service: Service,
  settings?: Settings,
  customFeedbackUrl?: string
): Promise<SendMsg91SmsResult | null> => {
  const config = settings?.msg91Config;
  if (config && !config.enabled) {
    return null;
  }

  const baseUrl = customFeedbackUrl || config?.feedbackBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const feedbackUrl = `${baseUrl}?feedbackOrder=${service.submissionId || service.appointmentId}`;

  const payload: SendMsg91SmsPayload = {
    eventType: 'feedback_request',
    customerPhone: service.mobileNumber,
    customerName: `${service.customerFirstName || ''} ${service.customerLastName || ''}`.trim() || 'Valued Customer',
    carNumber: service.carNumber || 'N/A',
    carBrandModel: service.carBrandModel || 'Vehicle',
    feedbackUrl,
    msg91Config: config,
  };

  const res = await sendMsg91Sms(payload);
  if (res.success) {
    toast.success(`MSG91 Feedback Request SMS sent to ${service.customerFirstName} (${service.mobileNumber})`, {
      icon: '⭐️',
    });
  }
  return res;
};
