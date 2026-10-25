import React, { useState, useEffect } from 'react';
import { User, NotificationPreferences, Permission } from '../types';
import Card from './ui/Card';
import Button from './ui/Button';
import { 
  playNotificationAlert, 
  getTodayDispatchedCount 
} from '../services/notificationService';
import PushNotificationManager from './PushNotificationManager';
import { triggerHapticFeedback } from '../services/hapticService';
import { 
  IconBell, 
  IconBellRinging, 
  IconCheck, 
  IconAlertTriangle, 
  IconShieldCheck, 
  IconVolume2, 
  IconVolumeX, 
  IconClock, 
  IconSliders, 
  IconLock 
} from './ui/Icon';

interface ToggleSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, description, checked, onChange, disabled }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    triggerHapticFeedback('light');
    onChange(e.target.checked);
  };
  
  return (
    <label className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
      disabled 
        ? 'cursor-not-allowed bg-slate-50 border-slate-200 opacity-60' 
        : 'cursor-pointer bg-white border-slate-200 hover:border-slate-300'
    }`}>
      <div className="pr-4">
        <p className={`font-semibold text-sm ${disabled ? 'text-slate-400' : 'text-slate-800'}`}>{label}</p>
        <p className={`text-xs mt-0.5 ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p>
      </div>
      <div className="relative inline-flex items-center cursor-pointer shrink-0">
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={handleChange} 
          className="sr-only peer" 
          disabled={disabled} 
        />
        <div className="w-11 h-6 bg-slate-200 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-accent"></div>
      </div>
    </label>
  );
};

const defaultPrefs: NotificationPreferences = {
  enabled: { assigned: false, reminder: false, queued: false, completed: false, manual: false, overdue: false },
  sound: 'none',
  vibration: false,
  consentGranted: false,
  priorityOnly: false,
  maxDailyAlerts: 15,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

interface Props {
  currentUser: User;
  onSave: (username: string, prefs: NotificationPreferences) => void;
  onUpdatePushSubscription: (username: string, subscription: PushSubscriptionJSON | null) => void;
}

const NotificationPreferencesPage: React.FC<Props> = ({ currentUser, onSave, onUpdatePushSubscription }) => {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.permissions?.includes(Permission.CAN_MANAGE_USERS);

  const [prefs, setPrefs] = useState<NotificationPreferences>(() => {
    const userPrefs = currentUser?.notificationPreferences;
    const isConsent = userPrefs?.consentGranted === true;
    return {
      enabled: {
        assigned: isConsent ? (userPrefs?.enabled?.assigned ?? true) : false,
        reminder: isConsent ? (userPrefs?.enabled?.reminder ?? true) : false,
        queued: isConsent ? (userPrefs?.enabled?.queued ?? false) : false,
        completed: isConsent ? (userPrefs?.enabled?.completed ?? true) : false,
        manual: isConsent ? (userPrefs?.enabled?.manual ?? true) : false,
        overdue: isConsent ? (userPrefs?.enabled?.overdue ?? true) : false,
      },
      sound: isConsent ? (userPrefs?.sound || 'default') : 'none',
      vibration: isConsent ? (userPrefs?.vibration ?? true) : false,
      consentGranted: isConsent,
      consentTimestamp: userPrefs?.consentTimestamp,
      consentGrantedBy: userPrefs?.consentGrantedBy,
      priorityOnly: isConsent ? (userPrefs?.priorityOnly ?? false) : false,
      maxDailyAlerts: isConsent ? (userPrefs?.maxDailyAlerts ?? 15) : 15,
      quietHoursEnabled: isConsent ? (userPrefs?.quietHoursEnabled ?? false) : false,
      quietHoursStart: userPrefs?.quietHoursStart || '22:00',
      quietHoursEnd: userPrefs?.quietHoursEnd || '07:00',
    };
  });

  const [saveMessage, setSaveMessage] = useState('');
  const [todayAlertCount, setTodayAlertCount] = useState<number>(0);

  useEffect(() => {
    setTodayAlertCount(getTodayDispatchedCount());
  }, []);

  const handleConsentToggle = (activate: boolean) => {
    triggerHapticFeedback('medium');
    let updated: NotificationPreferences;

    if (activate) {
      // Activated with consent of user or admin to manage the notification load
      const grantedBy = isAdmin ? `${currentUser.username} (Admin)` : currentUser.username;
      updated = {
        ...prefs,
        consentGranted: true,
        consentTimestamp: new Date().toISOString(),
        consentGrantedBy: grantedBy,
        enabled: {
          assigned: true,
          reminder: true,
          overdue: true,
          completed: true,
          manual: true,
          queued: currentUser?.permissions?.includes(Permission.CAN_ASSIGN_ORDERS) ?? false,
        },
        sound: prefs.sound === 'none' ? 'default' : prefs.sound,
        vibration: true,
        priorityOnly: prefs.priorityOnly ?? false,
        maxDailyAlerts: prefs.maxDailyAlerts || 15,
        quietHoursEnabled: prefs.quietHoursEnabled ?? false,
        quietHoursStart: prefs.quietHoursStart || '22:00',
        quietHoursEnd: prefs.quietHoursEnd || '07:00',
      };
      setSaveMessage(isAdmin ? 'Notifications activated with Admin consent. Load management enabled.' : 'Notifications activated with your consent. Load management enabled.');
    } else {
      // Deactivated by default to manage notification load
      updated = {
        ...prefs,
        consentGranted: false,
        consentTimestamp: undefined,
        consentGrantedBy: undefined,
        enabled: { assigned: false, reminder: false, queued: false, completed: false, manual: false, overdue: false },
        sound: 'none',
        vibration: false,
      };
      setSaveMessage('Notifications deactivated by default. Zero notification load restored.');
    }

    setPrefs(updated);
    onSave(currentUser.username, updated);
    setTimeout(() => setSaveMessage(''), 4000);
  };

  const handleEnabledChange = (key: keyof NotificationPreferences['enabled'], value: boolean) => {
    if (!prefs.consentGranted) return;
    setPrefs(p => ({ ...p, enabled: { ...p.enabled, [key]: value } }));
  };
  
  const handleSoundChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!prefs.consentGranted) return;
    const newSound = e.target.value as NotificationPreferences['sound'];
    setPrefs(p => ({ ...p, sound: newSound }));
    // Play a preview
    playNotificationAlert({ ...prefs, sound: newSound, consentGranted: true });
  };
  
  const handleVibrationChange = (checked: boolean) => {
    if (!prefs.consentGranted) return;
    setPrefs(p => ({ ...p, vibration: checked }));
    if (checked) {
      playNotificationAlert({ ...prefs, vibration: true, sound: 'none', consentGranted: true });
    }
  };

  const handleSave = () => {
    onSave(currentUser.username, prefs);
    setSaveMessage('Preferences saved successfully!');
    setTimeout(() => setSaveMessage(''), 3000);
  };
  
  const handleSubscriptionUpdate = (subscription: PushSubscriptionJSON | null) => {
    onUpdatePushSubscription(currentUser.username, subscription);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Notification Preferences</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage system notification load, consent authorization, quiet hours, and real-time audio/device alerts.
        </p>
      </div>

      {/* 1. MASTER CONSENT & LOAD STATUS BANNER */}
      <div className={`p-6 rounded-2xl border transition-all ${
        prefs.consentGranted
          ? 'bg-gradient-to-r from-emerald-50 to-teal-50/70 border-emerald-200 shadow-sm'
          : 'bg-gradient-to-r from-amber-50 to-orange-50/70 border-amber-200'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              prefs.consentGranted ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
            }`}>
              {prefs.consentGranted ? (
                <IconBellRinging className="w-6 h-6 animate-pulse" />
              ) : (
                <IconVolumeX className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  {prefs.consentGranted ? 'Notifications Activated with Consent' : 'Notifications Deactivated by Default'}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  prefs.consentGranted
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {prefs.consentGranted ? 'Active & Load-Managed' : 'Deactivated (Default)'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-xl">
                {prefs.consentGranted ? (
                  <>
                    Consent granted by <strong className="text-slate-800">{prefs.consentGrantedBy || currentUser.username}</strong>
                    {prefs.consentTimestamp ? ` on ${new Date(prefs.consentTimestamp).toLocaleDateString()} at ${new Date(prefs.consentTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.
                    Notification dispatch is active with intelligent load management and volume throttling.
                  </>
                ) : (
                  <>
                    To prevent system overload, battery drain, and notification fatigue, notifications are <strong>kept deactivated by default</strong>.
                    Activate below with your consent (or admin authorization) to manage and receive scheduled alerts.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
            {prefs.consentGranted ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleConsentToggle(false)}
                className="bg-white border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold shadow-xs"
              >
                <IconVolumeX className="w-4 h-4 mr-1.5 text-rose-500" />
                Deactivate Notifications
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleConsentToggle(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
              >
                <IconShieldCheck className="w-4 h-4 mr-1.5" />
                {isAdmin ? 'Grant Consent & Activate' : 'Activate with My Consent'}
              </Button>
            )}
          </div>
        </div>

        {saveMessage && (
          <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <IconCheck className="w-4 h-4 text-emerald-600" />
            <span>{saveMessage}</span>
          </div>
        )}
      </div>

      {/* 2. NOTIFICATION LOAD MANAGEMENT CONTROLS */}
      <Card title="Notification Load Management">
        <p className="text-sm text-slate-600 mb-5">
          Fine-tune alert volume and throttling to ensure notifications keep your team focused without overwhelming their devices.
        </p>

        <div className={`space-y-5 transition-opacity ${prefs.consentGranted ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          {/* Priority-Only Mode */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                <IconSliders className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 text-sm">Priority Alerts Only (Minimum Load)</span>
                  {prefs.priorityOnly && (
                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase">Low Load Active</span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Filters out non-critical alerts. Only triggers for critical overdue jobs (&gt;1 hour) and direct job assignments, muting routine status updates.
                </p>
              </div>
            </div>
            <div className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={!!prefs.priorityOnly}
                onChange={e => setPrefs(p => ({ ...p, priorityOnly: e.target.checked }))}
                className="sr-only peer"
                disabled={!prefs.consentGranted}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </div>
          </div>

          {/* Daily Alert Cap */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                <IconBell className="w-5 h-5" />
              </div>
              <div>
                <span className="font-semibold text-slate-900 text-sm">Daily Notification Cap</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Limits maximum dispatched alerts per day to manage device load.
                  <span className="ml-1 text-slate-700 font-medium">(Today: {todayAlertCount} sent)</span>
                </p>
              </div>
            </div>
            <div className="shrink-0 w-full sm:w-44">
              <select
                value={prefs.maxDailyAlerts || 15}
                onChange={e => setPrefs(p => ({ ...p, maxDailyAlerts: parseInt(e.target.value, 10) }))}
                disabled={!prefs.consentGranted}
                className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              >
                <option value={5}>Max 5 alerts/day (Strict)</option>
                <option value={10}>Max 10 alerts/day (Moderate)</option>
                <option value={15}>Max 15 alerts/day (Balanced)</option>
                <option value={25}>Max 25 alerts/day (High)</option>
                <option value={999}>Unlimited (No Cap)</option>
              </select>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                  <IconClock className="w-5 h-5" />
                </div>
                <div>
                  <span className="font-semibold text-slate-900 text-sm">Quiet Hours (Off-Shift Mute)</span>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically suppresses sounds and push notifications during off-duty or rest hours.
                  </p>
                </div>
              </div>
              <div className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!prefs.quietHoursEnabled}
                  onChange={e => setPrefs(p => ({ ...p, quietHoursEnabled: e.target.checked }))}
                  className="sr-only peer"
                  disabled={!prefs.consentGranted}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </div>
            </div>

            {prefs.quietHoursEnabled && (
              <div className="pt-3 border-t border-slate-100 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-medium">Mute from:</span>
                  <input
                    type="time"
                    value={prefs.quietHoursStart || '22:00'}
                    onChange={e => setPrefs(p => ({ ...p, quietHoursStart: e.target.value }))}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-medium">until:</span>
                  <input
                    type="time"
                    value={prefs.quietHoursEnd || '07:00'}
                    onChange={e => setPrefs(p => ({ ...p, quietHoursEnd: e.target.value }))}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md font-mono text-xs bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {!prefs.consentGranted && (
          <div className="mt-4 p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
            <IconLock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Load management settings are locked while notifications remain deactivated by default.</span>
          </div>
        )}
      </Card>

      {/* 3. DEVICE & PUSH NOTIFICATIONS */}
      <Card title="Device & Push Notifications">
        <p className="text-sm text-slate-600 mb-4">
          Receive native alerts, ringtones, and lock-screen banners directly on your phone or desktop browser.
        </p>
        <PushNotificationManager 
          onUpdateSubscription={handleSubscriptionUpdate} 
          prefs={prefs} 
        />
      </Card>

      {/* 4. IN-APP ALERT CATEGORIES */}
      <Card title="In-App Alert Types">
        <p className="text-sm text-slate-600 mb-6">
          Choose which real-time alerts you want to receive inside the app. These settings also control which push notifications are sent.
        </p>
        <div className="space-y-3">
          <ToggleSwitch
            label="Order Assignments"
            description="When a new service order or lead is assigned to you."
            checked={prefs.enabled.assigned}
            onChange={v => handleEnabledChange('assigned', v)}
            disabled={!prefs.consentGranted}
          />
          <ToggleSwitch
            label="Upcoming Reminders"
            description="30 and 60-minute automated reminders for your scheduled field services."
            checked={prefs.enabled.reminder}
            onChange={v => handleEnabledChange('reminder', v)}
            disabled={!prefs.consentGranted || prefs.priorityOnly}
          />
          <ToggleSwitch
            label="Overdue Alerts (Critical)"
            description="When an assigned service is overdue past its scheduled time slot."
            checked={prefs.enabled.overdue}
            onChange={v => handleEnabledChange('overdue', v)}
            disabled={!prefs.consentGranted}
          />
          <ToggleSwitch
            label="Order Completed"
            description="When a service you are assigned to is marked complete."
            checked={prefs.enabled.completed}
            onChange={v => handleEnabledChange('completed', v)}
            disabled={!prefs.consentGranted || prefs.priorityOnly}
          />
          <ToggleSwitch
            label="Manual & Broadcast Announcements"
            description="Urgent dispatch messages sent manually by administrators."
            checked={prefs.enabled.manual}
            onChange={v => handleEnabledChange('manual', v)}
            disabled={!prefs.consentGranted}
          />
          <ToggleSwitch
            label="New Queued Orders (Dispatchers & Admins)"
            description="When a new order is booked online and enters the unassigned queue."
            checked={prefs.enabled.queued}
            onChange={v => handleEnabledChange('queued', v)}
            disabled={!prefs.consentGranted || !currentUser?.permissions?.includes(Permission.CAN_ASSIGN_ORDERS)}
          />
        </div>
      </Card>

      {/* 5. ALERT STYLES (SOUND & VIBRATION) */}
      <Card title="In-App Alert Styles">
        <p className="text-sm text-slate-600 mb-6">
          Customize the audio tone and haptic vibration for alerts received while using the app.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <label htmlFor="sound" className="block text-sm font-semibold text-slate-700 mb-1.5">
              Notification Sound Tone
            </label>
            <select
              id="sound"
              name="sound"
              value={prefs.sound}
              onChange={handleSoundChange}
              disabled={!prefs.consentGranted}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl shadow-xs bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent text-sm disabled:bg-slate-100 disabled:opacity-60"
            >
              <option value="none">None (Silent)</option>
              <option value="default">Default Beep (440Hz)</option>
              <option value="tone1">Tone 1 - Two Tone Chime</option>
              <option value="tone2">Tone 2 - Descending Alert</option>
            </select>
            <p className="text-xs text-slate-500 mt-1.5">Select a tone to hear a live preview.</p>
          </div>
          <div>
            <ToggleSwitch
              label="Enable Haptic Vibration"
              description="Vibrate on mobile devices for urgent new alerts."
              checked={prefs.vibration}
              onChange={handleVibrationChange}
              disabled={!prefs.consentGranted}
            />
          </div>
        </div>
      </Card>

      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:justify-between items-center gap-4">
        <div className="text-xs text-slate-500">
          {prefs.consentGranted ? (
            <span className="text-emerald-700 font-medium flex items-center gap-1.5">
              <IconCheck className="w-4 h-4" /> Consent active. Load management rules enforced.
            </span>
          ) : (
            <span className="text-amber-700 font-medium flex items-center gap-1.5">
              <IconLock className="w-4 h-4" /> Deactivated by default. No alerts will interrupt your session.
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && <p className="text-xs text-emerald-600 font-bold">{saveMessage}</p>}
          <Button onClick={handleSave} className="px-6 py-2.5 font-bold shadow-md">
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotificationPreferencesPage;
