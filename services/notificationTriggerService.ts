import { AppNotification, Service, ServiceRequest, Settings, SmartNotificationRule } from '../types';

export const DEFAULT_NOTIFICATION_RULES: SmartNotificationRule[] = [
  {
    id: 'rule_order_completed',
    name: 'Order Completion Customer Update',
    description: 'Trigger a notification when an order status is marked as Completed.',
    enabled: true,
    event: 'order_completed',
    template: 'Dear {customerFirstName}, your car ({carBrandModel}) service has been completed successfully! Total amount: ${grandTotal}. Thank you for choosing A Big Engine.',
    channels: { bell: true, whatsapp: true, sms: true, email: false }
  },
  {
    id: 'rule_lead_arrival',
    name: 'New Lead Ingestion Alert',
    description: 'Trigger an internal alert when a new lead arrives via Website or Meta Ads.',
    enabled: true,
    event: 'lead_arrival',
    template: 'New {source} lead arrived! Customer {customerName} ({customerPhone}) requested {requestedService}. Please follow up promptly.',
    channels: { bell: true, whatsapp: false, sms: false, email: false }
  },
  {
    id: 'rule_order_due',
    name: 'Job Due Reminder',
    description: 'Trigger an alert when a scheduled job is due today.',
    enabled: true,
    event: 'order_due',
    template: 'Scheduled Job Reminder: Vehicle {carNumber} ({carBrandModel}) is scheduled for {serviceSelection} on {scheduledDate} at {scheduledTime}. Assigned to: {assignedTo}.',
    channels: { bell: true, whatsapp: true, sms: false, email: false }
  },
  {
    id: 'rule_reminder_followup',
    name: 'Retention Follow-Up Alert',
    description: 'Trigger a follow-up reminder 15 days after service completion to retain the customer.',
    enabled: true,
    event: 'reminder_followup',
    template: 'Hi {customerFirstName}, hope your car {carBrandModel} is running smoothly! It has been 15 days since your service. Let us know if you need any routine checks.',
    channels: { bell: true, whatsapp: true, sms: false, email: false },
    daysDelay: 15
  }
];

// Helper to replace template fields
export const formatTemplate = (template: string, data: Record<string, any>): string => {
  let formatted = template;
  Object.entries(data).forEach(([key, val]) => {
    const placeholder = `{${key}}`;
    formatted = formatted.split(placeholder).join(val !== undefined && val !== null ? String(val) : '');
  });
  return formatted;
};

// Generates an AppNotification for Order Completion
export const checkAndGenerateOrderCompletion = (
  service: Service,
  rules: SmartNotificationRule[],
  currentUserUsername: string
): AppNotification | null => {
  const rule = rules.find(r => r.id === 'rule_order_completed');
  if (!rule || !rule.enabled) return null;

  const placeholders = {
    customerFirstName: service.customerFirstName,
    customerLastName: service.customerLastName,
    customerName: `${service.customerFirstName} ${service.customerLastName}`.trim(),
    carBrandModel: service.carBrandModel || 'vehicle',
    carNumber: service.carNumber || 'N/A',
    grandTotal: service.grandTotal.toFixed(2),
    submissionId: service.submissionId,
    serviceSelection: (service.serviceSelection || []).join(', ')
  };

  const message = formatTemplate(rule.template, placeholders);
  
  return {
    id: `notif_comp_${service.submissionId}_${Date.now()}`,
    userId: currentUserUsername || 'admin',
    serviceId: service.submissionId,
    message,
    timestamp: new Date().toISOString(),
    isRead: false,
    type: 'completed',
    customerName: placeholders.customerName,
    mobileNumber: service.mobileNumber,
    carNumber: service.carNumber,
    serviceType: service.serviceSelection?.[0] || 'General'
  };
};

// Generates an AppNotification for Lead Arrival
export const checkAndGenerateLeadArrival = (
  lead: ServiceRequest,
  rules: SmartNotificationRule[],
  currentUserUsername: string
): AppNotification | null => {
  const rule = rules.find(r => r.id === 'rule_lead_arrival');
  if (!rule || !rule.enabled) return null;

  const placeholders = {
    source: lead.source || 'Website',
    customerName: lead.customerName,
    customerPhone: lead.customerPhone,
    requestedService: lead.requestedService,
    requestDate: lead.requestDate || ''
  };

  const message = formatTemplate(rule.template, placeholders);

  return {
    id: `notif_lead_${lead.id}_${Date.now()}`,
    userId: currentUserUsername || 'admin',
    serviceId: lead.id,
    message,
    timestamp: new Date().toISOString(),
    isRead: false,
    type: 'manual-order',
    customerName: lead.customerName,
    mobileNumber: lead.customerPhone,
    serviceType: lead.requestedService
  };
};

// Scans submissions and generates due orders notifications (capped at max 5 per run)
export const checkAndGenerateDueOrders = (
  submissions: Service[],
  existingNotifications: AppNotification[],
  rules: SmartNotificationRule[],
  currentUserUsername: string
): AppNotification[] => {
  const rule = rules.find(r => r.id === 'rule_order_due');
  if (!rule || !rule.enabled) return [];

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const newNotifications: AppNotification[] = [];

  for (const service of submissions) {
    if (newNotifications.length >= 5) break; // Hard safety cap: max 5 due notifications per pass

    // Only check active/non-completed orders scheduled for today
    if (
      service.scheduledDate && 
      service.scheduledDate === todayStr && 
      service.status !== 'Completed' && 
      !service.isDeleted
    ) {
      const notificationId = `notif_due_${service.submissionId}_${todayStr}`;
      
      // Check if we already have a due notification for this order today
      const alreadyNotified = existingNotifications.some(
        n => n.id === notificationId || 
             (n.serviceId === service.submissionId && n.type === 'reminder-60min')
      );
      
      if (!alreadyNotified) {
        const placeholders = {
          customerFirstName: service.customerFirstName,
          customerLastName: service.customerLastName,
          customerName: `${service.customerFirstName} ${service.customerLastName}`.trim(),
          carBrandModel: service.carBrandModel || 'vehicle',
          carNumber: service.carNumber || 'N/A',
          scheduledDate: service.scheduledDate,
          scheduledTime: service.scheduledTime || 'N/A',
          assignedTo: service.assignedTo || 'Unassigned',
          submissionId: service.submissionId,
          serviceSelection: (service.serviceSelection || []).join(', ')
        };

        const message = formatTemplate(rule.template, placeholders);

        newNotifications.push({
          id: notificationId,
          userId: currentUserUsername || 'admin',
          serviceId: service.submissionId,
          message,
          timestamp: new Date().toISOString(),
          isRead: false,
          type: 'reminder-60min',
          customerName: placeholders.customerName,
          mobileNumber: service.mobileNumber,
          carNumber: service.carNumber,
          serviceType: service.serviceSelection?.[0] || 'General'
        });
      }
    }
  }

  return newNotifications;
};

// Scans completed submissions and generates retention followups (capped at max 5 per run, recent completed orders only)
export const checkAndGenerateFollowups = (
  submissions: Service[],
  existingNotifications: AppNotification[],
  rules: SmartNotificationRule[],
  currentUserUsername: string
): AppNotification[] => {
  const rule = rules.find(r => r.id === 'rule_reminder_followup');
  if (!rule || !rule.enabled) return [];

  const daysDelay = rule.daysDelay || 15;
  const now = new Date();
  const newNotifications: AppNotification[] = [];

  for (const service of submissions) {
    if (newNotifications.length >= 5) break; // Hard safety cap: max 5 followup notifications per pass

    if (service.status === 'Completed' && !service.isDeleted && service.timestamp) {
      const completionDate = new Date(service.timestamp);
      if (isNaN(completionDate.getTime())) continue;

      const diffTime = Math.abs(now.getTime() - completionDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Trigger if we are past the delay days AND within recent window (e.g., last 60 days)
      if (diffDays >= daysDelay && diffDays <= 60) {
        const notificationId = `notif_followup_${service.submissionId}_${daysDelay}d`;

        // Check if we already notified for this followup delay
        const alreadyNotified = existingNotifications.some(
          n => n.id === notificationId || 
               (n.serviceId === service.submissionId && n.type === 'reminder-30min')
        );

        if (!alreadyNotified) {
          const placeholders = {
            customerFirstName: service.customerFirstName,
            customerLastName: service.customerLastName,
            customerName: `${service.customerFirstName} ${service.customerLastName}`.trim(),
            carBrandModel: service.carBrandModel || 'vehicle',
            carNumber: service.carNumber || 'N/A',
            days: daysDelay,
            submissionId: service.submissionId,
            serviceType: service.serviceSelection?.[0] || 'General'
          };

          const message = formatTemplate(rule.template, placeholders);

          newNotifications.push({
            id: notificationId,
            userId: currentUserUsername || 'admin',
            serviceId: service.submissionId,
            message,
            timestamp: new Date().toISOString(),
            isRead: false,
            type: 'reminder-30min',
            customerName: placeholders.customerName,
            mobileNumber: service.mobileNumber,
            carNumber: service.carNumber,
            serviceType: service.serviceSelection?.[0] || 'General'
          });
        }
      }
    }
  }

  return newNotifications;
};
