/**
 * Data Sync Manager - Firebase Cost & Traffic Optimization Engine
 * 
 * Optimizes Firestore reads and writes by:
 * 1. Skipping heavy/ephemeral collections (Notifications, LocationHistory, RetentionLogs) from cloud syncing.
 * 2. Caching core records in IndexedDB with TTL to avoid redundant reads on app reload.
 * 3. Lazy loading secondary data (AuditLogs, InventoryMovements) on-demand with strict limits.
 * 4. Filtering and batching cloud writes so background timers and notifications don't blow up paid quotas.
 */

import {
    getDocs,
    collection,
    query,
    orderBy,
    limit,
    doc,
    getDoc,
    deleteDoc
} from 'firebase/firestore';
import { db, isQuotaExceeded, checkIsQuotaError, setQuotaExceeded } from './firebase';
import { AppData, Settings } from '../types';
import { CAR_BRANDS, TIRE_BRANDS } from '../data/vehicleData';
import { DEFAULT_PRICING_CONFIG } from '../constants';
import { getIndexedDbItem, setIndexedDbItem } from './indexedDbService';

// Ephemeral collections that are kept local-first (never synced in bulk from/to Firestore)
export const EPHEMERAL_COLLECTIONS = new Set<string>([
    'notifications',
    'Notifications',
    'locationHistory',
    'LocationHistory',
    'retentionLogs',
    'RetentionLogs'
]);

// Collections loaded strictly on-demand (never loaded on initial app boot)
export const ON_DEMAND_COLLECTIONS = new Set<string>([
    'auditLogs',
    'AuditLogs',
    'inventoryMovements',
    'InventoryMovements',
    'miscSpends',
    'MiscSpends',
    'bookkeeping',
    'Bookkeeping',
    'profitLoss',
    'ProfitLoss'
]);

// Metrics Tracker for Cost Transparency
interface SyncMetrics {
    readsPrevented: number;
    writesPrevented: number;
    actualReads: number;
    actualWrites: number;
    lastCoreSync: string | null;
    isCostOptimizedMode: boolean;
}

const METRICS_STORAGE_KEY = 'service_app_sync_metrics';

const getInitialMetrics = (): SyncMetrics => {
    try {
        const saved = localStorage.getItem(METRICS_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
        readsPrevented: 0,
        writesPrevented: 0,
        actualReads: 0,
        actualWrites: 0,
        lastCoreSync: null,
        isCostOptimizedMode: true
    };
};

let syncMetrics: SyncMetrics = getInitialMetrics();

const persistMetrics = () => {
    try {
        localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(syncMetrics));
    } catch (e) {}
};

export const getSyncMetrics = (): SyncMetrics => ({ ...syncMetrics });

export const recordReadSaved = (count: number = 1) => {
    syncMetrics.readsPrevented += count;
    persistMetrics();
};

export const recordWritePrevented = (count: number = 1) => {
    syncMetrics.writesPrevented += count;
    persistMetrics();
};

export const recordActualRead = (count: number = 1) => {
    syncMetrics.actualReads += count;
    persistMetrics();
};

export const recordActualWrite = (count: number = 1) => {
    syncMetrics.actualWrites += count;
    persistMetrics();
};

export const resetSyncMetrics = () => {
    syncMetrics = {
        readsPrevented: 0,
        writesPrevented: 0,
        actualReads: 0,
        actualWrites: 0,
        lastCoreSync: null,
        isCostOptimizedMode: true
    };
    persistMetrics();
};

/**
 * Checks if a collection is ephemeral and should skip Firestore syncing
 */
export const shouldSkipCloudSync = (collectionOrSheetName: string): boolean => {
    return EPHEMERAL_COLLECTIONS.has(collectionOrSheetName);
};

/**
 * Checks if a collection is on-demand and should skip initial boot fetching
 */
export const isOnDemandCollection = (collectionOrSheetName: string): boolean => {
    return ON_DEMAND_COLLECTIONS.has(collectionOrSheetName);
};

// Cache TTL in milliseconds (10 minutes)
const CORE_CACHE_TTL_MS = 10 * 60 * 1000;
const LAST_SYNC_KEY = 'service_app_last_core_sync_time';

/**
 * Optimized Core Read: Fetches only essential operational collections
 * Omits: Notifications, LocationHistory, RetentionLogs, AuditLogs, InventoryMovements
 */
export const loadCoreFromFirestore = async (currentSettings: Settings, forceRefresh: boolean = false): Promise<AppData | null> => {
    if (!db || isQuotaExceeded()) return null;

    const now = Date.now();
    const lastSyncTime = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
    const isCacheFresh = !forceRefresh && (now - lastSyncTime < CORE_CACHE_TTL_MS);

    if (isCacheFresh) {
        console.log("⚡ [DataSyncManager] Core Firestore cache is fresh (<10m). Skipping cloud read to save quota.");
        recordReadSaved(15); // Saved ~15 core collection queries
        return null;
    }

    try {
        console.log("🔥 [DataSyncManager] Fetching cost-optimized Core collections from Firestore...");

        // Query only essential operational collections
        const [
            usersDocs,
            submissionsDocs,
            subscriptionPlansDocs,
            userSubscriptionsDocs,
            serviceTemplatesDocs,
            serviceRequestsDocs,
            spendCategoriesDocs,
            predefinedCostsDocs,
            settingsDocs,
            vehicleDataDocs,
            tyreDataDocs,
            pricingConfigDocs,
            predefinedServiceCategoriesDocs,
            predefinedServicesDocs,
            deliveryHubsDocs,
            productRulesDocs,
            customerBookDocs,
            inventoryItemsDocs,
            expensesDocs,
            recurringExpensesDocs,
            warrantiesDocs
        ] = await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'submissions')),
            getDocs(collection(db, 'subscriptionPlans')),
            getDocs(collection(db, 'userSubscriptions')),
            getDocs(collection(db, 'serviceTemplates')),
            (async () => {
                try {
                    return await getDocs(query(collection(db, 'serviceRequests'), orderBy('requestDate', 'desc'), limit(50)));
                } catch (e) {
                    try {
                        return await getDocs(query(collection(db, 'serviceRequests'), limit(50)));
                    } catch (e2) {
                        return { docs: [] } as any;
                    }
                }
            })(),
            getDocs(collection(db, 'spendCategories')),
            getDocs(collection(db, 'predefinedCosts')),
            getDocs(collection(db, 'settings')),
            getDocs(collection(db, 'vehicleData')),
            getDocs(collection(db, 'tyreData')),
            getDocs(collection(db, 'pricingConfig')),
            getDocs(collection(db, 'predefinedServiceCategories')),
            getDocs(collection(db, 'predefinedServices')),
            getDocs(collection(db, 'deliveryHubs')),
            getDocs(collection(db, 'productRules')),
            getDocs(collection(db, 'customers')),
            getDocs(collection(db, 'inventoryItems')),
            getDocs(collection(db, 'expenses')),
            getDocs(collection(db, 'recurringExpenses')),
            getDocs(collection(db, 'warranties'))
        ]);

        if (usersDocs.empty && submissionsDocs.empty) {
            console.log("ℹ️ [DataSyncManager] Firestore database has no users/submissions yet.");
            return null;
        }

        const parseDocs = (docs: any[]) => docs.map(d => d.data());

        const users = parseDocs(usersDocs.docs);
        const submissions = parseDocs(submissionsDocs.docs);
        const subscriptionPlans = parseDocs(subscriptionPlansDocs.docs);
        const userSubscriptions = parseDocs(userSubscriptionsDocs.docs);
        const serviceTemplates = parseDocs(serviceTemplatesDocs.docs);
        const serviceRequests = parseDocs(serviceRequestsDocs.docs);
        const spendCategories = parseDocs(spendCategoriesDocs.docs);
        const predefinedCosts = parseDocs(predefinedCostsDocs.docs);
        
        let settings = currentSettings;
        if (!settingsDocs.empty) {
            settings = { ...currentSettings, ...settingsDocs.docs[0].data() };
        }

        let vehicleData = CAR_BRANDS;
        if (!vehicleDataDocs.empty) {
            try {
                const raw = vehicleDataDocs.docs[0].data().data;
                vehicleData = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) {}
        }

        let tyreData = { brands: TIRE_BRANDS, models: [], sizes: [] };
        if (!tyreDataDocs.empty) {
            try {
                const raw = tyreDataDocs.docs[0].data().data;
                tyreData = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) {}
        }

        let pricingConfig = DEFAULT_PRICING_CONFIG;
        if (!pricingConfigDocs.empty) {
            try {
                const raw = pricingConfigDocs.docs[0].data().data;
                pricingConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
            } catch (e) {}
        }

        const predefinedServiceCategories = parseDocs(predefinedServiceCategoriesDocs.docs);
        const predefinedServices = parseDocs(predefinedServicesDocs.docs);
        const deliveryHubs = parseDocs(deliveryHubsDocs.docs);
        const productRules = parseDocs(productRulesDocs.docs);
        const customerBook = parseDocs(customerBookDocs.docs);
        const inventoryItems = parseDocs(inventoryItemsDocs.docs);
        const expenses = parseDocs(expensesDocs.docs);
        const recurringExpenses = parseDocs(recurringExpensesDocs.docs);
        const warranties = parseDocs(warrantiesDocs.docs);

        // Retrieve local ephemeral / on-demand collections from IndexedDB instead of consuming cloud reads
        const [
            localNotifications,
            localLocationHistory,
            localAuditLogs,
            localRetentionLogs,
            localInventoryMovements,
            localMiscSpends,
            localBookkeeping,
            localProfitLoss
        ] = await Promise.all([
            getIndexedDbItem<any[]>('service_app_notifications', []),
            getIndexedDbItem<any[]>('service_app_location_history', []),
            getIndexedDbItem<any[]>('service_app_audit_logs', []),
            getIndexedDbItem<any[]>('service_app_retention_logs', []),
            getIndexedDbItem<any[]>('service_app_inventory_movements', []),
            getIndexedDbItem<any[]>('service_app_misc_spends', []),
            getIndexedDbItem<any[]>('service_app_bookkeeping', []),
            getIndexedDbItem<any[]>('service_app_profit_loss', [])
        ]);

        // Record metrics
        const totalDocsRead = usersDocs.size + submissionsDocs.size + subscriptionPlansDocs.size + 
            userSubscriptionsDocs.size + serviceTemplatesDocs.size + serviceRequestsDocs.size + 
            spendCategoriesDocs.size + predefinedCostsDocs.size + settingsDocs.size + 
            vehicleDataDocs.size + tyreDataDocs.size + pricingConfigDocs.size + 
            predefinedServiceCategoriesDocs.size + predefinedServicesDocs.size + 
            deliveryHubsDocs.size + productRulesDocs.size + customerBookDocs.size + 
            inventoryItemsDocs.size + expensesDocs.size + recurringExpensesDocs.size + 
            warrantiesDocs.size;

        recordActualRead(totalDocsRead);
        recordReadSaved(localNotifications.length + localLocationHistory.length + localAuditLogs.length + localRetentionLogs.length + localInventoryMovements.length);

        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        syncMetrics.lastCoreSync = new Date().toISOString();
        persistMetrics();

        console.log(`⚡ [DataSyncManager] Optimized Core load complete (${totalDocsRead} docs read). Heavy collections served locally!`);

        return {
            users,
            submissions,
            subscriptionPlans,
            userSubscriptions,
            serviceTemplates,
            serviceRequests,
            notifications: localNotifications,
            locationHistory: localLocationHistory,
            miscSpends: localMiscSpends,
            bookkeeping: localBookkeeping,
            profitLoss: localProfitLoss,
            businessOverheads: [],
            spendCategories,
            predefinedCosts,
            expenses,
            recurringExpenses,
            settings,
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
            inventoryMovements: localInventoryMovements,
            auditLogs: localAuditLogs,
            warranties,
            retentionLogs: localRetentionLogs
        };
    } catch (err) {
        if (checkIsQuotaError(err)) {
            setQuotaExceeded(true);
        }
        console.warn("⚠️ [DataSyncManager] Failed to load core data from Firestore:", err);
        return null;
    }
};

/**
 * On-Demand Fetcher: Loads specific collection on user request with strict limit
 */
export const fetchOnDemandFromFirestore = async (collectionName: string, limitCount: number = 30): Promise<any[]> => {
    if (!db || isQuotaExceeded()) return [];

    try {
        console.log(`🔍 [DataSyncManager] Lazy-fetching on-demand collection "${collectionName}" (limit: ${limitCount})...`);
        const colRef = collection(db, collectionName);
        let q;
        try {
            q = query(colRef, orderBy('timestamp', 'desc'), limit(limitCount));
        } catch (e) {
            q = query(colRef, limit(limitCount));
        }

        const snapshot = await getDocs(q);
        recordActualRead(snapshot.size);
        const data = snapshot.docs.map(doc => doc.data());
        console.log(`✅ [DataSyncManager] Loaded ${data.length} records for "${collectionName}" on-demand.`);
        return data;
    } catch (err) {
        if (checkIsQuotaError(err)) {
            setQuotaExceeded(true);
        }
        console.warn(`⚠️ [DataSyncManager] On-demand fetch failed for "${collectionName}":`, err);
        return [];
    }
};

// ==========================================
// AUDIT LOG INCREMENTAL TIMESTAMP SYNC ENGINE
// ==========================================

export const LAST_AUDIT_SYNC_KEY = 'service_app_last_audit_sync_timestamp';
const SYNCED_AUDIT_IDS_KEY = 'service_app_synced_audit_log_ids';
const MAX_CACHED_SYNCED_IDS = 2000;

// In-memory cache of synced IDs for ultra-fast O(1) checks
let syncedAuditIdsSet: Set<string> | null = null;

const loadSyncedAuditIds = (): Set<string> => {
    if (syncedAuditIdsSet) return syncedAuditIdsSet;
    try {
        const raw = localStorage.getItem(SYNCED_AUDIT_IDS_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            syncedAuditIdsSet = new Set(Array.isArray(arr) ? arr : []);
            return syncedAuditIdsSet;
        }
    } catch (e) {}
    syncedAuditIdsSet = new Set();
    return syncedAuditIdsSet;
};

const persistSyncedAuditIds = () => {
    if (!syncedAuditIdsSet) return;
    try {
        const arr = Array.from(syncedAuditIdsSet);
        const trimmed = arr.length > MAX_CACHED_SYNCED_IDS ? arr.slice(-MAX_CACHED_SYNCED_IDS) : arr;
        localStorage.setItem(SYNCED_AUDIT_IDS_KEY, JSON.stringify(trimmed));
    } catch (e) {}
};

/**
 * Returns the Unix timestamp (ms) of the last successful AuditLog sync
 */
export const getLastAuditLogSyncTimestamp = (): number => {
    try {
        const saved = localStorage.getItem(LAST_AUDIT_SYNC_KEY);
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
            const parsedDate = new Date(saved).getTime();
            if (!isNaN(parsedDate) && parsedDate > 0) return parsedDate;
        }
    } catch (e) {}
    return 0;
};

/**
 * Updates the last successful AuditLog sync timestamp
 */
export const setLastAuditLogSyncTimestamp = (timestamp: number | string): void => {
    try {
        const num = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (!isNaN(num) && num > 0) {
            localStorage.setItem(LAST_AUDIT_SYNC_KEY, String(num));
        }
    } catch (e) {}
};

/**
 * Checks if a specific audit log ID has already been uploaded/synced
 */
export const isAuditLogSynced = (logId: string): boolean => {
    if (!logId) return false;
    const set = loadSyncedAuditIds();
    return set.has(String(logId));
};

/**
 * Marks an audit log as synced and optionally advances the sync timestamp
 */
export const markAuditLogSynced = (logId: string, timestamp?: string | number): void => {
    if (!logId) return;
    const set = loadSyncedAuditIds();
    set.add(String(logId));
    persistSyncedAuditIds();

    if (timestamp) {
        const logTime = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (!isNaN(logTime) && logTime > 0) {
            const currentLast = getLastAuditLogSyncTimestamp();
            if (logTime > currentLast) {
                setLastAuditLogSyncTimestamp(logTime);
            }
        }
    }
};

/**
 * Marks multiple audit logs as synced in batch
 */
export const markMultipleAuditLogsSynced = (logs: { id: string; timestamp?: string | number }[]): void => {
    if (!logs || logs.length === 0) return;
    const set = loadSyncedAuditIds();
    let maxTime = getLastAuditLogSyncTimestamp();

    logs.forEach(l => {
        if (l && l.id) {
            set.add(String(l.id));
            if (l.timestamp) {
                const t = typeof l.timestamp === 'string' ? new Date(l.timestamp).getTime() : l.timestamp;
                if (!isNaN(t) && t > maxTime) {
                    maxTime = t;
                }
            }
        }
    });

    persistSyncedAuditIds();
    if (maxTime > 0) {
        setLastAuditLogSyncTimestamp(maxTime);
    }
};

/**
 * Filters an AuditLog array to ONLY return items created since the last successful sync timestamp.
 * Avoids re-evaluating the full historical dataset.
 */
export const filterNewAuditLogs = (logs: any[]): { newLogs: any[]; skippedCount: number; lastSyncTime: number } => {
    if (!Array.isArray(logs) || logs.length === 0) {
        return { newLogs: [], skippedCount: 0, lastSyncTime: getLastAuditLogSyncTimestamp() };
    }

    const lastSyncTime = getLastAuditLogSyncTimestamp();
    const syncedIds = loadSyncedAuditIds();

    // If never synced before, all logs are eligible, but we still respect explicit IDs
    if (lastSyncTime === 0 && syncedIds.size === 0) {
        return { newLogs: logs, skippedCount: 0, lastSyncTime: 0 };
    }

    const newLogs: any[] = [];
    let skippedCount = 0;

    for (const log of logs) {
        if (!log || !log.id) {
            skippedCount++;
            continue;
        }

        const logId = String(log.id);

        // O(1) already-synced ID check
        if (syncedIds.has(logId)) {
            skippedCount++;
            continue;
        }

        // Fast timestamp check: if timestamp exists and is <= lastSyncTime, skip re-evaluating
        if (log.timestamp && lastSyncTime > 0) {
            const logTime = new Date(log.timestamp).getTime();
            if (!isNaN(logTime) && logTime <= lastSyncTime) {
                // Mark in set so subsequent lookups are O(1)
                syncedIds.add(logId);
                skippedCount++;
                continue;
            }
        }

        newLogs.push(log);
    }

    return { newLogs, skippedCount, lastSyncTime };
};

/**
 * Get summary stats of AuditLog sync state
 */
export const getAuditLogSyncStats = () => {
    const lastSyncTimestamp = getLastAuditLogSyncTimestamp();
    const set = loadSyncedAuditIds();
    return {
        lastSyncTimestamp,
        lastSyncFormatted: lastSyncTimestamp > 0 ? new Date(lastSyncTimestamp).toLocaleString() : 'Never Synced',
        syncedIdsCount: set.size
    };
};

/**
 * Reset AuditLog sync tracking (e.g. for complete force resync)
 */
export const resetAuditLogSyncState = () => {
    try {
        localStorage.removeItem(LAST_AUDIT_SYNC_KEY);
        localStorage.removeItem(SYNCED_AUDIT_IDS_KEY);
        syncedAuditIdsSet = new Set();
        console.log("🔄 [DataSyncManager] AuditLog sync timestamp and ID cache reset.");
    } catch (e) {}
};

// ==========================================
// AUDIT LOG 90-DAY CLEAN UP & PRUNING ENGINE
// ==========================================

export const AUTO_PRUNE_AUDIT_KEY = 'service_app_auto_prune_audit_logs';

export interface AuditLogCleanupStats {
    totalLogs: number;
    olderLogsCount: number;
    retainedLogsCount: number;
    daysCutoff: number;
    cutoffDateIso: string;
    cutoffDateFormatted: string;
    estimatedBytesFreed: number;
    formattedBytesFreed: string;
    oldestLogDate: string | null;
    newestLogDate: string | null;
    sampleOlderLogs: any[];
}

export interface AuditLogPurgeResult {
    success: boolean;
    totalProcessed: number;
    deletedCount: number;
    retainedCount: number;
    daysCutoff: number;
    cutoffDate: string;
    localBytesFreed: number;
    formattedBytesFreed: string;
    cloudDeletedCount: number;
    error?: string;
}

/**
 * Format bytes to readable string (B, KB, MB)
 */
const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * Retrieves audit logs from localStorage or memory
 */
export const getLocalAuditLogs = (): any[] => {
    try {
        const raw = localStorage.getItem('service_app_audit_logs');
        if (raw) {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
    } catch (e) {}
    return [];
};

/**
 * Analyzes local audit logs against a daysCutoff threshold (default: 90 days)
 * to calculate storage savings and items to be cleaned up.
 */
export const getAuditLogCleanupAnalysis = async (daysCutoff: number = 90): Promise<AuditLogCleanupStats> => {
    let logs = getLocalAuditLogs();
    
    // Fallback to IndexedDB if localStorage is empty
    if (logs.length === 0) {
        try {
            logs = await getIndexedDbItem<any[]>('service_app_audit_logs', []);
        } catch (e) {}
    }

    const cutoffMs = Date.now() - daysCutoff * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);

    let olderLogsCount = 0;
    let olderLogsBytes = 0;
    let oldestTime: number | null = null;
    let newestTime: number | null = null;
    const sampleOlderLogs: any[] = [];

    for (const log of logs) {
        if (!log) continue;
        const rawDate = log.timestamp || log.createdAt || log.date;
        let logTime: number | null = null;

        if (rawDate) {
            const parsed = new Date(rawDate).getTime();
            if (!isNaN(parsed)) {
                logTime = parsed;
                if (oldestTime === null || parsed < oldestTime) oldestTime = parsed;
                if (newestTime === null || parsed > newestTime) newestTime = parsed;
            }
        }

        // If log timestamp is older than cutoff (or timestamp is missing/corrupted), mark for cleanup
        if (logTime === null || logTime < cutoffMs) {
            olderLogsCount++;
            const byteSize = (JSON.stringify(log).length) * 2; // UTF-16 approximate size
            olderLogsBytes += byteSize;
            if (sampleOlderLogs.length < 5) {
                sampleOlderLogs.push(log);
            }
        }
    }

    const totalLogs = logs.length;
    const retainedLogsCount = totalLogs - olderLogsCount;

    return {
        totalLogs,
        olderLogsCount,
        retainedLogsCount,
        daysCutoff,
        cutoffDateIso: cutoffDate.toISOString(),
        cutoffDateFormatted: cutoffDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
        estimatedBytesFreed: olderLogsBytes,
        formattedBytesFreed: formatBytes(olderLogsBytes),
        oldestLogDate: oldestTime ? new Date(oldestTime).toLocaleDateString() : null,
        newestLogDate: newestTime ? new Date(newestTime).toLocaleDateString() : null,
        sampleOlderLogs
    };
};

/**
 * Executes cleanup to delete audit logs older than daysCutoff (default 90 days)
 * from LocalStorage, IndexedDB, and Cloud Firestore.
 */
export const purgeOldAuditLogs = async (
    daysCutoff: number = 90,
    options: { deleteFromFirestore?: boolean } = {}
): Promise<AuditLogPurgeResult> => {
    const deleteFromFirestore = options.deleteFromFirestore !== false;
    const cutoffMs = Date.now() - daysCutoff * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(cutoffMs);

    try {
        let logs = getLocalAuditLogs();
        if (logs.length === 0) {
            logs = await getIndexedDbItem<any[]>('service_app_audit_logs', []);
        }

        const toDelete: any[] = [];
        const toKeep: any[] = [];
        let bytesFreed = 0;

        for (const log of logs) {
            if (!log) continue;
            const rawDate = log.timestamp || log.createdAt || log.date;
            let logTime: number | null = null;

            if (rawDate) {
                const parsed = new Date(rawDate).getTime();
                if (!isNaN(parsed)) logTime = parsed;
            }

            if (logTime === null || logTime < cutoffMs) {
                toDelete.push(log);
                bytesFreed += (JSON.stringify(log).length) * 2;
            } else {
                toKeep.push(log);
            }
        }

        // 1. Update LocalStorage
        try {
            localStorage.setItem('service_app_audit_logs', JSON.stringify(toKeep));
        } catch (e) {}

        // 2. Update IndexedDB
        try {
            await setIndexedDbItem('service_app_audit_logs', toKeep);
        } catch (e) {}

        // 3. Remove deleted IDs from synced cache
        const syncedIds = loadSyncedAuditIds();
        toDelete.forEach(l => {
            if (l?.id) syncedIds.delete(String(l.id));
        });
        persistSyncedAuditIds();

        // 4. Delete matching logs from Cloud Firestore
        let cloudDeletedCount = 0;
        if (deleteFromFirestore && db && !isQuotaExceeded() && toDelete.length > 0) {
            const chunkSize = 25;
            for (let i = 0; i < toDelete.length; i += chunkSize) {
                if (isQuotaExceeded()) break;
                const chunk = toDelete.slice(i, i + chunkSize);
                await Promise.all(
                    chunk.map(async (item) => {
                        if (!item?.id) return;
                        try {
                            const docRef = doc(db, 'auditLogs', String(item.id));
                            await deleteDoc(docRef);
                            cloudDeletedCount++;
                        } catch (itemErr: any) {
                            if (checkIsQuotaError(itemErr)) {
                                setQuotaExceeded(true);
                            }
                        }
                    })
                );
            }
        }

        console.log(`🧹 [DataSyncManager] AuditLog Clean Up complete: ${toDelete.length} old logs purged (> ${daysCutoff} days), ${toKeep.length} retained, ${cloudDeletedCount} removed from Cloud Firestore.`);

        return {
            success: true,
            totalProcessed: logs.length,
            deletedCount: toDelete.length,
            retainedCount: toKeep.length,
            daysCutoff,
            cutoffDate: cutoffDate.toLocaleDateString(),
            localBytesFreed: bytesFreed,
            formattedBytesFreed: formatBytes(bytesFreed),
            cloudDeletedCount
        };
    } catch (err: any) {
        console.error('❌ [DataSyncManager] Failed to execute AuditLog clean up:', err);
        return {
            success: false,
            totalProcessed: 0,
            deletedCount: 0,
            retainedCount: 0,
            daysCutoff,
            cutoffDate: cutoffDate.toLocaleDateString(),
            localBytesFreed: 0,
            formattedBytesFreed: '0 B',
            cloudDeletedCount: 0,
            error: err?.message || 'Failed to purge old audit logs'
        };
    }
};

/**
 * Auto-Prune Configuration
 */
export const getAutoPruneSetting = (): { enabled: boolean; days: number } => {
    try {
        const saved = localStorage.getItem(AUTO_PRUNE_AUDIT_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                enabled: parsed.enabled !== false,
                days: parsed.days || 90
            };
        }
    } catch (e) {}
    return { enabled: true, days: 90 };
};

export const setAutoPruneSetting = (enabled: boolean, days: number = 90): void => {
    try {
        localStorage.setItem(AUTO_PRUNE_AUDIT_KEY, JSON.stringify({ enabled, days, updatedAt: new Date().toISOString() }));
    } catch (e) {}
};

/**
 * Runs background auto-prune on startup if enabled and last run was > 24 hours ago
 */
export const runStartupAuditLogPrune = async (): Promise<void> => {
    try {
        const setting = getAutoPruneSetting();
        if (!setting.enabled) return;

        const lastPruneKey = 'service_app_last_auto_prune_time';
        const lastPrune = localStorage.getItem(lastPruneKey);
        const now = Date.now();

        if (lastPrune) {
            const lastTime = parseInt(lastPrune, 10);
            // Run at most once every 24 hours
            if (!isNaN(lastTime) && now - lastTime < 24 * 60 * 60 * 1000) {
                return;
            }
        }

        const res = await purgeOldAuditLogs(setting.days, { deleteFromFirestore: true });
        localStorage.setItem(lastPruneKey, String(now));
        if (res.deletedCount > 0) {
            console.log(`🤖 [Auto-Prune] Cleaned up ${res.deletedCount} audit logs older than ${setting.days} days on startup.`);
        }
    } catch (e) {
        console.warn('⚠️ [Auto-Prune] Startup check failed non-critically:', e);
    }
};

/**
 * Processes pending offline operations across the local queue and background sync manager.
 */
export const processPendingQueue = async (sheetsUrl?: string, proxyUrl?: string | null): Promise<void> => {
    try {
        console.log("⚡ [DataSyncManager] Processing pending offline queue...");
        const targetSheetsUrl = sheetsUrl || (typeof localStorage !== 'undefined' ? localStorage.getItem('googleSheetsUrl') : null) || 'https://script.google.com/macros/s/AKfycbyPuNQGgUfJnpcV_dCFs-2ppA6bdYW6bKr-2sTnPI1d6Ww_yjDA0q8fc6PpiY2wZncl/exec';
        
        // 1. Dynamic import of cloudDataService to avoid circular dependency
        const { retryAllOfflineQueue } = await import('./cloudDataService');
        await retryAllOfflineQueue(targetSheetsUrl, proxyUrl);

        // 2. Trigger IndexedDB background sync manager
        const { backgroundSyncManager } = await import('./backgroundSyncManager');
        await backgroundSyncManager.triggerSync('DELTA_SYNC_RECONNECT');

        // 3. Automated Delta Sync Check with Neon Database
        const { neonDataService } = await import('./neonDataService');
        const syncRes = await neonDataService.triggerDeltaSync(targetSheetsUrl);
        if (syncRes.skipped) {
            recordReadSaved(10); // Saved unnecessary reads/bandwidth
            console.log(`⚡ [DataSyncManager] Neon DB row count matches Google Sheets. Full sync skipped.`);
        }
    } catch (err) {
        console.warn("⚠️ [DataSyncManager] Notice while processing pending queue:", err);
    }
};

/**
 * Triggers smart backend delta sync with row comparison and skipping
 */
export const triggerBackendDeltaSync = async (sheetsUrl?: string, forceFull: boolean = false) => {
    const { neonDataService } = await import('./neonDataService');
    const res = await neonDataService.triggerDeltaSync(sheetsUrl, forceFull);
    if (res.skipped) {
        recordReadSaved(25);
    } else {
        recordActualWrite(res.deltaSummary ? Object.values(res.deltaSummary).reduce((a, b) => a + b, 0) : 1);
    }
    return res;
};

export const dataSyncManager = {
    loadCoreFromFirestore,
    fetchOnDemandFromFirestore,
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
    runStartupAuditLogPrune,
    getSyncMetrics,
    resetSyncMetrics,
    processPendingQueue,
    triggerBackendDeltaSync
};

export default dataSyncManager;



