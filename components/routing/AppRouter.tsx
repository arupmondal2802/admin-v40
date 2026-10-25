import React, { Suspense, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ErrorBoundary from '../ui/ErrorBoundary';
import SkeletonLoader from '../ui/SkeletonLoader';
import SubmissionList from '../SubmissionList';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { useOrder } from '../../context/OrderContext';
import { useInventory } from '../../context/InventoryContext';
import { useApp } from '../../context/AppContext';
import { 
  Service, 
  User, 
  Settings, 
  SubscriptionPlan, 
  UserSubscription, 
  ServiceTemplate, 
  ServiceRequest, 
  AppNotification, 
  RetentionKpiTargets, 
  RetentionActivityLog, 
  LocationHistory, 
  TyreData, 
  ProfitLoss, 
  PredefinedCost, 
  PricingConfig, 
  InventoryItem, 
  ExpenseItem, 
  RecurringExpense, 
  SpendCategory, 
  AuditLog, 
  WarrantyRecord, 
  AppData, 
  CarDatabaseItem, 
  SyncPerformanceStats,
  AppView
} from '../../types';

function lazyLoadWithRetry<T extends React.ComponentType<any>>(componentImport: () => Promise<{ default: T }>) {
  return React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn('Dynamic import chunk load error, retrying once...', error);
      await new Promise(resolve => setTimeout(resolve, 500));
      return await componentImport();
    }
  });
}

// Lazy loaded page components
const DashboardPage = lazyLoadWithRetry(() => import('../dashboard/DashboardPage'));
const ServiceForm = lazyLoadWithRetry(() => import('../ServiceForm'));
const UserManagementPage = lazyLoadWithRetry(() => import('../admin/UserManagementPage'));
const ServiceTemplateManagementPage = lazyLoadWithRetry(() => import('../admin/ServiceTemplateManagementPage'));
const ServiceTemplateEditorPage = lazyLoadWithRetry(() => import('../admin/ServiceTemplateEditorPage'));
const ServiceRequestPage = lazyLoadWithRetry(() => import('../admin/ServiceRequestPage'));
const LiveMapPage = lazyLoadWithRetry(() => import('../admin/LiveMapPage'));
const AnalyticsPage = lazyLoadWithRetry(() => import('../admin/AnalyticsPage'));
const CustomerHistoryPage = lazyLoadWithRetry(() => import('../admin/CustomerHistoryPage'));
const OfflineSyncManager = lazyLoadWithRetry(() => import('../admin/OfflineSyncManager'));
const RetentionDashboard = lazyLoadWithRetry(() => import('../admin/RetentionDashboard'));
const AppointmentsOverviewPage = lazyLoadWithRetry(() => import('../appointments/AppointmentsOverviewPage'));
const ProfitLossPage = lazyLoadWithRetry(() => import('../admin/ProfitLossPage'));
const TrashPage = lazyLoadWithRetry(() => import('../admin/TrashPage'));
const AttendancePage = lazyLoadWithRetry(() => import('../admin/AttendancePage'));
const SettingsPage = lazyLoadWithRetry(() => import('../settings/SettingsPage'));
const CustomerBookPage = lazyLoadWithRetry(() => import('../admin/CustomerBookPage'));
const ServiceCatalogPage = lazyLoadWithRetry(() => import('../admin/ServiceCatalogPage'));
const CarDatabasePage = lazyLoadWithRetry(() => import('../admin/CarDatabasePage'));
const HubManagementPage = lazyLoadWithRetry(() => import('../admin/HubManagementPage'));
const InventoryForecastingPage = lazyLoadWithRetry(() => import('../admin/InventoryForecastingPage'));
const ExpenseManagementPage = lazyLoadWithRetry(() => import('../admin/ExpenseManagementPage'));
const NotificationsManagerPage = lazyLoadWithRetry(() => import('../admin/NotificationsManagerPage'));
const ErpManagementPage = lazyLoadWithRetry(() => import('../admin/ErpManagementPage'));
const WarrantyTrackerPage = lazyLoadWithRetry(() => import('../admin/WarrantyTrackerPage'));

export interface AppRouterProps {
  view: AppView | string;
  setView: (view: any) => void;
  loadedViews: Record<string, boolean>;
  serviceTemplates: ServiceTemplate[];
  onUpdateServiceTemplates: (templates: ServiceTemplate[]) => void;
  editingTemplate: ServiceTemplate | null;
  setEditingTemplate: (template: ServiceTemplate | null) => void;
  onSaveServiceTemplate: (template: ServiceTemplate) => void;
  subscriptionPlans: SubscriptionPlan[];
  onUpdatePlans: (plans: SubscriptionPlan[]) => void;
  userSubscriptions: UserSubscription[];
  onUpdateUserSubscriptions: (subs: UserSubscription[]) => void;
  onUpdatePricing: (config: PricingConfig) => void;
  profitLossData: ProfitLoss[];
  onUpdateProfitLoss: (pl: ProfitLoss) => void;
  predefinedCosts: PredefinedCost[];
  onUpdatePredefinedCosts: (costs: PredefinedCost[]) => void;
  carDatabase: CarDatabaseItem[];
  onUpdateCarDatabase: (database: CarDatabaseItem[]) => void;
  warranties: WarrantyRecord[];
  onUpdateWarranties: (warranties: WarrantyRecord[]) => void;
  expenses: ExpenseItem[];
  recurringExpenses: RecurringExpense[];
  spendCategories: SpendCategory[];
  customerBook: any[];
  deliveryHubs: any[];
  productRules: any[];
  predefinedServices: any[];
  predefinedServiceCategories: any[];
  vehicleData: any;
  tyreData: TyreData;
  locationHistory: LocationHistory[];
  retentionLogs: RetentionActivityLog[];
  onSaveRetentionLog: (log: RetentionActivityLog) => Promise<void>;
  onUpdateKpiTargets: (targets: RetentionKpiTargets) => void;
  notifications: AppNotification[];
  onUpdateNotification: (notification: AppNotification) => Promise<void>;
  syncPerformanceStats: SyncPerformanceStats | null;
  appData: AppData;
  onSetPrintingService: (service: Service | null) => void;
  onSetSummarizingService: (service: Service | null) => void;
  onSetSharingService: (service: Service | null) => void;
  onSetDeletingService: (service: Service | null) => void;
  onSetCancelingService: (service: Service | null) => void;
  onSetIsChatbotOpen: (isOpen: boolean) => void;
  onUpdatePredefinedService?: (service: any) => Promise<void> | void;
  onOpenChangePassword?: () => void;
}

export const AppRouter: React.FC<AppRouterProps> = ({
  view,
  setView,
  loadedViews,
  serviceTemplates,
  onUpdateServiceTemplates,
  editingTemplate,
  setEditingTemplate,
  onSaveServiceTemplate,
  subscriptionPlans,
  onUpdatePlans,
  userSubscriptions,
  onUpdateUserSubscriptions,
  onUpdatePricing,
  profitLossData,
  onUpdateProfitLoss,
  predefinedCosts,
  onUpdatePredefinedCosts,
  carDatabase,
  onUpdateCarDatabase,
  warranties,
  onUpdateWarranties,
  expenses,
  recurringExpenses,
  spendCategories,
  customerBook,
  deliveryHubs,
  productRules,
  predefinedServices,
  predefinedServiceCategories,
  vehicleData,
  tyreData,
  locationHistory,
  retentionLogs,
  onSaveRetentionLog,
  onUpdateKpiTargets,
  notifications,
  onUpdateNotification,
  syncPerformanceStats,
  appData,
  onSetPrintingService,
  onSetSummarizingService,
  onSetSharingService,
  onSetDeletingService,
  onSetCancelingService,
  onSetIsChatbotOpen,
  onUpdatePredefinedService,
  onOpenChangePassword
}) => {
  const { currentUser, users, updateUsers, adminOverrideAttendance, updateNotificationPreferences, updateAttendanceStatus } = useAuth();
  const { 
    settings, 
    saveSettings, 
    handleManualRefresh, 
    handlePageSync, 
    isManualRefreshing, 
    isDataHydrated, 
    appIsLoading,
    syncWebsiteOrders,
    isSyncingWebsiteOrders,
    syncMetaLeads,
    isSyncingMetaLeads,
    syncWhatsAppLeads,
    isSyncingWhatsAppLeads,
    syncAllLeads
  } = useSync();
  const {
    submissions,
    activeSubmissions,
    setSubmissions,
    serviceRequests,
    editingService,
    auditLogs,
    hasMoreServiceRequests,
    isLoadingMoreServiceRequests,
    createOrder,
    completeOrder,
    editService,
    assignOrder,
    startOrder,
    selfAssignOrder,
    scheduleDroppedOrder,
    rebookOrder,
    bookServiceFromReminder,
    convertLeadToService,
    captureLead,
    updateServiceRequest,
    loadMoreServiceRequests,
    notifyForOrder
  } = useOrder();
  const {
    inventoryItems,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem
  } = useInventory();

  const renderPageLoadingState = () => <SkeletonLoader view={view} />;

  const dashboardProps = useMemo(() => ({
    isHydrated: isDataHydrated,
    isLoading: !isDataHydrated,
    submissions: activeSubmissions,
    users,
    currentUser,
    onCreateOrder: createOrder,
    onAssignOrder: assignOrder,
    onStartOrder: startOrder,
    onUpdateOrder: editService,
    onCompleteOrder: completeOrder,
    onSelfAssignOrder: selfAssignOrder,
    onDeleteOrder: onSetDeletingService,
    onCancelOrder: onSetCancelingService,
    onScheduleDroppedOrder: scheduleDroppedOrder,
    onNotifyForOrder: notifyForOrder,
    onUpdateAttendanceStatus: updateAttendanceStatus,
    userSubscriptions,
    subscriptionPlans,
    serviceTemplates,
    setIsChatbotOpen: onSetIsChatbotOpen,
    settings,
    locationHistory,
    vehicleData,
    carDatabase,
    tyreData,
    onShareOrder: onSetSharingService,
    deliveryHubs,
    productRules,
    predefinedServices,
    predefinedServiceCategories,
    inventoryItems,
    serviceRequests,
    auditLogs,
    inventoryMovements: appData.inventoryMovements,
    isSyncingWebsiteOrders,
    onSyncWebsiteOrders: syncWebsiteOrders,
    onConvertLeadToService: convertLeadToService,
    onCaptureLead: captureLead,
    onUpdateServiceRequest: updateServiceRequest,
    customerBook,
    onRefresh: handleManualRefresh,
    onNewService: () => setView('CREATE'),
    onNavigate: setView,
    onOpenChangePassword,
    retentionLogs,
    onSaveRetentionLog,
  }), [
    isDataHydrated,
    activeSubmissions,
    users,
    currentUser,
    createOrder,
    assignOrder,
    startOrder,
    editService,
    completeOrder,
    selfAssignOrder,
    onSetDeletingService,
    onSetCancelingService,
    scheduleDroppedOrder,
    notifyForOrder,
    updateAttendanceStatus,
    userSubscriptions,
    subscriptionPlans,
    serviceTemplates,
    onSetIsChatbotOpen,
    settings,
    locationHistory,
    vehicleData,
    carDatabase,
    tyreData,
    onSetSharingService,
    deliveryHubs,
    productRules,
    predefinedServices,
    predefinedServiceCategories,
    inventoryItems,
    serviceRequests,
    auditLogs,
    appData.inventoryMovements,
    isSyncingWebsiteOrders,
    syncWebsiteOrders,
    convertLeadToService,
    captureLead,
    updateServiceRequest,
    customerBook,
    handleManualRefresh,
    setView,
    onOpenChangePassword,
    retentionLogs,
    onSaveRetentionLog
  ]);

  return (
    <ErrorBoundary key={view} title={`${view.replace(/_/g, ' ')} Error`}>
      <Suspense fallback={renderPageLoadingState()}>
        {!isDataHydrated || loadedViews[view] === false ? (
          renderPageLoadingState()
        ) : (
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === 'DASHBOARD' && <DashboardPage {...dashboardProps} />}
            {view === 'LIST' && (
              <SubmissionList 
                submissions={submissions} 
                users={users} 
                onEdit={editService} 
                onPrint={onSetPrintingService} 
                onSummarize={onSetSummarizingService} 
                currentUser={currentUser} 
                serviceTemplates={serviceTemplates} 
              />
            )}
            {view === 'SETTINGS' && (
              <SettingsPage 
                currentUser={currentUser} 
                settings={settings} 
                onSaveSettings={saveSettings} 
                subscriptionPlans={subscriptionPlans}
                onUpdatePlans={onUpdatePlans}
                userSubscriptions={userSubscriptions}
                onUpdateUserSubscriptions={onUpdateUserSubscriptions}
                onAutoSchedule={() => {}}
                onUpdateNotificationPreferences={updateNotificationPreferences}
                onUpdatePushSubscription={() => {}}
                onUpdatePricing={onUpdatePricing}
                appData={appData}
                onRefresh={handleManualRefresh}
              />
            )}
            {view === 'USER_MANAGEMENT' && (
              <UserManagementPage 
                users={users} 
                onUpdateUsers={updateUsers} 
                fullUserList={users} 
                currentUser={currentUser} 
                onRefresh={() => handlePageSync('USER_MANAGEMENT')} 
              />
            )}
            {view === 'ATTENDANCE_MANAGEMENT' && (
              <AttendancePage 
                users={users} 
                locationHistory={locationHistory} 
                onAdminOverride={adminOverrideAttendance} 
              />
            )}
            {view === 'ANALYTICS' && (
              <AnalyticsPage 
                submissions={submissions} 
                users={users} 
                serviceTemplates={serviceTemplates} 
                profitLossData={profitLossData} 
                onSaveProfitLoss={onUpdateProfitLoss} 
                predefinedCosts={predefinedCosts} 
                onUpdatePredefinedCosts={onUpdatePredefinedCosts} 
                settings={settings} 
                onUpdateOrder={completeOrder} 
              />
            )}
            {view === 'PROFIT_LOSS' && (
              <ProfitLossPage 
                submissions={submissions} 
                profitLossData={profitLossData} 
                onSave={onUpdateProfitLoss} 
                predefinedCosts={predefinedCosts} 
                onUpdatePredefinedCosts={onUpdatePredefinedCosts} 
              />
            )}
            {view === 'SERVICE_TEMPLATE_MANAGEMENT' && (
              <ServiceTemplateManagementPage 
                templates={serviceTemplates} 
                onUpdateTemplates={onUpdateServiceTemplates} 
                onEditTemplate={(tmpl) => {
                  setEditingTemplate(tmpl);
                  setView('SERVICE_TEMPLATE_EDITOR');
                }} 
              />
            )}
            {view === 'SERVICE_TEMPLATE_EDITOR' && editingTemplate && (
              <ServiceTemplateEditorPage 
                template={editingTemplate} 
                inventoryItems={inventoryItems} 
                onSave={onSaveServiceTemplate} 
                onExit={() => {
                  setEditingTemplate(null);
                  setView('SERVICE_TEMPLATE_MANAGEMENT');
                }} 
              />
            )}
            {view === 'LIVE_MAP' && (
              <LiveMapPage 
                users={users} 
                currentUser={currentUser} 
                submissions={submissions} 
                onRefresh={handleManualRefresh} 
                isRefreshing={isManualRefreshing} 
                locationHistory={locationHistory} 
                settings={settings} 
                deliveryHubs={deliveryHubs}
              />
            )}
            {view === 'CUSTOMER_HISTORY' && (
              <CustomerHistoryPage 
                submissions={submissions} 
                currentUser={currentUser} 
                onShareOrder={onSetSharingService} 
                onRebookOrder={rebookOrder} 
              />
            )}
            {view === 'CUSTOMER_BOOK' && (
              <CustomerBookPage 
                appData={appData} 
                onRefresh={() => handlePageSync('CUSTOMER_BOOK')} 
                sheetsUrl={settings.googleSheetsUrl} 
              />
            )}
            {view === 'SERVICE_CATALOG' && (
              <ServiceCatalogPage 
                appData={appData} 
                onRefresh={() => handlePageSync('SERVICE_CATALOG')} 
                sheetsUrl={settings.googleSheetsUrl} 
              />
            )}
            {view === 'CAR_DATABASE' && (
              <CarDatabasePage 
                carDatabase={carDatabase}
                onUpdateCarDatabase={onUpdateCarDatabase}
                submissions={submissions}
                onUpdateSubmissions={setSubmissions}
                googleSheetsUrl={settings.googleSheetsUrl}
              />
            )}
            {view === 'HUB_MANAGEMENT' && (
              <HubManagementPage 
                appData={appData} 
                onRefresh={() => handlePageSync('HUB_MANAGEMENT')} 
                sheetsUrl={settings.googleSheetsUrl} 
              />
            )}
            {view === 'INVENTORY_FORECASTING' && (
              <InventoryForecastingPage 
                submissions={submissions}
                inventoryItems={inventoryItems}
                predefinedServices={predefinedServices}
                onUpdateInventoryItem={updateInventoryItem}
                onUpdatePredefinedService={async (service: any) => {
                  if (onUpdatePredefinedService) {
                    await onUpdatePredefinedService(service);
                  }
                }}
                onAddInventoryItem={addInventoryItem}
                onDeleteInventoryItem={deleteInventoryItem}
                settings={settings}
              />
            )}
            {view === 'EXPENSES' && (
              <ExpenseManagementPage 
                appData={appData} 
                currentUser={currentUser} 
                onRefresh={() => handlePageSync('EXPENSES')} 
                sheetsUrl={settings.googleSheetsUrl} 
              />
            )}
            {view === 'ERP_MANAGEMENT' && (
              <ErpManagementPage 
                submissions={submissions}
                expenses={expenses}
                spendCategories={spendCategories}
                customerBook={customerBook}
                inventoryItems={inventoryItems}
              />
            )}
            {view === 'WARRANTY_TRACKER' && (
              <WarrantyTrackerPage 
                warranties={warranties}
                submissions={submissions}
                onUpdateWarranties={onUpdateWarranties}
              />
            )}
            {view === 'RETENTION' && (
              <RetentionDashboard 
                submissions={submissions} 
                onCreateFollowUp={() => {}} 
                settings={settings} 
                onUpdateKpiTargets={onUpdateKpiTargets}
                currentUser={currentUser}
                users={users}
                retentionLogs={retentionLogs}
                onSaveRetentionLog={onSaveRetentionLog}
                onCreateOrder={createOrder}
                serviceTemplates={serviceTemplates}
                predefinedServices={predefinedServices}
                predefinedServiceCategories={predefinedServiceCategories}
                isLoading={appIsLoading}
                isHydrated={isDataHydrated}
              />
            )}
            {view === 'APPOINTMENTS_OVERVIEW' && (
              <AppointmentsOverviewPage 
                currentUser={currentUser} 
                submissions={submissions} 
                auditLogs={auditLogs} 
                onUpdateOrder={editService} 
                onCompleteOrder={completeOrder} 
                onStartOrder={startOrder} 
                onShareOrder={onSetSharingService} 
              />
            )}
            {view === 'SERVICE_REQUEST' && (
              <ServiceRequestPage 
                serviceRequests={serviceRequests} 
                syncPerformanceStats={syncPerformanceStats}
                onSyncWebsiteOrders={syncWebsiteOrders} 
                isSyncing={isSyncingWebsiteOrders}
                onSyncMetaLeads={syncMetaLeads}
                isSyncingMetaLeads={isSyncingMetaLeads}
                onSyncWhatsAppLeads={syncWhatsAppLeads}
                isSyncingWhatsAppLeads={isSyncingWhatsAppLeads}
                onSyncAllLeads={syncAllLeads}
                onUpdateServiceRequest={updateServiceRequest}
                onCaptureLead={captureLead}
                onConvertLeadToService={convertLeadToService}
                settings={settings}
                onSaveSettings={saveSettings}
                auditLogs={auditLogs}
                users={users}
                onLoadMoreServiceRequests={loadMoreServiceRequests}
                hasMoreServiceRequests={hasMoreServiceRequests}
                isLoadingMoreServiceRequests={isLoadingMoreServiceRequests}
              />
            )}
            {view === 'NOTIFICATIONS' && (
              <NotificationsManagerPage 
                notifications={notifications}
                submissions={submissions}
                currentUser={currentUser}
                onUpdateNotification={onUpdateNotification}
                onBookService={bookServiceFromReminder}
                onRefresh={handleManualRefresh}
                isRefreshing={isManualRefreshing}
                settings={settings}
                onSaveSettings={saveSettings}
              />
            )}
            {view === 'TRASH' && (
              <TrashPage 
                deletedSubmissions={submissions.filter(s => s.isDeleted)} 
                onRestore={() => {}} 
                onPermanentDelete={() => {}} 
              />
            )}
            {view === 'OFFLINE_SYNC_MANAGER' && (
              <OfflineSyncManager 
                settings={settings} 
                onRefreshParentData={handleManualRefresh} 
              />
            )}
            {view === 'FORM' && (
              <ServiceForm 
                initialService={editingService} 
                allSubmissions={submissions} 
                onComplete={completeOrder} 
                onSaveDraft={() => {}} 
                onAdminUpdate={completeOrder} 
                onExit={() => setView('DASHBOARD')} 
                googleDriveUploadUrl={settings.googleDriveUploadUrl} 
                currentUser={currentUser} 
                allUsers={users} 
                userSubscriptions={userSubscriptions} 
                serviceTemplates={serviceTemplates} 
                vehicleData={vehicleData} 
                tyreData={tyreData} 
                onUpdateVehicleData={() => {}} 
                onUpdateTyreData={() => {}} 
                deliveryHubs={deliveryHubs}
                productRules={productRules}
                predefinedServices={predefinedServices}
                predefinedServiceCategories={predefinedServiceCategories}
                customerBook={customerBook}
              />
            )}
          </motion.div>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default AppRouter;
