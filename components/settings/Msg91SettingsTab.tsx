import React, { useState } from 'react';
import { Settings, Msg91Config } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { MessageSquare, Send, CheckCircle2, ShieldCheck, Key, PhoneCall, Sparkles, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { sendMsg91Sms } from '../../services/msg91Service';

interface Msg91SettingsTabProps {
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
}

export const Msg91SettingsTab: React.FC<Msg91SettingsTabProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [config, setConfig] = useState<Msg91Config>(() => ({
    enabled: settings.msg91Config?.enabled ?? false,
    authKey: settings.msg91Config?.authKey ?? '',
    senderId: settings.msg91Config?.senderId ?? 'ABGENG',
    orderCreatedFlowId: settings.msg91Config?.orderCreatedFlowId ?? '',
    orderRescheduledFlowId: settings.msg91Config?.orderRescheduledFlowId ?? '',
    orderCompletedFlowId: settings.msg91Config?.orderCompletedFlowId ?? '',
    feedbackRequestFlowId: settings.msg91Config?.feedbackRequestFlowId ?? '',
    feedbackBaseUrl: settings.msg91Config?.feedbackBaseUrl ?? (typeof window !== 'undefined' ? window.location.origin : ''),
  }));

  const [showAuthKey, setShowAuthKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Test SMS state
  const [testPhone, setTestPhone] = useState('9876543210');
  const [testEventType, setTestEventType] = useState<'order_created' | 'order_rescheduled' | 'order_completed' | 'feedback_request' | 'test'>('test');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; smsText?: string; simulated?: boolean } | null>(null);

  const handleSave = () => {
    setIsSaving(true);
    const updatedSettings: Settings = {
      ...settings,
      msg91Config: config,
    };
    onSaveSettings(updatedSettings);
    setIsSaving(false);
    toast.success('MSG91 Gateway Settings saved successfully!');
  };

  const handleRunTestSms = async () => {
    if (!testPhone.trim()) {
      toast.error('Please enter a test mobile number');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await sendMsg91Sms({
      eventType: testEventType,
      customerPhone: testPhone,
      customerName: 'Test Customer',
      carNumber: 'MH12AB1234',
      carBrandModel: 'Honda City',
      scheduledDate: new Date().toLocaleDateString('en-IN'),
      scheduledTime: '11:00 AM',
      grandTotal: 1499,
      feedbackUrl: `${config.feedbackBaseUrl || window.location.origin}?feedbackOrder=TEST1234`,
      serviceName: 'Full Synthetic Oil Change & Car Wash',
      msg91Config: config,
    });

    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      if (res.simulated) {
        toast.info('Test SMS Simulated! (MSG91 Auth Key not set or fallback used)', {
          description: res.message
        });
      } else {
        toast.success(`Test SMS dispatched via MSG91 to ${testPhone}!`);
      }
    } else {
      toast.error('Test SMS Failed', {
        description: res.message
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 border border-indigo-800/40 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-amber-500/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <MessageSquare className="w-8 h-8 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-white tracking-tight">MSG91 SMS Gateway Integration</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  DLT / Flow API Ready
                </span>
              </div>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl">
                Connect your msg91.com subscription to automatically send instant SMS updates for order bookings, rescheduled appointments, service completions, and feedback links.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
            <span className="text-sm font-bold text-slate-200">
              {config.enabled ? 'SMS Active' : 'SMS Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Configuration Form Card */}
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-500" />
              MSG91 Account Credentials & DLT Headers
            </h3>
            <p className="text-xs text-slate-500">Obtain your authkey and approved DLT sender ID from control.msg91.com</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* MSG91 Auth Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              MSG91 Auth Key
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showAuthKey ? "text" : "password"}
                value={config.authKey}
                onChange={(e) => setConfig(prev => ({ ...prev, authKey: e.target.value }))}
                placeholder="e.g. 382910As8d7f6g..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 font-mono pr-10"
              />
              <button
                type="button"
                onClick={() => setShowAuthKey(!showAuthKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showAuthKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Found under MSG91 Dashboard &gt; User Profile &gt; Authkey</p>
          </div>

          {/* DLT Sender ID */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              Sender ID / DLT Header ID
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={config.senderId}
              onChange={(e) => setConfig(prev => ({ ...prev, senderId: e.target.value.toUpperCase().slice(0, 6) }))}
              placeholder="e.g. ABGENG"
              maxLength={6}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 font-mono uppercase tracking-wider"
            />
            <p className="text-[11px] text-slate-500">Your approved 6-character sender ID on DLT portal (e.g. ABGENG)</p>
          </div>
        </div>

        {/* Flow IDs Section */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              MSG91 Flow / Template IDs (DLT Approved)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide your MSG91 Flow IDs created in control.msg91.com under <strong>SMS &gt; Flow</strong>. If left blank, the app will fall back to direct transactional SMS mode.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Order Created Flow ID */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                1. Order Created / Booked Flow ID
              </label>
              <input
                type="text"
                value={config.orderCreatedFlowId || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, orderCreatedFlowId: e.target.value }))}
                placeholder="e.g. 6423a9b1c8d7f..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
              <p className="text-[10px] text-slate-500">Variables sent: <code className="text-indigo-600 dark:text-indigo-400">##name##</code>, <code className="text-indigo-600 dark:text-indigo-400">##car_number##</code>, <code className="text-indigo-600 dark:text-indigo-400">##scheduled_date##</code>, <code className="text-indigo-600 dark:text-indigo-400">##scheduled_time##</code></p>
            </div>

            {/* Order Rescheduled Flow ID */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                2. Order Rescheduled Flow ID
              </label>
              <input
                type="text"
                value={config.orderRescheduledFlowId || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, orderRescheduledFlowId: e.target.value }))}
                placeholder="e.g. 6423a9b1c8d7e..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
              <p className="text-[10px] text-slate-500">Variables sent: <code className="text-indigo-600 dark:text-indigo-400">##name##</code>, <code className="text-indigo-600 dark:text-indigo-400">##car_number##</code>, <code className="text-indigo-600 dark:text-indigo-400">##scheduled_date##</code>, <code className="text-indigo-600 dark:text-indigo-400">##scheduled_time##</code></p>
            </div>

            {/* Order Completed Flow ID */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                3. Service Completed Flow ID
              </label>
              <input
                type="text"
                value={config.orderCompletedFlowId || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, orderCompletedFlowId: e.target.value }))}
                placeholder="e.g. 6423a9b1c8d7d..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
              <p className="text-[10px] text-slate-500">Variables sent: <code className="text-indigo-600 dark:text-indigo-400">##name##</code>, <code className="text-indigo-600 dark:text-indigo-400">##car_number##</code>, <code className="text-indigo-600 dark:text-indigo-400">##grand_total##</code></p>
            </div>

            {/* Feedback Request Flow ID */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                4. Feedback Collection SMS Flow ID
              </label>
              <input
                type="text"
                value={config.feedbackRequestFlowId || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, feedbackRequestFlowId: e.target.value }))}
                placeholder="e.g. 6423a9b1c8d7c..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
              />
              <p className="text-[10px] text-slate-500">Variables sent: <code className="text-indigo-600 dark:text-indigo-400">##name##</code>, <code className="text-indigo-600 dark:text-indigo-400">##feedback_url##</code></p>
            </div>
          </div>

          {/* Feedback Base URL */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              Feedback Form Base URL
            </label>
            <input
              type="text"
              value={config.feedbackBaseUrl || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, feedbackBaseUrl: e.target.value }))}
              placeholder="e.g. https://abigengine.com"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
            />
            <p className="text-[11px] text-slate-500">The customer will receive feedback link like: <code className="text-indigo-600">{config.feedbackBaseUrl || 'https://your-app-domain.com'}?feedbackOrder=SUB123</code></p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Save MSG91 Configuration
          </Button>
        </div>
      </Card>

      {/* Test SMS Panel Card */}
      <Card className="p-6 bg-slate-900 border border-slate-800 text-white space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-extrabold text-white">Interactive SMS Connection Tester</h3>
          </div>
          <span className="text-xs text-slate-400">Simulate or send real SMS to verify MSG91 setup</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Test Mobile Number</label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">SMS Event Template</label>
            <select
              value={testEventType}
              onChange={(e) => setTestEventType(e.target.value as any)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
            >
              <option value="test">Test Ping SMS</option>
              <option value="order_created">Order Created SMS</option>
              <option value="order_rescheduled">Order Rescheduled SMS</option>
              <option value="order_completed">Service Completed SMS</option>
              <option value="feedback_request">Feedback Collection SMS</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={handleRunTestSms}
              disabled={isTesting}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs rounded-lg shadow-md flex items-center justify-center gap-2"
            >
              <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
              {isTesting ? 'Dispatching Test...' : 'Send Test SMS'}
            </Button>
          </div>
        </div>

        {/* Test Output Box */}
        {testResult && (
          <div className={`p-4 rounded-xl border text-xs space-y-2 mt-2 ${
            testResult.success 
              ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200' 
              : 'bg-rose-950/40 border-rose-700/50 text-rose-200'
          }`}>
            <div className="flex items-center justify-between font-bold">
              <span>Status: {testResult.success ? '✅ Dispatch Success' : '❌ Failed'}</span>
              <span className="text-[10px] uppercase opacity-75">{testResult.simulated ? 'Simulated' : 'Real MSG91 Response'}</span>
            </div>
            <p className="font-mono text-[11px] leading-relaxed">{testResult.message}</p>
            {testResult.smsText && (
              <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 text-[11px] font-mono">
                <span className="text-slate-500 block mb-1 font-semibold text-[10px]">SMS Content Preview:</span>
                "{testResult.smsText}"
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Msg91SettingsTab;
