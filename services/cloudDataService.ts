
import { AppData, User, Settings, Service, TyreDetail, BatteryDetail, CustomService, CategorizedAddon, ServiceStatus, SubscriptionPlan, UserSubscription, ServiceTemplate, ServiceRequest, AppNotification, NotificationPreferences, LocationHistory, RetentionKpiTargets, MiscSpend, BookkeepingEntry, TyreData, ProfitLoss, PricingConfig, SpendCategory, PredefinedCost, ExpenseItem, RecurringExpense } from '../types';
import { getBackendBaseUrl, isNeonSoleSourceMode } from './backendConfig';
import { getDefaultPermissionsForRole } from './authService';
import { CAR_BRANDS, TIRE_BRANDS } from '../data/vehicleData';
import { DEFAULT_PRICING_CONFIG, DEFAULT_DELIVERY_HUBS } from '../constants';
import { SyncStatus } from '../components/ui/SyncStatusIndicator';
import { db, isQuotaExceeded, setQuotaExceeded, checkIsQuotaError } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, query, orderBy, limit, startAfter } from 'firebase/firestore';
import { getIndexedDbItem, setIndexedDbItem } from './indexedDbService';
import { 
    loadFromFirestore, 
    saveRecordToFirestore, 
    deleteRecordFromFirestore, 
    seedFirestoreFromAppData, 
    fetchMoreServiceRequestsFromFirestore,
    getIdField,
    getFirestoreCollectionName
} from './firestoreService';
import {
    getLastAuditLogSyncTimestamp,
    setLastAuditLogSyncTimestamp,
    isAuditLogSynced,
    markAuditLogSynced,
    markMultipleAuditLogsSynced,
    filterNewAuditLogs,
    getAuditLogSyncStats,
    resetAuditLogSyncState,
    getAuditLogCleanupAnalysis,
    purgeOldAuditLogs,
    getAutoPruneSetting,
    setAutoPruneSetting,
    runStartupAuditLogPrune
} from './dataSyncManager';
import { backgroundSyncManager } from './backgroundSyncManager';
import { addOrUpdateSyncQueueItem, deleteSyncQueueItem, clearSyncQueue as clearIdbSyncQueue } from './indexedDbService';
import { neonDataService } from './neonDataService';

export { 
    loadFromFirestore, 
    saveRecordToFirestore, 
    deleteRecordFromFirestore, 
    seedFirestoreFromAppData,
    getIdField,
    getFirestoreCollectionName,
    getLastAuditLogSyncTimestamp,
    setLastAuditLogSyncTimestamp,
    isAuditLogSynced,
    markAuditLogSynced,
    markMultipleAuditLogsSynced,
    filterNewAuditLogs,
    getAuditLogSyncStats,
    resetAuditLogSyncState,
    getAuditLogCleanupAnalysis,
    purgeOldAuditLogs,
    getAutoPruneSetting,
    setAutoPruneSetting,
    runStartupAuditLogPrune
};

export const parseSpecialties = (val: any): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean);
            } catch {}
        }
        return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
};

export const safeJsonParse = (val: any, fallback: any = {}) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
        try {
            return JSON.parse(val);
        } catch {
            return fallback;
        }
    }
    return fallback;
};

// --- ROBUST PARSING HELPERS ---
export const robustParseFloat = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const cleanedString = value.replace(/[^0-9.-]+/g, "");
    const number = parseFloat(cleanedString);
    return isNaN(number) ? 0 : number;
};

export const robustParseInt = (value: any): number => {
    const floatVal = robustParseFloat(value);
    return parseInt(String(floatVal), 10);
};

export const mapWebsiteOrderToServiceRequest = (order: any): ServiceRequest => {
    const customerName = `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim() || order.customerName || 'Website Customer';
    const requestedService = (order.websiteOrderItems && order.websiteOrderItems.length > 0)
        ? order.websiteOrderItems.map((i: any) => {
            const name = i.itemName || i.item_name || 'Service Item';
            const qty = i.itemQuantity || i.qty || 1;
            return `${name}${qty > 1 ? ` (x${qty})` : ''}`;
        }).join(', ')
        : (order.carBrandModel ? `${order.carBrandModel} Service` : 'Website Storefront Booking');

    let brand = order.carBrand || '';
    let model = order.carModelName || '';
    if ((!brand || !model) && order.carBrandModel) {
        const parts = String(order.carBrandModel).split(' - ');
        if (parts.length > 1) {
            brand = brand || parts[0].trim();
            model = model || parts.slice(1).join(' - ').trim();
        } else {
            const spaceParts = String(order.carBrandModel).split(' ');
            brand = brand || spaceParts[0] || '';
            model = model || spaceParts.slice(1).join(' ') || '';
        }
    }

    const carNumber = order.carNumber || order.carRegNo || '';
    const nowIso = new Date().toISOString();
    const orderDate = order.timestamp || order.createdAt || order.order_date || nowIso;

    const rawData = {
        order_id: order.websiteOrderId || order.submissionId || order.id,
        userId: order.mobileNumber,
        mobile: order.mobileNumber,
        firstName: order.customerFirstName,
        lastName: order.customerLastName,
        userName: customerName,
        car_brand: brand,
        car_model: model,
        carNumber,
        car_reg_no: carNumber,
        car_tag: order.vehicleCategoryTag || 'Standard',
        car_fuel_type: order.carFuelType || order.fuelType || '',
        car_year_range: order.carYearRange || order.yearRange || '',
        front_tyres_spec: order.frontTyresSpec || '',
        rear_tyres_spec: order.rearTyresSpec || '',
        streetAddress: order.streetAddress,
        shippingAddress: order.streetAddress,
        totalAmount: order.grandTotal,
        paymentMethod: order.paymentMode || order.paymentMethod || 'Online / Cash',
        items: order.websiteOrderItems || []
    };

    return {
        id: String(order.websiteOrderId || order.submissionId || order.id),
        customerName,
        customerPhone: order.mobileNumber || '',
        requestedService,
        requestDate: orderDate,
        syncedAt: nowIso,
        source: 'Website',
        leadSource: 'Web',
        status: (order.status === 'Completed' || order.status === ServiceStatus.Completed) ? 'CONVERTED' : (order.status || 'CREATED'),
        carRegNo: carNumber,
        carBrand: brand,
        carModel: model,
        streetAddress: order.streetAddress || '',
        totalAmount: order.grandTotal || 0,
        originalOrderJson: JSON.stringify(rawData),
        remarks: order.internalNotes || order.notes || order.specialInstructions || 'Neon PostgreSQL DB Storefront Order'
    };
};

// --- OFFLINE QUEUE MANAGEMENT & DELTA SYNC ---
const recordHashCache = new Map<string, string>();

const computeRecordHash = (obj: any): string => {
    if (!obj || typeof obj !== 'object') return '';
    try {
        const str = JSON.stringify(obj, (key, value) => {
            if (key === '_hash' || key === 'lastSyncedAt' || key === 'updatedAt') return undefined;
            return value;
        });
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return hash.toString(36);
    } catch {
        return Math.random().toString(36);
    }
};

export const markRecordSynced = (sheetName: string, recordId: string | number, recordObj: any) => {
    if (!sheetName || !recordId) return;
    const key = `${sheetName}:${String(recordId)}`;
    const hash = computeRecordHash(recordObj);
    recordHashCache.set(key, hash);
};

export const isRecordModified = (sheetName: string, recordId: string | number, recordObj: any): boolean => {
    if (!sheetName || !recordId) return true;
    const key = `${sheetName}:${String(recordId)}`;
    const lastHash = recordHashCache.get(key);
    if (!lastHash) return true;
    const currentHash = computeRecordHash(recordObj);
    return currentHash !== lastHash;
};

const QUEUE_STORAGE_KEY = 'service_app_offline_queue';
let operationQueue: any[] = [];
let isProcessingQueue = false;
let callbacks = {
    onSyncStatusChange: (status: SyncStatus) => {},
    onSyncError: (error: string | null) => {},
    onProgressChange: (progress: number | null, stage?: string | null, entity?: string | null) => {},
};

const loadQueueFromStorage = () => {
    try {
        const savedQueue = localStorage.getItem(QUEUE_STORAGE_KEY);
        operationQueue = savedQueue ? JSON.parse(savedQueue) : [];
        if (operationQueue.length > 0) {
            callbacks.onSyncStatusChange('UNSAVED');
        }
    } catch (e) {
        console.error("Failed to load offline queue:", e);
        operationQueue = [];
    }
};

const saveQueueToStorage = () => {
    try {
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(operationQueue));
    } catch (e) {
        console.error("Failed to save offline queue to local storage (Quota Exceeded?):", e);
    }
};

const addToQueue = (operation: any) => {
    console.log("[DEBUG] cloudDataService: addToQueue called with operation:", operation);
    
    const recordId = operation.payload.record ? operation.payload.record[operation.payload.idField] : operation.payload.recordId;
    const opKey = `${operation.payload.sheetName}-${recordId}`;
    
    const existingIndex = operationQueue.findIndex(op => {
        const existingRecordId = op.payload.record ? op.payload.record[op.payload.idField] : op.payload.recordId;
        return `${op.payload.sheetName}-${existingRecordId}` === opKey;
    });

    if (existingIndex > -1) {
        const existingOp = operationQueue[existingIndex];
        if (operation.type === 'delete') {
            // Replace any previous upsert/delete with this delete
            operationQueue[existingIndex] = operation;
        } else if (operation.type === 'upsert') {
            if (existingOp.type === 'upsert') {
                // Merge records (delta syncing)
                operationQueue[existingIndex].payload.record = {
                    ...existingOp.payload.record,
                    ...operation.payload.record
                };
            } else {
                // If it was deleted then upserted, just replace with upsert
                operationQueue[existingIndex] = operation;
            }
        }
    } else {
        operationQueue.push(operation);
    }

    saveQueueToStorage();

    // Persist to Dexie IndexedDB syncQueue table & register with Service Worker Background Sync
    backgroundSyncManager.queueOperation({
        entity: operation.payload.sheetName || 'Unknown',
        type: operation.type === 'delete' ? 'delete' : 'upsert',
        record: operation.payload.record || { id: recordId },
        idField: operation.payload.idField || 'id',
        recordId: String(recordId)
    }).catch(err => {
        console.warn('⚠️ [BackgroundSyncManager] Notice queueing to background sync:', err);
    });

    callbacks.onSyncStatusChange('UNSAVED');
    callbacks.onSyncError('You are offline. Changes have been saved locally and will sync when you reconnect.');
};

const getCustomOrEnvBackendUrl = (): string => {
    return getBackendBaseUrl();
};

const API_BASE_URL = getCustomOrEnvBackendUrl();

const getBaseOrigin = (): string => {
    const backend = getCustomOrEnvBackendUrl();
    if (backend) return backend;
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return window.location.origin;
    }
    return '';
};

export let customProxyUrl: string | null = null;
const disabledProxyUrls = new Set<string>();
const disabledProxyOrigins = new Set<string>();

export const setCustomProxyUrl = (url: string | null) => {
    customProxyUrl = url;
};

export const getProxyUrl = (targetUrl?: string | null): string => {
    if (targetUrl) {
        if (targetUrl.startsWith('/')) {
            const backend = getCustomOrEnvBackendUrl();
            if (backend) return `${backend}${targetUrl}`;
        }
        return targetUrl;
    }
    if (customProxyUrl) return customProxyUrl;
    const backend = getCustomOrEnvBackendUrl();
    if (backend) {
        return `${backend}/api/proxy`;
    }
    return '/api/proxy';
};

export type DiagnosticStatus = 'SUCCESS' | 'NETWORK_DROP' | 'CORS_BLOCKED' | 'RESOURCE_404' | 'AUTH_ERROR' | 'OPAQUE_REACHABLE' | 'UNKNOWN_ERROR';

export interface FetchDiagnosticLog {
    id: string;
    timestamp: string;
    url: string;
    method: 'GET' | 'POST';
    action?: string;
    stage: 'proxy_post' | 'proxy_get' | 'direct_post' | 'direct_get' | 'no_cors_ping' | 'all_origins';
    status: DiagnosticStatus;
    httpCode?: number | string;
    durationMs: number;
    errorDetails?: string;
    isOpaque?: boolean;
}

let diagnosticLogs: FetchDiagnosticLog[] = [];
const MAX_DIAGNOSTIC_LOGS = 100;
type DiagnosticLogListener = (logs: FetchDiagnosticLog[], latestLog?: FetchDiagnosticLog) => void;
const diagnosticListeners: Set<DiagnosticLogListener> = new Set();

export const subscribeDiagnosticLogs = (listener: DiagnosticLogListener): (() => void) => {
    diagnosticListeners.add(listener);
    listener([...diagnosticLogs]);
    return () => {
        diagnosticListeners.delete(listener);
    };
};

export const getDiagnosticLogs = (): FetchDiagnosticLog[] => [...diagnosticLogs];

export const clearDiagnosticLogs = () => {
    diagnosticLogs = [];
    diagnosticListeners.forEach(l => l([]));
};

const recordDiagnosticLog = (log: Omit<FetchDiagnosticLog, 'id' | 'timestamp'>) => {
    const fullLog: FetchDiagnosticLog = {
        ...log,
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    diagnosticLogs = [fullLog, ...diagnosticLogs].slice(0, MAX_DIAGNOSTIC_LOGS);
    diagnosticListeners.forEach(l => l([...diagnosticLogs], fullLog));
};

const classifyFetchError = (err: any, httpCode?: number): { status: DiagnosticStatus; message: string } => {
    if (httpCode === 404) {
        return { status: 'RESOURCE_404', message: 'HTTP 404: Endpoint or Google Sheets Proxy resource not found.' };
    }
    if (httpCode === 401 || httpCode === 403) {
        return { status: 'AUTH_ERROR', message: 'HTTP 401/403: Authorization required or session expired.' };
    }
    
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { status: 'NETWORK_DROP', message: 'Network Drop: Device is currently offline.' };
    }

    if (err?.name === 'AbortError') {
        return { status: 'NETWORK_DROP', message: 'Network Drop / Timeout: Request timed out before receiving server response.' };
    }

    const errStr = String(err?.message || err || '');
    if (errStr.includes('Failed to fetch') || errStr.includes('NetworkError') || errStr.includes('CORS') || errStr.includes('Load failed')) {
        return { status: 'CORS_BLOCKED', message: 'TypeError: Failed to fetch (Browser CORS policy restricted response access or backend script unauthenticated).' };
    }

    return { status: 'UNKNOWN_ERROR', message: errStr || 'Unknown network error.' };
};

/**
 * Diagnostic or public ping using 'no-cors' mode.
 * In 'no-cors' mode, browser fetch resolves to an opaque response (status 0, type 'opaque').
 * If this resolves, the server is physically online and reachable over the network (distinguishing CORS blockage from a total network drop).
 */
export const pingBackendWithNoCors = async (targetUrl: string, timeoutMs: number = 8000): Promise<{ reachable: boolean; isOpaque: boolean; durationMs: number; error?: string }> => {
    const startTime = performance.now();
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(targetUrl, {
            method: 'GET',
            mode: 'no-cors',
            signal: controller.signal,
            cache: 'no-store'
        });
        clearTimeout(timer);
        const durationMs = Math.round(performance.now() - startTime);

        const isOpaque = res.type === 'opaque' || res.status === 0;
        recordDiagnosticLog({
            url: targetUrl,
            method: 'GET',
            stage: 'no_cors_ping',
            status: isOpaque ? 'OPAQUE_REACHABLE' : 'SUCCESS',
            httpCode: res.status || 0,
            durationMs,
            isOpaque,
            errorDetails: isOpaque ? 'Backend endpoint is reachable on network via no-cors probe (Opaque response).' : 'Direct response received.'
        });

        return { reachable: true, isOpaque, durationMs };
    } catch (err: any) {
        const durationMs = Math.round(performance.now() - startTime);
        const classification = classifyFetchError(err);
        recordDiagnosticLog({
            url: targetUrl,
            method: 'GET',
            stage: 'no_cors_ping',
            status: classification.status,
            durationMs,
            errorDetails: `no-cors probe failed: ${err.message || classification.message}`
        });
        return { reachable: false, isOpaque: false, durationMs, error: err.message || classification.message };
    }
};

export interface FullDiagnosticReport {
    timestamp: string;
    proxyPost: { ok: boolean; status: number | string; durationMs: number; error?: string };
    proxyGet: { ok: boolean; status: number | string; durationMs: number; error?: string };
    directCors: { ok: boolean; status: number | string; durationMs: number; error?: string };
    noCorsPing: { reachable: boolean; isOpaque: boolean; durationMs: number; error?: string };
    overallStatus: 'HEALTHY' | 'CORS_ISSUES' | 'NETWORK_OFFLINE' | 'RESOURCE_404' | 'AUTH_FAILED';
    summary: string;
    recommendation: string;
}

export const runFullDiagnostics = async (targetSheetsUrl: string, proxyUrlOverride?: string | null): Promise<FullDiagnosticReport> => {
    const resolvedProxy = getProxyUrl(proxyUrlOverride);
    const timestamp = new Date().toLocaleTimeString();

    // Test 1: Proxy POST
    let proxyPost = { ok: false, status: 'Failed' as number | string, durationMs: 0, error: undefined as string | undefined };
    const t1 = performance.now();
    try {
        const res = await fetch(resolvedProxy, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetsUrl: targetSheetsUrl, payload: { action: 'ping' } })
        });
        proxyPost.durationMs = Math.round(performance.now() - t1);
        proxyPost.status = res.status;
        if (res.ok) {
            proxyPost.ok = true;
        } else {
            proxyPost.error = `HTTP ${res.status}: ${res.statusText}`;
        }
    } catch (err: any) {
        proxyPost.durationMs = Math.round(performance.now() - t1);
        proxyPost.error = err.message || 'Fetch failed';
    }

    // Test 2: Proxy GET
    let proxyGet = { ok: false, status: 'Failed' as number | string, durationMs: 0, error: undefined as string | undefined };
    const t2 = performance.now();
    try {
        const getUrl = new URL(resolvedProxy, getBaseOrigin());
        getUrl.searchParams.set('sheetsUrl', targetSheetsUrl);
        getUrl.searchParams.set('action', 'ping');
        const res = await fetch(getUrl.toString(), { method: 'GET' });
        proxyGet.durationMs = Math.round(performance.now() - t2);
        proxyGet.status = res.status;
        if (res.ok) proxyGet.ok = true;
        else proxyGet.error = `HTTP ${res.status}`;
    } catch (err: any) {
        proxyGet.durationMs = Math.round(performance.now() - t2);
        proxyGet.error = err.message || 'Fetch failed';
    }

    // Test 3: Direct CORS
    let directCors = { ok: false, status: 'Failed' as number | string, durationMs: 0, error: undefined as string | undefined };
    const t3 = performance.now();
    try {
        const res = await fetch(`${targetSheetsUrl}${targetSheetsUrl.includes('?') ? '&' : '?'}action=ping`, { method: 'GET', mode: 'cors' });
        directCors.durationMs = Math.round(performance.now() - t3);
        directCors.status = res.status;
        if (res.ok) directCors.ok = true;
        else directCors.error = `HTTP ${res.status}`;
    } catch (err: any) {
        directCors.durationMs = Math.round(performance.now() - t3);
        directCors.error = err.message || 'TypeError: Failed to fetch (CORS Blockage)';
    }

    // Test 4: no-cors Probe
    const noCorsPing = await pingBackendWithNoCors(targetSheetsUrl);

    // Evaluate Overall Diagnostics
    let overallStatus: FullDiagnosticReport['overallStatus'] = 'HEALTHY';
    let summary = '';
    let recommendation = '';

    if (!navigator.onLine) {
        overallStatus = 'NETWORK_OFFLINE';
        summary = 'Device is currently offline. No fetch requests can reach external servers.';
        recommendation = 'Check internet connection and reconnect to the network.';
    } else if (proxyPost.ok || proxyGet.ok) {
        overallStatus = 'HEALTHY';
        summary = 'Google Sheets Proxy relay is fully functional and responding normally.';
        recommendation = 'All cloud sync operations are operating normally via proxy relay.';
    } else if (noCorsPing.reachable && !directCors.ok) {
        overallStatus = 'CORS_ISSUES';
        summary = 'Google Sheets backend endpoint is online and reachable over the network (verified via no-cors probe), but direct CORS responses are restricted by browser security policies.';
        recommendation = 'Verify Google Apps Script deployment permissions ("Anyone" execution) or ensure backend proxy relay route is active.';
    } else if (proxyPost.status === 404 || proxyGet.status === 404) {
        overallStatus = 'RESOURCE_404';
        summary = 'Server proxy endpoint returned HTTP 404 Not Found.';
        recommendation = 'Check backend server routes or Google Sheets Apps Script Web App URL configuration.';
    } else {
        overallStatus = 'AUTH_FAILED';
        summary = 'Fetch request failed to authenticate or connect with Google Sheets backend.';
        recommendation = 'Refresh your session, clear local cache, or re-authenticate with your backend Google account.';
    }

    return {
        timestamp,
        proxyPost,
        proxyGet,
        directCors,
        noCorsPing,
        overallStatus,
        summary,
        recommendation
    };
};

interface ProxyFetchOptions {
    proxyUrl?: string | null;
    method?: 'GET' | 'POST';
    action?: string;
    sheets?: string;
    payload?: any;
    since?: string;
    timeoutMs?: number;
}

export const fetchWithProxyFallback = async (targetUrl: string, options: ProxyFetchOptions = {}): Promise<any> => {
    const actionName = options.action || options.payload?.action || '';
    const isWriteAction = actionName === 'upsertRecord' || actionName === 'deleteRecord' || actionName === 'saveRecord' || actionName === 'uploadFile';
    const defaultMethod = isWriteAction ? 'POST' : 'GET';
    const effectiveTimeoutMs = options.timeoutMs ?? ((options.action === 'loadAllData' || options.payload?.action === 'loadAllData') ? 65000 : 15000);
    const { proxyUrl, method = defaultMethod, action, sheets, payload, since, timeoutMs = effectiveTimeoutMs } = options;

    const resolvedProxy = getProxyUrl(proxyUrl);
    const isNetlify = typeof window !== 'undefined' && window.location?.hostname?.includes('netlify.app');
    const candidateProxies = Array.from(new Set([
        resolvedProxy,
        getProxyUrl('/api/google-sheets-proxy'),
        ...(isNetlify ? [getProxyUrl('/.netlify/functions/google-sheets-proxy')] : [])
    ])).filter(p => {
        if (!p) return false;
        if (disabledProxyUrls.has(p)) return false;
        try {
            const origin = new URL(p, getBaseOrigin()).origin;
            if (disabledProxyOrigins.has(origin)) return false;
        } catch (e) {}
        return true;
    });

    const isSuccessData = (d: any) => {
        if (!d || typeof d !== 'object') return false;
        if (d.status === 'error' || d.error) return false;
        if (d.message && String(d.message).toLowerCase().includes('invalid')) return false;
        return d.status === 'success' || d.status === 'ok' || d.success === true || d.data !== undefined || Array.isArray(d.records) || Array.isArray(d.InventoryItems);
    };

    let lastProxyJson: any = null;

    // 1. Try server proxy POST relay first across available candidate proxy endpoints
    for (const currentProxy of candidateProxies) {
        const tStart1 = performance.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const proxyPayload = {
                sheetsUrl: targetUrl,
                payload: {
                    ...(action ? { action } : {}),
                    ...(sheets ? { sheets } : {}),
                    ...(since ? { since } : {}),
                    ...(payload || {})
                }
            };

            const proxyResponse = await fetch(currentProxy, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proxyPayload),
                signal: controller.signal
            });
            clearTimeout(timer);
            const dur1 = Math.round(performance.now() - tStart1);

            // Only permanently blacklist proxy on 404 (endpoint nonexistent); do not blacklist on transient 502/504 upstream gateway timeouts
            if (proxyResponse.status === 404) {
                disabledProxyUrls.add(currentProxy);
                try {
                    const origin = new URL(currentProxy, getBaseOrigin()).origin;
                    disabledProxyOrigins.add(origin);
                } catch (e) {}
                break;
            }

            if (proxyResponse.ok) {
                const text = await proxyResponse.text();
                if (text && text.trim().startsWith('{')) {
                    const data = JSON.parse(text);
                    if (isSuccessData(data)) {
                        recordDiagnosticLog({
                            url: currentProxy,
                            method: 'POST',
                            action,
                            stage: 'proxy_post',
                            status: 'SUCCESS',
                            httpCode: proxyResponse.status,
                            durationMs: dur1
                        });
                        return data;
                    } else {
                        if (!lastProxyJson) lastProxyJson = data;
                    }
                }
            }

            const classification = classifyFetchError(null, proxyResponse.status);
            recordDiagnosticLog({
                url: currentProxy,
                method: 'POST',
                action,
                stage: 'proxy_post',
                status: classification.status,
                httpCode: proxyResponse.status,
                durationMs: dur1,
                errorDetails: classification.message
            });
        } catch (proxyErr: any) {
            disabledProxyUrls.add(currentProxy);
            try {
                const origin = new URL(currentProxy, getBaseOrigin()).origin;
                disabledProxyOrigins.add(origin);
            } catch (e) {}
            const dur1 = Math.round(performance.now() - tStart1);
            const classification = classifyFetchError(proxyErr);
            recordDiagnosticLog({
                url: currentProxy,
                method: 'POST',
                action,
                stage: 'proxy_post',
                status: classification.status,
                durationMs: dur1,
                errorDetails: `Proxy POST failed: ${proxyErr.message || classification.message}`
            });
            break;
        }
    }

    // 2. Try server proxy GET relay fallback (ONLY for read operations) across candidate proxy endpoints
    if (!isWriteAction) {
        for (const currentProxy of candidateProxies) {
            if (disabledProxyUrls.has(currentProxy)) continue;
            try {
                const origin = new URL(currentProxy, getBaseOrigin()).origin;
                if (disabledProxyOrigins.has(origin)) continue;
            } catch (e) {}
            const tStart2 = performance.now();
            try {
                const proxyUrlObj = new URL(currentProxy, getBaseOrigin());
                proxyUrlObj.searchParams.set('sheetsUrl', targetUrl);
                if (action) proxyUrlObj.searchParams.set('action', action);
                if (sheets) proxyUrlObj.searchParams.set('sheets', sheets);
                if (since) proxyUrlObj.searchParams.set('since', since);

                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);

                const proxyGetRes = await fetch(proxyUrlObj.toString(), {
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(timer);
                const dur2 = Math.round(performance.now() - tStart2);

                if (proxyGetRes.status === 404 || proxyGetRes.status === 502) {
                    disabledProxyUrls.add(currentProxy);
                    try {
                        const origin = new URL(currentProxy, getBaseOrigin()).origin;
                        disabledProxyOrigins.add(origin);
                    } catch (e) {}
                    break;
                }

                if (proxyGetRes.ok) {
                    const text = await proxyGetRes.text();
                    if (text && text.trim().startsWith('{')) {
                        const data = JSON.parse(text);
                        if (isSuccessData(data)) {
                            recordDiagnosticLog({
                                url: proxyUrlObj.toString(),
                                method: 'GET',
                                action,
                                stage: 'proxy_get',
                                status: 'SUCCESS',
                                httpCode: proxyGetRes.status,
                                durationMs: dur2
                            });
                            return data;
                        } else {
                            if (!lastProxyJson) lastProxyJson = data;
                        }
                    }
                }

                const classification = classifyFetchError(null, proxyGetRes.status);
                recordDiagnosticLog({
                    url: proxyUrlObj.toString(),
                    method: 'GET',
                    action,
                    stage: 'proxy_get',
                    status: classification.status,
                    httpCode: proxyGetRes.status,
                    durationMs: dur2,
                    errorDetails: classification.message
                });
            } catch (proxyGetErr: any) {
                disabledProxyUrls.add(currentProxy);
                try {
                    const origin = new URL(currentProxy, getBaseOrigin()).origin;
                    disabledProxyOrigins.add(origin);
                } catch (e) {}
                const dur2 = Math.round(performance.now() - tStart2);
                const classification = classifyFetchError(proxyGetErr);
                recordDiagnosticLog({
                    url: currentProxy,
                    method: 'GET',
                    action,
                    stage: 'proxy_get',
                    status: classification.status,
                    durationMs: dur2,
                    errorDetails: `Proxy GET failed: ${proxyGetErr.message || classification.message}`
                });
                break;
            }
        }
    }

    // If candidate proxies received valid JSON from the backend (even if status is error or custom), return it directly to avoid failing over to un-proxied browser CORS
    if (lastProxyJson) {
        return lastProxyJson;
    }

    // 3. Direct fetch to Google Apps Script targetUrl
    // Direct POST attempt (for write actions or if method is POST)
    if (method === 'POST' || isWriteAction) {
        const tStartPost = performance.now();
        try {
            const postBody = JSON.stringify({
                ...(action ? { action } : {}),
                ...(sheets ? { sheets } : {}),
                ...(since ? { since } : {}),
                ...(payload || {})
            });

            const directRes = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: postBody,
                redirect: 'follow'
            });

            const durPost = Math.round(performance.now() - tStartPost);
            if (directRes.ok) {
                const text = await directRes.text();
                if (text && text.trim().startsWith('{')) {
                    recordDiagnosticLog({
                        url: targetUrl,
                        method: 'POST',
                        action,
                        stage: 'direct_post',
                        status: 'SUCCESS',
                        httpCode: directRes.status,
                        durationMs: durPost
                    });
                    return JSON.parse(text);
                }
            }
        } catch (postErr: any) {
            const durPost = Math.round(performance.now() - tStartPost);
            const classification = classifyFetchError(postErr);
            recordDiagnosticLog({
                url: targetUrl,
                method: 'POST',
                action,
                stage: 'direct_post',
                status: classification.status,
                durationMs: durPost,
                errorDetails: `Direct POST failed: ${postErr.message || classification.message}`
            });
        }
    }

    // Direct GET attempt (for read actions / fallback)
    if (!isWriteAction) {
        const tStartGet = performance.now();
        try {
            const urlObj = new URL(targetUrl);
            if (action) urlObj.searchParams.set('action', action);
            if (sheets) urlObj.searchParams.set('sheets', sheets);
            if (since) urlObj.searchParams.set('since', since);
            if (payload) {
                for (const [k, v] of Object.entries(payload)) {
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                        urlObj.searchParams.set(k, String(v));
                    }
                }
            }

            const directGetRes = await fetch(urlObj.toString(), {
                method: 'GET',
                mode: 'cors',
                redirect: 'follow'
            });

            const durGet = Math.round(performance.now() - tStartGet);
            if (directGetRes.ok) {
                const text = await directGetRes.text();
                if (text && text.trim().startsWith('{')) {
                    recordDiagnosticLog({
                        url: urlObj.toString(),
                        method: 'GET',
                        action,
                        stage: 'direct_get',
                        status: 'SUCCESS',
                        httpCode: directGetRes.status,
                        durationMs: durGet
                    });
                    return JSON.parse(text);
                }
            }
        } catch (getErr: any) {
            const durGet = Math.round(performance.now() - tStartGet);
            const classification = classifyFetchError(getErr);
            recordDiagnosticLog({
                url: targetUrl,
                method: 'GET',
                action,
                stage: 'direct_get',
                status: classification.status,
                durationMs: durGet,
                errorDetails: `Direct GET failed: ${getErr.message || classification.message}`
            });
        }
    }

    // 4. Diagnostic Probe: test 'no-cors' mode to distinguish Network Drop vs. Endpoint status
    const probe = await pingBackendWithNoCors(targetUrl);

    // 5. Fallback via public CORS proxy wrapper (ONLY for read operations)
    if (!isWriteAction) {
        const tStart5 = performance.now();
        try {
            const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl + (action ? `?action=${action}` : ''))}`;
            const corsRes = await fetch(corsProxyUrl, { method: 'GET' });
            const dur5 = Math.round(performance.now() - tStart5);

            if (corsRes.ok) {
                const text = await corsRes.text();
                if (text && text.trim().startsWith('{')) {
                    const data = JSON.parse(text);
                    if (data.status === 'success' || data.data) {
                        recordDiagnosticLog({
                            url: corsProxyUrl,
                            method: 'GET',
                            action,
                            stage: 'all_origins',
                            status: 'SUCCESS',
                            httpCode: corsRes.status,
                            durationMs: dur5
                        });
                        return data;
                    }
                }
            }
        } catch (allOriginsErr: any) {
            const dur5 = Math.round(performance.now() - tStart5);
            recordDiagnosticLog({
                url: targetUrl,
                method: 'GET',
                action,
                stage: 'all_origins',
                status: 'CORS_BLOCKED',
                durationMs: dur5,
                errorDetails: `AllOrigins fallback failed: ${allOriginsErr.message}`
            });
        }
    }

    // Determine clean, non-confusing failure reason
    let failureReason = '';
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        failureReason = 'Network Drop: Device is offline. Local changes saved offline.';
    } else if (probe.reachable) {
        failureReason = 'Google Sheets backend endpoint reached, but returned an invalid or empty response. Operating with local offline storage.';
    } else {
        failureReason = 'Unable to reach Google Sheets backend via Proxy or Direct connection. Operating with local offline storage.';
    }

    // Trigger sync error notification callback if initialized
    if (callbacks && callbacks.onSyncError) {
        callbacks.onSyncError(failureReason);
    }

    throw new Error(failureReason);
};

const processQueue = async (sheetsUrl: string, proxyUrl?: string | null) => {
    if (isProcessingQueue || !navigator.onLine || operationQueue.length === 0) {
        return;
    }
    if (!sheetsUrl || !sheetsUrl.startsWith('http')) {
        console.warn("[Cloud Sync] processQueue skipped: invalid or missing Google Sheets URL");
        return;
    }
    isProcessingQueue = true;
    callbacks.onSyncStatusChange('SYNCING');
    callbacks.onSyncError(null);

    while (operationQueue.length > 0) {
        const operation = operationQueue[0];
        try {
            await executeOperation(operation, sheetsUrl, proxyUrl);
            operationQueue.shift();
            saveQueueToStorage();
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : "Sync error";
            console.warn("[Cloud Sync] Queued operation sync paused due to cloud endpoint error:", errorMessage);
            callbacks.onSyncStatusChange('ERROR');
            callbacks.onSyncError(`Sync paused: ${errorMessage}`);
            isProcessingQueue = false;
            return;
        }
    }

    callbacks.onSyncStatusChange('SYNCED');
    callbacks.onSyncError(null);
    isProcessingQueue = false;
};

const executeOperation = async (operation: any, sheetsUrl: string, proxyUrl?: string | null) => {
    console.log("[DEBUG] cloudDataService: executeOperation started for operation type:", operation.type);
    if (!sheetsUrl || !sheetsUrl.startsWith('http')) {
        throw new Error("Google Sheets URL is not configured or invalid.");
    }

    const opAction = operation.type === 'delete' ? 'deleteRecord' : 'upsertRecord';
    const gasPayload = {
        action: opAction,
        ...operation.payload
    };

    try {
        const result = await fetchWithProxyFallback(sheetsUrl, {
            proxyUrl,
            method: 'POST',
            action: opAction,
            payload: gasPayload
        });
        if (result && (result.status === 'success' || result.status === 'ok' || result.success === true)) {
            if (operation.type === 'upsert' && operation.payload?.sheetName && operation.payload?.record) {
                const recordId = operation.payload.record[operation.payload.idField];
                markRecordSynced(operation.payload.sheetName, recordId, operation.payload.record);
                if (operation.payload.sheetName === 'AuditLogs') {
                    markAuditLogSynced(recordId, operation.payload.record.timestamp);
                }
            }
            return result;
        }
        throw new Error(result?.message || 'Script error during operation execution');
    } catch (e: any) {
        console.warn("ℹ️ [Cloud Sync] Deferred operation to local offline storage/queue:", e.message || e);
        throw e;
    }
};

export const init = (appCallbacks: { onSyncStatusChange: (s: SyncStatus) => void, onSyncError: (e: string | null) => void, onProgressChange: (p: number | null, stage?: string | null, entity?: string | null) => void }, sheetsUrl: string, proxyUrl?: string | null) => {
    callbacks = appCallbacks;
    if (proxyUrl) setCustomProxyUrl(proxyUrl);
    loadQueueFromStorage();

    if (isNeonSoleSourceMode()) {
        callbacks.onSyncStatusChange('SYNCED');
        callbacks.onSyncError(null);
        console.log('🐘 [cloudDataService] Operating in Pure Neon PostgreSQL & Cloudflare Workers SSOT Mode. Google Sheets background sync bypassed.');
        return;
    }

    // Initialize Background Sync Manager
    backgroundSyncManager.init({
        sheetsUrl,
        proxyUrl,
        onSyncStatusChange: callbacks.onSyncStatusChange,
        onSyncError: callbacks.onSyncError
    }).catch(err => {
        console.warn('⚠️ [BackgroundSyncManager] Init notice:', err);
    });

    window.addEventListener('online', () => {
        processQueue(sheetsUrl, proxyUrl);
        backgroundSyncManager.triggerSync('WINDOW_ONLINE');
    });

    if (navigator.onLine) {
        processQueue(sheetsUrl, proxyUrl);
    }
};

/**
 * Processes any pending offline operations in the queue.
 */
export const processPendingQueue = async (sheetsUrl?: string, proxyUrl?: string | null): Promise<void> => {
    const targetUrl = sheetsUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('googleSheetsUrl') : null) || '';
    if (targetUrl) {
        await processQueue(targetUrl, proxyUrl);
    }
    await backgroundSyncManager.triggerSync('MANUAL_PROCESS_QUEUE');
};

/**
 * Returns current offline sync queue operations.
 */
export const getOfflineQueue = (): any[] => {
    loadQueueFromStorage();
    return [...operationQueue];
};

/**
 * Deletes a specific item from the offline sync queue.
 */
export const deleteOfflineQueueItem = (index: number): void => {
    loadQueueFromStorage();
    if (index >= 0 && index < operationQueue.length) {
        const item = operationQueue[index];
        const recordId = item?.payload?.record ? item.payload.record[item.payload.idField] : item?.payload?.recordId;
        const opId = `${item?.payload?.sheetName}_${recordId}_${item?.type === 'delete' ? 'delete' : 'upsert'}`;
        
        operationQueue.splice(index, 1);
        saveQueueToStorage();

        deleteSyncQueueItem(opId).catch(() => {});

        if (operationQueue.length === 0) {
            callbacks.onSyncStatusChange('SYNCED');
            callbacks.onSyncError(null);
        } else {
            callbacks.onSyncStatusChange('UNSAVED');
        }
    }
};

/**
 * Clears all items from the offline sync queue.
 */
export const clearOfflineQueue = (): void => {
    operationQueue = [];
    saveQueueToStorage();
    clearIdbSyncQueue().catch(() => {});
    callbacks.onSyncStatusChange('SYNCED');
    callbacks.onSyncError(null);
};

/**
 * Updates payload of an offline sync queue item.
 */
export const updateOfflineQueueItemPayload = (index: number, updatedPayload: any): void => {
    loadQueueFromStorage();
    if (index >= 0 && index < operationQueue.length) {
        operationQueue[index] = {
            ...operationQueue[index],
            payload: updatedPayload,
            updatedAt: Date.now()
        };
        saveQueueToStorage();
    }
};

/**
 * Retries a single item in the offline sync queue against the cloud backend.
 */
export const retryOfflineQueueItem = async (index: number, sheetsUrl: string, proxyUrl?: string | null): Promise<{ success: boolean; error?: string }> => {
    loadQueueFromStorage();
    if (index < 0 || index >= operationQueue.length) {
        return { success: false, error: 'Item not found in queue' };
    }

    const item = operationQueue[index];
    try {
        await executeOperation(item, sheetsUrl, proxyUrl);
        operationQueue.splice(index, 1);
        saveQueueToStorage();
        if (operationQueue.length === 0) {
            callbacks.onSyncStatusChange('SYNCED');
            callbacks.onSyncError(null);
        }
        return { success: true };
    } catch (err: any) {
        const errorMsg = err?.message || 'Failed to sync item';
        operationQueue[index] = {
            ...item,
            retryCount: (item.retryCount || 0) + 1,
            lastError: errorMsg,
            lastAttemptedAt: Date.now()
        };
        saveQueueToStorage();
        callbacks.onSyncStatusChange('ERROR');
        callbacks.onSyncError(`Sync error on queue item #${index + 1}: ${errorMsg}`);
        return { success: false, error: errorMsg };
    }
};

/**
 * Sequentially retries all pending/failed items in the offline sync queue.
 */
export const retryAllOfflineQueue = async (sheetsUrl: string, proxyUrl?: string | null): Promise<{ total: number; succeeded: number; failed: number; errors: string[] }> => {
    loadQueueFromStorage();
    const initialQueueLength = operationQueue.length;
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    let currentIndex = 0;
    while (currentIndex < operationQueue.length) {
        const item = operationQueue[currentIndex];
        try {
            await executeOperation(item, sheetsUrl, proxyUrl);
            operationQueue.splice(currentIndex, 1);
            saveQueueToStorage();
            succeeded++;
        } catch (err: any) {
            const errorMsg = err?.message || 'Sync failed';
            operationQueue[currentIndex] = {
                ...item,
                retryCount: (item.retryCount || 0) + 1,
                lastError: errorMsg,
                lastAttemptedAt: Date.now()
            };
            saveQueueToStorage();
            failed++;
            errors.push(`${item.payload?.sheetName || 'Record'}: ${errorMsg}`);
            callbacks.onSyncStatusChange('ERROR');
            callbacks.onSyncError(`Sync halted on item: ${errorMsg}`);
            currentIndex++;
        }
    }

    if (operationQueue.length === 0) {
        callbacks.onSyncStatusChange('SYNCED');
        callbacks.onSyncError(null);
    }

    return { total: initialQueueLength, succeeded, failed, errors };
};

export const getLocalStorageKey = (sheetName: string): string => {
    switch (sheetName) {
        case 'Users': return 'service_app_users';
        case 'Submissions': return 'service_app_submissions';
        case 'SubscriptionPlans': return 'service_app_subscription_plans';
        case 'UserSubscriptions': return 'service_app_user_subscriptions';
        case 'ServiceTemplates': return 'service_app_service_templates';
        case 'ServiceRequests': return 'service_app_service_requests';
        case 'Notifications': return 'service_app_notifications';
        case 'LocationHistory': return 'service_app_location_history';
        case 'MiscSpends': return 'service_app_misc_spends';
        case 'Bookkeeping': return 'service_app_bookkeeping';
        case 'ProfitLoss': return 'service_app_profit_loss';
        case 'SpendCategories': return 'service_app_spend_categories';
        case 'PredefinedCosts': return 'service_app_predefined_costs';
        case 'VehicleData': return 'service_app_vehicle_data';
        case 'TyreData': return 'service_app_tyre_data';
        case 'PricingConfig': return 'service_app_pricing_config';
        case 'PredefinedServiceCategories': return 'service_app_predefined_service_categories';
        case 'PredefinedServices': return 'service_app_predefined_services';
        case 'DeliveryHubs': return 'service_app_delivery_hubs';
        case 'ProductRules': return 'service_app_product_rules';
        case 'Customers': return 'service_app_customers';
        case 'InventoryItems': return 'service_app_inventory_items';
        case 'InventoryMovements': return 'service_app_inventory_movements';
        case 'Expenses': return 'service_app_expenses';
        case 'RecurringExpenses': return 'service_app_recurring_expenses';
        case 'AuditLogs': return 'service_app_audit_logs';
        case 'Warranties': return 'service_app_warranties';
        case 'RetentionLogs': return 'service_app_retention_logs';
        default: return '';
    }
};

const MEDIA_KEYS = [
    'beforeWashingPhoto',
    'beforeVideoInventory',
    'beforeVideoTopBody',
    'beforeVideoUnderchassis',
    'afterWashingPhoto',
    'afterVideoInterior',
    'afterVideoExterior',
    'afterVideoUnderchassis',
    'receiptPhotoUrl',
    'dotSerialNumberImage'
];

const stripMediaForStorage = (data: any): any => {
    if (!data) return data;
    if (Array.isArray(data)) return data.map(item => stripMediaForStorage(item));
    if (typeof data === 'object') {
        const cleaned = { ...data };
        for (const key in cleaned) {
            if (MEDIA_KEYS.includes(key) && typeof cleaned[key] === 'string' && cleaned[key].startsWith('data:')) {
                cleaned[key] = "(image removed to save space)";
            } else if (key === 'tyreDetails' && Array.isArray(cleaned[key])) {
                cleaned[key] = cleaned[key].map((t: any) => ({
                    ...t,
                    dotSerialNumberImage: (t.dotSerialNumberImage?.startsWith('data:')) ? "(image removed)" : t.dotSerialNumberImage
                }));
            } else if (typeof cleaned[key] === 'object') {
                cleaned[key] = stripMediaForStorage(cleaned[key]);
            }
        }
        return cleaned;
    }
    return data;
};

const getApproxByteSize = (obj: any): number => {
    try {
        const str = JSON.stringify(obj);
        // JS strings are UTF-16, so 2 bytes per char
        return str.length * 2;
    } catch (e) {
        return 0;
    }
};

export const safeLocalStorageGet = <T>(key: string): T | null => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        return null;
    }
};

export const safeLocalStorageSet = (key: string, value: any, options: { stripMedia?: boolean } = {}) => {
    try {
        let dataToSave = options.stripMedia ? stripMediaForStorage(value) : value;
        
        if (key === 'service_app_submissions') {
            dataToSave = stripMediaForStorage(value);
        }

        // Apply generous local limits to keep database clean, but since IndexedDB has no 5MB limit, we can keep much more history!
        if (Array.isArray(dataToSave)) {
            if (key === 'service_app_location_history' && dataToSave.length > 1000) {
                dataToSave = dataToSave.slice(-1000);
            } else if (key === 'service_app_audit_logs' && dataToSave.length > 1000) {
                dataToSave = dataToSave.slice(-1000);
            } else if (key === 'service_app_inventory_movements' && dataToSave.length > 1000) {
                dataToSave = dataToSave.slice(-1000);
            } else if (key === 'service_app_notifications' && dataToSave.length > 150) {
                const sorted = [...dataToSave].sort((a, b) => {
                    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                    return tB - tA; // latest first
                });
                dataToSave = sorted.slice(0, 150);
            } else if (key === 'service_app_submissions' && dataToSave.length > 1000) {
                const sorted = [...dataToSave].sort((a, b) => {
                    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                    return tB - tA; // latest first
                });
                dataToSave = sorted.slice(0, 1000);
            }
        }

        // Save to IndexedDB asynchronously (fire-and-forget, but robust)
        setIndexedDbItem(key, dataToSave).catch(err => {
            console.error(`❌ [IndexedDB] Failed to save key "${key}":`, err);
        });
    } catch (e) {
        console.error(`❌ [IndexedDB] Critical outer error in safeLocalStorageSet for key "${key}":`, e);
    }
};

export const saveRecordToLocalStorage = async (sheetName: string, record: any) => {
    const localKey = getLocalStorageKey(sheetName);
    if (!localKey) return;
    try {
        const idField = getIdField(sheetName);
        const nowIso = new Date().toISOString();
        if (!record.last_modified) {
            record.last_modified = nowIso;
        }
        
        // Singletons
        if (sheetName === 'VehicleData' || sheetName === 'TyreData' || sheetName === 'PricingConfig') {
            await setIndexedDbItem(localKey, record);
            return;
        }

        let items = await getIndexedDbItem<any[]>(localKey, []);
        if (!Array.isArray(items)) {
            items = [];
        }

        const idx = items.findIndex((item: any) => String(item[idField]) === String(record[idField]));
        if (idx > -1) {
            items[idx] = { ...items[idx], ...record, last_modified: record.last_modified || nowIso };
        } else {
            items.push(record);
        }
        await setIndexedDbItem(localKey, items);
        console.log(`📦 [IndexedDB] Saved/updated ${sheetName} record locally.`);
    } catch (e) {
        console.error(`❌ [IndexedDB] Failed to save ${sheetName} record to IndexedDB:`, e);
    }
};

export const deleteRecordFromLocalStorage = async (sheetName: string, recordId: string) => {
    const localKey = getLocalStorageKey(sheetName);
    if (!localKey) return;
    try {
        const idField = getIdField(sheetName);
        let items = await getIndexedDbItem<any[]>(localKey, []);
        if (Array.isArray(items)) {
            items = items.filter((item: any) => String(item[idField]) !== String(recordId));
            await setIndexedDbItem(localKey, items);
            console.log(`📦 [IndexedDB] Deleted ${sheetName} record locally.`);
        }
    } catch (e) {
        console.error(`❌ [IndexedDB] Failed to delete ${sheetName} record from IndexedDB:`, e);
    }
};

export const saveAppDataToLocalStorage = (appData: AppData) => {
    try {
        safeLocalStorageSet('service_app_submissions', appData.submissions);
        safeLocalStorageSet('service_app_users', appData.users);
        safeLocalStorageSet('service_app_subscription_plans', appData.subscriptionPlans);
        safeLocalStorageSet('service_app_user_subscriptions', appData.userSubscriptions);
        safeLocalStorageSet('service_app_service_templates', appData.serviceTemplates);
        safeLocalStorageSet('service_app_service_requests', appData.serviceRequests);
        safeLocalStorageSet('service_app_notifications', appData.notifications);
        safeLocalStorageSet('service_app_location_history', appData.locationHistory);
        safeLocalStorageSet('service_app_misc_spends', appData.miscSpends);
        safeLocalStorageSet('service_app_bookkeeping', appData.bookkeeping);
        safeLocalStorageSet('service_app_profit_loss', appData.profitLoss);
        safeLocalStorageSet('service_app_spend_categories', appData.spendCategories);
        safeLocalStorageSet('service_app_predefined_costs', appData.predefinedCosts);
        safeLocalStorageSet('service_app_vehicle_data', appData.vehicleData);
        safeLocalStorageSet('service_app_tyre_data', appData.tyreData);
        safeLocalStorageSet('service_app_pricing_config', appData.pricingConfig);
        safeLocalStorageSet('service_app_predefined_service_categories', appData.predefinedServiceCategories);
        safeLocalStorageSet('service_app_predefined_services', appData.predefinedServices);
        safeLocalStorageSet('service_app_delivery_hubs', appData.deliveryHubs);
        safeLocalStorageSet('service_app_product_rules', appData.productRules);
        safeLocalStorageSet('service_app_customers', appData.customerBook);
        safeLocalStorageSet('service_app_inventory_items', appData.inventoryItems || []);
        safeLocalStorageSet('service_app_inventory_movements', appData.inventoryMovements || []);
        safeLocalStorageSet('service_app_expenses', appData.expenses || []);
        safeLocalStorageSet('service_app_recurring_expenses', appData.recurringExpenses || []);
        safeLocalStorageSet('service_app_audit_logs', appData.auditLogs || []);
        safeLocalStorageSet('service_app_warranties', appData.warranties || []);
        console.log("📦 [LocalStorage] Successfully cached all AppData locally.");
    } catch (e) {
        console.error("Failed to save full AppData to local storage:", e);
    }
};

export const saveRecord = async (sheetName: string, record: any, sheetsUrl?: string, proxyUrl?: string | null) => {

    // 🔒 Ensure singleton configs have ID
    if (
        (sheetName === 'VehicleData' ||
         sheetName === 'TyreData' ||
         sheetName === 'PricingConfig') &&
        !record.id
    ) {
        record.id = 'singleton';
    }

    const idField = getIdField(sheetName);

    // ❌ Hard validation (no silent failure)
    if (!record[idField]) {
        throw new Error(`Missing ID field "${idField}". Record: ${JSON.stringify(record)}`);
    }

    // 🕒 Ensure last_modified is tracked on every entity
    if (!record.last_modified) {
        record.last_modified = new Date().toISOString();
    }

    const recordId = String(record[idField]);

    // 1. Save to LocalStorage first as primary
    await saveRecordToLocalStorage(sheetName, record);

    // 2. Mirror Save to Neon PostgreSQL Database (Primary Cloud DB)
    try {
        if (sheetName === 'Submissions') {
            neonDataService.saveOrders(record).catch(err => console.warn('⚠️ [Neon] Order sync error:', err));
        } else if (sheetName === 'ServiceRequests') {
            neonDataService.saveLeads(record).catch(err => console.warn('⚠️ [Neon] Lead sync error:', err));
        } else if (sheetName === 'Users') {
            neonDataService.saveUsers(record).catch(err => console.warn('⚠️ [Neon] User sync error:', err));
        } else if (sheetName === 'Settings' || sheetName === 'AppSettings') {
            neonDataService.saveSettings(record).catch(err => console.warn('⚠️ [Neon] Settings sync error:', err));
        } else if (sheetName === 'Customers' || sheetName === 'CustomerBook') {
            neonDataService.saveCustomers(record).catch(err => console.warn('⚠️ [Neon] Customer sync error:', err));
        } else if (sheetName === 'InventoryItems') {
            neonDataService.saveInventoryItems(record).catch(err => console.warn('⚠️ [Neon] Inventory sync error:', err));
        } else if (sheetName === 'Expenses') {
            neonDataService.saveExpenses(record).catch(err => console.warn('⚠️ [Neon] Expense sync error:', err));
        } else if (sheetName === 'Warranties') {
            neonDataService.saveWarranties(record).catch(err => console.warn('⚠️ [Neon] Warranty sync error:', err));
        } else if (sheetName === 'Notifications') {
            neonDataService.saveNotifications(record).catch(err => console.warn('⚠️ [Neon] Notification sync error:', err));
        } else if (sheetName === 'AuditLogs') {
            neonDataService.saveAuditLogs(record).catch(err => console.warn('⚠️ [Neon] Audit log sync error:', err));
        } else if (sheetName === 'InventoryMovements') {
            neonDataService.saveInventoryMovements(record).catch(err => console.warn('⚠️ [Neon] Movement sync error:', err));
        } else if (sheetName === 'LocationHistory') {
            neonDataService.saveLocationHistory(record).catch(err => console.warn('⚠️ [Neon] Location sync error:', err));
        } else if (sheetName === 'CarDatabase') {
            neonDataService.saveCar(record).catch(err => console.warn('⚠️ [Neon] Car sync error:', err));
        } else {
            const collectionMapping: Record<string, string> = {
                'UserSubscriptions': 'user_subscriptions',
                'SubscriptionPlans': 'subscription_plans',
                'RecurringExpenses': 'recurring_expenses',
                'SpendCategories': 'spend_categories',
                'PredefinedCosts': 'predefined_costs',
                'MiscSpends': 'misc_spends',
                'Bookkeeping': 'bookkeeping',
                'ProfitLoss': 'profit_loss',
                'BusinessOverheads': 'business_overheads',
                'PredefinedServices': 'predefined_services',
                'PredefinedServiceCategories': 'predefined_service_categories',
                'ServiceTemplates': 'service_templates',
                'PredefinedAddons': 'predefined_addons',
                'PricingConfig': 'pricing_config',
                'DeliveryHubs': 'delivery_hubs',
                'ProductRules': 'product_rules',
                'VehicleData': 'vehicle_data',
                'TyreData': 'tyre_data',
                'RetentionLogs': 'retention_logs'
            };
            const targetCol = collectionMapping[sheetName];
            if (targetCol) {
                // Fetch existing collection or sync updated item
                getIndexedDbItem<any[]>(`service_app_${targetCol}`, []).then(items => {
                    if (Array.isArray(items) && items.length > 0) {
                        neonDataService.saveCollection(targetCol, items).catch(err => console.warn(`⚠️ [Neon] Collection ${targetCol} sync error:`, err));
                    }
                }).catch(() => {});
            }
        }
    } catch (neonSyncErr) {
        console.warn("⚠️ [Neon] Mirror save skipped/failed:", neonSyncErr);
    }

    // 3. Mirror Save to Firestore Cache (non-blocking)
    saveRecordToFirestore(sheetName, record, idField).catch(err => {
        console.warn("⚠️ [cloudDataService] Firestore mirror save skipped/failed:", err);
    });

    // 3. Delta-Sync check: short-circuit if record content has not changed since last synced state
    if (sheetName === 'AuditLogs') {
        if (isAuditLogSynced(recordId) && !isRecordModified(sheetName, recordId, record)) {
            console.log(`⚡ [AuditLog-Sync] Short-circuited upload for AuditLog "${recordId}" (Already synced since last sync timestamp). Network payload saved.`);
            return { status: 'success', info: 'Audit log already synced, upload skipped' };
        }
    } else if (!isRecordModified(sheetName, recordId, record)) {
        console.log(`⚡ [Delta-Sync] Short-circuited upload for "${sheetName}:${recordId}" (Contents unchanged). Network payload saved.`);
        return { status: 'success', info: 'Contents unchanged, Google Sheets upload skipped' };
    }

    // Auto-mark AuditLog timestamp on scheduling
    if (sheetName === 'AuditLogs') {
        markAuditLogSynced(recordId, record.timestamp);
    }

    const operation = {
        type: 'upsert',
        payload: { sheetName, idField, record }
    };

    // If running in Pure Neon PostgreSQL & Cloudflare Workers SSOT Mode, skip Google Sheets completely!
    if (isNeonSoleSourceMode()) {
        console.log(`⚡ [Neon SSOT] Record saved directly to Neon DB (${sheetName}:${recordId}). Google Sheets sync bypassed.`);
        return { status: 'success', source: 'neon_sole_mode' };
    }

    // 3. Secondary Sync to Google Sheets (backgrounded/lazy)
    try {
        if (!navigator.onLine) {
            console.warn("⚠️ Offline mode — queueing operation");
            addToQueue(operation);
            return { status: 'success', queued: true };
        }

        console.log("🚀 EXECUTING OPERATION:", operation);

        if (sheetsUrl) {
            if (db) {
                // Run Google Sheets sync in background to make app ultra-fast!
                executeOperation(operation, sheetsUrl, proxyUrl)
                    .then(result => {
                        console.log("✅ [Google Sheets] Background sync success:", result);
                        processQueue(sheetsUrl, proxyUrl).catch(qErr => console.warn("Queue sync failed:", qErr));
                    })
                    .catch(err => {
                        console.warn("⚠️ [Google Sheets] Background sync failed, queueing:", err);
                        addToQueue(operation);
                    });
                return { status: 'success', info: 'Saved to LocalStorage, sync to Sheets in progress' };
            } else {
                try {
                    const result = await executeOperation(operation, sheetsUrl, proxyUrl);
                    console.log("✅ PRIMARY SAVE SUCCESS:", result);
                    processQueue(sheetsUrl, proxyUrl).catch(queueError => {
                        console.warn("⚠️ Queue processing failed:", queueError);
                    });
                    return result;
                } catch (syncErr: any) {
                    console.warn("⚠️ [Google Sheets] Cloud sync error during saveRecord, queuing operation:", syncErr?.message || syncErr);
                    addToQueue(operation);
                    return { status: 'success', queued: true, info: 'Saved to LocalStorage, Sheets sync queued' };
                }
            }
        } else {
            addToQueue(operation);
            return { status: 'success', queued: true, info: 'Saved to LocalStorage, Sheets URL not configured' };
        }

    } catch (error: any) {
        console.warn("⚠️ Save caught exception, queuing operation:", error?.message || error);
        addToQueue(operation);
        return { status: 'success', queued: true, info: 'Saved to LocalStorage, Sheets sync queued' };
    }
};

export const deleteRecord = async (sheetName: string, recordId: string, sheetsUrl?: string, proxyUrl?: string | null) => {
    // 1. Delete in LocalStorage first
    await deleteRecordFromLocalStorage(sheetName, recordId);

    // 2. Mirror Delete in Neon PostgreSQL Database
    try {
        if (sheetName === 'Submissions') {
            neonDataService.deleteOrder(recordId).catch(() => {});
        } else if (sheetName === 'ServiceRequests') {
            neonDataService.deleteLead(recordId).catch(() => {});
        } else if (sheetName === 'Customers' || sheetName === 'CustomerBook') {
            neonDataService.deleteCustomer(recordId).catch(() => {});
        } else if (sheetName === 'InventoryItems') {
            neonDataService.deleteInventoryItem(recordId).catch(() => {});
        } else if (sheetName === 'Expenses') {
            neonDataService.deleteExpense(recordId).catch(() => {});
        } else if (sheetName === 'Warranties') {
            neonDataService.deleteWarranty(recordId).catch(() => {});
        } else if (sheetName === 'Notifications') {
            neonDataService.deleteNotification(recordId).catch(() => {});
        } else if (sheetName === 'CarDatabase') {
            neonDataService.deleteCar(recordId).catch(() => {});
        }
    } catch {}

    // 3. Mirror Delete in Firestore (non-blocking)
    deleteRecordFromFirestore(sheetName, recordId).catch(err => {
        console.warn("⚠️ [cloudDataService] Firestore mirror delete skipped/failed:", err);
    });

    // If running in Pure Neon PostgreSQL & Cloudflare Workers SSOT Mode, skip Google Sheets completely!
    if (isNeonSoleSourceMode()) {
        console.log(`⚡ [Neon SSOT] Record deleted directly in Neon DB (${sheetName}:${recordId}). Google Sheets sync bypassed.`);
        return { status: 'success', source: 'neon_sole_mode' };
    }

    const operation = { type: 'delete', payload: { sheetName, idField: getIdField(sheetName), recordId } };
    
    // 4. Secondary Sync to Google Sheets
    try {
        if (!navigator.onLine) {
            addToQueue(operation);
            return { status: 'success', queued: true };
        }
        
        if (sheetsUrl) {
            if (db) {
                executeOperation(operation, sheetsUrl, proxyUrl)
                    .then(() => processQueue(sheetsUrl, proxyUrl).catch(qErr => console.warn("Queue sync failed:", qErr)))
                    .catch(() => addToQueue(operation));
                return { status: 'success' };
            } else {
                try {
                    await executeOperation(operation, sheetsUrl, proxyUrl);
                    processQueue(sheetsUrl, proxyUrl).catch(qErr => console.warn("Queue sync failed:", qErr));
                } catch (syncErr: any) {
                    console.warn("⚠️ [Google Sheets] Cloud sync error during deleteRecord, queuing operation:", syncErr?.message || syncErr);
                    addToQueue(operation);
                }
                return { status: 'success' };
            }
        } else {
            addToQueue(operation);
            return { status: 'success', queued: true };
        }
    } catch (error: any) {
        addToQueue(operation);
        return { status: 'success', queued: true };
    }
};

/**
 * Delta-sync mechanism: uploads only modified rows to Google Sheets instead of full table overwrites,
 * drastically reducing network payload size and Google Sheets API quota usage.
 */
export const syncDeltaRows = async (
    sheetName: string,
    newRecords: any[],
    existingRecords: any[] = [],
    sheetsUrl?: string,
    proxyUrl?: string | null
): Promise<{ syncedCount: number; skippedCount: number; queued: boolean }> => {
    // Special fast-path for AuditLogs: use timestamp-based incremental filter to avoid scanning the entire historical array
    if (sheetName === 'AuditLogs') {
        const { newLogs, skippedCount: timeSkipped, lastSyncTime } = filterNewAuditLogs(newRecords);
        if (newLogs.length === 0) {
            console.log(`⚡ [Delta-Sync] Sheet "AuditLogs": 0 new logs created since ${lastSyncTime > 0 ? new Date(lastSyncTime).toISOString() : 'last sync'}. Skipped all ${newRecords.length} historical logs (Payload eliminated).`);
            return { syncedCount: 0, skippedCount: newRecords.length, queued: false };
        }
        console.log(`🚀 [Delta-Sync] Sheet "AuditLogs": Syncing ${newLogs.length} new log(s) created since ${lastSyncTime > 0 ? new Date(lastSyncTime).toISOString() : 'start'} (Skipped ${timeSkipped} historical logs).`);
        let queued = false;
        for (const record of newLogs) {
            const res = await saveRecord(sheetName, record, sheetsUrl, proxyUrl);
            if (res?.queued) queued = true;
        }
        markMultipleAuditLogsSynced(newLogs);
        return { syncedCount: newLogs.length, skippedCount: timeSkipped, queued };
    }

    const idField = getIdField(sheetName);
    const existingMap = new Map<string, any>();
    existingRecords.forEach(r => {
        if (r && r[idField]) existingMap.set(String(r[idField]), r);
    });

    const modifiedRows: any[] = [];
    let skippedCount = 0;

    for (const record of newRecords) {
        if (!record || !record[idField]) continue;
        const recordId = String(record[idField]);
        const previousRecord = existingMap.get(recordId);

        if (previousRecord) {
            const prevHash = computeRecordHash(previousRecord);
            const newHash = computeRecordHash(record);
            if (prevHash === newHash && !isRecordModified(sheetName, recordId, record)) {
                skippedCount++;
                continue;
            }
        } else if (!isRecordModified(sheetName, recordId, record)) {
            skippedCount++;
            continue;
        }

        modifiedRows.push(record);
    }

    if (modifiedRows.length === 0) {
        console.log(`⚡ [Delta-Sync] Sheet "${sheetName}": 0 rows modified. Skipped ${skippedCount} unchanged rows (Saved API quota).`);
        return { syncedCount: 0, skippedCount, queued: false };
    }

    console.log(`🚀 [Delta-Sync] Sheet "${sheetName}": Syncing ${modifiedRows.length} modified row(s) (Skipped ${skippedCount} unchanged row(s)).`);

    let queued = false;
    for (const record of modifiedRows) {
        const res = await saveRecord(sheetName, record, sheetsUrl, proxyUrl);
        if (res?.queued) queued = true;
    }

    return { syncedCount: modifiedRows.length, skippedCount, queued };
};

/**
 * Incremental AuditLog Sync Service:
 * Only uploads new audit logs created since the last successful sync timestamp,
 * rather than re-evaluating or uploading the entire historical array every time.
 * This drastically reduces network payload size and Google Sheets API quota usage during high-frequency usage.
 */
export const syncAuditLogsIncremental = async (
    auditLogs: any[],
    sheetsUrl?: string,
    proxyUrl?: string | null
): Promise<{ syncedCount: number; skippedCount: number; queued: boolean; lastSyncTime: number }> => {
    const { newLogs, skippedCount, lastSyncTime } = filterNewAuditLogs(auditLogs);

    if (newLogs.length === 0) {
        console.log(`⚡ [AuditLog Incremental Sync] All ${auditLogs.length} audit logs are already synced (Last sync: ${lastSyncTime > 0 ? new Date(lastSyncTime).toISOString() : 'initial'}). Network upload bypassed.`);
        return { syncedCount: 0, skippedCount, queued: false, lastSyncTime };
    }

    console.log(`🚀 [AuditLog Incremental Sync] Uploading ${newLogs.length} new audit log(s) created since ${lastSyncTime > 0 ? new Date(lastSyncTime).toISOString() : 'start'} (Bypassed ${skippedCount} existing logs).`);

    let queued = false;
    for (const log of newLogs) {
        const res = await saveRecord('AuditLogs', log, sheetsUrl, proxyUrl);
        if (res?.queued) queued = true;
    }

    markMultipleAuditLogsSynced(newLogs);
    return { syncedCount: newLogs.length, skippedCount, queued, lastSyncTime: getLastAuditLogSyncTimestamp() };
};

export const testCloudDataConnection = async (sheetsUrl: string, proxyUrl?: string | null): Promise<{ success: boolean; message: string; details?: string; }> => {
    if (!sheetsUrl) return { success: false, message: "URL is empty." };
    try {
        const result = await fetchWithProxyFallback(sheetsUrl, {
            proxyUrl,
            action: 'ping',
            method: 'GET',
            timeoutMs: 10000
        });
        if (result && (result.status === 'success' || result.status === 'ok' || result.message)) {
            return { success: true, message: "Google Apps Script connection active & healthy!" };
        }
        return { success: false, message: result?.message || 'Unknown response format' };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Error testing cloud data connection" };
    }
};

export const testMediaUploadConnection = async (uploadUrl: string, proxyUrl?: string | null): Promise<{ success: boolean; message: string; details?: string; }> => {
    if (!uploadUrl) return { success: false, message: "Drive Upload URL is empty." };
    try {
        const result = await fetchWithProxyFallback(uploadUrl, {
            proxyUrl,
            action: 'ping',
            method: 'POST'
        });
        if (result && (result.status === 'success' || result.message || result.status === 'ok')) {
            return { success: true, message: "Drive Upload Connection successful!" };
        }
        return { success: true, message: "Drive Upload Endpoint configured." };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : "Error testing Drive upload endpoint" };
    }
};

const getDefaultAppData = (settings: Settings): AppData => {
    const defaultNotificationPrefs: NotificationPreferences = { enabled: { assigned: false, reminder: false, queued: false, completed: false, manual: false, overdue: false }, sound: 'none', vibration: false, consentGranted: false };
    const defaultKpiTargets: RetentionKpiTargets = { monthlyFollowUps: 20, conversionRatePercentage: 50, monthlyRevenue: 15000 };
    return {
        submissions: [], users: [], settings: {...settings, retentionKpiTargets: defaultKpiTargets},
        subscriptionPlans: [], userSubscriptions: [], serviceTemplates: [], serviceRequests: [], notifications: [], locationHistory: [],
        miscSpends: [], bookkeeping: [], profitLoss: [], 
        businessOverheads: [],
        spendCategories: [], predefinedCosts: [], 
        expenses: [], recurringExpenses: [],
        vehicleData: CAR_BRANDS,
        tyreData: { brands: TIRE_BRANDS, models: [], sizes: [] }, predefinedAddons: [], pricingConfig: DEFAULT_PRICING_CONFIG,
        predefinedServiceCategories: [],
        predefinedServices: [],
        deliveryHubs: DEFAULT_DELIVERY_HUBS,
        customerBook: [],
        inventoryItems: [],
        inventoryMovements: [],
        warranties: []
    };
};

const parseServiceSelection = (raw: any): string[] => {
    if (Array.isArray(raw)) return raw.flatMap(item => parseServiceSelection(item));
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parseServiceSelection(parsed);
            } catch (e) { }
        }
        return trimmed.split(',').map(s => s.replace(/[\[\]"']/g, '').trim()).filter(Boolean);
    }
    return [];
};

const getServiceLastModifiedTime = (s: Service): number => {
    if (!s) return 0;
    if ((s as any).updatedAt) {
        const t = new Date((s as any).updatedAt).getTime();
        if (!isNaN(t)) return t;
    }
    if (s.statusHistory && s.statusHistory.length > 0) {
        const lastEntry = s.statusHistory[s.statusHistory.length - 1];
        if (lastEntry && lastEntry.timestamp) {
            const t = new Date(lastEntry.timestamp).getTime();
            if (!isNaN(t)) return t;
        }
    }
    if (s.timestamp) {
        const t = new Date(s.timestamp).getTime();
        if (!isNaN(t)) return t;
    }
    return 0;
};

export const mergeSubmissions = (cloud: Service[], localS: Service[]): Service[] => {
    const map = new Map<string, Service>();
    for (const s of cloud) {
        if (s && s.submissionId) map.set(s.submissionId, s);
    }
    for (const s of localS) {
        if (s && s.submissionId) {
            const existing = map.get(s.submissionId);
            if (!existing || getServiceLastModifiedTime(s) >= getServiceLastModifiedTime(existing)) {
                map.set(s.submissionId, s);
            }
        }
    }
    return Array.from(map.values());
};

export const mergeUserSubscriptions = (cloud: UserSubscription[], localS: UserSubscription[]): UserSubscription[] => {
    const map = new Map<string, UserSubscription>();
    for (const s of cloud) {
        if (s && s.id) map.set(s.id, s);
    }
    for (const s of localS) {
        if (s && s.id) {
            const existing = map.get(s.id);
            if (!existing || new Date(s.startDate) > new Date(existing.startDate)) {
                map.set(s.id, s);
            }
        }
    }
    return Array.from(map.values());
};

export const mergeById = (cloud: any[], localS: any[], idKey: string): any[] => {
    const map = new Map<string, any>();
    for (const item of (localS || [])) {
        if (item && item[idKey]) map.set(String(item[idKey]), item);
    }
    for (const item of (cloud || [])) {
        if (item && item[idKey]) {
            const idStr = String(item[idKey]);
            const existing = map.get(idStr);
            if (!existing) {
                map.set(idStr, item);
            } else {
                const cloudTime = item.last_modified ? new Date(item.last_modified).getTime() : (item.updatedAt ? new Date(item.updatedAt).getTime() : (item.timestamp ? new Date(item.timestamp).getTime() : 0));
                const localTime = existing.last_modified ? new Date(existing.last_modified).getTime() : (existing.updatedAt ? new Date(existing.updatedAt).getTime() : (existing.timestamp ? new Date(existing.timestamp).getTime() : 0));
                if (cloudTime >= localTime || !localTime) {
                    map.set(idStr, { ...existing, ...item });
                }
            }
        }
    }
    return Array.from(map.values());
};

const mergeAppData = (local: AppData, incoming: AppData): AppData => {
    return {
        ...local,
        submissions: mergeSubmissions(incoming.submissions, local.submissions),
        users: mergeById(incoming.users, local.users, 'username'),
        subscriptionPlans: mergeById(incoming.subscriptionPlans, local.subscriptionPlans, 'id'),
        userSubscriptions: mergeUserSubscriptions(incoming.userSubscriptions, local.userSubscriptions),
        serviceTemplates: incoming.serviceTemplates.length > 0 ? incoming.serviceTemplates : local.serviceTemplates,
        serviceRequests: mergeById(incoming.serviceRequests, local.serviceRequests, 'id'),
        notifications: mergeById(incoming.notifications, local.notifications, 'id'),
        locationHistory: mergeById(incoming.locationHistory, local.locationHistory, 'historyId'),
        miscSpends: mergeById(incoming.miscSpends, local.miscSpends, 'spendId'),
        bookkeeping: mergeById(incoming.bookkeeping, local.bookkeeping, 'id'),
        profitLoss: mergeById(incoming.profitLoss, local.profitLoss, 'serviceId'),
        spendCategories: mergeById(incoming.spendCategories, local.spendCategories, 'id'),
        predefinedCosts: mergeById(incoming.predefinedCosts, local.predefinedCosts, 'id'),
        expenses: mergeById(incoming.expenses || [], local.expenses || [], 'id'),
        recurringExpenses: mergeById(incoming.recurringExpenses || [], local.recurringExpenses || [], 'id'),
        auditLogs: mergeById(incoming.auditLogs || [], local.auditLogs || [], 'id'),
        predefinedServiceCategories: incoming.predefinedServiceCategories?.length > 0 ? incoming.predefinedServiceCategories : local.predefinedServiceCategories,
        predefinedServices: incoming.predefinedServices?.length > 0 ? incoming.predefinedServices : local.predefinedServices,
        deliveryHubs: incoming.deliveryHubs?.length > 0 ? incoming.deliveryHubs : local.deliveryHubs,
        productRules: incoming.productRules?.length > 0 ? incoming.productRules : local.productRules,
        customerBook: mergeById(incoming.customerBook || [], local.customerBook || [], 'id'),
        inventoryItems: mergeById(incoming.inventoryItems || [], local.inventoryItems || [], 'id'),
        inventoryMovements: mergeById(incoming.inventoryMovements || [], local.inventoryMovements || [], 'id'),
        warranties: mergeById(incoming.warranties || [], local.warranties || [], 'id'),
        settings: { ...local.settings, ...incoming.settings }
    };
};

export const loadAppDataFromSheets = async (sheetsUrl: string, currentSettings: Settings, proxyUrl?: string | null, sinceTimestamp?: string | null): Promise<AppData | null> => {
    try {
        const lastSyncedIso = sinceTimestamp !== undefined ? sinceTimestamp : (typeof localStorage !== 'undefined' ? localStorage.getItem('service_app_last_synced_at') : null);
        console.log("📊 [Sheets] Fetching data from Google Sheets...", lastSyncedIso ? `(Delta sync since ${lastSyncedIso})` : '(Full initial sync)');
        let result: any = null;

        try {
            result = await fetchWithProxyFallback(sheetsUrl, {
                proxyUrl,
                action: 'loadAllData',
                since: lastSyncedIso || undefined,
                method: 'GET'
            });
        } catch (pErr) {
            console.warn("[Sheets] loadAppDataFromSheets attempt error:", pErr);
        }

        if (result && result.status === 'success') {
            const flatData = result.data;
            const ensureArr = (val: any): any[] => Array.isArray(val) ? val : [];
            const tyreDetails = ensureArr(flatData.TyreDetails);
            const batteryDetails = ensureArr(flatData.BatteryDetails).map((d: any) => ({ ...d, exchangeValue: robustParseFloat(d?.exchangeValue), newBatteryAmount: robustParseFloat(d?.newBatteryAmount) }));
            const customServices = ensureArr(flatData.CustomServices).map((d: any) => ({ ...d, amount: robustParseFloat(d?.amount) }));
            const categorizedAddonsArr = ensureArr(flatData.CategorizedAddons).map((d: any) => ({ ...d, quantity: robustParseInt(d?.quantity), amount: robustParseFloat(d?.amount) }));
            const locationHistory = ensureArr(flatData.LocationHistory).map((d: any) => ({ ...d, latitude: robustParseFloat(d?.latitude), longitude: robustParseFloat(d?.longitude) }));
            const miscSpends = ensureArr(flatData.MiscSpends).map((s: any) => ({ ...s, amount: robustParseFloat(s?.amount) }));
            const bookkeeping = ensureArr(flatData.Bookkeeping).map((b: any) => ({ ...b, amount: robustParseFloat(b?.amount) }));
            const profitLoss = ensureArr(flatData.ProfitLoss).map((pl: any) => {
                let dynamicCosts = [];
                try { if (pl.dynamicCosts) { dynamicCosts = typeof pl.dynamicCosts === 'string' ? JSON.parse(pl.dynamicCosts) : pl.dynamicCosts; } } catch (e) { }
                return {
                    ...pl,
                    materialCost: robustParseFloat(pl?.materialCost),
                    laborCost: robustParseFloat(pl?.laborCost),
                    otherExpenses: robustParseFloat(pl?.otherExpenses),
                    calculatedProfit: robustParseFloat(pl?.calculatedProfit),
                    dynamicCosts: Array.isArray(dynamicCosts) ? dynamicCosts : []
                };
            });
            const businessOverheads = ensureArr(flatData.BusinessOverheads).map((bo: any) => ({ ...bo, amount: robustParseFloat(bo?.amount) }));
            const spendCategories = ensureArr(flatData.SpendCategories).map((c: any) => ({ ...c }));
            const predefinedCosts = ensureArr(flatData.PredefinedCosts).map((c: any) => ({ ...c, value: robustParseFloat(c?.value) }));
            const vehicleData = (flatData.VehicleData && flatData.VehicleData[0]?.data) ? JSON.parse(flatData.VehicleData[0].data) : CAR_BRANDS;
            const tyreData = (flatData.TyreData && flatData.TyreData[0]?.data) ? JSON.parse(flatData.TyreData[0].data) : { brands: TIRE_BRANDS, models: [], sizes: [] };
            const pricingConfig = (flatData.PricingConfig && flatData.PricingConfig[0]?.data) ? JSON.parse(flatData.PricingConfig[0].data) : DEFAULT_PRICING_CONFIG;
            const subscriptionPlans = ensureArr(flatData.SubscriptionPlans).map((p: any) => ({ ...p, price: robustParseFloat(p?.price), totalWashes: robustParseInt(p?.totalWashes), features: p?.features ? String(p.features).split(',').map((f: string) => f.trim()) : [] }));
            const userSubscriptions = ensureArr(flatData.UserSubscriptions).map((s: any) => ({ ...s, washesRemaining: robustParseInt(s?.washesRemaining) }));
            const serviceRequests = ensureArr(flatData.ServiceRequests);
            const auditLogs = ensureArr(flatData.AuditLogs);
            const notifications = ensureArr(flatData.Notifications).map((n: any) => ({ ...n, isRead: String(n?.isRead).toUpperCase() === 'TRUE' }));
            const serviceTemplates = ensureArr(flatData.ServiceTemplates).map((t: any) => ({ ...t, isEnabled: String(t?.isEnabled).toUpperCase() === 'TRUE', customFields: ensureArr(flatData.ServiceTemplateFields).filter((f: any) => f?.relatedTemplateId === t?.id).map(({ relatedTemplateId, ...rest }: any) => rest) }));

            const predefinedServiceCategories = ensureArr(flatData.PredefinedServiceCategories).map((c: any) => ({ ...c, isEnabled: String(c?.isEnabled).toUpperCase() === 'TRUE' }));
            const predefinedServices = (flatData.PredefinedServices || []).map((s: any) => {
                let pricing = undefined;
                try { if (s.pricing) { pricing = typeof s.pricing === 'string' ? JSON.parse(s.pricing) : s.pricing; } } catch (e) { }
                return {
                    ...s,
                    isEnabled: String(s.isEnabled).toUpperCase() === 'TRUE',
                    pricing,
                    serviceableRadiusKm: s.serviceableRadiusKm ? robustParseFloat(s.serviceableRadiusKm) : undefined,
                    freeRadiusKm: s.freeRadiusKm ? robustParseFloat(s.freeRadiusKm) : undefined,
                    convenienceFeePerKm: s.convenienceFeePerKm ? robustParseFloat(s.convenienceFeePerKm) : undefined,
                    baseConvenienceFee: s.baseConvenienceFee ? robustParseFloat(s.baseConvenienceFee) : undefined,
                    recipe: s.recipe || undefined,
                    materialExpense: s.materialExpense !== undefined ? robustParseFloat(s.materialExpense) : undefined,
                    fuelExpense: s.fuelExpense !== undefined ? robustParseFloat(s.fuelExpense) : undefined,
                    laborExpense: s.laborExpense !== undefined ? robustParseFloat(s.laborExpense) : undefined,
                    otherExpense: s.otherExpense !== undefined ? robustParseFloat(s.otherExpense) : undefined,
                };
            });
            const customerBook = (flatData.Customers || []).map((c: any) => {
                let savedVehicles = [];
                try { if (c.savedVehicles) { savedVehicles = typeof c.savedVehicles === 'string' ? JSON.parse(c.savedVehicles) : c.savedVehicles; } } catch (e) { }
                return {
                    ...c,
                    latitude: c.latitude ? robustParseFloat(c.latitude) : undefined,
                    longitude: c.longitude ? robustParseFloat(c.longitude) : undefined,
                    savedVehicles: Array.isArray(savedVehicles) ? savedVehicles : [],
                    loyaltyScore: c.loyaltyScore !== undefined && c.loyaltyScore !== null && c.loyaltyScore !== '' ? robustParseInt(c.loyaltyScore) : undefined
                };
            });
            const rawHubs = (flatData.DeliveryHubs || []).map((h: any) => ({ ...h, latitude: robustParseFloat(h.latitude), longitude: robustParseFloat(h.longitude) }));
            const deliveryHubs = rawHubs.length > 0 ? rawHubs : DEFAULT_DELIVERY_HUBS;
            const productRules = (flatData.ProductRules || []).map((r: any) => ({
                ...r,
                priority: r.priority ? robustParseInt(r.priority) : undefined,
                freeRadius: r.freeRadius ? robustParseFloat(r.freeRadius) : undefined,
                maxRadius: r.maxRadius ? robustParseFloat(r.maxRadius) : undefined,
                chargePerKm: r.chargePerKm ? robustParseFloat(r.chargePerKm) : undefined,
                roundTrip: r.roundTrip !== undefined ? String(r.roundTrip).toUpperCase() === 'TRUE' : undefined,
                requiresMainService: r.requiresMainService !== undefined ? String(r.requiresMainService).toUpperCase() === 'TRUE' : undefined,
            }));

            // Build fast O(1) Lookup Maps for relational sub-arrays to handle 1200+ submissions instantly
            const tyreMap = new Map<string, any[]>();
            tyreDetails.forEach((d: any) => {
                const sid = d.relatedServiceId || d.submissionId;
                if (sid) {
                    if (!tyreMap.has(sid)) tyreMap.set(sid, []);
                    tyreMap.get(sid)!.push(d);
                }
            });

            const batteryMap = new Map<string, any[]>();
            batteryDetails.forEach((d: any) => {
                const sid = d.relatedServiceId || d.submissionId;
                if (sid) {
                    if (!batteryMap.has(sid)) batteryMap.set(sid, []);
                    batteryMap.get(sid)!.push(d);
                }
            });

            const customServicesMap = new Map<string, any[]>();
            customServices.forEach((d: any) => {
                const sid = d.relatedServiceId || d.submissionId;
                if (sid) {
                    if (!customServicesMap.has(sid)) customServicesMap.set(sid, []);
                    customServicesMap.get(sid)!.push(d);
                }
            });

            const addonsMap = new Map<string, any[]>();
            categorizedAddonsArr.forEach((d: any) => {
                const sid = d.relatedServiceId || d.submissionId;
                if (sid) {
                    if (!addonsMap.has(sid)) addonsMap.set(sid, []);
                    addonsMap.get(sid)!.push(d);
                }
            });

            const customFieldsMap = new Map<string, any[]>();
            (flatData.CustomFieldData || []).forEach(({ relatedServiceId, ...rest }: any) => {
                if (relatedServiceId) {
                    if (!customFieldsMap.has(relatedServiceId)) customFieldsMap.set(relatedServiceId, []);
                    customFieldsMap.get(relatedServiceId)!.push(rest);
                }
            });

            const submissions = ensureArr(flatData.Submissions).map((sub: any): Service => {
                let status = sub.status;
                if (status === "Submitted") status = ServiceStatus.Completed;
                else if (status === "Order Created") status = ServiceStatus.Queued;
                if (!status || !Object.values(ServiceStatus).includes(status as ServiceStatus)) status = ServiceStatus.Queued;
                
                let dynamicAddons = [];
                try { if (sub.dynamicAddons) dynamicAddons = typeof sub.dynamicAddons === 'string' ? JSON.parse(sub.dynamicAddons) : sub.dynamicAddons; } catch(e) { }
                let carWashDetails = undefined;
                try { if (sub.carWashDetails) carWashDetails = typeof sub.carWashDetails === 'string' ? JSON.parse(sub.carWashDetails) : sub.carWashDetails; } catch(e) { }
                let carCareDetails = undefined;
                try { if (sub.carCareDetails) carCareDetails = typeof sub.carCareDetails === 'string' ? JSON.parse(sub.carCareDetails) : sub.carCareDetails; } catch(e) { }
                let statusHistory = [];
                try { if (sub.statusHistory) statusHistory = typeof sub.statusHistory === 'string' ? JSON.parse(sub.statusHistory) : sub.statusHistory; } catch(e) { }

                const subId = sub.submissionId || sub.appointmentId || sub.id;

                return {
                    ...sub, status, 
                    customerLatitude: sub.customerLatitude ? robustParseFloat(sub.customerLatitude) : undefined,
                    customerLongitude: sub.customerLongitude ? robustParseFloat(sub.customerLongitude) : undefined,
                    customerDistanceKm: sub.customerDistanceKm ? robustParseFloat(sub.customerDistanceKm) : undefined,
                    customerELoc: sub.customerELoc || undefined,
                    dynamicAddons: Array.isArray(dynamicAddons) ? dynamicAddons : [], 
                    carWashDetails, carCareDetails,
                    statusHistory: Array.isArray(statusHistory) ? statusHistory : [],
                    isSubscription: String(sub.isSubscription).toUpperCase() === 'TRUE',
                    isFollowUp: String(sub.isFollowUp).toUpperCase() === 'TRUE',
                    isAutoScheduled: String(sub.isAutoScheduled).toUpperCase() === 'TRUE',
                    acknowledgement: String(sub.acknowledgement).toUpperCase() === 'TRUE',
                    grandTotal: robustParseFloat(sub.grandTotal),
                    travelCharge: sub.travelCharge ? robustParseFloat(sub.travelCharge) : 0,
                    appointmentId: sub.appointmentId || sub.submissionId,
                    tyreDetails: tyreMap.get(subId) || [],
                    batteryDetails: batteryMap.get(subId) || [],
                    customServices: customServicesMap.get(subId) || [],
                    categorizedAddons: addonsMap.get(subId) || [],
                    customFieldData: customFieldsMap.get(subId) || [],
                    serviceSelection: parseServiceSelection(sub.serviceSelection),
                    dependsOn: sub.dependsOn ? String(sub.dependsOn).split(',').map((s: any) => s.trim()) : [],
                };
            });

            const cloudSettingsPartial = (flatData.Settings && flatData.Settings[0]) ? flatData.Settings[0] : {};
            let parsedSheetsUrl = cloudSettingsPartial.googleSheetsUrl || currentSettings.googleSheetsUrl;
            let parsedDriveUrl = cloudSettingsPartial.googleDriveUploadUrl || currentSettings.googleDriveUploadUrl;
            if (parsedDriveUrl === parsedSheetsUrl) {
                parsedDriveUrl = currentSettings.googleDriveUploadUrl && currentSettings.googleDriveUploadUrl !== parsedSheetsUrl
                    ? currentSettings.googleDriveUploadUrl
                    : 'https://script.google.com/macros/s/AKfycbyb35rxNPeDoa4LsEtjdlbMy33a6MEJAlUKKB27aTPfIZd97MgEP-roZ6MRLSXxOMGj/exec';
            }
            const settings: Settings = {
                googleSheetsUrl: parsedSheetsUrl,
                googleDriveUploadUrl: parsedDriveUrl,
                customLogoUrl: cloudSettingsPartial.customLogoUrl || currentSettings.customLogoUrl,
                retentionKpiTargets: cloudSettingsPartial.retentionKpiTargets ? (typeof cloudSettingsPartial.retentionKpiTargets === 'string' ? JSON.parse(cloudSettingsPartial.retentionKpiTargets) : cloudSettingsPartial.retentionKpiTargets) : currentSettings.retentionKpiTargets,
                googleMapsApiKey: cloudSettingsPartial.googleMapsApiKey || cloudSettingsPartial.mapplsApiKey || currentSettings.googleMapsApiKey,
                hubLatitude: cloudSettingsPartial.hubLatitude ? robustParseFloat(cloudSettingsPartial.hubLatitude) : currentSettings.hubLatitude,
                hubLongitude: cloudSettingsPartial.hubLongitude ? robustParseFloat(cloudSettingsPartial.hubLongitude) : currentSettings.hubLongitude,
                maxDistanceKm: cloudSettingsPartial.maxDistanceKm ? robustParseFloat(cloudSettingsPartial.maxDistanceKm) : currentSettings.maxDistanceKm,
            };
            
            const users = (flatData.Users && flatData.Users.length > 0) 
                ? (flatData.Users).map((u: any) => ({
                    ...u,
                    specialties: parseSpecialties(u.specialties || u.Specialties),
                    notificationPreferences: safeJsonParse(u.notificationPreferences, {}),
                    attendanceHistory: safeJsonParse(u.attendanceHistory, []),
                    permissions: safeJsonParse(u.permissions, []),
                    latitude: u.latitude ? robustParseFloat(u.latitude) : undefined,
                    longitude: u.longitude ? robustParseFloat(u.longitude) : undefined
                }))
                : getDefaultAppData(settings).users;

            const expenses = (flatData.Expenses && flatData.Expenses.length > 0)
                ? (flatData.Expenses).map((e: any) => ({ ...e, amount: robustParseFloat(e.amount) }))
                : [];
            const recurringExpenses = (flatData.RecurringExpenses && flatData.RecurringExpenses.length > 0)
                ? (flatData.RecurringExpenses).map((re: any) => ({ ...re, amount: robustParseFloat(re.amount), isActive: String(re.isActive).toUpperCase() === 'TRUE' }))
                : [];
            const warranties = (flatData.Warranties || []).map((w: any) => ({ ...w, warrantyPeriodMonths: robustParseInt(w.warrantyPeriodMonths), alertDaysBefore: robustParseInt(w.alertDaysBefore || 30) }));

            return { submissions, users, settings, subscriptionPlans, userSubscriptions, serviceTemplates, serviceRequests, notifications, locationHistory, miscSpends, bookkeeping, profitLoss, businessOverheads: [], vehicleData, tyreData, pricingConfig, spendCategories, predefinedCosts, expenses, recurringExpenses, predefinedAddons: [], predefinedServiceCategories, predefinedServices, deliveryHubs, productRules, customerBook, auditLogs, warranties };
        }
        return null;
    } catch (e) {
        console.error("❌ Google Sheets load failed:", e);
        return null;
    }
};

export const checkAndRunDailyFirestoreSync = async (appData: AppData) => {
    if (!db || isQuotaExceeded()) return;
    try {
        const lastSyncStr = localStorage.getItem('last_firestore_sync_timestamp');
        const now = new Date();
        
        // Define today's 7:00 AM
        const today7AM = new Date(now);
        today7AM.setHours(7, 0, 0, 0);
        
        let shouldSync = false;
        
        if (!lastSyncStr) {
            // No sync has ever run, let's run it
            shouldSync = true;
        } else {
            const lastSync = new Date(lastSyncStr);
            if (now >= today7AM) {
                // Current time is past 7:00 AM today. Sync if last sync was before today's 7:00 AM.
                shouldSync = lastSync < today7AM;
            } else {
                // Current time is before 7:00 AM today. Sync if last sync was before yesterday's 7:00 AM.
                const yesterday7AM = new Date(today7AM);
                yesterday7AM.setDate(yesterday7AM.getDate() - 1);
                shouldSync = lastSync < yesterday7AM;
            }
        }
        
        if (shouldSync) {
            console.log("⏰ [Firestore] Scheduled daily sync at 7:00 AM triggered. Syncing now to prevent quota exceedances...");
            let firestoreData: AppData | null = null;
            try {
                firestoreData = await loadFromFirestore(appData.settings);
            } catch (fsErr) {
                console.error("❌ Failed to fetch current Firestore data for differential sync:", fsErr);
            }
            await seedFirestoreFromAppData(appData, firestoreData);
            localStorage.setItem('last_firestore_sync_timestamp', now.toISOString());
            console.log("✅ [Firestore] Daily 7:00 AM sync completed successfully.");
        } else {
            console.log("⏰ [Firestore] Daily sync already completed or not yet time (Runs daily at 7:00 AM). Skipping.");
        }
    } catch (err) {
        console.error("❌ Error checking or running daily Firestore sync:", err);
    }
};

export const loadAppData = async (currentSettings: Settings, forceRefresh: boolean = false): Promise<AppData> => {
    // 1. Try loading from IndexedDB first for instant local render (if not forced)
    if (!forceRefresh) {
        try {
            const [
                submissions,
                users,
                subscriptionPlans,
                userSubscriptions,
                serviceTemplates,
                serviceRequests,
                notifications,
                locationHistory,
                miscSpends,
                bookkeeping,
                profitLoss,
                spendCategories,
                predefinedCosts,
                expenses,
                recurringExpenses,
                vehicleData,
                tyreData,
                pricingConfig,
                predefinedServiceCategories,
                predefinedServices,
                deliveryHubs,
                productRules,
                customerBook,
                inventoryItems,
                inventoryMovements,
                auditLogs,
                warranties
            ] = await Promise.all([
                getIndexedDbItem<any[]>('service_app_submissions', []),
                getIndexedDbItem<any[]>('service_app_users', []),
                getIndexedDbItem<any[]>('service_app_subscription_plans', []),
                getIndexedDbItem<any[]>('service_app_user_subscriptions', []),
                getIndexedDbItem<any[]>('service_app_service_templates', []),
                getIndexedDbItem<any[]>('service_app_service_requests', []),
                getIndexedDbItem<any[]>('service_app_notifications', []),
                getIndexedDbItem<any[]>('service_app_location_history', []),
                getIndexedDbItem<any[]>('service_app_misc_spends', []),
                getIndexedDbItem<any[]>('service_app_bookkeeping', []),
                getIndexedDbItem<any[]>('service_app_profit_loss', []),
                getIndexedDbItem<any[]>('service_app_spend_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_costs', []),
                getIndexedDbItem<any[]>('service_app_expenses', []),
                getIndexedDbItem<any[]>('service_app_recurring_expenses', []),
                getIndexedDbItem<any>('service_app_vehicle_data', CAR_BRANDS),
                getIndexedDbItem<any>('service_app_tyre_data', { brands: TIRE_BRANDS, models: [], sizes: [] }),
                getIndexedDbItem<any>('service_app_pricing_config', DEFAULT_PRICING_CONFIG),
                getIndexedDbItem<any[]>('service_app_predefined_service_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_services', []),
                getIndexedDbItem<any[]>('service_app_delivery_hubs', []),
                getIndexedDbItem<any[]>('service_app_product_rules', []),
                getIndexedDbItem<any[]>('service_app_customers', []),
                getIndexedDbItem<any[]>('service_app_inventory_items', []),
                getIndexedDbItem<any[]>('service_app_inventory_movements', []),
                getIndexedDbItem<any[]>('service_app_audit_logs', []),
                getIndexedDbItem<any[]>('service_app_warranties', [])
            ]);
            
            if (submissions.length > 0 || users.length > 0) {
                console.log("📦 [IndexedDB] Instant load from IndexedDB cache.");
                
                const appData: AppData = {
                    submissions,
                    users,
                    settings: currentSettings,
                    subscriptionPlans,
                    userSubscriptions,
                    serviceTemplates,
                    serviceRequests,
                    notifications,
                    locationHistory,
                    miscSpends,
                    bookkeeping,
                    profitLoss,
                    businessOverheads: [],
                    spendCategories,
                    predefinedCosts,
                    expenses,
                    recurringExpenses,
                    vehicleData,
                    tyreData,
                    predefinedAddons: [],
                    pricingConfig,
                    predefinedServiceCategories,
                    predefinedServices,
                    deliveryHubs,
                    productRules,
                    customerBook,
                    inventoryItems,
                    inventoryMovements,
                    auditLogs,
                    warranties
                };

                // In background, sync with Google Sheets (our primary database core) to fetch newly updated records, and update Firestore cache
                // SKIPPED when running in Neon SSOT mode
                const sheetsUrl = currentSettings.googleSheetsUrl;
                if (sheetsUrl && !isNeonSoleSourceMode()) {
                    loadPageWiseData(currentSettings, 'CORE').then(coreUpdates => {
                        if (coreUpdates) {
                            console.log("📊 [Sheets] Background Core sync completed. Merging core updates from Google Sheets.");
                            const mergedSubmissions = coreUpdates.submissions ? mergeSubmissions(coreUpdates.submissions, appData.submissions) : appData.submissions;
                            const mergedUsers = coreUpdates.users ? coreUpdates.users : appData.users;
                            const mergedNotifications = coreUpdates.notifications ? coreUpdates.notifications : appData.notifications;
                            const mergedSettings = coreUpdates.settings ? coreUpdates.settings : appData.settings;
                            const mergedLocationHistory = coreUpdates.locationHistory ? coreUpdates.locationHistory : appData.locationHistory;

                            const updatedAppData = {
                                ...appData,
                                submissions: mergedSubmissions,
                                users: mergedUsers,
                                notifications: mergedNotifications,
                                settings: mergedSettings,
                                locationHistory: mergedLocationHistory,
                                spendCategories: coreUpdates.spendCategories ? mergeById(coreUpdates.spendCategories, appData.spendCategories, 'id') : appData.spendCategories,
                                predefinedCosts: coreUpdates.predefinedCosts ? mergeById(coreUpdates.predefinedCosts, appData.predefinedCosts, 'id') : appData.predefinedCosts,
                                predefinedServiceCategories: coreUpdates.predefinedServiceCategories ? coreUpdates.predefinedServiceCategories : appData.predefinedServiceCategories,
                                predefinedServices: coreUpdates.predefinedServices ? coreUpdates.predefinedServices : appData.predefinedServices,
                                deliveryHubs: coreUpdates.deliveryHubs ? coreUpdates.deliveryHubs : appData.deliveryHubs,
                                productRules: coreUpdates.productRules ? coreUpdates.productRules : appData.productRules,
                                customerBook: coreUpdates.customerBook ? mergeById(coreUpdates.customerBook, appData.customerBook, 'id') : appData.customerBook,
                            };
                            saveAppDataToLocalStorage(updatedAppData);
                            
                            // Sync newly updated data from Google Sheets into Firestore as ultra-fast cloud cache
                            if (db && !isQuotaExceeded()) {
                                seedFirestoreFromAppData(updatedAppData, appData).catch(err => {
                                    console.error("❌ [Firestore] Sync of newly updated Google Sheets data failed:", err);
                                });
                            }
                        }
                    }).catch(err => {
                        console.error("❌ [Sheets] Background sync failed:", err);
                    });
                }

                return appData;
            }
        } catch (e) {
            console.error("Error loading/parsing IndexedDB app data:", e);
        }
    }

    // 2. High-Performance Neon PostgreSQL Database First (Primary Cloud Database)
    try {
        const isNeonOnline = await neonDataService.isAvailable();
        if (isNeonOnline) {
            console.log("🐘 [Neon PostgreSQL & Cloudflare] Fetching high-performance relational data from Neon DB...");
            const [
                neonOrders,
                neonLeads,
                neonUsers,
                neonCustomers,
                neonInventory,
                neonExpenses,
                neonWarranties,
                neonNotifications,
                neonCars,
                neonSubscriptions,
                neonTemplates,
                neonPlans,
                neonHubs,
                neonCosts,
                neonSpendCategories,
                neonServices,
                neonServiceCategories,
                neonRecurringExpenses
            ] = await Promise.all([
                neonDataService.loadOrders(1000).catch(err => { console.error("❌ [Neon] Error in loadOrders:", err); return []; }),
                neonDataService.loadLeads(1000).catch(err => { console.error("❌ [Neon] Error in loadLeads:", err); return []; }),
                neonDataService.loadUsers().catch(err => { console.error("❌ [Neon] Error in loadUsers:", err); return []; }),
                neonDataService.loadCustomers(1000).catch(err => { console.error("❌ [Neon] Error in loadCustomers:", err); return []; }),
                neonDataService.loadInventory(1000).catch(err => { console.error("❌ [Neon] Error in loadInventory:", err); return []; }),
                neonDataService.loadExpenses(1000).catch(err => { console.error("❌ [Neon] Error in loadExpenses:", err); return []; }),
                neonDataService.loadWarranties(1000).catch(err => { console.error("❌ [Neon] Error in loadWarranties:", err); return []; }),
                neonDataService.loadNotifications(500).catch(err => { console.error("❌ [Neon] Error in loadNotifications:", err); return []; }),
                neonDataService.loadCarDatabase().catch(err => { console.error("❌ [Neon] Error in loadCarDatabase:", err); return []; }),
                neonDataService.loadCollection('user_subscriptions').catch(err => { console.error("❌ [Neon] Error in loadCollection user_subscriptions:", err); return []; }),
                neonDataService.loadCollection('service_templates').catch(err => { console.error("❌ [Neon] Error in loadCollection service_templates:", err); return []; }),
                neonDataService.loadCollection('subscription_plans').catch(err => { console.error("❌ [Neon] Error in loadCollection subscription_plans:", err); return []; }),
                neonDataService.loadCollection('delivery_hubs').catch(err => { console.error("❌ [Neon] Error in loadCollection delivery_hubs:", err); return []; }),
                neonDataService.loadCollection('predefined_costs').catch(err => { console.error("❌ [Neon] Error in loadCollection predefined_costs:", err); return []; }),
                neonDataService.loadCollection('spend_categories').catch(err => { console.error("❌ [Neon] Error in loadCollection spend_categories:", err); return []; }),
                neonDataService.loadCollection('predefined_services').catch(err => { console.error("❌ [Neon] Error in loadCollection predefined_services:", err); return []; }),
                neonDataService.loadCollection('predefined_service_categories').catch(err => { console.error("❌ [Neon] Error in loadCollection predefined_service_categories:", err); return []; }),
                neonDataService.loadCollection('recurring_expenses').catch(err => { console.error("❌ [Neon] Error in loadCollection recurring_expenses:", err); return []; })
            ]);

            console.log(`📊 [Neon Load Summary] Orders: ${neonOrders.length}, Leads: ${neonLeads.length}, Users: ${neonUsers.length}, Customers: ${neonCustomers.length}, Inventory: ${neonInventory.length}, Cars: ${neonCars.length}, Plans: ${neonPlans.length}`);

        if (neonOrders.length > 0 || neonUsers.length > 0 || neonLeads.length > 0 || neonCustomers.length > 0) {
            console.log(`⚡ [Neon PostgreSQL] Successfully loaded ${neonOrders.length} orders, ${neonUsers.length} users, ${neonLeads.length} leads, ${neonCustomers.length} customers directly from Neon DB.`);
            const [
                localPlans,
                locationHistory,
                miscSpends,
                bookkeeping,
                profitLoss,
                localSpendCategories,
                localCosts,
                localRecurringExpenses,
                vehicleData,
                tyreData,
                pricingConfig,
                localServiceCategories,
                localServices,
                localDeliveryHubs,
                productRules,
                localCustomers,
                localInventory,
                inventoryMovements,
                auditLogs,
                localWarranties,
                initialCarDb
            ] = await Promise.all([
                getIndexedDbItem<any[]>('service_app_subscription_plans', []),
                getIndexedDbItem<any[]>('service_app_location_history', []),
                getIndexedDbItem<any[]>('service_app_misc_spends', []),
                getIndexedDbItem<any[]>('service_app_bookkeeping', []),
                getIndexedDbItem<any[]>('service_app_profit_loss', []),
                getIndexedDbItem<any[]>('service_app_spend_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_costs', []),
                getIndexedDbItem<any[]>('service_app_recurring_expenses', []),
                getIndexedDbItem<any>('service_app_vehicle_data', CAR_BRANDS),
                getIndexedDbItem<any>('service_app_tyre_data', { brands: TIRE_BRANDS, models: [], sizes: [] }),
                getIndexedDbItem<any>('service_app_pricing_config', DEFAULT_PRICING_CONFIG),
                getIndexedDbItem<any[]>('service_app_predefined_service_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_services', []),
                getIndexedDbItem<any[]>('service_app_delivery_hubs', []),
                getIndexedDbItem<any[]>('service_app_product_rules', []),
                getIndexedDbItem<any[]>('service_app_customers', []),
                getIndexedDbItem<any[]>('service_app_inventory_items', []),
                getIndexedDbItem<any[]>('service_app_inventory_movements', []),
                getIndexedDbItem<any[]>('service_app_audit_logs', []),
                getIndexedDbItem<any[]>('service_app_warranties', []),
                getIndexedDbItem<any[]>('service_app_car_database', [])
            ]);

            const subscriptionPlans = neonPlans.length > 0 ? neonPlans : localPlans;
            const deliveryHubs = neonHubs.length > 0 ? neonHubs : localDeliveryHubs;
            const predefinedCosts = neonCosts.length > 0 ? neonCosts : localCosts;
            const spendCategories = neonSpendCategories.length > 0 ? neonSpendCategories : localSpendCategories;
            const predefinedServices = neonServices.length > 0 ? neonServices : localServices;
            const predefinedServiceCategories = neonServiceCategories.length > 0 ? neonServiceCategories : localServiceCategories;
            const recurringExpenses = neonRecurringExpenses.length > 0 ? neonRecurringExpenses : localRecurringExpenses;
            const userSubscriptions = neonSubscriptions.length > 0 ? neonSubscriptions : await getIndexedDbItem<any[]>('service_app_user_subscriptions', []);
            const serviceTemplates = neonTemplates.length > 0 ? neonTemplates : await getIndexedDbItem<any[]>('service_app_service_templates', []);
            const notifications = neonNotifications.length > 0 ? neonNotifications : await getIndexedDbItem<any[]>('service_app_notifications', []);
            const expenses = neonExpenses.length > 0 ? neonExpenses : await getIndexedDbItem<any[]>('service_app_expenses', []);
            const customerBook = neonCustomers.length > 0 ? neonCustomers : localCustomers;
            const inventoryItems = neonInventory.length > 0 ? neonInventory : localInventory;
            const warranties = neonWarranties.length > 0 ? neonWarranties : localWarranties;

            const carDatabase = (Array.isArray(neonCars) && neonCars.length > 0) ? neonCars : initialCarDb;

            const sanitizedNeonOrders = (neonOrders || []).map((o: any) => ({
                ...o,
                serviceSelection: parseServiceSelection(o.serviceSelection || o.service_selection)
            }));

            // Extract website orders from Neon and map to ServiceRequests
            const websiteOrders = (sanitizedNeonOrders || []).filter((o: any) => o.isWebsiteOrder);
            const webLeads = websiteOrders.map(mapWebsiteOrderToServiceRequest);
            const combinedLeads = mergeById(webLeads, neonLeads || [], 'id');
            combinedLeads.sort((a, b) => new Date(b.requestDate || 0).getTime() - new Date(a.requestDate || 0).getTime());

            const neonAppData: AppData = {
                submissions: sanitizedNeonOrders,
                users: neonUsers,
                settings: currentSettings,
                subscriptionPlans,
                userSubscriptions,
                serviceTemplates,
                serviceRequests: combinedLeads,
                notifications,
                locationHistory,
                miscSpends,
                bookkeeping,
                profitLoss,
                businessOverheads: [],
                spendCategories,
                predefinedCosts,
                expenses,
                recurringExpenses,
                vehicleData,
                carDatabase: Array.isArray(carDatabase) && carDatabase.length > 0 ? carDatabase : undefined,
                tyreData,
                predefinedAddons: [],
                pricingConfig,
                predefinedServiceCategories,
                predefinedServices,
                deliveryHubs,
                productRules,
                customerBook,
                inventoryItems,
                inventoryMovements,
                auditLogs,
                warranties
            };

            saveAppDataToLocalStorage(neonAppData);

            // In background, sync with Google Sheets as secondary backup to capture any offline spreadsheet updates (skipped in Neon SSOT mode)
            const sheetsUrl = currentSettings.googleSheetsUrl;
            if (sheetsUrl && !isNeonSoleSourceMode()) {
                loadPageWiseData(currentSettings, 'CORE').then(coreUpdates => {
                    if (coreUpdates) {
                        console.log("📊 [Sheets Backup Sync] Google Sheet backup updates received, merging into state.");
                        const mergedSubmissions = coreUpdates.submissions ? mergeSubmissions(coreUpdates.submissions, neonAppData.submissions) : neonAppData.submissions;
                        const mergedUsers = coreUpdates.users && coreUpdates.users.length > 0 ? coreUpdates.users : neonAppData.users;
                        const updated = {
                            ...neonAppData,
                            submissions: mergedSubmissions,
                            users: mergedUsers,
                            notifications: coreUpdates.notifications || neonAppData.notifications,
                            settings: coreUpdates.settings || neonAppData.settings,
                            locationHistory: coreUpdates.locationHistory || neonAppData.locationHistory,
                            spendCategories: coreUpdates.spendCategories || neonAppData.spendCategories,
                            predefinedCosts: coreUpdates.predefinedCosts || neonAppData.predefinedCosts,
                            predefinedServiceCategories: coreUpdates.predefinedServiceCategories || neonAppData.predefinedServiceCategories,
                            predefinedServices: coreUpdates.predefinedServices || neonAppData.predefinedServices,
                            deliveryHubs: coreUpdates.deliveryHubs || neonAppData.deliveryHubs,
                            productRules: coreUpdates.productRules || neonAppData.productRules,
                            customerBook: coreUpdates.customerBook || neonAppData.customerBook,
                        };
                        saveAppDataToLocalStorage(updated);
                    }
                }).catch(err => {
                    console.warn("⚠️ [Sheets Backup Sync] Non-blocking sheet backup sync error:", err);
                });
            }

            return neonAppData;
        } else {
            console.warn("⚠️ [CloudData] Neon reported online, but returned 0 orders, 0 users, 0 leads, and 0 customers.");
            const lastErr = neonDataService.getLastBackendError?.();
            if (lastErr) {
                console.error("❌ [CloudData] Last recorded backend error:", lastErr);
            }
        }
        } else {
            console.warn("⚠️ [CloudData] Neon backend reported offline. Testing direct health check ping...");
            neonDataService.checkHealth().then(diag => {
                console.warn("ℹ️ [CloudData] Direct Health Ping diagnosis:", diag);
            }).catch(err => {
                console.error("❌ [CloudData] Direct Health Ping failed:", err);
            });
        }
    } catch (neonErr) {
        console.error("❌ [Neon PostgreSQL] Unexpected exception during Neon data hydration:", neonErr);
    }

    // 3. Fallback: Fetch directly from Google Sheets if Neon DB is empty or during first migration
    // SKIPPED when running in Neon SSOT mode
    const sheetsUrl = currentSettings.googleSheetsUrl;
    let sheetsData: AppData | null = null;
    if (sheetsUrl && !isNeonSoleSourceMode()) {
        try {
            console.log("📊 [Sheets Backup] Fetching CORE data directly from Google Sheets backup...");
            const coreUpdates = await loadPageWiseData(currentSettings, 'CORE');
            
            const [
                subscriptionPlans,
                userSubscriptions,
                serviceTemplates,
                serviceRequests,
                notifications,
                locationHistory,
                miscSpends,
                bookkeeping,
                profitLoss,
                spendCategories,
                predefinedCosts,
                expenses,
                recurringExpenses,
                vehicleData,
                tyreData,
                pricingConfig,
                predefinedServiceCategories,
                predefinedServices,
                deliveryHubs,
                productRules,
                customerBook,
                inventoryItems,
                inventoryMovements,
                auditLogs,
                warranties
            ] = await Promise.all([
                getIndexedDbItem<any[]>('service_app_subscription_plans', []),
                getIndexedDbItem<any[]>('service_app_user_subscriptions', []),
                getIndexedDbItem<any[]>('service_app_service_templates', []),
                getIndexedDbItem<any[]>('service_app_service_requests', []),
                getIndexedDbItem<any[]>('service_app_notifications', []),
                getIndexedDbItem<any[]>('service_app_location_history', []),
                getIndexedDbItem<any[]>('service_app_misc_spends', []),
                getIndexedDbItem<any[]>('service_app_bookkeeping', []),
                getIndexedDbItem<any[]>('service_app_profit_loss', []),
                getIndexedDbItem<any[]>('service_app_spend_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_costs', []),
                getIndexedDbItem<any[]>('service_app_expenses', []),
                getIndexedDbItem<any[]>('service_app_recurring_expenses', []),
                getIndexedDbItem<any>('service_app_vehicle_data', CAR_BRANDS),
                getIndexedDbItem<any>('service_app_tyre_data', { brands: TIRE_BRANDS, models: [], sizes: [] }),
                getIndexedDbItem<any>('service_app_pricing_config', DEFAULT_PRICING_CONFIG),
                getIndexedDbItem<any[]>('service_app_predefined_service_categories', []),
                getIndexedDbItem<any[]>('service_app_predefined_services', []),
                getIndexedDbItem<any[]>('service_app_delivery_hubs', []),
                getIndexedDbItem<any[]>('service_app_product_rules', []),
                getIndexedDbItem<any[]>('service_app_customers', []),
                getIndexedDbItem<any[]>('service_app_inventory_items', []),
                getIndexedDbItem<any[]>('service_app_inventory_movements', []),
                getIndexedDbItem<any[]>('service_app_audit_logs', []),
                getIndexedDbItem<any[]>('service_app_warranties', [])
            ]);

            sheetsData = {
                submissions: coreUpdates.submissions || [],
                users: coreUpdates.users || [],
                settings: coreUpdates.settings || currentSettings,
                subscriptionPlans,
                userSubscriptions,
                serviceTemplates,
                serviceRequests,
                notifications: coreUpdates.notifications || notifications,
                locationHistory: coreUpdates.locationHistory || locationHistory,
                miscSpends,
                bookkeeping,
                profitLoss,
                businessOverheads: [],
                spendCategories: coreUpdates.spendCategories || spendCategories,
                predefinedCosts: coreUpdates.predefinedCosts || predefinedCosts,
                expenses,
                recurringExpenses,
                vehicleData,
                tyreData,
                predefinedAddons: [],
                pricingConfig,
                predefinedServiceCategories: coreUpdates.predefinedServiceCategories || predefinedServiceCategories,
                predefinedServices: coreUpdates.predefinedServices || predefinedServices,
                deliveryHubs: coreUpdates.deliveryHubs || deliveryHubs,
                productRules: coreUpdates.productRules || productRules,
                customerBook: coreUpdates.customerBook || customerBook,
                inventoryItems,
                inventoryMovements,
                auditLogs,
                warranties
            };
        } catch (coreErr) {
            console.error("❌ Fallback CORE sheets load failed:", coreErr);
        }
    }

    const finalData = sheetsData || getDefaultAppData(currentSettings);

    // Save final data to local storage and seed Firestore for future ultra-fast loads
    saveAppDataToLocalStorage(finalData);
    if (db && !isQuotaExceeded()) {
        seedFirestoreFromAppData(finalData).catch(err => {
            console.error("❌ [Firestore] Initial seeding failed:", err);
        });
    }

    return finalData;
};

export const loadPageWiseData = async (currentSettings: Settings, pageKey: string, proxyUrl?: string | null, sinceTimestamp?: string | null): Promise<Partial<AppData>> => {
    const sheetsUrl = currentSettings.googleSheetsUrl;
    if (!sheetsUrl) return {};

    const lastSyncedIso = sinceTimestamp !== undefined ? sinceTimestamp : (typeof localStorage !== 'undefined' ? localStorage.getItem('service_app_last_synced_at') : null);

    let sheetsToFetch: string[] = [];
    switch (pageKey.toUpperCase()) {
        case 'USER_MANAGEMENT':
        case 'USERS':
        case 'USER_LIST':
            sheetsToFetch = ['Users', 'Settings', 'Notifications', 'LocationHistory'];
            break;
        case 'EXPENSES':
        case 'SPEND_CATEGORIES':
            sheetsToFetch = ['Expenses', 'RecurringExpenses', 'SpendCategories'];
            break;
        case 'CUSTOMER_BOOK':
        case 'CUSTOMER_HISTORY':
            sheetsToFetch = ['Customers', 'Submissions'];
            break;
        case 'SERVICE_CATALOG':
        case 'SERVICE_TEMPLATE_MANAGEMENT':
            sheetsToFetch = ['PredefinedServiceCategories', 'PredefinedServices', 'PredefinedCosts', 'CategorizedAddons', 'InventoryItems', 'InventoryMovements'];
            break;
        case 'HUB_MANAGEMENT':
            sheetsToFetch = ['DeliveryHubs', 'ProductRules'];
            break;
        case 'SERVICE_REQUEST':
        case 'APPOINTMENTS_OVERVIEW':
            sheetsToFetch = ['ServiceRequests', 'AuditLogs', 'Submissions', 'Users'];
            break;
        case 'DASHBOARD':
        case 'LIST':
            sheetsToFetch = ['Submissions', 'TyreDetails', 'BatteryDetails', 'CustomServices', 'CategorizedAddons', 'CustomFieldData', 'Users'];
            break;
        case 'RETENTION':
            sheetsToFetch = ['Submissions', 'Customers'];
            break;
        case 'ANALYTICS':
        case 'PROFIT_LOSS':
            sheetsToFetch = ['ProfitLoss', 'PredefinedCosts', 'Submissions', 'Expenses'];
            break;
        case 'WARRANTY_TRACKER':
            sheetsToFetch = ['Warranties'];
            break;
        case 'ERP_MANAGEMENT':
            sheetsToFetch = ['InventoryItems', 'InventoryMovements', 'Customers', 'Expenses', 'SpendCategories'];
            break;
        case 'INVENTORY_FORECASTING':
            sheetsToFetch = ['InventoryItems', 'InventoryMovements', 'PredefinedServices'];
            break;
        case 'ATTENDANCE_MANAGEMENT':
        case 'LIVE_MAP':
            sheetsToFetch = ['LocationHistory', 'Users'];
            break;
        case 'NOTIFICATIONS':
            sheetsToFetch = ['Notifications', 'Settings'];
            break;
        case 'SETTINGS':
            sheetsToFetch = ['Settings', 'Users', 'DeliveryHubs', 'ProductRules'];
            break;
        case 'TRASH':
        case 'TRACKING':
            sheetsToFetch = ['Submissions', 'Settings'];
            break;
        case 'CORE':
            sheetsToFetch = [
                'Submissions', 'TyreDetails', 'BatteryDetails', 'CustomServices', 'CategorizedAddons', 'CustomFieldData', 
                'Users', 'Notifications', 'Settings',
                'DeliveryHubs', 'ProductRules', 'PredefinedServiceCategories', 'PredefinedServices', 'PredefinedCosts', 'SpendCategories', 'Customers',
                'InventoryItems', 'InventoryMovements'
            ];
            break;
        default:
            sheetsToFetch = ['Users', 'Submissions', 'Settings'];
            break;
    }

    try {
        callbacks.onProgressChange(15, `Initializing sync for ${pageKey}...`);
        console.log(`📊 [Page-wise Sync] Loading specific sheets for page ${pageKey}:`, sheetsToFetch, lastSyncedIso ? `(Delta sync since ${lastSyncedIso})` : '(Full sync)');
        
        callbacks.onProgressChange(35, `Fetching ${pageKey} data...`);
        let result: any = null;

        // 1. Neon Database Fetch First (if available)
        try {
            const isNeonOnline = await neonDataService.isAvailable();
            if (isNeonOnline) {
                console.log(`🐘 [Page-wise Sync] Querying Neon PostgreSQL for page ${pageKey} datasets:`, sheetsToFetch);
                const neonData: Record<string, any[]> = {};
                let hasNeonData = false;

                // Fetch orders & leads if relevant to this page
                const requests: Promise<any>[] = [];

                if (sheetsToFetch.includes('Submissions')) {
                    requests.push(
                        neonDataService.loadOrders(1000).then(orders => {
                            if (orders.length > 0) {
                                neonData.Submissions = orders;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('ServiceRequests')) {
                    requests.push(
                        Promise.all([
                            neonDataService.loadLeads(1000).catch(() => []),
                            neonDataService.loadWebsiteOrders(1000).catch(() => [])
                        ]).then(([leads, webOrders]) => {
                            const webLeads = (webOrders || []).map(mapWebsiteOrderToServiceRequest);
                            const mergedLeads = mergeById(webLeads, leads || [], 'id');
                            mergedLeads.sort((a, b) => new Date(b.requestDate || 0).getTime() - new Date(a.requestDate || 0).getTime());
                            if (mergedLeads.length > 0) {
                                neonData.ServiceRequests = mergedLeads;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('Users')) {
                    requests.push(
                        neonDataService.loadUsers().then(users => {
                            if (users.length > 0) {
                                neonData.Users = users;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('Customers')) {
                    requests.push(
                        neonDataService.loadCustomers().then(custs => {
                            if (custs.length > 0) {
                                neonData.Customers = custs;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('InventoryItems')) {
                    requests.push(
                        neonDataService.loadInventory().then(items => {
                            if (items.length > 0) {
                                neonData.InventoryItems = items;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('Expenses')) {
                    requests.push(
                        neonDataService.loadExpenses().then(exps => {
                            if (exps.length > 0) {
                                neonData.Expenses = exps;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('Warranties')) {
                    requests.push(
                        neonDataService.loadWarranties().then(wars => {
                            if (wars.length > 0) {
                                neonData.Warranties = wars;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('Notifications')) {
                    requests.push(
                        neonDataService.loadNotifications().then(notifs => {
                            if (notifs.length > 0) {
                                neonData.Notifications = notifs;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('AuditLogs')) {
                    requests.push(
                        neonDataService.loadAuditLogs().then(logs => {
                            if (logs.length > 0) {
                                neonData.AuditLogs = logs;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                if (sheetsToFetch.includes('CarDatabase')) {
                    requests.push(
                        neonDataService.loadCarDatabase().then(cars => {
                            if (cars.length > 0) {
                                neonData.CarDatabase = cars;
                                hasNeonData = true;
                            }
                        })
                    );
                }

                // Fetch collection tables (templates, recurring expenses, etc.)
                const collectionMapping: Record<string, string> = {
                    'RecurringExpenses': 'recurring_expenses',
                    'SpendCategories': 'spend_categories',
                    'PredefinedCosts': 'predefined_costs',
                    'PredefinedServiceCategories': 'predefined_service_categories',
                    'PredefinedServices': 'predefined_services',
                    'DeliveryHubs': 'delivery_hubs',
                    'ProductRules': 'product_rules',
                    'ServiceTemplates': 'service_templates',
                    'UserSubscriptions': 'user_subscriptions',
                    'SubscriptionPlans': 'subscription_plans',
                    'Bookkeeping': 'bookkeeping',
                    'ProfitLoss': 'profit_loss'
                };

                for (const sheetName of sheetsToFetch) {
                    const neonCol = collectionMapping[sheetName];
                    if (neonCol) {
                        requests.push(
                            neonDataService.loadCollection(neonCol).then(items => {
                                if (items && items.length > 0) {
                                    neonData[sheetName] = items;
                                    hasNeonData = true;
                                }
                            })
                        );
                    }
                }

                await Promise.all(requests);

                if (hasNeonData) {
                    result = { status: 'success', data: neonData };
                    console.log(`⚡ [Page-wise Sync] Successfully loaded ${pageKey} data directly from Neon Database!`);
                }
            }
        } catch (neonFetchErr) {
            console.warn(`[Page-wise Sync] Neon DB fetch skipped/failed for ${pageKey}, proceeding to Google Sheets backup:`, neonFetchErr);
        }

        // 2. Google Sheets Backup: If Neon returned nothing or is empty (skipped in Neon SSOT mode)
        if (!isNeonSoleSourceMode() && (!result || result.status !== 'success' || !result.data)) {
            try {
                result = await fetchWithProxyFallback(sheetsUrl, {
                    proxyUrl,
                    action: 'loadPageData',
                    sheets: sheetsToFetch.join(','),
                    since: lastSyncedIso || undefined,
                    method: 'GET'
                });
            } catch (fetchErr) {
                console.warn(`[Page-wise Sync] fetchWithProxyFallback attempt error for ${pageKey}:`, fetchErr);
            }

            if (!result || result.status !== 'success' || !result.data) {
                console.warn(`[Page-wise Sync] loadPageData failed for ${pageKey}, trying loadAllData fallback...`);
                try {
                    const allResult = await fetchWithProxyFallback(sheetsUrl, {
                        proxyUrl,
                        action: 'loadAllData',
                        since: lastSyncedIso || undefined,
                        method: 'GET'
                    });
                    if (allResult && allResult.status === 'success' && allResult.data) {
                        result = { status: 'success', data: allResult.data };
                    }
                } catch (allErr) {
                    console.warn(`[Page-wise Sync] loadAllData fallback also failed for ${pageKey}:`, allErr);
                }
            }
        }

        // Firestore Fallback: If Google Sheets data is unavailable, try Firestore if initialized
        if (!result || result.status !== 'success' || !result.data) {
            if (db && !isQuotaExceeded()) {
                try {
                    console.log(`🔥 [Page-wise Sync] Attempting Firestore sync for page ${pageKey} collections:`, sheetsToFetch);
                    const fsData: Record<string, any[]> = {};
                    let hasFsData = false;

                    await Promise.all(sheetsToFetch.map(async (sheetName) => {
                        const fsColName = getFirestoreCollectionName(sheetName);
                        try {
                            const snap = await getDocs(collection(db, fsColName));
                            if (!snap.empty) {
                                fsData[sheetName] = snap.docs.map(d => d.data());
                                hasFsData = true;
                            }
                        } catch (e) {
                            if (checkIsQuotaError(e)) {
                                setQuotaExceeded(true);
                            }
                        }
                    }));

                    if (hasFsData) {
                        result = { status: 'success', data: fsData };
                        console.log(`✅ [Page-wise Sync] Successfully loaded ${pageKey} data from Firestore!`);
                    }
                } catch (fsErr) {
                    console.warn(`[Page-wise Sync] Firestore sync attempt failed for ${pageKey}:`, fsErr);
                }
            }
        }

        if (!result || result.status !== 'success' || !result.data) {
            console.info(`[Page-wise Sync] Cloud data endpoint unreachable for page ${pageKey}. Operating seamlessly with cached local storage/IndexedDB.`);
            callbacks.onProgressChange(100, `Loaded from local storage`);
            setTimeout(() => { callbacks.onProgressChange(null, null); }, 800);
            return {
                submissions: safeLocalStorageGet<any[]>('service_app_submissions') || undefined,
                users: safeLocalStorageGet<any[]>('service_app_users') || undefined,
                customerBook: safeLocalStorageGet<any[]>('service_app_customers') || undefined,
                expenses: safeLocalStorageGet<any[]>('service_app_expenses') || undefined,
                spendCategories: safeLocalStorageGet<any[]>('service_app_spend_categories') || undefined,
                recurringExpenses: safeLocalStorageGet<any[]>('service_app_recurring_expenses') || undefined,
                predefinedServiceCategories: safeLocalStorageGet<any[]>('service_app_predefined_service_categories') || undefined,
                predefinedServices: safeLocalStorageGet<any[]>('service_app_predefined_services') || undefined,
                predefinedCosts: safeLocalStorageGet<any[]>('service_app_predefined_costs') || undefined,
                deliveryHubs: safeLocalStorageGet<any[]>('service_app_delivery_hubs') || undefined,
                productRules: safeLocalStorageGet<any[]>('service_app_product_rules') || undefined,
                inventoryItems: safeLocalStorageGet<any[]>('service_app_inventory_items') || undefined,
                inventoryMovements: safeLocalStorageGet<any[]>('service_app_inventory_movements') || undefined,
                serviceRequests: safeLocalStorageGet<any[]>('service_app_service_requests') || undefined,
                warranties: safeLocalStorageGet<any[]>('service_app_warranties') || undefined,
                auditLogs: safeLocalStorageGet<any[]>('service_app_audit_logs') || undefined,
                profitLoss: safeLocalStorageGet<any[]>('service_app_profit_loss') || undefined,
                locationHistory: safeLocalStorageGet<any[]>('service_app_location_history') || undefined,
                notifications: safeLocalStorageGet<any[]>('service_app_notifications') || undefined,
            };
        }

        callbacks.onProgressChange(60, `Parsing and saving records...`);
        const flatData = result.data;
        const updates: Partial<AppData> = {};

        // Setup dynamic progress step tracking based on received sheets
        const receivedKeys = Object.keys(flatData).filter(k => Array.isArray(flatData[k]));
        let completedSteps = 0;
        const totalSteps = Math.max(1, receivedKeys.length);

        const progressStep = (entityName: string) => {
            completedSteps++;
            const progress = Math.min(89, Math.round(60 + (30 * (completedSteps / totalSteps))));
            callbacks.onProgressChange(progress, `Parsing data...`, entityName);
        };

        if (flatData.Users) {
            progressStep("Users");
            updates.users = flatData.Users.map((u: any) => ({
                ...u,
                username: String(u.username || u.Username || u.id || u.email || 'user'),
                name: String(u.name || u.Name || u.username || u.Username || 'User'),
                role: String(u.role || u.Role || 'sales_agent').toLowerCase(),
                agentCategory: u.agentCategory || u.agent_category || u.AgentCategory || 'SALES_AGENT',
                specialties: parseSpecialties(u.specialties || u.Specialties),
                phone: u.phone || u.Phone || u.mobile || '',
                assignedHub: u.assignedHub || u.assigned_hub || u.AssignedHub || '',
                isSalesKpiTracked: u.isSalesKpiTracked !== undefined ? (String(u.isSalesKpiTracked).toUpperCase() === 'TRUE' || u.isSalesKpiTracked === true) : true,
                isEarningsCalculated: u.isEarningsCalculated !== undefined ? (String(u.isEarningsCalculated).toUpperCase() === 'TRUE' || u.isEarningsCalculated === true) : false,
                isOrderTagAssignable: u.isOrderTagAssignable !== undefined ? (String(u.isOrderTagAssignable).toUpperCase() === 'TRUE' || u.isOrderTagAssignable === true) : false,
                notificationPreferences: safeJsonParse(u.notificationPreferences, {}),
                attendanceHistory: safeJsonParse(u.attendanceHistory, []),
                permissions: safeJsonParse(u.permissions, []),
                latitude: u.latitude ? robustParseFloat(u.latitude) : undefined,
                longitude: u.longitude ? robustParseFloat(u.longitude) : undefined
            }));
            safeLocalStorageSet('service_app_users', updates.users);
        }
        if (flatData.LocationHistory) {
            progressStep("Location History");
            updates.locationHistory = flatData.LocationHistory.map((d: any) => ({
                ...d,
                latitude: robustParseFloat(d.latitude),
                longitude: robustParseFloat(d.longitude)
            }));
            safeLocalStorageSet('service_app_location_history', updates.locationHistory);
        }
        if (flatData.Notifications) {
            progressStep("Notifications");
            updates.notifications = flatData.Notifications.map((n: any) => ({
                ...n,
                isRead: String(n.isRead).toUpperCase() === 'TRUE'
            }));
            safeLocalStorageSet('service_app_notifications', updates.notifications);
        }
        if (flatData.Settings) {
            progressStep("App Settings");
            const cloudSettingsPartial = flatData.Settings[0] || {};
            let pageSheetsUrl = cloudSettingsPartial.googleSheetsUrl || currentSettings.googleSheetsUrl;
            let pageDriveUrl = cloudSettingsPartial.googleDriveUploadUrl || currentSettings.googleDriveUploadUrl;
            if (pageDriveUrl === pageSheetsUrl) {
                pageDriveUrl = currentSettings.googleDriveUploadUrl && currentSettings.googleDriveUploadUrl !== pageSheetsUrl
                    ? currentSettings.googleDriveUploadUrl
                    : 'https://script.google.com/macros/s/AKfycbyb35rxNPeDoa4LsEtjdlbMy33a6MEJAlUKKB27aTPfIZd97MgEP-roZ6MRLSXxOMGj/exec';
            }
            updates.settings = {
                ...currentSettings,
                googleSheetsUrl: pageSheetsUrl,
                googleDriveUploadUrl: pageDriveUrl,
                customLogoUrl: cloudSettingsPartial.customLogoUrl || currentSettings.customLogoUrl,
                retentionKpiTargets: cloudSettingsPartial.retentionKpiTargets ? (typeof cloudSettingsPartial.retentionKpiTargets === 'string' ? JSON.parse(cloudSettingsPartial.retentionKpiTargets) : cloudSettingsPartial.retentionKpiTargets) : currentSettings.retentionKpiTargets,
                googleMapsApiKey: cloudSettingsPartial.googleMapsApiKey || cloudSettingsPartial.mapplsApiKey || currentSettings.googleMapsApiKey,
                hubLatitude: cloudSettingsPartial.hubLatitude ? robustParseFloat(cloudSettingsPartial.hubLatitude) : currentSettings.hubLatitude,
                hubLongitude: cloudSettingsPartial.hubLongitude ? robustParseFloat(cloudSettingsPartial.hubLongitude) : currentSettings.hubLongitude,
                maxDistanceKm: cloudSettingsPartial.maxDistanceKm ? robustParseFloat(cloudSettingsPartial.maxDistanceKm) : currentSettings.maxDistanceKm,
            };
        }
        if (flatData.Warranties) {
            progressStep("Warranties");
            updates.warranties = flatData.Warranties.map((w: any) => ({
                ...w,
                warrantyPeriodMonths: robustParseInt(w.warrantyPeriodMonths),
                alertDaysBefore: robustParseInt(w.alertDaysBefore || 30)
            }));
            safeLocalStorageSet('service_app_warranties', updates.warranties);
        }
        if (flatData.AuditLogs) {
            progressStep("Audit Logs");
            updates.auditLogs = flatData.AuditLogs;
            safeLocalStorageSet('service_app_audit_logs', updates.auditLogs);
        }
        if (flatData.RetentionLogs) {
            progressStep("Retention Logs");
            updates.retentionLogs = flatData.RetentionLogs;
            safeLocalStorageSet('service_app_retention_logs', updates.retentionLogs);
        }
        if (flatData.InventoryItems) {
            progressStep("Inventory Items");
            updates.inventoryItems = flatData.InventoryItems.map((inv: any) => ({
                id: String(inv.id || inv.itemId || inv.name?.toLowerCase().replace(/\s+/g, '_') || `inv_${Date.now()}`),
                name: String(inv.name || inv.itemName || inv.id || 'Unnamed Material'),
                stock: robustParseFloat(inv.stock ?? inv.quantity ?? inv.availableStock ?? 0),
                unit: String(inv.unit || 'ml'),
                minStock: robustParseFloat(inv.minStock ?? inv.min_stock ?? 10),
                costPerUnit: robustParseFloat(inv.costPerUnit ?? inv.cost_per_unit ?? inv.price ?? inv.cost ?? 0),
                category: String(inv.category || 'General'),
                lastRestocked: inv.lastRestocked || inv.last_restocked || new Date().toISOString()
            }));
            safeLocalStorageSet('service_app_inventory_items', updates.inventoryItems);
        }
        if (flatData.InventoryMovements) {
            progressStep("Inventory Movements");
            updates.inventoryMovements = flatData.InventoryMovements.map((m: any) => ({
                id: String(m.id || `mvt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`),
                itemId: String(m.itemId || m.item_id || ''),
                itemName: String(m.itemName || m.item_name || ''),
                changeAmount: robustParseFloat(m.changeAmount ?? m.change_amount ?? m.quantity ?? 0),
                reason: String(m.reason || 'Stock Update'),
                timestamp: m.timestamp || new Date().toISOString(),
                performedBy: String(m.performedBy || m.performed_by || 'System')
            }));
            safeLocalStorageSet('service_app_inventory_movements', updates.inventoryMovements);
        }

        if (flatData.SpendCategories) {
            progressStep("Spend Categories");
            updates.spendCategories = flatData.SpendCategories.map((c: any) => ({ ...c }));
            safeLocalStorageSet('service_app_spend_categories', updates.spendCategories);
        }
        if (flatData.Expenses) {
            progressStep("Expenses");
            updates.expenses = flatData.Expenses.map((e: any) => ({ ...e, amount: robustParseFloat(e.amount) }));
            safeLocalStorageSet('service_app_expenses', updates.expenses);
        }
        if (flatData.RecurringExpenses) {
            progressStep("Recurring Expenses");
            updates.recurringExpenses = flatData.RecurringExpenses.map((re: any) => ({ ...re, amount: robustParseFloat(re.amount), isActive: String(re.isActive).toUpperCase() === 'TRUE' }));
            safeLocalStorageSet('service_app_recurring_expenses', updates.recurringExpenses);
        }
        if (flatData.Customers) {
            progressStep("Customers");
            updates.customerBook = flatData.Customers.map((c: any) => {
                let savedVehicles = [];
                try { if (c.savedVehicles) savedVehicles = typeof c.savedVehicles === 'string' ? JSON.parse(c.savedVehicles) : c.savedVehicles; } catch (e) {}
                return {
                    ...c,
                    latitude: c.latitude ? robustParseFloat(c.latitude) : undefined,
                    longitude: c.longitude ? robustParseFloat(c.longitude) : undefined,
                    savedVehicles: Array.isArray(savedVehicles) ? savedVehicles : [],
                    loyaltyScore: c.loyaltyScore !== undefined && c.loyaltyScore !== null && c.loyaltyScore !== '' ? robustParseInt(c.loyaltyScore) : undefined
                };
            });
            safeLocalStorageSet('service_app_customers', updates.customerBook);
        }
        if (flatData.PredefinedServiceCategories) {
            progressStep("Service Categories");
            updates.predefinedServiceCategories = flatData.PredefinedServiceCategories.map((c: any) => ({ ...c, isEnabled: String(c.isEnabled).toUpperCase() === 'TRUE' }));
            safeLocalStorageSet('service_app_predefined_service_categories', updates.predefinedServiceCategories);
        }
        if (flatData.PredefinedServices) {
            progressStep("Predefined Services");
            updates.predefinedServices = flatData.PredefinedServices.map((s: any) => {
                let pricing = undefined;
                try { if (s.pricing) pricing = typeof s.pricing === 'string' ? JSON.parse(s.pricing) : s.pricing; } catch (e) {}
                return {
                    ...s,
                    isEnabled: String(s.isEnabled).toUpperCase() === 'TRUE',
                    pricing,
                    serviceableRadiusKm: s.serviceableRadiusKm ? robustParseFloat(s.serviceableRadiusKm) : undefined,
                    freeRadiusKm: s.freeRadiusKm ? robustParseFloat(s.freeRadiusKm) : undefined,
                    convenienceFeePerKm: s.convenienceFeePerKm ? robustParseFloat(s.convenienceFeePerKm) : undefined,
                    baseConvenienceFee: s.baseConvenienceFee ? robustParseFloat(s.baseConvenienceFee) : undefined,
                    recipe: s.recipe || undefined,
                    materialExpense: s.materialExpense !== undefined ? robustParseFloat(s.materialExpense) : undefined,
                    fuelExpense: s.fuelExpense !== undefined ? robustParseFloat(s.fuelExpense) : undefined,
                    laborExpense: s.laborExpense !== undefined ? robustParseFloat(s.laborExpense) : undefined,
                    otherExpense: s.otherExpense !== undefined ? robustParseFloat(s.otherExpense) : undefined,
                };
            });
            safeLocalStorageSet('service_app_predefined_services', updates.predefinedServices);
        }
        if (flatData.PredefinedCosts) {
            progressStep("Predefined Costs");
            updates.predefinedCosts = flatData.PredefinedCosts.map((c: any) => ({ ...c, value: robustParseFloat(c.value) }));
            safeLocalStorageSet('service_app_predefined_costs', updates.predefinedCosts);
        }
        if (flatData.DeliveryHubs) {
            progressStep("Delivery Hubs");
            updates.deliveryHubs = flatData.DeliveryHubs.map((h: any) => ({ ...h, latitude: robustParseFloat(h.latitude), longitude: robustParseFloat(h.longitude) }));
            safeLocalStorageSet('service_app_delivery_hubs', updates.deliveryHubs);
        }
        if (flatData.ProductRules) {
            progressStep("Product Rules");
            updates.productRules = flatData.ProductRules.map((r: any) => ({
                ...r,
                priority: r.priority ? robustParseInt(r.priority) : undefined,
                freeRadius: r.freeRadius ? robustParseFloat(r.freeRadius) : undefined,
                maxRadius: r.maxRadius ? robustParseFloat(r.maxRadius) : undefined,
                chargePerKm: r.chargePerKm ? robustParseFloat(r.chargePerKm) : undefined,
                roundTrip: r.roundTrip !== undefined ? String(r.roundTrip).toUpperCase() === 'TRUE' : undefined,
                requiresMainService: r.requiresMainService !== undefined ? String(r.requiresMainService).toUpperCase() === 'TRUE' : undefined,
            }));
            safeLocalStorageSet('service_app_product_rules', updates.productRules);
        }
        if (flatData.ServiceRequests) {
            progressStep("Service Requests");
            updates.serviceRequests = flatData.ServiceRequests;
            safeLocalStorageSet('service_app_service_requests', updates.serviceRequests);
        }
        if (flatData.ProfitLoss) {
            progressStep("Profit & Loss");
            updates.profitLoss = flatData.ProfitLoss.map((pl: any) => {
                let dynamicCosts = [];
                try { if (pl.dynamicCosts) dynamicCosts = typeof pl.dynamicCosts === 'string' ? JSON.parse(pl.dynamicCosts) : pl.dynamicCosts; } catch (e) {}
                return {
                    ...pl,
                    materialCost: robustParseFloat(pl.materialCost),
                    laborCost: robustParseFloat(pl.laborCost),
                    otherExpenses: robustParseFloat(pl.otherExpenses),
                    calculatedProfit: robustParseFloat(pl.calculatedProfit),
                    dynamicCosts: Array.isArray(dynamicCosts) ? dynamicCosts : []
                };
            });
            safeLocalStorageSet('service_app_profit_loss', updates.profitLoss);
        }

        if (flatData.Submissions && Array.isArray(flatData.Submissions)) {
            progressStep("Submissions");
            const ensureArr = (val: any): any[] => Array.isArray(val) ? val : [];
            const tyreDetails = ensureArr(flatData.TyreDetails);
            const batteryDetails = ensureArr(flatData.BatteryDetails).map((d: any) => ({ ...d, exchangeValue: robustParseFloat(d?.exchangeValue), newBatteryAmount: robustParseFloat(d?.newBatteryAmount) }));
            const customServices = ensureArr(flatData.CustomServices).map((d: any) => ({ ...d, amount: robustParseFloat(d?.amount) }));
            const categorizedAddonsArr = ensureArr(flatData.CategorizedAddons).map((d: any) => ({ ...d, quantity: robustParseInt(d?.quantity), amount: robustParseFloat(d?.amount) }));

            updates.submissions = flatData.Submissions.map((sub: any): Service => {
                let status = sub.status;
                if (status === "Submitted") status = ServiceStatus.Completed;
                else if (status === "Order Created") status = ServiceStatus.Queued;
                if (!status || !Object.values(ServiceStatus).includes(status as ServiceStatus)) status = ServiceStatus.Queued;
                
                let dynamicAddons = [];
                try { if (sub.dynamicAddons) dynamicAddons = typeof sub.dynamicAddons === 'string' ? JSON.parse(sub.dynamicAddons) : sub.dynamicAddons; } catch(e) {}
                let carWashDetails = undefined;
                try { if (sub.carWashDetails) carWashDetails = typeof sub.carWashDetails === 'string' ? JSON.parse(sub.carWashDetails) : sub.carWashDetails; } catch(e) {}
                let carCareDetails = undefined;
                try { if (sub.carCareDetails) carCareDetails = typeof sub.carCareDetails === 'string' ? JSON.parse(sub.carCareDetails) : sub.carCareDetails; } catch(e) {}
                let statusHistory = [];
                try { if (sub.statusHistory) statusHistory = typeof sub.statusHistory === 'string' ? JSON.parse(sub.statusHistory) : sub.statusHistory; } catch(e) {}

                return {
                    ...sub, status, 
                    customerLatitude: sub.customerLatitude ? robustParseFloat(sub.customerLatitude) : undefined,
                    customerLongitude: sub.customerLongitude ? robustParseFloat(sub.customerLongitude) : undefined,
                    customerDistanceKm: sub.customerDistanceKm ? robustParseFloat(sub.customerDistanceKm) : undefined,
                    customerELoc: sub.customerELoc || undefined,
                    dynamicAddons: Array.isArray(dynamicAddons) ? dynamicAddons : [], 
                    carWashDetails, carCareDetails,
                    statusHistory: Array.isArray(statusHistory) ? statusHistory : [],
                    isSubscription: String(sub.isSubscription).toUpperCase() === 'TRUE',
                    isFollowUp: String(sub.isFollowUp).toUpperCase() === 'TRUE',
                    isAutoScheduled: String(sub.isAutoScheduled).toUpperCase() === 'TRUE',
                    acknowledgement: String(sub.acknowledgement).toUpperCase() === 'TRUE',
                    grandTotal: robustParseFloat(sub.grandTotal),
                    travelCharge: sub.travelCharge ? robustParseFloat(sub.travelCharge) : 0,
                    appointmentId: sub.appointmentId || sub.submissionId,
                    tyreDetails: tyreDetails.filter((d: any) => d.relatedServiceId === sub.submissionId),
                    batteryDetails: batteryDetails.filter((d: any) => d.relatedServiceId === sub.submissionId),
                    customServices: customServices.filter((d: any) => d.relatedServiceId === sub.submissionId),
                    categorizedAddons: categorizedAddonsArr.filter((d: any) => d.relatedServiceId === sub.submissionId),
                    customFieldData: (flatData.CustomFieldData || []).filter((d: any) => d.relatedServiceId === sub.submissionId).map(({ relatedServiceId, ...rest }: any) => rest),
                    serviceSelection: parseServiceSelection(sub.serviceSelection),
                    dependsOn: sub.dependsOn ? String(sub.dependsOn).split(',').map((s: any) => s.trim()) : [],
                };
            });
            safeLocalStorageSet('service_app_submissions', updates.submissions);
        }

        callbacks.onProgressChange(90, `Finalizing states...`);
        console.log(`✅ [Page-wise Sync] Saved page ${pageKey} data to LocalStorage!`);
        callbacks.onProgressChange(100, `Synchronized!`);
        setTimeout(() => {
            callbacks.onProgressChange(null, null);
        }, 1200);
        return updates;
    } catch (error: any) {
        callbacks.onProgressChange(null, null);
        console.warn(`⚠️ [Page-wise Sync] Cloud sync skipped for ${pageKey}:`, error?.message || error);
        return {};
    }
};

export const fetchMoreServiceRequests = async (lastDate?: string, limitCount: number = 100): Promise<ServiceRequest[]> => {
    if (!db || isQuotaExceeded()) return [];
    try {
        console.log(`🔍 [Firestore] Fetching next ${limitCount} serviceRequests starting after:`, lastDate);
        let q;
        if (lastDate) {
            q = query(
                collection(db, 'serviceRequests'),
                orderBy('requestDate', 'desc'),
                startAfter(lastDate),
                limit(limitCount)
            );
        } else {
            q = query(
                collection(db, 'serviceRequests'),
                orderBy('requestDate', 'desc'),
                limit(limitCount)
            );
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => d.data()) as ServiceRequest[];
    } catch (err) {
        if (checkIsQuotaError(err)) {
            setQuotaExceeded(true);
            return [];
        }
        console.error("❌ [Firestore] Failed to fetch more serviceRequests:", err);
        // Fallback if ordered/paginated query fails (e.g., missing index)
        try {
            const snapshot = await getDocs(query(collection(db, 'serviceRequests'), limit(limitCount)));
            return snapshot.docs.map(d => d.data()) as ServiceRequest[];
        } catch (err2) {
            if (checkIsQuotaError(err2)) {
                setQuotaExceeded(true);
            }
            console.error("❌ [Firestore] Fallback fetch also failed:", err2);
            return [];
        }
    }
};

