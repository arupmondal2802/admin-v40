/**
 * Centralized Backend Configuration
 * Resolves the active backend URL for API calls (Cloudflare Workers / Same-Origin / Custom / Env).
 */

const KNOWN_DEAD_BACKEND_URLS = [
  'https://a-big-engine-backend-production-2873.up.railway.app',
  'a-big-engine-backend-production-2873.up.railway.app',
  'ais-dev-sevs7hmwy2pkzxsp4egr3n',
  'onrender.com',
  'a-big-engine-backend.abigengine.workers.dev'
];

/**
 * Checks if a given URL is a known dead/defunct backend endpoint
 */
export const isDeadBackendUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return KNOWN_DEAD_BACKEND_URLS.some(dead => clean.includes(dead.toLowerCase()));
};

/**
 * Purges obsolete or dead backend URLs from localStorage to prevent poisoned sessions
 */
export const purgeDeadBackendUrls = () => {
  if (typeof window === 'undefined') return;
  try {
    const custom = localStorage.getItem('custom_backend_url');
    if (isDeadBackendUrl(custom)) {
      localStorage.removeItem('custom_backend_url');
      console.warn('ℹ️ [backendConfig] Purged defunct custom_backend_url from localStorage:', custom);
    }
    const neon = localStorage.getItem('neon_backend_url');
    if (isDeadBackendUrl(neon)) {
      localStorage.removeItem('neon_backend_url');
      console.warn('ℹ️ [backendConfig] Purged defunct neon_backend_url from localStorage:', neon);
    }
    const cf = localStorage.getItem('cloudflare_worker_url');
    if (isDeadBackendUrl(cf)) {
      localStorage.removeItem('cloudflare_worker_url');
      console.warn('ℹ️ [backendConfig] Purged defunct cloudflare_worker_url from localStorage:', cf);
    }
  } catch {}
};

/**
 * Resets backend connection back to relative same-origin /api
 */
export const resetBackendUrlToSameOrigin = () => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('custom_backend_url');
    localStorage.removeItem('neon_backend_url');
    localStorage.removeItem('cloudflare_worker_url');
    console.log('🔄 [backendConfig] Reset backend configuration to relative same-origin /api.');
  } catch {}
};

// Default fallback is relative same-origin ('' empty string) to avoid cross-origin CORS errors
export const DEFAULT_RAILWAY_BACKEND_URL = '';

/**
 * Gets configured Cloudflare Worker URL from localStorage or environment
 */
export const getCloudflareWorkerUrl = (): string => {
  if (typeof window !== 'undefined') {
    const cf = localStorage.getItem('cloudflare_worker_url');
    if (cf && cf.trim() !== '' && !isDeadBackendUrl(cf)) {
      return cf.trim().replace(/\/+$/, '');
    }
  }
  const envCf = (import.meta as any).env?.VITE_CLOUDFLARE_WORKER_URL;
  if (envCf && typeof envCf === 'string' && envCf.trim() !== '' && !isDeadBackendUrl(envCf)) {
    return envCf.trim().replace(/\/+$/, '');
  }
  return '';
};

/**
 * Sets configured Cloudflare Worker URL in localStorage
 */
export const setCloudflareWorkerUrl = (url: string): void => {
  if (typeof window === 'undefined') return;
  const clean = url.trim().replace(/\/+$/, '');
  if (clean) {
    localStorage.setItem('cloudflare_worker_url', clean);
    localStorage.setItem('custom_backend_url', clean);
    console.log('⚡ [backendConfig] Cloudflare Worker URL set to:', clean);
  } else {
    localStorage.removeItem('cloudflare_worker_url');
    localStorage.removeItem('custom_backend_url');
    console.log('⚡ [backendConfig] Cloudflare Worker URL cleared.');
  }
};

export const getBackendBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    purgeDeadBackendUrls();
    // 1. Check Cloudflare Worker specific URL
    const cf = localStorage.getItem('cloudflare_worker_url');
    if (cf && cf.trim() !== '' && !isDeadBackendUrl(cf)) {
      return cf.trim().replace(/\/+$/, '');
    }
    // 2. Check general custom backend URL (may be a Worker or reverse proxy)
    const custom = localStorage.getItem('custom_backend_url') || localStorage.getItem('neon_backend_url');
    if (custom && custom.trim() !== '' && !isDeadBackendUrl(custom)) {
      return custom.trim().replace(/\/+$/, '');
    }
  }

  const envCf = (import.meta as any).env?.VITE_CLOUDFLARE_WORKER_URL;
  if (envCf && typeof envCf === 'string' && envCf.trim() !== '' && !isDeadBackendUrl(envCf)) {
    return envCf.trim().replace(/\/+$/, '');
  }

  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '' && !isDeadBackendUrl(envUrl)) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // Default to relative same-origin ('') in browser so all /api/* requests hit the current host directly without CORS
  if (typeof window === 'undefined') {
    const port = (typeof process !== 'undefined' && process.env?.PORT) ? process.env.PORT : 3000;
    return `http://localhost:${port}`;
  }
  return '';
};

/**
 * Returns full API URL for a relative route like '/api/health'
 */
export const getApiUrl = (endpoint: string): string => {
  const base = getBackendBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};

/**
 * Checks if Google Sheets Disaster Recovery & Backup Mode is enabled.
 * NOTE: Per system requirements, this is DEACTIVATED by default!
 * Google Sheets and Google Apps Script are retained strictly as a disaster recovery / backup store.
 */
export const isGoogleSheetsDisasterRecoveryEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('google_sheets_dr_backup_enabled') === 'true';
};

/**
 * Activates or deactivates Google Sheets Disaster Recovery & Backup Mode.
 */
export const setGoogleSheetsDisasterRecoveryEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  if (enabled) {
    localStorage.setItem('google_sheets_dr_backup_enabled', 'true');
    console.log('🛡️ [Disaster Recovery] Google Sheets backup sync ACTIVATED via settings.');
  } else {
    localStorage.setItem('google_sheets_dr_backup_enabled', 'false');
    console.log('⏸️ [Disaster Recovery] Google Sheets backup sync DEACTIVATED (default mode).');
  }
};

/**
 * Checks if Background Lead Delta Sync (Meta Leads + WhatsApp Enquiry -> Neon DB) is enabled.
 * RESTRICTED: Defaults to FALSE (Manual Trigger Only) to protect bandwidth limits in Cloudflare & Neon.
 */
export const isLeadDeltaSyncEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  // Strict check: Only true if explicitly enabled in localStorage, defaults to FALSE (manual only)
  return localStorage.getItem('lead_delta_sync_enabled') === 'true';
};

/**
 * Toggles Lead Delta Sync on or off
 */
export const setLeadDeltaSyncEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('lead_delta_sync_enabled', enabled ? 'true' : 'false');
  console.log(`📡 [backendConfig] Lead Delta Auto-Sync set to: ${enabled ? 'ENABLED' : 'DISABLED (Manual Only)'}`);
};

/**
 * Gets configured Lead Delta Sync interval in minutes. Defaults to 60 minutes if enabled.
 */
export const getLeadDeltaSyncIntervalMinutes = (): number => {
  if (typeof window === 'undefined') return 60;
  const stored = parseInt(localStorage.getItem('leadDeltaSyncIntervalMinutes') || '60', 10);
  return Math.max(stored || 60, 5);
};

/**
 * Sets Lead Delta Sync interval in minutes.
 */
export const setLeadDeltaSyncIntervalMinutes = (minutes: number): void => {
  if (typeof window === 'undefined') return;
  const safeMinutes = Math.max(minutes || 60, 5);
  localStorage.setItem('leadDeltaSyncIntervalMinutes', String(safeMinutes));
};

/**
 * Checks if Cloudflare bandwidth saver mode is active (always true)
 */
export const isBandwidthSaverActive = (): boolean => {
  return true;
};

/**
 * Checks if the application is currently running in Pure Neon PostgreSQL & Cloudflare Workers SSOT Mode
 * (Bypasses Google Sheets and Apps Script completely for testing & production speed)
 */
export const isNeonSoleSourceMode = (): boolean => {
  // If Disaster Recovery is NOT enabled, Neon is the primary SSOT!
  if (!isGoogleSheetsDisasterRecoveryEnabled()) return true;
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('neon_sole_source_mode') === 'true';
};

/**
 * Activates or deactivates Pure Neon PostgreSQL & Cloudflare Workers SSOT Mode
 */
export const setNeonSoleSourceMode = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  if (enabled) {
    localStorage.setItem('neon_sole_source_mode', 'true');
    setGoogleSheetsDisasterRecoveryEnabled(false);
    console.log('🐘 [SSOT Mode] Pure Neon Database & Cloudflare Workers mode ACTIVATED. Google Sheets sync bypassed.');
  } else {
    localStorage.removeItem('neon_sole_source_mode');
    console.log('🔄 [SSOT Mode] Standard mode restored.');
  }
};


