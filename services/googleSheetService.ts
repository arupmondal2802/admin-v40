import { Service, ServiceStatus, ServiceRequest, VehicleCategoryTag, PaymentMode, CarDatabaseItem } from '../types';

// Helper to parse TSV (Tab Separated Values) text from Google Sheets export
export function parseTSV(text: string): any[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  // Clean header line and split by Tab
  const headers = lines[0].split('\t').map(h => h.trim());
  const results: any[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = lines[i].split('\t');
    const obj: any = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = (values[index] || '').trim();
      }
    });
    results.push(obj);
  }
  return results;
}

// Helper to parse Google Sheets GViz JSON output
export function parseGVizJSON(jsonpText: string): any[] {
  try {
    const jsonStart = jsonpText.indexOf('{');
    const jsonEnd = jsonpText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return [];
    const jsonStr = jsonpText.substring(jsonStart, jsonEnd + 1);
    const data = JSON.parse(jsonStr);
    if (!data.table || !data.table.cols || !data.table.rows) return [];

    const headers = data.table.cols.map((col: any, idx: number) => (col.label && col.label.trim()) ? col.label.trim() : `col_${idx}`);
    const rows: any[] = [];

    for (const r of data.table.rows) {
      if (!r.c) continue;
      const obj: any = {};
      let hasData = false;
      r.c.forEach((cell: any, idx: number) => {
        const header = headers[idx];
        if (header) {
          const val = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== undefined && cell.v !== null ? cell.v : '')) : '';
          obj[header] = String(val).trim();
          if (obj[header]) hasData = true;
        }
      });
      if (hasData) {
        rows.push(obj);
      }
    }
    return rows;
  } catch (err) {
    console.warn('[GoogleSheetService] Failed to parse GViz JSON:', err);
    return [];
  }
}

// Helper to extract or generate a stable order ID from various sheet row schemas
function deriveOrderId(order: any, index: number = 0): string {
  if (order.orderId && order.orderId.trim()) return order.orderId.trim();
  if (order.id && order.id.trim()) return order.id.trim();
  if (order.appointmentId && order.appointmentId.trim()) return order.appointmentId.trim();
  
  const phone = (order.mobile || order.userId || order.customerPhone || order.phone || '').toString().trim();
  const car = (order.carNumber || order.car_reg_no || order.carRegNo || '').toString().trim();
  if (phone) {
    return car ? `ORD_${phone}_${car}` : `ORD_${phone}`;
  }
  if (car) {
    return `ORD_CAR_${car}`;
  }
  return `ORD_WEB_${Date.now()}_${index}`;
}

// Helper to extract customer name components from various sheet row schemas
function deriveCustomerName(order: any): { firstName: string; lastName: string; fullName: string } {
  let fn = (order.firstName || order.first_name || '').trim();
  let ln = (order.lastName || order.last_name || '').trim();
  let full = (order.userName || order.customerName || order.name || '').trim();
  
  if (full && full !== 'Website Customer') {
    const parts = full.split(' ');
    fn = fn || parts[0] || '';
    ln = ln || parts.slice(1).join(' ') || '';
  } else if (fn || ln) {
    full = `${fn} ${ln}`.trim();
  }
  
  if (!full) full = 'Website Customer';
  if (!fn) fn = full.split(' ')[0] || 'Website';
  
  return { firstName: fn, lastName: ln, fullName: full };
}

// Helper to extract phone number from various sheet row schemas
function derivePhone(order: any): string {
  let phone = (order.mobile || order.userId || order.customerPhone || order.phone_number || order.phone || '').toString().trim();
  if (phone.startsWith('p:')) phone = phone.substring(2).trim();
  return phone;
}

// Helper to extract street address from various sheet row schemas
function deriveAddress(order: any): string {
  if (order.shippingAddress && order.shippingAddress.trim()) return order.shippingAddress.trim();
  if (order.streetAddress && order.streetAddress.trim()) return order.streetAddress.trim();
  if (order.address && order.address.trim()) return order.address.trim();
  if (order.addresses) {
    try {
      const parsed = typeof order.addresses === 'string' ? JSON.parse(order.addresses) : order.addresses;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const parts = [first.street, first.city, first.pincode].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    } catch (e) {
      if (typeof order.addresses === 'string' && order.addresses.trim()) return order.addresses.trim();
    }
  }
  return '';
}

// Fetch and parse website storefront orders directly from Neon PostgreSQL database (Single Source of Truth)
export async function fetchWebsiteOrders(_customUrl?: string): Promise<any[]> {
  try {
    const res = await fetch(`/api/neon/orders?limit=1000&t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
      if (data && Array.isArray(data.orders)) {
        return data.orders;
      }
    }
  } catch (err) {
    console.warn('[GoogleSheetService -> Neon] Failed to fetch orders from Neon DB endpoint:', err);
  }
  return [];
}

// Helper to map Web Order status string ("Placed", "Shipped", "Delivered") to core ServiceStatus
export function mapWebOrderStatusToServiceStatus(statusStr?: string): ServiceStatus {
  if (!statusStr) return ServiceStatus.Queued;
  const s = statusStr.trim().toLowerCase();
  if (s === 'delivered' || s === 'completed') {
    return ServiceStatus.Completed;
  }
  if (s === 'shipped' || s === 'in progress' || s === 'inprogress' || s === 'assigned') {
    return ServiceStatus.InProgress;
  }
  return ServiceStatus.Queued;
}

// Helper to map core ServiceStatus or string back to Web Order status string ("Placed", "Shipped", "Delivered")
export function mapServiceStatusToWebOrderStatus(serviceStatus?: ServiceStatus | string): 'Placed' | 'Shipped' | 'Delivered' {
  if (!serviceStatus) return 'Placed';
  const s = serviceStatus.toString().trim().toLowerCase();
  if (s === 'completed' || s === 'delivered') {
    return 'Delivered';
  }
  if (s === 'inprogress' || s === 'in progress' || s === 'in_progress' || s === 'assigned' || s === 'shipped') {
    return 'Shipped';
  }
  return 'Placed';
}

// Map spreadsheet record to core Service ticket
export function mapWebsiteOrderToService(order: any, index: number = 0): Service {
  const { firstName: customerFirstName, lastName: customerLastName } = deriveCustomerName(order);
  const grandTotal = parseFloat(order.totalAmount || order.grandTotal || order.price || order.amount) || 0;
  const orderId = deriveOrderId(order, index);
  const mobileNumber = derivePhone(order);
  const streetAddress = deriveAddress(order);
  const carNumber = order.car_reg_no || order.carNumber || order.carRegNo || '';
  const carBrandModel = `${order.car_brand || order.carBrand || ''} - ${order.car_model || order.carModel || ''}` + (order.car_version ? ` (${order.car_version})` : '');

  // Resolve vehicle category
  let vehicleCategoryTag = VehicleCategoryTag.Prime;
  const rawTag = order.car_tag || order.vehicleCategoryTag;
  if (rawTag) {
    const tag = rawTag.trim();
    if (Object.values(VehicleCategoryTag).includes(tag as VehicleCategoryTag)) {
      vehicleCategoryTag = tag as VehicleCategoryTag;
    } else {
      const lower = tag.toLowerCase();
      if (lower.includes('micro')) vehicleCategoryTag = VehicleCategoryTag.Micro;
      else if (lower.includes('hatch')) vehicleCategoryTag = VehicleCategoryTag.Hatch;
      else if (lower.includes('prime')) vehicleCategoryTag = VehicleCategoryTag.Prime;
      else if (lower.includes('crossover') || lower.includes('cross')) vehicleCategoryTag = VehicleCategoryTag.CrossOver;
      else if (lower.includes('suv')) vehicleCategoryTag = VehicleCategoryTag.Suv;
      else if (lower.includes('luxury')) vehicleCategoryTag = VehicleCategoryTag.Luxury;
    }
  }

  // Parse service selection
  let serviceSelection: string[] = [];
  if (order.serviceTypes) {
    serviceSelection = order.serviceTypes.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  if (serviceSelection.length === 0 && order.itemName) {
    serviceSelection = [order.itemName.trim()];
  }
  if (serviceSelection.length === 0 && order.requestedService) {
    serviceSelection = [order.requestedService.trim()];
  }

  // Set default if empty
  if (serviceSelection.length === 0) {
    serviceSelection = ['Daily Spark'];
  }

  // Map payment method
  let paymentMode: PaymentMode = 'Cash';
  const payMethod = (order.paymentMethod || order.paymentMode || '').toLowerCase();
  if (payMethod.includes('online') || payMethod.includes('card') || payMethod.includes('upi') || payMethod.includes('prepaid')) {
    paymentMode = 'Online';
  }

  // Sensitive validation mapping: Placed -> Queued, Shipped -> InProgress, Delivered -> Completed
  const mappedStatus = mapWebOrderStatusToServiceStatus(order.status || order.orderStatus);

  return {
    submissionId: orderId,
    appointmentId: orderId,
    timestamp: order.orderDate || order.requestDate || order.created_time || order.timestamp || new Date().toISOString(),
    submittedBy: 'Website Sync',
    customerFirstName,
    customerLastName,
    streetAddress,
    mobileNumber,
    customerEmail: '',
    customerLatitude: undefined,
    customerLongitude: undefined,
    carNumber,
    carBrandModel,
    vehicleCategoryTag,
    serviceSelection,
    isSubscription: false,
    carWashDetails: {
      washType: order.itemName || serviceSelection[0] || 'Daily Spark',
      price: grandTotal,
      mrp: grandTotal
    },
    beforeWashingPhoto: order.itemThumbnailSrc || '',
    beforeVideoInventory: '',
    beforeVideoTopBody: '',
    beforeVideoUnderchassis: '',
    afterWashingPhoto: '',
    afterVideoInterior: '',
    afterVideoExterior: '',
    afterVideoUnderchassis: '',
    tyreReplacementQuantity: 0,
    tyreReplacementPrice: 0,
    tyreReplacementTotalAmount: 0,
    tyreDetails: [],
    batteryReplacementQuantity: 0,
    batteryReplacementTotalAmount: 0,
    batteryDetails: [],
    addonsTotal: 0,
    categorizedAddons: [],
    categorizedAddonsTotal: 0,
    customServices: [],
    customServicesTotal: 0,
    customFieldData: [],
    grandTotal,
    acknowledgement: true,
    status: mappedStatus,
    scheduledDate: order.bookingDate || order.scheduledDate || '',
    scheduledTime: order.bookingTime || order.scheduledTime || '',
    assignedTo: '',
    paymentMode,
    cashAmount: paymentMode === 'Cash' ? grandTotal : 0,
    onlineAmount: paymentMode === 'Online' ? grandTotal : 0,
    paymentNotes: order.paymentMethod || '',
  };
}

// Map spreadsheet record to ServiceRequest lead
export function mapWebsiteOrderToServiceRequest(order: any, index: number = 0): ServiceRequest {
  const orderId = deriveOrderId(order, index);
  const { fullName } = deriveCustomerName(order);
  const customerPhone = derivePhone(order);
  const streetAddress = deriveAddress(order);
  const carRegNo = order.car_reg_no || order.carNumber || order.carRegNo || '';
  const carBrand = order.car_brand || order.carBrand || '';
  const carModel = order.car_model || order.carModel || '';
  const requestedService = order.serviceTypes || order.itemName || order.requestedService || order.service || 'Car Wash';
  const requestDate = order.orderDate || order.requestDate || order.created_time || order.timestamp || new Date().toISOString();

  // Preserve web order status sensitive validation ('Placed' | 'Shipped' | 'Delivered')
  const rawStatus = (order.status || order.orderStatus || '').trim();
  let webStatus = rawStatus;
  if (!webStatus) {
    webStatus = 'Placed';
  } else {
    webStatus = mapServiceStatusToWebOrderStatus(rawStatus);
  }

  return {
    id: orderId,
    customerName: fullName,
    customerPhone,
    requestedService,
    requestDate,
    source: 'Website',
    status: webStatus,
    carRegNo,
    carBrand,
    carModel,
    streetAddress,
    totalAmount: parseFloat(order.totalAmount || order.grandTotal || order.price || order.amount) || 0,
    originalOrderJson: JSON.stringify(order)
  };
}

export const DEFAULT_META_LEADS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing';
export const DEFAULT_WHATSAPP_ENQUIRY_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing';

// Robust Date Parser supporting DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and standard ISO timestamps
export function parseDateString(dateStr: any): string {
  if (!dateStr) return new Date().toISOString();
  const s = String(dateStr).trim();
  if (!s) return new Date().toISOString();

  // Pattern: DD/MM/YYYY or DD-MM-YYYY (e.g., 17/04/2026 or 17-04-2026)
  const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10) - 1;
    const year = parseInt(ddmmyyyy[3], 10);
    const hour = ddmmyyyy[4] ? parseInt(ddmmyyyy[4], 10) : 12;
    const min = ddmmyyyy[5] ? parseInt(ddmmyyyy[5], 10) : 0;
    const sec = ddmmyyyy[6] ? parseInt(ddmmyyyy[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Pattern: YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (yyyymmdd) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const standard = new Date(s);
  if (!isNaN(standard.getTime())) return standard.toISOString();

  return new Date().toISOString();
}

// Helper to normalize lead status to one of standard stages
export function normalizeLeadStatus(status: any): string {
  if (!status) return 'CREATED';
  const s = String(status).trim().toUpperCase();
  if (s === 'NEW' || s === 'OPEN') return 'CREATED';
  if (s === 'BOOKED' || s === 'DELIVERED' || s === 'COMPLETED' || s === 'WON' || s.includes('CONVERTED') || s.includes('SERVICE COMPLETED')) return 'CONVERTED';
  if (s === 'LOST' || s === 'DEAD' || s === 'CANCELLED') return 'NOT CONTACTABLE';
  if (['CREATED', 'CONTACTED', 'FOLLOW UP', 'HIGH INTENT', 'CONVERTED', 'NOT CONTACTABLE'].includes(s)) {
    return s;
  }
  // Check substrings
  if (s.includes('CONVERT')) return 'CONVERTED';
  if (s.includes('CONTACT') && !s.includes('NOT')) return 'CONTACTED';
  if (s.includes('FOLLOW')) return 'FOLLOW UP';
  if (s.includes('INTENT')) return 'HIGH INTENT';
  if (s.includes('NOT') || s.includes('LOST') || s.includes('DROP')) return 'NOT CONTACTABLE';
  return 'CREATED';
}

export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export const KNOWN_DEFAULT_SUBSHEETS = [
  'Car washing KNG (from june 26)',
  'Washing Meta Leads 2026 (till 21st june)',
  'Car washing Whatsapp lead Kolkata',
  'HC WP Enquiry Apri-Aug 2026',
  'HC Whatsapp ENquiry Apri-Aug 2026',
  'Potential Customer',
  'Meta Leads',
  'Meta',
  'Facebook',
  'Instagram',
  'Leads',
  'Form Submissions',
  'Orders',
  'Sheet1'
];

export async function discoverSheetSubsheets(spreadsheetUrl: string): Promise<string[]> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) return KNOWN_DEFAULT_SUBSHEETS;

  const discoveredTabs = new Set<string>();

  // 1. Try server proxy discovery first (immune to browser CORS and iframe limitations)
  try {
    const proxyUrl = `/api/fetch-google-sheet?spreadsheetId=${spreadsheetId}&action=discoverTabs&t=${Date.now()}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.status === 'success' && Array.isArray(data.tabs) && data.tabs.length > 0) {
        data.tabs.forEach((tab: string) => discoveredTabs.add(tab));
        return Array.from(discoveredTabs);
      }
    }
  } catch (err) {
    console.warn('[GoogleSheetService] Proxy subsheet discovery failed, trying direct HTML view:', err);
  }
  
  // 2. Direct browser HTML view fetch
  try {
    const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
    const res = await fetch(htmlUrl);
    if (res.ok) {
      const html = await res.text();
      const matches = html.match(/class="sheet-button"[^>]*>([^<]+)</gi) || 
                      html.match(/"name":"([^"]+)"/gi) ||
                      html.match(/id="sheet-button-[^"]*"[^>]*>([^<]+)</gi) ||
                      html.match(/item-sheet-name[^>]*>([^<]+)</gi) ||
                      html.match(/aria-label="([^"]+)" role="tab"/gi);
      if (matches) {
        matches.forEach(m => {
          const cleaned = m
            .replace(/<[^>]+>/g, '')
            .replace(/"name":"/g, '')
            .replace(/aria-label="/g, '')
            .replace(/" role="tab"/g, '')
            .replace(/"/g, '')
            .trim();
          if (cleaned && !cleaned.toLowerCase().includes('google') && cleaned.length < 60) {
            discoveredTabs.add(cleaned);
          }
        });
      }
    }
  } catch (err) {
    console.warn('[GoogleSheetService] Could not auto-discover tabs via htmlview:', err);
  }

  // Include known subsheets as well so the user gets all their primary sheets
  KNOWN_DEFAULT_SUBSHEETS.forEach(tab => discoveredTabs.add(tab));

  return Array.from(discoveredTabs);
}

// Diagnose Google Sheet connectivity and access permissions
export async function diagnoseGoogleSheetAccess(spreadsheetUrl: string): Promise<{
  isAccessible: boolean;
  requiresAuth: boolean;
  message: string;
  spreadsheetId: string;
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) {
    return {
      isAccessible: false,
      requiresAuth: false,
      message: 'Invalid Google Sheet URL. Could not extract spreadsheet ID.',
      spreadsheetId: ''
    };
  }

  try {
    const proxyUrl = `/api/fetch-google-sheet?spreadsheetId=${spreadsheetId}&action=diagnose&t=${Date.now()}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const data = await res.json();
      return {
        isAccessible: !!data.isAccessible,
        requiresAuth: !!data.requiresAuth,
        message: data.message || (data.isAccessible ? 'Sheet is accessible' : 'Sheet access restricted'),
        spreadsheetId
      };
    }
  } catch (err: any) {
    console.warn('[GoogleSheetService] Diagnose proxy call failed:', err);
  }

  return {
    isAccessible: true,
    requiresAuth: false,
    message: 'Could not diagnose online status. Direct connection will be attempted.',
    spreadsheetId
  };
}

// Fetch a single sheet tab using multiple fallback strategies (Internal Server Proxy, GViz CSV, GViz JSON, Export TSV, CORS Proxy)
export async function fetchSingleSheetTab(spreadsheetId: string, tabName?: string): Promise<any[]> {
  const tabParam = tabName ? `&sheet=${encodeURIComponent(tabName)}` : '';
  const now = Date.now();

  // Strategy 0: Internal Server Proxy (Server-to-Server, immune to browser CORS and iframe sandbox restrictions)
  try {
    const proxyUrl = `/api/fetch-google-sheet?spreadsheetId=${spreadsheetId}${tabParam}&t=${now}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.status === 'success' && data.data) {
        if (data.format === 'csv') {
          const rows = parseCSV(data.data);
          if (rows.length > 0) return rows;
        } else if (data.format === 'json') {
          const rows = parseGVizJSON(data.data);
          if (rows.length > 0) return rows;
        } else if (data.format === 'tsv') {
          const rows = parseTSV(data.data);
          if (rows.length > 0) return rows;
        }
      } else if (data.error === 'AUTH_REQUIRED' || data.requiresAuth) {
        throw new Error(`AUTH_REQUIRED: Access restricted for tab "${tabName || 'default'}". Please set Google Sheet General Access to "Anyone with the link can view".`);
      }
    }
  } catch (e: any) {
    if (e.message && e.message.startsWith('AUTH_REQUIRED')) {
      throw e;
    }
    console.warn(`[GoogleSheetService] Proxy fetch attempt failed for tab "${tabName}":`, e.message || e);
  }

  // Strategy 1: Google GViz Query CSV (Best for tab-specific queries)
  try {
    const gvizCsvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${tabParam}&t=${now}`;
    const res = await fetch(gvizCsvUrl);
    if (res.ok) {
      const csvText = await res.text();
      // Verify not an error html page
      if (csvText && !csvText.trim().startsWith('<!DOCTYPE') && !csvText.trim().startsWith('<html')) {
        const rows = parseCSV(csvText);
        if (rows.length > 0) {
          return rows;
        }
      }
    }
  } catch (e: any) {
    console.warn(`[GoogleSheetService] GViz CSV direct fetch failed for tab "${tabName}":`, e.message || e);
  }

  // Strategy 2: Google GViz Query JSON
  try {
    const gvizJsonUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json${tabParam}&t=${now}`;
    const res = await fetch(gvizJsonUrl);
    if (res.ok) {
      const jsonText = await res.text();
      const rows = parseGVizJSON(jsonText);
      if (rows.length > 0) {
        return rows;
      }
    }
  } catch (e: any) {
    console.warn(`[GoogleSheetService] GViz JSON direct fetch failed for tab "${tabName}":`, e.message || e);
  }

  // Strategy 3: Export TSV
  try {
    const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=tsv${tabParam}&t=${now}`;
    const res = await fetch(exportUrl);
    if (res.ok) {
      const tsvText = await res.text();
      if (tsvText && !tsvText.trim().startsWith('<!DOCTYPE') && !tsvText.trim().startsWith('<html')) {
        const rows = parseTSV(tsvText);
        if (rows.length > 0) {
          return rows;
        }
      }
    }
  } catch (e: any) {
    console.warn(`[GoogleSheetService] Export TSV direct fetch failed for tab "${tabName}":`, e.message || e);
  }

  // Strategy 4: CORS Proxy Fallback
  try {
    const targetGviz = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${tabParam}&t=${now}`;
    const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetGviz)}`;
    const res = await fetch(corsProxyUrl);
    if (res.ok) {
      const text = await res.text();
      if (text && !text.trim().startsWith('<!DOCTYPE') && !text.trim().startsWith('<html')) {
        const rows = parseCSV(text);
        if (rows.length > 0) return rows;
      }
    }
  } catch (e: any) {
    console.warn(`[GoogleSheetService] CORS proxy fallback failed for tab "${tabName}":`, e.message || e);
  }

  return [];
}

export async function fetchMetaLeadsFromSheet(spreadsheetUrl: string, tabName?: string, lastSyncedTimestamp?: string): Promise<any[]> {
  const startTime = performance.now();
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  if (!spreadsheetId) {
    throw new Error('Invalid Google Sheet URL. Could not extract spreadsheet ID.');
  }

  // Determine list of tabs to query
  let tabsToFetch: string[] = [];
  if (tabName && tabName.trim()) {
    tabName.split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed && !tabsToFetch.includes(trimmed)) {
        tabsToFetch.push(trimmed);
      }
    });
  }

  // If no tab is specified or user wants all known subsheets, populate defaults
  if (tabsToFetch.length === 0) {
    tabsToFetch = [
      'Car washing KNG (from june 26)',
      'Washing Meta Leads 2026 (till 21st june)',
      'Car washing Whatsapp lead Kolkata',
      'HC WP Enquiry Apri-Aug 2026',
      'HC Whatsapp ENquiry Apri-Aug 2026',
      'Potential Customer',
      'Meta Leads',
      'Meta',
      'Form Submissions'
    ];
  }

  const allRows: any[] = [];
  const seenIds = new Set<string>();
  let skippedCount = 0;
  let totalEvaluated = 0;
  let authErrorOccurred = false;
  let authErrorMessage = '';

  const lastSyncTimeMs = lastSyncedTimestamp ? new Date(lastSyncedTimestamp).getTime() : NaN;
  if (!isNaN(lastSyncTimeMs) && lastSyncTimeMs > 0) {
    console.log(`[GoogleSheetService] Applying last_sync_timestamp filter: ${lastSyncedTimestamp} (${lastSyncTimeMs})`);
  }

  // Fetch each subsheet tab
  for (const tab of tabsToFetch) {
    try {
      console.log(`[GoogleSheetService] Fetching leads from sub-sheet tab: "${tab}"`);
      const rows = await fetchSingleSheetTab(spreadsheetId, tab);
      
      for (const row of rows) {
        totalEvaluated++;
        row._subsheetTabName = tab;

        // Date-wise incremental skipping if last_sync_timestamp is set
        if (!isNaN(lastSyncTimeMs) && lastSyncTimeMs > 0) {
          const rowTimeStr = row.created_time || row.requestDate || row.createdTime || row.timestamp || row.Date || row.date;
          if (rowTimeStr) {
            const rowTimeMs = new Date(rowTimeStr).getTime();
            if (!isNaN(rowTimeMs) && rowTimeMs <= lastSyncTimeMs) {
              skippedCount++;
              continue;
            }
          }
        }

        // Deduplication key
        const phone = (row.phone_number || row.phone || row['Phone '] || row.mobile || '').toString().trim();
        const date = (row.created_time || row.Date || row.date || row.timestamp || '').toString().trim();
        const rowId = (row.ad_id || row.id || row.No || row.no || '').toString().trim();
        const idKey = rowId ? `${rowId}_${tab}` : `${phone}_${date}_${tab}`;

        if (idKey && !seenIds.has(idKey)) {
          seenIds.add(idKey);
          allRows.push(row);
        } else if (!idKey) {
          allRows.push(row);
        }
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('AUTH_REQUIRED')) {
        authErrorOccurred = true;
        authErrorMessage = err.message;
      }
      console.warn(`[GoogleSheetService] Notice for sub-sheet "${tab}":`, err.message || err);
    }
  }

  // Fallback to default tab export if nothing was retrieved from specific tabs
  if (allRows.length === 0 && skippedCount === 0) {
    try {
      console.log(`[GoogleSheetService] Fetching default sheet tab...`);
      const defaultRows = await fetchSingleSheetTab(spreadsheetId);
      for (const row of defaultRows) {
        totalEvaluated++;
        row._subsheetTabName = 'Main';
        allRows.push(row);
      }
    } catch (e: any) {
      if (e.message && e.message.startsWith('AUTH_REQUIRED')) {
        authErrorOccurred = true;
        authErrorMessage = e.message;
      }
      console.warn('[GoogleSheetService] Default sheet export failed:', e.message || e);
    }
  }

  // If no rows were fetched and auth error was detected, throw clear actionable error
  if (allRows.length === 0 && skippedCount === 0 && authErrorOccurred) {
    throw new Error(authErrorMessage || 'Google Sheet access is restricted. Please open your Google Sheet, click "Share", and set General Access to "Anyone with the link can view".');
  }

  const durationMs = Math.round(performance.now() - startTime);
  const estimatedTimeSavedMs = Math.round(skippedCount * 65);

  (allRows as any).stats = {
    totalRowsEvaluated: totalEvaluated,
    rowsSkipped: skippedCount,
    rowsProcessed: allRows.length,
    syncDurationMs: durationMs,
    estimatedTimeSavedMs,
    lastSyncTimestamp: lastSyncedTimestamp || null,
  };

  return allRows;
}

// Fetch WhatsApp Enquiries from Dedicated Google Sheet
export async function fetchWhatsAppEnquiriesFromSheet(
  spreadsheetUrl: string = DEFAULT_WHATSAPP_ENQUIRY_SHEET_URL,
  tabName?: string,
  lastSyncedTimestamp?: string
): Promise<any[]> {
  const startTime = performance.now();
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl) || '1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ';

  // Determine list of tabs to query
  let tabsToFetch: string[] = [];
  if (tabName && tabName.trim()) {
    tabName.split(',').forEach(t => {
      const trimmed = t.trim();
      if (trimmed && !tabsToFetch.includes(trimmed)) {
        tabsToFetch.push(trimmed);
      }
    });
  }

  if (tabsToFetch.length === 0) {
    tabsToFetch = ['Sheet1', 'WhatsApp Enquiries', 'WhatsApp', 'Enquiries', 'Leads'];
  }

  const allRows: any[] = [];
  const seenIds = new Set<string>();
  let skippedCount = 0;
  let totalEvaluated = 0;
  let authErrorOccurred = false;
  let authErrorMessage = '';

  const lastSyncTimeMs = lastSyncedTimestamp ? new Date(lastSyncedTimestamp).getTime() : NaN;
  if (!isNaN(lastSyncTimeMs) && lastSyncTimeMs > 0) {
    console.log(`[GoogleSheetService] Applying WhatsApp last_sync_timestamp filter: ${lastSyncedTimestamp} (${lastSyncTimeMs})`);
  }

  for (const tab of tabsToFetch) {
    try {
      console.log(`[GoogleSheetService] Fetching WhatsApp enquiries from tab: "${tab}"`);
      const rows = await fetchSingleSheetTab(spreadsheetId, tab);
      if (rows && rows.length > 0) {
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          totalEvaluated++;
          row._subsheetTabName = tab;

          // Date incremental skipping if requested
          if (!isNaN(lastSyncTimeMs) && lastSyncTimeMs > 0) {
            const rowDateStr = row.Date || row.date || row.created_time || row.timestamp;
            if (rowDateStr) {
              const rowIso = parseDateString(rowDateStr);
              const rowTimeMs = new Date(rowIso).getTime();
              if (!isNaN(rowTimeMs) && rowTimeMs <= lastSyncTimeMs) {
                skippedCount++;
                continue;
              }
            }
          }

          const phone = (row['Phone '] || row.Phone || row.phone || row.phone_number || row.mobile || '').toString().trim();
          const noVal = (row.No || row.no || row.id || `${i + 1}`).toString().trim();
          const idKey = `wa_${noVal}_${phone}`;

          if (!seenIds.has(idKey)) {
            seenIds.add(idKey);
            allRows.push(row);
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.startsWith('AUTH_REQUIRED')) {
        authErrorOccurred = true;
        authErrorMessage = err.message;
      }
      console.warn(`[GoogleSheetService] Notice for WhatsApp tab "${tab}":`, err.message || err);
    }
  }

  // Fallback to default tab export if nothing was retrieved from specific tabs
  if (allRows.length === 0 && skippedCount === 0) {
    try {
      console.log(`[GoogleSheetService] Fetching default WhatsApp sheet tab...`);
      const defaultRows = await fetchSingleSheetTab(spreadsheetId);
      for (let i = 0; i < defaultRows.length; i++) {
        const row = defaultRows[i];
        totalEvaluated++;
        row._subsheetTabName = 'Main';
        allRows.push(row);
      }
    } catch (e: any) {
      if (e.message && e.message.startsWith('AUTH_REQUIRED')) {
        authErrorOccurred = true;
        authErrorMessage = e.message;
      }
      console.warn('[GoogleSheetService] Default WhatsApp sheet export failed:', e.message || e);
    }
  }

  if (allRows.length === 0 && skippedCount === 0 && authErrorOccurred) {
    throw new Error(authErrorMessage || 'WhatsApp Google Sheet access is restricted. Please set General Access to "Anyone with the link can view".');
  }

  const durationMs = Math.round(performance.now() - startTime);
  const estimatedTimeSavedMs = Math.round(skippedCount * 65);

  (allRows as any).stats = {
    totalRowsEvaluated: totalEvaluated,
    rowsSkipped: skippedCount,
    rowsProcessed: allRows.length,
    syncDurationMs: durationMs,
    estimatedTimeSavedMs,
    lastSyncTimestamp: lastSyncedTimestamp || null,
  };

  return allRows;
}

// Maps manually filled WhatsApp Enquiry row into standardized ServiceRequest
export function mapWhatsAppEnquiryToServiceRequest(row: any, index: number = 0): ServiceRequest {
  const normalizedKeyMap: Record<string, string> = {};
  const cleanKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const rawKey in row) {
    if (Object.prototype.hasOwnProperty.call(row, rawKey)) {
      normalizedKeyMap[cleanKey(rawKey)] = rawKey;
    }
  }

  const getVal = (...keys: string[]): string => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
      const norm = cleanKey(k);
      const matchedRawKey = normalizedKeyMap[norm];
      if (matchedRawKey && row[matchedRawKey] !== undefined && row[matchedRawKey] !== null && String(row[matchedRawKey]).trim() !== '') {
        return String(row[matchedRawKey]).trim();
      }
    }
    return '';
  };

  // 1. Row Number / ID
  const noVal = getVal('No', 'no', 'id', 'ID', 'Sl No', 'slno', 'SrNo', 'Num');
  
  // 2. Phone
  let rawPhone = getVal('Phone ', 'Phone', 'phone', 'phone_number', 'Mobile', 'mobile', 'wa_number', 'whatsapp', 'Customer Phone');
  let cleanPhone = rawPhone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  // 3. Customer Name
  let name = getVal('Customer Name', 'customer_name', 'Name', 'name', 'Client Name', 'Customer');
  if (!name && cleanPhone) {
    name = `Customer (${cleanPhone.slice(-4)})`;
  }
  if (!name) name = 'WhatsApp Customer';

  // 4. Date
  const rawDate = getVal('Date', 'date', 'created_time', 'timestamp', 'Created At');
  const requestDate = parseDateString(rawDate);

  // 5. Car Model & Brand
  const rawCarModel = getVal('Car Model', 'car_model', 'carModel', 'model', 'Vehicle', 'Car');
  let carBrand = getVal('Car Brand', 'car_brand', 'carBrand', 'brand');
  let carModel = rawCarModel;

  if (rawCarModel && !carBrand) {
    const parts = rawCarModel.split(/\s+/);
    if (parts.length > 1) {
      const firstTwo = `${parts[0]} ${parts[1]}`.toLowerCase();
      if (['maruti suzuki', 'tata motors', 'land rover', 'rolls royce', 'aston martin'].includes(firstTwo)) {
        carBrand = parts.slice(0, 2).join(' ');
        carModel = parts.slice(2).join(' ');
      } else {
        carBrand = parts[0];
        carModel = parts.slice(1).join(' ');
      }
    }
  }

  // Normalize common misspelled brands
  if (carBrand && carBrand.toLowerCase() === 'renult') {
    carBrand = 'Renault';
  }

  // 6. Location / Address
  const streetAddress = getVal('Location', 'location', 'street_address', 'Address', 'address', 'Area', 'City');

  // 7. Enquiry Type / Requested Service
  const requestedService = getVal('Enquiry Type', 'enquiry_type', 'Service', 'service', 'requestedService', 'Service Type') || 'Car Washing & Detailing';

  // 8. Lead Cost
  let leadCost: number | undefined = undefined;
  const rawLeadCost = getVal('Lead Cost', 'lead_cost', 'cost');
  if (rawLeadCost) {
    const num = parseFloat(rawLeadCost.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) leadCost = num;
  }

  // 9. Value / Price
  let totalAmount: number | undefined = undefined;
  const rawVal = getVal('Value', 'value', 'price', 'amount', 'grandTotal', 'Deal Value');
  if (rawVal) {
    const num = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) totalAmount = num;
  }

  // 10. Status
  const rawStatus = getVal('Status', 'status', 'stage', 'lead_status');
  const status = normalizeLeadStatus(rawStatus);

  // 11. Remarks & Action
  const remarks = getVal('Remarks', 'remarks', 'note', 'notes', 'comment');
  const actionNotes = getVal('Action (Followup/Reminder/Booking)', 'Action', 'action', 'Followup', 'Action Notes');
  const combinedRemarks = [remarks, actionNotes].filter(Boolean).join(' | ');

  // 12. Lead Owner / Agent
  const assignedAgent = getVal('Lead Owner', 'lead_owner', 'Owner', 'owner', 'Agent', 'assignedAgent');

  // 13. ID Generation (Prefix with wa_lead_ to avoid any conflict with Meta or Web leads)
  const idKey = noVal ? `${noVal}_${cleanPhone || 'anon'}` : `${cleanPhone || 'lead'}_${index}_${Date.now()}`;
  const id = `wa_lead_${idKey}`;

  return {
    id,
    customerName: name,
    customerPhone: cleanPhone || rawPhone,
    requestedService,
    requestDate,
    syncedAt: row.syncedAt || new Date().toISOString(),
    source: 'WhatsApp',
    leadSource: 'WhatsApp',
    status,
    carBrand: carBrand || undefined,
    carModel: carModel || undefined,
    streetAddress: streetAddress || undefined,
    totalAmount,
    leadCost,
    remarks: combinedRemarks || remarks || '',
    actionNotes: actionNotes || undefined,
    platform: 'whatsapp',
    createdTime: requestDate,
    bookingReminderDate: actionNotes || undefined,
    assignedAgent: assignedAgent || undefined,
    originalOrderJson: JSON.stringify(row)
  };
}

// Universal Dynamic Header Reader and Mapper for Meta Forms, WhatsApp Enquiries, & Custom Sheets
// Dynamic Ticket Maker: Convert any ServiceRequest (Meta / WhatsApp / Web / Manual) into an official Service Ticket
export function mapLeadToOfficialService(lead: ServiceRequest, vehicleMap?: Record<string, string[]> | any): Service {
  const nameParts = (lead.customerName || 'Customer').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Customer';
  const lastName = nameParts.slice(1).join(' ') || '';
  const totalAmount = lead.totalAmount || 0;

  // Smart vehicle category determination
  let vehicleCategoryTag = VehicleCategoryTag.Prime;
  const brandLower = (lead.carBrand || '').toLowerCase();
  const modelLower = (lead.carModel || '').toLowerCase();
  const combinedVehicle = `${brandLower} ${modelLower}`.trim();

  if (Array.isArray(vehicleMap) && vehicleMap.length > 0 && (brandLower || modelLower)) {
    const matched = vehicleMap.find((v: any) => {
      const vBrand = (v.brand || '').toLowerCase();
      const vModel = (v.model || '').toLowerCase();
      return (brandLower && vBrand.includes(brandLower) && modelLower && vModel.includes(modelLower)) ||
             (combinedVehicle && `${vBrand} ${vModel}`.includes(combinedVehicle));
    });
    if (matched && matched.category) {
      vehicleCategoryTag = matched.category;
    }
  }

  // Fallback heuristics for category if no database match
  if (vehicleCategoryTag === VehicleCategoryTag.Prime) {
    if (combinedVehicle.includes('thar') || combinedVehicle.includes('scorpio') || combinedVehicle.includes('xuv') || combinedVehicle.includes('safari') || combinedVehicle.includes('harrier') || combinedVehicle.includes('creta') || combinedVehicle.includes('seltos') || combinedVehicle.includes('fortuner') || combinedVehicle.includes('bolero') || combinedVehicle.includes('suv')) {
      vehicleCategoryTag = VehicleCategoryTag.Suv;
    } else if (combinedVehicle.includes('alto') || combinedVehicle.includes('kwid') || combinedVehicle.includes('nano') || combinedVehicle.includes('s-presso') || combinedVehicle.includes('micro')) {
      vehicleCategoryTag = VehicleCategoryTag.Micro;
    } else if (combinedVehicle.includes('swift') || combinedVehicle.includes('i10') || combinedVehicle.includes('i20') || combinedVehicle.includes('baleno') || combinedVehicle.includes('tiago') || combinedVehicle.includes('wagon r') || combinedVehicle.includes('ignis') || combinedVehicle.includes('hatch')) {
      vehicleCategoryTag = VehicleCategoryTag.Hatch;
    } else if (combinedVehicle.includes('bmw') || combinedVehicle.includes('mercedes') || combinedVehicle.includes('audi') || combinedVehicle.includes('jaguar') || combinedVehicle.includes('porsche') || combinedVehicle.includes('luxury')) {
      vehicleCategoryTag = VehicleCategoryTag.Luxury;
    }
  }

  const carBrandModel = (lead.carBrand || lead.carModel)
    ? [lead.carBrand, lead.carModel].filter(Boolean).join(' - ')
    : 'Vehicle - General';

  const requestedService = lead.requestedService || 'Car Washing';
  const serviceSelection = [requestedService];

  // Derive scheduled date from booking reminder date if valid
  let scheduledDate = '';
  if (lead.bookingReminderDate) {
    try {
      const d = new Date(lead.bookingReminderDate);
      if (!isNaN(d.getTime())) {
        scheduledDate = d.toISOString().split('T')[0];
      } else {
        scheduledDate = lead.bookingReminderDate;
      }
    } catch (e) {
      scheduledDate = lead.bookingReminderDate;
    }
  }

  const orderId = lead.id.startsWith('SRV_') ? lead.id : `TKT_${lead.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return {
    submissionId: orderId,
    appointmentId: orderId,
    timestamp: lead.requestDate || new Date().toISOString(),
    submittedBy: lead.source === 'WhatsApp' ? 'WhatsApp Lead Sync' : (lead.source === 'Meta' ? 'Meta Lead Sync' : 'Lead Conversion'),
    customerFirstName: firstName,
    customerLastName: lastName,
    streetAddress: lead.streetAddress || '',
    mobileNumber: lead.customerPhone || '',
    customerEmail: '',
    carNumber: lead.carRegNo || '',
    carBrandModel,
    vehicleCategoryTag,
    serviceSelection,
    isSubscription: false,
    carWashDetails: {
      washType: requestedService,
      price: totalAmount,
      mrp: totalAmount
    },
    beforeWashingPhoto: '',
    beforeVideoInventory: '',
    beforeVideoTopBody: '',
    beforeVideoUnderchassis: '',
    afterWashingPhoto: '',
    afterVideoInterior: '',
    afterVideoExterior: '',
    afterVideoUnderchassis: '',
    tyreReplacementQuantity: 0,
    tyreReplacementPrice: 0,
    tyreReplacementTotalAmount: 0,
    tyreDetails: [],
    batteryReplacementQuantity: 0,
    batteryReplacementTotalAmount: 0,
    batteryDetails: [],
    addonsTotal: 0,
    categorizedAddons: [],
    categorizedAddonsTotal: 0,
    customServices: [],
    customServicesTotal: 0,
    customFieldData: [],
    grandTotal: totalAmount,
    acknowledgement: true,
    status: ServiceStatus.Queued,
    scheduledDate,
    scheduledTime: '',
    assignedTo: lead.assignedAgent || '',
    paymentMode: 'Cash',
    cashAmount: totalAmount,
    onlineAmount: 0,
    paymentNotes: lead.remarks || '',
  };
}

export function mapMetaLeadToServiceRequest(row: any): ServiceRequest {
  // Normalize row keys to lower-case without spaces/underscores/special chars for ultra-tolerant matching
  const normalizedKeyMap: Record<string, string> = {};
  const cleanKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const rawKey in row) {
    if (Object.prototype.hasOwnProperty.call(row, rawKey)) {
      normalizedKeyMap[cleanKey(rawKey)] = rawKey;
    }
  }

  const getVal = (...keys: string[]): string => {
    for (const k of keys) {
      // Direct match
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
      // Normalized match
      const norm = cleanKey(k);
      const matchedRawKey = normalizedKeyMap[norm];
      if (matchedRawKey && row[matchedRawKey] !== undefined && row[matchedRawKey] !== null && String(row[matchedRawKey]).trim() !== '') {
        return String(row[matchedRawKey]).trim();
      }
    }
    return '';
  };

  const subsheetName = row._subsheetTabName || getVal('subsheet_name', 'subsheetName', 'tab') || '';

  // 1. Phone number (cleaned)
  let rawPhone = getVal('phone_number', 'phone', 'Phone ', 'mobile', 'Mobile', 'Customer Phone', 'Contact', 'wa_number', 'whatsapp', 'user_id', 'userId', 'Phone Number', 'Phone');
  let cleanPhone = rawPhone;
  if (cleanPhone.startsWith('p:')) {
    cleanPhone = cleanPhone.substring(2).trim();
  }
  cleanPhone = cleanPhone.replace(/[\s\-()]/g, '');

  // 2. Customer Name
  let name = getVal('full_name', 'Customer Name', 'customer_name', 'Name', 'name', 'Client Name', 'userName', 'Lead Name', 'Customer');
  if (!name && cleanPhone) {
    name = `Customer (${cleanPhone.slice(-4)})`;
  }
  if (!name) name = 'Lead Customer';

  // 3. Requested Service / Enquiry Type
  let requestedService = getVal(
    "service_that_you're_interested_in",
    "service_that_you_re_interested_in",
    'service_that_youre_interested_in',
    'Enquiry Type',
    'enquiry_type',
    'service',
    'requestedService',
    'requested_service',
    'Services',
    'Service',
    'itemName',
    'serviceTypes'
  );
  if (!requestedService) {
    requestedService = subsheetName.toLowerCase().includes('wash') ? 'Car Washing & Deep Cleaning' : 'Car Washing';
  }

  // 4. Car Brand & Model
  let carModel = getVal('car_model', 'Car Model', 'carModel', 'model', 'Vehicle', 'Car');
  let carBrand = getVal('car_brand', 'Car Brand', 'carBrand', 'brand');
  const carRegNo = getVal('car_reg_no', 'Car Number', 'carNumber', 'carRegNo', 'Reg No', 'reg_no', 'Car No');

  // Smart splitting of combined brand & model like "Maruti Suzuki ignis", "Hyundai venue", "Mahindra Bolero neo", "Swift dezire", "Thar roxx"
  if (carModel && !carBrand) {
    const parts = carModel.split(' ');
    if (parts.length > 1) {
      const firstTwo = `${parts[0]} ${parts[1]}`.toLowerCase();
      if (['maruti suzuki', 'tata motors', 'land rover'].includes(firstTwo)) {
        carBrand = parts.slice(0, 2).join(' ');
        carModel = parts.slice(2).join(' ');
      } else {
        carBrand = parts[0];
        carModel = parts.slice(1).join(' ');
      }
    }
  }

  // 5. Street Address / Location
  const streetAddress = getVal('street_address', 'Location', 'location', 'streetAddress', 'address', 'Address', 'City', 'Area', 'shippingAddress');

  // 6. Lead Status (Normalized to CREATED, CONTACTED, FOLLOW UP, HIGH INTENT, CONVERTED, NOT CONTACTABLE)
  const rawStatus = getVal('lead_status', 'Status', 'status', 'leadStatus', 'stage', 'Lead Status');
  const status = normalizeLeadStatus(rawStatus);

  // 7. Value / Price / Amount
  let totalAmount: number | undefined = undefined;
  const rawVal = getVal('Value', 'value', 'totalAmount', 'grandTotal', 'price', 'amount', 'Lead Cost', 'lead_cost');
  if (rawVal) {
    const num = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
    if (!isNaN(num)) totalAmount = num;
  }

  // 8. Remarks & Action Notes
  const remarks = getVal('Remarks', 'remarks', 'notes', 'Comments', 'comment', 'Remark');
  const actionField = getVal('Action (Followup/Reminder/Booking)', 'Action', 'action', 'Action Notes');
  const combinedRemarks = [remarks, actionField].filter(Boolean).join(' | ');

  // 9. Booking Date / Reminder Date
  const bookingReminderDate = getVal(
    'Date of Booking/Reminder',
    'date_of_booking_reminder',
    'date_of_booking/reminder',
    'Booking Date',
    'bookingReminderDate',
    'Action (Followup/Reminder/Booking)'
  );

  // 10. Date / Timestamp / Created Time
  let requestDate = getVal('created_time', 'createdTime', 'Date', 'date', 'requestDate', 'request_date', 'timestamp', 'Created At');
  if (!requestDate) {
    requestDate = new Date().toISOString();
  } else {
    const parsedDate = new Date(requestDate);
    if (!isNaN(parsedDate.getTime())) {
      requestDate = parsedDate.toISOString();
    }
  }

  // 11. Lead Owner / Agent
  const assignedAgent = getVal('Lead Owner', 'lead_owner', 'owner', 'assignedAgent', 'assignedTo', 'Agent', 'agent');

  // 12. Campaign & Ads Metadata
  const campaignName = getVal('campaign_name', 'campaignName', 'Campaign', 'campaign');
  const adName = getVal('ad_name', 'adName', 'Ad Name');
  const formName = getVal('form_name', 'formName', 'Form Name') || subsheetName || '';
  let platform = getVal('platform', 'Platform');
  if (!platform) {
    if (subsheetName.toLowerCase().includes('whatsapp') || subsheetName.toLowerCase().includes('wp')) {
      platform = 'whatsapp';
    } else {
      platform = 'fb';
    }
  }

  // 13. ID generation
  const rawId = getVal('ad_id', 'id', 'Id', 'ID', 'No', 'no');
  const id = rawId 
    ? (rawId.startsWith('meta_') || rawId.startsWith('lead_') ? rawId : `lead_${cleanPhone || 'id'}_${rawId}`) 
    : `lead_${cleanPhone || 'anon'}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

  // Determine Source (Meta vs WhatsApp vs Web)
  let leadSource: 'Meta' | 'WhatsApp' | 'Website' | 'Manual' = 'Meta';
  if (platform.toLowerCase().includes('wa') || platform.toLowerCase().includes('whatsapp') || subsheetName.toLowerCase().includes('whatsapp') || subsheetName.toLowerCase().includes('wp')) {
    leadSource = 'WhatsApp';
  }

  return {
    id,
    customerName: name,
    customerPhone: cleanPhone,
    requestedService,
    requestDate,
    syncedAt: row.syncedAt || new Date().toISOString(),
    source: leadSource,
    leadSource,
    status,
    carRegNo: carRegNo || undefined,
    carBrand: carBrand || undefined,
    carModel: carModel || undefined,
    streetAddress: streetAddress || undefined,
    totalAmount,
    remarks: combinedRemarks || remarks || '',
    campaignName: campaignName || undefined,
    adName: adName || undefined,
    formName: formName || undefined,
    subsheetName: subsheetName || undefined,
    platform: platform || undefined,
    createdTime: requestDate,
    bookingReminderDate: bookingReminderDate || undefined,
    assignedAgent: assignedAgent || undefined,
    originalOrderJson: JSON.stringify(row)
  };
}

// Helper to parse standard CSV text (handling quotes and commas)
export function parseCSV(csvText: string): any[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];

  const parseRow = (rowStr: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let inCellQuotes = false;

    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === '"') {
        inCellQuotes = !inCellQuotes;
      } else if (char === ',' && !inCellQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
  const results: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]).map(v => v.replace(/^"|"$/g, '').trim());
    if (values.every(v => !v)) continue;

    const obj: any = {};
    headers.forEach((header, idx) => {
      if (header) {
        obj[header] = values[idx] || '';
      }
    });
    results.push(obj);
  }
  return results;
}

// Fetch complete Car Database from website Google Spreadsheet ('CarDatabase' subsheet)
export async function fetchCarDatabaseFromSheet(customUrl?: string, sheetName: string = 'CarDatabase'): Promise<CarDatabaseItem[]> {
  const spreadsheetId = customUrl 
    ? (extractSpreadsheetId(customUrl) || '1pwudbKQILwXS99R0eQNJxc_65A8rjC9IaTzoYwSba94') 
    : '1pwudbKQILwXS99R0eQNJxc_65A8rjC9IaTzoYwSba94';

  let rawRows: any[] = [];

  // Try server proxy first
  try {
    const proxyRes = await fetch(`/api/fetch-google-sheet?spreadsheetId=${spreadsheetId}&sheet=${encodeURIComponent(sheetName)}&t=${Date.now()}`);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.status === 'success' && data.data) {
        if (data.format === 'csv') rawRows = parseCSV(data.data);
        else if (data.format === 'json') rawRows = parseGVizJSON(data.data);
        else rawRows = parseTSV(data.data);
      }
    }
  } catch (err) {
    console.warn('[GoogleSheetService] Proxy fetch for CarDatabase failed, falling back to direct fetch', err);
  }

  if (rawRows.length === 0) {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}&t=${Date.now()}`;
    console.log(`[GoogleSheetService] Fetching CarDatabase from: ${gvizUrl}`);

    const response = await fetch(gvizUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch CarDatabase sheet (HTTP ${response.status})`);
    }

    const csvText = await response.text();
    rawRows = parseCSV(csvText);
  }

  const carDatabase: CarDatabaseItem[] = rawRows.map((row, index) => {
    const brand = row.brand || 'Unknown';
    const model = row.model || 'Unknown';
    const version = row.version || row.variant || '';
    const fuelType = row.fuel_type || row.fueltype || row.fuel || 'Petrol';
    const yearRange = row.year_range || row.yearrange || row.year || '';
    
    // Create stable unique ID
    const cleanId = `car_${brand}_${model}_${version}_${yearRange}_${index}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');

    return {
      id: cleanId,
      brand: brand,
      logo: row.logo || '',
      model: model,
      image: row.image || '',
      version: version,
      yearRange: yearRange,
      fuelType: fuelType,
      frontTyresSpec: row.front_tyres_spec || row.fronttyresspec || '',
      frontTyresWidth: row.front_tyres_width || row.fronttyreswidth || '',
      frontTyresProfile: row.front_tyres_profile || row.fronttyresprofile || '',
      frontTyresRadius: row.front_tyres_radius || row.fronttyresradius || '',
      rearTyresSpec: row.rear_tyres_spec || row.reartyresspec || '',
      rearTyresWidth: row.rear_tyres_width || row.reartyreswidth || '',
      rearTyresProfile: row.rear_tyres_profile || row.reartyresprofile || '',
      rearTyresRadius: row.rear_tyres_radius || row.reartyresradius || '',
      tag: row.tag || 'Hatch'
    };
  });

  return carDatabase;
}

