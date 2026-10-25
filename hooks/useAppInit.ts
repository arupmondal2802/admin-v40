import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  AppData, 
  User, 
  Settings, 
  Service, 
  ServiceStatus, 
  SubscriptionPlan, 
  UserSubscription, 
  ServiceTemplate, 
  ServiceRequest, 
  AppNotification, 
  NotificationPreferences, 
  LocationHistory, 
  RetentionKpiTargets, 
  TyreData, 
  ProfitLoss, 
  SpendCategory, 
  PredefinedCost, 
  ExpenseItem, 
  RecurringExpense,
  WarrantyRecord,
  RetentionActivityLog,
  InventoryItem,
  InventoryMovement,
  AuditLog,
  Permission,
  CarDatabaseItem
} from '../types';
import * as cloudDataService from '../services/cloudDataService';
import { robustParseFloat, robustParseInt } from '../services/cloudDataService';
import { dataSyncManager } from '../services/dataSyncManager';
import { Network } from '@capacitor/network';
import * as authService from '../services/authService';
import * as inventoryService from '../services/inventoryService';
import { migrateAllToIndexedDb, getIndexedDbItem } from '../services/indexedDbService';
import { CAR_BRANDS, TIRE_BRANDS } from '../data/vehicleData';
import { getCategoryForVehicle } from '../services/vehicleService';
import { SyncStatus } from '../components/ui/SyncStatusIndicator';

export const PERMANENT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyPuNQGgUfJnpcV_dCFs-2ppA6bdYW6bKr-2sTnPI1d6Ww_yjDA0q8fc6PpiY2wZncl/exec';
export const PERMANENT_DRIVE_URL = 'https://script.google.com/macros/s/AKfycbyb35rxNPeDoa4LsEtjdlbMy33a6MEJAlUKKB27aTPfIZd97MgEP-roZ6MRLSXxOMGj/exec';

export const DEFAULT_SERVICE_TEMPLATES: ServiceTemplate[] = [
  { id: 'core_car_washing', name: 'Car Washing', isEnabled: true, customFields: [] },
  { id: 'core_tyre_replacement', name: 'Tyre Replacement', isEnabled: true, customFields: [] },
  { id: 'core_battery_replacement', name: 'Battery Replacement', isEnabled: true, customFields: [] },
  { id: 'core_car_care', name: 'Car Care', isEnabled: true, customFields: [] },
];

export const defaultNotificationPrefs: NotificationPreferences = {
  enabled: { assigned: false, reminder: false, queued: false, completed: false, manual: false, overdue: false },
  sound: 'none',
  vibration: false,
  consentGranted: false,
  priorityOnly: false,
  maxDailyAlerts: 15,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
};

export const defaultKpiTargets: RetentionKpiTargets = {
  monthlyFollowUps: 20,
  conversionRatePercentage: 50,
  monthlyRevenue: 15000,
};

export const getSanitizedSettingsUrls = (rawSheetsUrl?: string | null, rawDriveUrl?: string | null) => {
  let googleSheetsUrl = rawSheetsUrl?.trim() || PERMANENT_SHEET_URL;
  if (googleSheetsUrl === PERMANENT_DRIVE_URL) {
    googleSheetsUrl = PERMANENT_SHEET_URL;
  }

  let googleDriveUploadUrl = rawDriveUrl?.trim() || PERMANENT_DRIVE_URL;
  if (googleDriveUploadUrl === googleSheetsUrl || googleDriveUploadUrl === PERMANENT_SHEET_URL) {
    googleDriveUploadUrl = PERMANENT_DRIVE_URL;
  }

  return { googleSheetsUrl, googleDriveUploadUrl };
};

export const mergeWithDefaultPrefs = (prefs?: Partial<NotificationPreferences>): NotificationPreferences => {
  const isConsent = prefs?.consentGranted === true;
  return {
    ...defaultNotificationPrefs,
    ...(prefs || {}),
    consentGranted: isConsent,
    enabled: {
      assigned: isConsent ? Boolean(prefs?.enabled?.assigned) : false,
      reminder: isConsent ? Boolean(prefs?.enabled?.reminder) : false,
      queued: isConsent ? Boolean(prefs?.enabled?.queued) : false,
      completed: isConsent ? Boolean(prefs?.enabled?.completed) : false,
      manual: isConsent ? Boolean(prefs?.enabled?.manual) : false,
      overdue: isConsent ? Boolean(prefs?.enabled?.overdue) : false,
    },
    sound: isConsent ? (prefs?.sound || 'default') : 'none',
    vibration: isConsent ? (prefs?.vibration ?? true) : false,
    consentTimestamp: prefs?.consentTimestamp,
    consentGrantedBy: prefs?.consentGrantedBy,
    priorityOnly: isConsent ? Boolean(prefs?.priorityOnly) : false,
    maxDailyAlerts: isConsent ? (prefs?.maxDailyAlerts ?? 15) : 15,
    quietHoursEnabled: isConsent ? Boolean(prefs?.quietHoursEnabled) : false,
    quietHoursStart: prefs?.quietHoursStart || '22:00',
    quietHoursEnd: prefs?.quietHoursEnd || '07:00',
  };
};

export const mergeSubmissions = (cloudSubs: Service[], localSubs: Service[]): Service[] => {
  const safeCloud = Array.isArray(cloudSubs) ? cloudSubs : [];
  const safeLocal = Array.isArray(localSubs) ? localSubs : [];
  const submissionMap = new Map<string, Service>();
  for (const sub of safeCloud) {
    if (sub && sub.submissionId) submissionMap.set(sub.submissionId, sub);
  }
  for (const sub of safeLocal) {
    if (!sub || !sub.submissionId) continue;
    const existing = submissionMap.get(sub.submissionId);
    if (!existing || new Date(sub.timestamp) > new Date(existing.timestamp)) submissionMap.set(sub.submissionId, sub);
  }
  return Array.from(submissionMap.values());
};

const safeParseArray = <T = any>(val: any): T[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed as T];
    } catch {
      // not valid json, ignore
    }
  } else if (val && typeof val === 'object') {
    // Single object mistakenly passed instead of an array of objects
    return [val as T];
  }
  return [];
};

export const cleanSubmissionsArray = (submissions: Service[]): Service[] => {
  if (!Array.isArray(submissions)) return [];
  return submissions.map(sub => {
    if (!sub || typeof sub !== 'object') return sub;
    const cleanedSub = { ...sub };
    let finalStatus = cleanedSub.status;
    const validStatuses = Object.values(ServiceStatus);
    if ((finalStatus as any) === 'Submitted') finalStatus = ServiceStatus.Completed;
    else if ((finalStatus as any) === 'Order Created') finalStatus = ServiceStatus.Queued;
    if (!finalStatus || !validStatuses.includes(finalStatus as ServiceStatus)) finalStatus = ServiceStatus.Queued;
    if (cleanedSub.carwashTotalAmount && !cleanedSub.carWashDetails) {
      cleanedSub.vehicleCategoryTag = getCategoryForVehicle(cleanedSub.carBrandModel);
      cleanedSub.carWashDetails = { washType: 'Basic Wash', price: robustParseFloat(cleanedSub.carwashTotalAmount), mrp: robustParseFloat(cleanedSub.carwashTotalAmount) * 1.5 };
    }
    if (cleanedSub.carCareTotalAmount && !cleanedSub.carCareDetails) {
      cleanedSub.vehicleCategoryTag = getCategoryForVehicle(cleanedSub.carBrandModel);
      cleanedSub.carCareDetails = { careType: 'Legacy Package', price: robustParseFloat(cleanedSub.carCareTotalAmount), mrp: robustParseFloat(cleanedSub.carCareTotalAmount) * 1.5 };
    }

    const safeBatteryDetails = safeParseArray(cleanedSub.batteryDetails).map((bd: any) => {
      if (!bd || typeof bd !== 'object') return { batteryId: `B-${Date.now()}`, serialNumber: '', brand: '', exchangeValue: 0, newBatteryAmount: 0 };
      return {
        ...bd,
        exchangeValue: robustParseFloat(bd.exchangeValue),
        newBatteryAmount: robustParseFloat(bd.newBatteryAmount)
      };
    });

    const safeCustomServices = safeParseArray(cleanedSub.customServices).map((cs: any) => {
      if (!cs || typeof cs !== 'object') return { serviceId: `CS-${Date.now()}`, serviceName: '', amount: 0 };
      return {
        ...cs,
        amount: robustParseFloat(cs.amount)
      };
    });

    const safeTyreDetails = safeParseArray(cleanedSub.tyreDetails).map((td: any) => {
      if (!td || typeof td !== 'object') return td;
      return {
        ...td,
        pricePerTyre: td.pricePerTyre !== undefined ? robustParseFloat(td.pricePerTyre) : undefined,
        balancingPrice: td.balancingPrice !== undefined ? robustParseFloat(td.balancingPrice) : undefined
      };
    });

    const safeCategorizedAddons = safeParseArray(cleanedSub.categorizedAddons).map((ca: any) => {
      if (!ca || typeof ca !== 'object') return ca;
      return {
        ...ca,
        quantity: robustParseInt(ca.quantity),
        amount: robustParseFloat(ca.amount)
      };
    });

    const safeDynamicAddons = safeParseArray(cleanedSub.dynamicAddons);
    const safeCustomFieldData = safeParseArray(cleanedSub.customFieldData);

    let safeDependsOn: string[] = [];
    const rawDepends = cleanedSub.dependsOn as any;
    if (Array.isArray(rawDepends)) {
      safeDependsOn = rawDepends.map(String);
    } else if (typeof rawDepends === 'string' && rawDepends.trim()) {
      try {
        const parsed = JSON.parse(rawDepends);
        if (Array.isArray(parsed)) safeDependsOn = parsed.map(String);
        else safeDependsOn = rawDepends.split(',').map((s: string) => s.trim()).filter(Boolean);
      } catch {
        safeDependsOn = rawDepends.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    }

    return {
      ...cleanedSub,
      status: finalStatus,
      dynamicAddons: safeDynamicAddons,
      categorizedAddons: safeCategorizedAddons,
      customFieldData: safeCustomFieldData,
      dependsOn: safeDependsOn,
      tyreDetails: safeTyreDetails,
      grandTotal: robustParseFloat(cleanedSub.grandTotal),
      tyreReplacementTotalAmount: robustParseFloat(cleanedSub.tyreReplacementTotalAmount),
      tyreReplacementPrice: robustParseFloat(cleanedSub.tyreReplacementPrice),
      tyreReplacementQuantity: robustParseInt(cleanedSub.tyreReplacementQuantity),
      batteryReplacementTotalAmount: robustParseFloat(cleanedSub.batteryReplacementTotalAmount),
      batteryReplacementQuantity: robustParseInt(cleanedSub.batteryReplacementQuantity),
      addonsTotal: robustParseFloat(cleanedSub.addonsTotal),
      categorizedAddonsTotal: robustParseFloat(cleanedSub.categorizedAddonsTotal),
      customServicesTotal: robustParseFloat(cleanedSub.customServicesTotal),
      batteryDetails: safeBatteryDetails,
      customServices: safeCustomServices,
      internalNotes: cleanedSub.internalNotes || '',
      isFollowUp: cleanedSub.isFollowUp || false,
      appointmentId: cleanedSub.appointmentId || cleanedSub.submissionId
    };
  });
};

export interface UseAppInitProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  currentUser: User | null;
  setSubmissions: React.Dispatch<React.SetStateAction<Service[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setSubscriptionPlans: React.Dispatch<React.SetStateAction<SubscriptionPlan[]>>;
  setUserSubscriptions: React.Dispatch<React.SetStateAction<UserSubscription[]>>;
  setServiceTemplates: React.Dispatch<React.SetStateAction<ServiceTemplate[]>>;
  setServiceRequests: React.Dispatch<React.SetStateAction<ServiceRequest[]>>;
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  setNotifications: React.Dispatch<React.SetStateAction<AppNotification[]>>;
  setLocationHistory: React.Dispatch<React.SetStateAction<LocationHistory[]>>;
  setProfitLossData: React.Dispatch<React.SetStateAction<ProfitLoss[]>>;
  setPredefinedCosts: React.Dispatch<React.SetStateAction<PredefinedCost[]>>;
  setVehicleData: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setCarDatabase?: React.Dispatch<React.SetStateAction<CarDatabaseItem[]>>;
  setTyreData: React.Dispatch<React.SetStateAction<TyreData>>;
  setDeliveryHubs: React.Dispatch<React.SetStateAction<any[]>>;
  setProductRules: React.Dispatch<React.SetStateAction<any[]>>;
  setPredefinedServices: React.Dispatch<React.SetStateAction<any[]>>;
  setPredefinedServiceCategories: React.Dispatch<React.SetStateAction<any[]>>;
  setCustomerBook: React.Dispatch<React.SetStateAction<any[]>>;
  setExpenses: React.Dispatch<React.SetStateAction<ExpenseItem[]>>;
  setRecurringExpenses: React.Dispatch<React.SetStateAction<RecurringExpense[]>>;
  setSpendCategories: React.Dispatch<React.SetStateAction<SpendCategory[]>>;
  setWarranties: React.Dispatch<React.SetStateAction<WarrantyRecord[]>>;
  setRetentionLogs: React.Dispatch<React.SetStateAction<RetentionActivityLog[]>>;
  setInventoryItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  setInventoryMovements: React.Dispatch<React.SetStateAction<InventoryMovement[]>>;
  onAfterLoadTriggers?: (submissions: Service[], notifications: AppNotification[]) => void;
}

export interface UseAppInitReturn {
  appIsLoading: boolean;
  setAppIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isDataHydrated: boolean;
  setIsDataHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  syncStatus: SyncStatus;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  syncError: string | null;
  setSyncError: React.Dispatch<React.SetStateAction<string | null>>;
  lastSyncedAt: Date | null;
  setLastSyncedAt: React.Dispatch<React.SetStateAction<Date | null>>;
  syncProgress: number | null;
  setSyncProgress: React.Dispatch<React.SetStateAction<number | null>>;
  syncStage: string | null;
  setSyncStage: React.Dispatch<React.SetStateAction<string | null>>;
  syncEntity: string | null;
  setSyncEntity: React.Dispatch<React.SetStateAction<string | null>>;
  trackingId: string | null;
  setTrackingId: React.Dispatch<React.SetStateAction<string | null>>;
  handleClearTracking: () => void;
  loadAndMergeData: (isInitial?: boolean, forceRefresh?: boolean) => Promise<boolean>;
}

export function useAppInit(props: UseAppInitProps): UseAppInitReturn {
  const {
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
    onAfterLoadTriggers
  } = props;

  const [appIsLoading, setAppIsLoading] = useState(true);
  const [isDataHydrated, setIsDataHydrated] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('OFFLINE');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('service_app_last_synced_at') : null;
    return saved ? new Date(saved) : new Date();
  });
  const [syncProgress, setSyncProgress] = useState<number | null>(null);
  const [syncStage, setSyncStage] = useState<string | null>(null);
  const [syncEntity, setSyncEntity] = useState<string | null>(null);

  const isInitialLoad = useRef(true);

  // Tracking query param detection
  const [trackingId, setTrackingId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('track') || params.get('orderId') || params.get('tracking') || params.get('submissionId');
  });

  useEffect(() => {
    const checkTrackingUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tid = params.get('track') || params.get('orderId') || params.get('tracking') || params.get('submissionId');
      if (tid && tid !== trackingId) {
        setTrackingId(tid);
      }
    };
    window.addEventListener('popstate', checkTrackingUrl);
    return () => window.removeEventListener('popstate', checkTrackingUrl);
  }, [trackingId]);

  const handleClearTracking = useCallback(() => {
    setTrackingId(null);
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('track');
      url.searchParams.delete('orderId');
      url.searchParams.delete('tracking');
      url.searchParams.delete('submissionId');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const loadAndMergeData = useCallback(async (isInitial: boolean = false, forceRefresh: boolean = false): Promise<boolean> => {
    if (isInitial) {
      setAppIsLoading(true);
      setIsDataHydrated(false);
      try {
        await migrateAllToIndexedDb();
        // Background auto-prune of audit logs older than 90 days if enabled
        cloudDataService.runStartupAuditLogPrune().catch(e => console.warn('Auto-prune startup notice:', e));
      } catch (migErr) {
        console.error("❌ [Migration] One-time storage migration encountered an issue:", migErr);
      }
    }
    setSyncError(null);
    setSyncStatus('SYNCING');
    const currentSyncUrls = getSanitizedSettingsUrls(
      localStorage.getItem('googleSheetsUrl'),
      localStorage.getItem('googleDriveUploadUrl')
    );
    const persistedSettings: Settings = { 
      googleSheetsUrl: currentSyncUrls.googleSheetsUrl, 
      googleDriveUploadUrl: currentSyncUrls.googleDriveUploadUrl, 
      customLogoUrl: localStorage.getItem('customLogoUrl') || '', 
      retentionKpiTargets: JSON.parse(localStorage.getItem('retentionKpiTargets') || 'null') || defaultKpiTargets,
      googleMapsApiKey: localStorage.getItem('googleMapsApiKey') || 'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M',
      hubLatitude: parseFloat(localStorage.getItem('hubLatitude') || '22.572646'),
      hubLongitude: parseFloat(localStorage.getItem('hubLongitude') || '88.363895'),
      maxDistanceKm: parseFloat(localStorage.getItem('maxDistanceKm') || '20'),
      syncFrequency: (localStorage.getItem('syncFrequency') || 'manual') as any
    };

    try {
      const cloudData = await cloudDataService.loadAppData(persistedSettings, forceRefresh);
      
      console.log("🔍 [Diagnostic Utility] Raw Google Sheets / Cloud Data response from loadAppData:", {
        endpoint: PERMANENT_SHEET_URL,
        timestamp: new Date().toISOString(),
        isInitial,
        forceRefresh,
        rawCloudData: cloudData,
        structureValidation: {
          hasUsers: Array.isArray(cloudData?.users),
          usersCount: cloudData?.users?.length ?? 0,
          hasSubmissions: Array.isArray(cloudData?.submissions),
          submissionsCount: cloudData?.submissions?.length ?? 0,
          hasServiceRequests: Array.isArray(cloudData?.serviceRequests),
          serviceRequestsCount: cloudData?.serviceRequests?.length ?? 0,
          hasSubscriptionPlans: Array.isArray(cloudData?.subscriptionPlans),
          hasUserSubscriptions: Array.isArray(cloudData?.userSubscriptions),
          hasSettings: !!cloudData?.settings,
          isValidExpectedStructure: !!(
            cloudData && 
            Array.isArray(cloudData.users) && 
            Array.isArray(cloudData.submissions) && 
            Array.isArray(cloudData.serviceRequests)
          )
        }
      });

      let usersToSet = Array.isArray(cloudData?.users) ? cloudData.users : [];
      const cloudSubmissions = Array.isArray(cloudData?.submissions) ? cloudData.submissions : [];
      if (usersToSet.length === 0 && cloudSubmissions.length === 0) {
        const defaultAdmin: User = { 
          username: 'admin', 
          password: 'admin@123', 
          role: 'admin', 
          notificationPreferences: defaultNotificationPrefs, 
          permissions: authService.getDefaultPermissionsForRole('admin'), 
          attendanceStatus: 'CHECKED_OUT', 
          attendanceHistory: [] 
        };
        usersToSet = [defaultAdmin];
        cloudDataService.saveRecord('Users', defaultAdmin, PERMANENT_SHEET_URL);
      }
      usersToSet = usersToSet.map(user => {
        const finalUser = { ...user };
        let needsSave = false;
        if (!finalUser.notificationPreferences) { finalUser.notificationPreferences = mergeWithDefaultPrefs(); needsSave = true; }
        if (!finalUser.attendanceStatus) { finalUser.attendanceStatus = 'CHECKED_OUT'; needsSave = true; }
        if (!finalUser.permissions || finalUser.permissions.length === 0) { finalUser.permissions = authService.getDefaultPermissionsForRole(finalUser.role); needsSave = true; }
        
        // CRITICAL: Ensure Admin/Manager roles have the Pricing permission in the database
        if ((finalUser.role === 'admin' || finalUser.role === 'manager') && !finalUser.permissions.includes(Permission.CAN_MANAGE_PRICING)) {
          finalUser.permissions = [...new Set([...finalUser.permissions, Permission.CAN_MANAGE_PRICING, Permission.CAN_MANAGE_PLANS, Permission.CAN_MANAGE_SUBSCRIPTIONS])];
          needsSave = true;
        }

        if (needsSave) cloudDataService.saveRecord('Users', finalUser, PERMANENT_SHEET_URL);
        return finalUser;
      });

      const rawLocalSubmissions = await getIndexedDbItem<Service[]>('service_app_submissions', []);
      const cleanedLocalSubmissions = cleanSubmissionsArray(rawLocalSubmissions);
      const mergedSubmissions = mergeSubmissions(cleanSubmissionsArray(cloudSubmissions), cleanedLocalSubmissions);
      setSubmissions(mergedSubmissions);
      setUsers(usersToSet);
      const mergedUrls = getSanitizedSettingsUrls(
        localStorage.getItem('googleSheetsUrl') || cloudData?.settings?.googleSheetsUrl,
        localStorage.getItem('googleDriveUploadUrl') || cloudData?.settings?.googleDriveUploadUrl
      );
      setSettings({ 
        ...persistedSettings,
        ...(cloudData?.settings || {}), 
        googleSheetsUrl: mergedUrls.googleSheetsUrl, 
        googleDriveUploadUrl: mergedUrls.googleDriveUploadUrl 
      });
      setSubscriptionPlans(Array.isArray(cloudData?.subscriptionPlans) ? cloudData.subscriptionPlans : []);
      setUserSubscriptions(Array.isArray(cloudData?.userSubscriptions) ? cloudData.userSubscriptions : []);
      setServiceTemplates(Array.isArray(cloudData?.serviceTemplates) && cloudData.serviceTemplates.length > 0 ? cloudData.serviceTemplates : DEFAULT_SERVICE_TEMPLATES);
      setServiceRequests(Array.isArray(cloudData?.serviceRequests) ? cloudData.serviceRequests : []);
      setAuditLogs(Array.isArray(cloudData?.auditLogs) ? cloudData.auditLogs : []);
      setNotifications(Array.isArray(cloudData?.notifications) ? cloudData.notifications : []);
      setLocationHistory(Array.isArray(cloudData?.locationHistory) ? cloudData.locationHistory : []);
      setProfitLossData(Array.isArray(cloudData?.profitLoss) ? cloudData.profitLoss : []);
      setPredefinedCosts(Array.isArray(cloudData?.predefinedCosts) ? cloudData.predefinedCosts : []);
      setVehicleData(cloudData?.vehicleData || CAR_BRANDS);
      if (setCarDatabase && Array.isArray(cloudData?.carDatabase) && cloudData.carDatabase.length > 0) {
        setCarDatabase(cloudData.carDatabase);
      }
      setTyreData(cloudData?.tyreData || { brands: TIRE_BRANDS, models: [], sizes: [] });
      setDeliveryHubs(Array.isArray(cloudData?.deliveryHubs) ? cloudData.deliveryHubs : []);
      setProductRules(Array.isArray(cloudData?.productRules) ? cloudData.productRules : []);
      setPredefinedServices(Array.isArray(cloudData?.predefinedServices) ? cloudData.predefinedServices : []);
      setPredefinedServiceCategories(Array.isArray(cloudData?.predefinedServiceCategories) ? cloudData.predefinedServiceCategories : []);
      setCustomerBook(Array.isArray(cloudData?.customerBook) ? cloudData.customerBook : []);
      setExpenses(Array.isArray(cloudData?.expenses) ? cloudData.expenses : []);
      setRecurringExpenses(Array.isArray(cloudData?.recurringExpenses) ? cloudData.recurringExpenses : []);
      setSpendCategories(Array.isArray(cloudData?.spendCategories) ? cloudData.spendCategories : []);
      setWarranties(Array.isArray(cloudData?.warranties) ? cloudData.warranties : []);
      setRetentionLogs(Array.isArray(cloudData?.retentionLogs) ? cloudData.retentionLogs : []);

      let itemsToSet = Array.isArray(cloudData?.inventoryItems) ? cloudData.inventoryItems : [];
      if (itemsToSet.length === 0) {
        const defaults = inventoryService.getDefaultInventoryItems();
        itemsToSet = defaults;
        defaults.forEach(item => {
          cloudDataService.saveRecord('InventoryItems', item, PERMANENT_SHEET_URL);
        });
      }
      setInventoryItems(itemsToSet);
      setInventoryMovements(Array.isArray(cloudData?.inventoryMovements) ? cloudData.inventoryMovements : []);

      setSyncStatus('SYNCED');
      const now = new Date();
      setLastSyncedAt(now);
      localStorage.setItem('service_app_last_synced_at', now.toISOString());
      if (onAfterLoadTriggers) {
        onAfterLoadTriggers(mergedSubmissions, cloudData.notifications || []);
      }
      setIsDataHydrated(true);
      return true;
    } catch (e) {
      console.error("Failed to load initial data from cloud", e);
      setSyncStatus('ERROR');
      setSyncError(e instanceof Error ? e.message : "Load failed");
      return false;
    } finally {
      if (isInitial) setAppIsLoading(false);
      isInitialLoad.current = false;
    }
  }, [
    setSubmissions,
    setUsers,
    setSettings,
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
    onAfterLoadTriggers
  ]);

  // Cloud Service Init & Mount Initial Data Loading
  useEffect(() => {
    cloudDataService.init({ 
      onSyncStatusChange: (status) => {
        setSyncStatus(status);
        if (status === 'SYNCED') {
          const now = new Date();
          setLastSyncedAt(now);
          localStorage.setItem('service_app_last_synced_at', now.toISOString());
        }
      }, 
      onSyncError: setSyncError,
      onProgressChange: (progress, stage, entity) => {
        setSyncProgress(progress);
        setSyncStage(stage);
        setSyncEntity(entity || null);
      }
    }, settings.googleSheetsUrl);

    if (trackingId) {
      console.log(`🚀 [Customer Tracking Mode] Fast path activated for tracking ID "${trackingId}". Bypassing heavy admin AppData initial sync.`);
      setAppIsLoading(false);
      return;
    }

    // ⚡ Instant Local Disk Pre-Hydration Pass (< 20ms)
    // If local IndexedDB contains cached data, hydrate state IMMEDIATELY
    // and release loading screen so the user never has to wait or reload everything!
    (async () => {
      try {
        const [cachedSubs, cachedUsers, cachedRequests] = await Promise.all([
          getIndexedDbItem<Service[]>('service_app_submissions', []),
          getIndexedDbItem<User[]>('service_app_users', []),
          getIndexedDbItem<ServiceRequest[]>('service_app_service_requests', [])
        ]);

        if ((cachedSubs && cachedSubs.length > 0) || (cachedUsers && cachedUsers.length > 0)) {
          console.log(`⚡ [Instant Boot] Hydrated ${cachedSubs.length} orders & ${cachedUsers.length} users from local disk cache.`);
          if (cachedSubs.length > 0) setSubmissions(cachedSubs);
          if (cachedUsers.length > 0) setUsers(cachedUsers);
          if (cachedRequests && cachedRequests.length > 0) setServiceRequests(cachedRequests);
          setIsDataHydrated(true);
          setAppIsLoading(false);
          // Run background verification without blocking UI
          loadAndMergeData(false, false);
          return;
        }
      } catch (err) {
        console.warn('Instant local pre-hydrate notice:', err);
      }

      // If no local cache exists yet (fresh install/first open), perform initial full load
      loadAndMergeData(true);
    })();
  }, [loadAndMergeData, settings.googleSheetsUrl, trackingId]);

  // Network Listener & Offline Sync Queue (Capacitor & Web)
  useEffect(() => {
    let listenerHandle: any = null;

    const setupListener = async () => {
      try {
        listenerHandle = await Network.addListener('networkStatusChange', status => {
          console.log(`📡 [Network Listener] Status changed: connected=${status.connected}, connectionType=${status.connectionType}`);
          if (status.connected) {
            dataSyncManager.processPendingQueue();
            cloudDataService.loadAppData(settings, false).then(() => {
              loadAndMergeData(false, false);
            }).catch(e => {
              console.warn('Background sync on network reconnect notice:', e);
            });
          }
        });
      } catch (err) {
        console.warn('Capacitor Network listener notice:', err);
      }
    };

    setupListener();

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
    };
  }, [settings, loadAndMergeData]);

  return {
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
  };
}
