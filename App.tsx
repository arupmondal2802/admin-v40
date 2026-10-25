
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Service, ServiceStatus, User, Settings, Customer, SubscriptionPlan, UserSubscription, ServiceTemplate, ServiceRequest, AppNotification, NotificationPreferences, RetentionKpiTargets, RetentionActivityLog, LocationHistory, AttendanceStatus, AttendanceRecord, Permission, TyreData, VehicleCategoryTag, ProfitLoss, PredefinedCost, PricingConfig, InventoryItem, InventoryMovement, ExpenseItem, RecurringExpense, SpendCategory, AuditLog, WarrantyRecord, AppData, CarDatabaseItem, SyncPerformanceStats } from './types';
import { INITIAL_CAR_DATABASE } from './data/carDatabaseFallback';
import * as inventoryService from './services/inventoryService';
import { IconX, IconRefresh, IconMenu2, IconUser, IconSearch, IconSparkles, IconKey } from './components/ui/Icon';
import LoginPage from './components/LoginPage';
import ChangePasswordModal from './components/settings/ChangePasswordModal';
import SyncStatusIndicator, { SyncStatus } from './components/ui/SyncStatusIndicator';
import PremiumSyncIndicator from './components/ui/PremiumSyncIndicator';
import SyncProgressBar from './components/ui/SyncProgressBar';
import * as authService from './services/authService';
import * as cloudDataService from './services/cloudDataService';
import { neonDataService } from './services/neonDataService';
import { isNeonSoleSourceMode, setNeonSoleSourceMode } from './services/backendConfig';
import { robustParseFloat, robustParseInt, safeLocalStorageGet } from './services/cloudDataService';
import { getIndexedDbItem, setIndexedDbItem, clearIndexedDbStore } from './services/indexedDbService';
import { 
  useAppInit, 
  PERMANENT_SHEET_URL, 
  PERMANENT_DRIVE_URL, 
  DEFAULT_SERVICE_TEMPLATES, 
  defaultNotificationPrefs, 
  defaultKpiTargets, 
  getSanitizedSettingsUrls, 
  mergeWithDefaultPrefs, 
  mergeSubmissions, 
  cleanSubmissionsArray 
} from './hooks/useAppInit';
import { useModalManager } from './hooks/useModalManager';
import { useAndroidBackButton } from './hooks/useAndroidBackButton';
import { AppModalHost } from './components/modals/AppModalHost';
import { AppProvider, AppContextType } from './context/AppContext';
import { AuthProvider, AuthContextType } from './context/AuthContext';
import { SyncProvider, SyncContextType } from './context/SyncContext';
import { OrderProvider, OrderContextType } from './context/OrderContext';
import { InventoryProvider, InventoryContextType } from './context/InventoryContext';
import { Sidebar } from './components/ui/Sidebar';
import MobileBottomNav from './components/ui/MobileBottomNav';
import RealTimeClock from './components/ui/RealTimeClock';
import { DesktopInstallButton } from './components/desktop/DesktopInstallButton';
import { DesktopInstallModal } from './components/desktop/DesktopInstallModal';
import { PWAInstallBanner } from './components/desktop/PWAInstallBanner';
import { Toaster, toast } from 'sonner';
import NotificationBell from './components/ui/NotificationBell';
import { APPOINTMENT_TIME_SLOTS, DEFAULT_PRICING_CONFIG } from './constants';
import { toISTDateString } from './utils/dateTimeUtils';
import * as notificationService from './services/notificationService';
import LoadingScreen from './components/ui/LoadingScreen';
import ErrorBoundary from './components/ui/ErrorBoundary';
import { CAR_BRANDS, TIRE_BRANDS } from './data/vehicleData';
import { triggerHapticFeedback } from './services/hapticService';
import { getCategoryForVehicle } from './services/vehicleService';
import { generateServiceReminders, generateWarrantyReminders } from './services/reminderService';
import { 
  DEFAULT_NOTIFICATION_RULES, 
  checkAndGenerateOrderCompletion, 
  checkAndGenerateLeadArrival, 
  checkAndGenerateDueOrders, 
  checkAndGenerateFollowups 
} from './services/notificationTriggerService';
import { 
  triggerOrderCreatedSms, 
  triggerOrderRescheduledSms, 
  triggerOrderCompletedSms, 
  triggerFeedbackSms 
} from './services/msg91Service';

// --- LAZY LOADED ROUTED MODULES (SMART INITIAL LOAD OPTIMIZATION) ---
const PrintPreview = React.lazy(() => import('./components/PrintPreview').then(m => ({ default: m.PrintPreview })));
const NotificationHistory = React.lazy(() => import('./components/dashboard/NotificationHistory'));
const ClientServiceTracker = React.lazy(() => import('./components/ClientServiceTracker').then(m => ({ default: m.ClientServiceTracker })));

import AppRouter from './components/routing/AppRouter';
import SkeletonLoader from './components/ui/SkeletonLoader';
import NewOrderAlertModal from './components/dashboard/NewOrderAlertModal';
import { playNewOrderChime } from './utils/audioChime';

// --- MEDIA QUOTA MANAGEMENT ---
const MEDIA_KEYS = [
    'beforeWashingPhoto', 'beforeVideoInventory', 'beforeVideoTopBody', 'beforeVideoUnderchassis',
    'afterWashingPhoto', 'afterVideoInterior', 'afterVideoExterior', 'afterVideoUnderchassis',
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

const storageDebounceTimers: Record<string, any> = {};

const safeLocalStorageSet = (key: string, value: any, options: { stripMedia?: boolean } = {}) => {
    if (storageDebounceTimers[key]) {
        clearTimeout(storageDebounceTimers[key]);
    }

    // Debounce IndexedDB writes to keep UI at 60 FPS without main thread blocking
    storageDebounceTimers[key] = setTimeout(() => {
        try {
            let dataToSave = options.stripMedia ? stripMediaForStorage(value) : value;
            
            if (key === 'service_app_submissions') {
                dataToSave = stripMediaForStorage(value);
            }

            // Apply generous local limits to keep database clean
            if (Array.isArray(dataToSave)) {
                if (key === 'service_app_location_history' && dataToSave.length > 1000) {
                    dataToSave = dataToSave.slice(-1000);
                } else if (key === 'service_app_audit_logs' && dataToSave.length > 1000) {
                    dataToSave = dataToSave.slice(-1000);
                } else if (key === 'service_app_inventory_movements' && dataToSave.length > 1000) {
                    dataToSave = dataToSave.slice(-1000);
                } else if (key === 'service_app_notifications' && dataToSave.length > 1000) {
                    const sorted = [...dataToSave].sort((a, b) => {
                        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                        return tB - tA; // latest first
                    });
                    dataToSave = sorted.slice(0, 1000);
                } else if (key === 'service_app_submissions' && dataToSave.length > 1000) {
                    const sorted = [...dataToSave].sort((a, b) => {
                        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                        return tB - tA; // latest first
                    });
                    dataToSave = sorted.slice(0, 1000);
                }
            }

            // Save to IndexedDB asynchronously
            setIndexedDbItem(key, dataToSave).catch(err => {
                console.error(`❌ [IndexedDB] App.tsx failed to save key "${key}":`, err);
            });
        } catch (outerError) {
            console.error(`❌ [IndexedDB] Critical outer error in App.tsx safeLocalStorageSet for key "${key}":`, outerError);
        }
    }, 300);
};

type AppView = 'DASHBOARD' | 'LIST' | 'USER_MANAGEMENT' | 'SETTINGS' | 'SERVICE_TEMPLATE_MANAGEMENT' | 'SERVICE_TEMPLATE_EDITOR' | 'FORM' | 'SERVICE_REQUEST' | 'LIVE_MAP' | 'ANALYTICS' | 'CUSTOMER_HISTORY' | 'RETENTION' | 'APPOINTMENTS_OVERVIEW' | 'PROFIT_LOSS' | 'TRASH' | 'ATTENDANCE_MANAGEMENT' | 'CUSTOMER_BOOK' | 'SERVICE_CATALOG' | 'CAR_DATABASE' | 'HUB_MANAGEMENT' | 'INVENTORY_FORECASTING' | 'EXPENSES' | 'SPEND_CATEGORIES' | 'NOTIFICATIONS' | 'ERP_MANAGEMENT' | 'WARRANTY_TRACKER' | 'OFFLINE_SYNC_MANAGER';


const cleanSelectionArray = (arr: any[] | undefined): string[] => {
    if (!arr || !Array.isArray(arr)) return [];
    const cleaned: string[] = [];
    arr.forEach(item => {
        if (typeof item === 'string') {
            try {
                if (item.startsWith('[') && item.endsWith(']')) {
                    const parsed = JSON.parse(item);
                    if (Array.isArray(parsed)) cleaned.push(...cleanSelectionArray(parsed));
                    else if (parsed) cleaned.push(String(parsed));
                } else if (item) cleaned.push(item);
            } catch (e) {
                if(item) cleaned.push(item);
            }
        }
    });
    return [...new Set(cleaned)].filter(Boolean);
};

const PublicServiceSummary: React.FC<{ serviceData: any; logoUrl: string }> = ({ serviceData, logoUrl }) => {
    const purchaseItems = useMemo(() => {
        const items: { description: string; qty: string | number; price: number }[] = [];
        if (!serviceData) return [];
        const cleanedServiceSelection = cleanSelectionArray(serviceData.ss);
        if (cleanedServiceSelection.includes("Car Washing") && serviceData.cwd?.price > 0) items.push({ description: `Car Washing (${serviceData.cwd.washType})`, qty: 1, price: serviceData.cwd.price });
        if (cleanedServiceSelection.includes("Car Care") && serviceData.ccd?.price > 0) items.push({ description: `Car Care (${serviceData.ccd.careType})`, qty: 1, price: serviceData.ccd.price });
        if (cleanedServiceSelection.includes("Tyre Replacement") && serviceData.trTotal > 0) {
            items.push({ description: `Tyre Replacement`, qty: serviceData.trQty, price: serviceData.trTotal });
            (serviceData.td || []).forEach((tyre: any, index: number) => items.push({ description: `  └ Tyre ${index + 1}: Size: ${tyre.s || 'N/A'}, Brand: ${tyre.b || 'N/A'}`, qty: ' ', price: 0 }));
        }
        if (cleanedServiceSelection.includes("Battery Replacement") && serviceData.brTotal > 0) items.push({ description: `Battery Replacement`, qty: 'N/A', price: serviceData.brTotal });
        (serviceData.da || []).forEach((item: any) => items.push({ description: item.name, qty: item.quantity, price: item.quantity * item.price }));
        (serviceData.ca || []).forEach((item: any) => items.push({ description: `${item.p} (${item.cat})`, qty: item.q, price: item.q * item.a }));
        (serviceData.cs || []).forEach((item: any) => items.push({ description: item.d, qty: 1, price: item.a }));
        return items;
    }, [serviceData]);

    return (
        <div className="min-h-screen bg-slate-100 p-4 sm:p-8 flex items-center justify-center">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-6 sm:p-8">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-200">
                     <div className="flex items-center space-x-3 mb-4 sm:mb-0">
                        <img src={logoUrl || "https://pub-d1d6c35dc7024f819f155246a42ea32b.r2.dev/Website%20Assets/logo/bigengine%203.png"} alt="A Big Engine Logo" className="w-12 h-12 object-contain" />
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight uppercase text-brand-blue">A Big <span className="text-brand-accent">Engine</span></h1>
                            <p className="text-sm text-slate-500">Service Order Summary</p>
                        </div>
                    </div>
                    <div className="text-left sm:text-right">
                        <p className="font-semibold text-slate-800">Order #{serviceData?.id?.split('-').pop()}</p>
                        <p className="text-sm text-slate-500">{serviceData?.ts ? new Date(serviceData.ts).toLocaleString() : ''}</p>
                    </div>
                </header>
                <section className="my-6">
                    <h2 className="text-lg font-semibold text-slate-700 mb-3">Customer & Vehicle Details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <p><strong className="font-medium text-slate-500">Customer:</strong> {serviceData?.cF || ''} {serviceData?.cL || ''}</p>
                        <p><strong className="font-medium text-slate-500">Vehicle:</strong> {serviceData?.carBM || 'N/A'}</p>
                        <p><strong className="font-medium text-slate-500">Reg. No:</strong> {serviceData?.carN || 'N/A'}</p>
                        <p className="sm:col-span-2"><strong className="font-medium text-slate-500">Address:</strong> {serviceData?.sa || 'N/A'}</p>
                    </div>
                </section>
                <section>
                     <h2 className="text-lg font-semibold text-slate-700 mb-3">Service Details</h2>
                     <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th scope="col" className="py-2 px-4 text-left text-xs font-semibold text-slate-600 uppercase">Item / Service</th>
                                    <th scope="col" className="py-2 px-4 text-center text-xs font-semibold text-slate-600 uppercase">Qty</th>
                                    <th scope="col" className="py-2 px-4 text-right text-xs font-semibold text-slate-600 uppercase">Price</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {purchaseItems.map((item, index) => (
                                    <tr key={index} className="border-t border-slate-200">
                                        <td className={`py-3 px-4 text-sm font-medium ${item.description.startsWith('  ') ? 'text-slate-600 pl-8' : 'text-slate-800'}`}>{item.description}</td>
                                        <td className="py-3 px-4 text-sm text-center text-slate-500">{item.qty}</td>
                                        <td className="py-3 px-4 text-sm text-right text-slate-600">{item.price > 0 ? `₹${item.price.toFixed(2)}` : '-'}</td>
                                    </tr>
                                ))}
                                {purchaseItems.length === 0 && (
                                    <tr><td colSpan={3} className="text-center py-6 text-slate-500">No services or items were recorded.</td></tr>
                                )}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-slate-300">
                                    <th scope="row" colSpan={2} className="pt-3 pb-3 px-4 text-right text-base font-bold text-slate-900">Grand Total</th>
                                    <td className="pt-3 pb-3 px-4 text-right text-base font-bold text-slate-900">₹{(serviceData?.gT || 0).toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
};

const createDefaultServiceState = (): Service => {
  const submissionId = `SUB-${Date.now()}`;
  return {
    submissionId, appointmentId: submissionId, timestamp: new Date().toISOString(),
    customerFirstName: '', customerLastName: '', streetAddress: '', mobileNumber: '', carNumber: '', carBrandModel: '',
    serviceSelection: [], isSubscription: false, carWashDetails: undefined, carCareDetails: undefined,
    beforeWashingPhoto: '', beforeVideoInventory: '', beforeVideoTopBody: '', beforeVideoUnderchassis: '',
    afterWashingPhoto: '', afterVideoInterior: '', afterVideoExterior: '', afterVideoUnderchassis: '',
    tyreReplacementQuantity: 0, tyreReplacementPrice: 0, tyreReplacementTotalAmount: 0, 
    tyreLaborCost: 0, tyreMaterialCost: 0, tyreDetails: [],
    batteryReplacementQuantity: 0, batteryReplacementTotalAmount: 0, batteryDetails: [],
    dynamicAddons: [], addonsTotal: 0, categorizedAddons: [], categorizedAddonsTotal: 0,
    customServices: [], customServicesTotal: 0, customFieldData: [], grandTotal: 0, acknowledgement: false,
    status: ServiceStatus.Draft, internalNotes: '', isFollowUp: false, dependsOn: [],
  };
};


export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
        const storedUserJson = localStorage.getItem('service_app_current_user');
        if (!storedUserJson) return null;
        const user = JSON.parse(storedUserJson);
        if (typeof user.permissions === 'string') {
          try {
            user.permissions = JSON.parse(user.permissions);
            if (typeof user.permissions === 'string') user.permissions = JSON.parse(user.permissions);
          } catch {
            user.permissions = [];
          }
        }
        if (!Array.isArray(user.permissions) || user.permissions.length === 0) {
          user.permissions = authService.getDefaultPermissionsForRole(user.role || 'agent');
        }
        if (typeof user.specialties === 'string') {
          try { user.specialties = JSON.parse(user.specialties); } catch { user.specialties = []; }
        }
        if (!Array.isArray(user.specialties)) user.specialties = [];
        user.notificationPreferences = mergeWithDefaultPrefs(user.notificationPreferences);
        return user;
    } catch (error) { return null; }
  });
  const [loginError, setLoginError] = useState('');
  const [view, setView] = useState<AppView>('DASHBOARD');
  const [submissions, setSubmissions] = useState<Service[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const initialUrls = getSanitizedSettingsUrls(
    localStorage.getItem('googleSheetsUrl'),
    localStorage.getItem('googleDriveUploadUrl')
  );
  const [settings, setSettings] = useState<Settings>({ 
    googleSheetsUrl: initialUrls.googleSheetsUrl, 
    googleDriveUploadUrl: initialUrls.googleDriveUploadUrl, 
    customLogoUrl: localStorage.getItem('customLogoUrl') || '', 
    retentionKpiTargets: defaultKpiTargets,
    googleMapsApiKey: localStorage.getItem('googleMapsApiKey') || 'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M',
    hubLatitude: parseFloat(localStorage.getItem('hubLatitude') || '22.572646'),
    hubLongitude: parseFloat(localStorage.getItem('hubLongitude') || '88.363895'),
    maxDistanceKm: parseFloat(localStorage.getItem('maxDistanceKm') || '20'),
    syncFrequency: (localStorage.getItem('syncFrequency') || 'manual') as any,
    metaLeadsSheetUrl: localStorage.getItem('metaLeadsSheetUrl') || 'https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing',
    metaLeadsTabName: localStorage.getItem('metaLeadsTabName') || '',
    metaLeadsLastSyncDate: localStorage.getItem('metaLeadsLastSyncDate') || '',
    whatsappSheetUrl: localStorage.getItem('whatsappSheetUrl') || 'https://docs.google.com/spreadsheets/d/1MtZg0S267e3ZwOY_kSJTNe7c7YCDI83GJuigqoQwaVQ/edit?usp=sharing',
    whatsappTabName: localStorage.getItem('whatsappTabName') || '',
    whatsappLastSyncDate: localStorage.getItem('whatsappLastSyncDate') || '',
    webLeadsLastSyncDate: localStorage.getItem('webLeadsLastSyncDate') || '',
    googleSheetsDisasterRecoveryEnabled: localStorage.getItem('google_sheets_dr_backup_enabled') === 'true', // Deactivated by default per spec
    disasterRecoveryBackupSchedule: (localStorage.getItem('disasterRecoveryBackupSchedule') || 'manual') as any,
    lastDisasterRecoveryBackupAt: localStorage.getItem('lastDisasterRecoveryBackupAt') || '',
    lastDisasterRecoveryRestoreAt: localStorage.getItem('lastDisasterRecoveryRestoreAt') || '',
    metaLeadsDeltaSyncEnabled: localStorage.getItem('metaLeadsDeltaSyncEnabled') === 'true', // RESTRICTED: Default false (manual only to protect bandwidth)
    whatsAppEnquiryDeltaSyncEnabled: localStorage.getItem('whatsAppEnquiryDeltaSyncEnabled') === 'true', // RESTRICTED: Default false (manual only to protect bandwidth)
    leadDeltaSyncIntervalMinutes: Math.max(parseInt(localStorage.getItem('leadDeltaSyncIntervalMinutes') || '60', 10) || 60, 5),
    notificationRules: JSON.parse(localStorage.getItem('notificationRules') || 'null') || DEFAULT_NOTIFICATION_RULES,
    agentRankThresholds: JSON.parse(localStorage.getItem('agentRankThresholds') || 'null') || {
      bronze: 0,
      silver: 5000,
      gold: 15000,
      platinum: 40000
    }
  });
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [userSubscriptions, setUserSubscriptions] = useState<UserSubscription[]>([]);
  const [serviceTemplates, setServiceTemplates] = useState<ServiceTemplate[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [syncPerformanceStats, setSyncPerformanceStats] = useState<SyncPerformanceStats | null>(() => {
    try {
      const saved = localStorage.getItem('lastSyncPerformanceStats');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [hasMoreServiceRequests, setHasMoreServiceRequests] = useState(true);
  const [isLoadingMoreServiceRequests, setIsLoadingMoreServiceRequests] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [locationHistory, setLocationHistory] = useState<LocationHistory[]>([]);
  const [profitLossData, setProfitLossData] = useState<ProfitLoss[]>([]);
  const [predefinedCosts, setPredefinedCosts] = useState<PredefinedCost[]>([]);
  const [vehicleData, setVehicleData] = useState<Record<string, string[]>>(CAR_BRANDS);
  const [carDatabase, setCarDatabase] = useState<CarDatabaseItem[]>(() => {
    try {
      const cached = safeLocalStorageGet<CarDatabaseItem[]>('service_app_car_database');
      return Array.isArray(cached) && cached.length > 0 ? cached : INITIAL_CAR_DATABASE;
    } catch {
      return INITIAL_CAR_DATABASE;
    }
  });

  const handleUpdateCarDatabase = useCallback((newDatabase: CarDatabaseItem[]) => {
    setCarDatabase(newDatabase);
    safeLocalStorageSet('service_app_car_database', newDatabase);
    setIndexedDbItem('service_app_car_database', newDatabase).catch(() => {});
    neonDataService.saveCarDatabase(newDatabase).catch(err => {
      console.warn('⚠️ [Neon] Failed to mirror car_database:', err);
    });
  }, []);

  // Ensure carDatabase is hydrated from IndexedDB or Neon DB if currently default/empty
  useEffect(() => {
    if (carDatabase.length <= 1) {
      getIndexedDbItem<CarDatabaseItem[]>('service_app_car_database', []).then(cached => {
        if (Array.isArray(cached) && cached.length > 0) {
          setCarDatabase(cached);
        } else {
          neonDataService.loadCarDatabase().then(neonCars => {
            if (Array.isArray(neonCars) && neonCars.length > 0) {
              setCarDatabase(neonCars);
              setIndexedDbItem('service_app_car_database', neonCars).catch(() => {});
              safeLocalStorageSet('service_app_car_database', neonCars);
            }
          }).catch(console.warn);
        }
      }).catch(console.warn);
    }
  }, [carDatabase.length]);
  const [tyreData, setTyreData] = useState<TyreData>({ brands: TIRE_BRANDS, models: [], sizes: [] });
  const [deliveryHubs, setDeliveryHubs] = useState<any[]>([]);
  const [productRules, setProductRules] = useState<any[]>([]);
  const [predefinedServices, setPredefinedServices] = useState<any[]>([]);
  const [predefinedServiceCategories, setPredefinedServiceCategories] = useState<any[]>([]);
  const [customerBook, setCustomerBook] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [spendCategories, setSpendCategories] = useState<SpendCategory[]>([]);
  const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
  const [retentionLogs, setRetentionLogs] = useState<RetentionActivityLog[]>([]);

  const handleSaveRetentionLog = async (newLog: RetentionActivityLog) => {
    setRetentionLogs(prev => [newLog, ...prev]);
    try {
      await cloudDataService.saveRecord('RetentionLogs', newLog, settings.googleSheetsUrl);
    } catch (err) {
      console.error('Failed to sync retention log:', err);
    }
  };

  const handleUpdateKpiTargets = (targets: RetentionKpiTargets) => {
    const updatedSettings = {
      ...settings,
      retentionKpiTargets: targets
    };
    handleSaveSettings(updatedSettings);
  };

  const handleUpdateWarranties = async (updatedWarranties: WarrantyRecord[]) => {
    setWarranties(updatedWarranties);
    try {
      // Find deleted warranties
      const deleted = warranties.filter(oldW => !updatedWarranties.some(newW => newW.id === oldW.id));
      for (const w of deleted) {
        await cloudDataService.deleteRecord('Warranties', w.id, settings.googleSheetsUrl);
      }

      // Save updated / new warranties
      for (const w of updatedWarranties) {
        await cloudDataService.saveRecord('Warranties', w, settings.googleSheetsUrl);
      }
    } catch (err) {
      console.error('Failed to sync warranties:', err);
    }
  };

  const allActiveNotifications = useMemo(() => {
    // Keep notifications deactivated by default; activate dynamic reminder generation only with explicit consent
    const isConsent = currentUser?.notificationPreferences?.consentGranted === true;
    const reminders = isConsent ? generateServiceReminders(submissions, notifications) : [];
    const warrantyReminders = isConsent ? generateWarrantyReminders(warranties, notifications) : [];
    const activeDatabaseNotifications = notifications.filter(n => !n.isDismissed);
    return [...activeDatabaseNotifications, ...reminders, ...warrantyReminders];
  }, [submissions, warranties, notifications, currentUser?.notificationPreferences?.consentGranted]);

  const unreadCount = useMemo(() => {
    const now = new Date();
    return allActiveNotifications.filter(n => !n.isRead && !(n.snoozedUntil && new Date(n.snoozedUntil) > now)).length;
  }, [allActiveNotifications]);

  const currentUserNotifications = useMemo(() => {
    const now = new Date();
    return allActiveNotifications
      .filter(n => !(n.snoozedUntil && new Date(n.snoozedUntil) > now))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);
  }, [allActiveNotifications]);

  const handleUpdateNotification = useCallback(async (notification: AppNotification) => {
    let isNewNotification = false;
    setNotifications(prev => {
      const idx = prev.findIndex(n => n.id === notification.id);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = notification;
        return copy;
      } else {
        isNewNotification = true;
        return [...prev, notification];
      }
    });

    // If it's a new, unread notification, dispatch native device notification only if consent is granted
    if (isNewNotification && !notification.isRead && currentUser?.notificationPreferences?.consentGranted) {
      notificationService.sendNativeNotification(notification, currentUser?.notificationPreferences);
    }

    try {
      await cloudDataService.saveRecord('Notifications', notification, settings.googleSheetsUrl);
    } catch (e) {
      console.error('Failed to sync notification updates to sheets:', e);
    }
  }, [settings.googleSheetsUrl, currentUser?.notificationPreferences]);

  const runSmartTimeBasedTriggers = useCallback(async (currentSubmissions: Service[], currentNotifications: AppNotification[]) => {
    // Check if notifications are activated with consent of user or admin to manage the notification load
    const isConsent = currentUser?.notificationPreferences?.consentGranted === true;
    if (!isConsent) {
      console.log('🔕 [Smart Trigger] Notifications deactivated by default (consent required to manage load). Automated triggers paused.');
      return;
    }

    const rules = settings.notificationRules || DEFAULT_NOTIFICATION_RULES;
    const username = currentUser?.username || 'system';

    const dueNotifs = checkAndGenerateDueOrders(currentSubmissions, currentNotifications, rules, username);
    const followupNotifs = checkAndGenerateFollowups(currentSubmissions, currentNotifications, rules, username);

    const allNewNotifs = [...dueNotifs, ...followupNotifs].slice(0, 5);

    if (allNewNotifs.length > 0) {
      setNotifications(prev => {
        const filteredNew = allNewNotifs.filter(newN => !prev.some(p => p.id === newN.id));
        return [...filteredNew, ...prev].slice(0, 100);
      });

      for (const notif of allNewNotifs) {
        // Dispatch native alert for each newly activated smart trigger
        notificationService.sendNativeNotification(notif, currentUser?.notificationPreferences);
        try {
          await cloudDataService.saveRecord('Notifications', notif, settings.googleSheetsUrl);
        } catch (err) {
          console.error(`Failed to save auto-triggered notification ${notif.id}:`, err);
        }
      }
      toast.info(`Smart Trigger: Activated ${allNewNotifs.length} scheduled/retention notification alerts.`);
    }
  }, [settings.notificationRules, settings.googleSheetsUrl, currentUser]);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | null>(null);
  const [printingService, setPrintingService] = useState<Service | null>(null);
  const [logoHasError, setLogoHasError] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const autoArchiveProcessedRef = useRef(false);
  const lazyServicesInitializedRef = useRef(false);
  const locationWatcherIdRef = useRef<number | null>(null);
  const [publicService, setPublicService] = useState<{ data: any } | null>(null);

  const {
    summarizingService,
    sharingService,
    deletingService,
    cancelingService,
    isDiagnosticOverlayOpen,
    isNotificationHistoryOpen,
    isMobileMenuOpen,
    isSidebarMinimized,
    isChatbotOpen,
    setSummarizingService,
    setSharingService,
    setDeletingService,
    setCancelingService,
    setIsDiagnosticOverlayOpen,
    setIsNotificationHistoryOpen,
    setIsMobileMenuOpen,
    setIsSidebarMinimized,
    setIsChatbotOpen,
    openSummaryModal,
    closeSummaryModal,
    openShareModal,
    closeShareModal,
    openDeleteModal,
    closeDeleteModal,
    openCancelModal,
    closeCancelModal,
    openDiagnosticOverlay,
    closeDiagnosticOverlay,
    toggleDiagnosticOverlay,
    toggleNotificationHistory,
    closeNotificationHistory,
    openMobileMenu,
    closeMobileMenu,
    toggleSidebar
  } = useModalManager();

  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isDesktopInstallModalOpen, setIsDesktopInstallModalOpen] = useState(false);

  // Intercept Android hardware / browser back button to navigate to Dashboard from sub-views
  useAndroidBackButton(() => {
    if (view !== 'DASHBOARD') {
      setView('DASHBOARD');
      return true;
    }
    return false;
  }, view !== 'DASHBOARD', 10);

  const {
    appIsLoading,
    setAppIsLoading,
    isDataHydrated,
    setIsDataHydrated,
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    lastSyncedAt,
    setLastSyncedAt,
    syncProgress,
    setSyncProgress,
    syncStage,
    setSyncStage,
    syncEntity,
    setSyncEntity,
    trackingId,
    setTrackingId,
    handleClearTracking,
    loadAndMergeData
  } = useAppInit({
    settings,
    setSettings,
    currentUser,
    setSubmissions,
    setUsers,
    setSubscriptionPlans,
    setUserSubscriptions,
    setServiceTemplates,
    setServiceRequests,
    setAuditLogs,
    setNotifications,
    setLocationHistory,
    setProfitLossData,
    setPredefinedCosts,
    setVehicleData,
    setCarDatabase,
    setTyreData,
    setDeliveryHubs,
    setProductRules,
    setPredefinedServices,
    setPredefinedServiceCategories,
    setCustomerBook,
    setExpenses,
    setRecurringExpenses,
    setSpendCategories,
    setWarranties,
    setRetentionLogs,
    setInventoryItems,
    setInventoryMovements,
    onAfterLoadTriggers: runSmartTimeBasedTriggers
  });

  const [loadedViews, setLoadedViews] = useState<Record<string, boolean>>({
    'DASHBOARD': true,
    'LIST': true,
    'SETTINGS': true,
    'NOTIFICATIONS': true,
    'USER_MANAGEMENT': true,
    'ATTENDANCE_MANAGEMENT': true,
    'SERVICE_TEMPLATE_MANAGEMENT': true,
    'SERVICE_TEMPLATE_EDITOR': true,
    'FORM': true,
    'CUSTOMER_HISTORY': true,
    'RETENTION': true,
    'APPOINTMENTS_OVERVIEW': true,
    'TRASH': true,
    'CUSTOMER_BOOK': false,
    'SERVICE_CATALOG': false,
    'HUB_MANAGEMENT': false,
    'EXPENSES': false,
    'SPEND_CATEGORIES': false,
    'ERP_MANAGEMENT': false,
    'WARRANTY_TRACKER': false,
    'SERVICE_REQUEST': false,
    'ANALYTICS': false,
    'PROFIT_LOSS': false,
    'INVENTORY_FORECASTING': false,
    'LIVE_MAP': false,
  });

  const handleManualRefresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    const syncToast = toast.loading('Initiating deep sync with Google Sheets and Firestore databases...');
    try {
        await loadAndMergeData(false, true);
        
        // Reset loaded states of all lazy-loaded views to false so they fetch fresh data when next visited!
        setLoadedViews({
          'DASHBOARD': true,
          'LIST': true,
          'SETTINGS': true,
          'NOTIFICATIONS': true,
          'USER_MANAGEMENT': true,
          'ATTENDANCE_MANAGEMENT': true,
          'SERVICE_TEMPLATE_MANAGEMENT': true,
          'SERVICE_TEMPLATE_EDITOR': true,
          'FORM': true,
          'CUSTOMER_HISTORY': true,
          'RETENTION': true,
          'APPOINTMENTS_OVERVIEW': true,
          'TRASH': true,
          'CUSTOMER_BOOK': false,
          'SERVICE_CATALOG': false,
          'HUB_MANAGEMENT': false,
          'EXPENSES': false,
          'SPEND_CATEGORIES': false,
          'ERP_MANAGEMENT': false,
          'WARRANTY_TRACKER': false,
          'SERVICE_REQUEST': false,
          'ANALYTICS': false,
          'PROFIT_LOSS': false,
          'INVENTORY_FORECASTING': false,
          'LIVE_MAP': false,
        });

        toast.success('Successfully synchronized core assets across all databases!', { id: syncToast });
    } catch (err) {
        toast.error('Data synchronization encountered an issue. Loaded from offline cache.', { id: syncToast });
    } finally {
        setIsManualRefreshing(false);
    }
  };

  const handleForceCacheClear = async () => {
    const clearToast = toast.loading('Clearing local cache and resolving sync conflicts...');
    try {
      await clearIndexedDbStore();
      const keysToRemove = [
        'service_app_submissions',
        'service_app_notifications',
        'service_app_location_history',
        'service_app_audit_logs',
        'service_app_inventory_movements',
        'service_app_service_requests',
        'service_app_users',
        'service_app_expenses',
        'service_app_recurring_expenses',
        'service_app_spend_categories',
        'service_app_predefined_costs',
        'service_app_customers',
        'service_app_warranties'
      ];
      keysToRemove.forEach(k => localStorage.removeItem(k));

      setLoadedViews({
        'DASHBOARD': true,
        'LIST': true,
        'SETTINGS': true,
        'NOTIFICATIONS': true,
        'USER_MANAGEMENT': true,
        'ATTENDANCE_MANAGEMENT': true,
        'SERVICE_TEMPLATE_MANAGEMENT': true,
        'SERVICE_TEMPLATE_EDITOR': true,
        'FORM': true,
        'CUSTOMER_HISTORY': true,
        'RETENTION': true,
        'APPOINTMENTS_OVERVIEW': true,
        'TRASH': true,
        'CUSTOMER_BOOK': false,
        'SERVICE_CATALOG': false,
        'HUB_MANAGEMENT': false,
        'EXPENSES': false,
        'SPEND_CATEGORIES': false,
        'ERP_MANAGEMENT': false,
        'WARRANTY_TRACKER': false,
        'SERVICE_REQUEST': false,
        'ANALYTICS': false,
        'PROFIT_LOSS': false,
        'INVENTORY_FORECASTING': false,
        'LIVE_MAP': false,
      });

      await loadAndMergeData(false, true);
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem('service_app_last_synced_at', now.toISOString());
      
      toast.success('Local cache cleared! Fresh database synced successfully.', { id: clearToast });
    } catch (err) {
      console.error('Error clearing cache:', err);
      toast.error('Encountered an error clearing cache. Reloading...', { id: clearToast });
      await loadAndMergeData(false, true);
    }
  };

  const [isPageSyncing, setIsPageSyncing] = useState(false);

  const handlePageSync = useCallback(async (pageKey: string, isSilent: boolean = false) => {
    if (isPageSyncing) return;
    setIsPageSyncing(true);
    const syncToast = !isSilent ? toast.loading(`Performing page sync for ${pageKey}...`) : null;

    const maxRetries = 2;
    let attempt = 0;
    let updates: Partial<AppData> | null = null;
    let lastError: any = null;

    while (attempt < maxRetries) {
      try {
        attempt++;
        const { loadPageWiseData } = await import('./services/cloudDataService');
        const result = await loadPageWiseData(settings, pageKey);

        if (result && typeof result === 'object' && Object.keys(result).length > 0) {
          updates = result;
          break;
        } else if (attempt < maxRetries) {
          await new Promise(res => setTimeout(res, 500));
        } else {
          updates = result || {};
        }
      } catch (err) {
        lastError = err;
        console.warn(`[PageSync] Retry attempt ${attempt}/${maxRetries} failed for ${pageKey}:`, err);
        if (attempt < maxRetries) {
          await new Promise(res => setTimeout(res, 500));
        }
      }
    }

    try {
        const hasSubstantialUpdates = updates && typeof updates === 'object' && Object.keys(updates).some(k => {
            const val = (updates as any)[k];
            return Array.isArray(val) ? val.length > 0 : !!val;
        });

        if (!hasSubstantialUpdates || lastError) {
            console.warn(`[PageSync] Page-wise sync for ${pageKey} returned empty or incomplete data. Triggering full loadAndMergeData fallback...`);
            await loadAndMergeData(false, true);
            if (syncToast) {
                toast.success(`Page "${pageKey}" synchronized via full sync fallback!`, { id: syncToast });
            }
            return;
        }

        if (updates) {
            // Update local React state with the fetched updates using robust ID-based merges
            if (updates.submissions) setSubmissions(prev => cloudDataService.mergeSubmissions(updates.submissions!, prev));
            if (updates.users) setUsers(prev => cloudDataService.mergeById(updates.users!, prev, 'username'));
            if (updates.spendCategories) setSpendCategories(prev => cloudDataService.mergeById(updates.spendCategories!, prev, 'id'));
            if (updates.expenses) setExpenses(prev => cloudDataService.mergeById(updates.expenses!, prev, 'id'));
            if (updates.recurringExpenses) setRecurringExpenses(prev => cloudDataService.mergeById(updates.recurringExpenses!, prev, 'id'));
            if (updates.predefinedCosts) setPredefinedCosts(prev => cloudDataService.mergeById(updates.predefinedCosts!, prev, 'id'));
            if (updates.predefinedServiceCategories) setPredefinedServiceCategories(prev => cloudDataService.mergeById(updates.predefinedServiceCategories!, prev, 'id'));
            if (updates.predefinedServices) setPredefinedServices(prev => cloudDataService.mergeById(updates.predefinedServices!, prev, 'id'));
            if (updates.deliveryHubs) setDeliveryHubs(prev => cloudDataService.mergeById(updates.deliveryHubs!, prev, 'id'));
            if (updates.productRules) setProductRules(prev => cloudDataService.mergeById(updates.productRules!, prev, 'id'));
            if (updates.customerBook) setCustomerBook(prev => cloudDataService.mergeById(updates.customerBook!, prev, 'id'));
            if (updates.serviceRequests) setServiceRequests(prev => cloudDataService.mergeById(updates.serviceRequests!, prev, 'id'));
            if (updates.profitLoss) setProfitLossData(prev => cloudDataService.mergeById(updates.profitLoss!, prev, 'serviceId'));
            if (updates.warranties) setWarranties(prev => cloudDataService.mergeById(updates.warranties!, prev, 'id'));
            if (updates.auditLogs) setAuditLogs(prev => cloudDataService.mergeById(updates.auditLogs!, prev, 'id'));
            if (updates.inventoryItems) setInventoryItems(prev => cloudDataService.mergeById(updates.inventoryItems!, prev, 'id'));
            if (updates.inventoryMovements) setInventoryMovements(prev => cloudDataService.mergeById(updates.inventoryMovements!, prev, 'id'));
            if (updates.locationHistory) setLocationHistory(prev => cloudDataService.mergeById(updates.locationHistory!, prev, 'historyId'));
        }

        if (syncToast) {
            toast.success(`Page "${pageKey}" synchronized successfully!`, { id: syncToast });
        }
    } catch (err) {
        console.warn(`[PageSync] Page sync error for ${pageKey}, attempting full loadAndMergeData fallback:`, err);
        try {
            await loadAndMergeData(false, true);
            if (syncToast) {
                toast.success(`Page "${pageKey}" synchronized via full sync fallback!`, { id: syncToast });
            }
        } catch (fallbackErr) {
            if (syncToast) {
                toast.error(`Page sync loaded cached local data.`, { id: syncToast });
            }
        }
    } finally {
        setIsPageSyncing(false);
    }
  }, [settings, isPageSyncing, loadAndMergeData]);

  useEffect(() => {
    if (trackingId) return; // Skip background page sync in customer tracking mode

    const viewToPageKeyMap: Record<string, string> = {
      'DASHBOARD': 'DASHBOARD',
      'LIST': 'LIST',
      'USER_MANAGEMENT': 'USER_MANAGEMENT',
      'ATTENDANCE_MANAGEMENT': 'ATTENDANCE_MANAGEMENT',
      'CUSTOMER_BOOK': 'CUSTOMER_BOOK',
      'CUSTOMER_HISTORY': 'CUSTOMER_HISTORY',
      'SERVICE_CATALOG': 'SERVICE_CATALOG',
      'SERVICE_TEMPLATE_MANAGEMENT': 'SERVICE_CATALOG',
      'HUB_MANAGEMENT': 'HUB_MANAGEMENT',
      'EXPENSES': 'EXPENSES',
      'SPEND_CATEGORIES': 'SPEND_CATEGORIES',
      'ERP_MANAGEMENT': 'ERP_MANAGEMENT',
      'INVENTORY_FORECASTING': 'INVENTORY_FORECASTING',
      'WARRANTY_TRACKER': 'WARRANTY_TRACKER',
      'SERVICE_REQUEST': 'SERVICE_REQUEST',
      'APPOINTMENTS_OVERVIEW': 'APPOINTMENTS_OVERVIEW',
      'RETENTION': 'RETENTION',
      'ANALYTICS': 'ANALYTICS',
      'PROFIT_LOSS': 'PROFIT_LOSS',
      'LIVE_MAP': 'LIVE_MAP',
      'NOTIFICATIONS': 'NOTIFICATIONS',
      'SETTINGS': 'SETTINGS',
      'TRASH': 'TRASH',
      'OFFLINE_SYNC_MANAGER': 'CORE'
    };

    const pageKey = viewToPageKeyMap[view] || 'CORE';
    const isAlreadyLoaded = loadedViews[view] === true;
    
    let isMounted = true;
    if (!isAlreadyLoaded) {
      handlePageSync(pageKey, false).finally(() => {
        if (isMounted) {
          setLoadedViews(prev => ({ ...prev, [view]: true }));
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [view, trackingId, loadedViews]);

  const renderPageLoadingState = () => (
    <SkeletonLoader view={view} />
  );


  const usersRef = useRef(users);
  useEffect(() => { usersRef.current = users; }, [users]);

  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // Local database session listener for automatic session persistence & redirects
  useEffect(() => {
    try {
      const storedUserJson = localStorage.getItem('service_app_current_user');
      if (storedUserJson && !currentUserRef.current) {
        const u = JSON.parse(storedUserJson);
        u.notificationPreferences = mergeWithDefaultPrefs(u.notificationPreferences);
        setCurrentUser(u);
      }
    } catch (e) {
      console.error("Error restoring session:", e);
    }
  }, []);

  // Lazy-init strategy: initialize non-critical services (Analytics, ProfitLoss, Warranty tracking)
  // only AFTER the main dashboard has rendered to optimize Time to First Interactive Paint (TTFI/FIP).
  useEffect(() => {
    if (trackingId || appIsLoading || !currentUser || lazyServicesInitializedRef.current) return;

    let isMounted = true;
    let idleCallbackId: number | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;

    const performLazyInit = () => {
      if (!isMounted) return;
      lazyServicesInitializedRef.current = true;
      console.log('⚡ [LazyInit] Main dashboard rendered. Initializing non-critical services (Analytics, ProfitLoss, Warranty tracking) in background...');

      // 1. Initialize & background-calculate Warranty tracking reminders
      if (warranties.length > 0) {
        const warrantyNotifs = generateWarrantyReminders(warranties, notifications);
        if (warrantyNotifs.length > 0) {
          console.log(`⚡ [LazyInit] Warranty tracking background initialized with ${warrantyNotifs.length} active reminders.`);
        }
      }

      // 2. Pre-warm non-critical service components (Analytics, ProfitLoss, WarrantyTracker) during idle periods
      const prewarmServices = async () => {
        if (!isMounted) return;
        try {
          await Promise.allSettled([
            import('./components/admin/AnalyticsPage'),
            import('./components/admin/ProfitLossPage'),
            import('./components/admin/WarrantyTrackerPage'),
            import('./components/admin/InventoryForecastingPage'),
            import('./components/admin/ExpenseManagementPage')
          ]);
          if (isMounted) {
            console.log('⚡ [LazyInit] Non-critical service modules (Analytics, ProfitLoss, WarrantyTracker) pre-warmed for instant UI response.');
          }
        } catch (err) {
          console.warn('⚠️ [LazyInit] Pre-warming non-critical modules deferred:', err);
        }
      };

      if ('requestIdleCallback' in window) {
        idleCallbackId = (window as any).requestIdleCallback(prewarmServices, { timeout: 3000 });
      } else {
        fallbackTimer = setTimeout(prewarmServices, 1000);
      }
    };

    // Delay non-critical service execution until after browser paints main dashboard
    const timer = setTimeout(performLazyInit, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (idleCallbackId !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleCallbackId);
      }
    };
  }, [appIsLoading, currentUser, warranties, notifications, trackingId]);

  useEffect(() => {
    if (trackingId) return; // Skip auto sync when viewing customer tracking

    const freq = settings.syncFrequency;
    if (!freq || freq === 'manual') return;

    const intervalMinutes = parseInt(freq, 10);
    if (isNaN(intervalMinutes) || intervalMinutes <= 0) return;

    const baseIntervalMs = intervalMinutes * 60 * 1000;
    const maxIntervalMs = Math.max(60 * 60 * 1000, baseIntervalMs * 8); // Cap at 1 hour or 8x base interval
    let timerId: NodeJS.Timeout | null = null;
    let failureCount = 0;
    let isMounted = true;

    const scheduleNextSync = (delayMs: number) => {
      if (!isMounted) return;
      timerId = setTimeout(async () => {
        if (!isMounted) return;
        console.log(`[Sync] Performing automatic interval-based sync with cloud data...`);
        const success = await loadAndMergeData(false, true);
        if (!isMounted) return;

        if (success) {
          if (failureCount > 0) {
            console.log(`[Sync] Automated sync recovered after ${failureCount} failure(s). Resetting interval to normal (${intervalMinutes} min).`);
          } else {
            console.log(`[Sync] Automated sync successful.`);
          }
          failureCount = 0;
          scheduleNextSync(baseIntervalMs);
        } else {
          failureCount += 1;
          const backoffMultiplier = Math.pow(2, Math.min(failureCount, 5)); // 2x, 4x, 8x, 16x, 32x
          const nextDelayMs = Math.min(baseIntervalMs * backoffMultiplier, maxIntervalMs);
          const nextDelaySec = Math.round(nextDelayMs / 1000);
          console.warn(
            `[Sync] Automatic sync attempt failed (Failure #${failureCount}). ` +
            `Applying intelligent backoff: delaying next retry to ${nextDelaySec}s (${(nextDelaySec / 60).toFixed(1)} mins) to prevent network congestion.`
          );
          scheduleNextSync(nextDelayMs);
        }
      }, delayMs);
    };

    console.log(`[Sync] Starting intelligent interval sync. Base frequency: ${intervalMinutes} minutes.`);
    scheduleNextSync(baseIntervalMs);

    return () => {
      console.log(`[Sync] Clearing intelligent interval sync scheduler.`);
      isMounted = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };
  }, [settings.syncFrequency, loadAndMergeData, trackingId]);
  
  useEffect(() => { if (isDataHydrated && !trackingId) safeLocalStorageSet('service_app_submissions', submissions, { stripMedia: true }); }, [submissions, isDataHydrated, trackingId]);
  useEffect(() => { if (isDataHydrated && !trackingId) safeLocalStorageSet('service_app_users', users); }, [users, isDataHydrated, trackingId]);
  useEffect(() => { if (isDataHydrated && !trackingId) safeLocalStorageSet('service_app_expenses', expenses); }, [expenses, isDataHydrated, trackingId]);
  useEffect(() => { if (isDataHydrated && !trackingId) safeLocalStorageSet('service_app_recurring_expenses', recurringExpenses); }, [recurringExpenses, isDataHydrated, trackingId]);
  useEffect(() => { if (isDataHydrated && !trackingId) safeLocalStorageSet('service_app_spend_categories', spendCategories); }, [spendCategories, isDataHydrated, trackingId]);

  // Auto-archive routine for Converted or Closed leads in status for > 30 days
  useEffect(() => {
    if (trackingId || appIsLoading || serviceRequests.length === 0 || autoArchiveProcessedRef.current) {
      return;
    }

    autoArchiveProcessedRef.current = true;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoMs = thirtyDaysAgo.getTime();

    let hasChanges = false;
    const updatedRequests = serviceRequests.map(lead => {
      const statusUpper = (lead.status || '').toUpperCase();
      // Normalized or raw status matching 'CONVERTED' or 'CLOSED' or 'BOOKED'
      const isTargetStatus = statusUpper === 'CONVERTED' || statusUpper === 'CLOSED' || statusUpper === 'BOOKED';
      
      if (isTargetStatus && !lead.isArchived) {
        // Look for the status transition in audit logs
        const statusLogs = auditLogs.filter(log => 
          log.leadId === lead.id && 
          log.changeType === 'STATUS' && 
          (log.newValue?.toUpperCase() === 'CONVERTED' || 
           log.newValue?.toUpperCase() === 'CLOSED' || 
           log.newValue?.toUpperCase() === 'BOOKED')
        );

        let transitionDate: Date | null = null;
        if (statusLogs.length > 0) {
          // Sort by timestamp descending
          const sorted = [...statusLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          transitionDate = new Date(sorted[0].timestamp);
        } else {
          // Fallback to requestDate or createdTime
          const dateStr = lead.createdTime || lead.requestDate;
          if (dateStr) {
            transitionDate = new Date(dateStr);
          }
        }

        if (transitionDate && !isNaN(transitionDate.getTime()) && transitionDate.getTime() < thirtyDaysAgoMs) {
          hasChanges = true;
          return { ...lead, isArchived: true };
        }
      }
      return lead;
    });

    if (hasChanges) {
      console.log("[Auto-Archive] Archiving leads that are older than 30 days...");
      setServiceRequests(updatedRequests);

      // Persist the changes to the database
      const newlyArchived = updatedRequests.filter((lead, index) => lead.isArchived && !serviceRequests[index].isArchived);
      newlyArchived.forEach(async (lead) => {
        try {
          await cloudDataService.saveRecord('ServiceRequests', lead, settings.googleSheetsUrl);
          
          // Generate a system audit log for the archive event
          const systemAuditLog: AuditLog = {
            id: `audit-${Date.now()}-archive-${Math.random().toString(36).substr(2, 9)}`,
            leadId: lead.id,
            timestamp: new Date().toISOString(),
            changedBy: 'System Scheduler',
            changeType: 'STATUS',
            oldValue: lead.status,
            newValue: `${lead.status} (Archived)`,
            notes: `Auto-archived: Lead remained in "${lead.status}" for over 30 days.`
          };
          
          await cloudDataService.saveRecord('AuditLogs', systemAuditLog, settings.googleSheetsUrl);
          setAuditLogs(prev => [systemAuditLog, ...prev]);
        } catch (e) {
          console.error("[Auto-Archive] Failed to persist archive update:", e);
        }
      });
    }
  }, [appIsLoading, serviceRequests, auditLogs, settings.googleSheetsUrl]);

  const [isNeonSoleMode, setIsNeonSoleMode] = useState<boolean>(() => isNeonSoleSourceMode());

  const handleLoginAttempt = useCallback(async (
    username: string, 
    password?: string, 
    options?: { soleNeonMode?: boolean; backendUrl?: string }
  ) => {
    const soleMode = options?.soleNeonMode ?? isNeonSoleSourceMode();
    setNeonSoleSourceMode(soleMode);
    setIsNeonSoleMode(soleMode);

    if (options?.backendUrl !== undefined) {
      const clean = options.backendUrl.trim().replace(/\/+$/, '');
      if (clean) {
        localStorage.setItem('custom_backend_url', clean);
        localStorage.setItem('neon_backend_url', clean);
      } else {
        localStorage.removeItem('custom_backend_url');
        localStorage.removeItem('neon_backend_url');
      }
    }

    const validatedUser = await authService.login(username, password, users, { soleNeonMode: soleMode });
    if (validatedUser) {
        let perms = validatedUser.permissions;
        if (typeof perms === 'string') {
          try {
            perms = JSON.parse(perms);
            if (typeof perms === 'string') perms = JSON.parse(perms);
          } catch { perms = []; }
        }
        if (!Array.isArray(perms) || perms.length === 0) {
          perms = authService.getDefaultPermissionsForRole(validatedUser.role || 'agent');
        }

        let specs = validatedUser.specialties;
        if (typeof specs === 'string') {
          try { specs = JSON.parse(specs); } catch { specs = []; }
        }
        if (!Array.isArray(specs)) specs = [];

        const finalUser = { 
          ...validatedUser, 
          permissions: perms,
          specialties: specs,
          notificationPreferences: mergeWithDefaultPrefs(validatedUser.notificationPreferences) 
        };
        localStorage.setItem('service_app_current_user', JSON.stringify(finalUser));
        setCurrentUser(finalUser);
        setLoginError('');
        setView('DASHBOARD');
    } else { 
        const lastErr = authService.getLastAuthError();
        setLoginError(lastErr || (soleMode ? 'Neon DB Login Failed: Invalid credentials or user not found in Neon PostgreSQL database.' : 'Invalid credentials')); 
    }
  }, [users]);
  
  const handleLogout = useCallback(() => {
    authService.logout();
    setCurrentUser(null);
    localStorage.removeItem('service_app_current_user');
    setView('DASHBOARD');
  }, []);
  const handleEditService = useCallback((service: Service | null) => { 
    setEditingService(service); 
    setView('FORM'); 
    setIsMobileMenuOpen(false); 
  }, []);

  const handleBookServiceFromReminder = useCallback((customerData: {
    firstName: string;
    lastName: string;
    mobileNumber: string;
    carNumber: string;
    carBrandModel: string;
    serviceSelection: string[];
  }) => {
    const newDraftService: Partial<Service> = {
      submissionId: 'draft-' + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      customerFirstName: customerData.firstName,
      customerLastName: customerData.lastName,
      mobileNumber: customerData.mobileNumber,
      carNumber: customerData.carNumber,
      carBrandModel: customerData.carBrandModel || '',
      serviceSelection: customerData.serviceSelection,
      status: ServiceStatus.Queued,
      streetAddress: '',
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
      grandTotal: 0,
      acknowledgement: false,
      isSubscription: false,
    };

    handleEditService(newDraftService as Service);
  }, [handleEditService]);

  const handleRebookOrder = useCallback((previousService: Service) => {
    const newDraftService: Service = {
      submissionId: 'draft-' + Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      customerFirstName: previousService.customerFirstName,
      customerLastName: previousService.customerLastName,
      streetAddress: previousService.streetAddress || '',
      mobileNumber: previousService.mobileNumber,
      customerEmail: previousService.customerEmail,
      customerLatitude: previousService.customerLatitude,
      customerLongitude: previousService.customerLongitude,
      customerELoc: previousService.customerELoc,
      customerDistanceKm: previousService.customerDistanceKm,
      carNumber: previousService.carNumber,
      carBrandModel: previousService.carBrandModel || '',
      vehicleCategoryTag: previousService.vehicleCategoryTag,
      serviceSelection: previousService.serviceSelection || [],
      isSubscription: previousService.isSubscription || false,
      carWashDetails: previousService.carWashDetails ? { ...previousService.carWashDetails } : undefined,
      carCareDetails: previousService.carCareDetails ? { ...previousService.carCareDetails } : undefined,
      tyreReplacementQuantity: previousService.tyreReplacementQuantity || 0,
      tyreReplacementPrice: previousService.tyreReplacementPrice || 0,
      tyreReplacementTotalAmount: previousService.tyreReplacementTotalAmount || 0,
      tyreLaborCost: previousService.tyreLaborCost,
      tyreMaterialCost: previousService.tyreMaterialCost,
      tyreDetails: Array.isArray(previousService.tyreDetails) ? previousService.tyreDetails.map(t => ({ ...t })) : [],
      batteryReplacementQuantity: previousService.batteryReplacementQuantity || 0,
      batteryReplacementTotalAmount: previousService.batteryReplacementTotalAmount || 0,
      batteryDetails: Array.isArray(previousService.batteryDetails) ? previousService.batteryDetails.map(b => ({ ...b })) : [],
      dynamicAddons: Array.isArray(previousService.dynamicAddons) ? previousService.dynamicAddons.map(a => ({ ...a })) : [],
      addonsTotal: previousService.addonsTotal || 0,
      categorizedAddons: Array.isArray(previousService.categorizedAddons) ? previousService.categorizedAddons.map(c => ({ ...c })) : [],
      categorizedAddonsTotal: previousService.categorizedAddonsTotal || 0,
      customServices: Array.isArray(previousService.customServices) ? previousService.customServices.map(s => ({ ...s })) : [],
      customServicesTotal: previousService.customServicesTotal || 0,
      customFieldData: Array.isArray(previousService.customFieldData) ? previousService.customFieldData.map(f => ({ ...f })) : [],
      grandTotal: previousService.grandTotal || 0,
      travelCharge: previousService.travelCharge,
      tags: Array.isArray(previousService.tags) && previousService.tags.length > 0 
        ? [...previousService.tags, ...(previousService.tags.includes('Return-Visit') ? [] : ['Return-Visit'])]
        : ['Return-Visit'],
      status: ServiceStatus.Draft,
      acknowledgement: false,
      isFollowUp: false,
      isDeleted: false,
      statusHistory: [],
      beforeWashingPhoto: '',
      beforeVideoInventory: '',
      beforeVideoTopBody: '',
      beforeVideoUnderchassis: '',
      afterWashingPhoto: '',
      afterVideoInterior: '',
      afterVideoExterior: '',
      afterVideoUnderchassis: '',
    };

    handleEditService(newDraftService);
    toast.success("Previous service configuration pre-populated successfully!");
  }, [handleEditService]);

  const handleNavigate = useCallback((v: AppView) => { setView(v); setIsMobileMenuOpen(false); }, []);

  const handleUpdateInventoryItem = useCallback(async (updatedItem: InventoryItem) => {
    setInventoryItems(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    try {
      await cloudDataService.saveRecord('InventoryItems', updatedItem, settings.googleSheetsUrl);
      toast.success(`Inventory: Updated stock for ${updatedItem.name}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to update inventory in cloud database`);
    }
  }, [settings.googleSheetsUrl]);

  const handleAddInventoryItem = useCallback(async (newItem: InventoryItem) => {
    setInventoryItems(prev => [...prev, newItem]);
    try {
      await cloudDataService.saveRecord('InventoryItems', newItem, settings.googleSheetsUrl);
      toast.success(`Inventory: Added material ${newItem.name}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to add inventory item to cloud database`);
    }
  }, [settings.googleSheetsUrl]);

  const handleDeleteInventoryItem = useCallback(async (itemId: string) => {
    const itemToDelete = inventoryItems.find(i => i.id === itemId);
    setInventoryItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await cloudDataService.deleteRecord('InventoryItems', itemId, settings.googleSheetsUrl);
      toast.success(`Inventory: Deleted material ${itemToDelete ? itemToDelete.name : itemId}`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to delete inventory item from cloud database`);
    }
  }, [inventoryItems, settings.googleSheetsUrl]);

  const handleUpdatePredefinedService = async (updatedService: any) => {
    setPredefinedServices(prev => prev.map(s => s.id === updatedService.id ? updatedService : s));
    try {
      await cloudDataService.saveRecord('PredefinedServices', updatedService, settings.googleSheetsUrl);
      toast.success(`Service recipe for ${updatedService.name} updated!`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to save service recipe in cloud database`);
    }
  };

  const handleCompleteOrder = useCallback(async (service: Service) => {
    console.log("[DEBUG] App: handleCompleteOrder called with:", service);
    const nowIso = new Date().toISOString();
    
    let isUpdating = false;
    const oldService = submissions.find(s => s.submissionId === service.submissionId);
    
    let history = service.statusHistory ? [...service.statusHistory] : [];
    
    if (history.length === 0) {
      const initialTime = oldService ? oldService.timestamp : (service.timestamp || new Date().toISOString());
      history.push({
        status: ServiceStatus.Queued,
        timestamp: initialTime,
        notes: 'Order created',
        updatedBy: service.submittedBy || currentUser?.username || 'system'
      });
      
      if (service.status !== ServiceStatus.Queued) {
        history.push({
          status: service.status,
          timestamp: new Date().toISOString(),
          notes: `Status set to ${service.status} at creation`,
          updatedBy: service.submittedBy || currentUser?.username || 'system'
        });
      }
    } else {
      const lastEntry = history[history.length - 1];
      if (lastEntry && lastEntry.status !== service.status) {
        let transitionNotes = `Status changed to ${service.status}`;
        if (service.status === ServiceStatus.Assigned && service.assignedTo) {
          transitionNotes = `Order assigned to technician: ${service.assignedTo}`;
        } else if (service.status === ServiceStatus.InProgress) {
          transitionNotes = `Service work started by ${service.assignedTo || 'technician'}`;
        } else if (service.status === ServiceStatus.Completed) {
          transitionNotes = `Service successfully completed and finalized`;
        }
        
        history.push({
          status: service.status,
          timestamp: new Date().toISOString(),
          notes: transitionNotes,
          updatedBy: currentUser?.username || 'system'
        });
      }
    }

    // Dedicated Accounts User Rule:
    // Only dedicated accounts users can mark payment as Completed.
    // If order is completed by non-accounts user, payment MUST be marked as 'Pending'.
    const userIsAccounts = currentUser ? authService.isAccountsUser(currentUser) : false;
    let resolvedPaymentStatus: 'Completed' | 'Pending' | undefined = service.paymentStatus;
    let paymentCompletedBy = service.paymentCompletedBy;
    let paymentCompletedAt = service.paymentCompletedAt;

    if (service.status === ServiceStatus.Completed) {
      if (!userIsAccounts) {
        // If oldService already had payment completed by accounts, preserve it; otherwise enforce 'Pending'
        if (oldService && oldService.paymentStatus === 'Completed') {
          resolvedPaymentStatus = 'Completed';
          paymentCompletedBy = oldService.paymentCompletedBy;
          paymentCompletedAt = oldService.paymentCompletedAt;
        } else {
          resolvedPaymentStatus = 'Pending';
          paymentCompletedBy = undefined;
          paymentCompletedAt = undefined;
        }
      } else {
        if (service.paymentStatus === 'Completed') {
          resolvedPaymentStatus = 'Completed';
          paymentCompletedBy = service.paymentCompletedBy || currentUser?.username || 'accounts';
          paymentCompletedAt = service.paymentCompletedAt || nowIso;
        } else {
          resolvedPaymentStatus = service.paymentStatus || 'Pending';
        }
      }
    }

    let serviceToSave = { 
      ...service, 
      scheduledDate: service.scheduledDate ? toISTDateString(service.scheduledDate) : service.scheduledDate,
      statusHistory: history,
      paymentStatus: resolvedPaymentStatus,
      paymentCompletedBy,
      paymentCompletedAt,
      updatedAt: nowIso,
      timestamp: oldService ? oldService.timestamp : (service.timestamp || nowIso) 
    };
    
    setSubmissions(prev => {
      isUpdating = prev.some(s => s.submissionId === service.submissionId);
      console.log("[DEBUG] App: isUpdating:", isUpdating, "serviceToSave:", serviceToSave);
      const newSubmissions = isUpdating 
        ? prev.map(s => s.submissionId === service.submissionId ? serviceToSave : s) 
        : [serviceToSave, ...prev]; // Add to beginning of array
      console.log("[DEBUG] App: newSubmissions length after update:", newSubmissions.length);
      // Force a new array reference to ensure React detects the change
      return newSubmissions;
    });

    try {
      // AUTOMATIC USER SUBSCRIPTION WASH COUNT DEDUCTION
      const isNewOrder = !submissions.some(s => s.submissionId === service.submissionId);
      if (isNewOrder && serviceToSave.isSubscription) {
        const mobile = String(serviceToSave.mobileNumber || '').trim();
        if (mobile) {
          const cleanMobile = mobile.replace(/\D/g, '');
          const now = new Date();
          const matchedSub = userSubscriptions.find(s => {
            const cleanSubMobile = String(s.mobileNumber || '').replace(/\D/g, '');
            const m1 = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;
            const m2 = cleanSubMobile.length >= 10 ? cleanSubMobile.slice(-10) : cleanSubMobile;
            return m1 === m2 && new Date(s.endDate) > now && s.washesRemaining > 0;
          });

          if (matchedSub) {
            const updatedSub = {
              ...matchedSub,
              washesRemaining: Math.max(0, matchedSub.washesRemaining - 1)
            };
            
            try {
              await cloudDataService.saveRecord('UserSubscriptions', updatedSub, settings.googleSheetsUrl);
              setUserSubscriptions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
              toast.success(`Subscription wash deducted. Washes left: ${updatedSub.washesRemaining}`);
              console.log("[DEBUG] App: Automatically deducted 1 subscription wash for", updatedSub.id);
            } catch (err) {
              console.error("❌ Failed to automatically deduct subscription wash:", err);
            }
          }
        }
      }

      await cloudDataService.saveRecord('Submissions', serviceToSave, settings.googleSheetsUrl);
      console.log("[DEBUG] App: cloudDataService.saveRecord success");

      // Sync web order status back to ServiceRequests if matching order ID exists
      const targetId = serviceToSave.submissionId || serviceToSave.appointmentId;
      if (targetId) {
        const matchedRequest = serviceRequests.find(r => r.id === targetId);
        if (matchedRequest) {
          const { mapServiceStatusToWebOrderStatus } = await import('./services/googleSheetService');
          const webStatus = mapServiceStatusToWebOrderStatus(serviceToSave.status);
          if (matchedRequest.status !== webStatus && matchedRequest.status !== 'CONVERTED') {
            const updatedRequest = { ...matchedRequest, status: webStatus };
            setServiceRequests(prev => prev.map(r => r.id === targetId ? updatedRequest : r));
            cloudDataService.saveRecord('ServiceRequests', updatedRequest, settings.googleSheetsUrl)
              .catch(err => console.error("Failed to sync web order status to ServiceRequests", err));
          }
        }
      }

      toast.success(isUpdating ? 'Order updated successfully' : 'Order created successfully');

      // MSG91 Customer Intimation SMS Triggers
      if (!isUpdating) {
        // Order Created
        triggerOrderCreatedSms(serviceToSave, settings);
      } else if (oldService && (
        (oldService.scheduledDate && serviceToSave.scheduledDate && oldService.scheduledDate !== serviceToSave.scheduledDate) ||
        (oldService.scheduledTime && serviceToSave.scheduledTime && oldService.scheduledTime !== serviceToSave.scheduledTime)
      )) {
        // Order Rescheduled
        triggerOrderRescheduledSms(serviceToSave, settings);
      }

      // AUTOMATIC INVENTORY STOCK DEPLETION & SMART COMPLETED NOTIFICATIONS
      if (serviceToSave.status === ServiceStatus.Completed) {
        // Trigger smart completed notification
        const previousService = submissions.find(s => s.submissionId === serviceToSave.submissionId);
        const isNewlyCompleted = !previousService || previousService.status !== ServiceStatus.Completed;

        if (isNewlyCompleted) {
          const notif = checkAndGenerateOrderCompletion(
            serviceToSave,
            settings.notificationRules || DEFAULT_NOTIFICATION_RULES,
            currentUser?.username || 'system'
          );
          if (notif) {
            handleUpdateNotification(notif);
            toast.success('Smart Notification: Service Completion customer alert sent!');
          }

          // Trigger MSG91 SMS for order completion & feedback request
          triggerOrderCompletedSms(serviceToSave, settings);
          triggerFeedbackSms(serviceToSave, settings);
        }

        const alreadyDepleted = inventoryMovements.some(
          mvt => mvt.reason.includes(`Job #${serviceToSave.submissionId}`)
        );

        if (!alreadyDepleted) {
          inventoryService.depleteInventoryForCompletedService(
            serviceToSave,
            predefinedServices,
            inventoryItems,
            async (sheetName, record) => {
              return cloudDataService.saveRecord(sheetName, record, settings.googleSheetsUrl);
            }
          ).then(({ updatedItems, movements }) => {
            if (movements.length > 0) {
              setInventoryItems(updatedItems);
              setInventoryMovements(prev => [...movements, ...prev]);
              toast.info(`Inventory: Auto-depleted materials used for job #${serviceToSave.submissionId}`);
            }
          }).catch(err => {
            console.error("❌ [Inventory] Auto-depletion failed:", err);
          });
        }
      }
    } catch (err) {
      console.error("[DEBUG] App: cloudDataService.saveRecord error:", err);
      toast.error('Failed to sync order to cloud, but saved locally. It will sync when online.');
      // Do not throw the error, so the modal can close and the user can continue
    }

    triggerHapticFeedback('success');
    setView('DASHBOARD');
  }, [settings.googleSheetsUrl, inventoryMovements, predefinedServices, inventoryItems, submissions, handleUpdateNotification, currentUser, settings.notificationRules]);

  const handleCreateOrder = useCallback(async (details: any) => {
    console.log("[DEBUG] App: handleCreateOrder called with details:", details);
    const newSubmissionId = `SUB-${Date.now()}`;
    
    // Ensure we have a valid vehicle category
    const category = details.vehicleCategoryTag || getCategoryForVehicle(details.customer.carBrandModel) || VehicleCategoryTag.Hatch;

    // Process custom/predefined services selection and tag correct category, and extract predefined costs
    const extraCategories: string[] = [];
    let predefinedMaterialExpense = 0;
    let predefinedLaborExpense = 0;
    let predefinedOtherExpense = 0;

    const customServicesList = details.customServices || [];
    customServicesList.forEach((cs: any) => {
      const matchedSvc = predefinedServices.find(s => s.name === cs.serviceDescription);
      if (matchedSvc) {
        // Tag with the correct category
        const matchedCat = predefinedServiceCategories.find(c => c.id === matchedSvc.categoryId);
        if (matchedCat && matchedCat.name) {
          extraCategories.push(matchedCat.name);
        }
        
        // Sum up predefined costs
        predefinedMaterialExpense += Number(matchedSvc.materialExpense || 0);
        predefinedLaborExpense += Number(matchedSvc.laborExpense || 0);
        predefinedOtherExpense += Number(matchedSvc.fuelExpense || 0) + Number(matchedSvc.otherExpense || 0);
      }
    });

    const initialServiceSelection = details.serviceSelection || [];
    const mergedServiceSelection = [...initialServiceSelection];
    extraCategories.forEach(catName => {
      if (!mergedServiceSelection.includes(catName)) {
        mergedServiceSelection.push(catName);
      }
    });

    const grandTotal = details.grandTotal || 0;

    const newService: Service = {
      submissionId: newSubmissionId,
      appointmentId: newSubmissionId,
      timestamp: new Date().toISOString(),
      submittedBy: currentUser?.username || 'system',
      customerFirstName: details.customer.firstName || '',
      customerLastName: details.customer.lastName || '',
      streetAddress: details.customer.streetAddress || '',
      mobileNumber: details.customer.mobileNumber || '',
      customerEmail: details.customer.customerEmail || '',
      customerLatitude: details.customer.latitude,
      customerLongitude: details.customer.longitude,
      carNumber: details.customer.carNumber || '',
      carBrandModel: details.customer.carBrandModel || '',
      vehicleCategoryTag: category as VehicleCategoryTag,
      serviceSelection: mergedServiceSelection,
      isSubscription: details.isSubscription || false,
      carWashDetails: details.carWashDetails,
      carCareDetails: details.carCareDetails,
      beforeWashingPhoto: '', beforeVideoInventory: '', beforeVideoTopBody: '', beforeVideoUnderchassis: '',
      afterWashingPhoto: '', afterVideoInterior: '', afterVideoExterior: '', afterVideoUnderchassis: '',
      tyreReplacementQuantity: details.tyreReplacementQuantity || 0, tyreReplacementPrice: details.tyreReplacementPrice || 0, tyreReplacementTotalAmount: details.tyreReplacementTotalAmount || 0, tyreLaborCost: 0, tyreMaterialCost: 0, tyreDetails: [],
      batteryReplacementQuantity: details.batteryReplacementQuantity || 0, batteryReplacementTotalAmount: details.batteryReplacementTotalAmount || 0, batteryDetails: [],
      dynamicAddons: details.dynamicAddons || [], addonsTotal: details.addonsTotal || 0, categorizedAddons: [], categorizedAddonsTotal: 0,
      customServices: customServicesList.map((cs: any) => ({
        ...cs,
        relatedServiceId: newSubmissionId
      })),
      customServicesTotal: details.customServicesTotal || 0,
      customFieldData: [], grandTotal: grandTotal, acknowledgement: false,
      status: details.assignedTo ? ServiceStatus.Assigned : ServiceStatus.Queued,
      scheduledDate: details.scheduledDate ? toISTDateString(details.scheduledDate) : '',
      scheduledTime: details.scheduledTime || '',
      assignedTo: details.assignedTo || '',
      secondaryAssignee: details.secondaryAssignee || undefined,
      priority: details.priority || 'Medium',
      tags: Array.isArray(details.tags) ? details.tags : [],
      paymentMode: 'Cash', cashAmount: 0, onlineAmount: 0, paymentNotes: '',
    };

    // Save Profit & Loss initial record if predefined costs are present
    if (predefinedMaterialExpense > 0 || predefinedLaborExpense > 0 || predefinedOtherExpense > 0) {
      const pl: ProfitLoss = {
        serviceId: newSubmissionId,
        materialCost: predefinedMaterialExpense,
        laborCost: predefinedLaborExpense,
        otherExpenses: predefinedOtherExpense,
        dynamicCosts: [],
        calculatedProfit: grandTotal - (predefinedMaterialExpense + predefinedLaborExpense + predefinedOtherExpense),
        notes: 'Predefined service costs applied automatically.'
      };
      
      try {
        await cloudDataService.saveRecord('ProfitLoss', pl, settings.googleSheetsUrl);
        setProfitLossData(prev => [...prev, pl]);
        console.log("[DEBUG] App: Predefined service ProfitLoss record created:", pl);
      } catch (err) {
        console.error("❌ Failed to auto-initialize ProfitLoss record:", err);
      }
    }

    console.log("[DEBUG] App: Final newService object to be saved:", newService);
    return handleCompleteOrder(newService);
  }, [currentUser, handleCompleteOrder, vehicleData, predefinedServices, predefinedServiceCategories, settings.googleSheetsUrl]);

  const [isSyncingWebsiteOrders, setIsSyncingWebsiteOrders] = useState(false);
  const isSyncingWebsiteOrdersRef = useRef(false);
  const lastKnownWebsiteOrderDateRef = useRef<string | null>(null);
  const [isSyncingMetaLeads, setIsSyncingMetaLeads] = useState(false);
  const [isSyncingWhatsAppLeads, setIsSyncingWhatsAppLeads] = useState(false);
  const [newOrdersAlertQueue, setNewOrdersAlertQueue] = useState<Service[]>([]);
  const [isNewOrderAlertOpen, setIsNewOrderAlertOpen] = useState(false);

  const fallbackMapLeadToService = useCallback((lead: ServiceRequest): Service => {
    const nameParts = lead.customerName.split(' ');
    const firstName = nameParts[0] || 'Website';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';
    const totalAmount = lead.totalAmount || 0;
    
    return {
      submissionId: lead.id,
      appointmentId: lead.id,
      timestamp: lead.requestDate || new Date().toISOString(),
      submittedBy: 'Manual Convert',
      customerFirstName: firstName,
      customerLastName: lastName,
      streetAddress: lead.streetAddress || '',
      mobileNumber: lead.customerPhone || '',
      customerEmail: '',
      carNumber: lead.carRegNo || '',
      carBrandModel: lead.carBrand && lead.carModel ? `${lead.carBrand} - ${lead.carModel}` : 'Vehicle - Unknown',
      vehicleCategoryTag: VehicleCategoryTag.Prime,
      serviceSelection: [lead.requestedService],
      isSubscription: false,
      carWashDetails: {
        washType: lead.requestedService,
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
      scheduledDate: '',
      scheduledTime: '',
      assignedTo: '',
      paymentMode: 'Cash',
      cashAmount: totalAmount,
      onlineAmount: 0,
      paymentNotes: '',
    };
  }, []);

  const handleConvertLeadToService = useCallback(async (leadId: string) => {
    const lead = serviceRequests.find(r => r.id === leadId);
    if (!lead) {
      toast.error('Lead not found!');
      return;
    }

    const conversionToast = toast.loading(`Converting lead for ${lead.customerName} into official ticket...`);
    try {
      const { mapWebsiteOrderToService, mapLeadToOfficialService } = await import('./services/googleSheetService');
      
      let newService: Service;

      // Reconstruct official ticket using raw JSON if available, else use dynamic mapLeadToOfficialService
      if (lead.source === 'Website' && lead.originalOrderJson) {
        try {
          const rawOrder = JSON.parse(lead.originalOrderJson);
          newService = mapWebsiteOrderToService(rawOrder);
        } catch (e) {
          console.error("Failed to parse original order JSON, using mapLeadToOfficialService", e);
          newService = mapLeadToOfficialService(lead, vehicleData);
        }
      } else {
        newService = mapLeadToOfficialService(lead, vehicleData);
      }

      // Ensure status is Queued so it enters the active queue
      newService.status = ServiceStatus.Queued;
      newService.statusHistory = [
        {
          status: ServiceStatus.Queued,
          timestamp: new Date().toISOString(),
          notes: `Ticket created dynamically from ${lead.source || 'Meta/WhatsApp'} lead (${lead.requestedService || 'Car Washing'})`,
          updatedBy: currentUser?.username || 'system'
        }
      ];

      // Check if already in submissions
      const existsInSubmissions = submissions.some(s => s.submissionId === newService.submissionId || s.appointmentId === newService.appointmentId);
      if (existsInSubmissions) {
        toast.error('An official service ticket already exists for this lead!', { id: conversionToast });
        return;
      }

      // Update lead status in serviceRequests to 'CONVERTED'
      const updatedRequests = serviceRequests.map(r => 
        r.id === leadId ? { ...r, status: 'CONVERTED' as const } : r
      );

      // Add official ticket to submissions
      const updatedSubmissions = [newService, ...submissions];

      // Save to Cloud DB
      try {
        await cloudDataService.saveRecord('Submissions', newService, settings.googleSheetsUrl);
        await cloudDataService.saveRecord('ServiceRequests', { ...lead, status: 'CONVERTED' as const }, settings.googleSheetsUrl);
      } catch (err) {
        console.error("Cloud saving failed, but local state is updated", err);
      }

      // Update React states
      setSubmissions(updatedSubmissions);
      setServiceRequests(updatedRequests);

      toast.success(`Successfully converted ${lead.customerName}'s lead into a queued service ticket!`, { id: conversionToast });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to convert lead', { id: conversionToast });
    }
  }, [submissions, serviceRequests, settings.googleSheetsUrl, vehicleData, currentUser]);

  const handleCaptureLead = useCallback(async (newLeadData: Omit<ServiceRequest, 'id' | 'requestDate'> & { status?: string }) => {
    const newLead: ServiceRequest = {
      ...newLeadData,
      id: `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      status: newLeadData.status || 'New',
      requestDate: new Date().toISOString(),
    };

    // Save to Cloud DB
    try {
      await cloudDataService.saveRecord('ServiceRequests', newLead, settings.googleSheetsUrl);
    } catch (err) {
      console.error("Cloud saving failed for captured lead, but local state is updated", err);
    }

    setServiceRequests(prev => [newLead, ...prev]);
    
    // Trigger Lead Arrival Notification
    const notif = checkAndGenerateLeadArrival(
      newLead,
      settings.notificationRules || DEFAULT_NOTIFICATION_RULES,
      currentUser?.username || 'system'
    );
    if (notif) {
      handleUpdateNotification(notif);
    }

    toast.success(`Captured lead for ${newLead.customerName} successfully!`);
  }, [settings.googleSheetsUrl, handleUpdateNotification, currentUser, settings.notificationRules]);

  const handleUpdateServiceRequest = useCallback(async (updatedLead: ServiceRequest) => {
    // Determine audit changes
    const oldLead = serviceRequests.find(r => r.id === updatedLead.id);
    const newLogs: AuditLog[] = [];
    const changedBy = currentUser?.username || 'system';
    const timestamp = new Date().toISOString();

    if (oldLead) {
      if (oldLead.status !== updatedLead.status) {
        newLogs.push({
          id: `audit-${Date.now()}-status-${Math.random().toString(36).substr(2, 9)}`,
          leadId: updatedLead.id,
          timestamp,
          changedBy,
          changeType: 'STATUS',
          oldValue: oldLead.status,
          newValue: updatedLead.status,
          notes: `Status changed from "${oldLead.status}" to "${updatedLead.status}"`
        });
      }
      if (oldLead.assignedAgent !== updatedLead.assignedAgent) {
        newLogs.push({
          id: `audit-${Date.now()}-agent-${Math.random().toString(36).substr(2, 9)}`,
          leadId: updatedLead.id,
          timestamp,
          changedBy,
          changeType: 'ASSIGNMENT',
          oldValue: oldLead.assignedAgent || 'Unassigned',
          newValue: updatedLead.assignedAgent || 'Unassigned',
          notes: `Assigned agent changed from "${oldLead.assignedAgent || 'Unassigned'}" to "${updatedLead.assignedAgent || 'Unassigned'}"`
        });
      }
      if (oldLead.remarks !== updatedLead.remarks) {
        newLogs.push({
          id: `audit-${Date.now()}-remarks-${Math.random().toString(36).substr(2, 9)}`,
          leadId: updatedLead.id,
          timestamp,
          changedBy,
          changeType: 'REMARKS',
          oldValue: oldLead.remarks || '',
          newValue: updatedLead.remarks || '',
          notes: `Remarks updated`
        });
      }
    } else {
      // It is a brand new creation audit log
      newLogs.push({
        id: `audit-${Date.now()}-create-${Math.random().toString(36).substr(2, 9)}`,
        leadId: updatedLead.id,
        timestamp,
        changedBy,
        changeType: 'CREATE',
        oldValue: '',
        newValue: updatedLead.status,
        notes: `Lead captured/created with status "${updatedLead.status}"`
      });
    }

    // Save to Cloud DB
    try {
      await cloudDataService.saveRecord('ServiceRequests', updatedLead, settings.googleSheetsUrl);
      if (newLogs.length > 0) {
        for (const log of newLogs) {
          await cloudDataService.saveRecord('AuditLogs', log, settings.googleSheetsUrl);
        }
      }
    } catch (err) {
      console.error("Cloud saving failed for lead update, but local state is updated", err);
    }

    setServiceRequests(prev => prev.map(r => r.id === updatedLead.id ? updatedLead : r));
    if (newLogs.length > 0) {
      setAuditLogs(prev => [...newLogs, ...prev]);
    }

    // Simultaneously update linked order/submission state when admin changes lead status
    const matchingSub = submissions.find(s =>
      s.submissionId === updatedLead.id ||
      s.appointmentId === updatedLead.id ||
      (s.mobileNumber && updatedLead.customerPhone && String(s.mobileNumber).replace(/[^0-9]/g, '') === String(updatedLead.customerPhone).replace(/[^0-9]/g, ''))
    );

    if (matchingSub) {
      const normLeadStatus = (updatedLead.status || '').toUpperCase();
      let newSubStatus: ServiceStatus | null = null;

      if (['COMPLETED', 'DELIVERED'].includes(normLeadStatus)) {
        newSubStatus = ServiceStatus.Completed;
      } else if (['IN_PROGRESS', 'IN PROGRESS', 'SHIPPED'].includes(normLeadStatus)) {
        if (matchingSub.status !== ServiceStatus.Completed) {
          newSubStatus = ServiceStatus.InProgress;
        }
      } else if (['ASSIGNED', 'CONTACTED'].includes(normLeadStatus)) {
        if (matchingSub.status === ServiceStatus.Queued || matchingSub.status === ServiceStatus.Draft) {
          newSubStatus = ServiceStatus.Assigned;
        }
      } else if (['CONFIRMED', 'QUEUED', 'BOOKED', 'CONVERTED', 'NEW'].includes(normLeadStatus)) {
        if (matchingSub.status === ServiceStatus.Draft) {
          newSubStatus = ServiceStatus.Queued;
        }
      }

      if (newSubStatus && matchingSub.status !== newSubStatus) {
        const updatedSub: Service = {
          ...matchingSub,
          status: newSubStatus,
          statusHistory: [
            ...(matchingSub.statusHistory || []),
            {
              status: newSubStatus,
              timestamp: new Date().toISOString(),
              notes: `Status updated simultaneously from web lead admin change (${updatedLead.status})`,
              updatedBy: currentUser?.username || 'system'
            }
          ]
        };
        setSubmissions(prev => prev.map(s => s.submissionId === matchingSub.submissionId ? updatedSub : s));
        cloudDataService.saveRecord('Submissions', updatedSub, settings.googleSheetsUrl)
          .catch(err => console.error("Cloud saving failed for submission sync, but local state is updated", err));
      }
    }

    if (updatedLead.status.toUpperCase() === 'CONVERTED') {
      const alreadyConverted = submissions.some(s => s.submissionId === updatedLead.id || s.appointmentId === updatedLead.id);
      if (!alreadyConverted) {
        handleConvertLeadToService(updatedLead.id);
      }
    }
  }, [settings.googleSheetsUrl, submissions, handleConvertLeadToService, serviceRequests, currentUser]);

  const handleSyncWebsiteOrders = useCallback(async (mode: 'incremental' | 'full' = 'incremental', silent: boolean = false) => {
    if (isSyncingWebsiteOrdersRef.current) return;
    isSyncingWebsiteOrdersRef.current = true;
    
    // Only toggle UI button spinner for explicit manual sync requests
    if (!silent) {
      setIsSyncingWebsiteOrders(true);
    }

    let syncToast: any = null;
    if (!silent) {
      syncToast = toast.loading('Syncing website orders directly from Neon PostgreSQL...');
    }
    const nowIso = new Date().toISOString();

    try {
      const isDeltaPoll = silent && mode === 'incremental' && Boolean(lastKnownWebsiteOrderDateRef.current);
      
      // 1. Fetch website orders from Neon database (pass since parameter if running routine delta check)
      const neonOrders = await neonDataService.loadWebsiteOrders(
        isDeltaPoll ? { limit: 100, since: lastKnownWebsiteOrderDateRef.current! } : 1000
      );

      // If delta polling and no new orders arrived, return early without touching state
      if (isDeltaPoll && (!Array.isArray(neonOrders) || neonOrders.length === 0)) {
        return;
      }

      if (!Array.isArray(neonOrders) || neonOrders.length === 0) {
        if (syncToast) toast.success('Website orders up to date (0 new orders found)', { id: syncToast });
        return;
      }

      // Update latest known order date
      for (const o of neonOrders) {
        const orderDate = (o as any).createdAt || o.timestamp || (o as any).order_date;
        if (orderDate) {
          if (!lastKnownWebsiteOrderDateRef.current || new Date(orderDate).getTime() > new Date(lastKnownWebsiteOrderDateRef.current).getTime()) {
            lastKnownWebsiteOrderDateRef.current = orderDate;
          }
        }
      }

      // 2. Track seen order IDs to detect incoming new orders
      const STORAGE_SEEN_KEY = 'seen_neon_website_order_ids';
      let seenIds = new Set<string>();
      const isFirstRun = !localStorage.getItem(STORAGE_SEEN_KEY);

      try {
        const stored = localStorage.getItem(STORAGE_SEEN_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) seenIds = new Set(parsed);
        }
      } catch (err) {
        console.warn('Could not read seen orders from storage:', err);
      }

      // Identify brand new orders
      const newOrders: Service[] = [];
      if (!isFirstRun) {
        for (const order of neonOrders) {
          const oid = order.websiteOrderId || order.submissionId || order.id;
          if (oid && !seenIds.has(oid)) {
            newOrders.push(order);
          }
        }
      }

      // If delta check and all fetched orders were already seen, do not cause state churn
      if (isDeltaPoll && newOrders.length === 0) {
        return;
      }

      // Update seen IDs set with all current orders
      neonOrders.forEach(o => {
        const oid = o.websiteOrderId || o.submissionId || o.id;
        if (oid) seenIds.add(oid);
      });
      try {
        localStorage.setItem(STORAGE_SEEN_KEY, JSON.stringify(Array.from(seenIds)));
      } catch (err) {}

      // 3. Delta syncing method: merge website orders into active submissions state (newest first)
      setSubmissions(prev => {
        const merged = cloudDataService.mergeSubmissions(neonOrders, prev);
        merged.sort((a, b) => new Date((b as any).createdAt || b.timestamp || 0).getTime() - new Date((a as any).createdAt || a.timestamp || 0).getTime());
        return merged;
      });

      // 4. Map website orders into ServiceRequests for the Web Leads CRM queue (Single source of truth: Neon DB)
      const webLeadsFromNeon: ServiceRequest[] = neonOrders.map(order => cloudDataService.mapWebsiteOrderToServiceRequest(order));

      setServiceRequests(prev => {
        const merged = cloudDataService.mergeById(webLeadsFromNeon, prev, 'id');
        merged.sort((a, b) => new Date(b.requestDate || (b as any).timestamp || 0).getTime() - new Date(a.requestDate || (a as any).timestamp || 0).getTime());
        cloudDataService.safeLocalStorageSet('service_app_service_requests', merged);
        return merged;
      });

      // 5. Update settings with last sync date
      setSettings(prev => {
        const updated = { ...prev, webLeadsLastSyncDate: nowIso };
        localStorage.setItem('webLeadsLastSyncDate', nowIso);
        return updated;
      });

      // 6. Trigger new order audio-visual popup if new orders detected
      if (newOrders.length > 0) {
        console.log(`🎉 [Live New Orders] Detected ${newOrders.length} new website order(s)!`);
        playNewOrderChime(0.4);
        setNewOrdersAlertQueue(newOrders);
        setIsNewOrderAlertOpen(true);
        if (syncToast) {
          toast.success(`🎉 ${newOrders.length} new website order(s) received from Neon DB!`, { id: syncToast });
        } else {
          toast.success(`🎉 ${newOrders.length} new website order(s) received!`, { duration: 6000 });
        }
      } else if (syncToast) {
        toast.success(`Synced ${neonOrders.length} website orders from Neon DB successfully!`, { id: syncToast });
      }
    } catch (err: any) {
      console.error('Neon website orders sync error:', err);
      if (syncToast) {
        toast.error(`Failed to sync Neon website orders: ${err.message}`, { id: syncToast });
      }
    } finally {
      isSyncingWebsiteOrdersRef.current = false;
      if (!silent) {
        setIsSyncingWebsiteOrders(false);
      }
    }
  }, []);

  const handleSyncWebsiteOrdersRef = useRef(handleSyncWebsiteOrders);
  useEffect(() => {
    handleSyncWebsiteOrdersRef.current = handleSyncWebsiteOrders;
  }, [handleSyncWebsiteOrders]);

  // Periodic Auto-polling for new website orders in Neon database (strictly every 30 seconds via delta syncing)
  useEffect(() => {
    // Initial sync immediately upon mounting (full set)
    handleSyncWebsiteOrdersRef.current('full', true);

    const pollInterval = setInterval(() => {
      // 30-second polling uses delta sync checking
      handleSyncWebsiteOrdersRef.current('incremental', true);
    }, 30000);

    return () => {
      clearInterval(pollInterval);
    };
  }, []);
  
  const handleLoadMoreServiceRequests = useCallback(async () => {
    if (isLoadingMoreServiceRequests) return;
    setIsLoadingMoreServiceRequests(true);
    const lastRequest = serviceRequests[serviceRequests.length - 1];
    const lastDate = lastRequest?.requestDate;
    
    try {
      const more = await cloudDataService.fetchMoreServiceRequests(lastDate, 100);
      if (more.length === 0) {
        setHasMoreServiceRequests(false);
        toast.info("No more web leads to load.");
      } else {
        setServiceRequests(prev => {
          const merged = cloudDataService.mergeById(more, prev, 'id');
          cloudDataService.safeLocalStorageSet('service_app_service_requests', merged);
          return merged;
        });
        toast.success(`Loaded ${more.length} more web leads.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load more web leads.");
    } finally {
      setIsLoadingMoreServiceRequests(false);
    }
  }, [serviceRequests, isLoadingMoreServiceRequests]);
  
  const handleSyncMetaLeads = useCallback(async (mode: 'incremental' | 'full' = 'incremental', options?: { silent?: boolean }) => {
    if (isSyncingMetaLeads) return;
    setIsSyncingMetaLeads(true);
    const isSilent = Boolean(options?.silent);
    const syncToast = !isSilent ? toast.loading(mode === 'full' ? 'Performing overall sync for Meta Leads across subsheets...' : 'Syncing new Meta Leads...') : null;
    const nowIso = new Date().toISOString();
    try {
      const { fetchMetaLeadsFromSheet, mapMetaLeadToServiceRequest } = await import('./services/googleSheetService');
      
      const sheetUrl = settings.metaLeadsSheetUrl || "https://docs.google.com/spreadsheets/d/1Y8ZdkqTrddhxmVchXabBe5sCGkfeXH-Jmz3s03AWN0k/edit?usp=sharing";
      const tabName = settings.metaLeadsTabName || "";
      
      // Calculate last_sync_timestamp from existing Meta Lead records in Firestore / local state
      let lastSyncTimestamp: string | undefined = undefined;
      if (mode === 'incremental') {
        const metaLeads = serviceRequests.filter(r => r && (r.source === 'Meta' || r.leadSource === 'Meta'));
        for (const lead of metaLeads) {
          const t = lead.requestDate || lead.createdTime || lead.syncedAt;
          if (t && !isNaN(new Date(t).getTime())) {
            if (!lastSyncTimestamp || new Date(t).getTime() > new Date(lastSyncTimestamp).getTime()) {
              lastSyncTimestamp = t;
            }
          }
        }
        if (settings.metaLeadsLastSyncDate && !isNaN(new Date(settings.metaLeadsLastSyncDate).getTime())) {
          if (!lastSyncTimestamp || new Date(settings.metaLeadsLastSyncDate).getTime() > new Date(lastSyncTimestamp).getTime()) {
            lastSyncTimestamp = settings.metaLeadsLastSyncDate;
          }
        }
      }

      const rows = await fetchMetaLeadsFromSheet(sheetUrl, tabName, lastSyncTimestamp);
      
      let newLeadsAddedCount = 0;
      let leadsUpdatedCount = 0;
      
      // Use a Map for O(1) lookups and to avoid index shifting/overwriting bugs
      const requestsMap = new Map<string, ServiceRequest>();
      for (const req of serviceRequests) {
        if (req && req.id) requestsMap.set(req.id, req);
      }
      
      const newLeads: ServiceRequest[] = [];
      
      for (const row of rows) {
        const request = mapMetaLeadToServiceRequest(row);
        if (!request.id) continue;
        
        const existing = requestsMap.get(request.id);
        
        if (!existing) {
          request.syncedAt = nowIso;
          requestsMap.set(request.id, request);
          newLeads.push(request);
          newLeadsAddedCount++;
          
          try {
            await cloudDataService.saveRecord('ServiceRequests', request, settings.googleSheetsUrl);
            
            // Trigger smart lead arrival notification
            const notif = checkAndGenerateLeadArrival(
              request,
              settings.notificationRules || DEFAULT_NOTIFICATION_RULES,
              currentUser?.username || 'system'
            );
            if (notif) {
              handleUpdateNotification(notif);
            }
          } catch (err) {
            console.error(`Failed to sync new Meta Lead ${request.id} to Cloud DB`, err);
          }
        } else {
          const hasChanged = 
            existing.status !== request.status || 
            existing.remarks !== request.remarks ||
            existing.bookingReminderDate !== request.bookingReminderDate ||
            existing.subsheetName !== request.subsheetName;
          
          if (hasChanged || mode === 'full') {
            const merged = { ...existing, ...request, syncedAt: nowIso };
            requestsMap.set(request.id, merged);
            if (hasChanged) leadsUpdatedCount++;
            
            try {
              await cloudDataService.saveRecord('ServiceRequests', merged, settings.googleSheetsUrl);
            } catch (err) {
              console.error(`Failed to update Meta Lead ${request.id} in Cloud DB`, err);
            }
          }
        }
      }

      const sheetStats = (rows as any).stats || {
        totalRowsEvaluated: rows.length,
        rowsSkipped: 0,
        rowsProcessed: rows.length,
        syncDurationMs: 0,
        estimatedTimeSavedMs: 0
      };

      const perfStats: SyncPerformanceStats = {
        lastSyncTimestamp: lastSyncTimestamp || nowIso,
        mode,
        totalRowsEvaluated: sheetStats.totalRowsEvaluated,
        rowsSkipped: sheetStats.rowsSkipped,
        rowsProcessed: sheetStats.rowsProcessed,
        newLeadsImported: newLeadsAddedCount,
        leadsUpdated: leadsUpdatedCount,
        syncDurationMs: sheetStats.syncDurationMs,
        estimatedTimeSavedMs: sheetStats.estimatedTimeSavedMs,
        lastSyncSource: 'Meta',
        lastSyncCompletedAt: nowIso
      };

      setSyncPerformanceStats(perfStats);
      localStorage.setItem('lastSyncPerformanceStats', JSON.stringify(perfStats));

      setSettings(prev => {
        const updated = { ...prev, metaLeadsLastSyncDate: nowIso };
        localStorage.setItem('metaLeadsLastSyncDate', nowIso);
        return updated;
      });
      
      if (newLeadsAddedCount > 0 || leadsUpdatedCount > 0) {
        const remainingExisting = serviceRequests.filter(r => !newLeads.some(nl => nl.id === r.id));
        const updatedRequests = [
          ...newLeads,
          ...remainingExisting.map(r => requestsMap.get(r.id) || r)
        ];
        
        setServiceRequests(updatedRequests);
        if (!isSilent && syncToast) {
          toast.success(`Sync Complete: ${newLeadsAddedCount} new lead(s) imported! (${sheetStats.rowsSkipped} rows skipped via last_sync_timestamp, saved ~${(sheetStats.estimatedTimeSavedMs / 1000).toFixed(1)}s)`, { id: syncToast });
        } else if (newLeadsAddedCount > 0) {
          console.log(`📥 [Background Lead Sync] Added ${newLeadsAddedCount} new Meta leads.`);
        }
      } else {
        if (!isSilent && syncToast) {
          toast.success(`Meta leads up to date! (${sheetStats.rowsSkipped} rows skipped, saved ~${(sheetStats.estimatedTimeSavedMs / 1000).toFixed(1)}s)`, { id: syncToast });
        }
      }
    } catch (err: any) {
      console.error('[App] Meta lead sync failed:', err);
      const msg = err?.message || 'Failed to sync Meta leads';
      if (!isSilent && syncToast) {
        if (msg.includes('AUTH_REQUIRED') || msg.toLowerCase().includes('restricted') || msg.toLowerCase().includes('permission')) {
          toast.error('Google Sheet access restricted! Please open your Google Sheet, click Share, and set General Access to "Anyone with the link can view".', { id: syncToast, duration: 8000 });
        } else {
          toast.error(msg, { id: syncToast, duration: 5000 });
        }
      }
    } finally {
      setIsSyncingMetaLeads(false);
    }
  }, [serviceRequests, settings.googleSheetsUrl, settings.metaLeadsSheetUrl, settings.metaLeadsTabName, isSyncingMetaLeads, handleUpdateNotification, currentUser, settings.notificationRules]);
  
  const handleSyncWhatsAppLeads = useCallback(async (mode: 'incremental' | 'full' = 'incremental', options?: { silent?: boolean }) => {
    if (isSyncingWhatsAppLeads) return;
    setIsSyncingWhatsAppLeads(true);
    const isSilent = Boolean(options?.silent);
    const syncToast = !isSilent ? toast.loading(mode === 'full' ? 'Performing overall sync for WhatsApp enquiries...' : 'Syncing WhatsApp enquiries...') : null;
    const nowIso = new Date().toISOString();
    try {
      const { fetchWhatsAppEnquiriesFromSheet, mapWhatsAppEnquiryToServiceRequest, DEFAULT_WHATSAPP_ENQUIRY_SHEET_URL } = await import('./services/googleSheetService');
      
      const sheetUrl = settings.whatsappSheetUrl || DEFAULT_WHATSAPP_ENQUIRY_SHEET_URL;
      const tabName = settings.whatsappTabName || "";
      
      let lastSyncTimestamp: string | undefined = undefined;
      if (mode === 'incremental') {
        const waLeads = serviceRequests.filter(r => r && (r.source === 'WhatsApp' || r.leadSource === 'WhatsApp'));
        for (const lead of waLeads) {
          const t = lead.requestDate || lead.createdTime || lead.syncedAt;
          if (t && !isNaN(new Date(t).getTime())) {
            if (!lastSyncTimestamp || new Date(t).getTime() > new Date(lastSyncTimestamp).getTime()) {
              lastSyncTimestamp = t;
            }
          }
        }
        if (settings.whatsappLastSyncDate && !isNaN(new Date(settings.whatsappLastSyncDate).getTime())) {
          if (!lastSyncTimestamp || new Date(settings.whatsappLastSyncDate).getTime() > new Date(lastSyncTimestamp).getTime()) {
            lastSyncTimestamp = settings.whatsappLastSyncDate;
          }
        }
      }

      const rows = await fetchWhatsAppEnquiriesFromSheet(sheetUrl, tabName, lastSyncTimestamp);
      
      let newLeadsAddedCount = 0;
      let leadsUpdatedCount = 0;
      
      const requestsMap = new Map<string, ServiceRequest>();
      for (const req of serviceRequests) {
        if (req && req.id) requestsMap.set(req.id, req);
      }
      
      const newLeads: ServiceRequest[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const request = mapWhatsAppEnquiryToServiceRequest(row, i);
        if (!request.id) continue;
        
        const existing = requestsMap.get(request.id);
        
        if (!existing) {
          request.syncedAt = nowIso;
          requestsMap.set(request.id, request);
          newLeads.push(request);
          newLeadsAddedCount++;
          
          try {
            await cloudDataService.saveRecord('ServiceRequests', request, settings.googleSheetsUrl);
            
            const notif = checkAndGenerateLeadArrival(
              request,
              settings.notificationRules || DEFAULT_NOTIFICATION_RULES,
              currentUser?.username || 'system'
            );
            if (notif) {
              handleUpdateNotification(notif);
            }
          } catch (err) {
            console.error(`Failed to sync new WhatsApp Enquiry ${request.id} to Cloud DB`, err);
          }
        } else {
          const hasChanged = 
            existing.status !== request.status || 
            existing.remarks !== request.remarks ||
            existing.totalAmount !== request.totalAmount ||
            existing.leadCost !== request.leadCost ||
            existing.assignedAgent !== request.assignedAgent;
          
          if (hasChanged || mode === 'full') {
            const merged = { ...existing, ...request, syncedAt: nowIso };
            requestsMap.set(request.id, merged);
            if (hasChanged) leadsUpdatedCount++;
            
            try {
              await cloudDataService.saveRecord('ServiceRequests', merged, settings.googleSheetsUrl);
            } catch (err) {
              console.error(`Failed to update WhatsApp Enquiry ${request.id} in Cloud DB`, err);
            }
          }
        }
      }

      const sheetStats = (rows as any).stats || {
        totalRowsEvaluated: rows.length,
        rowsSkipped: 0,
        rowsProcessed: rows.length,
        syncDurationMs: 0,
        estimatedTimeSavedMs: 0
      };

      const perfStats: SyncPerformanceStats = {
        lastSyncTimestamp: lastSyncTimestamp || nowIso,
        mode,
        totalRowsEvaluated: sheetStats.totalRowsEvaluated,
        rowsSkipped: sheetStats.rowsSkipped,
        rowsProcessed: sheetStats.rowsProcessed,
        newLeadsImported: newLeadsAddedCount,
        leadsUpdated: leadsUpdatedCount,
        syncDurationMs: sheetStats.syncDurationMs,
        estimatedTimeSavedMs: sheetStats.estimatedTimeSavedMs,
        lastSyncSource: 'WhatsApp',
        lastSyncCompletedAt: nowIso
      };

      setSyncPerformanceStats(perfStats);
      localStorage.setItem('lastSyncPerformanceStats', JSON.stringify(perfStats));

      setSettings(prev => {
        const updated = { ...prev, whatsappLastSyncDate: nowIso };
        localStorage.setItem('whatsappLastSyncDate', nowIso);
        return updated;
      });
      
      if (newLeadsAddedCount > 0 || leadsUpdatedCount > 0) {
        const remainingExisting = serviceRequests.filter(r => !newLeads.some(nl => nl.id === r.id));
        const updatedRequests = [
          ...newLeads,
          ...remainingExisting.map(r => requestsMap.get(r.id) || r)
        ];
        
        setServiceRequests(updatedRequests);
        if (!isSilent && syncToast) {
          toast.success(`WhatsApp Sync Complete: ${newLeadsAddedCount} enquiry(s) imported, ${leadsUpdatedCount} updated!`, { id: syncToast });
        } else if (newLeadsAddedCount > 0) {
          console.log(`📥 [Background Lead Sync] Added ${newLeadsAddedCount} new WhatsApp leads.`);
        }
      } else {
        if (!isSilent && syncToast) {
          toast.success(`WhatsApp enquiries up to date! (${sheetStats.rowsSkipped} rows skipped)`, { id: syncToast });
        }
      }
    } catch (err: any) {
      console.error('[App] WhatsApp lead sync failed:', err);
      const msg = err?.message || 'Failed to sync WhatsApp enquiries';
      if (!isSilent && syncToast) {
        if (msg.includes('AUTH_REQUIRED') || msg.toLowerCase().includes('restricted') || msg.toLowerCase().includes('permission')) {
          toast.error('WhatsApp Google Sheet access restricted! Open the sheet, click Share, and select "Anyone with the link can view".', { id: syncToast, duration: 8000 });
        } else {
          toast.error(msg, { id: syncToast, duration: 5000 });
        }
      }
    } finally {
      setIsSyncingWhatsAppLeads(false);
    }
  }, [serviceRequests, settings.googleSheetsUrl, settings.whatsappSheetUrl, settings.whatsappTabName, isSyncingWhatsAppLeads, handleUpdateNotification, currentUser, settings.notificationRules]);

  const handleSyncAllLeads = useCallback(async (mode: 'incremental' | 'full' = 'incremental') => {
    toast.info('Starting omni-channel sync (Meta + WhatsApp + Web)...');
    try {
      await Promise.allSettled([
        handleSyncMetaLeads(mode),
        handleSyncWhatsAppLeads(mode),
        handleSyncWebsiteOrders(mode)
      ]);
    } catch (e) {
      console.error('Omni-channel sync warning:', e);
    }
  }, [handleSyncMetaLeads, handleSyncWhatsAppLeads, handleSyncWebsiteOrders]);

  const handleSaveSettings = (newSettings: Settings) => {
    const sanitizedUrls = getSanitizedSettingsUrls(newSettings.googleSheetsUrl, newSettings.googleDriveUploadUrl);
    const updatedSettings: Settings = {
      ...newSettings,
      googleSheetsUrl: sanitizedUrls.googleSheetsUrl,
      googleDriveUploadUrl: sanitizedUrls.googleDriveUploadUrl,
    };

    localStorage.setItem('googleSheetsUrl', sanitizedUrls.googleSheetsUrl);
    localStorage.setItem('googleDriveUploadUrl', sanitizedUrls.googleDriveUploadUrl);
    localStorage.setItem('customLogoUrl', updatedSettings.customLogoUrl || '');
    localStorage.setItem('googleMapsApiKey', updatedSettings.googleMapsApiKey || '');
    localStorage.setItem('hubLatitude', String(updatedSettings.hubLatitude || 22.572646));
    localStorage.setItem('hubLongitude', String(updatedSettings.hubLongitude || 88.363895));
    localStorage.setItem('maxDistanceKm', String(updatedSettings.maxDistanceKm || 20));
    localStorage.setItem('syncFrequency', updatedSettings.syncFrequency || 'manual');
    localStorage.setItem('metaLeadsSheetUrl', updatedSettings.metaLeadsSheetUrl || '');
    localStorage.setItem('metaLeadsTabName', updatedSettings.metaLeadsTabName || '');
    localStorage.setItem('whatsappSheetUrl', updatedSettings.whatsappSheetUrl || '');
    localStorage.setItem('whatsappTabName', updatedSettings.whatsappTabName || '');
    if (updatedSettings.metaLeadsLastSyncDate) localStorage.setItem('metaLeadsLastSyncDate', updatedSettings.metaLeadsLastSyncDate);
    if (updatedSettings.whatsappLastSyncDate) localStorage.setItem('whatsappLastSyncDate', updatedSettings.whatsappLastSyncDate);
    if (updatedSettings.webLeadsLastSyncDate) localStorage.setItem('webLeadsLastSyncDate', updatedSettings.webLeadsLastSyncDate);
    if (updatedSettings.agentRankThresholds) {
      localStorage.setItem('agentRankThresholds', JSON.stringify(updatedSettings.agentRankThresholds));
    }
    if (updatedSettings.notificationRules) {
      localStorage.setItem('notificationRules', JSON.stringify(updatedSettings.notificationRules));
    }

    // Persist Disaster Recovery & Lead Delta Sync preferences
    const drEnabled = !!updatedSettings.googleSheetsDisasterRecoveryEnabled;
    localStorage.setItem('google_sheets_dr_backup_enabled', drEnabled ? 'true' : 'false');
    import('./services/backendConfig').then(mod => {
      mod.setGoogleSheetsDisasterRecoveryEnabled(drEnabled);
    });
    import('./services/neonDataService').then(mod => {
      mod.neonDataService.updateDisasterRecoveryConfig(drEnabled).catch(() => {});
    });

    if (updatedSettings.disasterRecoveryBackupSchedule) {
      localStorage.setItem('disasterRecoveryBackupSchedule', updatedSettings.disasterRecoveryBackupSchedule);
    }
    if (updatedSettings.metaLeadsDeltaSyncEnabled !== undefined) {
      localStorage.setItem('metaLeadsDeltaSyncEnabled', updatedSettings.metaLeadsDeltaSyncEnabled ? 'true' : 'false');
    }
    if (updatedSettings.whatsAppEnquiryDeltaSyncEnabled !== undefined) {
      localStorage.setItem('whatsAppEnquiryDeltaSyncEnabled', updatedSettings.whatsAppEnquiryDeltaSyncEnabled ? 'true' : 'false');
    }
    if (updatedSettings.leadDeltaSyncIntervalMinutes) {
      localStorage.setItem('leadDeltaSyncIntervalMinutes', String(updatedSettings.leadDeltaSyncIntervalMinutes));
    }

    setSettings(updatedSettings);
    cloudDataService.saveRecord('Settings', updatedSettings, sanitizedUrls.googleSheetsUrl);
    triggerHapticFeedback('success');
  };

  // Automated Background Lead Delta Sync Runner (Meta Leads + WhatsApp Enquiry into Neon DB)
  const isSyncingMetaLeadsRef = useRef(false);
  const isSyncingWhatsAppLeadsRef = useRef(false);
  const lastLeadSyncTimeRef = useRef<number>(0);
  const handleSyncMetaLeadsRef = useRef(handleSyncMetaLeads);
  const handleSyncWhatsAppLeadsRef = useRef(handleSyncWhatsAppLeads);

  useEffect(() => {
    isSyncingMetaLeadsRef.current = isSyncingMetaLeads;
  }, [isSyncingMetaLeads]);

  useEffect(() => {
    isSyncingWhatsAppLeadsRef.current = isSyncingWhatsAppLeads;
  }, [isSyncingWhatsAppLeads]);

  useEffect(() => {
    handleSyncMetaLeadsRef.current = handleSyncMetaLeads;
    handleSyncWhatsAppLeadsRef.current = handleSyncWhatsAppLeads;
  });

  useEffect(() => {
    // RESTRICTION: Auto-sync is restricted and disabled by default to protect bandwidth limits.
    // Leads can only be synchronized manually on-demand unless explicitly enabled.
    const isLeadSyncActive = settings.metaLeadsDeltaSyncEnabled === true || settings.whatsAppEnquiryDeltaSyncEnabled === true;
    if (!isLeadSyncActive) {
      console.log('📡 [App Background Lead Delta Sync] Auto-sync is restricted (Manual trigger only). Bandwidth protected.');
      return;
    }

    // Interval if enabled (minimum 5 mins, default 60 mins)
    const intervalMinutes = Math.max(Number(settings.leadDeltaSyncIntervalMinutes) || 60, 5);
    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`📡 [App Background Lead Delta Sync] Active timer (${intervalMinutes}m interval).`);

    const runSilentLeadSync = async () => {
      if (typeof document !== 'undefined' && document.hidden) return; // Save bandwidth when tab is backgrounded
      const now = Date.now();
      // Enforce at least (intervalMs - 5000) gap between runs to prevent any 1-2 second sync bursts
      if (now - lastLeadSyncTimeRef.current < intervalMs - 5000) {
        return;
      }
      lastLeadSyncTimeRef.current = now;

      try {
        if (settings.metaLeadsDeltaSyncEnabled !== false && !isSyncingMetaLeadsRef.current) {
          await handleSyncMetaLeadsRef.current('incremental', { silent: true });
        }
        if (settings.whatsAppEnquiryDeltaSyncEnabled !== false && !isSyncingWhatsAppLeadsRef.current) {
          await handleSyncWhatsAppLeadsRef.current('incremental', { silent: true });
        }
      } catch (err) {
        console.warn('⚠️ [Background Lead Delta Sync Notice]:', err);
      }
    };

    // Stagger initial check to wait at least 60 seconds after load, NOT immediately, and repeat every 5 minutes
    const initialTimer = setTimeout(runSilentLeadSync, 60 * 1000);
    const intervalTimer = setInterval(runSilentLeadSync, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [
    settings.metaLeadsDeltaSyncEnabled,
    settings.whatsAppEnquiryDeltaSyncEnabled,
    settings.leadDeltaSyncIntervalMinutes
  ]);

  const handleUpdateSpendCategories = async (updatedCategories: SpendCategory[]) => {
    setSpendCategories(updatedCategories);
    try {
      // Find deleted categories
      const deleted = spendCategories.filter(oldCat => !updatedCategories.some(newCat => newCat.id === oldCat.id));
      for (const cat of deleted) {
        await cloudDataService.deleteRecord('SpendCategories', cat.id, settings.googleSheetsUrl);
      }

      // Save updated / new categories
      for (const cat of updatedCategories) {
        await cloudDataService.saveRecord('SpendCategories', cat, settings.googleSheetsUrl);
      }

      toast.success('Spend categories synchronized successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to sync spend categories to cloud database');
    }
  };

  const handleUpdateUsers = (allUsers: User[]) => {
      setUsers(allUsers);
      allUsers.forEach(u => cloudDataService.saveRecord('Users', u, settings.googleSheetsUrl));
      triggerHapticFeedback('success');
  };

  const handleUpdatePricing = (cfg: PricingConfig) => {
      const newSettings = { ...settings, pricingConfig: cfg };
      setSettings(newSettings);
      cloudDataService.saveRecord('Settings', newSettings, settings.googleSheetsUrl);
  };

  const handleUpdatePlans = (plans: SubscriptionPlan[]) => {
    setSubscriptionPlans(plans);
    plans.forEach(p => cloudDataService.saveRecord('SubscriptionPlans', p, settings.googleSheetsUrl));
  };
  
  const handleUpdateSubs = (subs: UserSubscription[]) => {
    setUserSubscriptions(subs);
    subs.forEach(s => cloudDataService.saveRecord('UserSubscriptions', s, settings.googleSheetsUrl));
  };

  const handleUpdateAttendanceStatus = useCallback((
    username: string,
    status: AttendanceStatus,
    coords?: { latitude: number; longitude: number },
    note?: string
  ) => {
    const timestamp = new Date().toISOString();
    const newRecord: AttendanceRecord = {
      timestamp,
      status,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
      note,
    };

    const updatedUsers = users.map(u => {
      if (u.username === username) {
        const currentHistory = u.attendanceHistory || [];
        return {
          ...u,
          attendanceStatus: status,
          latitude: coords ? coords.latitude : u.latitude,
          longitude: coords ? coords.longitude : u.longitude,
          lastLocationUpdate: coords ? timestamp : u.lastLocationUpdate,
          attendanceHistory: [...currentHistory, newRecord],
        };
      }
      return u;
    });

    setUsers(updatedUsers);

    if (currentUser?.username === username) {
      setCurrentUser(prev => {
        if (!prev) return null;
        const currentHistory = prev.attendanceHistory || [];
        const updated = {
          ...prev,
          attendanceStatus: status,
          latitude: coords ? coords.latitude : prev.latitude,
          longitude: coords ? coords.longitude : prev.longitude,
          lastLocationUpdate: coords ? timestamp : prev.lastLocationUpdate,
          attendanceHistory: [...currentHistory, newRecord],
        };
        localStorage.setItem('service_app_current_user', JSON.stringify(updated));
        return updated;
      });
    }

    const userToSave = updatedUsers.find(u => u.username === username);
    if (userToSave) {
      cloudDataService.saveRecord('Users', userToSave, settings.googleSheetsUrl);
    }

    if (coords) {
      const newLoc: LocationHistory = {
        historyId: `LH-${Date.now()}`,
        userId: username,
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp,
      };
      setLocationHistory(prev => [newLoc, ...prev]);
      cloudDataService.saveRecord('LocationHistory', newLoc, settings.googleSheetsUrl);
    }

    triggerHapticFeedback('success');
    toast.success(`Attendance status updated to ${status}`);
  }, [users, currentUser, settings.googleSheetsUrl]);

  const handleAdminOverride = useCallback((
    username: string,
    status: AttendanceStatus,
    timestamp: string,
    note: string
  ) => {
    const newRecord: AttendanceRecord = {
      timestamp,
      status,
      isManualEntry: true,
      note,
    };

    const updatedUsers = users.map(u => {
      if (u.username === username) {
        const currentHistory = u.attendanceHistory || [];
        const isToday = new Date(timestamp).toDateString() === new Date().toDateString();
        return {
          ...u,
          attendanceStatus: isToday ? status : u.attendanceStatus,
          attendanceHistory: [...currentHistory, newRecord].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          ),
        };
      }
      return u;
    });

    setUsers(updatedUsers);

    if (currentUser?.username === username) {
      setCurrentUser(prev => {
        if (!prev) return null;
        const currentHistory = prev.attendanceHistory || [];
        const isToday = new Date(timestamp).toDateString() === new Date().toDateString();
        const updated = {
          ...prev,
          attendanceStatus: isToday ? status : prev.attendanceStatus,
          attendanceHistory: [...currentHistory, newRecord].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          ),
        };
        localStorage.setItem('service_app_current_user', JSON.stringify(updated));
        return updated;
      });
    }

    const userToSave = updatedUsers.find(u => u.username === username);
    if (userToSave) {
      cloudDataService.saveRecord('Users', userToSave, settings.googleSheetsUrl);
    }

    triggerHapticFeedback('success');
    toast.success(`Admin overrides saved for ${username}`);
  }, [users, currentUser, settings.googleSheetsUrl]);

  const handleUpdateNotificationPreferences = (username: string, prefs: NotificationPreferences) => {
    const updatedUsers = users.map(u => u.username === username ? { ...u, notificationPreferences: prefs } : u);
    setUsers(updatedUsers);
    if (currentUser?.username === username) {
      setCurrentUser(prev => prev ? ({ ...prev, notificationPreferences: prefs }) : null);
    }
    const userToSave = updatedUsers.find(u => u.username === username);
    if (userToSave) cloudDataService.saveRecord('Users', userToSave, settings.googleSheetsUrl);
  };

  // FIX: Added handler for Profit & Loss data updates.
  const handleUpdateProfitLoss = (pl: ProfitLoss) => {
      setProfitLossData(prev => {
          const index = prev.findIndex(p => p.serviceId === pl.serviceId);
          if (index > -1) {
              const updated = [...prev];
              updated[index] = pl;
              return updated;
          }
          return [...prev, pl];
      });
      cloudDataService.saveRecord('ProfitLoss', pl, settings.googleSheetsUrl);
  };

  // FIX: Added handler for predefined cost presets updates.
  const handleUpdatePredefinedCosts = (costs: PredefinedCost[]) => {
      setPredefinedCosts(costs);
      costs.forEach(c => cloudDataService.saveRecord('PredefinedCosts', c, settings.googleSheetsUrl));
  };

  const handleUpdateServiceTemplates = (templates: ServiceTemplate[]) => {
      setServiceTemplates(templates);
      templates.forEach(t => cloudDataService.saveRecord('ServiceTemplates', t, settings.googleSheetsUrl));
  };

  const handleSaveServiceTemplate = (updatedTemplate: ServiceTemplate) => {
      setServiceTemplates(prev => {
          const idx = prev.findIndex(t => t.id === updatedTemplate.id);
          if (idx > -1) {
              const next = [...prev];
              next[idx] = updatedTemplate;
              return next;
          }
          return [...prev, updatedTemplate];
      });
      cloudDataService.saveRecord('ServiceTemplates', updatedTemplate, settings.googleSheetsUrl);
      toast.success(`Saved service template '${updatedTemplate.name}' successfully`);
      setView('SERVICE_TEMPLATE_MANAGEMENT');
      setEditingTemplate(null);
  };

  const handleAssignOrder = useCallback((sid: string, username: string, secondaryAssignee?: string) => {
    const service = submissions.find(s => s.submissionId === sid);
    if (service) {
      const updatedService = { 
        ...service, 
        assignedTo: username, 
        secondaryAssignee: secondaryAssignee || undefined, 
        status: ServiceStatus.Assigned 
      };
      handleCompleteOrder(updatedService);
    }
  }, [submissions, handleCompleteOrder]);

  const handleStartOrder = useCallback((sid: string) => {
    const service = submissions.find(s => s.submissionId === sid);
    if (service) {
      const updatedService = { ...service, status: ServiceStatus.InProgress };
      handleCompleteOrder(updatedService);
    }
  }, [submissions, handleCompleteOrder]);

  const handleSelfAssignOrder = useCallback((sid: string) => {
    if (!currentUser) return;
    const service = submissions.find(s => s.submissionId === sid);
    if (service) {
      const updatedService = { ...service, assignedTo: currentUser.username, status: ServiceStatus.Assigned };
      handleCompleteOrder(updatedService);
    }
  }, [submissions, currentUser, handleCompleteOrder]);

  const handleDeleteOrder = useCallback(async (service: Service, reason?: string, locationStamp?: string, customTimestamp?: string) => {
    const loggerUser = currentUser?.username || 'system';
    const timeIso = customTimestamp || new Date().toISOString();
    const loc = locationStamp || 'Location Stamp Captured';
    const finalReason = reason || service.deletionReason || 'Order Deletion';

    // Restore subscription wash if deleting a subscription order
    if (service.isSubscription) {
      const mobile = String(service.mobileNumber || '').trim();
      if (mobile) {
        const cleanMobile = mobile.replace(/\D/g, '');
        const now = new Date();
        
        const matchedSub = userSubscriptions.find(s => {
          const cleanSubMobile = String(s.mobileNumber || '').replace(/\D/g, '');
          const m1 = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;
          const m2 = cleanSubMobile.length >= 10 ? cleanSubMobile.slice(-10) : cleanSubMobile;
          return m1 === m2 && new Date(s.endDate) > now;
        });

        if (matchedSub) {
          const plan = subscriptionPlans.find(p => p.id === matchedSub.planId);
          const maxWashes = plan ? plan.totalWashes : 100;
          const updatedSub = {
            ...matchedSub,
            washesRemaining: Math.min(maxWashes, matchedSub.washesRemaining + 1)
          };
          
          try {
            await cloudDataService.saveRecord('UserSubscriptions', updatedSub, settings.googleSheetsUrl);
            setUserSubscriptions(prev => prev.map(s => s.id === updatedSub.id ? updatedSub : s));
            toast.info(`Subscription wash restored. Washes remaining: ${updatedSub.washesRemaining}`);
          } catch (err) {
            console.error("❌ Failed to restore subscription wash after deletion:", err);
          }
        }
      }
    }

    const updatedService: Service = {
      ...service,
      isDeleted: true,
      deletionReason: finalReason,
      deletionLoggedBy: loggerUser,
      deletionTimestamp: timeIso,
      deletionLocation: loc
    };

    setSubmissions(prev => prev.map(s => s.submissionId === service.submissionId ? updatedService : s));

    const newAuditLog: AuditLog = {
      id: `audit-del-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      leadId: service.submissionId,
      serviceId: service.submissionId,
      timestamp: timeIso,
      changedBy: loggerUser,
      changeType: 'DELETE',
      oldValue: service.status,
      newValue: 'DELETED',
      notes: `Deleted Order #${service.submissionId}. Logger: ${loggerUser}. Reason: ${finalReason}. Location: ${loc}`,
      locationStamp: loc,
      reason: finalReason
    };

    setAuditLogs(prev => [newAuditLog, ...prev]);

    try {
      await cloudDataService.deleteRecord('Submissions', service.submissionId, settings.googleSheetsUrl);
      await cloudDataService.saveRecord('AuditLogs', newAuditLog, settings.googleSheetsUrl);
      toast.success('Order deleted successfully');
    } catch (err) {
      toast.error('Failed to sync deletion to cloud database, removed locally.');
    }
  }, [settings.googleSheetsUrl, userSubscriptions, subscriptionPlans, currentUser]);

  const handleCancelOrder = useCallback(async (service: Service, reason: string, locationStamp: string, customTimestamp?: string) => {
    const loggerUser = currentUser?.username || 'system';
    const timeIso = customTimestamp || new Date().toISOString();
    const loc = locationStamp || 'Location Stamp Captured';
    const finalReason = reason || 'Order Cancelled';

    const newHistoryEntry = {
      status: ServiceStatus.Cancelled,
      timestamp: timeIso,
      notes: `Order cancelled by ${loggerUser}. Reason: ${finalReason}. Location: ${loc}`,
      updatedBy: loggerUser
    };

    const updatedService: Service = {
      ...service,
      status: ServiceStatus.Cancelled,
      cancellationReason: finalReason,
      cancellationLoggedBy: loggerUser,
      cancellationTimestamp: timeIso,
      cancellationLocation: loc,
      statusHistory: [...(service.statusHistory || []), newHistoryEntry],
      timestamp: timeIso
    };

    setSubmissions(prev => prev.map(s => s.submissionId === service.submissionId ? updatedService : s));

    const newAuditLog: AuditLog = {
      id: `audit-can-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      leadId: service.submissionId,
      serviceId: service.submissionId,
      timestamp: timeIso,
      changedBy: loggerUser,
      changeType: 'CANCEL',
      oldValue: service.status,
      newValue: ServiceStatus.Cancelled,
      notes: `Cancelled Order #${service.submissionId}. Logger: ${loggerUser}. Reason: ${finalReason}. Location: ${loc}`,
      locationStamp: loc,
      reason: finalReason
    };

    setAuditLogs(prev => [newAuditLog, ...prev]);

    try {
      await cloudDataService.saveRecord('Submissions', updatedService, settings.googleSheetsUrl);
      await cloudDataService.saveRecord('AuditLogs', newAuditLog, settings.googleSheetsUrl);
      toast.success(`Order #${service.submissionId} cancelled successfully.`);
    } catch (err) {
      console.error('Failed to sync cancellation to cloud database:', err);
      toast.error('Failed to sync cancellation to cloud database, updated locally.');
    }
  }, [currentUser, settings.googleSheetsUrl]);

  const handleScheduleDroppedOrder = useCallback((sid: string, date: string, assignedTo: string, secondaryAssignee?: string) => {
    const service = submissions.find(s => s.submissionId === sid);
    if (service) {
      const updatedService = { 
        ...service, 
        scheduledDate: toISTDateString(date), 
        assignedTo: assignedTo, 
        secondaryAssignee: secondaryAssignee || undefined, 
        status: ServiceStatus.Assigned 
      };
      handleCompleteOrder(updatedService);
    }
  }, [submissions, handleCompleteOrder]);

  const handleNotifyForOrder = useCallback((sid: string) => {
    toast.success('Notification sent to customer');
  }, []);

  const appContextValue: AppContextType = useMemo(() => ({
    currentUser,
    setCurrentUser,
    settings,
    setSettings,
    syncStatus,
    syncError,
    lastSyncedAt,
    isDataHydrated,
    appIsLoading,
    unreadCount,
    onLogout: handleLogout,
    onRefresh: handleManualRefresh,
  }), [
    currentUser,
    settings,
    syncStatus,
    syncError,
    lastSyncedAt,
    isDataHydrated,
    appIsLoading,
    unreadCount,
    handleLogout,
    handleManualRefresh,
  ]);

  const authContextValue: AuthContextType = useMemo(() => ({
    currentUser,
    setCurrentUser,
    users,
    setUsers,
    loginError,
    setLoginError,
    login: async (username: string, password?: string) => {
      await handleLoginAttempt(username, password);
      return !loginError;
    },
    logout: handleLogout,
    hasPermission: (permission: Permission | string) => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      const rolePerms = authService.getDefaultPermissionsForRole(currentUser.role);
      return rolePerms.includes(permission as Permission);
    },
    updateUsers: handleUpdateUsers,
    updateAttendanceStatus: handleUpdateAttendanceStatus,
    adminOverrideAttendance: handleAdminOverride,
    updateNotificationPreferences: handleUpdateNotificationPreferences,
    isAdmin: currentUser?.role === 'admin',
    isManager: currentUser?.role === 'manager',
    isTechnician: currentUser ? authService.isTechnicianUser(currentUser) : false,
    isAgent: currentUser?.role === 'agent' || currentUser?.agentCategory === 'SALES_AGENT',
    isSalesAgent: currentUser ? authService.isSalesAgentUser(currentUser) : false,
    isAssignable: currentUser ? authService.isAssignableTechnician(currentUser) : false,
  }), [
    currentUser,
    users,
    loginError,
    handleLoginAttempt,
    handleLogout,
    handleUpdateUsers,
    handleUpdateAttendanceStatus,
    handleAdminOverride,
    handleUpdateNotificationPreferences,
  ]);

  const syncContextValue: SyncContextType = useMemo(() => ({
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    lastSyncedAt,
    setLastSyncedAt,
    syncProgress,
    setSyncProgress,
    syncStage,
    setSyncStage,
    syncEntity,
    setSyncEntity,
    isDataHydrated,
    setIsDataHydrated,
    appIsLoading,
    setAppIsLoading,
    isManualRefreshing,
    isPageSyncing,
    isSyncingWebsiteOrders,
    isSyncingMetaLeads,
    isSyncingWhatsAppLeads,
    settings,
    setSettings,
    saveSettings: handleSaveSettings,
    loadAndMergeData,
    handleManualRefresh,
    handleForceCacheClear,
    handlePageSync,
    syncWebsiteOrders: handleSyncWebsiteOrders,
    syncMetaLeads: handleSyncMetaLeads,
    syncWhatsAppLeads: handleSyncWhatsAppLeads,
    syncAllLeads: handleSyncAllLeads,
  }), [
    syncStatus,
    setSyncStatus,
    syncError,
    setSyncError,
    lastSyncedAt,
    setLastSyncedAt,
    syncProgress,
    setSyncProgress,
    syncStage,
    setSyncStage,
    syncEntity,
    setSyncEntity,
    isDataHydrated,
    setIsDataHydrated,
    appIsLoading,
    setAppIsLoading,
    isManualRefreshing,
    isPageSyncing,
    isSyncingWebsiteOrders,
    isSyncingMetaLeads,
    isSyncingWhatsAppLeads,
    settings,
    setSettings,
    handleSaveSettings,
    loadAndMergeData,
    handleManualRefresh,
    handleForceCacheClear,
    handlePageSync,
    handleSyncWebsiteOrders,
    handleSyncMetaLeads,
    handleSyncWhatsAppLeads,
    handleSyncAllLeads,
  ]);

  const activeSubmissions = useMemo(() => submissions.filter(s => !s.isDeleted), [submissions]);

  const orderContextValue: OrderContextType = useMemo(() => ({
    submissions,
    activeSubmissions,
    setSubmissions,
    serviceRequests,
    setServiceRequests,
    editingService,
    setEditingService,
    auditLogs,
    setAuditLogs,
    hasMoreServiceRequests,
    isLoadingMoreServiceRequests,
    createOrder: handleCreateOrder,
    completeOrder: handleCompleteOrder,
    editService: handleEditService,
    assignOrder: handleAssignOrder,
    startOrder: handleStartOrder,
    selfAssignOrder: handleSelfAssignOrder,
    deleteOrder: handleDeleteOrder,
    cancelOrder: handleCancelOrder,
    scheduleDroppedOrder: handleScheduleDroppedOrder,
    rebookOrder: handleRebookOrder,
    bookServiceFromReminder: handleBookServiceFromReminder,
    convertLeadToService: handleConvertLeadToService,
    captureLead: handleCaptureLead,
    updateServiceRequest: handleUpdateServiceRequest,
    loadMoreServiceRequests: handleLoadMoreServiceRequests,
    notifyForOrder: handleNotifyForOrder,
  }), [
    submissions,
    activeSubmissions,
    serviceRequests,
    editingService,
    auditLogs,
    hasMoreServiceRequests,
    isLoadingMoreServiceRequests,
    handleCreateOrder,
    handleCompleteOrder,
    handleEditService,
    handleAssignOrder,
    handleStartOrder,
    handleSelfAssignOrder,
    handleDeleteOrder,
    handleCancelOrder,
    handleScheduleDroppedOrder,
    handleRebookOrder,
    handleBookServiceFromReminder,
    handleConvertLeadToService,
    handleCaptureLead,
    handleUpdateServiceRequest,
    handleLoadMoreServiceRequests,
    handleNotifyForOrder,
  ]);

  const inventoryContextValue: InventoryContextType = useMemo(() => ({
    inventoryItems,
    setInventoryItems,
    inventoryMovements,
    setInventoryMovements,
    addInventoryItem: handleAddInventoryItem,
    updateInventoryItem: handleUpdateInventoryItem,
    deleteInventoryItem: handleDeleteInventoryItem,
    recordMovement: async (movement: InventoryMovement) => {
      setInventoryMovements(prev => [movement, ...prev]);
      try {
        await cloudDataService.saveRecord('InventoryMovements', movement, settings.googleSheetsUrl);
      } catch (e) {
        console.error('Failed to save inventory movement:', e);
      }
    },
    depleteInventoryForCompletedService: async (service: Service, predefinedServicesList?: any[]) => {
      return inventoryService.depleteInventoryForCompletedService(
        service,
        predefinedServicesList || predefinedServices,
        inventoryItems,
        async (sheetName, record) => {
          return cloudDataService.saveRecord(sheetName, record, settings.googleSheetsUrl);
        }
      ).then(({ updatedItems, movements }) => {
        if (movements.length > 0) {
          setInventoryItems(updatedItems);
          setInventoryMovements(prev => [...movements, ...prev]);
        }
        return { updatedItems, movements };
      });
    },
  }), [
    inventoryItems,
    inventoryMovements,
    handleAddInventoryItem,
    handleUpdateInventoryItem,
    handleDeleteInventoryItem,
    predefinedServices,
    settings.googleSheetsUrl,
  ]);

  if (trackingId) {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <ClientServiceTracker 
          trackingId={trackingId} 
          settings={settings} 
          onBackToApp={handleClearTracking} 
        />
      </React.Suspense>
    );
  }
  if (publicService) return <PublicServiceSummary serviceData={publicService.data} logoUrl={settings.customLogoUrl} />;
  if (appIsLoading) return <LoadingScreen />;
  if (!currentUser) return <LoginPage onLoginAttempt={handleLoginAttempt} error={loginError} />;

  if (printingService) {
    return (
      <React.Suspense fallback={<LoadingScreen />}>
        <PrintPreview service={printingService} onClose={() => setPrintingService(null)} serviceTemplates={serviceTemplates} />
      </React.Suspense>
    );
  }

  const appData = {
    isHydrated: isDataHydrated,
    isLoading: !isDataHydrated,
    submissions,
    users,
    settings,
    subscriptionPlans,
    userSubscriptions,
    serviceTemplates,
    serviceRequests,
    notifications,
    locationHistory,
    miscSpends: [],
    bookkeeping: [],
    profitLoss: profitLossData,
    businessOverheads: [],
    spendCategories: spendCategories,
    expenses,
    recurringExpenses,
    predefinedCosts,
    predefinedAddons: [],
    vehicleData,
    tyreData,
    pricingConfig: DEFAULT_PRICING_CONFIG,
    predefinedServiceCategories,
    predefinedServices,
    deliveryHubs,
    productRules,
    customerBook,
    inventoryItems,
    inventoryMovements,
    warranties
  };

  const dashboardProps = { 
    isHydrated: isDataHydrated,
    isLoading: !isDataHydrated,
    submissions: submissions.filter(s => !s.isDeleted), 
    users, 
    currentUser, 
    onCreateOrder: handleCreateOrder, 
    onAssignOrder: handleAssignOrder, 
    onStartOrder: handleStartOrder, 
    onUpdateOrder: handleEditService, 
    onCompleteOrder: handleCompleteOrder,
    onSelfAssignOrder: handleSelfAssignOrder, 
    onDeleteOrder: (service: Service) => setDeletingService(service), 
    onCancelOrder: (service: Service) => setCancelingService(service),
    onScheduleDroppedOrder: handleScheduleDroppedOrder, 
    onNotifyForOrder: handleNotifyForOrder, 
    onUpdateAttendanceStatus: handleUpdateAttendanceStatus, 
    userSubscriptions, 
    subscriptionPlans,
    serviceTemplates, 
    setIsChatbotOpen, 
    settings, 
    locationHistory, 
    vehicleData, 
    carDatabase,
    tyreData, 
    onShareOrder: (s: Service) => setSharingService(s),
    deliveryHubs,
    productRules,
    predefinedServices,
    predefinedServiceCategories,
    inventoryItems,
    serviceRequests,
    auditLogs,
    inventoryMovements,
    isSyncingWebsiteOrders,
    onSyncWebsiteOrders: handleSyncWebsiteOrders,
    onConvertLeadToService: handleConvertLeadToService,
    onCaptureLead: handleCaptureLead,
    onUpdateServiceRequest: handleUpdateServiceRequest,
    customerBook,
    onRefresh: handleManualRefresh,
  };

  return (
    <AppProvider value={appContextValue}>
      <AuthProvider value={authContextValue}>
        <SyncProvider value={syncContextValue}>
          <OrderProvider value={orderContextValue}>
            <InventoryProvider value={inventoryContextValue}>
              <div className="min-h-screen bg-slate-100 flex">
                <Toaster position="top-right" richColors />
                <SyncProgressBar progress={syncProgress} stage={syncStage} entity={syncEntity} />
                
                <AppModalHost
                  summarizingService={summarizingService}
                  onCloseSummary={closeSummaryModal}
                  sharingService={sharingService}
                  onCloseShare={closeShareModal}
                  deletingService={deletingService}
                  onCloseDelete={closeDeleteModal}
                  onConfirmDelete={(service, reason, loc, ts) => {
                    handleDeleteOrder(service, reason, loc, ts);
                    closeDeleteModal();
                  }}
                  cancelingService={cancelingService}
                  onCloseCancel={closeCancelModal}
                  onConfirmCancel={(service, reason, loc, ts) => {
                    handleCancelOrder(service, reason, loc, ts);
                    closeCancelModal();
                  }}
                  isDiagnosticOverlayOpen={isDiagnosticOverlayOpen}
                  onCloseDiagnostic={closeDiagnosticOverlay}
                  googleSheetsUrl={settings.googleSheetsUrl}
                  currentUser={currentUser}
                  isChatbotOpen={isChatbotOpen}
                  onCloseChatbot={() => setIsChatbotOpen(false)}
                  onSubmitChatbot={handleCreateOrder}
                  serviceTemplates={serviceTemplates}
                />

                <NewOrderAlertModal
                  isOpen={isNewOrderAlertOpen}
                  orders={newOrdersAlertQueue}
                  onClose={() => setIsNewOrderAlertOpen(false)}
                  onViewOrder={(order) => {
                    setIsNewOrderAlertOpen(false);
                    handleEditService(order);
                  }}
                  onAssignOrder={(order) => {
                    setIsNewOrderAlertOpen(false);
                    handleAssignOrder(order.submissionId, '');
                  }}
                />
        
        <Sidebar 
          currentUser={currentUser} 
          currentView={view} 
          onNavigate={handleNavigate} 
          onNewService={() => handleEditService(null)} 
          onOpenSettings={() => setView('SETTINGS')} 
          onLogout={handleLogout} 
          logoUrl={settings.customLogoUrl} 
          logoHasError={logoHasError} 
          onLogoError={() => setLogoHasError(true)} 
          isMinimized={isSidebarMinimized} 
          isOpenOnMobile={isMobileMenuOpen} 
          onToggleDesktop={toggleSidebar} 
          onCloseMobile={closeMobileMenu} 
          onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
          onOpenDesktopInstall={() => setIsDesktopInstallModalOpen(true)}
        />
      
      <div className={`flex-1 transition-all duration-300 ${isSidebarMinimized ? 'md:pl-20' : 'md:pl-64'}`}>
          <PWAInstallBanner onOpenModal={() => setIsDesktopInstallModalOpen(true)} />
          <header 
            className="sticky top-0 bg-slate-900/95 text-slate-100 backdrop-blur-xl z-30 border-b border-slate-800/80 shadow-md no-print safe-top pwa-window-titlebar"
          >
              <div className="relative flex items-center justify-between min-h-14 sm:min-h-16 px-3 sm:px-4 md:px-6 py-2">
                  <div className="flex items-center gap-2 sm:gap-3">
                      <button 
                        className="md:hidden p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center" 
                        onClick={() => setIsMobileMenuOpen(true)}
                        aria-label="Toggle navigation menu"
                      >
                        <IconMenu2 className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>

                      <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 sm:h-2.5 sm:w-2.5 relative flex-shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-full w-full bg-emerald-500"></span>
                          </span>
                          <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-slate-200 bg-slate-800/80 border border-slate-700/60 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg truncate max-w-[130px] sm:max-w-none">
                              {view.replace(/_/g, ' ')}
                          </span>
                      </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 flex-shrink-0">
                      <div className="hidden sm:block">
                        <RealTimeClock />
                      </div>
                      
                      <div className="relative">
                          <NotificationBell unreadCount={unreadCount} onClick={() => setIsNotificationHistoryOpen(prev => !prev)} />
                          {isNotificationHistoryOpen && (
                              <React.Suspense fallback={null}>
                                <NotificationHistory
                                    notifications={currentUserNotifications}
                                    onMarkAsRead={(id) => {
                                        const found = currentUserNotifications.find(n => n.id === id);
                                        if (found) handleUpdateNotification({ ...found, isRead: true });
                                    }}
                                    onMarkAllAsRead={async () => {
                                        const unreads = currentUserNotifications.filter(item => !item.isRead);
                                        for (const n of unreads) {
                                            await handleUpdateNotification({ ...n, isRead: true });
                                        }
                                        setIsNotificationHistoryOpen(false);
                                        toast.success('All notifications marked as read');
                                    }}
                                    onViewAll={() => {
                                        setView('NOTIFICATIONS');
                                        setIsNotificationHistoryOpen(false);
                                    }}
                                    onClose={() => setIsNotificationHistoryOpen(false)}
                                />
                              </React.Suspense>
                          )}
                      </div>

                      <button 
                          onClick={handleManualRefresh} 
                          className="p-2 sm:p-2.5 bg-slate-800/90 border border-slate-700/70 text-slate-300 hover:text-white hover:bg-slate-700/80 hover:border-slate-600 rounded-xl transition-all shadow-xs group active:scale-95"
                          title="Manual Sync / Refresh Data"
                      >
                          <IconRefresh className={`w-4 h-4 sm:w-5 sm:h-5 ${isManualRefreshing ? 'animate-spin text-brand-accent' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                      </button>

                      {isNeonSoleMode && (
                          <div 
                              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-950/90 to-teal-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-xs cursor-help select-none"
                              title="Operating 100% via Render Backend & Neon PostgreSQL (Single Source of Truth). Google Sheets & Apps Script are bypassed."
                          >
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              <span>Neon SSOT Active</span>
                          </div>
                      )}

                      <DesktopInstallButton onOpenModal={() => setIsDesktopInstallModalOpen(true)} />

                      <SyncStatusIndicator
                          status={syncStatus}
                          errorMessage={syncError}
                          lastSyncedAt={lastSyncedAt}
                          onForceCacheClear={handleForceCacheClear}
                          onRefresh={handleManualRefresh}
                          onOpenDiagnostics={() => setIsDiagnosticOverlayOpen(true)}
                      />

                      {currentUser && (
                          <div 
                              onClick={() => setIsChangePasswordModalOpen(true)}
                              className="hidden md:flex items-center gap-2.5 pl-2.5 border-l border-slate-800 cursor-pointer group hover:opacity-90 transition-opacity"
                              title="Click to Change Password"
                          >
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-blue to-blue-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs border border-blue-400/30 group-hover:ring-2 group-hover:ring-brand-accent/50 transition-all">
                                  {currentUser.username ? currentUser.username.charAt(0).toUpperCase() : 'A'}
                              </div>
                              <div className="hidden lg:block text-left leading-tight">
                                  <div className="text-xs font-bold text-slate-100 truncate max-w-[120px] flex items-center gap-1">
                                      <span>{currentUser.username}</span>
                                      <IconKey className="w-3 h-3 text-brand-accent opacity-60 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 capitalize">{currentUser.role || 'Staff'}</div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </header>
          <main className="p-3 sm:p-6 lg:p-8 w-full max-w-full overflow-x-hidden pb-24 md:pb-8">
            <AppRouter
              view={view}
              setView={setView}
              loadedViews={loadedViews}
              serviceTemplates={serviceTemplates}
              onUpdateServiceTemplates={handleUpdateServiceTemplates}
              editingTemplate={editingTemplate}
              setEditingTemplate={setEditingTemplate}
              onSaveServiceTemplate={handleSaveServiceTemplate}
              subscriptionPlans={subscriptionPlans}
              onUpdatePlans={handleUpdatePlans}
              userSubscriptions={userSubscriptions}
              onUpdateUserSubscriptions={handleUpdateSubs}
              onUpdatePricing={handleUpdatePricing}
              profitLossData={profitLossData}
              onUpdateProfitLoss={handleUpdateProfitLoss}
              predefinedCosts={predefinedCosts}
              onUpdatePredefinedCosts={handleUpdatePredefinedCosts}
              carDatabase={carDatabase}
              onUpdateCarDatabase={handleUpdateCarDatabase}
              warranties={warranties}
              onUpdateWarranties={handleUpdateWarranties}
              expenses={expenses}
              recurringExpenses={recurringExpenses}
              spendCategories={spendCategories}
              customerBook={customerBook}
              deliveryHubs={deliveryHubs}
              productRules={productRules}
              predefinedServices={predefinedServices}
              predefinedServiceCategories={predefinedServiceCategories}
              vehicleData={vehicleData}
              tyreData={tyreData}
              locationHistory={locationHistory}
              retentionLogs={retentionLogs}
              onSaveRetentionLog={handleSaveRetentionLog}
              onUpdateKpiTargets={handleUpdateKpiTargets}
              notifications={notifications}
              onUpdateNotification={handleUpdateNotification}
              syncPerformanceStats={syncPerformanceStats}
              appData={appData}
              onSetPrintingService={setPrintingService}
              onSetSummarizingService={setSummarizingService}
              onSetSharingService={setSharingService}
              onSetDeletingService={setDeletingService}
              onSetCancelingService={setCancelingService}
              onSetIsChatbotOpen={setIsChatbotOpen}
              onUpdatePredefinedService={handleUpdatePredefinedService}
              onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
            />
          </main>
      </div>

      {currentUser && (
        <>
          <MobileBottomNav
            currentUser={currentUser}
            currentView={view}
            onNavigate={handleNavigate}
            onNewService={() => handleEditService(null)}
            onOpenMobileMenu={() => openMobileMenu()}
            unreadCount={unreadCount}
          />
          <ChangePasswordModal
            isOpen={isChangePasswordModalOpen}
            onClose={() => setIsChangePasswordModalOpen(false)}
            currentUser={currentUser}
            allUsers={users}
            onUpdateUsers={handleUpdateUsers}
          />
          <DesktopInstallModal
            isOpen={isDesktopInstallModalOpen}
            onClose={() => setIsDesktopInstallModalOpen(false)}
            onPrecacheAll={async () => {
              await loadAndMergeData(false, true);
            }}
          />
        </>
      )}
              </div>
            </InventoryProvider>
          </OrderProvider>
        </SyncProvider>
      </AuthProvider>
    </AppProvider>
  );
};
