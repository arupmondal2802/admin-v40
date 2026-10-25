
// FIX: Added all missing exported types and interfaces to resolve "has no exported member" errors.

export interface TrackedEntity {
  last_modified?: string;
  updatedAt?: string;
}

export type PaymentMode = 'Cash' | 'Online' | 'Both';

export type PLTab = 'ALL' | 'WASH' | 'CARE' | 'TYRE' | 'BATTERY' | 'CUSTOM' | 'OVERHEADS';

export interface PredefinedCost {
  id: string;
  name: string;
  value: number;
  category?: PLTab;
  last_modified?: string;
}

export interface DynamicCostItem {
  id: string;
  label: string;
  value: number;
}

export interface ProfitLoss {
  serviceId: string;
  materialCost: number;
  laborCost: number;
  otherExpenses: number;
  dynamicCosts?: DynamicCostItem[];
  calculatedProfit: number;
  notes?: string;
  last_modified?: string;
}

export interface SpendCategory {
  id: string;
  name: string;
  monthlyBudget?: number;
  last_modified?: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  categoryId: string; // references SpendCategory.id
  paymentMode: 'Cash' | 'Bank' | 'UPI';
  attachmentUrl?: string; // photo/file URL
  status: 'Pending' | 'Approved' | 'Rejected';
  approvalNotes?: string;
  recurringExpenseId?: string; // references RecurringExpense.id if auto-created
  recordedBy: string; // username
  timestamp: string; // ISO string
  last_modified?: string;
}

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  categoryId: string; // references SpendCategory.id
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  paymentMode: 'Cash' | 'Bank' | 'UPI';
  startDate: string; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  isActive: boolean;
  notes?: string;
  last_modified?: string;
}

export interface NotificationPreferences {
  enabled: {
    assigned: boolean;
    reminder: boolean;
    queued: boolean;
    completed: boolean;
    manual: boolean;
    overdue: boolean;
  };
  sound: 'default' | 'tone1' | 'tone2' | 'none';
  vibration: boolean;
  consentGranted: boolean; // Deactivated by default; activated only with explicit consent of user or admin to manage load
  consentTimestamp?: string;
  consentGrantedBy?: string; // Username of user or admin who granted consent
  priorityOnly?: boolean; // When active, suppresses non-critical alerts to manage load
  maxDailyAlerts?: number; // Capped max alerts per day to manage notification load
  quietHoursEnabled?: boolean; // Mute notifications during quiet hours
  quietHoursStart?: string; // e.g. '22:00'
  quietHoursEnd?: string; // e.g. '07:00'
}

export type AttendanceStatus = 'CHECKED_IN' | 'CHECKED_OUT' | 'BREAK_START' | 'BREAK_END';

export interface AttendanceRecord {
  timestamp: string;
  status: AttendanceStatus;
  latitude?: number;
  longitude?: number;
  isManualEntry?: boolean;
  note?: string;
}

export interface CarDatabaseItem {
  id: string;
  brand: string;
  logo: string;
  model: string;
  image: string;
  version: string;
  yearRange: string;
  fuelType: string;
  frontTyresSpec: string;
  frontTyresWidth: string | number;
  frontTyresProfile: string | number;
  frontTyresRadius: string | number;
  rearTyresSpec: string;
  rearTyresWidth: string | number;
  rearTyresProfile: string | number;
  rearTyresRadius: string | number;
  tag: string;
}

export enum Permission {
  CAN_VIEW_DASHBOARD = "CAN_VIEW_DASHBOARD",
  CAN_CREATE_ORDERS = "CAN_CREATE_ORDERS",
  CAN_EDIT_OWN_ORDERS = "CAN_EDIT_OWN_ORDERS",
  CAN_VIEW_SERVICE_HISTORY = "CAN_VIEW_SERVICE_HISTORY",
  CAN_VIEW_APPOINTMENTS_OVERVIEW = "CAN_VIEW_APPOINTMENTS_OVERVIEW",
  CAN_LOG_EXPENSES = "CAN_LOG_EXPENSES",
  CAN_ASSIGN_ORDERS = "CAN_ASSIGN_ORDERS",
  CAN_EDIT_ANY_ORDER = "CAN_EDIT_ANY_ORDER",
  CAN_DELETE_ORDERS = "CAN_DELETE_ORDERS",
  CAN_VIEW_ANALYTICS = "CAN_VIEW_ANALYTICS",
  CAN_VIEW_LIVE_MAP = "CAN_VIEW_LIVE_MAP",
  CAN_VIEW_CUSTOMER_HISTORY = "CAN_VIEW_CUSTOMER_HISTORY",
  CAN_VIEW_RETENTION_DASHBOARD = "CAN_VIEW_RETENTION_DASHBOARD",
  CAN_MANAGE_BOOKKEEPING = "CAN_MANAGE_BOOKKEEPING",
  CAN_VIEW_PROFIT_LOSS = "CAN_VIEW_PROFIT_LOSS",
  CAN_MANAGE_USERS = "CAN_MANAGE_USERS",
  CAN_MANAGE_SUBSCRIPTIONS = "CAN_MANAGE_SUBSCRIPTIONS",
  CAN_MANAGE_PLANS = "CAN_MANAGE_PLANS",
  CAN_MANAGE_ADDONS = "CAN_MANAGE_ADDONS",
  CAN_MANAGE_PRICING = "CAN_MANAGE_PRICING",
  CAN_MANAGE_SERVICES = "CAN_MANAGE_SERVICES",
  CAN_VIEW_SERVICE_REQUESTS = "CAN_VIEW_SERVICE_REQUESTS",
  CAN_EDIT_SETTINGS = "CAN_EDIT_SETTINGS",
  CAN_MANAGE_ADMINS = "CAN_MANAGE_ADMINS",
  CAN_VIEW_TRASH = "CAN_VIEW_TRASH",
  CAN_MANAGE_SPEND_CATEGORIES = "CAN_MANAGE_SPEND_CATEGORIES",
  CAN_MANAGE_CAR_DATABASE = "CAN_MANAGE_CAR_DATABASE",
  CAN_MANAGE_PAYMENTS = "CAN_MANAGE_PAYMENTS",
}

export type AgentCategory = 'SALES_AGENT' | 'TECHNICIAN' | 'ADMIN_MANAGER' | 'NONE';

export interface User {
  username: string;
  name?: string;
  email?: string;
  password?: string;
  role: 'admin' | 'manager' | 'technician' | 'agent';
  agentCategory?: AgentCategory; // Operational category: 'SALES_AGENT' | 'TECHNICIAN' | 'ADMIN_MANAGER' | 'NONE'
  specialties?: string[]; // e.g. ['Car Washing', 'Car Care (Polishing & Coating)', 'Battery Replacement', 'Tyre Replacement', 'Custom Services']
  isSalesKpiTracked?: boolean; // Explicit flag: calculate sales retention KPI & lead targets
  weeklyOrdersTarget?: number; // Target completed orders per week for sales agent
  monthlyOrdersTarget?: number; // Target completed orders per month for sales agent
  isEarningsCalculated?: boolean; // Explicit flag: include in technician earnings & commission payouts
  isOrderTagAssignable?: boolean; // Explicit flag: assignable to service jobs & order tags
  notificationPreferences?: NotificationPreferences;
  pushSubscription?: PushSubscriptionJSON;
  latitude?: number;
  longitude?: number;
  lastLocationUpdate?: string;
  attendanceStatus?: AttendanceStatus;
  attendanceHistory?: AttendanceRecord[];
  permissions: Permission[];
  last_modified?: string;
}

export enum ServiceStatus {
  Queued = "Queued",
  Assigned = "Assigned",
  InProgress = "In Progress",
  Completed = "Completed",
  Cancelled = "Cancelled",
  Draft = "Draft",
}

export interface Customer {
  mobileNumber: string;
  firstName: string;
  lastName: string;
  streetAddress: string;
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  carNumber: string;
  carBrandModel: string;
  customerEmail?: string;
  latitude?: number;
  longitude?: number;
  eLoc?: string;
  distanceKm?: number;
  loyaltyScore?: number;
  last_modified?: string;
}

export interface TyreDetail {
  tyreId: string;
  relatedServiceId: string;
  dotCode: string;
  dotSerialNumberImage: string;
  tyreSize: string;
  brand: string;
  model: string;
  tyreNumber?: string;
  pricePerTyre?: number;
  balancingPrice?: number;
  last_modified?: string;
}

export interface BatteryDetail {
  batteryId: string;
  relatedServiceId: string;
  serialNumber: string;
  brand: string;
  model?: string;
  exchangeValue: number;
  newBatteryAmount: number;
  batteryPhoto?: string;
  last_modified?: string;
}

export interface CustomService {
  customServiceId: string;
  relatedServiceId: string;
  serviceDescription: string;
  amount: number;
  last_modified?: string;
}

export interface CategorizedAddon {
  id: string;
  relatedServiceId: string;
  category: string;
  productName: string;
  quantity: number;
  amount: number;
  last_modified?: string;
}

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'QUANTITY' | 'PHOTO';

export interface CustomField {
  id: string;
  label: string;
  type: CustomFieldType;
}

export enum VehicleCategoryTag {
  Micro = "Micro",
  Hatch = "Hatch",
  Prime = "Prime",
  CrossOver = "CrossOver",
  Suv = "Suv",
  Luxury = "Luxury",
}

export interface CarWashDetails {
  washType?: string;
  price?: number;
  mrp?: number;
}

export interface CarCareDetails {
  careType?: string;
  price?: number;
  mrp?: number;
}

export interface DynamicAddon {
  name: string;
  quantity: number;
  price: number;
  mrp: number;
}

export type ServicePriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export const DEFAULT_SERVICE_TAGS = [
  'VIP',
  'Urgent',
  'Return-Visit',
  'Priority',
  'First-Timer',
  'Doorstep',
  'Corporate',
  'Fleet',
  'Warranty'
] as const;

export interface StatusTransition {
  status: ServiceStatus;
  timestamp: string;
  notes?: string;
  updatedBy?: string;
}

export interface Service {
  id?: string;
  submissionId: string;
  appointmentId?: string;
  priority?: ServicePriority;
  statusHistory?: StatusTransition[];
  timestamp: string;
  submittedBy?: string;
  customerFirstName: string;
  customerLastName: string;
  streetAddress: string;
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  mobileNumber: string;
  customerEmail?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  customerELoc?: string;
  customerDistanceKm?: number;
  carNumber: string;
  carBrandModel: string;
  vehicleCategoryTag?: VehicleCategoryTag;
  carBrand?: string;
  carModelName?: string;
  carVersion?: string;
  carFuelType?: string;
  carYearRange?: string;
  carLogoUrl?: string;
  carImageUrl?: string;
  frontTyresSpec?: string;
  rearTyresSpec?: string;
  serviceSelection: string[];
  isSubscription: boolean;
  carWashDetails?: CarWashDetails;
  carCareDetails?: CarCareDetails;
  carwashTotalAmount?: number; // legacy
  carCareTotalAmount?: number; // legacy
  beforeWashingPhoto: string;
  beforeVideoInventory: string;
  beforeVideoTopBody: string;
  beforeVideoUnderchassis: string;
  afterWashingPhoto: string;
  afterVideoInterior: string;
  afterVideoExterior: string;
  afterVideoUnderchassis: string;
  tyreReplacementQuantity: number;
  tyreReplacementPrice: number;
  tyreReplacementTotalAmount: number;
  tyreLaborCost?: number;
  tyreMaterialCost?: number;
  tyreDetails: TyreDetail[];
  batteryReplacementQuantity: number;
  batteryReplacementTotalAmount: number;
  batteryDetails: BatteryDetail[];
  dynamicAddons?: DynamicAddon[];
  addonsTotal: number;
  categorizedAddons: CategorizedAddon[];
  categorizedAddonsTotal: number;
  customServices: CustomService[];
  customServicesTotal: number;
  customFieldData: { fieldId: string; value: string | number }[];
  grandTotal: number;
  laborCost?: number;
  travelCharge?: number;
  acknowledgement: boolean;
  customerSignature?: string;
  status: ServiceStatus;
  scheduledDate?: string;
  scheduledTime?: string;
  assignedTo?: string;
  secondaryAssignee?: string;
  isAutoScheduled?: boolean;
  isFollowUp?: boolean;
  internalNotes?: string;
  dependsOn?: string[];
  paymentMode?: PaymentMode;
  cashAmount?: number;
  onlineAmount?: number;
  paymentNotes?: string;
  tags?: string[]; // Custom labels (e.g., 'VIP', 'Urgent', 'Return-Visit')
  paymentStatus?: 'Completed' | 'Pending'; // Controlled exclusively by dedicated accounts users
  paymentCompletedBy?: string; // Username of dedicated accounts user who verified/completed payment
  paymentCompletedAt?: string; // Timestamp when payment was marked completed
  paymentTransactionId?: string; // Bank UTR / Reference ID / receipt no
  paymentBankName?: string; // Bank / UPI account details
  isDeleted?: boolean;
  carwashQuantity?: number;
  riderLatitude?: number;
  riderLongitude?: number;
  riderLastUpdate?: string;
  isLocationSharingActive?: boolean;
  loyaltyScore?: number;
  // Audit metadata for delete, cancel, and reschedule actions
  deletionReason?: string;
  deletionLoggedBy?: string;
  deletionTimestamp?: string;
  deletionLocation?: string;
  cancellationReason?: string;
  cancellationLoggedBy?: string;
  cancellationTimestamp?: string;
  cancellationLocation?: string;
  rescheduleReason?: string;
  rescheduleLoggedBy?: string;
  rescheduleTimestamp?: string;
  rescheduleLocation?: string;
  // Website Orders Integration Fields
  websiteOrderId?: string;
  websiteOrderItems?: WebsiteOrderItem[];
  paymentMethod?: string;
  razorpayPaymentId?: string;
  hubId?: string;
  serviceTypes?: string;
  isWebsiteOrder?: boolean;
  last_modified?: string;
}

export interface WebsiteOrderItem {
  id: number | string;
  orderId: string;
  itemName: string;
  itemThumbnailSrc?: string;
  itemQuantity: number;
  itemPrice: number;
  bookingDate?: string | null;
  bookingTime?: string | null;
  itemAddons?: any;
  carBrand?: string;
  carModel?: string;
  carVersion?: string;
  carTag?: string;
  carRegNo?: string;
  carColour?: string;
  hubId?: string | null;
}

export interface RetentionKpiTargets {
  monthlyFollowUps: number;
  conversionRatePercentage: number;
  monthlyRevenue: number;
  monthlyOrdersTarget?: number;
  weeklyOrdersTarget?: number;
}

export type CouponDiscountType = 'PERCENTAGE' | 'FIXED';

export interface RetentionCoupon {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  serviceType: string; // 'ALL' or specific service name like 'Car Washing', 'Car Care', etc.
  minOrderValue?: number;
  description: string;
  isEnabled: boolean;
  createdAt?: string;
  last_modified?: string;
}

export interface RetentionActivityLog {
  id: string;
  timestamp: string;
  customerPhone: string;
  customerName: string;
  carNumber?: string;
  carBrandModel?: string;
  agentUsername: string;
  actionType: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'CAMPAIGN' | 'BOOKING_CREATED' | 'OFFER_SENT' | 'FOLLOWUP_SCHEDULED';
  outcome?: 'INTERESTED' | 'BOOKED' | 'NO_ANSWER' | 'CALLBACK_REQUESTED' | 'NOT_INTERESTED' | 'DISCOUNT_SENT';
  notes: string;
  nextFollowUpDate?: string;
  promoCodeUsed?: string;
  bookingSubmissionId?: string;
  dueService?: string;
  last_modified?: string;
}

export type PriceMatrix = Record<string, Record<string, { price: number; mrp: number }>>;

export interface PricingConfig {
  wash: PriceMatrix;
  carCare: PriceMatrix;
  addons: PriceMatrix;
  last_modified?: string;
}

export interface SmartNotificationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  event: 'order_completed' | 'lead_arrival' | 'order_due' | 'reminder_followup';
  template: string;
  channels: {
    bell: boolean;
    whatsapp: boolean;
    sms: boolean;
    email: boolean;
  };
  daysDelay?: number;
}

export interface EmailReportConfig {
  enabled: boolean;
  recipients: string[];
  reportTypes: {
    dailyAppointments: boolean;
    upcomingAppointments: boolean;
    revenueSummary: boolean;
    overdueAlerts: boolean;
  };
  scheduleHour?: number; // 0-23
}

export interface RankThresholds {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface Msg91Config {
  enabled: boolean;
  authKey: string;
  senderId: string; // 6-character DLT Header / Sender ID, e.g. ABGENG
  orderCreatedFlowId?: string; // DLT Template / Flow ID for order booking
  orderRescheduledFlowId?: string; // DLT Template / Flow ID for rescheduling
  orderCompletedFlowId?: string; // DLT Template / Flow ID for service completion
  feedbackRequestFlowId?: string; // DLT Template / Flow ID for feedback collection
  feedbackBaseUrl?: string; // Base URL for feedback form, defaults to app origin
}

export interface Settings {
  googleSheetsUrl: string; // Database backend endpoint for fetching and syncing records
  googleDriveUploadUrl: string; // Media upload backend endpoint for photos/videos storage
  customLogoUrl: string;
  retentionKpiTargets?: RetentionKpiTargets;
  pricingConfig?: PricingConfig;
  googleMapsApiKey?: string;
  hubLatitude?: number;
  hubLongitude?: number;
  maxDistanceKm?: number;
  syncFrequency?: 'manual' | '5' | '15' | '30';
  metaLeadsSheetUrl?: string;
  metaLeadsTabName?: string;
  metaLeadsLastSyncDate?: string;
  whatsappSheetUrl?: string;
  whatsappTabName?: string;
  whatsappLastSyncDate?: string;
  whatsAppLeadsSheetUrl?: string;
  whatsAppLeadsTabName?: string;
  whatsAppLeadsLastSyncDate?: string;
  webLeadsLastSyncDate?: string;
  metaLeadsSubsheets?: string[];
  notificationRules?: SmartNotificationRule[];
  emailReportConfig?: EmailReportConfig;
  agentRankThresholds?: RankThresholds;
  msg91Config?: Msg91Config;
  fixedLaborPerOrder?: number;
  serviceBatchLaborRates?: Record<string, number>;
  deliveryHubs?: DeliveryHub[];
  last_modified?: string;
  // Disaster Recovery & Backup Settings (Deactivated by default per system spec)
  googleSheetsDisasterRecoveryEnabled?: boolean;
  disasterRecoveryBackupSchedule?: 'manual' | 'daily' | 'weekly';
  lastDisasterRecoveryBackupAt?: string;
  lastDisasterRecoveryRestoreAt?: string;
  lastDisasterRecoveryStatus?: string;
  // Lead Delta Sync Settings (Meta Leads & WhatsApp Enquiry syncing to Neon DB)
  metaLeadsDeltaSyncEnabled?: boolean;
  whatsAppEnquiryDeltaSyncEnabled?: boolean;
  leadDeltaSyncIntervalMinutes?: number;
  metaLeadsLastDeltaCount?: number;
  whatsAppLastDeltaCount?: number;
  lastLeadDeltaSyncAt?: string;
}

export interface SyncPerformanceStats {
  lastSyncTimestamp?: string;
  mode: 'incremental' | 'full';
  totalRowsEvaluated: number;
  rowsSkipped: number;
  rowsProcessed: number;
  newLeadsImported: number;
  leadsUpdated: number;
  syncDurationMs: number;
  estimatedTimeSavedMs: number;
  lastSyncSource: 'Meta' | 'WhatsApp' | 'Website' | 'Both' | 'All';
  lastSyncCompletedAt: string;
}

export enum VehicleCategory {
  Hatchback = "Hatchback",
  Sedan = "Sedan",
  CompactSUV = "Compact SUV",
  LargeSUV = "Large SUV",
  Luxury = "Luxury",
}

export enum PlanName {
  Eco = "Eco",
  Turbo = "Turbo",
  Sport = "Sport",
  V8Elite = "V8 Elite",
}

export interface SubscriptionPlan {
  id: string;
  name: PlanName;
  vehicleCategory: VehicleCategory;
  price: number;
  totalWashes: number;
  features: string[];
  washType?: string;
  last_modified?: string;
}

export interface UserSubscription {
  id: string;
  mobileNumber: string;
  planId: string;
  startDate: string;
  endDate: string;
  washesRemaining: number;
  customerFirstName: string;
  customerLastName: string;
  streetAddress: string;
  carNumber: string;
  carBrandModel: string;
  customerEmail?: string;
  last_modified?: string;
}

export interface RecipeItem {
  id: string;
  type: 'PRODUCT' | 'LABOR';
  name: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  inventoryItemId?: string;
  notes?: string;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  isEnabled: boolean;
  customFields: CustomField[];
  recipeItems?: RecipeItem[];
  bundlePrice?: number;
  estimatedLaborMinutes?: number;
  description?: string;
  category?: string;
  last_modified?: string;
}

export interface ServiceRequest {
  id: string;
  customerName: string;
  customerPhone: string;
  requestedService: string;
  requestDate: string;
  syncedAt?: string;
  source: 'Website' | 'App' | 'Web' | 'Meta' | 'Google Ads' | 'Organic' | 'Reference' | string;
  leadSource?: 'Web' | 'Meta' | 'Google Ads' | 'Organic' | 'Referral' | string;
  status: 'New' | 'Contacted' | 'Booked' | 'CREATED' | 'CONTACTED' | 'FOLLOW UP' | 'HIGH INTENT' | 'CONVERTED' | 'NOT CONTACTABLE' | string;
  carRegNo?: string;
  carBrand?: string;
  carModel?: string;
  streetAddress?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  latitude?: number;
  longitude?: number;
  customerDistanceKm?: number;
  totalAmount?: number;
  leadCost?: number;
  actionNotes?: string;
  originalOrderJson?: string;
  remarks?: string;
  campaignName?: string;
  adName?: string;
  formName?: string;
  subsheetName?: string;
  platform?: string;
  createdTime?: string;
  bookingReminderDate?: string;
  assignedAgent?: string;
  assignedHubId?: string;
  isArchived?: boolean;
  last_modified?: string;
}

export interface AuditLog {
  id: string;
  leadId: string;
  serviceId?: string;
  timestamp: string;
  changedBy: string;
  changeType: 'STATUS' | 'REMARKS' | 'ASSIGNMENT' | 'CREATE' | 'DELETE' | 'CANCEL' | 'RESCHEDULE' | string;
  oldValue: string;
  newValue: string;
  notes?: string;
  locationStamp?: string;
  reason?: string;
  last_modified?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  serviceId: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type?: 'upcoming' | 'queued' | 'active' | 'completed' | 'assigned' | 'reminder-60min' | 'reminder-30min' | 'manual-admin' | 'manual-order' | 'overdue-alert' | 'service-reminder' | 'warranty-expiry';
  customerName?: string;
  mobileNumber?: string;
  carNumber?: string;
  serviceType?: 'Car Wash' | 'Tyre' | 'Detail' | 'Battery' | 'General' | string;
  daysOverdue?: number;
  snoozedUntil?: string;
  isDismissed?: boolean;
  last_modified?: string;
}

export interface LocationHistory {
  historyId: string;
  userId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  relatedServiceId?: string;
  last_modified?: string;
}

export enum MiscSpendStatus {
  Pending = "Pending",
  Paid = "Paid",
}

export interface MiscSpend {
  spendId: string;
  userId: string;
  timestamp: string;
  spendType: string;
  amount: number;
  receiptPhotoUrl: string;
  status: MiscSpendStatus;
  notes?: string;
  last_modified?: string;
}

export enum BookkeepingEntryType {
  Income = 'Income',
  Expense = 'Expense',
}

export interface BookkeepingEntry {
  id: string;
  timestamp: string;
  type: BookkeepingEntryType;
  description: string;
  amount: number;
  relatedId: string;
  recordedBy: string;
  last_modified?: string;
}

export interface TyreData {
  brands: string[];
  models: string[];
  sizes: string[];
}

export interface PredefinedAddon {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  category?: string;
  isEnabled?: boolean;
  description?: string;
}

export interface ServiceAction<T = unknown> {
  type: string;
  field?: keyof Service | string;
  value?: T;
  payload?: T;
  [key: string]: unknown;
}

export type ServiceDispatch = React.Dispatch<ServiceAction>;

export type FormErrorValue = string | boolean | number | Record<string, string>[] | Record<string, string> | undefined;
export type ValidationErrors = Record<string, FormErrorValue>;
export type FormErrors = ValidationErrors;

export interface BaseStepProps {
  state: Service;
  updateField: <K extends keyof Service>(field: K, value: Service[K]) => void;
  dispatch: ServiceDispatch;
  googleDriveUploadUrl?: string;
  userSubscriptions?: UserSubscription[];
  serviceTemplates?: ServiceTemplate[];
  errors?: FormErrors;
  allSubmissions?: Service[];
  vehicleData?: Record<string, string[]>;
  carDatabase?: CarDatabaseItem[];
  tyreData?: TyreData;
  onUpdateVehicleData?: (brand: string, model: string) => void;
  onUpdateTyreData?: (type: keyof TyreData, value: string) => void;
  pricingConfig?: PricingConfig;
  customerBook?: CustomerBookEntry[];
  predefinedServices?: PredefinedService[];
  predefinedServiceCategories?: PredefinedServiceCategory[];
  currentUser?: User;
  allUsers?: Omit<User, 'password'>[] | User[];
  deliveryHubs?: DeliveryHub[];
  productRules?: ProductRule[];
  inventoryItems?: InventoryItem[];
}

export interface AppData {
  submissions: Service[];
  users: User[];
  settings: Settings;
  subscriptionPlans: SubscriptionPlan[];
  userSubscriptions: UserSubscription[];
  serviceTemplates: ServiceTemplate[];
  serviceRequests: ServiceRequest[];
  notifications: AppNotification[];
  locationHistory: LocationHistory[];
  miscSpends: MiscSpend[];
  bookkeeping: BookkeepingEntry[];
  profitLoss: ProfitLoss[];
  businessOverheads: BookkeepingEntry[];
  spendCategories: SpendCategory[];
  predefinedCosts: PredefinedCost[];
  expenses?: ExpenseItem[];
  recurringExpenses?: RecurringExpense[];
  vehicleData: Record<string, string[]>;
  carDatabase?: CarDatabaseItem[];
  tyreData: TyreData;
  predefinedAddons: PredefinedAddon[];
  pricingConfig: PricingConfig;
  deliveryHubs?: DeliveryHub[];
  productRules?: ProductRule[];
  predefinedServiceCategories?: PredefinedServiceCategory[];
  predefinedServices?: PredefinedService[];
  customerBook?: CustomerBookEntry[];
  inventoryItems?: InventoryItem[];
  inventoryMovements?: InventoryMovement[];
  auditLogs?: AuditLog[];
  warranties?: WarrantyRecord[];
  retentionLogs?: RetentionActivityLog[];
}

export interface WarrantyRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  productName: string;
  productType: 'Service' | 'Product';
  serialNumber?: string;
  serviceId?: string; // Associated service request submission ID (optional)
  purchaseDate: string; // ISO date format (YYYY-MM-DD)
  warrantyPeriodMonths: number;
  expiryDate: string; // ISO date format (YYYY-MM-DD)
  status: 'Active' | 'Expired' | 'Claimed';
  alertDaysBefore: number;
  notes?: string;
  terms?: string;
  timestamp: string;
  last_modified?: string;
}

export interface DeliveryHub {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  last_modified?: string;
}

export interface ProductRule {
  id: string;
  type: string;
  category: string;
  priority?: number;
  hub?: string;
  freeRadius?: number;
  maxRadius?: number;
  chargePerKm?: number;
  roundTrip?: boolean;
  requiresMainService?: boolean;
  last_modified?: string;
}

export interface PredefinedServiceCategory {
  id: string;
  name: string;
  isEnabled: boolean;
  last_modified?: string;
}

export interface PredefinedService {
  id: string;
  name: string;
  categoryId: string;
  isEnabled: boolean;
  pricingCode?: string;
  pricing?: Record<string, { price: number; mrp: number }>;
  serviceableRadiusKm?: number;
  freeRadiusKm?: number;
  convenienceFeePerKm?: number;
  baseConvenienceFee?: number;
  recipe?: string;
  materialExpense?: number;
  fuelExpense?: number;
  laborExpense?: number;
  otherExpense?: number;
  brand?: string;
  model?: string;
  tyreNumber?: string;
  pricePerUnit?: number;
  balancingPrice?: number;
  exchangeValueDeduction?: number;
  hasPhotoRequirement?: boolean;
  serviceType?: 'standard' | 'wash' | 'care' | 'tyre' | 'battery';
  last_modified?: string;
}

export interface SavedVehicle {
  carNumber: string;
  carBrandModel: string;
  vehicleCategoryTag: VehicleCategoryTag;
}

export interface CustomerBookEntry {
  id: string;
  mobileNumber: string;
  firstName: string;
  lastName: string;
  streetAddress: string;
  customerEmail?: string;
  latitude?: number;
  longitude?: number;
  eLoc?: string;
  savedVehicles: SavedVehicle[];
  leadSource?: string;
  loyaltyScore?: number;
  last_modified?: string;
}

export interface InventoryItem {
  id: string;
  sku?: string;
  name: string;
  stock: number;
  unit: string;
  minStock: number;
  costPerUnit?: number;
  category?: string;
  leadTime?: number;
  last_modified?: string;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  change: number;
  unit: string;
  reason: string;
  timestamp: string;
  createdBy?: string;
  last_modified?: string;
}

// ==========================================
// FUTURE ERP MODULE INTEGRATION STRUCTS
// ==========================================

export interface ErpVehicle {
  id: string;
  customerId: string; // Linked Customer ID
  brand: string;
  model: string;
  variant?: string;
  fuelType?: 'Petrol' | 'Diesel' | 'EV' | 'CNG' | 'Hybrid';
  transmission?: 'Manual' | 'Automatic';
  year?: number;
  color?: string;
  odometerReading?: number;
  vinChassisNumber?: string;
  insuranceExpiryDate?: string;
}

export interface ErpSupplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  gstNumber?: string;
  address?: string;
  outstandingPayable: number;
}

export interface ErpPurchaseOrderItem {
  itemId: string;
  name: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
}

export interface ErpPurchaseOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  receivedDate?: string;
  status: 'Draft' | 'Ordered' | 'Received' | 'Cancelled';
  items: ErpPurchaseOrderItem[];
  subTotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMode?: 'Cash' | 'Bank' | 'UPI';
  amountPaid: number;
  outstandingBalance: number;
}

export interface ErpRecipeComponent {
  productId: string;
  productName: string;
  qtyRequired: number;
  unit: string;
  estimatedCostPerUnit: number;
  wasteFactorPercentage: number; // e.g. 5 for 5% waste
}

export interface ErpServiceRecipe {
  id: string;
  serviceId: string; // references PredefinedService.id
  serviceName: string;
  components: ErpRecipeComponent[];
  totalMaterialCost: number;
  lastUpdated: string;
}

export interface ErpSalesItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercentage?: number;
  gstRate: number; // e.g. 18 for 18% GST
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
}

export interface ErpSalesDocument {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  vehicleRegNumber: string;
  vehicleBrandModel: string;
  date: string;
  type: 'Quotation' | 'Booking' | 'JobCard' | 'Invoice';
  status: 'Draft' | 'Active' | 'Invoiced' | 'Paid' | 'Cancelled';
  items: ErpSalesItem[];
  subTotal: number;
  discountTotal: number;
  convenienceFee?: number;
  deliveryCharges?: number;
  cgstTotal: number;
  sgstTotal: number;
  grandTotal: number;
  paymentMode?: 'Cash' | 'Bank' | 'UPI' | 'Split';
  cashReceived?: number;
  bankReceived?: number;
  upiReceived?: number;
  amountPaid: number;
  outstandingBalance: number;
  notes?: string;
}

export interface ErpAccountBalances {
  cashInHand: number;
  bankBalance: number;
  upiBalance: number;
  lastUpdated: string;
}

// ==========================================
// SERVICE LAYER & SYNCHRONIZATION INTERFACES
// ==========================================

export interface ServiceLayerResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error | string;
  timestamp: string;
}

export interface SyncStatusResult {
  status: 'idle' | 'syncing' | 'success' | 'error';
  lastSyncedAt?: string;
  errorMessage?: string;
  pendingChangesCount?: number;
}

export interface SheetSyncPayload<T = unknown> {
  sheetName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC_ALL' | 'FETCH';
  data?: T;
  id?: string;
  timestamp?: string;
}

export interface CloudStorageResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  url?: string;
}

export interface FileUploadPayload {
  filename: string;
  mimeType: string;
  base64: string;
  subFolderName: string;
}

export interface FileUploadResult {
  status: 'success' | 'error';
  url?: string;
  message?: string;
  error?: string;
}

export type AppView = 
  | 'DASHBOARD' 
  | 'LIST' 
  | 'USER_MANAGEMENT' 
  | 'SETTINGS' 
  | 'SERVICE_TEMPLATE_MANAGEMENT' 
  | 'SERVICE_TEMPLATE_EDITOR' 
  | 'FORM' 
  | 'SERVICE_REQUEST' 
  | 'LIVE_MAP' 
  | 'ANALYTICS' 
  | 'CUSTOMER_HISTORY' 
  | 'RETENTION' 
  | 'APPOINTMENTS_OVERVIEW' 
  | 'PROFIT_LOSS' 
  | 'TRASH' 
  | 'ATTENDANCE_MANAGEMENT' 
  | 'CUSTOMER_BOOK' 
  | 'SERVICE_CATALOG' 
  | 'CAR_DATABASE' 
  | 'HUB_MANAGEMENT' 
  | 'INVENTORY_FORECASTING' 
  | 'EXPENSES' 
  | 'SPEND_CATEGORIES' 
  | 'NOTIFICATIONS' 
  | 'ERP_MANAGEMENT' 
  | 'WARRANTY_TRACKER' 
  | 'OFFLINE_SYNC_MANAGER';



