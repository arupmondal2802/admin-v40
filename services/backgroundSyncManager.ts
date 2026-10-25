/**
 * Background Sync Manager Utility
 * 
 * Coordinates offline operations queue with Service Worker Background Sync API,
 * IndexedDB persistence, exponential backoff retries, and automatic synchronization
 * upon network restoration.
 */

import { 
    SyncQueueItem, 
    SyncOperationType, 
    SyncItemStatus,
    addOrUpdateSyncQueueItem, 
    getPendingSyncQueueItems, 
    getAllSyncQueueItems, 
    updateSyncQueueItemStatus, 
    deleteSyncQueueItem, 
    clearSyncQueue,
    getSyncQueueStats 
} from './indexedDbService';
import { SyncStatus } from '../components/ui/SyncStatusIndicator';

export interface BackgroundSyncConfig {
    sheetsUrl?: string;
    proxyUrl?: string | null;
    onSyncStatusChange?: (status: SyncStatus) => void;
    onSyncError?: (error: string | null) => void;
    onItemSynced?: (item: SyncQueueItem) => void;
}

export interface SyncEvent {
    type: 'ENQUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CLEARED' | 'SW_TRIGGERED' | 'ONLINE_RESTORED';
    item?: SyncQueueItem;
    totalPending?: number;
    message?: string;
    timestamp: number;
}

type SyncEventListener = (event: SyncEvent) => void;

class BackgroundSyncManager {
    private static instance: BackgroundSyncManager;
    private config: BackgroundSyncConfig = {};
    private isProcessing: boolean = false;
    private listeners: Set<SyncEventListener> = new Set();
    private channel: BroadcastChannel | null = null;
    private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
    private syncTag: string = 'sync-pending-operations';
    private heartbeatTimer: any = null;
    private isInitialized: boolean = false;

    private constructor() {
        this.setupBroadcastChannel();
        this.setupNetworkListeners();
    }

    public static getInstance(): BackgroundSyncManager {
        if (!BackgroundSyncManager.instance) {
            BackgroundSyncManager.instance = new BackgroundSyncManager();
        }
        return BackgroundSyncManager.instance;
    }

    /**
     * Initializes the background sync manager with configuration and attaches service worker listeners.
     */
    public async init(config: BackgroundSyncConfig = {}): Promise<void> {
        this.config = { ...this.config, ...config };
        
        if (this.isInitialized) {
            // Already initialized, check if any pending items to sync
            if (navigator.onLine) {
                this.triggerSync('INIT_REFRESH');
            }
            return;
        }

        this.isInitialized = true;

        // Obtain ServiceWorker Registration
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            try {
                const reg = await navigator.serviceWorker.ready;
                this.serviceWorkerRegistration = reg;
                console.log('🔄 [BackgroundSyncManager] ServiceWorker ready for Background Sync.');
                
                // Register background sync capability
                await this.registerServiceWorkerSync();
                
                // Listen to SW messages
                navigator.serviceWorker.addEventListener('message', (event) => {
                    if (event.data?.type === 'SW_SYNC_TRIGGERED') {
                        console.log('⚡ [BackgroundSyncManager] Received SW_SYNC_TRIGGERED from Service Worker.');
                        this.notifyListeners({
                            type: 'SW_TRIGGERED',
                            message: `Service Worker Background Sync triggered (${event.data.tag || 'sync'})`,
                            timestamp: Date.now()
                        });
                        this.processQueue();
                    }
                });
            } catch (err) {
                console.info('ℹ️ [BackgroundSyncManager] Service Worker sync registration deferred:', err);
            }
        }

        // Start periodic heartbeat fallback (every 25s when online)
        this.startHeartbeat();

        // Check pending queue on startup
        const stats = await getSyncQueueStats();
        if (stats.pending > 0 || stats.failed > 0) {
            this.updateStatus('UNSAVED');
            if (navigator.onLine) {
                this.triggerSync('STARTUP_PENDING');
            }
        } else {
            this.updateStatus('SYNCED');
        }
    }

    /**
     * Set up BroadcastChannel to communicate between tabs and service worker
     */
    private setupBroadcastChannel() {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
                this.channel = new BroadcastChannel('a-big-engine-sync');
                this.channel.onmessage = (event) => {
                    const data = event.data;
                    if (data?.type === 'SW_SYNC_TRIGGERED' || data?.type === 'SYNC_REQUEST') {
                        console.log('📡 [BackgroundSyncManager] BroadcastChannel event received:', data.type);
                        this.processQueue();
                    }
                };
            } catch (e) {
                console.warn('⚠️ [BackgroundSyncManager] BroadcastChannel not supported:', e);
            }
        }
    }

    /**
     * Setup window network connectivity listeners
     */
    private setupNetworkListeners() {
        if (typeof window === 'undefined') return;

        window.addEventListener('online', () => {
            console.log('🌐 [BackgroundSyncManager] Network connectivity restored. Triggering automatic queue sync...');
            this.notifyListeners({
                type: 'ONLINE_RESTORED',
                message: 'Internet connection restored. Auto-syncing pending offline items...',
                timestamp: Date.now()
            });
            this.registerServiceWorkerSync();
            this.triggerSync('NETWORK_ONLINE');
        });

        window.addEventListener('offline', () => {
            console.log('📴 [BackgroundSyncManager] Device went offline. Subsequent operations will be queued.');
            this.updateStatus('OFFLINE');
            this.reportError('You are offline. Operations will be queued and synchronized automatically when connection resumes.');
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                this.triggerSync('TAB_ACTIVE');
            }
        });
    }

    /**
     * Registers a background sync tag with the Service Worker registration if supported by the browser.
     */
    public async registerServiceWorkerSync(): Promise<boolean> {
        try {
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                const reg = this.serviceWorkerRegistration || await navigator.serviceWorker.ready;
                if (reg && 'sync' in reg) {
                    await (reg as any).sync.register(this.syncTag);
                    console.log(`✅ [BackgroundSyncManager] Registered Service Worker background sync tag "${this.syncTag}".`);
                    return true;
                }
            }
        } catch (e) {
            console.info('ℹ️ [BackgroundSyncManager] Standard Background Sync API unavailable (using online listeners fallback).');
        }
        return false;
    }

    /**
     * Enqueues a pending operation (e.g. order creation, update, delete) to IndexedDB and triggers sync if online.
     */
    public async queueOperation(params: {
        entity: string;
        type: SyncOperationType;
        record: any;
        idField?: string;
        recordId?: string;
    }): Promise<SyncQueueItem> {
        const idField = params.idField || 'id';
        const recordId = params.recordId || String(params.record?.[idField] || `REC-${Date.now()}`);
        const operationId = `${params.entity}_${recordId}_${params.type}`;

        const queueItem: Partial<SyncQueueItem> & { id: string; entity: string; type: SyncOperationType } = {
            id: operationId,
            entity: params.entity,
            type: params.type,
            idField,
            recordId,
            payload: {
                sheetName: params.entity,
                idField,
                record: params.record,
                recordId
            },
            status: 'pending',
            timestamp: Date.now(),
            retryCount: 0,
            maxRetries: 5,
            lastError: null,
            tag: this.syncTag
        };

        const savedItem = await addOrUpdateSyncQueueItem(queueItem);
        console.log(`📦 [BackgroundSyncManager] Enqueued offline operation: ${params.entity} [${params.type}] (ID: ${recordId})`);

        this.updateStatus('UNSAVED');
        this.notifyListeners({
            type: 'ENQUEUED',
            item: savedItem,
            message: `Queued ${params.entity} for background synchronization`,
            timestamp: Date.now()
        });

        // Inform Service Worker of new queued operation
        this.registerServiceWorkerSync();
        if (this.channel) {
            try {
                this.channel.postMessage({ type: 'QUEUE_UPDATED', itemId: savedItem.id });
            } catch (e) {}
        }

        // If currently online, immediately process
        if (navigator.onLine) {
            this.triggerSync('IMMEDIATE_POST_ENQUEUE');
        } else {
            this.reportError('Offline: Order saved locally. It will automatically synchronize when connection returns.');
        }

        return savedItem;
    }

    /**
     * Triggers sync process if not currently running
     */
    public triggerSync(source: string = 'MANUAL'): Promise<void> {
        console.log(`🚀 [BackgroundSyncManager] triggerSync requested via [${source}]`);
        return this.processQueue();
    }

    /**
     * Executes pending queue operations sequentially with exponential backoff
     */
    public async processQueue(): Promise<void> {
        if (this.isProcessing) {
            console.log('⏳ [BackgroundSyncManager] Sync already in progress, skipping duplicate call.');
            return;
        }

        if (!navigator.onLine) {
            console.log('📴 [BackgroundSyncManager] Cannot sync: Device is currently offline.');
            this.updateStatus('OFFLINE');
            return;
        }

        const pendingItems = await getPendingSyncQueueItems();
        if (pendingItems.length === 0) {
            this.updateStatus('SYNCED');
            this.reportError(null);
            return;
        }

        this.isProcessing = true;
        this.updateStatus('SYNCING');
        this.notifyListeners({
            type: 'SYNCING',
            totalPending: pendingItems.length,
            message: `Processing ${pendingItems.length} pending offline operations...`,
            timestamp: Date.now()
        });

        let successCount = 0;
        let failCount = 0;

        for (const item of pendingItems) {
            try {
                await updateSyncQueueItemStatus(item.id, 'syncing');
                
                // Execute operation against cloud backend
                await this.executeCloudSync(item);

                // Success! Mark item synced or remove from queue
                await deleteSyncQueueItem(item.id);
                successCount++;

                console.log(`✅ [BackgroundSyncManager] Successfully synced queued item ${item.id} (${item.entity})`);
                
                if (this.config.onItemSynced) {
                    this.config.onItemSynced(item);
                }

                this.notifyListeners({
                    type: 'SYNCED',
                    item: { ...item, status: 'synced' },
                    message: `Successfully synchronized ${item.entity} (ID: ${item.recordId})`,
                    timestamp: Date.now()
                });

            } catch (err: any) {
                failCount++;
                const errorMsg = err?.message || 'Sync failed';
                const nextRetry = item.retryCount + 1;
                const isExhausted = nextRetry >= item.maxRetries;

                console.warn(`⚠️ [BackgroundSyncManager] Failed syncing item ${item.id} (Attempt ${nextRetry}/${item.maxRetries}):`, errorMsg);
                
                await updateSyncQueueItemStatus(
                    item.id, 
                    isExhausted ? 'failed' : 'pending', 
                    errorMsg, 
                    true
                );

                this.notifyListeners({
                    type: 'FAILED',
                    item: { ...item, status: isExhausted ? 'failed' : 'pending', retryCount: nextRetry, lastError: errorMsg },
                    message: `Sync failed for ${item.entity}: ${errorMsg}`,
                    timestamp: Date.now()
                });
            }
        }

        this.isProcessing = false;

        // Check remaining stats
        const finalStats = await getSyncQueueStats();
        if (finalStats.pending === 0 && finalStats.failed === 0) {
            this.updateStatus('SYNCED');
            this.reportError(null);
            console.log(`🎉 [BackgroundSyncManager] All offline operations synchronized successfully! (${successCount} items)`);
        } else if (finalStats.failed > 0) {
            this.updateStatus('ERROR');
            this.reportError(`${finalStats.failed} operation(s) encountered sync errors. Retry available.`);
        } else {
            this.updateStatus('UNSAVED');
        }
    }

    /**
     * Executes an individual sync item against Neon DB, Firestore, and Google Sheets
     */
    private async executeCloudSync(item: SyncQueueItem): Promise<void> {
        // Dynamically import cloudDataService and neonDataService to avoid circular dependencies
        const { saveRecordToFirestore, deleteRecordFromFirestore } = await import('./firestoreService');
        const { fetchWithProxyFallback } = await import('./cloudDataService');
        const { neonDataService } = await import('./neonDataService');

        const { entity, type, idField, recordId, payload } = item;
        const sheetsUrl = this.config.sheetsUrl || (typeof window !== 'undefined' ? (window as any).__SHEETS_URL__ : '');
        const proxyUrl = this.config.proxyUrl;
        const record = payload?.record || payload;

        // 1. Mirror operation in Neon PostgreSQL Database (Primary Cloud DB)
        try {
            if (entity === 'Submissions' && record) {
                await neonDataService.saveOrders(record);
            } else if (entity === 'ServiceRequests' && record) {
                await neonDataService.saveLeads(record);
            } else if (entity === 'Users' && record) {
                await neonDataService.saveUsers(record);
            } else if (entity === 'Settings' && record) {
                await neonDataService.saveSettings(record);
            }
        } catch (neonErr: any) {
            console.warn(`⚠️ [BackgroundSyncManager] Neon mirror notice for ${entity}:`, neonErr?.message || neonErr);
        }

        // 2. Mirror operation in Firestore
        try {
            if (type === 'delete' || type === 'delete_order') {
                await deleteRecordFromFirestore(entity, recordId);
            } else {
                await saveRecordToFirestore(entity, record, idField);
            }
        } catch (firestoreErr: any) {
            console.warn(`⚠️ [BackgroundSyncManager] Firestore mirror notice for ${entity}:`, firestoreErr?.message || firestoreErr);
        }

        // 3. Mirror operation in Google Sheets if sheetsUrl is configured
        if (sheetsUrl && sheetsUrl.startsWith('http')) {
            const opAction = (type === 'delete' || type === 'delete_order') ? 'deleteRecord' : 'upsertRecord';
            const gasPayload = {
                action: opAction,
                sheetName: entity,
                idField,
                record: payload?.record || payload,
                recordId
            };

            await fetchWithProxyFallback(sheetsUrl, {
                proxyUrl,
                method: 'POST',
                action: opAction,
                payload: gasPayload,
                timeoutMs: 15000
            });
        }
    }

    /**
     * Retries a single item in the queue
     */
    public async retryOperation(id: string): Promise<boolean> {
        const allItems = await getAllSyncQueueItems();
        const item = allItems.find(i => i.id === id);
        if (!item) return false;

        try {
            await updateSyncQueueItemStatus(item.id, 'syncing');
            await this.executeCloudSync(item);
            await deleteSyncQueueItem(item.id);
            this.updateStatus('SYNCED');
            return true;
        } catch (err: any) {
            await updateSyncQueueItemStatus(item.id, 'failed', err?.message || 'Retry failed', true);
            this.updateStatus('ERROR');
            return false;
        }
    }

    /**
     * Retries all failed operations in the queue
     */
    public async retryAllFailed(): Promise<void> {
        const allItems = await getAllSyncQueueItems();
        for (const item of allItems) {
            if (item.status === 'failed') {
                await updateSyncQueueItemStatus(item.id, 'pending', null);
            }
        }
        await this.processQueue();
    }

    /**
     * Deletes an item from the queue
     */
    public async deleteQueueItem(id: string): Promise<void> {
        await deleteSyncQueueItem(id);
        const stats = await getSyncQueueStats();
        if (stats.pending === 0 && stats.failed === 0) {
            this.updateStatus('SYNCED');
            this.reportError(null);
        }
    }

    /**
     * Clears all items in the queue
     */
    public async clearAllQueue(): Promise<void> {
        await clearSyncQueue();
        this.updateStatus('SYNCED');
        this.reportError(null);
        this.notifyListeners({
            type: 'CLEARED',
            message: 'Cleared all pending operations from queue',
            timestamp: Date.now()
        });
    }

    /**
     * Gets all queue items
     */
    public async getQueue(): Promise<SyncQueueItem[]> {
        return getAllSyncQueueItems();
    }

    /**
     * Gets summary statistics
     */
    public async getStats(): Promise<{ total: number; pending: number; syncing: number; failed: number; synced: number }> {
        return getSyncQueueStats();
    }

    /**
     * Subscribe to real-time sync events
     */
    public subscribe(listener: SyncEventListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners(event: SyncEvent) {
        this.listeners.forEach(fn => {
            try {
                fn(event);
            } catch (e) {
                console.error('Error in sync event listener:', e);
            }
        });
    }

    private updateStatus(status: SyncStatus) {
        if (this.config.onSyncStatusChange) {
            this.config.onSyncStatusChange(status);
        }
    }

    private reportError(error: string | null) {
        if (this.config.onSyncError) {
            this.config.onSyncError(error);
        }
    }

    private startHeartbeat() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        
        const checkPendingAndSync = async () => {
            if (navigator.onLine && !this.isProcessing) {
                const stats = await getSyncQueueStats();
                if (stats.pending > 0) {
                    console.log(`💓 [BackgroundSyncManager] Heartbeat triggered sync for ${stats.pending} pending item(s)...`);
                    this.processQueue();
                }
            }
        };

        this.heartbeatTimer = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return;
            checkPendingAndSync();
        }, 25000);

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    checkPendingAndSync();
                }
            });
        }
    }
}

export const backgroundSyncManager = BackgroundSyncManager.getInstance();
