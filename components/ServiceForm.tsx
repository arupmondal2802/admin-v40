
import React, { useState, useMemo, useEffect, useCallback } from 'react';
// FIX: Removed obsolete 'PredefinedAddon' from import.
import { Service, ServiceStatus, User, UserSubscription, ServiceTemplate, Permission, TyreData, PricingConfig, ServicePriority } from '../types';
import { useServiceForm } from '../hooks/useServiceForm';
import { useAndroidBackButton } from '../hooks/useAndroidBackButton';
import { Lightbox } from './ui/Lightbox';
import { Image as ImageIcon, Maximize2, FileText } from 'lucide-react';
import CustomerDetailsStep from './CustomerDetailsStep';
import ServiceSelectionStep from './ServiceSelectionStep';
import { ServiceDetailsStep } from './ServiceDetailsStep';
import AddonsStep from './AddonsStep';
import CustomServicesStep from './CustomServicesStep';
import { SummaryStep } from './SummaryStep';
import Stepper from './Stepper';
import Card from './ui/Card';
import Button from './ui/Button';
import Input from './ui/Input';
import { APPOINTMENT_TIME_SLOTS, DEFAULT_PRICING_CONFIG } from '../constants';
import { toISTDateString } from '../utils/dateTimeUtils';
import { downloadOrderInvoicePDF } from '../utils/pdfGenerator';
import { validateStep, ValidationErrors } from '../services/validationService';
import { IconDeviceFloppy, IconCloudUpload, IconCloudCheck, IconLoader } from './ui/Icon';
import DependencyManager from './DependencyManager';
import CarCareStep from './CarCareStep';
import { db, getIndexedDbItem, setIndexedDbItem } from '../services/indexedDbService';
import { uploadFileToDrive, subscribeToMediaQueueChange } from '../services/fileUploadService';
import { compressImage } from '../services/imageCompressionService';
import { toast } from 'sonner';
import { OrderTimeline } from './dashboard/OrderTimeline';
import OrderTagsManager from './ui/OrderTagsManager';

interface ServiceFormProps {
  initialService?: Service | null;
  allSubmissions: Service[];
  onComplete: (service: Service) => void;
  onSaveDraft: (service: Service) => void;
  onAdminUpdate?: (service: Service) => void;
  onExit: () => void;
  googleDriveUploadUrl: string;
  currentUser: User;
  allUsers: Omit<User, 'password'>[];
  userSubscriptions: UserSubscription[];
  serviceTemplates: ServiceTemplate[];
  vehicleData: Record<string, string[]>;
  tyreData: TyreData;
  onUpdateVehicleData: (brand: string, model: string) => void;
  onUpdateTyreData: (type: keyof TyreData, value: string) => void;
  pricingConfig?: PricingConfig;
  deliveryHubs?: any[];
  productRules?: any[];
  predefinedServices?: any[];
  predefinedServiceCategories?: any[];
  inventoryItems?: any[];
  customerBook?: any[];
}

const ALL_STEPS = [
  { name: 'Customer Details', component: CustomerDetailsStep, isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => true },
  { name: 'Service Selection', component: ServiceSelectionStep, isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => true },
  { 
    name: 'Car Care', 
    component: CarCareStep, 
    isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => 
      state.serviceSelection.includes("Car Care")
  },
  { 
    name: 'Service Details', 
    component: ServiceDetailsStep, 
    isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => 
      state.serviceSelection.some(s => 
        ["Car Washing", "Tyre Replacement", "Battery Replacement"].includes(s)
      ) || state.serviceSelection.some(s => (serviceTemplates || []).find(t => t.name === s && t.customFields.length > 0))
  },
  { 
    name: 'Add-ons', 
    component: AddonsStep, 
    isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => true
  },
  { name: 'Custom Services', component: CustomServicesStep, isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => true },
  { name: 'Invoice Summary', component: SummaryStep, isVisible: (state: Service, serviceTemplates: ServiceTemplate[]) => true },
];

const ServiceForm: React.FC<ServiceFormProps> = ({ 
  initialService, 
  allSubmissions,
  onComplete, 
  onSaveDraft,
  onAdminUpdate,
  onExit, 
  googleDriveUploadUrl, 
  currentUser, 
  allUsers, 
  userSubscriptions,
  serviceTemplates,
  vehicleData,
  tyreData,
  onUpdateVehicleData,
  onUpdateTyreData,
  pricingConfig = DEFAULT_PRICING_CONFIG, // Use default if not provided
  deliveryHubs,
  productRules,
  predefinedServices,
  predefinedServiceCategories,
  inventoryItems,
  customerBook,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const { state, dispatch, updateField } = useServiceForm(
    initialService, 
    pricingConfig,
    deliveryHubs,
    productRules,
    predefinedServices,
    inventoryItems
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [prefillServiceId, setPrefillServiceId] = useState('');
  const [saveConfirmation, setSaveConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const capturedPhotos = useMemo(() => {
    const list: { url: string; label: string }[] = [];
    if (state.beforeWashingPhoto) {
      list.push({ url: state.beforeWashingPhoto, label: 'Before Washing Photo' });
    }
    if (state.afterWashingPhoto) {
      list.push({ url: state.afterWashingPhoto, label: 'After Washing Photo' });
    }
    if (state.tyreDetails) {
      state.tyreDetails.forEach((tyre: any, idx: number) => {
        if (tyre.dotSerialNumberImage) {
          list.push({
            url: tyre.dotSerialNumberImage,
            label: `Tyre ${idx + 1} DOT Serial Image (${tyre.brand || 'No Brand'})`
          });
        }
      });
    }
    if (state.customFieldData) {
      const allCustomFields = serviceTemplates?.flatMap(st => st.customFields || []) || [];
      state.customFieldData.forEach((fieldData: any) => {
        const fieldDef = allCustomFields.find(f => f.id === fieldData.fieldId);
        if (fieldDef?.type === 'PHOTO' && fieldData.value) {
          list.push({
            url: fieldData.value as string,
            label: `${fieldDef.label} (Custom Field)`
          });
        }
      });
    }
    return list;
  }, [state, serviceTemplates]);

  const [isSyncingPhotos, setIsSyncingPhotos] = useState<boolean>(false);
  const [backgroundQueueCount, setBackgroundQueueCount] = useState<number>(0);

  // Subscribe to background media sync queue count & handle synced event
  useEffect(() => {
    const unsubscribe = subscribeToMediaQueueChange((count) => {
      setBackgroundQueueCount(count);
    });

    const handleSyncEvent = (e: any) => {
      const detail = e.detail;
      if (detail && detail.fieldKey && detail.driveUrl) {
        if (detail.fieldKey in state) {
          updateField(detail.fieldKey, detail.driveUrl);
        } else if (detail.fieldKey.startsWith('tyre-')) {
          // Tyre image update logic
          const idx = parseInt(detail.fieldKey.replace('tyre-', ''), 10);
          if (!isNaN(idx) && state.tyreDetails && state.tyreDetails[idx]) {
            const updatedTyres = [...state.tyreDetails];
            updatedTyres[idx] = { ...updatedTyres[idx], dotSerialNumberImage: detail.driveUrl };
            updateField('tyreDetails', updatedTyres);
          }
        }
      }
    };

    window.addEventListener('background-media-synced', handleSyncEvent);
    return () => {
      unsubscribe();
      window.removeEventListener('background-media-synced', handleSyncEvent);
    };
  }, [state, updateField]);

  // Compute pending offline photo uploads waiting to be synced to cloud
  const pendingPhotoList = useMemo(() => {
    const list: {
      key: string;
      label: string;
      value: string;
      type: 'direct' | 'tyre' | 'custom';
      index?: number;
    }[] = [];

    const isOffline = (val?: string) => {
      if (!val || typeof val !== 'string') return false;
      const v = val.trim();
      if (!v) return false;
      if (v.startsWith('data:') || v.startsWith('blob:')) return true;
      return !v.startsWith('http://') && !v.startsWith('https://');
    };

    if (isOffline(state.beforeWashingPhoto)) {
      list.push({ key: 'beforeWashingPhoto', label: 'Before Washing Photo', value: state.beforeWashingPhoto, type: 'direct' });
    }
    if (isOffline(state.afterWashingPhoto)) {
      list.push({ key: 'afterWashingPhoto', label: 'After Washing Photo', value: state.afterWashingPhoto, type: 'direct' });
    }
    if (isOffline(state.beforeVideoInventory)) {
      list.push({ key: 'beforeVideoInventory', label: 'Before Video Inventory', value: state.beforeVideoInventory, type: 'direct' });
    }
    if (isOffline(state.beforeVideoTopBody)) {
      list.push({ key: 'beforeVideoTopBody', label: 'Before Video Top Body', value: state.beforeVideoTopBody, type: 'direct' });
    }
    if (isOffline(state.beforeVideoUnderchassis)) {
      list.push({ key: 'beforeVideoUnderchassis', label: 'Before Video Underchassis', value: state.beforeVideoUnderchassis, type: 'direct' });
    }
    if (isOffline(state.afterVideoInterior)) {
      list.push({ key: 'afterVideoInterior', label: 'After Video Interior', value: state.afterVideoInterior, type: 'direct' });
    }
    if (isOffline(state.afterVideoExterior)) {
      list.push({ key: 'afterVideoExterior', label: 'After Video Exterior', value: state.afterVideoExterior, type: 'direct' });
    }
    if (isOffline(state.afterVideoUnderchassis)) {
      list.push({ key: 'afterVideoUnderchassis', label: 'After Video Underchassis', value: state.afterVideoUnderchassis, type: 'direct' });
    }

    if (state.tyreDetails) {
      state.tyreDetails.forEach((tyre: any, idx: number) => {
        if (isOffline(tyre.dotSerialNumberImage)) {
          list.push({
            key: 'dotSerialNumberImage',
            label: `Tyre ${idx + 1} DOT Serial Image`,
            value: tyre.dotSerialNumberImage,
            type: 'tyre',
            index: idx
          });
        }
      });
    }

    if (state.customFieldData) {
      const allCustomFields = serviceTemplates?.flatMap(st => st.customFields || []) || [];
      state.customFieldData.forEach((fieldData: any) => {
        const fieldDef = allCustomFields.find(f => f.id === fieldData.fieldId);
        if (fieldDef?.type === 'PHOTO' && isOffline(fieldData.value as string)) {
          list.push({
            key: fieldData.fieldId,
            label: `${fieldDef.label} (Custom Field)`,
            value: fieldData.value as string,
            type: 'custom'
          });
        }
      });
    }

    return list;
  }, [state, serviceTemplates]);

  const handleSyncPendingPhotos = async () => {
    if (pendingPhotoList.length === 0) {
      toast.info('No pending offline photo uploads to sync.');
      return;
    }

    if (!googleDriveUploadUrl) {
      toast.error('Google Drive Upload URL is not configured in Settings.');
      return;
    }

    if (!state.carNumber || !state.carNumber.trim()) {
      toast.error('Car Registration Number is required to upload photos to Google Drive. Please complete Customer Details first.');
      return;
    }

    setIsSyncingPhotos(true);
    let successCount = 0;
    let failCount = 0;

    const dataURLtoFile = (dataurl: string, filename: string): File => {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(arr[1] || arr[0]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    };

    for (const item of pendingPhotoList) {
      try {
        let fileObj: File;
        if (item.value.startsWith('data:')) {
          fileObj = dataURLtoFile(item.value, `${item.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`);
        } else if (item.value.startsWith('blob:')) {
          const res = await fetch(item.value);
          const blob = await res.blob();
          fileObj = new File([blob], `${item.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`, { type: blob.type || 'image/png' });
        } else {
          fileObj = dataURLtoFile(`data:image/png;base64,${item.value}`, `${item.label.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`);
        }

        // Apply client-side image compression to reduce file size before cloud upload
        if (fileObj.type.startsWith('image/')) {
          fileObj = await compressImage(fileObj);
        }

        const cloudUrl = await uploadFileToDrive(fileObj, state.carNumber, googleDriveUploadUrl);

        if (item.type === 'direct') {
          updateField(item.key as keyof Service, cloudUrl);
        } else if (item.type === 'tyre' && item.index !== undefined) {
          const updatedTyres = [...(state.tyreDetails || [])];
          if (updatedTyres[item.index]) {
            updatedTyres[item.index] = { ...updatedTyres[item.index], dotSerialNumberImage: cloudUrl };
            updateField('tyreDetails', updatedTyres);
          }
        } else if (item.type === 'custom') {
          const updatedCustom = (state.customFieldData || []).map((cf: any) => {
            if (cf.fieldId === item.key) {
              return { ...cf, value: cloudUrl };
            }
            return cf;
          });
          updateField('customFieldData', updatedCustom);
        }
        successCount++;
      } catch (err) {
        console.error(`Error syncing photo "${item.label}":`, err);
        failCount++;
      }
    }

    setIsSyncingPhotos(false);
    if (successCount > 0) {
      toast.success(`Synced ${successCount} photo(s) to cloud storage!`);
    }
    if (failCount > 0) {
      toast.error(`Failed to sync ${failCount} photo(s). Please verify network and drive upload settings.`);
    }
  };

  // Load draft from IndexedDB on mount if no initialService is provided
  useEffect(() => {
    const restoreDraft = async () => {
      if (!initialService) {
        try {
          const savedDraft = await getIndexedDbItem<Service | null>('service_form_in_progress', null);
          if (savedDraft) {
            dispatch({ type: 'SET_FORM_DATA', payload: savedDraft });
            if (savedDraft.timestamp) {
              setLastSaved(new Date(savedDraft.timestamp));
            } else {
              setLastSaved(new Date());
            }
            toast.success('Restored service draft from previous session!');
          }
        } catch (err) {
          console.error('Failed to restore draft from IndexedDB:', err);
        }
      }
    };
    restoreDraft();
  }, [initialService, dispatch]);

  // Debounced auto-save to IndexedDB every 5 seconds on state change
  useEffect(() => {
    if (initialService && initialService.status !== ServiceStatus.Draft) {
      return;
    }

    // Do not save if it's the exact initial empty state
    if (!state.customerFirstName && !state.customerLastName && state.serviceSelection.length === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        const cleaned = JSON.parse(JSON.stringify(state));
        // Strip base64 before saving draft to keep IndexedDB clean
        const stripBase64 = (obj: any) => {
          if (typeof obj !== 'object' || !obj) return;
          for (const key in obj) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('data:') && obj[key].length > 5000) {
              obj[key] = "";
            } else if (typeof obj[key] === 'object') {
              stripBase64(obj[key]);
            }
          }
        };
        stripBase64(cleaned);
        cleaned.timestamp = new Date().toISOString();

        await setIndexedDbItem('service_form_in_progress', cleaned);
        setLastSaved(new Date());
      } catch (err) {
        console.error('Error auto-saving draft to IndexedDB:', err);
      } finally {
        setIsSaving(false);
      }
    }, 5000); // 5 seconds debounce as requested

    return () => clearTimeout(timer);
  }, [state, initialService]);

  const isAdminEditing = useMemo(() => 
    currentUser.permissions.includes(Permission.CAN_EDIT_ANY_ORDER) && !!initialService,
  [currentUser, initialService]);

  useEffect(() => {
    if (initialService) {
      const cloned = JSON.parse(JSON.stringify(initialService));
      if (cloned.scheduledDate) {
        cloned.scheduledDate = toISTDateString(cloned.scheduledDate);
      }
      dispatch({ type: 'SET_FORM_DATA', payload: cloned });
    }
  }, [initialService, dispatch]);


  const sortedSubmissions = useMemo(() => {
    return [...allSubmissions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [allSubmissions]);

  const handlePrefillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setPrefillServiceId(selectedId);

    if (!selectedId) return;

    const serviceToCopy = allSubmissions.find(s => s.submissionId === selectedId);
    if (!serviceToCopy) return;

    const newSubmissionId = `SUB-${Date.now()}`;
    const newServiceData: Service = {
      ...JSON.parse(JSON.stringify(serviceToCopy)),
      submissionId: newSubmissionId,
      appointmentId: newSubmissionId,
      timestamp: new Date().toISOString(),
      status: ServiceStatus.Draft,
      acknowledgement: false,
      beforeWashingPhoto: '', beforeVideoInventory: '', beforeVideoTopBody: '', beforeVideoUnderchassis: '',
      afterWashingPhoto: '', afterVideoInterior: '', afterVideoExterior: '', afterVideoUnderchassis: '',
      tyreDetails: [],
      batteryDetails: [],
      customFieldData: (serviceToCopy.customFieldData || []).filter(field => {
          const allCustomFields = serviceTemplates.flatMap(st => st.customFields);
          const fieldDef = allCustomFields.find(f => f.id === field.fieldId);
          return fieldDef?.type !== 'PHOTO';
      }),
      assignedTo: undefined,
      scheduledDate: undefined,
      scheduledTime: undefined,
      internalNotes: '',
      isFollowUp: true,
      dependsOn: [], // Dependencies should not be copied
    };

    dispatch({ type: 'SET_FORM_DATA', payload: newServiceData });
  };


  const visibleSteps = useMemo(() => {
    return ALL_STEPS.map((step, index) => ({...step, originalIndex: index}))
                     .filter(step => step.isVisible(state, serviceTemplates));
  }, [state, serviceTemplates]);

  // Keep currentStepIndex in bounds if steps change dynamically
  useEffect(() => {
    if (currentStepIndex >= visibleSteps.length && visibleSteps.length > 0) {
      setCurrentStepIndex(visibleSteps.length - 1);
    }
  }, [visibleSteps.length, currentStepIndex]);

  const currentStep = visibleSteps[currentStepIndex] || visibleSteps[0];
  const StepComponent = currentStep?.component;

  const handleStepClick = (index: number) => {
    if (isAdminEditing || currentUser.role === 'admin' || index < currentStepIndex) {
      setErrors({}); 
      setCurrentStepIndex(index);
    }
  };

  const nextStep = () => {
    const currentStepName = visibleSteps[currentStepIndex].name;
    const validationErrors = validateStep(currentStepName, state, currentUser);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      setCurrentStepIndex(prev => Math.min(prev + 1, visibleSteps.length - 1));
    } else {
      console.warn("Step validation failed:", currentStepName, validationErrors);
      const firstErrorMsg = Object.values(validationErrors).find(e => typeof e === 'string');
      if (firstErrorMsg) {
        toast.error(firstErrorMsg as string);
      } else {
        toast.error("Please fill in all required fields before proceeding.");
      }
    }
  };
  
  const prevStep = () => {
    setErrors({}); 
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  };

  // Intercept Android hardware back button & swipe-to-go-back gesture
  useAndroidBackButton(() => {
    if (isLightboxOpen) {
      setIsLightboxOpen(false);
      return true;
    }
    if (currentStepIndex > 0) {
      prevStep();
      return true;
    }
    return false;
  }, currentStepIndex > 0 || isLightboxOpen, 40);
  
  const handleSubmit = async () => {
    if (state.acknowledgement) {
      localStorage.removeItem('service_form_in_progress');
      try {
        await db.keyValueStore.delete('service_form_in_progress');
      } catch (err) {
        console.error('Failed to clear draft from IndexedDB:', err);
      }
      const finalCompletedState: Service = {
        ...state,
        status: state.status === ServiceStatus.Cancelled ? ServiceStatus.Cancelled : ServiceStatus.Completed
      };
      onComplete(finalCompletedState);
    }
  };

  const handleSaveDraftClick = async () => {
    localStorage.removeItem('service_form_in_progress');
    try {
      await db.keyValueStore.delete('service_form_in_progress');
    } catch (err) {
      console.error('Failed to clear draft from IndexedDB:', err);
    }
    onSaveDraft(state);
  };

  const handleAdminSave = () => {
    const handler = onAdminUpdate || onComplete;
    if (handler) {
      handler(state);
    }
    setSaveConfirmation('Changes saved successfully!');
    setTimeout(() => setSaveConfirmation(''), 2500);
  };

  const handleExitClick = async () => {
    localStorage.removeItem('service_form_in_progress');
    try {
      await db.keyValueStore.delete('service_form_in_progress');
    } catch (err) {
      console.error('Failed to clear draft from IndexedDB:', err);
    }
    onExit();
  };

  const handleUpdateDependencies = useCallback((newDeps: string[]) => {
    updateField('dependsOn', newDeps);
  }, [updateField]);

  const isLastStep = currentStepIndex === visibleSteps.length - 1;

  const showDraftButton = (!initialService || initialService?.status === ServiceStatus.Draft);

  return (
    <Card className={!isAdminEditing ? "pb-24 sm:pb-6" : ""}>
      {/* Auto-save Status Indicator Bar */}
      {(!initialService || initialService.status === ServiceStatus.Draft) && (
        <div className="flex justify-between items-center px-4 py-2 mb-4 bg-slate-50 border border-slate-200/50 rounded-xl text-xs font-semibold text-slate-500 no-print">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSaving ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSaving ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
            </span>
            {isSaving ? (
              <span className="text-amber-700 animate-pulse">Auto-saving progress to local storage...</span>
            ) : (
              <span className="text-emerald-700 font-bold">Draft secure in local database</span>
            )}
          </div>
          {lastSaved && (
            <span className="text-slate-400">
              Last auto-save: {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Offline Pending Photos Sync Banner */}
      <div className={`mb-6 p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print ${
        pendingPhotoList.length > 0
          ? 'bg-amber-50/90 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/60'
          : 'bg-slate-50 border-slate-200/80 dark:bg-slate-800/40 dark:border-slate-700/60'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg flex-shrink-0 ${
            pendingPhotoList.length > 0
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
          }`}>
            {pendingPhotoList.length > 0 ? (
              <IconCloudUpload className="w-5 h-5 text-amber-700 animate-bounce" />
            ) : (
              <IconCloudCheck className="w-5 h-5 text-emerald-600" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Cloud Photo Sync Status
              </h4>
              {pendingPhotoList.length > 0 ? (
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-full bg-amber-500 text-white shadow-xs">
                  {pendingPhotoList.length} Pending Photo{pendingPhotoList.length > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-600 text-white shadow-xs">
                  All Synced
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {pendingPhotoList.length > 0
                ? `${pendingPhotoList.length} offline photo upload(s) waiting to be synced to cloud storage.`
                : 'All captured photos are synced to cloud storage.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <Button
            type="button"
            variant={pendingPhotoList.length > 0 ? 'primary' : 'ghost'}
            onClick={handleSyncPendingPhotos}
            disabled={isSyncingPhotos || pendingPhotoList.length === 0}
            className={`text-xs py-1.5 px-3.5 shadow-xs transition-all ${
              pendingPhotoList.length > 0
                ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 font-bold'
                : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSyncingPhotos ? (
              <>
                <IconLoader className="w-4 h-4 mr-1.5 animate-spin" />
                <span>Syncing ({pendingPhotoList.length})...</span>
              </>
            ) : (
              <>
                <IconCloudUpload className="w-4 h-4 mr-1.5" />
                <span>Sync Now</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {!initialService && (
        <div className="p-4 mb-8 bg-slate-50 border border-slate-200 rounded-lg no-print">
          <label htmlFor="prefill-select" className="block text-sm font-medium text-slate-700 mb-1">
            Pre-fill from Existing Service (Optional)
          </label>
          <select
            id="prefill-select"
            value={prefillServiceId}
            onChange={handlePrefillChange}
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:border-brand-accent sm:text-sm"
          >
            <option value="">-- Select a past service to copy data from --</option>
            {sortedSubmissions.map(s => (
              <option key={s.submissionId} value={s.submissionId}>
                {new Date(s.timestamp).toLocaleDateString()} - #{s.appointmentId?.split('-').pop()} - {s.customerFirstName} ({s.carNumber})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-8 pb-4 border-b border-slate-200 no-print">
        <Stepper 
          steps={visibleSteps} 
          currentStepIndex={currentStepIndex} 
          onStepClick={handleStepClick}
          isClickable={isAdminEditing}
        />
      </div>

      {capturedPhotos.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-purple-100 bg-purple-50/20 dark:border-slate-700 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fadeIn no-print">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Captured Photos ({capturedPhotos.length})</h4>
              <p className="text-xs text-slate-400 dark:text-slate-300 mt-0.5">Review before/after inspection photos full screen.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 justify-between sm:justify-end w-full sm:w-auto">
            <div className="flex -space-x-2 overflow-hidden">
              {capturedPhotos.slice(0, 5).map((photo, pIdx) => (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => {
                    setLightboxIndex(pIdx);
                    setIsLightboxOpen(true);
                  }}
                  className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-800 overflow-hidden hover:opacity-90 hover:scale-105 transition-all focus:outline-none"
                  title={photo.label}
                >
                  <img src={photo.url} alt={photo.label} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
              {capturedPhotos.length > 5 && (
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 ring-2 ring-white dark:ring-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300 font-mono">
                  +{capturedPhotos.length - 5}
                </div>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => {
                setLightboxIndex(0);
                setIsLightboxOpen(true);
              }}
              className="bg-white hover:bg-slate-50 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 text-xs py-1.5 px-3"
            >
              <Maximize2 className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
              Review Fullscreen
            </Button>
          </div>
        </div>
      )}

      {initialService && (
        <div className="mb-8 no-print">
          <OrderTimeline service={state} />
        </div>
      )}
      
      {isAdminEditing && (
        <div className="sticky top-[63px] bg-slate-100/80 backdrop-blur-md z-20 -mx-6 px-6 -mt-8 mb-8">
            <div className="flex justify-between items-center h-16 border-b">
                 <Button variant="ghost" onClick={handleExitClick}>Exit to Dashboard</Button>
                 <div className="flex items-center space-x-3">
                    {saveConfirmation && <p className="text-sm font-semibold text-green-600 animate-pulse">{saveConfirmation}</p>}
                    <Button variant="secondary" onClick={() => downloadOrderInvoicePDF(state)}>
                        <FileText className="w-4 h-4 mr-2 text-blue-600" />
                        Download PDF
                    </Button>
                    <Button onClick={handleAdminSave}>
                        <IconDeviceFloppy className="w-5 h-5 mr-2" />
                        Save Changes
                    </Button>
                 </div>
            </div>
        </div>
      )}

      {isAdminEditing && (
        <div className="p-4 mb-8 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-800 mb-4">Admin Controls</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label htmlFor="assignedTo" className="block text-sm font-medium text-slate-700 mb-1">Primary Technician</label>
              <select
                id="assignedTo"
                name="assignedTo"
                value={state.assignedTo || ''}
                onChange={(e) => updateField('assignedTo', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm"
              >
                <option value="">-- Unassigned --</option>
                {allUsers.map(u => <option key={u.username} value={u.username}>🔧 {u.username}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="secondaryAssignee" className="block text-sm font-medium text-slate-700 mb-1">Helper / Labour</label>
              <select
                id="secondaryAssignee"
                name="secondaryAssignee"
                value={state.secondaryAssignee || ''}
                onChange={(e) => updateField('secondaryAssignee', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm"
              >
                <option value="">-- None --</option>
                {allUsers.filter(u => u.username !== state.assignedTo).map(u => <option key={u.username} value={u.username}>🤝 {u.username}</option>)}
              </select>
            </div>
            <Input 
                label="Scheduled Date" 
                id="scheduledDate" 
                type="date" 
                value={state.scheduledDate ? toISTDateString(state.scheduledDate) : ''} 
                onChange={(e) => updateField('scheduledDate', e.target.value)}
            />
            <div>
              <label htmlFor="scheduledTime" className="block text-sm font-medium text-slate-700 mb-1">Scheduled Time</label>
              <select
                  id="scheduledTime"
                  name="scheduledTime"
                  value={state.scheduledTime || ''}
                  onChange={(e) => updateField('scheduledTime', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm"
              >
                  <option value="">-- No Time Set --</option>
                  {APPOINTMENT_TIME_SLOTS.map(time => (
                      <option key={time} value={time}>{time}</option>
                  ))}
              </select>
            </div>
             <div>
                <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                    id="status"
                    name="status"
                    value={state.status}
                    onChange={(e) => updateField('status', e.target.value as ServiceStatus)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm"
                >
                    {Object.values(ServiceStatus).map(status => (
                        <option key={status} value={status}>{status}</option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor="priority" className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select
                    id="priority"
                    name="priority"
                    value={state.priority || 'Medium'}
                    onChange={(e) => updateField('priority', e.target.value as ServicePriority)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus:border-brand-accent sm:text-sm"
                >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                </select>
            </div>
          </div>
           <div className="mt-6 pt-4 border-t">
              <DependencyManager 
                  service={state}
                  allSubmissions={allSubmissions}
                  onUpdateDependencies={handleUpdateDependencies}
              />
            </div>
        </div>
      )}

      {/* Order Tags & Custom Labels (VIP, Urgent, Return-Visit, etc.) */}
      <div className="mb-6">
        <OrderTagsManager
          tags={state.tags || []}
          onChange={(newTags) => updateField('tags', newTags)}
        />
      </div>

      <div className="p-4 mb-8 bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900/60 rounded-xl">
          <h3 className="text-base font-extrabold text-yellow-900 dark:text-yellow-200 mb-1 flex items-center gap-2">
            <span>Internal Notes & Agent Remarks</span>
          </h3>
          <p className="text-xs text-yellow-700 dark:text-yellow-300/80 mb-3 font-medium">
            These internal remarks are persisted as part of the order record for administrators, managers, and service agents.
          </p>
          <textarea
              id="internalNotes"
              name="internalNotes"
              value={state.internalNotes || ''}
              onChange={(e) => updateField('internalNotes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-xs border border-yellow-300 dark:border-yellow-800/80 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-yellow-500 font-sans"
              placeholder="Append or edit internal notes for this service order (e.g. customer request, specific tool needed, access codes)..."
          />
      </div>

      <div className="min-h-[300px]">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">{currentStep?.name || 'Service Details'}</h2>
        {isLastStep ? (
          <SummaryStep state={state} updateField={updateField} serviceTemplates={serviceTemplates} dispatch={dispatch} currentUser={currentUser} />
        ) : StepComponent ? (
          <StepComponent 
            state={state} 
            updateField={updateField} 
            dispatch={dispatch} 
            googleDriveUploadUrl={googleDriveUploadUrl}
            userSubscriptions={userSubscriptions}
            serviceTemplates={serviceTemplates}
            errors={errors}
            allSubmissions={allSubmissions}
            vehicleData={vehicleData}
            tyreData={tyreData}
            onUpdateVehicleData={onUpdateVehicleData}
            onUpdateTyreData={onUpdateTyreData}
            pricingConfig={pricingConfig}
            deliveryHubs={deliveryHubs}
            productRules={productRules}
            inventoryItems={inventoryItems}
            customerBook={customerBook}
            predefinedServices={predefinedServices}
            predefinedServiceCategories={predefinedServiceCategories}
            currentUser={currentUser}
          />
        ) : null}
      </div>
      
      {!isAdminEditing && (
          <div 
            className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 shadow-2xl z-30 flex flex-col-reverse gap-y-3 sm:static sm:bg-transparent sm:border-t-0 sm:shadow-none sm:flex-row sm:justify-between sm:items-center sm:p-0 sm:mt-8 sm:pt-6 no-print bottom-action-bar"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center justify-between sm:justify-start space-x-2 w-full sm:w-auto">
                {currentStepIndex > 0 && (
                    <Button variant="secondary" onClick={prevStep} className="flex-1 sm:flex-none min-h-[48px] sm:min-h-0 text-sm font-bold">Back</Button>
                )}
                <Button variant="ghost" onClick={handleExitClick} className="flex-1 sm:flex-none text-center min-h-[48px] sm:min-h-0 text-sm font-semibold">Exit</Button>
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              {showDraftButton && (
                <Button variant="ghost" onClick={handleSaveDraftClick} className="hidden sm:inline-flex min-h-[48px] sm:min-h-0">Save as Draft</Button>
              )}

              {!isLastStep && (
                <Button onClick={nextStep} className="w-full sm:w-auto justify-center min-h-[48px] sm:min-h-0 text-base sm:text-sm font-bold shadow-md">Next</Button>
              )}

              {isLastStep && (
                <Button onClick={handleSubmit} disabled={!state.acknowledgement} className="w-full sm:w-auto justify-center min-h-[48px] sm:min-h-0 text-base sm:text-sm font-bold shadow-md">
                    Complete Order
                </Button>
              )}
            </div>
          </div>
      )}
      
      {isAdminEditing && (
        <div className="mt-8 pt-6 border-t border-slate-200 flex justify-between items-center no-print">
            <div>
                {currentStepIndex > 0 && (
                    <Button variant="secondary" onClick={prevStep}>Back</Button>
                )}
            </div>
            
            {!isLastStep && (
                <Button onClick={nextStep}>Next</Button>
            )}
        </div>
      )}

      <Lightbox
        images={capturedPhotos}
        initialIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
      />

    </Card>
  );
};

export default ServiceForm;
