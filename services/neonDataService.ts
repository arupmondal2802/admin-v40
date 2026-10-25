import { Service, ServiceRequest } from '../types';
import { getBackendBaseUrl } from './backendConfig';

/**
 * Service to interact with Neon PostgreSQL via Cloudflare Workers / backend proxy routes.
 * Employs in-memory caching and request deduplication to strictly protect Cloudflare bandwidth limits.
 */

const getNeonBaseUrl = (): string => {
  return getBackendBaseUrl();
};

let isNeonAvailable: boolean | null = null;
let lastCheckTimestamp = 0;
const AVAILABILITY_TTL_MS = 5000; // 5-second cooldown
let checkingPromise: Promise<boolean> | null = null;

// In-memory bandwidth-saving cache store (TTL: 20s)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const cacheStore = new Map<string, CacheEntry<any>>();
const inflightRequests = new Map<string, Promise<any>>();
const CACHE_TTL_MS = 20000; // 20-second cache to prevent burst refetches

export const invalidateNeonCache = (prefix?: string) => {
  if (!prefix) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
};

const markNeonUnavailable = () => {
  isNeonAvailable = false;
  lastCheckTimestamp = Date.now();
};

const markNeonAvailable = () => {
  isNeonAvailable = true;
  lastCheckTimestamp = Date.now();
};

export function extractArrayData<T = any>(json: any): T[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (json.status === 'success' && Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.rows)) return json.rows;
  return [];
}

export function extractObjectData<T = any>(json: any): T | null {
  if (!json) return null;
  if (json.status === 'success' && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) return json.data;
  if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) return json.data;
  if (typeof json === 'object' && !Array.isArray(json) && !('status' in json)) return json;
  return null;
}

export interface BackendTraceLog {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  targetBase: string;
  fullUrl: string;
  status: number;
  statusText: string;
  durationMs: number;
  ok: boolean;
  itemCount?: number;
  error?: string;
  details?: string;
  fallbackUsed?: boolean;
}

const networkTraces: BackendTraceLog[] = [];
const MAX_TRACES = 60;

function recordTrace(trace: BackendTraceLog) {
  networkTraces.unshift(trace);
  if (networkTraces.length > MAX_TRACES) networkTraces.pop();

  if (typeof window !== 'undefined') {
    (window as any).__BACKEND_TRACES__ = networkTraces;
  }
}

export const getBackendNetworkTraces = (): BackendTraceLog[] => [...networkTraces];
export const getLastBackendError = (): BackendTraceLog | null => networkTraces.find(t => !t.ok) || null;
export const clearBackendNetworkTraces = () => { networkTraces.length = 0; };

// Expose helpful developer diagnostics in browser console
if (typeof window !== 'undefined') {
  (window as any).__BE_DIAGNOSTICS__ = {
    getLogs: getBackendNetworkTraces,
    getLastError: getLastBackendError,
    clearLogs: clearBackendNetworkTraces,
    getBaseUrl: getNeonBaseUrl,
    ping: () => neonDataService.checkHealth()
  };
}

/**
 * Safe fetch wrapper for Neon endpoints with detailed telemetry and error logging.
 * Automatically tries configured Cloudflare Worker URL if present,
 * and falls back to relative same-origin /api if the custom URL is unreachable or errors.
 */
async function fetchNeon(path: string, options?: RequestInit): Promise<Response> {
  const customBase = getNeonBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const method = options?.method || 'GET';
  const traceId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const tStart = performance.now();

  if (customBase) {
    const fullUrl = `${customBase}${cleanPath}`;
    try {
      console.log(`🌐 [Backend Call] ${method} ${fullUrl}`);
      const res = await fetch(fullUrl, options);
      const durationMs = Math.round(performance.now() - tStart);

      if (res.ok) {
        console.log(`✅ [Backend Success] ${method} ${fullUrl} [HTTP ${res.status}] (${durationMs}ms)`);
        recordTrace({
          id: traceId,
          timestamp: new Date().toISOString(),
          method,
          endpoint: cleanPath,
          targetBase: customBase,
          fullUrl,
          status: res.status,
          statusText: res.statusText,
          durationMs,
          ok: true
        });
        return res;
      }

      // If server responded with a non-OK status (e.g. 500 or 404)
      const errClone = res.clone();
      const errText = await errClone.text().catch(() => '');
      console.error(`❌ [Backend HTTP ${res.status}] ${method} ${fullUrl} (${durationMs}ms):`, errText.slice(0, 300));
      
      recordTrace({
        id: traceId,
        timestamp: new Date().toISOString(),
        method,
        endpoint: cleanPath,
        targetBase: customBase,
        fullUrl,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        ok: false,
        error: `HTTP ${res.status} ${res.statusText}`,
        details: errText.slice(0, 500)
      });

      // If it's a 4xx client validation error, return it directly so the caller can inspect validation messages
      if (res.status >= 400 && res.status < 500 && res.status !== 404) {
        return res;
      }

      console.warn(`⚠️ [Backend Fallback] Cloudflare Worker at ${customBase} returned HTTP ${res.status}. Attempting same-origin fallback...`);
    } catch (networkErr: any) {
      const durationMs = Math.round(performance.now() - tStart);
      console.error(`❌ [Backend Network Failure] Cannot reach ${fullUrl} (${durationMs}ms):`, networkErr.message);
      
      recordTrace({
        id: traceId,
        timestamp: new Date().toISOString(),
        method,
        endpoint: cleanPath,
        targetBase: customBase,
        fullUrl,
        status: 0,
        statusText: 'NETWORK_ERROR',
        durationMs,
        ok: false,
        error: networkErr.message
      });
      console.warn(`⚠️ [Backend Fallback] Custom URL ${customBase} unreachable. Falling back to same-origin /api...`);
    }
  }

  // Same-origin fallback
  const fallbackUrl = cleanPath;
  const tFbStart = performance.now();
  try {
    console.log(`🌐 [Backend Same-Origin] ${method} ${fallbackUrl}`);
    // If original signal was aborted by the custom URL timeout, use a fresh fallback signal with 8s timeout
    let fbOptions = options;
    if (options?.signal?.aborted) {
      const fbController = new AbortController();
      setTimeout(() => fbController.abort(), 8000);
      fbOptions = { ...options, signal: fbController.signal };
    }
    const res = await fetch(fallbackUrl, fbOptions);
    const fbDurationMs = Math.round(performance.now() - tFbStart);
    
    recordTrace({
      id: `${traceId}_fb`,
      timestamp: new Date().toISOString(),
      method,
      endpoint: cleanPath,
      targetBase: 'same-origin',
      fullUrl: fallbackUrl,
      status: res.status,
      statusText: res.statusText,
      durationMs: fbDurationMs,
      ok: res.ok,
      fallbackUsed: true,
      error: !res.ok ? `HTTP ${res.status} on same-origin fallback` : undefined
    });

    if (res.ok) {
      console.log(`✅ [Backend Same-Origin Success] ${method} ${fallbackUrl} [HTTP ${res.status}] (${fbDurationMs}ms)`);
    } else {
      console.error(`❌ [Backend Same-Origin Error] ${method} ${fallbackUrl} returned HTTP ${res.status}`);
    }
    return res;
  } catch (fbErr: any) {
    const fbDurationMs = Math.round(performance.now() - tFbStart);
    console.error(`❌ [Backend Same-Origin Failed] ${method} ${fallbackUrl} failed completely:`, fbErr.message);
    recordTrace({
      id: `${traceId}_fb`,
      timestamp: new Date().toISOString(),
      method,
      endpoint: cleanPath,
      targetBase: 'same-origin',
      fullUrl: fallbackUrl,
      status: 0,
      statusText: 'FALLBACK_FAILED',
      durationMs: fbDurationMs,
      ok: false,
      error: fbErr.message,
      fallbackUsed: true
    });
    throw fbErr;
  }
}

export const neonDataService = {
  getBackendNetworkTraces,
  getLastBackendError,
  clearBackendNetworkTraces,

  /**
   * Check if Neon PostgreSQL backend is available on current host
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (isNeonAvailable !== null && (now - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return isNeonAvailable;
    }
    if (checkingPromise) {
      return checkingPromise;
    }
    checkingPromise = (async () => {
      const activeBase = getNeonBaseUrl();
      try {
        const controller = new AbortController();
        // Generous 9.5s timeout to handle edge cold-starts or mobile network handshakes
        const timeout = setTimeout(() => controller.abort(), 9500);
        console.log(`🔍 [Neon Ping] Verifying backend health via ${activeBase ? activeBase + '/api/neon/health' : '/api/neon/health'}...`);
        const res = await fetchNeon('/api/neon/health', {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) {
          console.warn(`⚠️ [Neon Ping] Health check returned non-OK status: HTTP ${res.status} ${res.statusText}`);
          markNeonUnavailable();
          return false;
        }
        const json = await res.json().catch(() => null);
        if (json && (json.status === 'ok' || json.connected !== undefined)) {
          console.log(`✅ [Neon Ping] Backend is ONLINE & healthy! Latency: ${json.latencyMs || 'unknown'}ms`);
          markNeonAvailable();
          return true;
        }
        console.warn('⚠️ [Neon Ping] Health response did not contain expected status:', json);
        markNeonUnavailable();
        return false;
      } catch (pingErr: any) {
        console.warn('⚠️ [Neon Ping] Failed to ping backend health:', pingErr.message);
        markNeonUnavailable();
        return false;
      } finally {
        checkingPromise = null;
      }
    })();
    return checkingPromise;
  },

  /**
   * Check connection to Neon database
   */
  async checkHealth(targetUrl?: string): Promise<{ connected: boolean; version?: string; serverTime?: string; error?: string }> {
    try {
      let res: Response;
      if (targetUrl && targetUrl.trim() !== '') {
        const cleanTarget = targetUrl.trim().replace(/\/+$/, '');
        try {
          res = await fetch(`${cleanTarget}/api/neon/health`, { cache: 'no-store' });
        } catch {
          // If custom URL fails, fall back to relative
          res = await fetch('/api/neon/health', { cache: 'no-store' });
        }
      } else {
        res = await fetchNeon('/api/neon/health', { cache: 'no-store' });
      }

      if (!res.ok) {
        return { connected: false, error: `HTTP ${res.status}` };
      }
      const data = await res.json();
      markNeonAvailable();
      return data;
    } catch (err: any) {
      return { connected: false, error: err.message || 'Cannot reach Neon backend' };
    }
  },

  /**
   * Load orders/submissions from Neon PostgreSQL (Cached for 20s, deduplicated)
   */
  async loadOrders(limit = 1000, status?: string): Promise<Service[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return [];
    }
    const cacheKey = `orders_${limit}_${status || 'ALL'}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (status && status !== 'ALL') params.set('status', status);

        const res = await fetchNeon(`/api/neon/orders?${params.toString()}`);
        if (!res.ok) {
          markNeonUnavailable();
          return [];
        }
        const json = await res.json();
        markNeonAvailable();
        const data = extractArrayData<Service>(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (err) {
        markNeonUnavailable();
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  /**
   * Load dedicated website orders directly from Neon "orders" table (supports delta fetching via since)
   */
  async loadWebsiteOrders(options?: { limit?: number; since?: string } | number): Promise<Service[]> {
    const limit = typeof options === 'number' ? options : (options?.limit || 1000);
    const since = typeof options === 'object' ? options?.since : undefined;
    const timestamp = Date.now();
    const queryParams = new URLSearchParams();
    queryParams.set('limit', String(limit));
    queryParams.set('t', String(timestamp));
    if (since && since.trim() !== '') queryParams.set('since', since);

    try {
      // 1. Direct fetch with cache-busting
      const res = await fetch(`/api/neon/website-orders?${queryParams.toString()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (res.ok) {
        const json = await res.json();
        markNeonAvailable();
        return extractArrayData<Service>(json);
      }
    } catch (directErr) {
      console.warn('Direct /api/neon/website-orders fetch failed, falling back to fetchNeon:', directErr);
    }

    try {
      // 2. FetchNeon wrapper attempt
      const res = await fetchNeon(`/api/neon/website-orders?${queryParams.toString()}`);
      if (res.ok) {
        const json = await res.json();
        markNeonAvailable();
        return extractArrayData<Service>(json);
      }
    } catch (e) {
      console.warn('fetchNeon /api/neon/website-orders error:', e);
    }

    return this.loadOrders(limit);
  },

  /**
   * Save single or batch orders to Neon PostgreSQL
   */
  async saveOrders(orders: Service | Service[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const payload = Array.isArray(orders) ? orders : [orders];
      const res = await fetchNeon('/api/neon/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      invalidateNeonCache('orders_');
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Load service requests / leads from Neon PostgreSQL (Cached for 20s, deduplicated)
   */
  async loadLeads(limit = 1000): Promise<ServiceRequest[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return [];
    }
    const cacheKey = `leads_${limit}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetchNeon(`/api/neon/leads?limit=${limit}`);
        if (!res.ok) {
          markNeonUnavailable();
          return [];
        }
        const json = await res.json();
        markNeonAvailable();
        const data = extractArrayData<ServiceRequest>(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (err) {
        markNeonUnavailable();
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  /**
   * Save single or batch leads to Neon PostgreSQL
   */
  async saveLeads(leads: ServiceRequest | ServiceRequest[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const payload = Array.isArray(leads) ? leads : [leads];
      const res = await fetchNeon('/api/neon/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      invalidateNeonCache('leads_');
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Load users from Neon PostgreSQL (Cached for 30s)
   */
  async loadUsers(): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return [];
    }
    const cacheKey = 'users_all';
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetchNeon('/api/neon/users');
        if (!res.ok) {
          markNeonUnavailable();
          return [];
        }
        const json = await res.json();
        markNeonAvailable();
        const data = extractArrayData(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (err) {
        markNeonUnavailable();
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  /**
   * Save users to Neon PostgreSQL
   */
  async saveUsers(users: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const payload = Array.isArray(users) ? users : [users];
      const res = await fetchNeon('/api/neon/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      invalidateNeonCache('users_');
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Authenticate user against Neon PostgreSQL directly
   */
  async login(username: string, password: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const res = await fetchNeon('/api/neon/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.status === 'success' && json.user) {
        markNeonAvailable();
        const safeUser = { ...json.user };
        if (typeof safeUser.permissions === 'string') {
          try {
            safeUser.permissions = JSON.parse(safeUser.permissions);
            if (typeof safeUser.permissions === 'string') safeUser.permissions = JSON.parse(safeUser.permissions);
          } catch {
            safeUser.permissions = [];
          }
        }
        if (typeof safeUser.specialties === 'string') {
          try {
            safeUser.specialties = JSON.parse(safeUser.specialties);
          } catch {
            safeUser.specialties = [];
          }
        }
        return { success: true, user: safeUser };
      }

      // If 400, 401, or 403, Neon backend is fully alive and responded with an explicit rejection
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        markNeonAvailable();
        return { success: false, error: json?.message || 'Invalid username or password' };
      }

      // If 5xx or network failure, mark unavailable
      markNeonUnavailable();
      return { success: false, error: json?.message || `Neon server error (${res.status})` };
    } catch (err: any) {
      markNeonUnavailable();
      return { success: false, error: err.message || 'Cannot reach Neon authentication server' };
    }
  },

  /**
   * Load App Settings from Neon PostgreSQL
   */
  async loadSettings(): Promise<any | null> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return null;
    }
    try {
      const res = await fetchNeon('/api/neon/settings');
      if (!res.ok) {
        markNeonUnavailable();
        return null;
      }
      const json = await res.json();
      markNeonAvailable();
      return extractObjectData(json);
    } catch (err) {
      markNeonUnavailable();
      return null;
    }
  },

  /**
   * Save App Settings to Neon PostgreSQL
   */
  async saveSettings(settings: any): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const res = await fetchNeon('/api/neon/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Load arbitrary collection array (e.g. inventories, templates, warranties) (Cached for 20s)
   */
  async loadCollection<T = any>(collectionName: string): Promise<T[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return [];
    }
    const cacheKey = `col_${collectionName}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetchNeon(`/api/neon/collection/${encodeURIComponent(collectionName)}`);
        if (!res.ok) {
          markNeonUnavailable();
          return [];
        }
        const json = await res.json();
        let data = extractArrayData<T>(json);

        // Normalize collection-specific serialized fields
        if (collectionName === 'subscription_plans' && Array.isArray(data)) {
          data = data.map((plan: any) => {
            let features: string[] = [];
            if (Array.isArray(plan.features)) {
              features = plan.features;
            } else if (typeof plan.features === 'string') {
              try {
                let parsed = JSON.parse(plan.features);
                if (typeof parsed === 'string') parsed = JSON.parse(parsed);
                if (Array.isArray(parsed)) features = parsed;
              } catch {
                features = [];
              }
            }
            return { ...plan, features };
          }) as unknown as T[];
        } else if (collectionName === 'service_templates' && Array.isArray(data)) {
          data = data.map((tmpl: any) => {
            let customFields = tmpl.customFields;
            if (typeof customFields === 'string') {
              try {
                customFields = JSON.parse(customFields);
              } catch {
                customFields = [];
              }
            }
            return { ...tmpl, customFields: Array.isArray(customFields) ? customFields : [] };
          }) as unknown as T[];
        }

        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch (err) {
        markNeonUnavailable();
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  /**
   * Save arbitrary collection array
   */
  async saveCollection<T = any>(collectionName: string, data: T[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const res = await fetchNeon(`/api/neon/collection/${encodeURIComponent(collectionName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      invalidateNeonCache(`col_${collectionName}`);
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Delete an order directly from Neon PostgreSQL
   */
  async deleteOrder(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const res = await fetchNeon(`/api/neon/orders/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      return true;
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Delete a lead directly from Neon PostgreSQL
   */
  async deleteLead(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const res = await fetchNeon(`/api/neon/leads/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      return true;
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Update single order directly in Neon PostgreSQL
   */
  async updateOrder(id: string, order: any): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/orders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Update single lead directly in Neon PostgreSQL
   */
  async updateLead(id: string, lead: any): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/leads/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR CUSTOMERS
  // ==========================================

  async loadCustomers(limit = 1000, search?: string): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    const cacheKey = `customers_${limit}_${search || 'all'}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (search) params.set('q', search);

        const res = await fetchNeon(`/api/neon/customers?${params.toString()}`);
        if (!res.ok) return [];
        const json = await res.json();
        const data = extractArrayData(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch {
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  async saveCustomers(customers: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(customers) ? customers : [customers];
      const res = await fetchNeon('/api/neon/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      invalidateNeonCache('customers_');
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteCustomer(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidateNeonCache('customers_');
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR INVENTORY
  // ==========================================

  async loadInventory(limit = 1000, category?: string, search?: string): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    const cacheKey = `inventory_${limit}_${category || 'all'}_${search || 'all'}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (category && category !== 'ALL') params.set('category', category);
        if (search) params.set('q', search);

        const res = await fetchNeon(`/api/neon/inventory?${params.toString()}`);
        if (!res.ok) return [];
        const json = await res.json();
        const data = extractArrayData(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch {
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  async saveInventoryItems(items: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(items) ? items : [items];
      const res = await fetchNeon('/api/neon/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      invalidateNeonCache('inventory_');
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteInventoryItem(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/inventory/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidateNeonCache('inventory_');
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR EXPENSES
  // ==========================================

  async loadExpenses(limit = 1000, category?: string): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    const cacheKey = `expenses_${limit}_${category || 'all'}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        if (category && category !== 'ALL') params.set('category', category);

        const res = await fetchNeon(`/api/neon/expenses?${params.toString()}`);
        if (!res.ok) return [];
        const json = await res.json();
        const data = extractArrayData(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch {
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  async saveExpenses(expenses: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(expenses) ? expenses : [expenses];
      const res = await fetchNeon('/api/neon/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      invalidateNeonCache('expenses_');
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteExpense(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidateNeonCache('expenses_');
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR WARRANTIES
  // ==========================================

  async loadWarranties(limit = 1000): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    const cacheKey = `warranties_${limit}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    if (inflightRequests.has(cacheKey)) {
      return inflightRequests.get(cacheKey)!;
    }

    const requestPromise = (async () => {
      try {
        const res = await fetchNeon(`/api/neon/warranties?limit=${limit}`);
        if (!res.ok) return [];
        const json = await res.json();
        const data = extractArrayData(json);
        cacheStore.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } catch {
        return [];
      } finally {
        inflightRequests.delete(cacheKey);
      }
    })();

    inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
  },

  async saveWarranties(warranties: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(warranties) ? warranties : [warranties];
      const res = await fetchNeon('/api/neon/warranties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      invalidateNeonCache('warranties_');
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteWarranty(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/warranties/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidateNeonCache('warranties_');
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR NOTIFICATIONS
  // ==========================================

  async loadNotifications(limit = 1000, targetUser?: string): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (targetUser && targetUser !== 'ALL') params.set('targetUser', targetUser);

      const res = await fetchNeon(`/api/neon/notifications?${params.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      return extractArrayData(json);
    } catch {
      return [];
    }
  },

  async saveNotifications(notifications: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(notifications) ? notifications : [notifications];
      const res = await fetchNeon('/api/neon/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteNotification(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/notifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  async markNotificationRead(id: string, isRead: boolean = true): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/notifications/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async markAllNotificationsRead(targetUserId?: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon('/api/neon/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // DEDICATED RELATIONAL METHODS FOR AUDIT & MOVEMENT LOGS
  // ==========================================

  async loadAuditLogs(limit = 1000): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    try {
      const res = await fetchNeon(`/api/neon/audit-logs?limit=${limit}`);
      if (!res.ok) return [];
      const json = await res.json();
      return extractArrayData(json);
    } catch {
      return [];
    }
  },

  async saveAuditLogs(logs: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(logs) ? logs : [logs];
      const res = await fetchNeon('/api/neon/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async loadInventoryMovements(limit = 1000): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    try {
      const res = await fetchNeon(`/api/neon/inventory-movements?limit=${limit}`);
      if (!res.ok) return [];
      const json = await res.json();
      return extractArrayData(json);
    } catch {
      return [];
    }
  },

  async saveInventoryMovements(movements: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(movements) ? movements : [movements];
      const res = await fetchNeon('/api/neon/inventory-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async loadLocationHistory(limit = 1000, userId?: string): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return [];
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (userId && userId !== 'ALL') params.set('userId', userId);
      const res = await fetchNeon(`/api/neon/location-history?${params.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      return extractArrayData(json);
    } catch {
      return [];
    }
  },

  async saveLocationHistory(points: any | any[]): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const payload = Array.isArray(points) ? points : [points];
      const res = await fetchNeon('/api/neon/location-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // ==========================================
  // CAR DATABASE RELATIONAL METHODS
  // ==========================================

  async saveCar(car: any): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon('/api/neon/car-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([car])
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async deleteCar(id: string): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) return false;
    try {
      const res = await fetchNeon(`/api/neon/car-database/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Load master Car Database catalog from Neon PostgreSQL
   */
  async loadCarDatabase(): Promise<any[]> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return [];
    }
    try {
      const res = await fetchNeon('/api/neon/car-database?limit=10000');
      if (res.ok) {
        const json = await res.json();
        const data = extractArrayData(json);
        if (data.length > 0) {
          markNeonAvailable();
          return data;
        }
      }
    } catch (e) {
      console.warn('⚠️ [Neon] /api/neon/car-database fetch failed, falling back to collection:', e);
    }
    return this.loadCollection('car_database');
  },

  /**
   * Save master Car Database catalog to Neon PostgreSQL
   */
  async saveCarDatabase(items: any[]): Promise<boolean> {
    return this.saveCollection('car_database', items);
  },

  /**
   * Trigger backend sync of Car Database from Google Sheets into Neon PostgreSQL
   */
  async syncCarDatabaseFromSheet(): Promise<{ status: string; count: number; error?: string }> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return { status: 'error', count: 0, error: 'Neon service temporarily unavailable' };
    }
    try {
      const res = await fetchNeon('/api/neon/sync/car-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      if (!res.ok) {
        markNeonUnavailable();
        return { status: 'error', count: 0, error: 'Endpoint not available' };
      }
      return await res.json();
    } catch (err: any) {
      markNeonUnavailable();
      return { status: 'error', count: 0, error: err.message };
    }
  },

  /**
   * Migrate full database payload to Neon PostgreSQL
   */
  async migrateAllData(appData: any): Promise<{ success: boolean; results?: Record<string, number>; error?: string }> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return { success: false, error: 'Neon service temporarily unavailable' };
    }
    try {
      const res = await fetchNeon('/api/neon/migrate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appData)
      });
      if (!res.ok) {
        markNeonUnavailable();
        return { success: false, error: 'Endpoint not available' };
      }
      const json = await res.json();
      if (res.ok && json.status === 'success') {
        return { success: true, results: json.results };
      }
      return { success: false, error: json.message || 'Migration failed.' };
    } catch (err: any) {
      markNeonUnavailable();
      return { success: false, error: err.message };
    }
  },

  /**
   * Fetch Neon & Google Sheet row comparison & sync status
   */
  async getSyncStatus(): Promise<{
    neonCounts: Record<string, number>;
    metadata: any[];
    autoSyncConfig: any;
  } | null> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return null;
    }
    try {
      const res = await fetchNeon('/api/neon/sync/status');
      if (!res.ok) {
        markNeonUnavailable();
        return null;
      }
      return await res.json();
    } catch (err) {
      markNeonUnavailable();
      return null;
    }
  },

  /**
   * Trigger Automated Backend Delta Sync with Row Comparison & Smart Skip
   */
  async triggerDeltaSync(sheetsUrl?: string, forceFull: boolean = false): Promise<{
    status: string;
    skipped?: boolean;
    reason?: string;
    deltaSummary?: Record<string, number>;
    sheetCounts?: Record<string, number>;
    neonCounts?: Record<string, number>;
    lastSyncedAt?: string;
    error?: string;
  }> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return { status: 'error', error: 'Neon service temporarily unavailable' };
    }
    try {
      const res = await fetchNeon('/api/neon/sync/delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetsUrl, forceFull })
      });
      if (!res.ok) {
        markNeonUnavailable();
        return { status: 'error', error: 'Endpoint not available' };
      }
      return await res.json();
    } catch (err: any) {
      markNeonUnavailable();
      return { status: 'error', error: err.message };
    }
  },

  /**
   * Get Automated Sync Configuration
   */
  async getAutoSyncConfig(): Promise<any | null> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return null;
    }
    try {
      const res = await fetchNeon('/api/neon/sync/auto-config');
      if (!res.ok) {
        markNeonUnavailable();
        return null;
      }
      const json = await res.json();
      return json.config || null;
    } catch (err) {
      markNeonUnavailable();
      return null;
    }
  },

  /**
   * Update Automated Sync Configuration
   */
  async updateAutoSyncConfig(enabled?: boolean, intervalMinutes?: number): Promise<boolean> {
    if (isNeonAvailable === false && (Date.now() - lastCheckTimestamp) < AVAILABILITY_TTL_MS) {
      return false;
    }
    try {
      const res = await fetchNeon('/api/neon/sync/auto-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalMinutes })
      });
      if (!res.ok) {
        markNeonUnavailable();
        return false;
      }
      const json = await res.json();
      return json.status === 'success';
    } catch (err) {
      markNeonUnavailable();
      return false;
    }
  },

  /**
   * Triggers background delta syncing of Meta Leads and WhatsApp Enquiries into Neon PostgreSQL.
   */
  async triggerLeadsDeltaSync(metaSheetUrl?: string, whatsAppSheetUrl?: string): Promise<{
    status: string;
    newMetaCount?: number;
    newWaCount?: number;
    updatedMetaCount?: number;
    updatedWaCount?: number;
    totalLeads?: number;
    syncedAt?: string;
    error?: string;
  }> {
    try {
      const res = await fetchNeon('/api/neon/sync/leads-delta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaSheetUrl, whatsAppSheetUrl })
      });
      if (!res.ok) {
        return { status: 'error', error: `Server returned HTTP ${res.status}` };
      }
      const data = await res.json();
      invalidateNeonCache('leads_');
      return data;
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },

  /**
   * Get Disaster Recovery Configuration
   */
  async getDisasterRecoveryConfig(): Promise<any | null> {
    try {
      const res = await fetchNeon('/api/neon/disaster-recovery/config');
      if (!res.ok) return null;
      const json = await res.json();
      return json.config || null;
    } catch {
      return null;
    }
  },

  /**
   * Update Disaster Recovery Configuration (Enable/Disable Google Sheets backup runs)
   */
  async updateDisasterRecoveryConfig(enabled?: boolean, intervalMinutes?: number): Promise<boolean> {
    try {
      const res = await fetchNeon('/api/neon/disaster-recovery/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, intervalMinutes })
      });
      if (!res.ok) return false;
      const json = await res.json();
      return json.status === 'success';
    } catch {
      return false;
    }
  },

  /**
   * Trigger Manual Disaster Recovery Backup Run of Neon DB to Google Sheets
   */
  async triggerDisasterRecoveryBackup(sheetsUrl?: string): Promise<{
    status: string;
    message?: string;
    backupSummary?: any;
    error?: string;
  }> {
    try {
      const res = await fetchNeon('/api/neon/disaster-recovery/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetsUrl })
      });
      if (!res.ok) {
        return { status: 'error', error: `Backup failed with status ${res.status}` };
      }
      return await res.json();
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  },

  /**
   * Trigger Manual Disaster Recovery Restore Run from Google Sheets into Neon DB
   */
  async triggerDisasterRecoveryRestore(sheetsUrl?: string): Promise<{
    status: string;
    message?: string;
    result?: any;
    error?: string;
  }> {
    try {
      const res = await fetchNeon('/api/neon/disaster-recovery/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetsUrl })
      });
      if (!res.ok) {
        return { status: 'error', error: `Restore failed with status ${res.status}` };
      }
      return await res.json();
    } catch (err: any) {
      return { status: 'error', error: err.message };
    }
  }
};
