import React, { useState } from 'react';
import { Settings, EmailReportConfig, AppData, User } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Mail, Plus, Trash2, Send, CheckCircle, AlertTriangle, Eye, Sliders, Calendar, DollarSign, ShieldAlert, FileText } from 'lucide-react';
import { triggerHapticFeedback } from '../../services/hapticService';
import { triggerEmailReport } from '../../services/notificationService';

interface EmailReportsTabProps {
  currentUser: User;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
  appData: AppData;
}

const DEFAULT_REPORT_CONFIG: EmailReportConfig = {
  enabled: false,
  recipients: [],
  reportTypes: {
    dailyAppointments: true,
    upcomingAppointments: true,
    revenueSummary: true,
    overdueAlerts: true,
  },
  scheduleHour: 18, // 6 PM
};

export const EmailReportsTab: React.FC<EmailReportsTabProps> = ({
  currentUser,
  settings,
  onSaveSettings,
  appData,
}) => {
  const [config, setConfig] = useState<EmailReportConfig>(
    settings.emailReportConfig || { ...DEFAULT_REPORT_CONFIG, recipients: ['admin@abigengine.com'] }
  );
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Reporting status states
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; simulated?: boolean; message: string; previewHtml?: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Validate email helper
  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleAddRecipient = () => {
    triggerHapticFeedback('light');
    const trimmed = newEmail.trim();
    if (!trimmed) return;

    if (!validateEmail(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }

    if (config.recipients.includes(trimmed)) {
      setEmailError('This email is already in the recipient list.');
      return;
    }

    setEmailError('');
    setConfig(prev => ({
      ...prev,
      recipients: [...prev.recipients, trimmed]
    }));
    setNewEmail('');
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    triggerHapticFeedback('light');
    setConfig(prev => ({
      ...prev,
      recipients: prev.recipients.filter(email => email !== emailToRemove)
    }));
  };

  const handleToggleReportType = (key: keyof EmailReportConfig['reportTypes']) => {
    triggerHapticFeedback('light');
    setConfig(prev => ({
      ...prev,
      reportTypes: {
        ...prev.reportTypes,
        [key]: !prev.reportTypes[key]
      }
    }));
  };

  const handleSaveConfig = async () => {
    triggerHapticFeedback('success');
    setIsSaving(true);
    setSaveMessage('');

    try {
      const updatedSettings: Settings = {
        ...settings,
        emailReportConfig: config,
      };

      await onSaveSettings(updatedSettings);
      setSaveMessage('Reporting configurations saved persistently in database!');
      setTimeout(() => setSaveMessage(''), 4000);
    } catch (err) {
      console.error('Failed to save report settings:', err);
      setSaveMessage('Error saving configurations.');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger Report Instantly
  const handleTriggerReportNow = async () => {
    triggerHapticFeedback('success');
    if (config.recipients.length === 0) {
      setEmailError('Please specify at least one recipient email address first.');
      return;
    }

    setIsSending(true);
    setSendResult(null);

    try {
      const result = await triggerEmailReport(config.recipients, config, appData);

      setSendResult({
        success: true,
        simulated: result.simulated,
        message: result.message,
        previewHtml: result.previewHtml,
      });
      if (result.previewHtml) {
        setShowPreview(true);
      }
    } catch (err: any) {
      console.error('Error dispatching manual report:', err);
      setSendResult({
        success: false,
        message: err.message || 'Failed to send report. Please verify connection and try again.'
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Mail className="w-6 h-6 text-brand-blue" />
          Email Reports & Status Reminders
        </h2>
        <p className="text-slate-500 text-sm">
          Setup daily summaries, upcoming schedules, or financial recap reports delivered straight to chosen internal email accounts.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Config Panels */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Toggle Switch */}
          <Card className="p-5 border-l-4 border-l-brand-blue">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Automated Reporting System</h3>
                <p className="text-slate-500 text-sm">Enable or disable the background report scheduler and reminders.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => {
                    triggerHapticFeedback('light');
                    setConfig(prev => ({ ...prev, enabled: e.target.checked }));
                  }}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-slate-200 peer-focus-visible:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-brand-blue"></div>
              </label>
            </div>
          </Card>

          {/* Config Controls */}
          {config.enabled && (
            <Card title="Report Layout & Content Selection" className="p-5">
              <p className="text-slate-500 text-sm mb-5">
                Customize which specific modules and data lists are generated inside your summary report email:
              </p>

              <div className="space-y-4">
                {/* 1. Daily Appointments */}
                <div 
                  onClick={() => handleToggleReportType('dailyAppointments')}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    config.reportTypes.dailyAppointments 
                      ? 'border-brand-blue/30 bg-blue-50/20' 
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-md ${config.reportTypes.dailyAppointments ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-400'}`}>
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Daily Appointments & Active Orders</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${config.reportTypes.dailyAppointments ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {config.reportTypes.dailyAppointments ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Tabular report of all service orders and raw customer leads scheduled for the current day.
                    </p>
                  </div>
                </div>

                {/* 2. Upcoming Appointments */}
                <div 
                  onClick={() => handleToggleReportType('upcomingAppointments')}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    config.reportTypes.upcomingAppointments 
                      ? 'border-brand-blue/30 bg-blue-50/20' 
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-md ${config.reportTypes.upcomingAppointments ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-400'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Upcoming Schedule Outlook (7-Day Forecast)</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${config.reportTypes.upcomingAppointments ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {config.reportTypes.upcomingAppointments ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Forward-looking calendar list of all orders/leads booked for the upcoming week to aid logistical planning.
                    </p>
                  </div>
                </div>

                {/* 3. Revenue Summary */}
                <div 
                  onClick={() => handleToggleReportType('revenueSummary')}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    config.reportTypes.revenueSummary 
                      ? 'border-brand-blue/30 bg-blue-50/20' 
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-md ${config.reportTypes.revenueSummary ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-400'}`}>
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Daily Financial Recap & Revenue Matrix</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${config.reportTypes.revenueSummary ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {config.reportTypes.revenueSummary ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Summarized metrics showing completed earnings, pending receipts, and total transaction volume for today.
                    </p>
                  </div>
                </div>

                {/* 4. Overdue Alerts */}
                <div 
                  onClick={() => handleToggleReportType('overdueAlerts')}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    config.reportTypes.overdueAlerts 
                      ? 'border-brand-blue/30 bg-blue-50/20' 
                      : 'border-slate-100 hover:border-slate-200 bg-white'
                  }`}
                >
                  <div className={`p-2 rounded-md ${config.reportTypes.overdueAlerts ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-400'}`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">Overdue / Stalled Job Alerts</span>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${config.reportTypes.overdueAlerts ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {config.reportTypes.overdueAlerts ? 'Included' : 'Excluded'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Urgent high-priority alert block listing service orders active for longer than 24 hours without completion.
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery Hour Setting */}
              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div>
                  <span className="block font-semibold text-slate-800 text-sm">Delivery Schedule</span>
                  <span className="text-xs text-slate-500">Choose the daily hour (in 24h format) for sending automated recaps.</span>
                </div>
                <div>
                  <select
                    value={config.scheduleHour ?? 18}
                    onChange={(e) => {
                      triggerHapticFeedback('light');
                      setConfig(prev => ({ ...prev, scheduleHour: parseInt(e.target.value, 10) }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/20 text-sm font-medium text-slate-700"
                  >
                    {Array.from({ length: 24 }).map((_, i) => {
                      const ampm = i >= 12 ? 'PM' : 'AM';
                      const displayHour = i % 12 === 0 ? 12 : i % 12;
                      return (
                        <option key={i} value={i}>
                          {displayHour}:00 {ampm} ({i.toString().padStart(2, '0')}:00)
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </Card>
          )}

          {/* Action Trigger Area */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4">
            {saveMessage && (
              <span className="text-sm font-semibold text-green-600 flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle className="w-4 h-4" /> {saveMessage}
              </span>
            )}
            <div className="flex gap-3 w-full sm:w-auto ml-auto">
              <Button
                variant="ghost"
                onClick={handleTriggerReportNow}
                disabled={isSending || config.recipients.length === 0}
                className="flex items-center gap-2 justify-center border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 bg-white"
              >
                <Send className="w-4 h-4" />
                {isSending ? 'Sending Recaps...' : 'Send Now & Test'}
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={isSaving}
                className="flex-1 sm:flex-none font-bold shadow-md shadow-brand-blue/10 bg-brand-blue hover:bg-brand-blue/90"
              >
                {isSaving ? 'Saving Configurations...' : 'Save Config'}
              </Button>
            </div>
          </div>

        </div>

        {/* Right 1 Column: Recipient Management */}
        <div className="space-y-6">
          <Card title="Chosen Recipient Accounts" className="p-5">
            <p className="text-slate-500 text-xs mb-4">
              Specify the team members or administration email addresses to receive these alerts.
            </p>

            {/* Recipients List */}
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto mb-4 pr-1">
              {config.recipients.length === 0 ? (
                <div className="text-center text-slate-400 py-6 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-xs italic">
                  No email addresses configured. Please add below.
                </div>
              ) : (
                config.recipients.map((email, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg group hover:border-slate-200 hover:bg-white transition-all"
                  >
                    <span className="text-sm text-slate-600 truncate font-medium">{email}</span>
                    <button
                      onClick={() => handleRemoveRecipient(email)}
                      className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                      title="Remove recipient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Recipient Input */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="manager@example.com"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddRecipient();
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
                <Button
                  onClick={handleAddRecipient}
                  className="p-2.5 bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90"
                  style={{ padding: '10px' }}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {emailError && <p className="text-xs text-red-500 font-semibold">{emailError}</p>}
            </div>
          </Card>

          {/* Send status response info */}
          {sendResult && (
            <Card className="p-4 bg-slate-50 border border-slate-200">
              <div className="flex items-start gap-2.5">
                {sendResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className={`text-sm font-bold ${sendResult.success ? 'text-green-800' : 'text-red-800'}`}>
                    {sendResult.success ? 'Report Dispatched!' : 'Dispatch Failed'}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">{sendResult.message}</p>
                  
                  {sendResult.simulated && (
                    <div className="mt-2.5 p-2 bg-yellow-50 border border-yellow-100 rounded text-xs text-yellow-800 leading-relaxed font-medium">
                      ⚠️ SendGrid API key is not configured yet in settings. The email was simulated, and the full HTML report is loaded for your preview below!
                    </div>
                  )}

                  {sendResult.previewHtml && (
                    <button
                      onClick={() => setShowPreview(!showPreview)}
                      className="mt-3 flex items-center gap-1.5 text-xs text-brand-blue font-bold hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {showPreview ? 'Hide Live Preview' : 'Show Live Preview'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* HTML Live Preview Box */}
      {showPreview && sendResult?.previewHtml && (
        <Card className="mt-6 p-4 bg-slate-900 border border-slate-800" title="Sent Report - Live HTML Email Preview">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-slate-400 font-medium">This is exactly what the recipients will see in their email client:</span>
            <button 
              onClick={() => setShowPreview(false)}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Close Preview
            </button>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-inner">
            <iframe
              srcDoc={sendResult.previewHtml}
              title="Email Report Preview"
              className="w-full min-h-[500px] border-none"
            />
          </div>
        </Card>
      )}
    </div>
  );
};

export default EmailReportsTab;
