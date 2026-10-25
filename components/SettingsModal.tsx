import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import Input from './ui/Input';
import Button from './ui/Button';
import { Settings } from '../types';
import { IconLoader } from './ui/Icon';
import { testCloudDataConnection, testMediaUploadConnection } from '../services/cloudDataService';
import { neonDataService } from '../services/neonDataService';
import { ShieldCheck, Database, RefreshCw, Sparkles, AlertCircle, CheckCircle, UploadCloud, DownloadCloud } from 'lucide-react';

interface SettingsModalProps {
  initialSettings: Settings;
  onClose: () => void;
  onSave: (newSettings: Settings) => void;
}

type TestResult = { message: string, details?: string, success: boolean };

export const SettingsModal: React.FC<SettingsModalProps> = ({ initialSettings, onClose, onSave }) => {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Disaster Recovery state
  const [drEnabled, setDrEnabled] = useState<boolean>(
    initialSettings.googleSheetsDisasterRecoveryEnabled ?? false
  );
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [drActionResult, setDrActionResult] = useState<TestResult | null>(null);

  // Lead Delta Sync state
  const [isSyncingLeads, setIsSyncingLeads] = useState(false);
  const [leadSyncResult, setLeadSyncResult] = useState<TestResult | null>(null);

  const [isTestingData, setIsTestingData] = useState(false);
  const [dataTestResult, setDataTestResult] = useState<TestResult | null>(null);

  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<TestResult | null>(null);

  const [isTestingNetlify, setIsTestingNetlify] = useState(false);
  const [netlifyTestResult, setNetlifyTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
    setDrEnabled(initialSettings.googleSheetsDisasterRecoveryEnabled ?? false);
  }, [initialSettings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  const handleSave = () => {
    const updated: Settings = {
      ...settings,
      googleSheetsDisasterRecoveryEnabled: drEnabled
    };
    onSave(updated);
    setSaveMessage('Settings saved! Disaster recovery and lead delta sync preferences updated.');
    setTimeout(() => {
      setSaveMessage('');
      onClose();
    }, 1800);
  };

  const handleRunDisasterRecoveryBackup = async () => {
    setIsBackingUp(true);
    setDrActionResult(null);
    try {
      const res = await neonDataService.triggerDisasterRecoveryBackup(settings.googleSheetsUrl);
      if (res.status === 'success') {
        setDrActionResult({
          success: true,
          message: res.message || 'Disaster Recovery Backup snapshot created successfully in Google Sheets.',
          details: res.backupSummary ? `Orders: ${res.backupSummary.ordersCount}, Leads: ${res.backupSummary.leadsCount}, Users: ${res.backupSummary.usersCount}` : undefined
        });
      } else {
        setDrActionResult({
          success: false,
          message: res.error || 'Failed to complete disaster recovery backup.',
          details: 'Check that Google Apps Script endpoint permissions are accessible.'
        });
      }
    } catch (err: any) {
      setDrActionResult({
        success: false,
        message: err.message || 'Backup failed'
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRunDisasterRecoveryRestore = async () => {
    if (!window.confirm('Are you sure you want to restore from Google Sheets Disaster Recovery Backup? This will pull and reconcile records from your backup sheets into Neon PostgreSQL.')) {
      return;
    }
    setIsRestoring(true);
    setDrActionResult(null);
    try {
      const res = await neonDataService.triggerDisasterRecoveryRestore(settings.googleSheetsUrl);
      if (res.status === 'success') {
        setDrActionResult({
          success: true,
          message: 'Disaster recovery restore completed. Neon database synchronized with Google Sheets backup.'
        });
      } else {
        setDrActionResult({
          success: false,
          message: res.error || 'Restore run encountered an error.'
        });
      }
    } catch (err: any) {
      setDrActionResult({
        success: false,
        message: err.message || 'Restore failed'
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleTriggerLeadsDeltaSync = async () => {
    setIsSyncingLeads(true);
    setLeadSyncResult(null);
    try {
      const res = await neonDataService.triggerLeadsDeltaSync(
        settings.metaLeadsSheetUrl,
        settings.whatsappSheetUrl || settings.whatsAppLeadsSheetUrl
      );
      if (res.status === 'success') {
        const totalNew = (res.newMetaCount || 0) + (res.newWaCount || 0);
        setLeadSyncResult({
          success: true,
          message: `Delta sync successful! Imported ${res.newMetaCount || 0} new Meta leads and ${res.newWaCount || 0} new WhatsApp enquiries into Neon DB.`,
          details: `Total leads currently active in Neon DB: ${res.totalLeads ?? 'N/A'}`
        });
      } else {
        setLeadSyncResult({
          success: false,
          message: res.error || 'Failed to delta-sync leads from Google Sheets.',
          details: 'Ensure Meta Leads and WhatsApp Google Sheets are set to "Anyone with the link can view".'
        });
      }
    } catch (err: any) {
      setLeadSyncResult({
        success: false,
        message: err.message || 'Lead sync failed'
      });
    } finally {
      setIsSyncingLeads(false);
    }
  };

  const handleTestDataConnection = async () => {
    setIsTestingData(true);
    setDataTestResult(null);
    const result = await testCloudDataConnection(settings.googleSheetsUrl);
    setDataTestResult(result);
    setIsTestingData(false);
  };

  const handleTestDriveConnection = async () => {
    setIsTestingDrive(true);
    setDriveTestResult(null);
    const result = await testMediaUploadConnection(settings.googleDriveUploadUrl);
    setDriveTestResult(result);
    setIsTestingDrive(false);
  };

  const handleTestNetlifyFunction = async () => {
    setIsTestingNetlify(true);
    setNetlifyTestResult(null);
    try {
      const response = await fetch('/.netlify/functions/hello');
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Function returned status ${response.status}. Body: ${errorBody}`);
      }
      const data = await response.json();
      setNetlifyTestResult({ 
        message: data.message || 'Function returned a success status.', 
        details: data.details || '',
        success: true 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setNetlifyTestResult({ message: `Failed to connect to backend function.`, details: errorMessage, success: false });
    } finally {
      setIsTestingNetlify(false);
    }
  };

  const TestResultDisplay: React.FC<{ result: TestResult | null }> = ({ result }) => {
    if (!result) return null;
    return (
      <div className={`mt-2 p-3 rounded-lg text-sm ${result.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'}`}>
        <div className="flex items-center gap-1.5 font-bold">
          {result.success ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          {result.success ? 'Success' : 'Notice'}
        </div>
        <p className="mt-1 text-xs">{result.message}</p>
        {result.details && <p className="mt-1 text-xs opacity-80 font-mono">{result.details}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start sm:items-center justify-center z-50 p-4 pt-8 sm:pt-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl modal-content">
        <Card title="System Settings & Database Architecture" className="flex flex-col max-h-[92vh]">
          <div className="overflow-y-auto p-6 space-y-6">
            
            {/* 1. Neon Primary SSOT Banner */}
            <div className="p-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-950 text-sm">Primary Database Engine: Neon PostgreSQL</span>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  SSOT Active
                </span>
              </div>
              <p className="text-xs text-blue-800/90 mt-1.5 leading-relaxed">
                All daily production workflows, orders, and customer operations execute directly on the high-speed Neon database.
              </p>
            </div>

            {/* 2. Google Sheets Disaster Recovery & Backup */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">Google Sheets Disaster Recovery & Backup</h4>
                    <p className="text-xs text-slate-500">Google Apps Script endpoints retained solely for disaster recovery.</p>
                  </div>
                </div>
                
                {/* Toggle */}
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${drEnabled ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'}`}>
                    {drEnabled ? 'Enabled' : 'Deactivated (Default)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDrEnabled(!drEnabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${drEnabled ? 'bg-amber-600' : 'bg-slate-300'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${drEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-slate-200">
                <strong>Note:</strong> By default, Google Sheets database synchronization is deactivated so normal operations run with zero latency on Neon. Enable this option only when you wish to execute a disaster recovery backup run or restore data.
              </p>

              <div>
                <div className="flex items-start space-x-2">
                  <Input
                    label="Disaster Recovery / Backup App URL (Google Script)"
                    id="googleSheetsUrl"
                    value={settings.googleSheetsUrl}
                    onChange={handleChange}
                    className="flex-grow bg-white text-xs font-mono"
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                  <div className="pt-7">
                    <Button variant="secondary" onClick={handleTestDataConnection} disabled={isTestingData} className="text-xs">
                      {isTestingData ? <IconLoader className="w-4 h-4 animate-spin" /> : 'Test'}
                    </Button>
                  </div>
                </div>
                <TestResultDisplay result={dataTestResult} />
              </div>

              {/* Action Buttons for DR */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={handleRunDisasterRecoveryBackup}
                  disabled={isBackingUp || !drEnabled}
                  className="text-xs flex items-center gap-1.5 bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 disabled:opacity-50"
                >
                  {isBackingUp ? <IconLoader className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 text-amber-600" />}
                  Run Disaster Recovery Backup Now
                </Button>

                <Button
                  variant="secondary"
                  onClick={handleRunDisasterRecoveryRestore}
                  disabled={isRestoring || !drEnabled}
                  className="text-xs flex items-center gap-1.5 text-slate-700 border-slate-300 hover:bg-slate-100 disabled:opacity-50"
                >
                  {isRestoring ? <IconLoader className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4 text-slate-600" />}
                  Restore from Google Sheets Backup
                </Button>
              </div>
              <TestResultDisplay result={drActionResult} />
            </div>

            {/* 3. Lead Delta Sync: Meta Leads & WhatsApp Enquiry */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">Lead Data Delta Sync (Meta & WhatsApp)</h4>
                    <p className="text-xs text-slate-500">Manual-only sync engine linking Google Sheets with Neon DB.</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
                  Manual Trigger Only (Bandwidth Protected)
                </span>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Automatic background sync is restricted and turned off by default to protect bandwidth limits. Whenever new inbound leads appear in your <strong>Meta Leads</strong> or <strong>WhatsApp Enquiry</strong> Google Sheets, you can sync them into Neon DB on-demand using the button below.
              </p>

              <div className="space-y-3 pt-1">
                <Input
                  label="Meta Leads Google Sheet URL"
                  id="metaLeadsSheetUrl"
                  value={settings.metaLeadsSheetUrl || ''}
                  onChange={handleChange}
                  placeholder="https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing"
                  className="bg-white text-xs font-mono"
                />

                <Input
                  label="WhatsApp Enquiry Google Sheet URL"
                  id="whatsappSheetUrl"
                  value={settings.whatsappSheetUrl || ''}
                  onChange={handleChange}
                  placeholder="https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing"
                  className="bg-white text-xs font-mono"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  onClick={handleTriggerLeadsDeltaSync}
                  disabled={isSyncingLeads}
                  className="text-xs flex items-center gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  {isSyncingLeads ? <IconLoader className="w-4 h-4 animate-spin text-white" /> : <RefreshCw className="w-4 h-4 text-white" />}
                  Sync Leads into Neon DB (Manual Trigger)
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-mono">
                    Sync Mode:
                  </span>
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-300 rounded px-2 py-1">
                    Manual Only (Bandwidth Saver)
                  </span>
                </div>
              </div>
              <TestResultDisplay result={leadSyncResult} />
            </div>

            {/* 4. Google Drive Media Uploads */}
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-600 mb-2 font-medium">Google Drive Upload Endpoint (Inspection Photos & Videos)</p>
              <div className="flex items-start space-x-2">
                <Input
                  label="Google Drive Upload URL"
                  id="googleDriveUploadUrl"
                  value={settings.googleDriveUploadUrl}
                  onChange={handleChange}
                  className="flex-grow bg-white text-xs font-mono"
                  placeholder="https://script.google.com/macros/s/.../exec"
                />
                <div className="pt-7">
                  <Button variant="secondary" onClick={handleTestDriveConnection} disabled={isTestingDrive} className="text-xs">
                    {isTestingDrive ? <IconLoader className="w-4 h-4 animate-spin" /> : 'Test Drive'}
                  </Button>
                </div>
              </div>
              <TestResultDisplay result={driveTestResult} />
            </div>

            {/* 5. Custom Branding & Netlify */}
            <div className="pt-2 border-t border-slate-200 space-y-4">
              <Input
                label="Custom Brand Logo URL (Optional)"
                id="customLogoUrl"
                value={settings.customLogoUrl}
                onChange={handleChange}
                placeholder="https://example.com/logo.png"
                className="bg-white text-xs"
              />

              <div className="flex items-center justify-between pt-1">
                <div>
                  <h5 className="text-xs font-semibold text-slate-800">Serverless Backend Functions</h5>
                  <p className="text-[11px] text-slate-500">Validates proxy relay for serverless features.</p>
                </div>
                <Button variant="secondary" onClick={handleTestNetlifyFunction} disabled={isTestingNetlify} className="text-xs">
                  {isTestingNetlify ? <IconLoader className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Test Functions
                </Button>
              </div>
              <TestResultDisplay result={netlifyTestResult} />
            </div>

          </div>

          {saveMessage && <p className="px-6 py-2 text-xs text-emerald-600 font-semibold bg-emerald-50 border-t border-emerald-100">{saveMessage}</p>}
          
          <div className="mt-auto p-4 flex justify-end space-x-3 border-t border-slate-200 flex-shrink-0 bg-slate-50/50">
            <Button variant="ghost" onClick={onClose} className="text-xs">Cancel</Button>
            <Button onClick={handleSave} className="text-xs bg-indigo-600 text-white hover:bg-indigo-700">Save Configuration</Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
