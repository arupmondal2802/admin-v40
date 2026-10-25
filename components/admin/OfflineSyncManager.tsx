import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getApiUrl } from '../../services/backendConfig';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  IconRefresh,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconTrash,
  IconAlertTriangle,
  IconLoader,
  IconSearch,
  IconFilter,
  IconCheck,
  IconX,
  IconDownload,
  IconTable,
  IconPencil,
  IconClipboardList,
  IconGallery,
  IconShieldCheck,
} from '../ui/Icon';
import {
  getOfflineQueue,
  deleteOfflineQueueItem,
  clearOfflineQueue,
  updateOfflineQueueItemPayload,
  retryOfflineQueueItem,
  retryAllOfflineQueue,
} from '../../services/cloudDataService';
import {
  getAllIndexedDbItems,
  deleteIndexedDbItem,
  clearIndexedDbStore,
  IndexedDbDetailItem,
} from '../../services/indexedDbService';
import { uploadFileToDrive } from '../../services/fileUploadService';
import { compressImage } from '../../services/imageCompressionService';
import { Settings, ServiceStatus } from '../../types';
import { toast } from 'sonner';
import { StatusPill } from '../ui/StatusPill';
import { backgroundSyncManager } from '../../services/backgroundSyncManager';
import { 
  getSyncMetrics, 
  resetSyncMetrics, 
  EPHEMERAL_COLLECTIONS, 
  ON_DEMAND_COLLECTIONS,
  getAuditLogSyncStats,
  resetAuditLogSyncState,
  getAuditLogCleanupAnalysis,
  AuditLogCleanupStats,
  purgeOldAuditLogs,
  AuditLogPurgeResult,
  getAutoPruneSetting,
  setAutoPruneSetting
} from '../../services/dataSyncManager';
import { neonDataService } from '../../services/neonDataService';

interface OfflineSyncManagerProps {
  settings?: Settings;
  onRefreshParentData?: () => void;
}

export const OfflineSyncManager: React.FC<OfflineSyncManagerProps> = ({
  settings,
  onRefreshParentData,
}) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'indexeddb' | 'photos' | 'diagnostics' | 'sync_cost' | 'neon_delta'>('queue');
  const [syncMetricsData, setSyncMetricsData] = useState(getSyncMetrics());

  // Neon Automated Delta Sync State
  const [neonSyncStatus, setNeonSyncStatus] = useState<{
    neonCounts: Record<string, number>;
    metadata: any[];
    autoSyncConfig: any;
  } | null>(null);
  const [isLoadingNeonSync, setIsLoadingNeonSync] = useState<boolean>(false);
  const [isTriggeringDeltaSync, setIsTriggeringDeltaSync] = useState<boolean>(false);
  const [deltaSyncResult, setDeltaSyncResult] = useState<any>(null);
  const [forceFullSyncCheckbox, setForceFullSyncCheckbox] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [autoSyncInterval, setAutoSyncInterval] = useState<number>(3);
  const [isSavingAutoConfig, setIsSavingAutoConfig] = useState<boolean>(false);

  const fetchNeonSyncStatus = useCallback(async () => {
    setIsLoadingNeonSync(true);
    try {
      const status = await neonDataService.getSyncStatus();
      if (status) {
        setNeonSyncStatus(status);
        if (status.autoSyncConfig) {
          setAutoSyncEnabled(status.autoSyncConfig.enabled ?? true);
          setAutoSyncInterval(status.autoSyncConfig.intervalMinutes ?? 3);
        }
      }
    } catch (err) {
      console.warn('Failed to load neon sync status:', err);
    } finally {
      setIsLoadingNeonSync(false);
    }
  }, []);

  const handleRunDeltaSync = async () => {
    setIsTriggeringDeltaSync(true);
    try {
      toast.info(forceFullSyncCheckbox ? 'Running Full Refresh Sync with Google Sheets...' : 'Running Delta Sync & Row Comparison check...');
      const targetSheetsUrl = settings?.googleSheetsUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('googleSheetsUrl') : undefined);
      const res = await neonDataService.triggerDeltaSync(targetSheetsUrl || undefined, forceFullSyncCheckbox);
      setDeltaSyncResult(res);

      if (res.status === 'success') {
        if (res.skipped) {
          toast.success('⚡ ' + (res.reason || 'All rows in Google Sheets match Neon DB! Google Sheets sync skipped.'));
        } else {
          const totalUpdates = res.deltaSummary ? Object.values(res.deltaSummary).reduce((a, b) => a + b, 0) : 0;
          toast.success(`✅ Delta Sync Completed! Synced ${totalUpdates} updated/new records into Neon DB.`);
        }
        await fetchNeonSyncStatus();
        if (onRefreshParentData) onRefreshParentData();
      } else if (res.status === 'skipped') {
        toast.info(`ℹ️ Sync skipped: ${res.reason}`);
      } else {
        toast.error(`Sync error: ${res.error || 'Check Google Sheets connection.'}`);
      }
    } catch (err: any) {
      toast.error(`Delta sync failed: ${err.message}`);
    } finally {
      setIsTriggeringDeltaSync(false);
    }
  };

  const handleSaveAutoSyncConfig = async (enabled: boolean, intervalMinutes: number) => {
    setIsSavingAutoConfig(true);
    try {
      const ok = await neonDataService.updateAutoSyncConfig(enabled, intervalMinutes);
      if (ok) {
        setAutoSyncEnabled(enabled);
        setAutoSyncInterval(intervalMinutes);
        toast.success(enabled ? `Automated Backend Sync active (every ${intervalMinutes} min)` : 'Automated Backend Sync paused');
        await fetchNeonSyncStatus();
      } else {
        toast.error('Failed to update automated sync settings');
      }
    } catch (e: any) {
      toast.error('Error saving config: ' + e.message);
    } finally {
      setIsSavingAutoConfig(false);
    }
  };

  const handleRefreshMetrics = () => {
    setSyncMetricsData(getSyncMetrics());
    toast.success('Sync & Quota Metrics refreshed');
  };

  const handleResetMetrics = () => {
    resetSyncMetrics();
    setSyncMetricsData(getSyncMetrics());
    toast.info('Sync metrics reset to zero');
  };
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [indexedDbItems, setIndexedDbItems] = useState<IndexedDbDetailItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FAILED' | 'PENDING'>('ALL');

  // AuditLog Clean Up & Pruning State
  const [isCleanUpModalOpen, setIsCleanUpModalOpen] = useState<boolean>(false);
  const [cleanUpDaysCutoff, setCleanUpDaysCutoff] = useState<number>(90);
  const [cleanupAnalysis, setCleanupAnalysis] = useState<AuditLogCleanupStats | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState<boolean>(false);
  const [isPurgingLogs, setIsPurgingLogs] = useState<boolean>(false);
  const [deleteFromCloud, setDeleteFromCloud] = useState<boolean>(true);
  const [autoPruneEnabled, setAutoPruneEnabled] = useState<boolean>(() => getAutoPruneSetting().enabled);
  const [autoPruneDays, setAutoPruneDays] = useState<number>(() => getAutoPruneSetting().days);
  const [lastPurgeResult, setLastPurgeResult] = useState<AuditLogPurgeResult | null>(null);

  // Modal State for inspecting / editing payload
  const [inspectModalItem, setInspectModalItem] = useState<{
    type: 'queue' | 'indexeddb';
    index?: number;
    key?: string;
    data: any;
  } | null>(null);
  const [editedJson, setEditedJson] = useState<string>('');
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);

  // Online / Ping testing state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  // Photo sync state
  const [pendingPhotos, setPendingPhotos] = useState<
    { id: string; label: string; carNumber: string; source: string; rawData: string }[]
  >([]);
  const [syncingPhotoId, setSyncingPhotoId] = useState<string | null>(null);

  // Diagnostic Endpoint Interface & State
  interface EndpointDiagnosticResult {
    name: string;
    url: string;
    isConfigured: boolean;
    direct: {
      status: 'idle' | 'testing' | 'success' | 'cors_blocked' | 'error';
      statusCode?: string | number;
      latencyMs?: number;
      message?: string;
      snippet?: string;
    };
    proxy: {
      status: 'idle' | 'testing' | 'success' | 'error';
      statusCode?: string | number;
      latencyMs?: number;
      message?: string;
      snippet?: string;
    };
  }

  const [isRunningCorsDiagnostics, setIsRunningCorsDiagnostics] = useState<boolean>(false);
  const [corsDiagnostics, setCorsDiagnostics] = useState<{
    sheets?: EndpointDiagnosticResult;
    drive?: EndpointDiagnosticResult;
    lastTestedAt?: string;
  } | null>(null);

  const googleDriveUploadUrl = settings?.googleDriveUploadUrl || '';
  const googleSheetsUrl = settings?.googleSheetsUrl || '';

  // Listen to network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch queue and IndexedDB records
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load offline queue items
      const queue = getOfflineQueue();
      setQueueItems(queue);

      // Load IndexedDB records
      const dbRecords = await getAllIndexedDbItems();
      setIndexedDbItems(dbRecords);

      // Extract pending photos from IndexedDB submissions key or draft state
      const submissionsRecord = dbRecords.find((r) => r.key === 'service_app_submissions');
      const photoList: { id: string; label: string; carNumber: string; source: string; rawData: string }[] = [];

      if (submissionsRecord && Array.isArray(submissionsRecord.value)) {
        submissionsRecord.value.forEach((sub: any, subIdx: number) => {
          const isOfflineVal = (val?: string) =>
            val && typeof val === 'string' && (val.startsWith('data:') || val.startsWith('blob:'));

          const checkAndPush = (val: string | undefined, label: string) => {
            if (isOfflineVal(val)) {
              photoList.push({
                id: `sub_${subIdx}_${label.replace(/\s+/g, '_')}`,
                label,
                carNumber: sub.carNumber || 'Unassigned Vehicle',
                source: `Submission #${sub.submissionId || subIdx + 1}`,
                rawData: val!,
              });
            }
          };

          checkAndPush(sub.beforeWashingPhoto, 'Before Washing Photo');
          checkAndPush(sub.afterWashingPhoto, 'After Washing Photo');
          checkAndPush(sub.beforeVideoInventory, 'Before Video Inventory');
          checkAndPush(sub.beforeVideoTopBody, 'Before Video Top Body');
          checkAndPush(sub.beforeVideoUnderchassis, 'Before Video Underchassis');
          checkAndPush(sub.afterVideoInterior, 'After Video Interior');
          checkAndPush(sub.afterVideoExterior, 'After Video Exterior');
          checkAndPush(sub.afterVideoUnderchassis, 'After Video Underchassis');

          if (Array.isArray(sub.tyreDetails)) {
            sub.tyreDetails.forEach((t: any, tIdx: number) => {
              checkAndPush(t.dotSerialNumberImage, `Tyre ${tIdx + 1} DOT Serial Image`);
            });
          }
        });
      }
      setPendingPhotos(photoList);
    } catch (err) {
      console.error('Error loading offline sync manager data:', err);
      toast.error('Failed to load IndexedDB offline data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Fetch AuditLog cleanup statistics
  const fetchCleanupAnalysis = useCallback(async (days: number = cleanUpDaysCutoff) => {
    setIsLoadingAnalysis(true);
    try {
      const stats = await getAuditLogCleanupAnalysis(days);
      setCleanupAnalysis(stats);
    } catch (e) {
      console.error('Failed to get audit log cleanup analysis:', e);
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [cleanUpDaysCutoff]);

  useEffect(() => {
    fetchCleanupAnalysis(cleanUpDaysCutoff);
  }, [cleanUpDaysCutoff, fetchCleanupAnalysis]);

  // Execute purge of old audit logs (> daysCutoff)
  const handleExecutePurge = async (daysOverride?: number) => {
    const days = daysOverride ?? cleanUpDaysCutoff;
    setIsPurgingLogs(true);
    try {
      const result = await purgeOldAuditLogs(days, { deleteFromFirestore: deleteFromCloud });
      setLastPurgeResult(result);
      if (result.success) {
        if (result.deletedCount > 0) {
          toast.success(
            `Cleaned up ${result.deletedCount} audit log(s) older than ${days} days (${result.formattedBytesFreed} local storage freed${result.cloudDeletedCount > 0 ? `, ${result.cloudDeletedCount} deleted from Cloud database` : ''})!`
          );
        } else {
          toast.info(`No audit logs older than ${days} days found to clean up.`);
        }
        await loadData();
        await fetchCleanupAnalysis(days);
        if (onRefreshParentData) onRefreshParentData();
      } else {
        toast.error(`Clean up failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      toast.error(`Clean up error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsPurgingLogs(false);
    }
  };

  // Toggle startup auto-prune policy
  const handleToggleAutoPrune = (enabled: boolean) => {
    setAutoPruneEnabled(enabled);
    setAutoPruneSetting(enabled, autoPruneDays);
    toast.success(
      enabled
        ? `Auto-Prune enabled: Logs older than ${autoPruneDays} days will be automatically deleted on startup.`
        : 'Auto-Prune disabled.'
    );
  };

  // Ping server connection latency test
  const handleTestConnection = async () => {
    setIsPinging(true);
    setPingLatency(null);
    const startTime = performance.now();
    try {
      const res = await fetch(getApiUrl('/api/health'), { cache: 'no-store' }).catch(() => null);
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      setPingLatency(latency);
      if (res && res.ok) {
        setIsOnline(true);
        toast.success(`Server connected (${latency} ms latency)`);
      } else {
        toast.info(`Ping completed (${latency} ms)`);
      }
    } catch (err) {
      setPingLatency(null);
      toast.error('Network ping failed');
    } finally {
      setIsPinging(false);
    }
  };

  // Run CORS & Sync Endpoint Diagnostics Suite
  const handleRunCorsDiagnostics = async () => {
    setIsRunningCorsDiagnostics(true);
    toast.info('Running CORS & Endpoint Sync Diagnostics...');

    const testEndpoint = async (name: string, url: string): Promise<EndpointDiagnosticResult> => {
      if (!url) {
        return {
          name,
          url: 'Not Configured',
          isConfigured: false,
          direct: { status: 'idle', message: 'Endpoint URL is missing in Settings.' },
          proxy: { status: 'idle', message: 'Endpoint URL is missing in Settings.' },
        };
      }

      const res: EndpointDiagnosticResult = {
        name,
        url,
        isConfigured: true,
        direct: { status: 'testing' },
        proxy: { status: 'testing' },
      };

      // 1. Direct browser fetch test
      const t0Direct = performance.now();
      try {
        const directResp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ping', timestamp: new Date().toISOString() }),
        });
        const latDirect = Math.round(performance.now() - t0Direct);
        const textDirect = await directResp.text();
        res.direct = {
          status: directResp.ok ? 'success' : 'error',
          statusCode: directResp.status,
          latencyMs: latDirect,
          message: directResp.ok ? 'Direct browser fetch succeeded!' : `HTTP status code ${directResp.status}`,
          snippet: textDirect.slice(0, 300),
        };
      } catch (err: any) {
        const latDirect = Math.round(performance.now() - t0Direct);
        res.direct = {
          status: 'cors_blocked',
          statusCode: 'ERR_FAILED (CORS Blocked)',
          latencyMs: latDirect,
          message: 'Direct browser fetch blocked by CORS policy (No Access-Control-Allow-Origin header present on target resource).',
          snippet: err?.message || 'TypeError: Failed to fetch',
        };
      }

      // 2. Server proxy test
      const t0Proxy = performance.now();
      try {
        const proxyResp = await fetch('/.netlify/functions/google-sheets-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetsUrl: url,
            payload: { action: 'ping', timestamp: new Date().toISOString() },
          }),
        });
        const latProxy = Math.round(performance.now() - t0Proxy);
        const textProxy = await proxyResp.text();
        let parsedProxy: any = null;
        try {
          parsedProxy = JSON.parse(textProxy);
        } catch (_) {}

        if (proxyResp.ok) {
          res.proxy = {
            status: 'success',
            statusCode: 200,
            latencyMs: latProxy,
            message: 'Server Proxy Relay active and responding successfully! (Bypasses browser CORS restrictions)',
            snippet: parsedProxy ? JSON.stringify(parsedProxy, null, 2).slice(0, 300) : textProxy.slice(0, 300),
          };
        } else {
          res.proxy = {
            status: 'error',
            statusCode: proxyResp.status,
            latencyMs: latProxy,
            message: `Server Proxy reported HTTP error ${proxyResp.status}`,
            snippet: textProxy.slice(0, 300),
          };
        }
      } catch (err: any) {
        const latProxy = Math.round(performance.now() - t0Proxy);
        res.proxy = {
          status: 'error',
          statusCode: 'PROXY_NETWORK_ERR',
          latencyMs: latProxy,
          message: 'Server Proxy route unreachable or offline.',
          snippet: err?.message || 'Failed to connect to local server proxy',
        };
      }

      return res;
    };

    try {
      const sheetsResult = await testEndpoint('Google Sheets Sync Endpoint', googleSheetsUrl);
      const driveResult = await testEndpoint('Google Drive Folder Upload Endpoint', googleDriveUploadUrl);

      setCorsDiagnostics({
        sheets: sheetsResult,
        drive: driveResult,
        lastTestedAt: new Date().toLocaleTimeString(),
      });
      toast.success('CORS & Sync Diagnostics complete!');
    } catch (err: any) {
      toast.error('Failed to run CORS diagnostics');
    } finally {
      setIsRunningCorsDiagnostics(false);
    }
  };

  // Filtered queue items
  const filteredQueueItems = useMemo(() => {
    return queueItems.filter((item, idx) => {
      const sheetName = item.payload?.sheetName || '';
      const recId =
        item.payload?.record?.[item.payload?.idField || 'id'] ||
        item.payload?.recordId ||
        '';
      const carNumber = item.payload?.record?.carNumber || '';
      const lastErr = item.lastError || '';

      const matchSearch =
        searchTerm === '' ||
        `${sheetName} ${recId} ${carNumber} ${lastErr}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const isFailed = item.retryCount > 0 || !!item.lastError;
      if (statusFilter === 'FAILED' && !isFailed) return false;
      if (statusFilter === 'PENDING' && isFailed) return false;

      return matchSearch;
    });
  }, [queueItems, searchTerm, statusFilter]);

  // Single Item Retry
  const handleRetryItem = async (index: number) => {
    if (!googleSheetsUrl) {
      toast.error('Google Sheets URL is missing in Settings. Please set it up first.');
      return;
    }
    setRetryingIndex(index);
    try {
      const res = await retryOfflineQueueItem(index, googleSheetsUrl);
      if (res.success) {
        toast.success(`Synced queue item #${index + 1} successfully!`);
        if (onRefreshParentData) onRefreshParentData();
      } else {
        toast.error(`Retry failed: ${res.error}`);
      }
    } catch (err: any) {
      toast.error(`Retry error: ${err?.message || 'Unknown error'}`);
    } finally {
      setRetryingIndex(null);
      loadData();
    }
  };

  // Single Item Delete
  const handleDeleteQueueItem = (index: number) => {
    if (window.confirm(`Are you sure you want to remove queue item #${index + 1}?`)) {
      deleteOfflineQueueItem(index);
      toast.success('Removed item from offline queue');
      loadData();
    }
  };

  // Batch Retry All Queue
  const handleRetryAll = async () => {
    if (queueItems.length === 0) {
      toast.info('No pending queue items to retry.');
      return;
    }
    if (!googleSheetsUrl) {
      toast.error('Google Sheets URL is missing in Settings.');
      return;
    }

    setIsProcessingBatch(true);
    try {
      const result = await retryAllOfflineQueue(googleSheetsUrl);
      if (result.succeeded > 0) {
        toast.success(`Successfully synced ${result.succeeded} queued operation(s)!`);
        if (onRefreshParentData) onRefreshParentData();
      }
      if (result.failed > 0) {
        toast.error(`Failed to sync ${result.failed} item(s).`);
      }
    } catch (err: any) {
      toast.error(`Batch sync error: ${err?.message}`);
    } finally {
      setIsProcessingBatch(false);
      loadData();
    }
  };

  // Clear All Queue
  const handleClearAllQueue = () => {
    if (
      window.confirm(
        'Are you sure you want to clear the ENTIRE offline queue? Unsynced changes will be permanently discarded.'
      )
    ) {
      clearOfflineQueue();
      toast.success('Cleared all offline queue operations');
      loadData();
    }
  };

  // Delete IndexedDB Key
  const handleDeleteIndexedDbKey = async (key: string) => {
    if (window.confirm(`Delete local IndexedDB key "${key}"?`)) {
      await deleteIndexedDbItem(key);
      toast.success(`Deleted key "${key}" from IndexedDB`);
      loadData();
    }
  };

  // Open Inspector Modal
  const handleInspect = (item: any, type: 'queue' | 'indexeddb', index?: number, key?: string) => {
    const rawData = type === 'queue' ? item : item.value;
    const formatted = JSON.stringify(rawData, null, 2);
    setEditedJson(formatted);
    setJsonParseError(null);
    setInspectModalItem({
      type,
      index,
      key,
      data: rawData,
    });
  };

  // Save Payload Changes
  const handleSaveEditedPayload = () => {
    if (!inspectModalItem) return;
    try {
      const parsed = JSON.parse(editedJson);
      if (inspectModalItem.type === 'queue' && inspectModalItem.index !== undefined) {
        updateOfflineQueueItemPayload(inspectModalItem.index, parsed.payload || parsed);
        toast.success('Updated queue item payload');
      }
      setInspectModalItem(null);
      loadData();
    } catch (err: any) {
      setJsonParseError(`Invalid JSON: ${err.message}`);
    }
  };

  // Export Local Backup File
  const handleExportBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        offlineQueue: queueItems,
        indexedDbRecords: indexedDbItems.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt })),
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IndexedDB_Sync_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported local storage backup JSON');
    } catch (err) {
      toast.error('Failed to generate export backup file');
    }
  };

  // Single Photo Upload Sync
  const handleSyncSinglePhoto = async (photo: { id: string; label: string; carNumber: string; rawData: string }) => {
    if (!googleDriveUploadUrl) {
      toast.error('Google Drive Upload URL is required in Settings');
      return;
    }
    setSyncingPhotoId(photo.id);
    try {
      // Convert base64 / blob to File object
      const dataURLtoFile = (dataurl: string, filename: string): File => {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1] || arr[0]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new File([u8arr], filename, { type: mime });
      };

      let fileObj = dataURLtoFile(photo.rawData, `${photo.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`);
      if (fileObj.type.startsWith('image/')) {
        fileObj = await compressImage(fileObj);
      }
      const cloudUrl = await uploadFileToDrive(fileObj, photo.carNumber, googleDriveUploadUrl);

      toast.success(`Uploaded "${photo.label}" to Drive: ${cloudUrl}`);
      setPendingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (err: any) {
      toast.error(`Photo upload failed: ${err?.message || 'Drive error'}`);
    } finally {
      setSyncingPhotoId(null);
    }
  };

  // Compute total size of IndexedDB records
  const totalDbSizeBytes = useMemo(() => {
    return indexedDbItems.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
  }, [indexedDbItems]);

  const formattedDbSize = useMemo(() => {
    if (totalDbSizeBytes > 1024 * 1024) {
      return `${(totalDbSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(totalDbSizeBytes / 1024).toFixed(1)} KB`;
  }, [totalDbSizeBytes]);

  const failedQueueCount = useMemo(() => {
    return queueItems.filter((i) => i.retryCount > 0 || !!i.lastError).length;
  }, [queueItems]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-accent/20 border border-brand-accent/40 rounded-xl text-brand-accent">
              <IconCloudUpload className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                Offline Sync & Database Manager
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect, retry, or purge failed sync items in local IndexedDB queues & cloud operations
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              fetchCleanupAnalysis(cleanUpDaysCutoff);
              setIsCleanUpModalOpen(true);
            }}
            className="text-xs bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/50 py-2 px-3 flex items-center gap-1.5 shadow-xs"
          >
            <IconTrash className="w-4 h-4 text-emerald-400" />
            Clean Up Logs ({cleanupAnalysis?.olderLogsCount !== undefined ? `${cleanupAnalysis.olderLogsCount} Old` : '90d'})
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={loadData}
            disabled={isLoading}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 py-2 px-3"
          >
            <IconRefresh className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Store
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={handleExportBackup}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 py-2 px-3"
          >
            <IconDownload className="w-4 h-4 mr-1.5 text-blue-400" />
            Export Backup
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handleRetryAll}
            disabled={isProcessingBatch || queueItems.length === 0}
            className="text-xs font-bold py-2 px-4 shadow-sm"
          >
            {isProcessingBatch ? (
              <>
                <IconLoader className="w-4 h-4 mr-1.5 animate-spin" />
                Retrying Queue...
              </>
            ) : (
              <>
                <IconCloudUpload className="w-4 h-4 mr-1.5" />
                Retry All Pending ({queueItems.length})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Queued Operations */}
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Queued Operations
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {queueItems.length}
                </span>
                <span className="text-xs text-slate-500">pending cloud syncs</span>
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <IconCloudUpload className="w-6 h-6" />
            </div>
          </div>
        </Card>

        {/* Failed Items */}
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Failed Sync Items
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-2xl font-extrabold ${
                    failedQueueCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'
                  }`}
                >
                  {failedQueueCount}
                </span>
                <span className="text-xs text-slate-500">requires retry / fix</span>
              </div>
            </div>
            <div
              className={`p-3 rounded-xl ${
                failedQueueCount > 0
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <IconAlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </Card>

        {/* IndexedDB Usage */}
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                IndexedDB Store
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {formattedDbSize}
                </span>
                <span className="text-xs text-slate-500">({indexedDbItems.length} keys)</span>
              </div>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-xl">
              <IconTable className="w-6 h-6" />
            </div>
          </div>
        </Card>

        {/* Network & Latency */}
        <Card className="p-4 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Network Status
                </span>
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                  }`}
                ></span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {isOnline ? 'Online' : 'Offline Mode'}
                </span>
                {pingLatency !== null && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {pingLatency} ms
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={isPinging}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
              title="Test connection latency"
            >
              {isPinging ? <IconLoader className="w-5 h-5 animate-spin" /> : <IconShieldCheck className="w-5 h-5 text-emerald-600" />}
            </button>
          </div>
        </Card>
      </div>

      {/* Tabs Bar */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'queue'
                ? 'border-brand-accent text-brand-blue dark:text-brand-accent bg-brand-accent/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconClipboardList className="w-4 h-4" />
            Sync Operations Queue
            {queueItems.length > 0 && (
              <span
                className={`ml-1 px-2 py-0.5 text-[10px] font-black rounded-full ${
                  failedQueueCount > 0 ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                }`}
              >
                {queueItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('indexeddb')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'indexeddb'
                ? 'border-brand-accent text-brand-blue dark:text-brand-accent bg-brand-accent/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconTable className="w-4 h-4" />
            IndexedDB Local Store
            <span className="ml-1 px-2 py-0.5 text-[10px] font-black rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {indexedDbItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'photos'
                ? 'border-brand-accent text-brand-blue dark:text-brand-accent bg-brand-accent/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconGallery className="w-4 h-4" />
            Offline Photo Queue
            {pendingPhotos.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-500 text-white">
                {pendingPhotos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'diagnostics'
                ? 'border-brand-accent text-brand-blue dark:text-brand-accent bg-brand-accent/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconShieldCheck className="w-4 h-4" />
            System Diagnostics
          </button>

          <button
            onClick={() => {
              setActiveTab('sync_cost');
              setSyncMetricsData(getSyncMetrics());
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'sync_cost'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconCloudCheck className="w-4 h-4 text-emerald-500" />
            Cost & Quota Optimizer
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-black rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Cloud Ready
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('neon_delta');
              fetchNeonSyncStatus();
            }}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'neon_delta'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IconRefresh className="w-4 h-4 text-indigo-500" />
            Neon Delta Sync & Comparison
            <span className="ml-1 px-1.5 py-0.5 text-[9px] font-black rounded-sm bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              Smart Skip
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: QUEUE OPERATIONS MANAGER */}
      {activeTab === 'queue' && (
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-4">
          {/* Service Worker Background Sync Engine Status Banner */}
          <div className="p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                <IconCloudUpload className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                    Service Worker Background Sync Engine
                  </h4>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    Active & Resilient
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Offline operations are queued in IndexedDB and automatically re-synced via Service Worker background triggers upon reconnection.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  backgroundSyncManager.triggerSync('USER_MANUAL');
                  toast.info('Triggered Service Worker Background Sync');
                  loadData();
                }}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 py-1.5 px-3"
              >
                <IconRefresh className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                Trigger SW Sync
              </Button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative w-full">
                <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  label=""
                  type="text"
                  placeholder="Search queued items by sheet, car number, or record ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-xs py-2"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  All ({queueItems.length})
                </button>
                <button
                  onClick={() => setStatusFilter('FAILED')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    statusFilter === 'FAILED'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Failed ({failedQueueCount})
                </button>
                <button
                  onClick={() => setStatusFilter('PENDING')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    statusFilter === 'PENDING'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  Pending ({queueItems.length - failedQueueCount})
                </button>
              </div>

              {queueItems.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearAllQueue}
                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 py-1.5 px-3"
                >
                  <IconTrash className="w-4 h-4 mr-1" />
                  Purge Queue
                </Button>
              )}
            </div>
          </div>

          {filteredQueueItems.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <IconCloudCheck className="w-12 h-12 mx-auto text-emerald-500 mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                No Pending Sync Operations
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                All local changes have been successfully synchronized to Google Sheets & Cloud databases.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredQueueItems.map((item, index) => {
                const sheetName = item.payload?.sheetName || 'Record';
                const actionType = item.type || 'upsert';
                const recId =
                  item.payload?.record?.[item.payload?.idField || 'id'] ||
                  item.payload?.recordId ||
                  'N/A';
                const carNum = item.payload?.record?.carNumber || item.payload?.record?.customerName || '';
                const hasError = item.retryCount > 0 || !!item.lastError;
                const isRetryingThis = retryingIndex === index;

                return (
                  <div
                    key={index}
                    className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      hasError
                        ? 'bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/60'
                        : 'bg-slate-50/80 border-slate-200 dark:bg-slate-800/40 dark:border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`p-2.5 rounded-lg flex-shrink-0 font-extrabold text-xs uppercase tracking-wider ${
                          actionType === 'delete'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {actionType}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            {sheetName}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                            ID: {recId}
                          </span>
                          {carNum && (
                            <span className="text-xs font-semibold text-brand-blue dark:text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded">
                              🚗 {carNum}
                            </span>
                          )}
                          <StatusPill
                            status={
                              isRetryingThis
                                ? ServiceStatus.InProgress
                                : hasError
                                ? ServiceStatus.Queued
                                : ServiceStatus.Queued
                            }
                            size="xs"
                          />
                          {item.retryCount > 0 && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                              Tried {item.retryCount}x
                            </span>
                          )}
                        </div>

                        {item.lastError && (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-200/60 dark:border-rose-800/60 mt-1">
                            <IconAlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Failure Reason: {item.lastError}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleInspect(item, 'queue', index)}
                        className="text-xs py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      >
                        <IconPencil className="w-3.5 h-3.5 mr-1 text-slate-500" />
                        Inspect / Edit
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => handleRetryItem(index)}
                        disabled={retryingIndex === index}
                        className="text-xs py-1.5 px-3 font-bold"
                      >
                        {retryingIndex === index ? (
                          <>
                            <IconLoader className="w-3.5 h-3.5 mr-1 animate-spin" />
                            Retrying...
                          </>
                        ) : (
                          <>
                            <IconRefresh className="w-3.5 h-3.5 mr-1" />
                            Retry Sync
                          </>
                        )}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleDeleteQueueItem(index)}
                        className="text-xs py-1.5 px-2.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="Delete this queued item"
                      >
                        <IconTrash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: INDEXEDDB LOCAL STORE INSPECTOR */}
      {activeTab === 'indexeddb' && (
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                IndexedDB Key-Value Records
              </h3>
              <p className="text-xs text-slate-500">
                Direct view of client-side offline store keys, sizes, and record payloads
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (window.confirm('Clear all client IndexedDB keys? Data will be resynced from server on reload.')) {
                  clearIndexedDbStore();
                  toast.success('Cleared local IndexedDB store');
                  loadData();
                }
              }}
              className="text-xs text-rose-600 hover:bg-rose-50 py-1.5 px-3"
            >
              <IconTrash className="w-4 h-4 mr-1" />
              Clear Store
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
                  <th className="p-3">Store Key Name</th>
                  <th className="p-3">Records Count</th>
                  <th className="p-3">Est. Size</th>
                  <th className="p-3">Last Updated</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {indexedDbItems.map((dbItem) => {
                  const sizeKB = (dbItem.sizeBytes / 1024).toFixed(1);
                  const updatedDate = dbItem.updatedAt
                    ? new Date(dbItem.updatedAt).toLocaleTimeString()
                    : 'N/A';

                  return (
                    <tr
                      key={dbItem.key}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {dbItem.key}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400 font-semibold">
                        {dbItem.itemCount !== undefined ? `${dbItem.itemCount} items` : '1 object'}
                      </td>
                      <td className="p-3 font-semibold text-purple-600 dark:text-purple-400">
                        {sizeKB} KB
                      </td>
                      <td className="p-3 text-slate-500">{updatedDate}</td>
                      <td className="p-3 text-right space-x-2">
                        {dbItem.key === 'service_app_audit_logs' && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              fetchCleanupAnalysis(cleanUpDaysCutoff);
                              setIsCleanUpModalOpen(true);
                            }}
                            className="text-xs py-1 px-2.5 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100"
                          >
                            <IconTrash className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                            Clean Up (&gt;90d)
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleInspect(dbItem, 'indexeddb', undefined, dbItem.key)}
                          className="text-xs py-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800"
                        >
                          <IconPencil className="w-3.5 h-3.5 mr-1" />
                          View Payload
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => handleDeleteIndexedDbKey(dbItem.key)}
                          className="text-xs py-1 px-2 text-rose-600 hover:bg-rose-50"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: OFFLINE PHOTOS QUEUE */}
      {activeTab === 'photos' && (
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Offline Photo Uploads Queue
            </h3>
            <p className="text-xs text-slate-500">
              Base64 & Blob photos captured offline waiting to be uploaded to Google Drive
            </p>
          </div>

          {pendingPhotos.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <IconCloudCheck className="w-12 h-12 mx-auto text-emerald-500 mb-2 opacity-80" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                All Photos Synced to Drive
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                There are no local offline photo attachments pending cloud sync.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {pendingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="h-36 w-full rounded-lg bg-slate-200 dark:bg-slate-900 overflow-hidden relative border">
                    <img
                      src={photo.rawData}
                      alt={photo.label}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 text-[10px] font-bold rounded bg-black/70 text-white backdrop-blur-xs">
                      🚗 {photo.carNumber}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {photo.label}
                    </h4>
                    <p className="text-[11px] text-slate-500 truncate">{photo.source}</p>
                  </div>

                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => handleSyncSinglePhoto(photo)}
                    disabled={syncingPhotoId === photo.id}
                    className="w-full text-xs py-1.5 font-bold"
                  >
                    {syncingPhotoId === photo.id ? (
                      <>
                        <IconLoader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        Uploading to Drive...
                      </>
                    ) : (
                      <>
                        <IconCloudUpload className="w-3.5 h-3.5 mr-1.5" />
                        Sync Photo to Drive
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* TAB 4: SYSTEM & CORS / SYNC DIAGNOSTICS */}
      {activeTab === 'diagnostics' && (
        <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <IconShieldCheck className="w-5 h-5 text-brand-blue dark:text-brand-accent" />
                CORS & Sync Endpoint Diagnostics
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Ping and inspect Google Sheets and Google Drive script endpoints directly vs via Server Proxy Relay to identify CORS policies, HTTP status codes, and network latency.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={handleRunCorsDiagnostics}
                disabled={isRunningCorsDiagnostics}
                className="text-xs font-bold py-2"
              >
                {isRunningCorsDiagnostics ? (
                  <>
                    <IconLoader className="w-4 h-4 mr-2 animate-spin" />
                    Testing Endpoints...
                  </>
                ) : (
                  <>
                    <IconRefresh className="w-4 h-4 mr-2" />
                    Run Endpoint Diagnostics
                  </>
                )}
              </Button>

              {corsDiagnostics && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(corsDiagnostics, null, 2));
                    toast.success('Copied CORS diagnostic log to clipboard');
                  }}
                  className="text-xs py-2"
                >
                  Copy Report
                </Button>
              )}
            </div>
          </div>

          {/* Configured Endpoints Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Google Sheets Integration Endpoint
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${googleSheetsUrl ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                  {googleSheetsUrl ? 'URL Configured' : 'Missing'}
                </span>
              </div>
              <p className="text-xs font-mono break-all text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                {googleSheetsUrl || 'Not Configured (Set in Settings Page)'}
              </p>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Google Drive Folder Upload Endpoint
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${googleDriveUploadUrl ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                  {googleDriveUploadUrl ? 'URL Configured' : 'Missing'}
                </span>
              </div>
              <p className="text-xs font-mono break-all text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                {googleDriveUploadUrl || 'Not Configured (Set in Settings Page)'}
              </p>
            </div>
          </div>

          {/* Detailed Diagnostic Test Results */}
          {corsDiagnostics ? (
            <div className="space-y-6 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Latest Diagnostic Test Results (Ran at {corsDiagnostics.lastTestedAt}):
                </h4>
              </div>

              {[corsDiagnostics.sheets, corsDiagnostics.drive].filter(Boolean).map((diagItem) => {
                if (!diagItem) return null;
                return (
                  <div key={diagItem.name} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{diagItem.name}</span>
                      </h4>
                      <span className="text-xs font-mono text-slate-500 truncate max-w-xs">{diagItem.url}</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Direct Browser Fetch Card */}
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            🌐 Direct Browser Fetch
                          </span>
                          {diagItem.direct.status === 'cors_blocked' && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                              CORS Blocked (ERR_FAILED)
                            </span>
                          )}
                          {diagItem.direct.status === 'success' && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Direct OK ({diagItem.direct.latencyMs}ms)
                            </span>
                          )}
                          {diagItem.direct.status === 'error' && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Error HTTP {diagItem.direct.statusCode}
                            </span>
                          )}
                          {diagItem.direct.status === 'idle' && (
                            <span className="px-2 py-0.5 text-[10px] text-slate-400">Not Tested</span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {diagItem.direct.message}
                        </p>

                        {diagItem.direct.snippet && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Response Output Snippet:</span>
                            <pre className="text-[11px] font-mono bg-slate-950 text-slate-300 p-2.5 rounded-lg overflow-x-auto max-h-32">
                              {diagItem.direct.snippet}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Server Proxy Relay Card */}
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            ⚡ Server Proxy Relay Mode
                          </span>
                          {diagItem.proxy.status === 'success' && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                              Proxy Active & OK ({diagItem.proxy.latencyMs}ms)
                            </span>
                          )}
                          {diagItem.proxy.status === 'error' && (
                            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Proxy Error ({diagItem.proxy.statusCode})
                            </span>
                          )}
                          {diagItem.proxy.status === 'idle' && (
                            <span className="px-2 py-0.5 text-[10px] text-slate-400">Not Tested</span>
                          )}
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {diagItem.proxy.message}
                        </p>

                        {diagItem.proxy.snippet && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Proxy Response Output:</span>
                            <pre className="text-[11px] font-mono bg-slate-950 text-emerald-400 p-2.5 rounded-lg overflow-x-auto max-h-32">
                              {diagItem.proxy.snippet}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 space-y-3">
              <IconShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Ready to test CORS & Sync Endpoints
                </h4>
                <p className="text-xs text-slate-500">
                  Click the "Run Endpoint Diagnostics" button above to perform real-time latency, CORS origin header, and server proxy ping tests for your configured endpoints.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* TAB 5: SYNC COST & QUOTA OPTIMIZER */}
      {activeTab === 'sync_cost' && (
        <div className="space-y-6">
          {/* Overview Hero Card */}
          <Card className="p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 border-emerald-500/30 text-white space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-400">
                  <IconCloudCheck className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight text-white">
                      Data Sync Manager — Cost & Quota Optimizer
                    </h2>
                    <span className="px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full bg-emerald-500 text-slate-950">
                      Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Tiered sync architecture to prevent excessive billable reads/writes on cloud database services
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRefreshMetrics}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 py-1.5 px-3"
                >
                  <IconRefresh className="w-3.5 h-3.5 mr-1" />
                  Refresh Stats
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleResetMetrics}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border-slate-700 py-1.5 px-3"
                >
                  Reset Counters
                </Button>
              </div>
            </div>

            {/* Metric Counters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Doc Reads Prevented
                </span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {syncMetricsData.readsPrevented.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400">via 10m TTL cache & local storage</span>
              </div>

              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  Doc Writes Prevented
                </span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {syncMetricsData.writesPrevented.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400">ephemeral notifications/pings skipped</span>
              </div>

              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  Actual Core Reads
                </span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {syncMetricsData.actualReads.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400">essential operational docs fetched</span>
              </div>

              <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  Actual Core Writes
                </span>
                <div className="text-2xl font-black text-white mt-0.5">
                  {syncMetricsData.actualWrites.toLocaleString()}
                </div>
                <span className="text-[10px] text-slate-400">orders, configs, & users synced</span>
              </div>
            </div>
          </Card>

          {/* Sync Tier Explanations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <IconShieldCheck className="w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Tier 1: Core Operational
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Loaded on startup with intelligent 10-minute cache TTL. Includes Users, Submissions, Customers, Pricing, and Services.
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {['users', 'submissions', 'customers', 'settings', 'pricingConfig', 'deliveryHubs'].map(col => (
                  <span key={col} className="px-2 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </Card>

            <Card className="p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <IconFilter className="w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Tier 2: On-Demand / Lazy
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Never fetched on app startup. Only queried with strict <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">limit(50)</code> when an admin specifically opens that view.
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {['auditLogs', 'inventoryMovements', 'bookkeeping', 'profitLoss', 'miscSpends'].map(col => (
                  <span key={col} className="px-2 py-0.5 text-[10px] font-mono bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </Card>

            <Card className="p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <IconCloudOff className="w-5 h-5" />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Skipped / Local-First
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Stored exclusively in local IndexedDB. Bypasses cloud sync completely to eliminate quota drains from background alerts & GPS updates.
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {['notifications', 'locationHistory', 'retentionLogs'].map(col => (
                  <span key={col} className="px-2 py-0.5 text-[10px] font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 rounded">
                    {col} (Local-Only)
                  </span>
                ))}
              </div>
            </Card>
          </div>

          {/* AuditLog Timestamp Incremental Sync Engine Card */}
          {(() => {
            const auditStats = getAuditLogSyncStats();
            return (
              <Card className="p-5 bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/30 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/40">
                      <IconClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">
                          AuditLog Timestamp-Delta Sync Engine
                        </h4>
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Active & Optimized
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Only uploads new audit logs created after the last sync timestamp. Bypasses re-evaluating the full historical log array during high-frequency usage.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        resetAuditLogSyncState();
                        setSyncMetricsData(getSyncMetrics());
                        toast.info('Audit log sync timestamp reset. Next sync will perform full check.');
                      }}
                      className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border-slate-700 py-1 px-2.5"
                    >
                      Reset Timestamp
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Last Successful Sync</span>
                    <div className="text-sm font-bold text-white mt-0.5 font-mono">
                      {auditStats.lastSyncFormatted}
                    </div>
                    <span className="text-[9px] text-slate-500">Epoch ms: {auditStats.lastSyncTimestamp || 0}</span>
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Cached Synced Log IDs</span>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {auditStats.syncedIdsCount} IDs cached
                    </div>
                    <span className="text-[9px] text-slate-500">O(1) dedup lookup</span>
                  </div>

                  <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Payload Optimization</span>
                    <div className="text-sm font-bold text-blue-400 mt-0.5">
                      Delta-Only Uploads
                    </div>
                    <span className="text-[9px] text-slate-500">Zero payload if 0 new events</span>
                  </div>
                </div>
              </Card>
            );
          })()}

          {/* AuditLog 90-Day Storage Clean Up & Pruning Engine Card */}
          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl">
                  <IconTrash className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Audit Log 90-Day Storage Clean Up Engine
                    </h3>
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/60">
                      Local & Cloud Storage
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Automatically or manually delete audit logs older than 90 days to keep local IndexedDB and cloud database storage usage low.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fetchCleanupAnalysis(cleanUpDaysCutoff)}
                  disabled={isLoadingAnalysis}
                  className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 py-1.5 px-3"
                >
                  <IconRefresh className={`w-3.5 h-3.5 mr-1.5 ${isLoadingAnalysis ? 'animate-spin' : ''}`} />
                  Refresh Analysis
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => handleExecutePurge(cleanUpDaysCutoff)}
                  disabled={isPurgingLogs || (cleanupAnalysis?.olderLogsCount ?? 0) === 0}
                  className="text-xs font-bold py-1.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPurgingLogs ? (
                    <>
                      <IconLoader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Cleaning Up...
                    </>
                  ) : (
                    <>
                      <IconTrash className="w-3.5 h-3.5 mr-1.5" />
                      Clean Up Now ({cleanupAnalysis?.olderLogsCount ?? 0})
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Retention Threshold Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
              <div className="text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">Retention Cutoff Threshold:</span>
                <span className="text-slate-500 ml-1.5">
                  Logs older than {cleanUpDaysCutoff} days (created before {cleanupAnalysis?.cutoffDateFormatted || 'calculating...'}) will be purged.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { days: 30, label: '30 Days' },
                  { days: 60, label: '60 Days' },
                  { days: 90, label: '90 Days (Recommended)' },
                  { days: 180, label: '180 Days' },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => {
                      setCleanUpDaysCutoff(preset.days);
                      fetchCleanupAnalysis(preset.days);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      cleanUpDaysCutoff === preset.days
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Analysis Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <span className="text-[10px] font-bold uppercase text-slate-500">Total Audit Logs</span>
                <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-1">
                  {cleanupAnalysis?.totalLogs ?? 0}
                </div>
                <span className="text-[10px] text-slate-500">In local IndexedDB store</span>
              </div>

              <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/50">
                <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">
                  Logs &gt; {cleanUpDaysCutoff} Days Old
                </span>
                <div className="text-xl font-black text-rose-700 dark:text-rose-300 mt-1 flex items-center gap-2">
                  {cleanupAnalysis?.olderLogsCount ?? 0}
                  {(cleanupAnalysis?.olderLogsCount ?? 0) > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 font-bold">
                      Ready to purge
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-rose-600 dark:text-rose-400">Will be permanently deleted</span>
              </div>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
                <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                  Retained Logs (&le; {cleanUpDaysCutoff}d)
                </span>
                <div className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                  {cleanupAnalysis?.retainedLogsCount ?? 0}
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Safely preserved in database</span>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800/50">
                <span className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400">
                  Est. Storage Freed
                </span>
                <div className="text-xl font-black text-purple-700 dark:text-purple-300 mt-1">
                  {cleanupAnalysis?.formattedBytesFreed ?? '0 B'}
                </div>
                <span className="text-[10px] text-purple-600 dark:text-purple-400">IndexedDB & Memory reclaimed</span>
              </div>
            </div>

            {/* Storage Policies & Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
                <input
                  id="deleteFromCloudCheckbox"
                  type="checkbox"
                  checked={deleteFromCloud}
                  onChange={(e) => setDeleteFromCloud(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <label htmlFor="deleteFromCloudCheckbox" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    Mirror deletion to Cloud Database
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    When checked, old matching logs will also be batch deleted from the remote database to minimize cloud storage cost and stay within quotas.
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-start gap-3">
                <input
                  id="autoPruneStartupCheckbox"
                  type="checkbox"
                  checked={autoPruneEnabled}
                  onChange={(e) => handleToggleAutoPrune(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <label htmlFor="autoPruneStartupCheckbox" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    Enable Automatic Prune on App Startup
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Automatically checks and purges logs older than 90 days in the background every 24 hours on launch, keeping database footprints permanently lean.
                  </p>
                </div>
              </div>
            </div>

            {/* Sample preview of older logs */}
            {cleanupAnalysis && cleanupAnalysis.sampleOlderLogs.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-bold">
                  <span>Sample of Old Logs to be Purged (Showing up to 5)</span>
                  <span>Oldest Record Date: {cleanupAnalysis.oldestLogDate || 'N/A'}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                        <th className="p-2.5">Date / Timestamp</th>
                        <th className="p-2.5">Action / Event</th>
                        <th className="p-2.5">User</th>
                        <th className="p-2.5">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {cleanupAnalysis.sampleOlderLogs.map((item, idx) => (
                        <tr key={item.id || idx} className="text-slate-700 dark:text-slate-300 text-[11px]">
                          <td className="p-2.5 text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : (item.date || item.createdAt || 'Unknown')}
                          </td>
                          <td className="p-2.5 font-bold whitespace-nowrap">
                            {item.action || item.type || item.eventType || 'LOG_ENTRY'}
                          </td>
                          <td className="p-2.5 whitespace-nowrap text-slate-500">
                            {item.user || item.performedBy || item.userName || 'System'}
                          </td>
                          <td className="p-2.5 truncate max-w-xs text-slate-500">
                            {item.details || item.notes || item.description || JSON.stringify(item).substring(0, 50)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Last Purge Feedback Card */}
            {lastPurgeResult && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-300 dark:border-emerald-800/60 text-xs flex items-center justify-between text-emerald-800 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <IconCheck className="w-4 h-4 text-emerald-500" />
                  <span>
                    <strong>Last Clean Up Run:</strong> Purged {lastPurgeResult.deletedCount} old logs ({lastPurgeResult.formattedBytesFreed} freed{lastPurgeResult.cloudDeletedCount > 0 ? `, ${lastPurgeResult.cloudDeletedCount} cloud docs deleted` : ''}).
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  Cutoff: {lastPurgeResult.cutoffDate}
                </span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 6: NEON AUTOMATED DELTA SYNC & ROW COMPARISON */}
      {activeTab === 'neon_delta' && (
        <div className="space-y-6">
          {/* Header Card: Master Automation Controls */}
          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <IconRefresh className={`w-6 h-6 ${isTriggeringDeltaSync ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Automated Backend Delta Sync & Row Comparison
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                      autoSyncEnabled
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {autoSyncEnabled ? `⚡ Auto-Sync Active (${autoSyncInterval}m)` : '⏸️ Auto-Sync Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Automates syncing between Google Sheets and Neon PostgreSQL database in the backend. Compares total row counts and timestamps: if all rows are already up-to-date in Neon, Google Sheets sync is smart-skipped to eliminate network delays and quota consumption.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-end lg:self-center flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={fetchNeonSyncStatus}
                  disabled={isLoadingNeonSync}
                  className="text-xs py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <IconRefresh className={`w-3.5 h-3.5 mr-1.5 ${isLoadingNeonSync ? 'animate-spin' : ''}`} />
                  Refresh Counts
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleRunDeltaSync}
                  disabled={isTriggeringDeltaSync}
                  className="text-xs font-bold py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                >
                  {isTriggeringDeltaSync ? (
                    <>
                      <IconLoader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Comparing & Syncing...
                    </>
                  ) : (
                    <>
                      <IconRefresh className="w-3.5 h-3.5 mr-1.5" />
                      Run Delta Sync Now
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Smart Skip & Automation Strategy Info Box */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/50 space-y-1.5">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                  <IconShieldCheck className="w-4 h-4" />
                  <span>1. Row Count Comparison</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                  Checks total rows in Google Sheets vs Neon PostgreSQL before transferring data.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs">
                  <IconCloudCheck className="w-4 h-4" />
                  <span>2. Smart Zero-Waste Skip</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                  If total rows and versions match, the sync from Google Sheets is skipped immediately.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 space-y-1.5">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-xs">
                  <IconCloudUpload className="w-4 h-4" />
                  <span>3. Incremental Delta Upsert</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal">
                  When new rows or updates exist, only the delta changes are upserted into Neon DB.
                </p>
              </div>
            </div>

            {/* Automation Settings Bar */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoSyncBackendToggle"
                  checked={autoSyncEnabled}
                  onChange={(e) => handleSaveAutoSyncConfig(e.target.checked, autoSyncInterval)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <label htmlFor="autoSyncBackendToggle" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                    Enable Automatic Backend Sync Interval
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Runs background row comparison continuously on the Node.js server.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-semibold">Check Every:</span>
                  <select
                    value={autoSyncInterval}
                    onChange={(e) => handleSaveAutoSyncConfig(autoSyncEnabled, parseInt(e.target.value, 10))}
                    disabled={isSavingAutoConfig}
                    className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    <option value={1}>1 Minute</option>
                    <option value={2}>2 Minutes</option>
                    <option value={3}>3 Minutes (Default)</option>
                    <option value={5}>5 Minutes</option>
                    <option value={10}>10 Minutes</option>
                    <option value={15}>15 Minutes</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={forceFullSyncCheckbox}
                    onChange={(e) => setForceFullSyncCheckbox(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                  />
                  <span>Force Full Re-sync (Bypass Skip)</span>
                </label>
              </div>
            </div>

            {/* Last Execution Outcome Alert */}
            {deltaSyncResult && (
              <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                deltaSyncResult.skipped
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                  : deltaSyncResult.status === 'success'
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
              }`}>
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1.5">
                    {deltaSyncResult.skipped ? '⏭️ Smart Skip Triggered (All Rows Updated)' : '🔄 Delta Sync Completed'}
                  </span>
                  <span className="font-mono text-[10px]">
                    {deltaSyncResult.lastSyncedAt ? new Date(deltaSyncResult.lastSyncedAt).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90">
                  {deltaSyncResult.reason || (
                    deltaSyncResult.deltaSummary
                      ? `Successfully upserted ${Object.entries(deltaSyncResult.deltaSummary).map(([k, v]) => `${v} ${k}`).join(', ')} into Neon PostgreSQL.`
                      : 'All records synchronized.'
                  )}
                </p>
              </div>
            )}
          </Card>

          {/* Row Comparison Matrix Table */}
          <Card className="p-6 bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Live Row Count Comparison Matrix
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Comparison between Google Sheets total rows and Neon PostgreSQL table rows.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                Total Neon Orders: <strong>{neonSyncStatus?.neonCounts?.Submissions ?? 0}</strong> | Leads: <strong>{neonSyncStatus?.neonCounts?.ServiceRequests ?? 0}</strong>
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold">
                    <th className="p-3">Entity / Collection</th>
                    <th className="p-3">Target Neon Table</th>
                    <th className="p-3 text-center">Google Sheet Rows</th>
                    <th className="p-3 text-center">Neon DB Rows</th>
                    <th className="p-3 text-center">Comparison Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                  {[
                    {
                      name: '📦 Customer Orders',
                      sheet: 'Submissions',
                      neonTable: 'service_orders',
                      neonCount: neonSyncStatus?.neonCounts?.Submissions ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.Submissions ?? neonSyncStatus?.neonCounts?.Submissions ?? 0,
                    },
                    {
                      name: '🎯 Service Requests & Leads',
                      sheet: 'ServiceRequests',
                      neonTable: 'service_requests',
                      neonCount: neonSyncStatus?.neonCounts?.ServiceRequests ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.ServiceRequests ?? neonSyncStatus?.neonCounts?.ServiceRequests ?? 0,
                    },
                    {
                      name: '👤 Users & Auth Accounts',
                      sheet: 'Users',
                      neonTable: 'app_users',
                      neonCount: neonSyncStatus?.neonCounts?.Users ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.Users ?? neonSyncStatus?.neonCounts?.Users ?? 0,
                    },
                    {
                      name: '🧰 Inventory Items',
                      sheet: 'InventoryItems',
                      neonTable: 'inventory_items',
                      neonCount: neonSyncStatus?.neonCounts?.inventory_items ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.InventoryItems ?? neonSyncStatus?.neonCounts?.inventory_items ?? 0,
                    },
                    {
                      name: '🛡️ Warranties & Guarantees',
                      sheet: 'Warranties',
                      neonTable: 'warranties',
                      neonCount: neonSyncStatus?.neonCounts?.warranties ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.Warranties ?? neonSyncStatus?.neonCounts?.warranties ?? 0,
                    },
                    {
                      name: '💳 Subscriptions & Plans',
                      sheet: 'UserSubscriptions',
                      neonTable: 'user_subscriptions',
                      neonCount: neonSyncStatus?.neonCounts?.user_subscriptions ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.UserSubscriptions ?? neonSyncStatus?.neonCounts?.user_subscriptions ?? 0,
                    },
                    {
                      name: '💰 Expenses & Overheads',
                      sheet: 'Expenses',
                      neonTable: 'expenses',
                      neonCount: neonSyncStatus?.neonCounts?.expenses ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.Expenses ?? neonSyncStatus?.neonCounts?.expenses ?? 0,
                    },
                    {
                      name: '📋 Service Catalogs & Rules',
                      sheet: 'PredefinedServices',
                      neonTable: 'predefined_services',
                      neonCount: neonSyncStatus?.neonCounts?.predefined_services ?? 0,
                      sheetCount: deltaSyncResult?.sheetCounts?.PredefinedServices ?? neonSyncStatus?.neonCounts?.predefined_services ?? 0,
                    },
                    {
                      name: '🚗 Car Database (Trims & Tyres)',
                      sheet: 'Website / Catalog Sheet',
                      neonTable: 'app_synced_collections (car_database)',
                      neonCount: neonSyncStatus?.neonCounts?.car_database ?? 7560,
                      sheetCount: 7560,
                    },
                  ].map((row, idx) => {
                    const isMatching = row.sheetCount === row.neonCount;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                          {row.name}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">
                          {row.neonTable}
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                          {row.sheetCount}
                        </td>
                        <td className="p-3 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {row.neonCount}
                        </td>
                        <td className="p-3 text-center">
                          {isMatching ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <IconCheck className="w-3 h-3 text-emerald-600" />
                              100% In-Sync (Skip Ready)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <IconRefresh className="w-3 h-3 text-amber-600 animate-spin" />
                              Delta Pending ({Math.abs(row.sheetCount - row.neonCount)} rows)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleRunDeltaSync}
                            className="text-xs py-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                          >
                            Sync Sheet
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* CLEAN UP AUDIT LOGS MODAL */}
      {isCleanUpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl">
                  <IconTrash className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Clean Up Audit Logs ({cleanUpDaysCutoff} Days)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Purge historical audit events from local and cloud databases
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCleanUpModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {/* Threshold buttons */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Retention Threshold:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { days: 30, label: '30d' },
                  { days: 60, label: '60d' },
                  { days: 90, label: '90d (Rec.)' },
                  { days: 180, label: '180d' },
                ].map((item) => (
                  <button
                    key={item.days}
                    type="button"
                    onClick={() => {
                      setCleanUpDaysCutoff(item.days);
                      fetchCleanupAnalysis(item.days);
                    }}
                    className={`py-2 px-3 text-xs rounded-xl font-bold transition-all border ${
                      cleanUpDaysCutoff === item.days
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Breakdown */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">To Delete</span>
                <div className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  {cleanupAnalysis?.olderLogsCount ?? 0}
                </div>
                <span className="text-[9px] text-slate-400">&gt; {cleanUpDaysCutoff} days old</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">To Keep</span>
                <div className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {cleanupAnalysis?.retainedLogsCount ?? 0}
                </div>
                <span className="text-[9px] text-slate-400">Fresh records</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Space Saved</span>
                <div className="text-base font-black text-purple-600 dark:text-purple-400 mt-0.5">
                  {cleanupAnalysis?.formattedBytesFreed ?? '0 B'}
                </div>
                <span className="text-[9px] text-slate-400">IndexedDB freed</span>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteFromCloud}
                  onChange={(e) => setDeleteFromCloud(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span>Also delete matching old records from Cloud database collection</span>
              </label>
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPruneEnabled}
                  onChange={(e) => handleToggleAutoPrune(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span>Enable automatic 24-hour background prune on app launch</span>
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCleanUpModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={async () => {
                  await handleExecutePurge(cleanUpDaysCutoff);
                  setIsCleanUpModalOpen(false);
                }}
                disabled={isPurgingLogs || (cleanupAnalysis?.olderLogsCount ?? 0) === 0}
                className="text-xs font-bold py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isPurgingLogs ? (
                  <>
                    <IconLoader className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Purging Database...
                  </>
                ) : (
                  <>
                    <IconTrash className="w-3.5 h-3.5 mr-1.5" />
                    Clean Up ({cleanupAnalysis?.olderLogsCount ?? 0} Old Logs)
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT & EDIT PAYLOAD MODAL */}
      {inspectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <IconPencil className="w-4 h-4 text-brand-blue dark:text-brand-accent" />
                Payload Inspector / Editor
                {inspectModalItem.key && (
                  <span className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
                    {inspectModalItem.key}
                  </span>
                )}
              </h3>
              <button
                onClick={() => setInspectModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            {jsonParseError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
                {jsonParseError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                JSON Payload Content:
              </label>
              <textarea
                value={editedJson}
                onChange={(e) => {
                  setEditedJson(e.target.value);
                  setJsonParseError(null);
                }}
                rows={14}
                className="w-full font-mono text-xs p-3 bg-slate-950 text-emerald-400 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-accent leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(editedJson);
                  toast.success('Copied payload to clipboard');
                }}
                className="text-xs"
              >
                Copy JSON
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setInspectModalItem(null)}
                  className="text-xs"
                >
                  Cancel
                </Button>

                {inspectModalItem.type === 'queue' && (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSaveEditedPayload}
                    className="text-xs font-bold"
                  >
                    Save Payload Changes
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfflineSyncManager;
