import React, { useState, useMemo } from 'react';
import { AppNotification, User, Service, SmartNotificationRule, Settings } from '../../types';
import { generateServiceReminders, REMINDER_INTERVALS } from '../../services/reminderService';
import { DEFAULT_NOTIFICATION_RULES } from '../../services/notificationTriggerService';
import { 
  Bell, BellRing, Search, Filter, CheckCircle, Clock, VolumeX,
  Phone, MessageSquare, PlusCircle, Check, Calendar, AlertTriangle,
  Sliders, Save, ToggleLeft, ToggleRight, Info, Eye, Zap, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import SkeletonLoader from '../ui/SkeletonLoader';

interface NotificationsManagerPageProps {
  isLoading?: boolean;
  isHydrated?: boolean;
  notifications: AppNotification[];
  submissions: Service[];
  currentUser: User;
  onUpdateNotification: (notification: AppNotification) => Promise<void>;
  onBookService: (customerData: { firstName: string, lastName: string, mobileNumber: string, carNumber: string, carBrandModel: string, serviceSelection: string[] }) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
}

export const NotificationsManagerPage: React.FC<NotificationsManagerPageProps> = (props) => {
  const {
    notifications,
    submissions,
    currentUser,
    onUpdateNotification,
    onBookService,
    onRefresh,
    isRefreshing,
    settings,
    onSaveSettings,
    isLoading,
    isHydrated
  } = props;

  const [activeTab, setActiveTab] = useState<'alerts' | 'rules'>('alerts');

  // Load rules from settings, fallback to default
  const rules = useMemo(() => {
    return settings?.notificationRules || DEFAULT_NOTIFICATION_RULES;
  }, [settings?.notificationRules]);

  // Compute dynamic service reminders and merge with standard notifications
  const allRemindersAndNotifications = useMemo(() => {
    const serviceReminders = generateServiceReminders(submissions || [], notifications || []);
    const activeDatabaseNotifications = (notifications || []).filter(n => !n.isDismissed);
    
    return [...activeDatabaseNotifications, ...serviceReminders].sort((a, b) => {
      if (a.type === 'service-reminder' && b.type !== 'service-reminder') return -1;
      if (a.type !== 'service-reminder' && b.type === 'service-reminder') return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [notifications, submissions]);

  // Search & Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all'); // all, unread, read, critical, snoozed

  // Filter list based on search and selected options
  const filteredNotifications = useMemo(() => {
    return allRemindersAndNotifications.filter(item => {
      const st = searchTerm.toLowerCase();
      const matchSearch = 
        String(item.message || '').toLowerCase().includes(st) ||
        (item.customerName && String(item.customerName).toLowerCase().includes(st)) ||
        (item.mobileNumber && String(item.mobileNumber).includes(searchTerm)) ||
        (item.carNumber && String(item.carNumber).toLowerCase().includes(st));

      if (!matchSearch) return false;

      if (selectedServiceType !== 'all') {
        if (item.type !== 'service-reminder') return false;
        if (item.serviceType !== selectedServiceType) return false;
      }

      const now = new Date();
      const isSnoozed = item.snoozedUntil && new Date(item.snoozedUntil) > now;
      const isCritical = item.daysOverdue && item.daysOverdue > 15;

      if (selectedStatus === 'unread') return !item.isRead && !isSnoozed;
      if (selectedStatus === 'read') return item.isRead && !isSnoozed;
      if (selectedStatus === 'critical') return !!isCritical && !isSnoozed;
      if (selectedStatus === 'snoozed') return !!isSnoozed;
      
      if (selectedStatus === 'all' && isSnoozed) return false;

      return true;
    });
  }, [allRemindersAndNotifications, searchTerm, selectedServiceType, selectedStatus]);

  // Compute Statistics
  const stats = useMemo(() => {
    const totalReminders = allRemindersAndNotifications.filter(n => n.type === 'service-reminder').length;
    const unreadCount = allRemindersAndNotifications.filter(n => !n.isRead && !(n.snoozedUntil && new Date(n.snoozedUntil) > new Date())).length;
    
    const now = new Date();
    const criticalCount = allRemindersAndNotifications.filter(n => n.daysOverdue && n.daysOverdue > 15 && !(n.snoozedUntil && new Date(n.snoozedUntil) > now)).length;
    const snoozedCount = allRemindersAndNotifications.filter(n => n.snoozedUntil && new Date(n.snoozedUntil) > now).length;

    return { totalReminders, unreadCount, criticalCount, snoozedCount };
  }, [allRemindersAndNotifications]);

  // Handlers for alerts
  const handleMarkAsRead = async (notification: AppNotification) => {
    try {
      const updated = { ...notification, isRead: true };
      await onUpdateNotification(updated);
      toast.success('Notification marked as read');
    } catch (e) {
      toast.error('Failed to update notification');
    }
  };

  const handleSnooze = async (notification: AppNotification, days: number) => {
    try {
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + days);
      
      const updated = { 
        ...notification, 
        snoozedUntil: snoozeUntil.toISOString(),
        isRead: true 
      };
      await onUpdateNotification(updated);
      toast.success(`Reminder snoozed for ${days} days`);
    } catch (e) {
      toast.error('Failed to snooze reminder');
    }
  };

  const handleDismiss = async (notification: AppNotification) => {
    try {
      const updated = { ...notification, isDismissed: true };
      await onUpdateNotification(updated);
      toast.success('Reminder dismissed');
    } catch (e) {
      toast.error('Failed to dismiss reminder');
    }
  };

  const handleOpenWhatsApp = (notification: AppNotification) => {
    if (!notification.mobileNumber) return;
    
    const cleanPhone = String(notification.mobileNumber).replace(/\D/g, '');
    let template = '';
    
    if (notification.serviceType) {
      const sType = notification.serviceType;
      template = `Hello ${notification.customerName || 'Customer'},\n\nHope you're doing well! 🚗\n\nAccording to our records, your vehicle (${notification.carNumber || 'registered car'}) is due for its recurring *${REMINDER_INTERVALS[sType]?.label || sType}* service.\n\nRegular care keeps your engine running like new! Would you like us to schedule a convenient pickup/service appointment for you today?\n\nBest regards,\nA Big Engine Team`;
    } else {
      template = `Hello ${notification.customerName || 'Customer'},\n\nThis is a quick friendly reminder from *A Big Engine* regarding your car service request status: ${notification.message}.\n\nLet us know if you have any questions!\n\nBest regards,\nA Big Engine Team`;
    }

    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(template)}`;
    window.open(url, '_blank');
  };

  const handleInitiateBooking = (notification: AppNotification) => {
    let selections: string[] = [];
    if (notification.serviceType === 'Car Wash') selections = ['Car Washing'];
    else if (notification.serviceType === 'Tyre') selections = ['Tyre Replacement'];
    else if (notification.serviceType === 'Detail') selections = ['Car Care'];
    else if (notification.serviceType === 'Battery') selections = ['Battery Replacement'];
    else selections = ['General Maintenance'];

    onBookService({
      firstName: notification.customerName?.split(' ')[0] || '',
      lastName: notification.customerName?.split(' ').slice(1).join(' ') || '',
      mobileNumber: notification.mobileNumber || '',
      carNumber: notification.carNumber || '',
      carBrandModel: '',
      serviceSelection: selections
    });
  };

  // Rule management state
  const [editedRules, setEditedRules] = useState<Record<string, SmartNotificationRule>>({});
  const [simulatedTemplate, setSimulatedTemplate] = useState<string>('');
  const [simulationVariables, setSimulationVariables] = useState<string>('');

  const getRuleState = (rule: SmartNotificationRule): SmartNotificationRule => {
    return editedRules[rule.id] || rule;
  };

  const updateRuleField = (ruleId: string, field: keyof SmartNotificationRule, value: any) => {
    const currentRule = editedRules[ruleId] || rules.find(r => r.id === ruleId)!;
    setEditedRules(prev => ({
      ...prev,
      [ruleId]: {
        ...currentRule,
        [field]: value
      }
    }));
  };

  const updateChannelField = (ruleId: string, channel: keyof SmartNotificationRule['channels'], value: boolean) => {
    const currentRule = editedRules[ruleId] || rules.find(r => r.id === ruleId)!;
    setEditedRules(prev => ({
      ...prev,
      [ruleId]: {
        ...currentRule,
        channels: {
          ...currentRule.channels,
          [channel]: value
        }
      }
    }));
  };

  const handleSaveRule = (ruleId: string) => {
    const ruleToSave = editedRules[ruleId];
    if (!ruleToSave) {
      toast.info('No unsaved changes for this rule.');
      return;
    }

    const nextRules = rules.map(r => r.id === ruleId ? ruleToSave : r);
    onSaveSettings({
      ...settings,
      notificationRules: nextRules
    });
    
    // Clear editing buffer for this rule
    setEditedRules(prev => {
      const copy = { ...prev };
      delete copy[ruleId];
      return copy;
    });

    toast.success(`Trigger rule "${ruleToSave.name}" updated in Cloud Database successfully!`);
  };

  const handleResetRulesToDefault = () => {
    if (window.confirm('Are you sure you want to restore all notification triggers to factory defaults? This will overwrite your template customizations.')) {
      onSaveSettings({
        ...settings,
        notificationRules: DEFAULT_NOTIFICATION_RULES
      });
      setEditedRules({});
      toast.success('All triggers restored to factory default templates!');
    }
  };

  // Helper to format placeholders for preview
  const handleTestPreview = (rule: SmartNotificationRule) => {
    const ruleState = getRuleState(rule);
    let sampleData: Record<string, string> = {
      customerFirstName: 'John',
      customerLastName: 'Doe',
      customerName: 'John Doe',
      carBrandModel: 'Honda Civic VTEC',
      carNumber: 'KA-03-MY-8888',
      grandTotal: '159.99',
      submissionId: 'SUB-2026-904',
      serviceSelection: 'Full Car Wash, Interior Detailing',
      source: 'Facebook Ads (Meta)',
      customerPhone: '+1 (555) 019-2834',
      requestedService: 'Ceramic Coating Nano Wash',
      scheduledDate: '2026-07-20',
      scheduledTime: '10:30 AM',
      assignedTo: 'Lead Tech Mike',
      days: String(ruleState.daysDelay || 15)
    };

    let preview = ruleState.template;
    Object.entries(sampleData).forEach(([k, v]) => {
      preview = preview.split(`{${k}}`).join(v);
    });

    setSimulatedTemplate(preview);
    setSimulationVariables(JSON.stringify(sampleData, null, 2));
  };

  if (isLoading || isHydrated === false || !notifications) {
    return <SkeletonLoader view="NOTIFICATIONS" />;
  }

  return (
    <div className="space-y-6 animate-fade-in" id="notifications-manager-page">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BellRing className="w-7 h-7 text-brand-blue" />
            Operations Control & Smart Notifications
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage automated service follow-ups, lead arrivals, and customize your notification dispatch engine rules.
          </p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-slate-200/80 p-1.5 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'alerts' 
                ? 'bg-white text-brand-blue shadow-sm' 
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Bell className="w-4 h-4" />
            Active Alerts ({filteredNotifications.length})
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'rules' 
                ? 'bg-white text-brand-blue shadow-sm' 
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Smart Trigger Rules
          </button>
        </div>
      </div>

      {/* Notification Load Management Policy Banner */}
      <div className="p-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-blue-50/40 to-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <VolumeX className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900">Notification Load Policy: Deactivated by Default</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider">
                Low Load Protected
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              To manage notification load across operations, real-time alerts remain deactivated by default until activated with user or admin consent.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg border shadow-2xs flex items-center gap-1.5 ${
            currentUser?.notificationPreferences?.consentGranted
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            {currentUser?.notificationPreferences?.consentGranted ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>My Consent: Active</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5 text-amber-600" />
                <span>My Notifications: Deactivated</span>
              </>
            )}
          </span>
        </div>
      </div>

      {activeTab === 'alerts' ? (
        <>
          {/* KPI Stats Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
                <Bell className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Reminders</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{stats.totalReminders}</p>
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-red-50 text-red-600 rounded-xl">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Urgent Overdue</p>
                <p className="text-2xl font-bold text-red-600 mt-0.5">{stats.criticalCount}</p>
              </div>
            </div>

            {/* KPI 3 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Unread Notifications</p>
                <p className="text-2xl font-bold text-amber-600 mt-0.5">{stats.unreadCount}</p>
              </div>
            </div>

            {/* KPI 4 */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="p-3.5 bg-slate-50 text-slate-600 rounded-xl">
                <VolumeX className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Snoozed Alerts</p>
                <p className="text-2xl font-bold text-slate-800 mt-0.5">{stats.snoozedCount}</p>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar Card */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by customer name, phone, car number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-blue"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Scan Live Reminders
              </button>

              {/* Service Category filter */}
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-200 text-xs text-slate-600">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={selectedServiceType}
                  onChange={(e) => setSelectedServiceType(e.target.value)}
                  className="bg-transparent focus:outline-none font-medium cursor-pointer"
                >
                  <option value="all">All Service Reminders</option>
                  <option value="Car Wash">Car Wash Only</option>
                  <option value="Tyre">Tyres Only</option>
                  <option value="Detail">Car Care & Detailing</option>
                  <option value="Battery">Battery Only</option>
                  <option value="General">General Maintenance</option>
                </select>
              </div>

              {/* Alert Status Filter */}
              <div className="flex items-center gap-1 bg-slate-50 rounded-xl px-2.5 py-1.5 border border-slate-200 text-xs text-slate-600">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-transparent focus:outline-none font-medium cursor-pointer"
                >
                  <option value="all">Active Alerts (Un-snoozed)</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                  <option value="critical">Critical Overdue (&gt;15 Days)</option>
                  <option value="snoozed">Snoozed Alerts</option>
                </select>
              </div>
            </div>
          </div>

          {/* Main Alerts List Grid */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Matching Alerts ({filteredNotifications.length})
              </span>
              {filteredNotifications.some(n => !n.isRead) && (
                <button
                  onClick={async () => {
                    const unreads = filteredNotifications.filter(n => !n.isRead);
                    for (const item of unreads) {
                      await onUpdateNotification({ ...item, isRead: true });
                    }
                    toast.success('All visible notifications marked as read');
                  }}
                  className="text-xs font-semibold text-brand-blue hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {filteredNotifications.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredNotifications.map((notification) => {
                  const isRem = notification.type === 'service-reminder';
                  const daysOverdue = notification.daysOverdue || 0;
                  const isCrit = daysOverdue > 15;
                  const isUnread = !notification.isRead;
                  
                  const formattedDate = new Date(notification.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  });

                  return (
                    <div 
                      key={notification.id} 
                      className={`p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                        isUnread ? 'bg-blue-50/30' : 'hover:bg-slate-50/40'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-xl mt-0.5 flex-shrink-0 ${
                          isRem 
                            ? isCrit ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                            : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                        }`}>
                          {isRem ? (
                            <Calendar className="w-5 h-5" />
                          ) : (
                            <Zap className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            {notification.customerName && (
                              <h4 className="font-bold text-slate-800 text-sm">
                                {notification.customerName}
                              </h4>
                            )}
                            {notification.carNumber && (
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">
                                {notification.carNumber}
                              </span>
                            )}
                            {isRem && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isCrit ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {isCrit ? 'CRITICAL OVERDUE' : 'DUE FOR ROUTINE SERVICE'}
                              </span>
                            )}
                            {!isRem && (
                              <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                System Event
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed font-medium">
                            {notification.message}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-slate-400 font-medium">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formattedDate}
                            </span>
                            {notification.mobileNumber && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5" />
                                {notification.mobileNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {isUnread && (
                          <button
                            onClick={() => handleMarkAsRead(notification)}
                            title="Mark as Read"
                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors border border-transparent hover:border-green-100 bg-slate-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}

                        {isRem && (
                          <button
                            onClick={() => handleInitiateBooking(notification)}
                            className="flex items-center gap-1.5 bg-brand-blue hover:bg-brand-blue-dark text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors shadow-sm"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Book Job
                          </button>
                        )}

                        {notification.mobileNumber && (
                          <button
                            onClick={() => handleOpenWhatsApp(notification)}
                            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-2 rounded-lg border border-emerald-100 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            WhatsApp
                          </button>
                        )}

                        {isRem && (
                          <div className="relative group">
                            <button
                              className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              Snooze
                            </button>
                            <div className="absolute right-0 bottom-full mb-1 w-32 bg-white rounded-lg shadow-lg border border-slate-200 py-1 hidden group-hover:block z-20">
                              <button onClick={() => handleSnooze(notification, 3)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">3 Days</button>
                              <button onClick={() => handleSnooze(notification, 7)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">7 Days</button>
                              <button onClick={() => handleSnooze(notification, 14)} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">14 Days</button>
                            </div>
                          </div>
                        )}

                        <button
                          onClick={() => handleDismiss(notification)}
                          title="Dismiss Reminder"
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-600 text-base">All clear!</p>
                <p className="text-sm text-slate-400 mt-1">No pending alerts or service reminders match your criteria.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Smart Rules Configuration tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Rules List Column */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Trigger Handlers</h3>
              <button
                onClick={handleResetRulesToDefault}
                className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
              >
                Restore Factory Defaults
              </button>
            </div>

            {rules.map((rule) => {
              const ruleState = getRuleState(rule);
              const isDirty = editedRules[rule.id] !== undefined;

              return (
                <div 
                  key={rule.id} 
                  className={`bg-white rounded-2xl border transition-all ${
                    ruleState.enabled ? 'border-slate-200 shadow-sm' : 'border-slate-100 bg-slate-50/50 opacity-80'
                  }`}
                >
                  <div className="p-5 flex items-start justify-between border-b border-slate-100">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl ${
                        ruleState.enabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-800 text-base">{ruleState.name}</h4>
                          {isDirty && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                              Unsaved changes
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{ruleState.description}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => updateRuleField(rule.id, 'enabled', !ruleState.enabled)}
                      className="focus:outline-none"
                    >
                      {ruleState.enabled ? (
                        <ToggleRight className="w-12 h-12 text-brand-blue" />
                      ) : (
                        <ToggleLeft className="w-12 h-12 text-slate-300" />
                      )}
                    </button>
                  </div>

                  {ruleState.enabled && (
                    <div className="p-5 space-y-4">
                      {/* Message Template Customization */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Notification Message Template
                        </label>
                        <textarea
                          rows={3}
                          value={ruleState.template}
                          onChange={(e) => updateRuleField(rule.id, 'template', e.target.value)}
                          className="w-full text-sm p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:border-brand-blue font-medium bg-slate-50/50"
                          placeholder="Compose message with placeholders..."
                        />
                      </div>

                      {/* Optional Retention Days Delay */}
                      {ruleState.event === 'reminder_followup' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Follow-Up Schedule (Days post service completion)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={ruleState.daysDelay || 15}
                            onChange={(e) => updateRuleField(rule.id, 'daysDelay', parseInt(e.target.value) || 15)}
                            className="w-32 text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:border-brand-blue font-semibold"
                          />
                        </div>
                      )}

                      {/* Dispatch Channels */}
                      <div>
                        <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Dispatch Channels
                        </span>
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ruleState.channels.bell}
                              onChange={(e) => updateChannelField(rule.id, 'bell', e.target.checked)}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                            />
                            App Bell Ring
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ruleState.channels.whatsapp}
                              onChange={(e) => updateChannelField(rule.id, 'whatsapp', e.target.checked)}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                            />
                            WhatsApp Helper Link
                          </label>
                          <label className="flex items-center gap-2 text-sm text-slate-600 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ruleState.channels.sms}
                              onChange={(e) => updateChannelField(rule.id, 'sms', e.target.checked)}
                              className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                            />
                            Simulated SMS Outbox
                          </label>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => handleSaveRule(rule.id)}
                          disabled={!isDirty}
                          className="flex items-center gap-1.5 bg-brand-blue hover:bg-brand-blue-dark text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Trigger Settings
                        </button>
                        <button
                          onClick={() => handleTestPreview(rule)}
                          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Test Preview
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Interactive Playgrounds and Info Sidebar */}
          <div className="space-y-6">
            
            {/* Guidelines Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Info className="w-4 h-4 text-brand-blue" />
                Variable Reference Guide
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Customize your dispatch templates with dynamic brackets. They will replace with real records automatically!
              </p>
              
              <div className="space-y-3 pt-2">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submissions / Orders</span>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{customerFirstName}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{carBrandModel}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{carNumber}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{grandTotal}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{submissionId}`}</code>
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Service Requests / Leads</span>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{source}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{customerName}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{customerPhone}`}</code>
                    <code className="text-[10px] bg-slate-50 p-1.5 rounded font-mono text-indigo-600 font-bold">{`{requestedService}`}</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Simulation Card */}
            {simulatedTemplate && (
              <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl shadow-xl space-y-4 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="font-bold text-sm flex items-center gap-2 text-indigo-400">
                    <Eye className="w-4 h-4" />
                    Live Formatting Test
                  </h4>
                  <button
                    onClick={() => setSimulatedTemplate('')}
                    className="text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Clear
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Dispatch Message Output:</span>
                    <p className="text-sm bg-slate-800/80 p-3 rounded-xl mt-1 leading-relaxed border border-slate-800">
                      {simulatedTemplate}
                    </p>
                  </div>

                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider font-bold">Simulator Payload (JSON):</span>
                    <pre className="text-[10px] font-mono bg-slate-800/40 p-3 rounded-xl mt-1 max-h-40 overflow-y-auto text-indigo-300">
                      {simulationVariables}
                    </pre>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsManagerPage;

