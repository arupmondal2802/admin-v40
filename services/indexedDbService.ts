import Dexie, { Table } from 'dexie';

export interface KeyValueItem {
    key: string;
    value: any;
    updatedAt: number;
}

export type SyncOperationType = 'upsert' | 'delete' | 'create_order' | 'update_order' | 'delete_order';
export type SyncItemStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface SyncQueueItem {
    id: string;
    type: SyncOperationType;
    entity: string; // e.g., 'Submissions', 'ServiceRequests', 'Customers', 'InventoryItems', etc.
    idField: string; // primary key field e.g. 'submissionId', 'id'
    recordId: string;
    payload: any;
    timestamp: number;
    updatedAt: number;
    status: SyncItemStatus;
    retryCount: number;
    maxRetries: number;
    lastError?: string | null;
    lastAttemptedAt?: number | null;
    tag?: string;
}

class ServiceAppDatabase extends Dexie {
    keyValueStore!: Table<KeyValueItem, string>;
    syncQueue!: Table<SyncQueueItem, string>;

    constructor() {
        super('ServiceAppDatabase');
        this.version(1).stores({
            keyValueStore: 'key, updatedAt'
        });
        this.version(2).stores({
            keyValueStore: 'key, updatedAt',
            syncQueue: 'id, type, entity, timestamp, status, retryCount'
        });
    }
}

export const db = new ServiceAppDatabase();

/**
 * Gets an item from IndexedDB. If not found, checks LocalStorage as a fallback (and migrates it).
 */
export const getIndexedDbItem = async <T>(key: string, defaultValue: T): Promise<T> => {
    try {
        const dbRecord = await db.keyValueStore.get(key);
        if (dbRecord) {
            return dbRecord.value as T;
        }

        // Fallback to LocalStorage and migrate if found
        const localValue = localStorage.getItem(key);
        if (localValue !== null) {
            try {
                const parsed = JSON.parse(localValue);
                // Save to IndexedDB asynchronously
                await setIndexedDbItem(key, parsed);
                // Remove from LocalStorage to free up space
                localStorage.removeItem(key);
                console.log(`📦 [IndexedDB] Successfully migrated key "${key}" from LocalStorage to IndexedDB.`);
                return parsed as T;
            } catch (err) {
                console.warn(`⚠️ [IndexedDB] Failed to parse local storage fallback for key "${key}":`, err);
            }
        }
    } catch (err) {
        console.error(`❌ [IndexedDB] Error loading key "${key}":`, err);
    }
    return defaultValue;
};

/**
 * Sets an item in IndexedDB and removes it from LocalStorage to guarantee no quota issues.
 */
export const setIndexedDbItem = async (key: string, value: any): Promise<void> => {
    try {
        await db.keyValueStore.put({
            key,
            value,
            updatedAt: Date.now()
        });
        // Always clean up LocalStorage to keep it under 5MB
        localStorage.removeItem(key);
    } catch (err) {
        console.error(`❌ [IndexedDB] Error setting key "${key}":`, err);
    }
};

export interface IndexedDbDetailItem {
    key: string;
    value: any;
    updatedAt: number;
    sizeBytes: number;
    itemCount?: number;
}

/**
 * Retrieves all stored items in IndexedDB along with calculated sizes and item counts.
 */
export const getAllIndexedDbItems = async (): Promise<IndexedDbDetailItem[]> => {
    try {
        const allRecords = await db.keyValueStore.toArray();
        return allRecords.map(record => {
            let sizeBytes = 0;
            let itemCount: number | undefined = undefined;
            try {
                const str = JSON.stringify(record.value);
                sizeBytes = str.length * 2;
                if (Array.isArray(record.value)) {
                    itemCount = record.value.length;
                } else if (typeof record.value === 'object' && record.value !== null) {
                    itemCount = Object.keys(record.value).length;
                }
            } catch (e) {
                sizeBytes = 0;
            }
            return {
                key: record.key,
                value: record.value,
                updatedAt: record.updatedAt,
                sizeBytes,
                itemCount
            };
        });
    } catch (err) {
        console.error('Failed to retrieve all IndexedDB items:', err);
        return [];
    }
};

/**
 * Deletes a record from IndexedDB and cleans up LocalStorage.
 */
export const deleteIndexedDbItem = async (key: string): Promise<void> => {
    try {
        await db.keyValueStore.delete(key);
        localStorage.removeItem(key);
    } catch (err) {
        console.error(`Failed to delete IndexedDB item "${key}":`, err);
    }
};

/**
 * Clears all key-value entries in the IndexedDB store.
 */
export const clearIndexedDbStore = async (): Promise<void> => {
    try {
        await db.keyValueStore.clear();
    } catch (err) {
        console.error('Failed to clear IndexedDB store:', err);
    }
};

/**
 * Purges logs and transient historical entries older than specified days (default 60 days)
 * from IndexedDB stores to keep local browser database lean and performant.
 */
export const purgeOldLogsAndData = async (daysCutoff: number = 60): Promise<{ purgedKeys: number; purgedItems: number }> => {
    try {
        const cutoffMs = Date.now() - daysCutoff * 24 * 60 * 60 * 1000;
        const allRecords = await db.keyValueStore.toArray();
        let purgedKeys = 0;
        let purgedItems = 0;

        const logKeys = [
            'service_app_notifications',
            'service_app_location_history',
            'service_app_audit_logs',
            'service_app_retention_logs',
            'service_app_inventory_movements'
        ];

        for (const record of allRecords) {
            // 1. If record value is an array of logs/events, filter out items older than specified days
            if (Array.isArray(record.value)) {
                const initialLength = record.value.length;
                const filtered = record.value.filter((item: any) => {
                    if (!item || typeof item !== 'object') return true;
                    const dateVal = item.timestamp || item.date || item.createdAt || item.requestDate || item.historyDate;
                    if (dateVal) {
                        const itemTime = new Date(dateVal).getTime();
                        if (!isNaN(itemTime)) {
                            return itemTime >= cutoffMs;
                        }
                    }
                    return true;
                });

                if (filtered.length < initialLength) {
                    const removed = initialLength - filtered.length;
                    purgedItems += removed;
                    await db.keyValueStore.put({
                        ...record,
                        value: filtered,
                        updatedAt: Date.now()
                    });
                    console.log(`🧹 [IndexedDB] Purged ${removed} old log records (> ${daysCutoff} days) from key "${record.key}".`);
                }
            } 
            // 2. If it's a standalone log entry or temporary cache item updated before cutoff
            else if (logKeys.includes(record.key) && record.updatedAt < cutoffMs) {
                await db.keyValueStore.delete(record.key);
                purgedKeys++;
                console.log(`🧹 [IndexedDB] Deleted expired log key "${record.key}" older than ${daysCutoff} days.`);
            }
        }

        console.log(`✅ [IndexedDB] Cleanup routine complete: ${purgedItems} log items purged, ${purgedKeys} keys removed.`);
        return { purgedKeys, purgedItems };
    } catch (err) {
        console.error('❌ [IndexedDB] Error during purgeOldLogsAndData routine:', err);
        return { purgedKeys: 0, purgedItems: 0 };
    }
};

/**
 * Sync migration function to run on startup.
 * Migrates large array keys if they are found in LocalStorage and purges old logs (> 60 days).
 */
export const migrateAllToIndexedDb = async () => {
    const keysToMigrate = [
        'service_app_submissions',
        'service_app_notifications',
        'service_app_location_history',
        'service_app_audit_logs',
        'service_app_inventory_movements'
    ];

    for (const key of keysToMigrate) {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            try {
                const parsed = JSON.parse(stored);
                await setIndexedDbItem(key, parsed);
                console.log(`🧹 [Migration] Migrated and cleared "${key}" from LocalStorage.`);
            } catch (err) {
                console.error(`❌ [Migration] Failed to migrate "${key}":`, err);
            }
        }
    }

    // Run automatic purge routine for entries older than 60 days
    await purgeOldLogsAndData(60);
};

// ==========================================
// BACKGROUND SYNC QUEUE OPERATIONS (INDEXEDDB)
// ==========================================

/**
 * Enqueues or updates a sync operation in the IndexedDB syncQueue table.
 */
export const addOrUpdateSyncQueueItem = async (
    item: Partial<SyncQueueItem> & { id: string; entity: string; type: SyncOperationType }
): Promise<SyncQueueItem> => {
    const existing = await db.syncQueue.get(item.id);
    const now = Date.now();
    const fullItem: SyncQueueItem = {
        id: item.id,
        type: item.type,
        entity: item.entity,
        idField: item.idField || 'id',
        recordId: item.recordId || item.id,
        payload: item.payload ?? (existing?.payload ?? {}),
        timestamp: item.timestamp || existing?.timestamp || now,
        updatedAt: now,
        status: item.status || existing?.status || 'pending',
        retryCount: item.retryCount !== undefined ? item.retryCount : (existing?.retryCount || 0),
        maxRetries: item.maxRetries || existing?.maxRetries || 5,
        lastError: item.lastError !== undefined ? item.lastError : (existing?.lastError || null),
        lastAttemptedAt: item.lastAttemptedAt !== undefined ? item.lastAttemptedAt : (existing?.lastAttemptedAt || null),
        tag: item.tag || existing?.tag || 'sync-pending-operations'
    };

    await db.syncQueue.put(fullItem);
    return fullItem;
};

/**
 * Retrieves all pending or failed queue items that need synchronization.
 */
export const getPendingSyncQueueItems = async (): Promise<SyncQueueItem[]> => {
    try {
        const items = await db.syncQueue
            .filter(item => item.status === 'pending' || item.status === 'failed')
            .toArray();
        return items.sort((a, b) => a.timestamp - b.timestamp);
    } catch (err) {
        console.error('❌ [IndexedDB] Failed to get pending sync items:', err);
        return [];
    }
};

/**
 * Retrieves all items in the sync queue regardless of status.
 */
export const getAllSyncQueueItems = async (): Promise<SyncQueueItem[]> => {
    try {
        const items = await db.syncQueue.toArray();
        return items.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
        console.error('❌ [IndexedDB] Failed to get all sync queue items:', err);
        return [];
    }
};

/**
 * Updates the status and error details of a sync queue item.
 */
export const updateSyncQueueItemStatus = async (
    id: string,
    status: SyncItemStatus,
    lastError: string | null = null,
    incrementRetry: boolean = false
): Promise<void> => {
    try {
        const existing = await db.syncQueue.get(id);
        if (existing) {
            await db.syncQueue.update(id, {
                status,
                lastError,
                updatedAt: Date.now(),
                lastAttemptedAt: Date.now(),
                retryCount: incrementRetry ? existing.retryCount + 1 : existing.retryCount
            });
        }
    } catch (err) {
        console.error(`❌ [IndexedDB] Failed to update sync item status for ${id}:`, err);
    }
};

/**
 * Deletes a sync queue item from IndexedDB.
 */
export const deleteSyncQueueItem = async (id: string): Promise<void> => {
    try {
        await db.syncQueue.delete(id);
    } catch (err) {
        console.error(`❌ [IndexedDB] Failed to delete sync item ${id}:`, err);
    }
};

/**
 * Clears all items in the sync queue.
 */
export const clearSyncQueue = async (): Promise<void> => {
    try {
        await db.syncQueue.clear();
    } catch (err) {
        console.error('❌ [IndexedDB] Failed to clear sync queue:', err);
    }
};

/**
 * Computes live summary statistics for the sync queue.
 */
export const getSyncQueueStats = async (): Promise<{
    total: number;
    pending: number;
    syncing: number;
    failed: number;
    synced: number;
}> => {
    try {
        const allItems = await db.syncQueue.toArray();
        return {
            total: allItems.length,
            pending: allItems.filter(i => i.status === 'pending').length,
            syncing: allItems.filter(i => i.status === 'syncing').length,
            failed: allItems.filter(i => i.status === 'failed').length,
            synced: allItems.filter(i => i.status === 'synced').length,
        };
    } catch (err) {
        console.error('❌ [IndexedDB] Failed to get sync queue stats:', err);
        return { total: 0, pending: 0, syncing: 0, failed: 0, synced: 0 };
    }
};

