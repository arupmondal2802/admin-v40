
import React, { useState, useEffect } from 'react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Settings } from '../../types';
import { IconLoader } from '../ui/Icon';
import { testCloudDataConnection, testMediaUploadConnection } from '../../services/cloudDataService';
import { getBackendBaseUrl, isDeadBackendUrl } from '../../services/backendConfig';
import { neonDataService } from '../../services/neonDataService';
import { ShieldCheck, Database, RefreshCw, Sparkles, UploadCloud, DownloadCloud, Monitor, HardDrive } from 'lucide-react';
import { DesktopInstallModal } from '../desktop/DesktopInstallModal';

interface SettingsModalContentProps {
  initialSettings: Settings;
  onSave: (newSettings: Settings) => void;
}

export const SettingsModalContent: React.FC<SettingsModalContentProps> = ({ initialSettings, onSave }) => {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [drEnabled, setDrEnabled] = useState<boolean>(initialSettings.googleSheetsDisasterRecoveryEnabled ?? false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [drActionMessage, setDrActionMessage] = useState<string | null>(null);

  const [isSyncingLeads, setIsSyncingLeads] = useState(false);
  const [leadsSyncMessage, setLeadsSyncMessage] = useState<string | null>(null);
  const [isDesktopModalOpen, setIsDesktopModalOpen] = useState(false);

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(initialSettings.googleMapsApiKey || '');
  const [hubLatitude, setHubLatitude] = useState(String(initialSettings.hubLatitude ?? '22.572646'));
  const [hubLongitude, setHubLongitude] = useState(String(initialSettings.hubLongitude ?? '88.363895'));
  const [maxDistanceKm, setMaxDistanceKm] = useState(String(initialSettings.maxDistanceKm ?? '20'));
  
  const [thresholdBronze, setThresholdBronze] = useState(String(initialSettings.agentRankThresholds?.bronze ?? '0'));
  const [thresholdSilver, setThresholdSilver] = useState(String(initialSettings.agentRankThresholds?.silver ?? '5000'));
  const [thresholdGold, setThresholdGold] = useState(String(initialSettings.agentRankThresholds?.gold ?? '15000'));
  const [thresholdPlatinum, setThresholdPlatinum] = useState(String(initialSettings.agentRankThresholds?.platinum ?? '40000'));
  
  const [saveMessage, setSaveMessage] = useState('');
  const [backendServerUrl, setBackendServerUrl] = useState(() => {
    const current = getBackendBaseUrl();
    return isDeadBackendUrl(current) ? '' : current;
  });
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [backendTestResult, setBackendTestResult] = useState<{message: string, success: boolean} | null>(null);

  const [isTestingData, setIsTestingData] = useState(false);
  const [dataTestResult, setDataTestResult] = useState<{message: string, success: boolean} | null>(null);

  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<{message: string, success: boolean} | null>(null);

  useEffect(() => {
    setSettings(initialSettings);
    setDrEnabled(initialSettings.googleSheetsDisasterRecoveryEnabled ?? false);
    setGoogleMapsApiKey(initialSettings.googleMapsApiKey || '');
    setHubLatitude(String(initialSettings.hubLatitude ?? '22.572646'));
    setHubLongitude(String(initialSettings.hubLongitude ?? '88.363895'));
    setMaxDistanceKm(String(initialSettings.maxDistanceKm ?? '20'));
    setThresholdBronze(String(initialSettings.agentRankThresholds?.bronze ?? '0'));
    setThresholdSilver(String(initialSettings.agentRankThresholds?.silver ?? '5000'));
    setThresholdGold(String(initialSettings.agentRankThresholds?.gold ?? '15000'));
    setThresholdPlatinum(String(initialSettings.agentRankThresholds?.platinum ?? '40000'));
  }, [initialSettings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setSettings(prev => ({...prev, [e.target.id]: e.target.value}));
  };

  const handleSave = () => {
    if (typeof window !== 'undefined') {
      const cleanUrl = backendServerUrl.trim().replace(/\/+$/, '');
      if (cleanUrl && !isDeadBackendUrl(cleanUrl)) {
        localStorage.setItem('custom_backend_url', cleanUrl);
        localStorage.setItem('neon_backend_url', cleanUrl);
      } else {
        localStorage.removeItem('custom_backend_url');
        localStorage.removeItem('neon_backend_url');
      }
    }
    onSave({
      ...settings,
      googleSheetsDisasterRecoveryEnabled: drEnabled,
      googleMapsApiKey: googleMapsApiKey.trim(),
      hubLatitude: parseFloat(hubLatitude) || 22.572646,
      hubLongitude: parseFloat(hubLongitude) || 88.363895,
      maxDistanceKm: parseFloat(maxDistanceKm) || 20,
      agentRankThresholds: {
        bronze: parseFloat(thresholdBronze) || 0,
        silver: parseFloat(thresholdSilver) || 0,
        gold: parseFloat(thresholdGold) || 0,
        platinum: parseFloat(thresholdPlatinum) || 0
      }
    });
    setSaveMessage('Cloud, Disaster Recovery, Google Maps & Agent Rank configuration updated.');
    setTimeout(() => setSaveMessage(''), 3000);
  };

  const handleRunDisasterRecoveryBackup = async () => {
    setIsBackingUp(true);
    setDrActionMessage(null);
    try {
      const res = await neonDataService.triggerDisasterRecoveryBackup(settings.googleSheetsUrl);
      setDrActionMessage(res.message || 'Disaster recovery backup snapshot completed.');
    } catch (e: any) {
      setDrActionMessage(`Backup error: ${e.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRunDisasterRecoveryRestore = async () => {
    if (!window.confirm('Restore database from Google Sheets Disaster Recovery Backup? This will reconcile records from Google Sheets into Neon PostgreSQL.')) return;
    setIsRestoring(true);
    setDrActionMessage(null);
    try {
      const res = await neonDataService.triggerDisasterRecoveryRestore(settings.googleSheetsUrl);
      setDrActionMessage(res.message || 'Disaster recovery restore completed successfully.');
    } catch (e: any) {
      setDrActionMessage(`Restore error: ${e.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleTriggerLeadsDeltaSync = async () => {
    setIsSyncingLeads(true);
    setLeadsSyncMessage(null);
    try {
      const res = await neonDataService.triggerLeadsDeltaSync(
        settings.metaLeadsSheetUrl,
        settings.whatsappSheetUrl || settings.whatsAppLeadsSheetUrl
      );
      if (res.status === 'success') {
        setLeadsSyncMessage(`Synced ${res.newMetaCount || 0} new Meta leads and ${res.newWaCount || 0} new WhatsApp enquiries into Neon DB.`);
      } else {
        setLeadsSyncMessage(`Lead sync notice: ${res.error || 'Check sheet permissions'}`);
      }
    } catch (e: any) {
      setLeadsSyncMessage(`Sync error: ${e.message}`);
    } finally {
      setIsSyncingLeads(false);
    }
  };

  const handleResetBackend = () => {
    setBackendServerUrl('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('custom_backend_url');
      localStorage.removeItem('neon_backend_url');
    }
    setBackendTestResult({
      success: true,
      message: 'Reset to Same-Origin (/api) endpoints. Click Save to apply.'
    });
  };

  const handleTestBackend = async () => {
    setIsTestingBackend(true);
    setBackendTestResult(null);
    const startTime = performance.now();
    try {
      const cleanUrl = backendServerUrl.trim().replace(/\/+$/, '');
      if (isDeadBackendUrl(cleanUrl)) {
        setBackendTestResult({
          success: false,
          message: 'The specified URL is a decommissioned Railway domain (Application not found). Please clear or use a live URL.'
        });
        return;
      }
      const testUrl = cleanUrl ? `${cleanUrl}/api/health` : '/api/health';
      const response = await fetch(testUrl, { cache: 'no-store' });
      const elapsed = Math.round(performance.now() - startTime);
      if (response.ok) {
        const data = await response.json();
        setBackendTestResult({
          success: true,
          message: `Connected successfully (${elapsed}ms) - Service: ${data.service || 'Active'} | DB: ${data.databaseConfigured ? 'Connected' : 'Configured'}`
        });
      } else {
        setBackendTestResult({
          success: false,
          message: `Server returned HTTP ${response.status} (${elapsed}ms)`
        });
      }
    } catch (err: any) {
      setBackendTestResult({
        success: false,
        message: `Connection failed: ${err.message || 'Network error or CORS issue'}`
      });
    } finally {
      setIsTestingBackend(false);
    }
  };

  const handleTestData = async () => {
      setIsTestingData(true);
      setDataTestResult(null);
      const result = await testCloudDataConnection(settings.googleSheetsUrl);
      setDataTestResult(result);
      setIsTestingData(false);
  };

  const handleTestDrive = async () => {
      setIsTestingDrive(true);
      setDriveTestResult(null);
      const result = await testMediaUploadConnection(settings.googleDriveUploadUrl);
      setDriveTestResult(result);
      setIsTestingDrive(false);
  };

  return (
    <Card title="Cloud Configuration">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-slate-600 mb-4">Core backend URLs for API services, database synchronization, and Google Drive media uploads.</p>
          
          {/* Backend Endpoint Input */}
          <div className="mb-4 p-4 rounded-xl border border-indigo-100 bg-indigo-50/40">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  label="Node.js / Express Backend URL (APIs, Neon DB, SMS, Push)"
                  id="backendServerUrl"
                  value={backendServerUrl}
                  onChange={(e) => setBackendServerUrl(e.target.value)}
                  placeholder="Leave blank for same-origin (/api) or enter https://your-backend.railway.app"
                  className="bg-white font-mono text-xs"
                />
              </div>
              <div className="pt-7 flex items-center gap-2">
                <Button variant="secondary" onClick={handleTestBackend} disabled={isTestingBackend} className="whitespace-nowrap">
                  {isTestingBackend ? <IconLoader className="w-5 h-5 animate-spin" /> : 'Test Connection'}
                </Button>
                {backendServerUrl && (
                  <Button variant="secondary" onClick={handleResetBackend} className="whitespace-nowrap text-slate-600 border-slate-300">
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {backendTestResult && (
              <p className={`mt-2 text-xs font-semibold ${backendTestResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                Backend Status: {backendTestResult.message}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Leave blank to automatically route requests through same-origin (/api) on your hosting domain, avoiding CORS errors.
            </p>
          </div>

          {/* 1. Neon Primary SSOT Architecture */}
          <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-950 text-sm">Primary Database Engine: Neon PostgreSQL</span>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                SSOT Active
              </span>
            </div>
            <p className="mt-1.5 text-xs text-blue-800 leading-relaxed">
              All daily operational queries and transactions execute with sub-50ms latency directly on Neon PostgreSQL. Google Sheets endpoints are strictly kept for disaster recovery and backup.
            </p>
          </div>

          {/* 2. Google Sheets Disaster Recovery & Backup Section */}
          <div className="mb-4 p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                <div>
                  <h5 className="font-semibold text-slate-900 text-sm">Google Sheets Disaster Recovery & Backup Run</h5>
                  <p className="text-xs text-slate-500">Google Script endpoints solely used in terms of disaster recovery or backup run.</p>
                </div>
              </div>
              
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

            <p className="text-xs text-slate-600 bg-white/80 p-2.5 rounded-lg border border-amber-100">
              <strong>Deactivated by default:</strong> Prevents redundant API roundtrips during normal usage. Enable to run a disaster recovery backup snapshot to Google Sheets or restore state.
            </p>

            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  label="Disaster Recovery App URL (Google Apps Script)"
                  id="googleSheetsUrl"
                  value={settings.googleSheetsUrl}
                  onChange={handleChange}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="bg-white font-mono text-xs"
                />
              </div>
              <div className="pt-7">
                <Button variant="secondary" onClick={handleTestData} disabled={isTestingData} className="text-xs">
                  {isTestingData ? <IconLoader className="w-4 h-4 animate-spin" /> : 'Test DR'}
                </Button>
              </div>
            </div>
            {dataTestResult && (
              <p className={`text-xs font-semibold ${dataTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                Disaster Recovery: {dataTestResult.message}
              </p>
            )}

            <div className="pt-1 flex flex-wrap items-center gap-2">
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
            {drActionMessage && (
              <p className="text-xs text-amber-800 font-medium bg-amber-100/70 p-2 rounded border border-amber-200">
                {drActionMessage}
              </p>
            )}
          </div>

          {/* 3. Lead Delta Sync: Meta Leads & WhatsApp Enquiry */}
          <div className="mb-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-emerald-600" />
                <div>
                  <h5 className="font-semibold text-slate-900 text-sm">Lead Data Delta Sync (Meta Leads & WhatsApp Enquiry)</h5>
                  <p className="text-xs text-slate-500">Manual-only sync engine linking Google Sheets with Neon DB.</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                <Sparkles className="w-3 h-3 mr-1 text-amber-600" />
                Manual Trigger Only (Bandwidth Protected)
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Automatic background syncing is restricted and disabled by default to strictly protect your monthly Cloudflare bandwidth limits. Inbound Meta Leads and WhatsApp Enquiries are synced directly into Neon DB on-demand whenever you click below.
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
            {leadsSyncMessage && (
              <p className="text-xs text-emerald-800 font-medium bg-emerald-100/70 p-2 rounded border border-emerald-200">
                {leadsSyncMessage}
              </p>
            )}
          </div>

          {/* Drive Upload Endpoint Input */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  label="Google Drive Upload URL (Media Backend)"
                  id="googleDriveUploadUrl"
                  value={settings.googleDriveUploadUrl}
                  onChange={handleChange}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="bg-white"
                />
              </div>
              <div className="pt-7">
                <Button variant="secondary" onClick={handleTestDrive} disabled={isTestingDrive}>
                  {isTestingDrive ? <IconLoader className="w-5 h-5 animate-spin" /> : 'Test Drive'}
                </Button>
              </div>
            </div>
            {driveTestResult && (
              <p className={`mt-2 text-xs font-semibold ${driveTestResult.success ? 'text-green-600' : 'text-red-600'}`}>
                Drive Upload: {driveTestResult.message}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Dedicated endpoint for uploading inspection photos, video proofs, and attachments directly to Google Drive.
            </p>
          </div>

          <Input
            label="Custom Logo URL"
            id="customLogoUrl"
            value={settings.customLogoUrl}
            onChange={handleChange}
            placeholder="https://example.com/logo.png"
          />
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 mb-3">Data Synchronization</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="syncFrequency" className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Sync Frequency
              </label>
              <select
                id="syncFrequency"
                value={settings.syncFrequency || 'manual'}
                onChange={(e) => setSettings(prev => ({ ...prev, syncFrequency: e.target.value as any }))}
                className="w-full px-3 py-2 border border-slate-300 bg-white rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-accent transition-all"
              >
                <option value="manual">Manual Synchronization Only</option>
                <option value="5">Every 5 Minutes</option>
                <option value="15">Every 15 Minutes</option>
                <option value="30">Every 30 Minutes</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Choose whether to sync cloud data manually or automatically at regular intervals (5, 15, or 30 minutes).
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 mb-3">Google Maps doorstep service coverage</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Google Maps Web API Key"
              id="googleMapsApiKey"
              value={googleMapsApiKey}
              onChange={(e) => setGoogleMapsApiKey(e.target.value)}
              placeholder="Enter Google Maps API Key"
            />
            <Input
              label="Coverage Radius (KM)"
              id="maxDistanceKm"
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(e.target.value)}
              placeholder="20"
              type="number"
            />
            <Input
              label="Service Hub Latitude (Kolkata)"
              id="hubLatitude"
              value={hubLatitude}
              onChange={(e) => setHubLatitude(e.target.value)}
              placeholder="22.572646"
            />
            <Input
              label="Service Hub Longitude (Kolkata)"
              id="hubLongitude"
              value={hubLongitude}
              onChange={(e) => setHubLongitude(e.target.value)}
              placeholder="88.363895"
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Ensure you use a valid Google Maps API key. Unpinned address lookup will fallback to open-source Nominatim when the key is not set.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-indigo-600" />
                Desktop PWA App & Persistent Offline Storage
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Install as a standalone Windows 10/11 or macOS desktop application with native windowing and zero-reload local disk caching.
              </p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
              <HardDrive className="w-3 h-3 mr-1 text-indigo-600" />
              Local Disk Storage Active
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-slate-600 space-y-0.5">
              <p>• <strong>Instant Boot:</strong> Bypasses remote roundtrips and reads straight from local IndexedDB in &lt; 20ms.</p>
              <p>• <strong>Native Windowing:</strong> Borderless standalone desktop window with Windows / macOS taskbar integration.</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => setIsDesktopModalOpen(true)}
              className="text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs flex items-center gap-1.5"
            >
              <Monitor className="w-3.5 h-3.5" />
              Desktop Install & Cache Manager
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-sm font-bold text-slate-800 mb-1">Agent Performance Rank Thresholds</h4>
          <p className="text-xs text-slate-500 mb-3">
            Define the minimum estimated commission earnings thresholds (₹) required for agents to achieve different performance ranks (Bronze, Silver, Gold, Platinum).
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="Bronze Min (₹)"
              id="thresholdBronze"
              value={thresholdBronze}
              onChange={(e) => setThresholdBronze(e.target.value)}
              type="number"
              min="0"
            />
            <Input
              label="Silver Min (₹)"
              id="thresholdSilver"
              value={thresholdSilver}
              onChange={(e) => setThresholdSilver(e.target.value)}
              type="number"
              min="0"
            />
            <Input
              label="Gold Min (₹)"
              id="thresholdGold"
              value={thresholdGold}
              onChange={(e) => setThresholdGold(e.target.value)}
              type="number"
              min="0"
            />
            <Input
              label="Platinum Min (₹)"
              id="thresholdPlatinum"
              value={thresholdPlatinum}
              onChange={(e) => setThresholdPlatinum(e.target.value)}
              type="number"
              min="0"
            />
          </div>
        </div>

        <div className="pt-4 border-t flex justify-between items-center">
          <p className="text-sm font-semibold text-green-600">{saveMessage}</p>
          <Button onClick={handleSave}>Save Config</Button>
        </div>
      </div>
      <DesktopInstallModal
        isOpen={isDesktopModalOpen}
        onClose={() => setIsDesktopModalOpen(false)}
      />
    </Card>
  );
};

export default SettingsModalContent;
