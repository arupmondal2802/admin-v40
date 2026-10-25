
import { useReducer, useMemo, useCallback, useEffect } from 'react';
import { Service, ServiceStatus, TyreDetail, BatteryDetail, CustomService, CategorizedAddon, VehicleCategoryTag, DynamicAddon, PricingConfig } from '../types';
import { SERVICE_PRICES, ADDON_CATEGORIES, DEFAULT_WASH_PRICING_MATRIX, DEFAULT_CAR_CARE_PRICING_MATRIX, DEFAULT_ADDON_PRICING_MATRIX, DEFAULT_PRICING_CONFIG, calculateTravelCharges } from '../constants';

type FormAction =
  | { type: 'UPDATE_FIELD'; field: keyof Service; value: any }
  | { type: 'SET_FORM_DATA'; payload: Service }
  | { type: 'ADD_TYRE_DETAIL' }
  | { type: 'REMOVE_TYRE_DETAIL'; index: number }
  | { type: 'UPDATE_TYRE_DETAIL'; index: number; field: keyof TyreDetail; value: any }
  | { type: 'ADD_BATTERY_DETAIL' }
  | { type: 'REMOVE_BATTERY_DETAIL'; index: number }
  | { type: 'UPDATE_BATTERY_DETAIL'; index: number; field: keyof BatteryDetail; value: any }
  | { type: 'ADD_CUSTOM_SERVICE' }
  | { type: 'REMOVE_CUSTOM_SERVICE'; index: number }
  | { type: 'UPDATE_CUSTOM_SERVICE'; index: number; field: keyof CustomService; value: any }
  | { type: 'ADD_CATEGORIZED_ADDON' }
  | { type: 'REMOVE_CATEGORIZED_ADDON'; index: number }
  | { type: 'UPDATE_CATEGORIZED_ADDON'; index: number; field: keyof CategorizedAddon; value: any }
  | { type: 'UPDATE_DYNAMIC_ADDON_QTY'; name: string; quantity: number }
  | { type: 'UPDATE_CUSTOM_FIELD_DATA'; fieldId: string; value: string | number }
  | { type: 'ADD_TAG'; tag: string }
  | { type: 'REMOVE_TAG'; tag: string };

const normalizeServiceData = (service: Service): Service => {
  return {
    ...service,
    carwashQuantity: service.carwashQuantity ?? 1,
    serviceSelection: Array.isArray(service.serviceSelection) ? service.serviceSelection : [],
    tags: Array.isArray(service.tags) ? service.tags : [],
    tyreDetails: Array.isArray(service.tyreDetails) ? service.tyreDetails : [],
    batteryDetails: Array.isArray(service.batteryDetails) ? service.batteryDetails : [],
    dynamicAddons: Array.isArray(service.dynamicAddons) ? service.dynamicAddons : [],
    categorizedAddons: Array.isArray(service.categorizedAddons) ? service.categorizedAddons : [],
    customServices: Array.isArray(service.customServices) ? service.customServices : [],
    customFieldData: Array.isArray(service.customFieldData) ? service.customFieldData : [],
    dependsOn: Array.isArray(service.dependsOn) ? service.dependsOn : [],
  };
};

const createInitialState = (initialService?: Service | null): Service => {
  if (initialService) return normalizeServiceData(JSON.parse(JSON.stringify(initialService)));
  const submissionId = `SUB-${Date.now()}`;
  return {
    submissionId, appointmentId: submissionId, timestamp: new Date().toISOString(),
    customerFirstName: '', customerLastName: '', streetAddress: '', mobileNumber: '', carNumber: '', carBrandModel: '',
    vehicleCategoryTag: VehicleCategoryTag.Hatch, serviceSelection: [], isSubscription: false, carWashDetails: undefined, carCareDetails: undefined,
    carwashQuantity: 1,
    beforeWashingPhoto: '', beforeVideoInventory: '', beforeVideoTopBody: '', beforeVideoUnderchassis: '',
    afterWashingPhoto: '', afterVideoInterior: '', afterVideoExterior: '', afterVideoUnderchassis: '',
    tyreReplacementQuantity: 0, tyreReplacementPrice: SERVICE_PRICES.tyreReplacement, tyreReplacementTotalAmount: 0, tyreLaborCost: 0, tyreMaterialCost: 0, tyreDetails: [],
    batteryReplacementQuantity: 0, batteryReplacementTotalAmount: 0, batteryDetails: [],
    dynamicAddons: [], addonsTotal: 0, categorizedAddons: [], categorizedAddonsTotal: 0,
    customServices: [], customServicesTotal: 0, customFieldData: [], grandTotal: 0, acknowledgement: false,
    status: ServiceStatus.Draft, scheduledDate: undefined, scheduledTime: undefined, assignedTo: undefined,
    paymentMode: 'Cash', cashAmount: 0, onlineAmount: 0, paymentNotes: '',
    tags: [],
  };
};

const formReducer = (state: Service, action: FormAction, pricingConfig?: PricingConfig): Service => {
  switch (action.type) {
    case 'UPDATE_FIELD': return { ...state, [action.field]: action.value };
    case 'SET_FORM_DATA': return normalizeServiceData(action.payload);
    case 'ADD_TYRE_DETAIL': return { ...state, tyreDetails: [...(state.tyreDetails || []), { tyreId: `T-${Date.now()}`, relatedServiceId: state.submissionId, dotCode: '', dotSerialNumberImage: '', tyreSize: '', brand: '', model: '' }] };
    case 'REMOVE_TYRE_DETAIL': return { ...state, tyreDetails: (state.tyreDetails || []).filter((_, i) => i !== action.index) };
    case 'UPDATE_TYRE_DETAIL': return { ...state, tyreDetails: (state.tyreDetails || []).map((detail, i) => i === action.index ? { ...detail, [action.field]: action.value } : detail) };
    case 'ADD_BATTERY_DETAIL': return { ...state, batteryDetails: [...(state.batteryDetails || []), { batteryId: `B-${Date.now()}`, relatedServiceId: state.submissionId, serialNumber: '', brand: '', exchangeValue: 0, newBatteryAmount: 0 }] };
    case 'REMOVE_BATTERY_DETAIL': return { ...state, batteryDetails: (state.batteryDetails || []).filter((_, i) => i !== action.index) };
    case 'UPDATE_BATTERY_DETAIL': return { ...state, batteryDetails: (state.batteryDetails || []).map((detail, i) => i === action.index ? { ...detail, [action.field]: action.value } : detail) };
    case 'ADD_CUSTOM_SERVICE': return { ...state, customServices: [...(state.customServices || []), { customServiceId: `CS-${Date.now()}`, relatedServiceId: state.submissionId, serviceDescription: '', amount: 0 }] };
    case 'REMOVE_CUSTOM_SERVICE': return { ...state, customServices: (state.customServices || []).filter((_, i) => i !== action.index) };
    case 'UPDATE_CUSTOM_SERVICE': return { ...state, customServices: (state.customServices || []).map((service, i) => i === action.index ? { ...service, [action.field]: action.value } : service) };
    case 'ADD_CATEGORIZED_ADDON': return { ...state, categorizedAddons: [...(state.categorizedAddons || []), { id: `CA-${Date.now()}`, relatedServiceId: state.submissionId, category: ADDON_CATEGORIES[0], productName: '', quantity: 1, amount: 0 }] };
    case 'REMOVE_CATEGORIZED_ADDON': return { ...state, categorizedAddons: (state.categorizedAddons || []).filter((_, i) => i !== action.index) };
    case 'UPDATE_CATEGORIZED_ADDON': return { ...state, categorizedAddons: (state.categorizedAddons || []).map((addon, i) => i === action.index ? { ...addon, [action.field]: action.value } : addon) };
    case 'UPDATE_DYNAMIC_ADDON_QTY':
      {
          const { name, quantity } = action;
          const category = state.vehicleCategoryTag;
          const currentAddons = Array.isArray(state.dynamicAddons) ? [...state.dynamicAddons] : [];
          let price = 0, mrp = 0;
          if (pricingConfig && category) {
             const priceData = pricingConfig.addons[name]?.[category];
             price = priceData?.price || 0; mrp = priceData?.mrp || 0;
          } else if (category) {
             const priceData = DEFAULT_ADDON_PRICING_MATRIX[name as keyof typeof DEFAULT_ADDON_PRICING_MATRIX]?.[category];
             price = priceData?.price || 0; mrp = priceData?.mrp || 0;
          }
          const existingIndex = currentAddons.findIndex(item => item.name === name);
          if (quantity <= 0) return { ...state, dynamicAddons: currentAddons.filter(item => item.name !== name) };
          if (existingIndex > -1) currentAddons[existingIndex] = { ...currentAddons[existingIndex], quantity, price, mrp };
          else currentAddons.push({ name, quantity, price, mrp });
          return { ...state, dynamicAddons: currentAddons };
      }
    case 'UPDATE_CUSTOM_FIELD_DATA':
        {
            const { fieldId, value } = action;
            const existingIndex = (state.customFieldData || []).findIndex(item => item.fieldId === fieldId);
            let newCustomData = [...(state.customFieldData || [])];
            if (value === '' || value === undefined) newCustomData = newCustomData.filter(item => item.fieldId !== fieldId);
            else if (existingIndex > -1) newCustomData[existingIndex] = { ...newCustomData[existingIndex], value };
            else newCustomData.push({ fieldId, value });
            return { ...state, customFieldData: newCustomData };
        }
    case 'ADD_TAG': {
        const cleanTag = (action.tag || '').trim();
        if (!cleanTag) return state;
        const currentTags = Array.isArray(state.tags) ? state.tags : [];
        if (currentTags.some(t => t.toLowerCase() === cleanTag.toLowerCase())) return state;
        return { ...state, tags: [...currentTags, cleanTag] };
    }
    case 'REMOVE_TAG': {
        const currentTags = Array.isArray(state.tags) ? state.tags : [];
        return { ...state, tags: currentTags.filter(t => t.toLowerCase() !== action.tag.toLowerCase()) };
    }
    default: return state;
  }
};

const LOCAL_STORAGE_KEY = 'service_form_in_progress';

// Quota-safe helper for hook
const safeFormPersist = (data: any) => {
    try {
        const cleaned = JSON.parse(JSON.stringify(data));
        // Strip base64 before saving draft
        const stripBase64 = (obj: any) => {
            if (typeof obj !== 'object' || !obj) return;
            for (const key in obj) {
                if (typeof obj[key] === 'string' && obj[key].startsWith('data:') && obj[key].length > 5000) {
                    obj[key] = ""; // Discard large base64 strings in local draft to save space
                } else if (typeof obj[key] === 'object') {
                    stripBase64(obj[key]);
                }
            }
        };
        stripBase64(cleaned);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(cleaned));
    } catch (e) { console.warn("Failed to save form draft", e); }
};

export const useServiceForm = (
  initialService: Service | null | undefined, 
  pricingConfig: PricingConfig = DEFAULT_PRICING_CONFIG,
  customHubs?: any[],
  customRules?: any[],
  customServices?: any[],
  inventoryItems?: any[]
) => {
  const initializer = (initialValue?: Service | null): Service => {
    try {
      const savedFormJson = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedFormJson) {
        const savedFormState: Service = JSON.parse(savedFormJson);
        if (!initialValue || initialValue.submissionId === savedFormState.submissionId) return savedFormState;
      }
    } catch (e) { localStorage.removeItem(LOCAL_STORAGE_KEY); }
    return createInitialState(initialValue);
  };

  const [state, dispatch] = useReducer((state: Service, action: FormAction) => formReducer(state, action, pricingConfig), initialService, initializer);
  useEffect(() => { safeFormPersist(state); }, [state]);
  const updateField = useCallback(<K extends keyof Service>(field: K, value: Service[K]) => { dispatch({ type: 'UPDATE_FIELD', field, value }); }, []);

  useEffect(() => {
    const washType = state.carWashDetails?.washType;
    const category = state.vehicleCategoryTag;
    if (state.isSubscription && state.serviceSelection.includes('Car Washing')) {
      if (state.carWashDetails?.price !== 0) {
        updateField('carWashDetails', { ...state.carWashDetails!, price: 0 });
      }
    } else if (washType && category) {
        let price = 0, mrp = 0;
        const matchedSvc = customServices?.find(s => s.name === washType);
        if (matchedSvc && matchedSvc.pricing?.[category]) {
            price = matchedSvc.pricing[category].price ?? 0;
            mrp = matchedSvc.pricing[category].mrp ?? 0;
        } else if (pricingConfig && pricingConfig.wash[washType]?.[category]) { 
            price = pricingConfig.wash[washType][category].price; 
            mrp = pricingConfig.wash[washType][category].mrp; 
        } else if (DEFAULT_WASH_PRICING_MATRIX[washType as keyof typeof DEFAULT_WASH_PRICING_MATRIX]?.[category]) { 
            price = DEFAULT_WASH_PRICING_MATRIX[washType as keyof typeof DEFAULT_WASH_PRICING_MATRIX][category].price; 
            mrp = DEFAULT_WASH_PRICING_MATRIX[washType as keyof typeof DEFAULT_WASH_PRICING_MATRIX][category].mrp; 
        }
        if (price !== undefined && (state.carWashDetails?.price !== price || state.carWashDetails?.mrp !== mrp)) {
          updateField('carWashDetails', { washType, price, mrp });
        }
    }
  }, [state.carWashDetails?.washType, state.carWashDetails?.price, state.carWashDetails?.mrp, state.vehicleCategoryTag, state.isSubscription, state.serviceSelection, pricingConfig, updateField, customServices]);

  useEffect(() => {
    const careType = state.carCareDetails?.careType;
    const category = state.vehicleCategoryTag;
    if (careType && category) {
        let price = 0, mrp = 0;
        const matchedSvc = customServices?.find(s => s.name === careType);
        if (matchedSvc && matchedSvc.pricing?.[category]) {
            price = matchedSvc.pricing[category].price ?? 0;
            mrp = matchedSvc.pricing[category].mrp ?? 0;
        } else if (pricingConfig && pricingConfig.carCare[careType]?.[category]) { 
            price = pricingConfig.carCare[careType][category].price; 
            mrp = pricingConfig.carCare[careType][category].mrp; 
        } else if (DEFAULT_CAR_CARE_PRICING_MATRIX[careType as keyof typeof DEFAULT_CAR_CARE_PRICING_MATRIX]?.[category]) { 
            price = DEFAULT_CAR_CARE_PRICING_MATRIX[careType as keyof typeof DEFAULT_CAR_CARE_PRICING_MATRIX][category].price; 
            mrp = DEFAULT_CAR_CARE_PRICING_MATRIX[careType as keyof typeof DEFAULT_CAR_CARE_PRICING_MATRIX][category].mrp; 
        }
        if (price !== undefined && (state.carCareDetails?.price !== price || state.carCareDetails?.mrp !== mrp)) {
          updateField('carCareDetails', { careType, price, mrp });
        }
    }
  }, [state.carCareDetails?.careType, state.carCareDetails?.price, state.carCareDetails?.mrp, state.vehicleCategoryTag, pricingConfig, updateField, customServices]);

  useEffect(() => {
      const category = state.vehicleCategoryTag;
      if (!category || !state.dynamicAddons || state.dynamicAddons.length === 0) return;
      const updatedAddons = state.dynamicAddons.map(addon => {
          let price = 0, mrp = 0;
          if (pricingConfig && pricingConfig.addons[addon.name]?.[category]) { price = pricingConfig.addons[addon.name][category].price; mrp = pricingConfig.addons[addon.name][category].mrp; }
          else { const priceData = DEFAULT_ADDON_PRICING_MATRIX[addon.name as keyof typeof DEFAULT_ADDON_PRICING_MATRIX]?.[category]; price = priceData?.price || 0; mrp = priceData?.mrp || 0; }
          return { ...addon, price, mrp };
      });
      if (JSON.stringify(updatedAddons) !== JSON.stringify(state.dynamicAddons)) updateField('dynamicAddons', updatedAddons);
  }, [state.vehicleCategoryTag, state.dynamicAddons, pricingConfig, updateField]);

  // Auto-sync tyreDetails array with tyreReplacementQuantity
  useEffect(() => {
    const qty = state.tyreReplacementQuantity || 0;
    const current = state.tyreDetails || [];
    if (qty !== current.length) {
      let updated = [...current];
      if (qty > current.length) {
        for (let i = current.length; i < qty; i++) {
          updated.push({
            tyreId: `T-${Date.now()}-${i}`,
            relatedServiceId: state.submissionId,
            dotCode: '',
            dotSerialNumberImage: '',
            tyreSize: '',
            brand: '',
            model: '',
            tyreNumber: '',
            pricePerTyre: state.tyreReplacementPrice || 0,
            balancingPrice: 0,
          });
        }
      } else if (qty < current.length) {
        updated = updated.slice(0, qty);
      }
      updateField('tyreDetails', updated);
    }
  }, [state.tyreReplacementQuantity, state.tyreDetails?.length, state.submissionId, state.tyreReplacementPrice, updateField]);

  // Auto-sync batteryDetails array with batteryReplacementQuantity
  useEffect(() => {
    const qty = state.batteryReplacementQuantity || 0;
    const current = state.batteryDetails || [];
    if (qty !== current.length) {
      let updated = [...current];
      if (qty > current.length) {
        for (let i = current.length; i < qty; i++) {
          updated.push({
            batteryId: `B-${Date.now()}-${i}`,
            relatedServiceId: state.submissionId,
            serialNumber: '',
            brand: '',
            model: '',
            exchangeValue: 0,
            newBatteryAmount: 0,
            batteryPhoto: '',
          });
        }
      } else if (qty < current.length) {
        updated = updated.slice(0, qty);
      }
      updateField('batteryDetails', updated);
    }
  }, [state.batteryReplacementQuantity, state.batteryDetails?.length, state.submissionId, updateField]);

  // Tyre Total Amount calculation
  useEffect(() => {
    let total = 0;
    if (state.tyreDetails && state.tyreDetails.length > 0) {
      total = state.tyreDetails.reduce((sum, t) => {
        const itemPrice = t.pricePerTyre !== undefined ? t.pricePerTyre : (state.tyreReplacementPrice || 0);
        const itemBalancing = t.balancingPrice || 0;
        return sum + itemPrice + itemBalancing;
      }, 0);
    } else {
      total = state.tyreReplacementQuantity * (state.tyreReplacementPrice || 0);
    }
    if (state.tyreReplacementTotalAmount !== total) {
      updateField('tyreReplacementTotalAmount', total);
    }
  }, [state.tyreDetails, state.tyreReplacementQuantity, state.tyreReplacementPrice, state.tyreReplacementTotalAmount, updateField]);

  // Battery Total Amount calculation
  useEffect(() => {
    let total = 0;
    if (state.batteryDetails && state.batteryDetails.length > 0) {
      total = state.batteryDetails.reduce((t, b) => t + Math.max(0, (b.newBatteryAmount || 0) - (b.exchangeValue || 0)), 0);
    }
    if (state.batteryReplacementTotalAmount !== total) {
      updateField('batteryReplacementTotalAmount', total);
    }
  }, [state.batteryDetails, state.batteryReplacementTotalAmount, updateField]);

  useEffect(() => {
    const daTotal = (state.dynamicAddons || []).reduce((t, i) => t + (i.price * i.quantity), 0);
    const caTotal = (state.categorizedAddons || []).reduce((s, a) => s + ((a.quantity || 0) * (a.amount || 0)), 0);
    if (state.categorizedAddonsTotal !== caTotal) {
      updateField('categorizedAddonsTotal', caTotal);
    }
    if (state.addonsTotal !== daTotal + caTotal) {
      updateField('addonsTotal', daTotal + caTotal);
    }
  }, [state.dynamicAddons, state.categorizedAddons, state.categorizedAddonsTotal, state.addonsTotal, updateField]);

  useEffect(() => {
    const total = (state.customServices || []).reduce((s, ser) => s + Number(ser.amount || 0), 0);
    if (state.customServicesTotal !== total) {
      updateField('customServicesTotal', total);
    }
  }, [state.customServices, state.customServicesTotal, updateField]);

  const totalTravelCharge = useMemo(() => {
    const res = calculateTravelCharges(
      state.serviceSelection,
      state.customerLatitude,
      state.customerLongitude,
      state.carWashDetails?.washType,
      state.carCareDetails?.careType,
      customHubs,
      customRules,
      customServices
    );
    return res.totalTravelCharge;
  }, [state.serviceSelection, state.customerLatitude, state.customerLongitude, state.carWashDetails?.washType, state.carCareDetails?.careType, customHubs, customRules, customServices]);

  const grandTotal = useMemo(() => {
    let t = 0;
    if (state.serviceSelection.includes("Car Washing")) t += state.carWashDetails?.price || 0;
    if (state.serviceSelection.includes("Car Care")) t += state.carCareDetails?.price || 0;
    if (state.serviceSelection.includes("Tyre Replacement")) t += state.tyreReplacementTotalAmount;
    if (state.serviceSelection.includes("Battery Replacement")) t += state.batteryReplacementTotalAmount;
    t += state.addonsTotal; t += state.customServicesTotal;
    t += totalTravelCharge;
    return t;
  }, [state.serviceSelection, state.carWashDetails, state.carCareDetails, state.tyreReplacementTotalAmount, state.batteryReplacementTotalAmount, state.addonsTotal, state.customServicesTotal, totalTravelCharge]);

  useEffect(() => {
    if (state.travelCharge !== totalTravelCharge) {
      updateField('travelCharge', totalTravelCharge);
    }
  }, [totalTravelCharge, state.travelCharge, updateField]);

  useEffect(() => {
    if (state.grandTotal !== grandTotal) {
      updateField('grandTotal', grandTotal);
    }
  }, [grandTotal, state.grandTotal, updateField]);

  return { state, dispatch, updateField };
};
