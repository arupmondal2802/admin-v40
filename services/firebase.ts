// Firebase completely bypassed - all data flows through Google Sheets Apps Script API + Neon PostgreSQL + Local IndexedDB
let app: any = null;
let db: any = null;
let auth: any = null;

if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('firestore_quota_exceeded');
}
if (typeof sessionStorage !== 'undefined') {
  sessionStorage.removeItem('firestore_quota_exceeded');
}

export function isQuotaExceeded(): boolean {
  return false;
}

export function setQuotaExceeded(_val: boolean) {
  // No-op: Firebase is disabled, quota errors bypassed
}

export function checkIsQuotaError(_error: any): boolean {
  return false;
}

export async function testConnection(_retries = 1, _delayMs = 1000): Promise<boolean> {
  return false;
}

console.log("⚡ [Data Engine] Firebase completely bypassed. Primary Storage: Google Sheets + Neon PostgreSQL + IndexedDB.");

export { app, db, auth };
