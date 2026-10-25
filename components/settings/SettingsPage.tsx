import React, { useState } from 'react';
import { 
  User, Settings, SubscriptionPlan, UserSubscription, 
  NotificationPreferences, PricingConfig, Permission, AppData 
} from '../../types';
import Card from '../ui/Card';
import { 
  IconSettings, IconCreditCard, IconReceipt, 
  IconBellCog, IconTrophy, IconCloudCheck 
} from '../ui/Icon';
import { MapPin, Mail, Activity, Sun, Moon, Smartphone } from 'lucide-react';
import { SettingsModalContent } from './SettingsModalContent';
import SubscriptionPlanManagementPage from '../admin/SubscriptionPlanManagementPage';
import UserSubscriptionManagementPage from '../admin/UserSubscriptionManagementPage';
import NotificationPreferencesPage from '../NotificationPreferencesPage';
import { HubManagementPage } from '../admin/HubManagementPage';
import { EmailReportsTab } from './EmailReportsTab';
import { DiagnosticsTab } from './DiagnosticsTab';
import { Msg91SettingsTab } from './Msg91SettingsTab';
import { SystemHealthSyncPanel } from './SystemHealthSyncPanel';
import { HapticsSettingsTab } from './HapticsSettingsTab';
import { MessageSquare } from 'lucide-react';
import { haptic } from '../../utils/haptics';
// FIX: Added missing import for DEFAULT_PRICING_CONFIG from constants.
import { DEFAULT_PRICING_CONFIG } from '../../constants';
import SkeletonLoader from '../ui/SkeletonLoader';

interface SettingsPageProps {
  currentUser: User;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
  subscriptionPlans: SubscriptionPlan[];
  onUpdatePlans: (plans: SubscriptionPlan[]) => void;
  userSubscriptions: UserSubscription[];
  onUpdateUserSubscriptions: (subs: UserSubscription[]) => void;
  onAutoSchedule: (sub: UserSubscription) => void;
  onUpdateNotificationPreferences: (username: string, prefs: NotificationPreferences) => void;
  onUpdatePushSubscription: (username: string, sub: PushSubscriptionJSON | null) => void;
  onUpdatePricing: (config: PricingConfig) => void;
  appData: AppData;
  onRefresh: () => Promise<void>;
  isLoading?: boolean;
  isHydrated?: boolean;
}

type SettingsTab = 'sync' | 'cloud' | 'plans' | 'members' | 'hubs' | 'msg91' | 'notifications' | 'reports' | 'diagnostics' | 'haptics' | 'appearance';

export const SettingsPage: React.FC<SettingsPageProps> = (props) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sync');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  });

  if (props.isLoading || props.isHydrated === false || !props.settings || !props.currentUser) {
    return <SkeletonLoader view="SETTINGS" />;
  }

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.style.setProperty('--bg-primary', '#0f172a');
      document.documentElement.style.setProperty('--text-primary', '#f8fafc');
      document.documentElement.style.setProperty('--bg-card', '#1e293b');
      document.documentElement.style.setProperty('--border-color', '#334155');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.setProperty('--bg-primary', '#f8fafc');
      document.documentElement.style.setProperty('--text-primary', '#0f172a');
      document.documentElement.style.setProperty('--bg-card', '#ffffff');
      document.documentElement.style.setProperty('--border-color', '#e2e8f0');
    }
  };

  const hasPermission = (p: Permission) => props.currentUser?.permissions?.includes(p) ?? false;
  const isAdminOrManager = props.currentUser?.role === 'admin' || props.currentUser?.role === 'manager';

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'sync', label: 'System Health & Sync', icon: <Activity className="w-4 h-4 text-emerald-500" />, show: isAdminOrManager || hasPermission(Permission.CAN_EDIT_SETTINGS) },
    { id: 'cloud', label: 'Cloud Config', icon: <IconCloudCheck className="w-4 h-4" />, show: hasPermission(Permission.CAN_EDIT_SETTINGS) || props.currentUser.role === 'admin' },
    { id: 'plans', label: 'Plan Management', icon: <IconCreditCard className="w-4 h-4" />, show: hasPermission(Permission.CAN_MANAGE_PLANS) || isAdminOrManager },
    { id: 'members', label: 'Subscription Management', icon: <IconTrophy className="w-4 h-4" />, show: hasPermission(Permission.CAN_MANAGE_SUBSCRIPTIONS) || isAdminOrManager },
    { id: 'hubs', label: 'Hub Management', icon: <MapPin className="w-4 h-4" />, show: props.currentUser.role === 'admin' || props.currentUser.role === 'manager' },
    { id: 'msg91', label: 'MSG91 SMS Gateway', icon: <MessageSquare className="w-4 h-4 text-indigo-500" />, show: isAdminOrManager || hasPermission(Permission.CAN_EDIT_SETTINGS) },
    { id: 'diagnostics', label: 'System Diagnostics & Audit', icon: <Activity className="w-4 h-4" />, show: props.currentUser.role === 'admin' || hasPermission(Permission.CAN_EDIT_SETTINGS) },
    { id: 'haptics', label: 'Android & Mobile Haptics', icon: <Smartphone className="w-4 h-4 text-amber-500" />, show: true },
    { id: 'notifications', label: 'Notification Management', icon: <IconBellCog className="w-4 h-4" />, show: true },
    { id: 'reports', label: 'Email Reports', icon: <Mail className="w-4 h-4" />, show: props.currentUser.role === 'admin' || props.currentUser.role === 'manager' },
    { id: 'appearance', label: 'Theme & Appearance', icon: <Moon className="w-4 h-4" />, show: true },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
            <IconSettings className="w-8 h-8 text-slate-400" />
            System Control Center
          </h1>
          <p className="text-slate-500">Configure business operations, pricing matrices, and automated alerts.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Tab Sidebar */}
        <div className="lg:w-72 flex-shrink-0">
          <Card className="p-2 sticky top-24">
            <nav className="space-y-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    haptic.selection();
                    setActiveTab(tab.id);
                  }}
                  data-haptic="selection"
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-brand-accent text-brand-blue shadow-md'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className={`${activeTab === tab.id ? 'text-brand-blue' : 'text-slate-400'}`}>
                    {tab.icon}
                  </div>
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'sync' && (
            <div className="animate-fadeIn">
              <SystemHealthSyncPanel 
                appData={props.appData} 
                onRefresh={props.onRefresh} 
                defaultExpanded={true} 
              />
            </div>
          )}
          {activeTab === 'haptics' && (
            <div className="animate-fadeIn">
              <HapticsSettingsTab />
            </div>
          )}
          {activeTab === 'cloud' && (
            <div className="animate-fadeIn">
              <SettingsModalContent 
                initialSettings={props.settings} 
                onSave={props.onSaveSettings} 
              />
            </div>
          )}
          {activeTab === 'plans' && (
            <div className="animate-fadeIn">
              <SubscriptionPlanManagementPage 
                plans={props.subscriptionPlans} 
                onUpdatePlans={props.onUpdatePlans} 
              />
            </div>
          )}
          {activeTab === 'members' && (
            <div className="animate-fadeIn">
              <UserSubscriptionManagementPage 
                userSubscriptions={props.userSubscriptions} 
                subscriptionPlans={props.subscriptionPlans} 
                onUpdateUserSubscriptions={props.onUpdateUserSubscriptions} 
                onAutoSchedule={props.onAutoSchedule} 
              />
            </div>
          )}
          {activeTab === 'notifications' && (
            <div className="animate-fadeIn">
              <NotificationPreferencesPage 
                currentUser={props.currentUser} 
                onSave={props.onUpdateNotificationPreferences} 
                onUpdatePushSubscription={props.onUpdatePushSubscription} 
              />
            </div>
          )}
          {activeTab === 'reports' && (
            <div className="animate-fadeIn">
              <EmailReportsTab 
                currentUser={props.currentUser} 
                settings={props.settings} 
                onSaveSettings={props.onSaveSettings} 
                appData={props.appData}
              />
            </div>
          )}
          {activeTab === 'hubs' && (
            <div className="animate-fadeIn">
              <HubManagementPage 
                appData={props.appData}
                onRefresh={props.onRefresh}
                sheetsUrl={props.settings.googleSheetsUrl}
              />
            </div>
          )}
          {activeTab === 'msg91' && (
            <div className="animate-fadeIn">
              <Msg91SettingsTab
                settings={props.settings}
                onSaveSettings={props.onSaveSettings}
              />
            </div>
          )}
          {activeTab === 'diagnostics' && (
            <div className="animate-fadeIn">
              <DiagnosticsTab 
                currentUser={props.currentUser}
                appData={props.appData}
                onRefresh={props.onRefresh}
              />
            </div>
          )}
          {activeTab === 'appearance' && (
            <div className="animate-fadeIn space-y-6">
              <Card title="Theme & Appearance">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Select Mode</h3>
                    <p className="text-xs text-slate-400 mt-1 dark:text-slate-300">Choose between light or dark presentation style. The change is stored instantly and applies dynamically across all client controls.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Light Mode */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('light')}
                      className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                        theme === 'light'
                          ? 'border-brand-accent bg-amber-50/20 ring-2 ring-brand-accent/50 dark:bg-amber-950/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${theme === 'light' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                          <Sun className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">Light Mode</div>
                          <div className="text-xs text-slate-400 dark:text-slate-400">Clean, crisp UI for high-contrast visibility</div>
                        </div>
                      </div>
                      {theme === 'light' && (
                        <div className="w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-blue text-xs font-bold shadow-sm">
                          ✓
                        </div>
                      )}
                    </button>

                    {/* Dark Mode */}
                    <button
                      type="button"
                      onClick={() => handleThemeChange('dark')}
                      className={`flex items-center justify-between p-4 rounded-xl border text-left transition-all ${
                        theme === 'dark'
                          ? 'border-purple-500 bg-purple-50/20 ring-2 ring-purple-500/50 dark:bg-purple-950/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-700 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                          <Moon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">Dark Mode</div>
                          <div className="text-xs text-slate-400 dark:text-slate-400">Low light comfort, high-end visual tone</div>
                        </div>
                      </div>
                      {theme === 'dark' && (
                        <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                          ✓
                        </div>
                      )}
                    </button>
                  </div>

                  <div className="border-t border-slate-100 dark:border-slate-700 pt-6">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">Active CSS Variables</h3>
                    <p className="text-xs text-slate-400 mt-1 mb-4 dark:text-slate-300">These real-time document properties are stored at `:root` and read by client-side renderers:</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">--bg-primary</span>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded border border-slate-200 dark:border-slate-600" style={{ backgroundColor: 'var(--bg-primary)' }} />
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{theme === 'dark' ? '#0f172a' : '#f8fafc'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">--text-primary</span>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded border border-slate-200 dark:border-slate-600" style={{ backgroundColor: 'var(--text-primary)' }} />
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{theme === 'dark' ? '#f8fafc' : '#0f172a'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">--bg-card</span>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded border border-slate-200 dark:border-slate-600" style={{ backgroundColor: 'var(--bg-card)' }} />
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{theme === 'dark' ? '#1e293b' : '#ffffff'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-xs">
                        <span className="font-mono text-slate-500 dark:text-slate-400">--border-color</span>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded border border-slate-200 dark:border-slate-600" style={{ backgroundColor: 'var(--border-color)' }} />
                          <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{theme === 'dark' ? '#334155' : '#e2e8f0'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;