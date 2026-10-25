import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Customer, UserSubscription, SubscriptionPlan, ServiceTemplate, Service, VehicleCategoryTag, User, Settings, ServicePriority, CarDatabaseItem, CustomerBookEntry } from '../../types';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { APPOINTMENT_TIME_SLOTS, VEHICLE_CATEGORY_TAGS } from '../../constants';
import { findCustomerByMobile, searchExistingCustomers, findExistingCustomersByMobilePrefix, fetchCustomerByMobileFromApi, ExistingCustomerProfile } from '../../services/customerService';
import { toast } from 'sonner';
import RecentVehicleActivitySummary from './RecentVehicleActivitySummary';
import { toISTDateString, getLocalTodayStr } from '../../utils/dateTimeUtils';
import * as authService from '../../services/authService';
import VehicleSelector from '../VehicleSelector';
import { getCategoryForVehicle } from '../../services/vehicleService';
import LocationPickerModal from '../ui/LocationPickerModal';
import AddressAutofillSection from '../ui/AddressAutofillSection';
import OrderTagsManager from '../ui/OrderTagsManager';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { 
  WASH_TYPES, 
  CAR_CARE_TYPES, 
  DYNAMIC_ADDON_NAMES, 
  DEFAULT_WASH_PRICING_MATRIX, 
  DEFAULT_CAR_CARE_PRICING_MATRIX, 
  DEFAULT_ADDON_PRICING_MATRIX,
  calculateTravelCharges,
  findNearestHub
} from '../../constants';
import {
  User as UserIcon,
  Phone,
  Mail,
  Car,
  MapPin,
  Calendar,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Save,
  Briefcase,
  Tag,
  Zap,
  Check,
  Plus,
  Minus,
  X,
  FileText,
  ChevronRight,
  ChevronLeft,
  Award,
  Info,
  Percent,
  Navigation,
  Loader2,
  Wrench,
  Search,
  Compass,
  AlertTriangle,
  Receipt,
  CheckCircle,
  Layers,
  BatteryCharging,
  Disc,
  Package
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateOrder: (details: { 
    customer: Pick<Customer, 'firstName' | 'lastName' | 'mobileNumber' | 'carNumber' | 'carBrandModel' | 'streetAddress' | 'customerEmail' | 'latitude' | 'longitude' | 'eLoc' | 'distanceKm'>, 
    scheduledDate?: string, 
    scheduledTime?: string, 
    serviceSelection: string[], 
    vehicleCategoryTag?: VehicleCategoryTag,
    assignedTo?: string,
    secondaryAssignee?: string,
    isSubscription?: boolean,
    priority?: ServicePriority,
    carWashDetails?: { washType: string; price: number; mrp: number },
    carCareDetails?: { careType: string; price: number; mrp: number },
    dynamicAddons?: { name: string; quantity: number; price: number; mrp: number }[],
    addonsTotal?: number,
    tyreReplacementQuantity?: number,
    tyreReplacementPrice?: number,
    tyreReplacementTotalAmount?: number,
    batteryReplacementQuantity?: number,
    batteryReplacementTotalAmount?: number,
    customServices?: { customServiceId: string; relatedServiceId: string; serviceDescription: string; amount: number }[],
    customServicesTotal?: number,
    grandTotal?: number,
    travelCharge?: number,
    internalNotes?: string,
    tags?: string[]
  }) => Promise<void>;
  userSubscriptions: UserSubscription[];
  subscriptionPlans: SubscriptionPlan[];
  serviceTemplates: ServiceTemplate[];
  allSubmissions: Service[];
  vehicleData: Record<string, string[]>;
  users: Omit<User, 'password'>[];
  settings: Settings;
  deliveryHubs?: any[];
  productRules?: any[];
  predefinedServices?: any[];
  predefinedServiceCategories?: any[];
  inventoryItems?: any[];
  carDatabase?: CarDatabaseItem[];
  customerBook?: CustomerBookEntry[];
  serviceRequests?: any[];
}

const noOp = () => {};
const DRAFT_KEY = 'create_order_modal_draft';

const initialFormState = {
  customer: { 
    firstName: '', 
    lastName: '', 
    mobileNumber: '', 
    carNumber: '', 
    carBrandModel: '', 
    streetAddress: '', 
    houseNo: '',
    streetName: '',
    city: '',
    stateName: '',
    pincode: '',
    customerEmail: '', 
    latitude: undefined as number | undefined, 
    longitude: undefined as number | undefined, 
    eLoc: '' as string | undefined, 
    distanceKm: undefined as number | undefined 
  },
  scheduledDate: '',
  scheduledTime: '',
  serviceSelection: [] as string[],
  vehicleCategoryTag: undefined as VehicleCategoryTag | undefined,
  assignedTo: '',
  secondaryAssignee: '',
  priority: 'Medium' as ServicePriority,
  internalNotes: '',
  tags: [] as string[]
};

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectAddress: (address: string, lat: number, lng: number, distanceKm: number) => void;
  customHubs?: any[];
  error?: string;
  apiKey: string;
}

const AutocompleteInput: React.FC<Omit<GoogleAddressAutocompleteProps, 'apiKey'>> = ({
  value,
  onChange,
  onSelectAddress,
  customHubs,
  error,
}) => {
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const geocoder = useMemo(() => {
    if (geocodingLib) return new geocodingLib.Geocoder();
    if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
      return new window.google.maps.Geocoder();
    }
    return null;
  }, [geocodingLib]);

  useEffect(() => {
    if (!value || !value.trim() || !showDropdown) {
      if (!value || !value.trim()) {
        setPredictions([]);
      }
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);

      const AutocompleteSuggestionClass =
        (placesLib as any)?.AutocompleteSuggestion ||
        (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteSuggestion);

      if (AutocompleteSuggestionClass && typeof AutocompleteSuggestionClass.fetchAutocompleteSuggestions === 'function') {
        try {
          let response = await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({
            input: value,
            includedRegionCodes: ['in'],
          });

          if (!response?.suggestions || response.suggestions.length === 0) {
            response = await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({ input: value });
          }

          if (response?.suggestions && response.suggestions.length > 0) {
            const mapped = response.suggestions.map((s: any) => {
              const p = s.placePrediction;
              return {
                description: p?.text?.text || p?.structuredFormat?.mainText?.text || value,
                place_id: p?.placeId || '',
                structured_formatting: {
                  main_text: p?.structuredFormat?.mainText?.text || p?.text?.text || value,
                  secondary_text: p?.structuredFormat?.secondaryText?.text || '',
                },
              } as google.maps.places.AutocompletePrediction;
            });
            setPredictions(mapped);
            setIsSearching(false);
            return;
          }
        } catch (e) {
          console.warn('AutocompleteSuggestion fetch error, falling back:', e);
        }
      }

      const AutocompleteServiceClass =
        (placesLib as any)?.AutocompleteService ||
        (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteService);

      if (AutocompleteServiceClass) {
        const service = new AutocompleteServiceClass();
        service.getPlacePredictions(
          {
            input: value,
            componentRestrictions: { country: 'in' },
          },
          (results: any, status: any) => {
            if (status === 'OK' && results && results.length > 0) {
              setPredictions(results);
              setIsSearching(false);
            } else {
              service.getPlacePredictions(
                { input: value },
                (fallbackResults: any, fallbackStatus: any) => {
                  setIsSearching(false);
                  if (fallbackStatus === 'OK' && fallbackResults) {
                    setPredictions(fallbackResults);
                  } else {
                    setPredictions([]);
                  }
                }
              );
            }
          }
        );
      } else {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [value, placesLib, showDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    const activeGeocoder = geocoder || (typeof window !== 'undefined' && window.google?.maps?.Geocoder ? new window.google.maps.Geocoder() : null);
    if (!activeGeocoder) {
      setShowDropdown(false);
      onSelectAddress(prediction.description, 0, 0, 0);
      return;
    }

    setIsSearching(true);
    try {
      activeGeocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        setIsSearching(false);
        setShowDropdown(false);
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
          const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
          const address = results[0].formatted_address || prediction.description;

          const washingHubResult = findNearestHub('washing', lat, lng, customHubs);
          const detailingHubResult = findNearestHub('detailing', lat, lng, customHubs);
          const washDistance = washingHubResult ? washingHubResult.distanceKm : 9999;
          const detailDistance = detailingHubResult ? detailingHubResult.distanceKm : 9999;
          const minDistance = Math.min(washDistance, detailDistance);

          onSelectAddress(address, lat, lng, minDistance === 9999 ? 0 : minDistance);
        } else {
          onSelectAddress(prediction.description, 0, 0, 0);
        }
      });
    } catch (err) {
      console.warn('[CreateOrderModal] Geocode exception:', err);
      setIsSearching(false);
      setShowDropdown(false);
      onSelectAddress(prediction.description, 0, 0, 0);
    }
  };

  return (
    <div className="relative sm:col-span-2" ref={dropdownRef}>
      <Input
        label="Street Address"
        name="streetAddress"
        value={value}
        onChange={(e) => {
          onChange(e);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        error={error}
        suffix={isSearching ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" /> : undefined}
        placeholder="Search doorstep address via Google Maps..."
        autoComplete="off"
      />
      {showDropdown && predictions.length > 0 && (
        <div className="absolute left-0 right-0 z-[100] mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 transition-colors flex items-start gap-2.5 cursor-pointer"
              onClick={() => handleSelect(p)}
            >
              <MapPin className="w-4 h-4 text-indigo-500 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.structured_formatting.main_text}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{p.structured_formatting.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const GoogleAddressAutocomplete: React.FC<GoogleAddressAutocompleteProps> = (props) => {
  const { apiKey, ...rest } = props;
  const effectiveKey =
    apiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  return (
    <APIProvider apiKey={effectiveKey} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
      <AutocompleteInput {...rest} />
    </APIProvider>
  );
};

// Helper to highlight matching initials/digits in suggested customer mobile numbers
const renderHighlightedPhone = (phone: string, queryDigits: string) => {
  const cleanPhoneStr = String(phone || '');
  if (!queryDigits) return cleanPhoneStr;
  const matchIdx = cleanPhoneStr.indexOf(queryDigits);
  if (matchIdx === -1) return cleanPhoneStr;
  return (
    <>
      {cleanPhoneStr.slice(0, matchIdx)}
      <span className="text-indigo-600 dark:text-indigo-400 font-extrabold underline">
        {cleanPhoneStr.slice(matchIdx, matchIdx + queryDigits.length)}
      </span>
      {cleanPhoneStr.slice(matchIdx + queryDigits.length)}
    </>
  );
};

const CreateOrderModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  onCreateOrder, 
  userSubscriptions, 
  subscriptionPlans,
  serviceTemplates, 
  allSubmissions, 
  vehicleData, 
  users, 
  settings,
  deliveryHubs,
  productRules,
  predefinedServices,
  predefinedServiceCategories,
  inventoryItems,
  carDatabase,
  customerBook,
  serviceRequests,
}) => {
  const API_KEY =
    settings?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    return saved ? JSON.parse(saved) : initialFormState;
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [foundProfiles, setFoundProfiles] = useState<Awaited<ReturnType<typeof findCustomerByMobile>> | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addonSearchTerm, setAddonSearchTerm] = useState('');

  // Smart Existing Customer Omnibar State
  const [smartSearchQuery, setSmartSearchQuery] = useState('');
  const [isSmartSearchOpen, setIsSmartSearchOpen] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<ExistingCustomerProfile | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  // Mobile Number Combobox State (Prefix-matching, keyboard navigable, non-destructive)
  const [mobileSuggestions, setMobileSuggestions] = useState<ExistingCustomerProfile[]>([]);
  const [isMobileSuggestionsOpen, setIsMobileSuggestionsOpen] = useState(false);
  const [comboboxActiveIndex, setComboboxActiveIndex] = useState<number>(-1);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Close search dropdown and mobile suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setIsSmartSearchOpen(false);
      }
      if (mobileDropdownRef.current && !mobileDropdownRef.current.contains(event.target as Node)) {
        setIsMobileSuggestionsOpen(false);
        setComboboxActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute smart search results across Customer Book, Submissions, Subscriptions & Leads
  const smartSearchResults = useMemo(() => {
    if (!isSmartSearchOpen && !smartSearchQuery) return [];
    return searchExistingCustomers(smartSearchQuery, allSubmissions, userSubscriptions, customerBook, 8, serviceRequests);
  }, [smartSearchQuery, isSmartSearchOpen, allSubmissions, userSubscriptions, customerBook, serviceRequests]);

  // Autofill customer, address, and vehicle from selected profile
  const selectExistingCustomer = useCallback((profile: ExistingCustomerProfile, vehicleIndex = 0) => {
    const chosenVehicle = profile.savedVehicles[vehicleIndex] || profile.savedVehicles[0];
    const detectedCategory = chosenVehicle 
      ? (chosenVehicle.vehicleCategoryTag || getCategoryForVehicle(chosenVehicle.carBrandModel)) 
      : undefined;

    if (chosenVehicle?.carBrandModel) {
      prevModelRef.current = chosenVehicle.carBrandModel;
    }

    setFormData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        firstName: profile.firstName ? String(profile.firstName) : prev.customer.firstName,
        lastName: profile.lastName ? String(profile.lastName) : prev.customer.lastName,
        mobileNumber: profile.mobileNumber ? String(profile.mobileNumber) : prev.customer.mobileNumber,
        customerEmail: profile.customerEmail ? String(profile.customerEmail) : (prev.customer.customerEmail || ''),
        streetAddress: profile.streetAddress ? String(profile.streetAddress) : (prev.customer.streetAddress || ''),
        houseNo: profile.houseNo ? String(profile.houseNo) : (prev.customer.houseNo || ''),
        streetName: profile.streetName ? String(profile.streetName) : (prev.customer.streetName || ''),
        city: profile.city ? String(profile.city) : (prev.customer.city || ''),
        stateName: profile.stateName ? String(profile.stateName) : (prev.customer.stateName || ''),
        pincode: profile.pincode ? String(profile.pincode) : (prev.customer.pincode || ''),
        latitude: profile.latitude ?? prev.customer.latitude,
        longitude: profile.longitude ?? prev.customer.longitude,
        eLoc: profile.eLoc ?? prev.customer.eLoc,
        distanceKm: profile.distanceKm ?? prev.customer.distanceKm,
        carNumber: chosenVehicle?.carNumber ? String(chosenVehicle.carNumber) : (prev.customer.carNumber || ''),
        carBrandModel: chosenVehicle?.carBrandModel ? String(chosenVehicle.carBrandModel) : (prev.customer.carBrandModel || ''),
      },
      vehicleCategoryTag: detectedCategory || prev.vehicleCategoryTag || VehicleCategoryTag.Hatch
    }));

    setLoadedProfile(profile);
    setSmartSearchQuery('');
    setIsSmartSearchOpen(false);
    setMobileSuggestions([]);
    setIsMobileSuggestionsOpen(false);
    setComboboxActiveIndex(-1);
    setFoundProfiles(null);

    // Clear errors for auto-filled attributes
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.mobileNumber;
      delete copy.firstName;
      delete copy.carNumber;
      delete copy.carBrandModel;
      delete copy.streetAddress;
      return copy;
    });

    if (profile.isSubscriber) {
      setIsSubscriptionWash(true);
      setSearchMessage(`Active subscriber: ${profile.fullName} (${profile.washesRemaining ?? 0} washes remaining).`);
    } else {
      setSearchMessage(`Loaded profile for ${profile.fullName} (${profile.savedVehicles.length} vehicle(s) on file).`);
    }
  }, []);
  
  // Phase & Tab management
  const [currentPhase, setCurrentPhase] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<'wash' | 'care' | 'addons' | 'tyre_battery' | 'others'>('wash');
  
  // Product & Pricing State
  const [selectedWash, setSelectedWash] = useState('');
  const [washPrice, setWashPrice] = useState(0);
  const [washMrp, setWashMrp] = useState(0);
  const [isSubscriptionWash, setIsSubscriptionWash] = useState(false);
  
  const [selectedCare, setSelectedCare] = useState('');
  const [carePrice, setCarePrice] = useState(0);
  const [careMrp, setCareMrp] = useState(0);
  
  const [selectedAddons, setSelectedAddons] = useState<Record<string, { quantity: number; price: number; mrp: number }>>({});
  
  const [tyreQty, setTyreQty] = useState(0);
  const [tyrePrice, setTyrePrice] = useState(0);
  
  const [batteryQty, setBatteryQty] = useState(0);
  const [batteryPrice, setBatteryPrice] = useState(0);
  
  const [otherServices, setOtherServices] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState<{ customServiceId: string; relatedServiceId: string; serviceDescription: string; amount: number }[]>([]);
  
  const searchTimeoutRef = useRef<number | null>(null);
  const prevModelRef = useRef(formData.customer.carBrandModel);

  // Active Customer Profile for Visual Summary and quick vehicle insights (only when profile is loaded)
  const activeCustomerProfile = useMemo(() => {
    if (loadedProfile) return loadedProfile;
    return null;
  }, [loadedProfile]);

  // Handler to switch active vehicle from Recent Vehicle Activity Summary
  const handleSelectVehicleFromActivity = useCallback((veh: {
    carNumber: string;
    carBrandModel: string;
    vehicleCategoryTag?: VehicleCategoryTag;
  }) => {
    const detectedCategory = veh.vehicleCategoryTag || getCategoryForVehicle(veh.carBrandModel);
    if (veh.carBrandModel) {
      prevModelRef.current = veh.carBrandModel;
    }
    setFormData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        carNumber: veh.carNumber,
        carBrandModel: veh.carBrandModel,
      },
      vehicleCategoryTag: detectedCategory || prev.vehicleCategoryTag
    }));
    setErrors(prev => {
      const copy = { ...prev };
      delete copy.carNumber;
      delete copy.carBrandModel;
      return copy;
    });
  }, []);

  // Handler to apply service directly from Recent Vehicle Activity Summary
  const handleApplyServiceFromActivity = useCallback((
    serviceName: string,
    category: 'wash' | 'care' | 'addon' | 'tyre_battery' | 'custom' | 'subscription' | 'other',
    veh: { carNumber: string; carBrandModel: string; vehicleCategoryTag?: VehicleCategoryTag }
  ) => {
    // 1. Switch to vehicle first
    handleSelectVehicleFromActivity(veh);

    // 2. Select service
    if (category === 'wash' || (WASH_TYPES as readonly string[]).includes(serviceName)) {
      setSelectedWash(serviceName);
      setFormData(prev => ({
        ...prev,
        serviceSelection: prev.serviceSelection.includes('Car Wash')
          ? prev.serviceSelection
          : [...prev.serviceSelection, 'Car Wash']
      }));
    } else if (category === 'care' || (CAR_CARE_TYPES as readonly string[]).includes(serviceName)) {
      setSelectedCare(serviceName);
      setFormData(prev => ({
        ...prev,
        serviceSelection: prev.serviceSelection.includes('Car Care')
          ? prev.serviceSelection
          : [...prev.serviceSelection, 'Car Care']
      }));
    } else if (serviceName === 'Tyre Replacement' || (category === 'tyre_battery' && serviceName.includes('Tyre'))) {
      setTyreQty(prev => Math.max(1, prev || 1));
      setFormData(prev => ({
        ...prev,
        serviceSelection: prev.serviceSelection.includes('Tyre Replacement')
          ? prev.serviceSelection
          : [...prev.serviceSelection, 'Tyre Replacement']
      }));
    } else if (serviceName === 'Battery Replacement' || (category === 'tyre_battery' && serviceName.includes('Battery'))) {
      setBatteryQty(prev => Math.max(1, prev || 1));
      setFormData(prev => ({
        ...prev,
        serviceSelection: prev.serviceSelection.includes('Battery Replacement')
          ? prev.serviceSelection
          : [...prev.serviceSelection, 'Battery Replacement']
      }));
    } else {
      setSelectedAddons(prev => ({
        ...prev,
        [serviceName]: prev[serviceName] || { quantity: 1, price: 299, mrp: 499 }
      }));
      setFormData(prev => ({
        ...prev,
        serviceSelection: prev.serviceSelection.includes('Addons')
          ? prev.serviceSelection
          : [...prev.serviceSelection, 'Addons']
      }));
    }
  }, [handleSelectVehicleFromActivity]);

  // Match active subscription based on mobile number
  const activeSubscription = useMemo(() => {
    const mobile = String(formData.customer.mobileNumber || '').trim();
    if (!mobile || mobile.length < 10) return null;
    const cleanMobile = mobile.replace(/\D/g, '');
    const now = new Date();
    
    return userSubscriptions.find(s => {
      const cleanSubMobile = String(s.mobileNumber || '').replace(/\D/g, '');
      const m1 = cleanMobile.length >= 10 ? cleanMobile.slice(-10) : cleanMobile;
      const m2 = cleanSubMobile.length >= 10 ? cleanSubMobile.slice(-10) : cleanSubMobile;
      return m1 === m2 && new Date(s.endDate) > now && s.washesRemaining > 0;
    });
  }, [formData.customer.mobileNumber, userSubscriptions]);

  // Match corresponding subscription plan
  const subscriptionPlan = useMemo(() => {
    if (!activeSubscription) return null;
    return subscriptionPlans.find(p => p.id === activeSubscription.planId);
  }, [activeSubscription, subscriptionPlans]);

  // Automatically manage isSubscriptionWash based on activeSubscription and wash matching
  useEffect(() => {
    if (activeSubscription && subscriptionPlan && selectedWash) {
      const planWashType = subscriptionPlan.washType;
      if (!planWashType || planWashType === selectedWash) {
        setIsSubscriptionWash(true);
      } else {
        setIsSubscriptionWash(false);
      }
    } else {
      setIsSubscriptionWash(false);
    }
  }, [activeSubscription, subscriptionPlan, selectedWash]);

  // Save draft locally
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
  }, [formData]);

  // Auto-detect vehicle category
  useEffect(() => {
    if (formData.customer.carBrandModel && formData.customer.carBrandModel !== prevModelRef.current) {
        const detectedCategory = getCategoryForVehicle(formData.customer.carBrandModel);
        if (formData.vehicleCategoryTag !== detectedCategory) {
            setFormData(prev => ({ ...prev, vehicleCategoryTag: detectedCategory }));
        }
        prevModelRef.current = formData.customer.carBrandModel;
    }
  }, [formData.customer.carBrandModel, formData.vehicleCategoryTag]);

  // Dynamic wash options, care options, and add-on products
  const washOptions = useMemo(() => {
    if (predefinedServices && predefinedServices.length > 0) {
      const washingCategoryIds = (predefinedServiceCategories || [])
        .filter((c: any) => c.isEnabled && (c.name.toLowerCase().includes('wash') || c.name.toLowerCase().includes('clean')))
        .map((c: any) => c.id);

      const catalogWashes = predefinedServices.filter((s: any) => 
        s.isEnabled && (
          washingCategoryIds.includes(s.categoryId) ||
          s.name.toLowerCase().includes('wash') ||
          s.name.toLowerCase().includes('spark') ||
          s.name.toLowerCase().includes('polish') ||
          s.name.toLowerCase().includes('spa') ||
          s.name.toLowerCase().includes('360')
        )
      ).map((s: any) => s.name);

      if (catalogWashes.length > 0) {
        return [...new Set(catalogWashes)];
      }
    }
    return WASH_TYPES;
  }, [predefinedServices, predefinedServiceCategories]);

  const careOptions = useMemo(() => {
    if (predefinedServices && predefinedServices.length > 0) {
      const careCategoryIds = (predefinedServiceCategories || [])
        .filter((c: any) => c.isEnabled && (c.name.toLowerCase().includes('care') || c.name.toLowerCase().includes('detail')))
        .map((c: any) => c.id);

      const catalogCare = predefinedServices.filter((s: any) => 
        s.isEnabled && (
          careCategoryIds.includes(s.categoryId) ||
          s.name.toLowerCase().includes('care') ||
          s.name.toLowerCase().includes('polish') ||
          s.name.toLowerCase().includes('ceramic') ||
          s.name.toLowerCase().includes('coating')
        )
      ).map((s: any) => s.name);

      if (catalogCare.length > 0) {
        return [...new Set(catalogCare)];
      }
    }
    return CAR_CARE_TYPES;
  }, [predefinedServices, predefinedServiceCategories]);

  const addonProducts = useMemo(() => {
    const list: string[] = [];
    if (inventoryItems && inventoryItems.length > 0) {
      inventoryItems.forEach((inv: any) => {
        if (inv.name && !list.includes(inv.name)) list.push(inv.name);
      });
    }
    if (predefinedServices && predefinedServices.length > 0) {
      const addonCatIds = (predefinedServiceCategories || [])
        .filter((c: any) => c.isEnabled && (c.name.toLowerCase().includes('addon') || c.name.toLowerCase().includes('part') || c.name.toLowerCase().includes('accessor') || c.name.toLowerCase().includes('product')))
        .map((c: any) => c.id);

      predefinedServices.filter((s: any) => s.isEnabled && (addonCatIds.includes(s.categoryId) || s.name.toLowerCase().includes('blade') || s.name.toLowerCase().includes('filter') || s.name.toLowerCase().includes('oil') || s.name.toLowerCase().includes('polish'))).forEach((s: any) => {
        if (s.name && !list.includes(s.name)) list.push(s.name);
      });
    }
    if (list.length === 0) {
      return DYNAMIC_ADDON_NAMES;
    }
    return list;
  }, [inventoryItems, predefinedServices, predefinedServiceCategories]);

  const filteredAddonProducts = useMemo(() => {
    if (!addonSearchTerm.trim()) return addonProducts;
    const term = addonSearchTerm.toLowerCase();
    return addonProducts.filter(p => p.toLowerCase().includes(term));
  }, [addonProducts, addonSearchTerm]);

  // Sync selected wash pricing
  const category = formData.vehicleCategoryTag || VehicleCategoryTag.Hatch;
  
  useEffect(() => {
    if (selectedWash) {
      if (isSubscriptionWash) {
        setWashPrice(0);
        setWashMrp(0);
      } else {
        const matchedSvc = predefinedServices?.find((s: any) => s.name === selectedWash);
        if (matchedSvc && matchedSvc.pricing?.[category]) {
          setWashPrice(matchedSvc.pricing[category].price ?? 0);
          setWashMrp(matchedSvc.pricing[category].mrp ?? 0);
        } else {
          const matrix = DEFAULT_WASH_PRICING_MATRIX[selectedWash as keyof typeof DEFAULT_WASH_PRICING_MATRIX];
          const pricing = matrix?.[category] || { price: 0, mrp: 0 };
          setWashPrice(pricing.price);
          setWashMrp(pricing.mrp);
        }
      }
    } else {
      setWashPrice(0);
      setWashMrp(0);
    }
  }, [selectedWash, category, isSubscriptionWash, predefinedServices]);

  // Sync selected car care pricing
  useEffect(() => {
    if (selectedCare) {
      const matchedSvc = predefinedServices?.find((s: any) => s.name === selectedCare);
      if (matchedSvc && matchedSvc.pricing?.[category]) {
        setCarePrice(matchedSvc.pricing[category].price ?? 0);
        setCareMrp(matchedSvc.pricing[category].mrp ?? 0);
      } else {
        const matrix = DEFAULT_CAR_CARE_PRICING_MATRIX[selectedCare as keyof typeof DEFAULT_CAR_CARE_PRICING_MATRIX];
        const pricing = matrix?.[category] || { price: 0, mrp: 0 };
        setCarePrice(pricing.price);
        setCareMrp(pricing.mrp);
      }
    } else {
      setCarePrice(0);
      setCareMrp(0);
    }
  }, [selectedCare, category, predefinedServices]);

  // Fast Customer Fetch Handler (can be triggered manually or automatically)
  const handleFetchCustomerDetails = useCallback(async (forcedNumber?: string) => {
    const numberToSearch = String(forcedNumber || formData.customer.mobileNumber || '').trim();
    const digits = numberToSearch.replace(/\D/g, '');
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;

    if (last10.length < 3) {
      toast.error('Please enter at least 3 digits of the mobile number to search.');
      return;
    }

    setIsSearching(true);
    const toastId = toast.loading(`Searching records for +91 ${last10}...`);

    // 1. Check local profiles (Customer Book, Orders, Subscriptions, Leads)
    const localMatches = findExistingCustomersByMobilePrefix(last10, allSubmissions, userSubscriptions, customerBook, 5, serviceRequests);
    if (localMatches.length > 0) {
      const chosen = localMatches[0];
      selectExistingCustomer(chosen, chosen.bestMatchingVehicleIndex ?? 0);
      setIsSearching(false);
      setSearchMessage(`✓ Loaded details for ${chosen.fullName} (+91 ${chosen.mobileNumber}).`);
      toast.success(`Found & loaded customer profile for ${chosen.fullName}!`, { id: toastId });
      return;
    }

    // 2. Fallback to server SSOT database
    try {
      const apiProfile = await fetchCustomerByMobileFromApi(last10);
      setIsSearching(false);
      if (apiProfile) {
        selectExistingCustomer(apiProfile, 0);
        setSearchMessage(`✓ Loaded database record for ${apiProfile.fullName} (+91 ${apiProfile.mobileNumber}).`);
        toast.success(`Customer retrieved from database: ${apiProfile.fullName}!`, { id: toastId });
        return;
      }
    } catch (e) {
      setIsSearching(false);
    }

    setIsSearching(false);
    setSearchMessage('✓ Unique customer mobile number. Continue entering customer details.');
    toast.info(`No previous records found for +91 ${last10}. Ready for new customer entry.`, { id: toastId });
  }, [formData.customer.mobileNumber, allSubmissions, userSubscriptions, customerBook, serviceRequests, selectExistingCustomer]);

  const handleMobileBlur = useCallback(async () => {
    const digits = String(formData.customer.mobileNumber || '').replace(/\D/g, '');
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    if (last10.length >= 10 && !formData.customer.firstName.trim()) {
      await handleFetchCustomerDetails(last10);
    }
  }, [formData.customer.mobileNumber, formData.customer.firstName, handleFetchCustomerDetails]);

  // Search and suggest existing customer profiles by mobile prefix or exact unique number
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const mobileNumber = String(formData.customer.mobileNumber || '');
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

    if (cleanDigits.length < 3) {
      setSearchMessage('');
      setIsSearching(false);
      setMobileSuggestions([]);
      setIsMobileSuggestionsOpen(false);
      setComboboxActiveIndex(-1);
      setFoundProfiles(null);
      return;
    }
    
    setIsSearching(true);
    setSearchMessage('');

    searchTimeoutRef.current = window.setTimeout(async () => {
      // Find candidate profiles from existing customers matching prefix
      const phoneMatches = findExistingCustomersByMobilePrefix(cleanDigits, allSubmissions, userSubscriptions, customerBook, 8, serviceRequests);

      setIsSearching(false);
      setMobileSuggestions(phoneMatches);
      setComboboxActiveIndex(-1);
      setFoundProfiles(null);

      if (phoneMatches.length > 0) {
        setIsMobileSuggestionsOpen(true);
        if (cleanDigits.length >= 10) {
          const exact = phoneMatches.find(p => {
            const pDigits = String(p.mobileNumber || '').replace(/\D/g, '');
            const pLast10 = pDigits.slice(-10);
            return pDigits === cleanDigits || pLast10 === last10 || pDigits.endsWith(cleanDigits);
          });
          if (exact) {
            // If the user hasn't typed in customer details yet, auto-populate from exact match
            if (!formData.customer.firstName.trim() && (!loadedProfile || loadedProfile.id !== exact.id)) {
              selectExistingCustomer(exact, exact.bestMatchingVehicleIndex ?? 0);
              setSearchMessage(`✓ Existing customer match loaded: ${exact.fullName} (+91 ${exact.mobileNumber}).`);
            } else {
              setSearchMessage(`Existing customer match: ${exact.fullName} (+91 ${exact.mobileNumber}). Select suggestion or press Enter to autofill.`);
            }
          } else {
            setSearchMessage(`${phoneMatches.length} customer(s) match prefix +91 ${cleanDigits}. Select suggestion to autofill.`);
          }
        } else {
          setSearchMessage(`${phoneMatches.length} existing customer(s) start with +91 ${cleanDigits}...`);
        }
      } else {
        // No local match found - if 10 digits are typed, check backend database API asynchronously
        if (cleanDigits.length >= 10) {
          setIsSearching(true);
          try {
            const apiProfile = await fetchCustomerByMobileFromApi(cleanDigits);
            setIsSearching(false);
            if (apiProfile) {
              setMobileSuggestions([apiProfile]);
              setIsMobileSuggestionsOpen(true);
              if (!formData.customer.firstName.trim() && (!loadedProfile || loadedProfile.id !== apiProfile.id)) {
                selectExistingCustomer(apiProfile, 0);
                setSearchMessage(`✓ Existing customer found in database: ${apiProfile.fullName} (+91 ${apiProfile.mobileNumber}). Details loaded.`);
              } else {
                setSearchMessage(`Database match: ${apiProfile.fullName} (+91 ${apiProfile.mobileNumber}). Press Enter or click to autofill.`);
              }
              return;
            }
          } catch (e) {
            setIsSearching(false);
          }
          setIsMobileSuggestionsOpen(false);
          setSearchMessage('✓ Unique customer mobile number. Continue entering customer details.');
        } else {
          setIsMobileSuggestionsOpen(false);
          setSearchMessage('');
        }
      }
    }, 200);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [formData.customer.mobileNumber, allSubmissions, userSubscriptions, customerBook, serviceRequests, loadedProfile, formData.customer.firstName, selectExistingCustomer]);

  // Keyboard navigation for Mobile Combobox
  const handleMobileComboboxKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isMobileSuggestionsOpen || mobileSuggestions.length === 0) {
      if (e.key === 'ArrowDown' && mobileSuggestions.length > 0) {
        setIsMobileSuggestionsOpen(true);
        setComboboxActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setComboboxActiveIndex(prev => (prev < mobileSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setComboboxActiveIndex(prev => (prev > 0 ? prev - 1 : mobileSuggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (comboboxActiveIndex >= 0 && comboboxActiveIndex < mobileSuggestions.length) {
        e.preventDefault();
        const selected = mobileSuggestions[comboboxActiveIndex];
        selectExistingCustomer(selected, selected.bestMatchingVehicleIndex ?? 0);
        setIsMobileSuggestionsOpen(false);
        setComboboxActiveIndex(-1);
      } else if (mobileSuggestions.length > 0) {
        // If agent presses Enter on a matching number without navigating arrow keys, auto-select the best match
        e.preventDefault();
        const selected = mobileSuggestions[0];
        selectExistingCustomer(selected, selected.bestMatchingVehicleIndex ?? 0);
        setIsMobileSuggestionsOpen(false);
        setComboboxActiveIndex(-1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsMobileSuggestionsOpen(false);
      setComboboxActiveIndex(-1);
    } else if (e.key === 'Tab') {
      // Natural tab navigation to next field, dismissing suggestions
      setIsMobileSuggestionsOpen(false);
      setComboboxActiveIndex(-1);
    }
  };

  const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let finalValue = value;
    
    if (name === 'mobileNumber') {
      finalValue = value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
      if (finalValue.length > 15) return;
      // Re-open suggestions if agent resumes editing
      setIsMobileSuggestionsOpen(true);
      setComboboxActiveIndex(-1);
      if (loadedProfile) {
        const cleanLoaded = String(loadedProfile.mobileNumber || '').replace(/\D/g, '');
        const cleanCurrent = finalValue.replace(/\D/g, '');
        if (cleanLoaded && cleanCurrent && !cleanLoaded.startsWith(cleanCurrent)) {
          setLoadedProfile(null);
        }
      }
    }
    
    setFormData(prev => ({ ...prev, customer: { ...prev.customer, [name]: finalValue } }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleVehicleChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, customer: { ...prev.customer, carBrandModel: value } }));
    if (errors.carBrandModel) setErrors(p => { const { carBrandModel, ...rest } = p; return rest; });
  }, [errors.carBrandModel]);

  const clearForm = (force = false) => {
      if(force || window.confirm("Are you sure you want to clear all order fields? This action will reset your current draft.")) {
          setFormData(initialFormState);
          setErrors({});
          setSearchMessage('');
          setFoundProfiles(null);
          setMobileSuggestions([]);
          setIsMobileSuggestionsOpen(false);
          setComboboxActiveIndex(-1);
          setLoadedProfile(null);
          setSmartSearchQuery('');
          setIsSmartSearchOpen(false);
          setCurrentPhase(1);
          setSelectedWash('');
          setWashPrice(0);
          setWashMrp(0);
          setIsSubscriptionWash(false);
          setSelectedCare('');
          setCarePrice(0);
          setCareMrp(0);
          setSelectedAddons({});
          setTyreQty(0);
          setTyrePrice(0);
          setBatteryQty(0);
          setBatteryPrice(0);
          setOtherServices([]);
          setCustomServices([]);
          localStorage.removeItem(DRAFT_KEY);
      }
  };

  const validatePhase1 = () => {
      const newErrors: { [key: string]: string } = {};
      const { customer, scheduledDate } = formData;

      if (!String(customer.firstName || '').trim()) newErrors.firstName = 'First name is required.';
      if (!String(customer.mobileNumber || '').trim()) newErrors.mobileNumber = 'Mobile number is required.';
      if (!String(customer.carNumber || '').trim()) newErrors.carNumber = 'Car registration number is required.';
      if (!String(customer.carBrandModel || '').trim()) newErrors.carBrandModel = 'Car make & model are required.';

      if (scheduledDate) {
        const todayStr = getLocalTodayStr();
        const selectedStr = toISTDateString(scheduledDate);
        if (selectedStr && selectedStr < todayStr) {
          newErrors.scheduledDate = 'Scheduled date cannot be in the past.';
        }
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
  };

  const handleAddonQtyChange = (name: string, diff: number) => {
    setSelectedAddons(prev => {
      const current = prev[name] || { quantity: 0, price: 0, mrp: 0 };
      const newQty = Math.max(0, current.quantity + diff);
      
      const matchedSvc = predefinedServices?.find((s: any) => s.name === name);
      const matchedInv = inventoryItems?.find((i: any) => i.name === name);
      let defaultPrice = 0;
      let defaultMrp = 0;

      if (matchedSvc && matchedSvc.pricing?.[category]) {
        defaultPrice = matchedSvc.pricing[category].price ?? 0;
        defaultMrp = matchedSvc.pricing[category].mrp ?? 0;
      } else if (matchedInv) {
        defaultPrice = matchedInv.costPerUnit ?? 0;
        defaultMrp = defaultPrice;
      } else {
        const pricing = DEFAULT_ADDON_PRICING_MATRIX[name as keyof typeof DEFAULT_ADDON_PRICING_MATRIX]?.[category] || { price: 0, mrp: 0 };
        defaultPrice = pricing.price;
        defaultMrp = pricing.mrp;
      }
      
      if (newQty === 0) {
        const { [name]: removed, ...rest } = prev;
        return rest;
      }
      
      return {
        ...prev,
        [name]: {
          quantity: newQty,
          price: current.price || defaultPrice,
          mrp: current.mrp || defaultMrp
        }
      };
    });
  };

  const handleAddonPriceChange = (name: string, val: number) => {
    setSelectedAddons(prev => {
      if (!prev[name]) return prev;
      return {
        ...prev,
        [name]: {
          ...prev[name],
          price: val
        }
      };
    });
  };

  const handleToggleOtherService = (name: string) => {
    setOtherServices(prev => 
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  // Calculations
  const addonsList = Object.entries(selectedAddons).map(([name, item]) => ({
    name,
    quantity: item.quantity,
    price: item.price,
    mrp: item.mrp
  }));
  const addonsTotal = addonsList.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tyreTotal = tyreQty * tyrePrice;
  const batteryTotal = batteryQty * batteryPrice;
  const customServicesTotal = customServices.reduce((sum, item) => sum + item.amount, 0);

  const travelCharge = (() => {
    const serviceSelection: string[] = [];
    if (selectedWash) serviceSelection.push("Car Washing");
    if (selectedCare) serviceSelection.push("Car Care");
    const res = calculateTravelCharges(
      serviceSelection,
      formData.customer.latitude,
      formData.customer.longitude,
      selectedWash || undefined,
      selectedCare || undefined,
      deliveryHubs,
      productRules,
      predefinedServices
    );
    return res.totalTravelCharge;
  })();

  const grandTotal = washPrice + carePrice + addonsTotal + tyreTotal + batteryTotal + travelCharge + customServicesTotal;
  
  // Savings calculation
  const totalSavings = useMemo(() => {
    let savings = 0;
    if (washMrp > washPrice) savings += (washMrp - washPrice);
    if (careMrp > carePrice) savings += (careMrp - carePrice);
    addonsList.forEach(item => {
      if (item.mrp > item.price) {
        savings += (item.mrp - item.price) * item.quantity;
      }
    });
    return savings;
  }, [washMrp, washPrice, careMrp, carePrice, addonsList]);

  const activeSelectionCount = (
    (selectedWash ? 1 : 0) +
    (selectedCare ? 1 : 0) +
    addonsList.length +
    (tyreQty > 0 ? 1 : 0) +
    (batteryQty > 0 ? 1 : 0) +
    customServices.length +
    otherServices.length
  );

  const handleSubmit = async () => {
      if (!validatePhase1()) {
         setCurrentPhase(1);
         return;
      }

      setIsSubmitting(true);
      try {
        const finalServiceSelection: string[] = [];
        if (selectedWash) finalServiceSelection.push("Car Washing");
        if (selectedCare) finalServiceSelection.push("Car Care");
        if (addonsList.length > 0) finalServiceSelection.push("Add-ons");
        if (tyreQty > 0) finalServiceSelection.push("Tyre Replacement");
        if (batteryQty > 0) finalServiceSelection.push("Battery Replacement");
        if (customServices.length > 0) finalServiceSelection.push("Custom Services");
        otherServices.forEach(s => {
          if (!finalServiceSelection.includes(s)) finalServiceSelection.push(s);
        });

        await onCreateOrder({
          customer: formData.customer,
          scheduledDate: formData.scheduledDate,
          scheduledTime: formData.scheduledTime,
          assignedTo: formData.assignedTo,
          secondaryAssignee: formData.secondaryAssignee,
          priority: formData.priority,
          vehicleCategoryTag: category,
          serviceSelection: finalServiceSelection,
          isSubscription: isSubscriptionWash,
          carWashDetails: selectedWash ? { washType: selectedWash, price: washPrice, mrp: washMrp } : undefined,
          carCareDetails: selectedCare ? { careType: selectedCare, price: carePrice, mrp: careMrp } : undefined,
          dynamicAddons: addonsList,
          addonsTotal: addonsTotal,
          tyreReplacementQuantity: tyreQty,
          tyreReplacementPrice: tyrePrice,
          tyreReplacementTotalAmount: tyreTotal,
          batteryReplacementQuantity: batteryQty,
          batteryReplacementTotalAmount: batteryTotal,
          customServices: customServices,
          customServicesTotal: customServicesTotal,
          grandTotal: grandTotal,
          travelCharge: travelCharge,
          internalNotes: formData.internalNotes,
          tags: formData.tags || [],
        });

        clearForm(true);
        onClose();
      } catch (err) {
        console.error("Order creation failed:", err);
        alert("Order creation failed. Please check parameters or network state.");
      } finally {
        setIsSubmitting(false);
      }
  };
  
  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-start justify-center z-50 p-2 sm:p-4 md:p-6 overflow-y-auto animate-fadeIn" onClick={onClose}>
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col my-auto max-h-[92vh] border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Enterprise Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex-shrink-0 border-b border-indigo-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/30 border border-indigo-400/30 rounded-xl text-indigo-300 shadow-inner">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold tracking-tight text-white">Create Enterprise Service Order</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Dispatch Desk v2.0
                </span>
              </div>
              <p className="text-xs text-indigo-200/80 font-medium">
                Phase {currentPhase} of 2: {currentPhase === 1 ? 'Customer Identity, GPS & Dispatch Logistics' : 'Service Catalog & Live Price Configurator'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 self-end sm:self-center">
            {/* Draft Auto-Save Pill */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Smart Draft Auto-Saved</span>
            </div>

            <button 
              type="button" 
              onClick={() => clearForm(false)} 
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-700/80 hover:border-red-800/80 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>

            <button 
              type="button" 
              onClick={onClose} 
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Phase Stepper Bar */}
        <div className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 px-5 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 w-full max-w-xl">
            {/* Step 1 Indicator */}
            <button
              type="button"
              onClick={() => setCurrentPhase(1)}
              className={`flex items-center space-x-2 cursor-pointer transition-all ${
                currentPhase === 1 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                currentPhase === 1 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'bg-emerald-500 text-white'
              }`}>
                {currentPhase === 2 ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '1'}
              </span>
              <span className="text-xs sm:text-sm whitespace-nowrap">1. Customer & Dispatch</span>
            </button>

            <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-300" 
                style={{ width: currentPhase === 1 ? '50%' : '100%' }}
              />
            </div>

            {/* Step 2 Indicator */}
            <button
              type="button"
              onClick={() => { if (validatePhase1()) setCurrentPhase(2); }}
              className={`flex items-center space-x-2 cursor-pointer transition-all ${
                currentPhase === 2 ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800'
              }`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                currentPhase === 2 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                2
              </span>
              <span className="text-xs sm:text-sm whitespace-nowrap">2. Services & Catalog</span>
              {activeSelectionCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {activeSelectionCount}
                </span>
              )}
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-2 text-xs text-slate-500 font-medium">
            <span>Category:</span>
            <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
              {category}
            </span>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-4 sm:p-6 flex-1 space-y-6 bg-slate-50/50 dark:bg-slate-900/50">

          {currentPhase === 1 ? (
            <div className="space-y-5">
              {/* Card 1: Customer Identity & Smart Omnibar Search */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Customer Identity & Smart Profile Search</h4>
                      <p className="text-xs text-slate-500">Quick-search customer records by Name, Phone, Car Number, or Model</p>
                    </div>
                  </div>
                  {String(formData.customer.mobileNumber || '').length >= 10 && !isSearching && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      10-Digit Valid
                    </span>
                  )}
                </div>

                {/* Smart Customer Omnibar Search */}
                <div className="relative" ref={searchDropdownRef}>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-indigo-500">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={smartSearchQuery}
                      onChange={(e) => {
                        setSmartSearchQuery(e.target.value);
                        setIsSmartSearchOpen(true);
                      }}
                      onFocus={() => setIsSmartSearchOpen(true)}
                      placeholder="🔍 Quick Search Existing Customer by Name, Mobile (+91), or Vehicle No. (e.g. DL-01, Swift, Rahul)..."
                      className="w-full pl-10 pr-24 py-2.5 text-xs sm:text-sm bg-indigo-50/40 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder-indigo-400/80 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium shadow-2xs"
                    />
                    {smartSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSmartSearchQuery('');
                          setIsSmartSearchOpen(false);
                        }}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300">
                          Smart Search
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Smart Search Results Dropdown */}
                  {isSmartSearchOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/80 px-3.5 text-[11px] font-bold text-slate-500 flex justify-between items-center">
                        <span>{smartSearchResults.length} EXISTING CUSTOMER PROFILE(S) FOUND</span>
                        <button
                          type="button"
                          onClick={() => setIsSmartSearchOpen(false)}
                          className="text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                        >
                          Close [esc]
                        </button>
                      </div>
                      {smartSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          No matching customer found for "{smartSearchQuery}". You can enter new customer details below.
                        </div>
                      ) : (
                        smartSearchResults.map((profile) => (
                          <div
                            key={profile.id}
                            onClick={() => selectExistingCustomer(profile, profile.bestMatchingVehicleIndex ?? 0)}
                            className="p-3 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 cursor-pointer transition-colors flex items-start justify-between gap-3 group"
                          >
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                                  {profile.fullName}
                                </span>
                                <span className="text-xs font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                  +91 {profile.mobileNumber}
                                </span>
                                {profile.smartScore && smartSearchQuery ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs">
                                    <Sparkles className="w-2.5 h-2.5 text-purple-600" />
                                    {profile.smartScore}% Match
                                  </span>
                                ) : null}
                                {profile.isSubscriber && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    ★ Subscriber ({profile.washesRemaining} left)
                                  </span>
                                )}
                                {profile.totalBookings > 1 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300">
                                    {profile.totalBookings} Past Orders
                                  </span>
                                )}
                              </div>

                              {/* Smart Match Reasons */}
                              {profile.matchReasons && profile.matchReasons.length > 0 && smartSearchQuery && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {profile.matchReasons.map((reason, rIdx) => (
                                    <span
                                      key={rIdx}
                                      className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70"
                                    >
                                      {reason}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Vehicles with Smart Match Highlighting & History */}
                              {profile.savedVehicles.length > 0 && (
                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 pt-0.5">
                                  <Car className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                  {profile.savedVehicles.map((v, i) => {
                                    const isBestMatch = profile.bestMatchingVehicleIndex === i && !!smartSearchQuery;
                                    return (
                                      <span
                                        key={i}
                                        className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border transition-colors ${
                                          isBestMatch
                                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold shadow-2xs'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                        }`}
                                      >
                                        {isBestMatch && <Sparkles className="w-2.5 h-2.5 text-amber-600" />}
                                        <strong className="font-mono">{v.carNumber}</strong>
                                        <span className="text-slate-500">({v.carBrandModel})</span>
                                        {v.daysAgo !== null && v.daysAgo !== undefined && (
                                          <span className="text-[9px] text-slate-400 font-normal">
                                            • {v.daysAgo === 0 ? 'today' : `${v.daysAgo}d ago`}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Address */}
                              {profile.streetAddress && (
                                <div className="flex items-center space-x-1 text-[11px] text-slate-500 truncate pt-0.5">
                                  <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                  <span className="truncate">{profile.streetAddress}</span>
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                selectExistingCustomer(profile, profile.bestMatchingVehicleIndex ?? 0);
                              }}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-600 text-white group-hover:bg-indigo-700 transition shadow-2xs flex-shrink-0 self-center cursor-pointer"
                            >
                              Autofill
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Linked Profile Banner */}
                {loadedProfile && (
                  <div className="p-3 bg-gradient-to-r from-indigo-50 via-slate-50 to-indigo-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {loadedProfile.firstName?.charAt(0) || 'C'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {loadedProfile.fullName}
                          </h5>
                          <span className="text-[11px] font-mono text-slate-500">+91 {loadedProfile.mobileNumber}</span>
                          {loadedProfile.isSubscriber && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-600 text-white">
                              Active Subscriber
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          Autofilled profile with {loadedProfile.savedVehicles.length} saved vehicle(s) &amp; verified address.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setLoadedProfile(null);
                          setFoundProfiles(null);
                          setSearchMessage('');
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                      >
                        Unlink
                      </button>
                    </div>
                  </div>
                )}

                {/* Visual Summary Component for User Search: Recent Vehicle Activity */}
                {activeCustomerProfile && (
                  <RecentVehicleActivitySummary
                    customer={activeCustomerProfile}
                    allSubmissions={allSubmissions}
                    userSubscriptions={userSubscriptions}
                    subscriptionPlans={subscriptionPlans}
                    currentCarNumber={formData.customer.carNumber}
                    onSelectVehicle={handleSelectVehicleFromActivity}
                    onApplyService={handleApplyServiceFromActivity}
                    onCreateOrder={async (orderPayload) => {
                      await onCreateOrder(orderPayload);
                      onClose();
                    }}
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-1 relative" ref={mobileDropdownRef}>
                    <Input 
                      id="customer-mobile-combobox-input"
                      label="Mobile Phone Number" 
                      name="mobileNumber" 
                      type="tel" 
                      value={formData.customer.mobileNumber} 
                      onChange={handleCustomerChange} 
                      onBlur={handleMobileBlur}
                      onFocus={() => {
                        if (mobileSuggestions.length > 0) {
                          setIsMobileSuggestionsOpen(true);
                        }
                      }}
                      onKeyDown={handleMobileComboboxKeyDown}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={isMobileSuggestionsOpen && mobileSuggestions.length > 0}
                      aria-haspopup="listbox"
                      aria-controls="mobile-combobox-listbox"
                      aria-activedescendant={comboboxActiveIndex >= 0 ? `mobile-combobox-option-${comboboxActiveIndex}` : undefined}
                      required 
                      error={errors.mobileNumber} 
                      maxLength={15} 
                      prefix="+91" 
                      suffix={
                        isSearching ? (
                          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleFetchCustomerDetails();
                            }}
                            title="Fetch customer details by mobile number"
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:hover:bg-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 transition cursor-pointer"
                          >
                            <Search className="w-3 h-3" />
                            <span>Fetch</span>
                          </button>
                        )
                      }
                      placeholder="e.g. 9876543210"
                      autoComplete="off"
                    />

                    {/* Status & Guidance Indicator */}
                    {searchMessage && !isSearching && (
                      <p className={`mt-1.5 text-xs font-semibold flex items-center gap-1 ${
                        searchMessage.includes('Subscriber') || searchMessage.includes('Active')
                          ? 'text-emerald-600 dark:text-emerald-400' 
                          : searchMessage.includes('Unique') || searchMessage.includes('New customer')
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}>
                        <Info className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{searchMessage}</span>
                      </p>
                    )}

                    {/* Non-Blocking Existing Customer Suggestions Combobox Dropdown */}
                    {isMobileSuggestionsOpen && mobileSuggestions.length > 0 && (
                      <div 
                        id="mobile-combobox-listbox"
                        role="listbox"
                        aria-label="Customer mobile number suggestions"
                        className="absolute left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-900 border-2 border-indigo-500 dark:border-indigo-500 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-top-1 duration-150"
                      >
                        <div className="p-2.5 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-slate-900 px-3 flex justify-between items-center border-b border-indigo-100 dark:border-indigo-800/80">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
                              {mobileSuggestions.length} Matching Customer(s)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileSuggestionsOpen(false);
                              setComboboxActiveIndex(-1);
                            }}
                            className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold px-2 py-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer"
                          >
                            Ignore &amp; Keep Typing ✕
                          </button>
                        </div>

                        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                          {mobileSuggestions.map((profile, index) => {
                            const cleanCustPhone = String(profile.mobileNumber || '');
                            const typedDigits = String(formData.customer.mobileNumber || '').replace(/\D/g, '');
                            const isSelected = comboboxActiveIndex === index;
                            
                            return (
                              <div
                                key={profile.id}
                                id={`mobile-combobox-option-${index}`}
                                role="option"
                                aria-selected={isSelected}
                                onMouseEnter={() => setComboboxActiveIndex(index)}
                                onClick={() => {
                                  selectExistingCustomer(profile, profile.bestMatchingVehicleIndex ?? 0);
                                  setIsMobileSuggestionsOpen(false);
                                  setComboboxActiveIndex(-1);
                                }}
                                className={`p-3 cursor-pointer transition-colors flex items-start justify-between gap-3 group ${
                                  isSelected
                                    ? 'bg-indigo-100/90 dark:bg-indigo-950/90 ring-1 ring-inset ring-indigo-400 dark:ring-indigo-500'
                                    : 'hover:bg-indigo-50/80 dark:hover:bg-indigo-950/60'
                                }`}
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
                                    <span className="text-xs font-mono font-bold bg-white dark:bg-slate-800 px-2 py-0.5 rounded text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 shadow-2xs">
                                      +91 {renderHighlightedPhone(cleanCustPhone, typedDigits)}
                                    </span>

                                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                      {profile.fullName}
                                    </span>

                                    {profile.isSubscriber && (
                                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                        ★ Subscriber ({profile.washesRemaining} left)
                                      </span>
                                    )}
                                  </div>

                                  {profile.savedVehicles && profile.savedVehicles.length > 0 && (
                                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                                      <Car className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                      <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                        {profile.savedVehicles[0].carNumber}
                                      </span>
                                      <span className="text-slate-500">
                                        ({profile.savedVehicles[0].carBrandModel})
                                      </span>
                                      {profile.savedVehicles.length > 1 && (
                                        <span className="text-[10px] text-indigo-500 font-semibold">
                                          +{profile.savedVehicles.length - 1} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="flex-shrink-0 pt-0.5">
                                  <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white shadow-2xs'
                                      : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 group-hover:bg-indigo-600 group-hover:text-white'
                                  }`}>
                                    Autofill ↵
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 px-3 text-[11px] text-slate-600 dark:text-slate-400 flex flex-wrap gap-2 justify-between items-center border-t border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-1 text-[10px] text-slate-500">
                            <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px] font-mono">↑↓</kbd> navigate
                            <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px] font-mono ml-1">↵</kbd> autofill
                            <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px] font-mono ml-1">esc</kbd> dismiss
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileSuggestionsOpen(false);
                              setComboboxActiveIndex(-1);
                            }}
                            className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>Use as new customer (+91 {String(formData.customer.mobileNumber || '').replace(/\D/g, '')}) &rarr;</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Active Subscription Banner */}
                    {activeSubscription && (
                      <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-800/80 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Award className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                              Active Subscription: {subscriptionPlan?.name || 'Pro Plan'}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-2xs">
                            {activeSubscription.washesRemaining} Washes Remaining
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                          Auto-enables ₹0 subscription wash when selecting plan wash type <strong className="underline">{subscriptionPlan?.washType || 'Daily Wash'}</strong>.
                        </p>
                      </div>
                    )}

                    {/* Saved Vehicles on File Switcher */}
                    {loadedProfile && loadedProfile.savedVehicles && loadedProfile.savedVehicles.length > 1 && (
                      <div className="mt-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-indigo-500" />
                            Vehicles on File ({loadedProfile.savedVehicles.length})
                          </span>
                          <span className="text-[10px] text-slate-500">Tap to select vehicle</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {loadedProfile.savedVehicles.map((v, idx) => {
                            const isSelected = formData.customer.carNumber === v.carNumber;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => selectExistingCustomer(loadedProfile, idx)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-400'
                                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:border-indigo-400'
                                }`}
                              >
                                <span>{v.carNumber || 'Vehicle'}</span>
                                {v.carBrandModel && <span className="font-sans font-normal opacity-80">({v.carBrandModel})</span>}
                                {isSelected && <Check className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <Input 
                    label="First Name" 
                    name="firstName" 
                    value={formData.customer.firstName} 
                    onChange={handleCustomerChange} 
                    required 
                    error={errors.firstName} 
                    placeholder="John"
                  />

                  <Input 
                    label="Last Name" 
                    name="lastName" 
                    value={formData.customer.lastName} 
                    onChange={handleCustomerChange} 
                    placeholder="Doe"
                  />

                  <Input 
                    label="Email Address (Optional)" 
                    name="customerEmail" 
                    type="email" 
                    value={formData.customer.customerEmail || ''} 
                    onChange={handleCustomerChange} 
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              {/* Card 2: Vehicle & Category Classification */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <Car className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Vehicle Identification & Pricing Category</h4>
                      <p className="text-xs text-slate-500">Vehicle model auto-classifies rate matrix category (Hatch / Sedan / SUV / Luxury)</p>
                    </div>
                  </div>
                  {category && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      Tag: {category}
                    </span>
                  )}
                </div>

                {/* Quick Vehicle Switcher if Profile Has Multiple Saved Vehicles */}
                {loadedProfile && loadedProfile.savedVehicles.length > 1 && (
                  <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-indigo-600" />
                        Saved Vehicles for {loadedProfile.firstName} (Click to Switch):
                      </label>
                      <span className="text-[11px] text-slate-500">1-click switch</span>
                    </div>
                    <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                      {loadedProfile.savedVehicles.map((veh, idx) => {
                        const isCurrentCar = formData.customer.carNumber?.toUpperCase() === veh.carNumber.toUpperCase();
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const detectedCategory = veh.vehicleCategoryTag || getCategoryForVehicle(veh.carBrandModel);
                              prevModelRef.current = veh.carBrandModel;
                              setFormData(prev => ({
                                ...prev,
                                customer: {
                                  ...prev.customer,
                                  carNumber: veh.carNumber,
                                  carBrandModel: veh.carBrandModel
                                },
                                vehicleCategoryTag: detectedCategory || prev.vehicleCategoryTag
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isCurrentCar
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs ring-2 ring-indigo-300 dark:ring-indigo-900'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-indigo-200 dark:border-indigo-800 hover:border-indigo-500'
                            }`}
                          >
                            <Car className="w-3.5 h-3.5" />
                            <span className="font-mono">{veh.carNumber}</span>
                            <span className="font-normal opacity-80">({veh.carBrandModel})</span>
                            {isCurrentCar && <Check className="w-3 h-3 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input 
                    label="Car Registration Number" 
                    name="carNumber" 
                    value={formData.customer.carNumber} 
                    onChange={handleCustomerChange} 
                    required 
                    error={errors.carNumber} 
                    placeholder="e.g. KA-01-AB-1234"
                  />

                  <div className="sm:col-span-2">
                    <VehicleSelector
                      value={formData.customer.carBrandModel}
                      onChange={handleVehicleChange}
                      error={errors.carBrandModel}
                      vehicleData={vehicleData}
                      carDatabase={carDatabase}
                      onUpdateVehicleData={noOp}
                    />
                  </div>
                </div>

                {/* Category Chip Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Vehicle Category Matrix Override
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {VEHICLE_CATEGORY_TAGS.map(tag => {
                      const isSelected = formData.vehicleCategoryTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, vehicleCategoryTag: tag as VehicleCategoryTag }))}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-300 dark:ring-indigo-900'
                              : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          <span>{tag}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card 3: Address & Doorstep GPS Pinning */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Delivery Address & Doorstep GPS Geolocation</h4>
                      <p className="text-xs text-slate-500">Google Places address lookup with interactive map pin precision</p>
                    </div>
                  </div>
                  {formData.customer.latitude && formData.customer.longitude ? (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      GPS Coords Verified
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Pin Missing
                    </span>
                  )}
                </div>

                <AddressAutofillSection
                  apiKey={API_KEY}
                  addressData={{
                    streetAddress: formData.customer.streetAddress !== undefined && formData.customer.streetAddress !== null ? String(formData.customer.streetAddress) : '',
                    houseNo: formData.customer.houseNo !== undefined && formData.customer.houseNo !== null ? String(formData.customer.houseNo) : '',
                    streetName: formData.customer.streetName !== undefined && formData.customer.streetName !== null ? String(formData.customer.streetName) : '',
                    city: formData.customer.city !== undefined && formData.customer.city !== null ? String(formData.customer.city) : '',
                    stateName: formData.customer.stateName !== undefined && formData.customer.stateName !== null ? String(formData.customer.stateName) : '',
                    pincode: formData.customer.pincode !== undefined && formData.customer.pincode !== null ? String(formData.customer.pincode) : '',
                    latitude: formData.customer.latitude,
                    longitude: formData.customer.longitude,
                    distanceKm: formData.customer.distanceKm,
                  }}
                  onChange={(updatedData) => {
                    setFormData(prev => ({
                      ...prev,
                      customer: {
                        ...prev.customer,
                        ...updatedData,
                      }
                    }));
                  }}
                  error={errors.streetAddress}
                  customHubs={deliveryHubs}
                  showMapPinOption={true}
                />
              </div>

              {/* Card 4: Scheduling & Dispatch Assignments */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Dispatch Scheduling & Technician Assignment</h4>
                      <p className="text-xs text-slate-500">Set appointment slot, assign field specialists, priority level & internal remarks</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Primary Assignment */}
                  <div>
                    <label htmlFor="assignedTo" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Primary Specialist / Technician
                    </label>
                    <select
                      id="assignedTo"
                      name="assignedTo"
                      value={formData.assignedTo}
                      onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Unassigned (Dispatch Queue) --</option>
                      {users.filter(u => authService.isAssignableTechnician(u)).map(u => {
                        const specs = Array.isArray(u.specialties)
                          ? u.specialties
                          : typeof u.specialties === 'string' && u.specialties
                          ? (u.specialties as string).split(',').map(s => s.trim()).filter(Boolean)
                          : [];
                        const firstSpec = specs.length > 0 ? specs[0] : '';
                        return (
                          <option key={u.username} value={u.username}>
                            🔧 {u.username} ({u.role}{firstSpec ? ` - ${firstSpec}` : ''})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Secondary Assignee */}
                  <div>
                    <label htmlFor="secondaryAssignee" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Secondary Helper / Assistant (Optional)
                    </label>
                    <select
                      id="secondaryAssignee"
                      name="secondaryAssignee"
                      value={formData.secondaryAssignee || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, secondaryAssignee: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- None (Single Technician) --</option>
                      {users.filter(u => authService.isAssignableTechnician(u) && u.username !== formData.assignedTo).map(u => {
                        const specs = Array.isArray(u.specialties)
                          ? u.specialties
                          : typeof u.specialties === 'string' && u.specialties
                          ? (u.specialties as string).split(',').map(s => s.trim()).filter(Boolean)
                          : [];
                        const firstSpec = specs.length > 0 ? specs[0] : '';
                        return (
                          <option key={u.username} value={u.username}>
                            🤝 {u.username} ({u.role}{firstSpec ? ` - ${firstSpec}` : ''})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Priority Selector as Badges */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Service Priority
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['Low', 'Medium', 'High', 'Urgent'] as const).map(p => {
                        const isSel = (formData.priority || 'Medium') === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, priority: p as ServicePriority }))}
                            className={`py-2 rounded-xl text-xs font-bold border transition-all text-center cursor-pointer ${
                              isSel
                                ? p === 'Urgent'
                                  ? 'bg-red-600 text-white border-red-600 shadow-2xs animate-pulse'
                                  : p === 'High'
                                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                  : p === 'Medium'
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                  : 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scheduled Date */}
                  <div>
                    <Input 
                      label="Scheduled Date" 
                      type="date" 
                      value={formData.scheduledDate ? toISTDateString(formData.scheduledDate) : ''} 
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, scheduledDate: e.target.value }));
                        if (errors.scheduledDate) setErrors(p => ({...p, scheduledDate: ''}));
                      }}
                      error={errors.scheduledDate}
                    />
                    <div className="flex space-x-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, scheduledDate: getLocalTodayStr() }))}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Set Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const tmrw = new Date();
                          tmrw.setDate(tmrw.getDate() + 1);
                          setFormData(prev => ({ ...prev, scheduledDate: tmrw.toISOString().split('T')[0] }));
                        }}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Set Tomorrow
                      </button>
                    </div>
                  </div>

                  {/* Scheduled Time */}
                  <div className="sm:col-span-2">
                    <label htmlFor="scheduledTime" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                      Scheduled Time Slot
                    </label>
                    <select
                      id="scheduledTime"
                      name="scheduledTime"
                      value={formData.scheduledTime}
                      onChange={(e) => setFormData(prev => ({ ...prev, scheduledTime: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Flexible / Open Window --</option>
                      {APPOINTMENT_TIME_SLOTS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>

                  {/* Internal Remarks */}
                  <div className="sm:col-span-2">
                    <label htmlFor="modalInternalNotes" className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>Internal Agent Notes / Remarks</span>
                      <span className="text-[10px] text-slate-400 font-normal">Persisted on service order</span>
                    </label>
                    <textarea
                      id="modalInternalNotes"
                      name="modalInternalNotes"
                      rows={2}
                      value={formData.internalNotes || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, internalNotes: e.target.value }))}
                      placeholder="Special customer requests, gate entry codes, parking details or field remarks..."
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Order Tags & Custom Labels (VIP, Urgent, Return-Visit) */}
                  <div className="sm:col-span-2">
                    <OrderTagsManager
                      tags={formData.tags || []}
                      onChange={(newTags) => setFormData(prev => ({ ...prev, tags: newTags }))}
                      title="Order Tags & Priority Labels"
                      description="Assign custom tags (e.g. VIP, Urgent, Return-Visit) directly to this order to help technicians and managers."
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Phase 2: Services & Live Pricing Configurator */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Tabbed Service Configurator (8 Cols) */}
              <div className="lg:col-span-8 space-y-4">
                {/* Category & Vehicle Information Banner */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-2xs border border-indigo-900">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-extrabold text-indigo-300 tracking-wider">Target Vehicle</span>
                      <p className="text-sm font-bold text-white truncate max-w-[220px]">
                        {formData.customer.carBrandModel || 'Unspecified Vehicle'} ({formData.customer.carNumber || 'No Reg'})
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase font-extrabold text-indigo-300 tracking-wider">Rate Category</span>
                    <p className="text-sm font-black text-emerald-400">{category}</p>
                  </div>
                </div>

                {/* Tab Navigation Controls */}
                <div className="flex space-x-1.5 border-b border-slate-200 dark:border-slate-800 pb-1 overflow-x-auto scrollbar-none">
                  {[
                    { id: 'wash', label: 'Car Washing', icon: Sparkles, count: selectedWash ? 1 : 0 },
                    { id: 'care', label: 'Car Care', icon: ShieldCheck, count: selectedCare ? 1 : 0 },
                    { id: 'addons', label: 'Add-ons', icon: Package, count: addonsList.length },
                    { id: 'tyre_battery', label: 'Tyre & Battery', icon: Wrench, count: (tyreQty > 0 ? 1 : 0) + (batteryQty > 0 ? 1 : 0) },
                    { id: 'others', label: 'Catalog & Custom', icon: Layers, count: customServices.length + otherServices.length },
                  ].map(tab => {
                    const TabIcon = tab.icon;
                    const isTabActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap ${
                          isTabActive
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <TabIcon className={`w-3.5 h-3.5 ${isTabActive ? 'text-white' : 'text-indigo-500'}`} />
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                            isTabActive ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                          }`}>
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content Cards */}
                <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs min-h-[280px]">
                  {/* TAB 1: CAR WASHING */}
                  {activeTab === 'wash' && (
                    <div className="space-y-4">
                      {activeSubscription && (
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-2.5">
                          <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                          <div className="text-xs space-y-1">
                            <p className="font-bold text-emerald-900 dark:text-emerald-200">
                              Active Subscription: {subscriptionPlan?.name} ({subscriptionPlan?.vehicleCategory})
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400">
                              Included Wash: <strong className="font-bold">{subscriptionPlan?.washType || 'Any'}</strong> ({activeSubscription.washesRemaining} remaining)
                            </p>
                            {selectedWash && subscriptionPlan?.washType && selectedWash !== subscriptionPlan.washType ? (
                              <p className="text-amber-800 dark:text-amber-300 font-semibold bg-amber-100/80 dark:bg-amber-950/80 p-1.5 rounded-lg border border-amber-300/80">
                                ⚠️ Selected wash "{selectedWash}" differs from plan "{subscriptionPlan.washType}". Charged standard rate.
                              </p>
                            ) : selectedWash ? (
                              <p className="text-emerald-800 dark:text-emerald-300 font-semibold">
                                ✓ Claiming subscription wash override at ₹0 price.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                          Select Car Wash Package
                        </label>
                        <select
                          value={selectedWash}
                          onChange={(e) => setSelectedWash(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        >
                          <option value="">-- No Wash Selected --</option>
                          {washOptions.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      {selectedWash && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">{selectedWash}</span>
                            <label className="inline-flex items-center space-x-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSubscriptionWash}
                                onChange={(e) => setIsSubscriptionWash(e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Subscription Wash (₹0 Override)</span>
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <Input
                              label="Special Offer Price (₹)"
                              type="number"
                              value={washPrice}
                              onChange={(e) => setWashPrice(Number(e.target.value))}
                              disabled={isSubscriptionWash}
                              className="font-extrabold text-slate-900 dark:text-slate-100 text-base"
                            />
                            <Input
                              label="Original MRP (₹)"
                              type="number"
                              value={washMrp}
                              onChange={(e) => setWashMrp(Number(e.target.value))}
                              disabled={isSubscriptionWash}
                              className="text-slate-500 dark:text-slate-400 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: CAR CARE */}
                  {activeTab === 'care' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                          Select Car Care Package
                        </label>
                        <select
                          value={selectedCare}
                          onChange={(e) => setSelectedCare(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        >
                          <option value="">-- No Car Care Selected --</option>
                          {careOptions.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>

                      {selectedCare && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase">{selectedCare}</span>
                            <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Category Rate Matrix Applied</span>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <Input
                              label="Care Price (₹)"
                              type="number"
                              value={carePrice}
                              onChange={(e) => setCarePrice(Number(e.target.value))}
                              className="font-extrabold text-slate-900 dark:text-slate-100 text-base"
                            />
                            <Input
                              label="Care MRP (₹)"
                              type="number"
                              value={careMrp}
                              onChange={(e) => setCareMrp(Number(e.target.value))}
                              className="text-slate-500 dark:text-slate-400 text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: ADD-ONS */}
                  {activeTab === 'addons' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                          <input
                            type="text"
                            placeholder="Filter add-on products..."
                            value={addonSearchTerm}
                            onChange={(e) => setAddonSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        {addonsList.length > 0 && (
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {addonsList.length} items selected
                          </span>
                        )}
                      </div>

                      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                        {filteredAddonProducts.map(addonName => {
                          const addonState = selectedAddons[addonName] || { quantity: 0, price: 0 };
                          const matchedSvc = predefinedServices?.find((s: any) => s.name === addonName);
                          const matchedInv = inventoryItems?.find((i: any) => i.name === addonName);
                          
                          let pricing = { price: 0, mrp: 0 };
                          if (matchedSvc && matchedSvc.pricing?.[category]) {
                            pricing = { price: matchedSvc.pricing[category].price ?? 0, mrp: matchedSvc.pricing[category].mrp ?? 0 };
                          } else if (matchedInv) {
                            pricing = { price: matchedInv.costPerUnit ?? 0, mrp: matchedInv.costPerUnit ?? 0 };
                          } else {
                            pricing = DEFAULT_ADDON_PRICING_MATRIX[addonName as keyof typeof DEFAULT_ADDON_PRICING_MATRIX]?.[category] || { price: 0, mrp: 0 };
                          }
                          const displayPrice = addonState.quantity > 0 ? addonState.price : pricing.price;

                          return (
                            <div 
                              key={addonName} 
                              className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                addonState.quantity > 0
                                  ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                              }`}
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{addonName}</p>
                                <p className="text-[11px] text-slate-500">Default: ₹{pricing.price}</p>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3">
                                {addonState.quantity > 0 && (
                                  <div className="w-24">
                                    <input
                                      type="number"
                                      value={displayPrice}
                                      onChange={(e) => handleAddonPriceChange(addonName, Number(e.target.value))}
                                      className="w-full px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md text-xs font-bold text-right bg-white dark:bg-slate-900"
                                      placeholder="Price"
                                    />
                                  </div>
                                )}

                                <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                  <button
                                    type="button"
                                    onClick={() => handleAddonQtyChange(addonName, -1)}
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 w-6 text-center">
                                    {addonState.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddonQtyChange(addonName, 1)}
                                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: TYRE & BATTERY */}
                  {activeTab === 'tyre_battery' && (
                    <div className="space-y-4">
                      {/* Tyre Replacement */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Disc className="w-4 h-4 text-indigo-500" />
                            Tyre Replacement
                          </span>
                          <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                            Total: ₹{tyreTotal.toFixed(2)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Quantity"
                            type="number"
                            min={0}
                            value={tyreQty}
                            onChange={(e) => setTyreQty(Math.max(0, Number(e.target.value)))}
                          />
                          <Input
                            label="Price per Tyre (₹)"
                            type="number"
                            min={0}
                            value={tyrePrice}
                            onChange={(e) => setTyrePrice(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                      </div>

                      {/* Battery Replacement */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <BatteryCharging className="w-4 h-4 text-amber-500" />
                            Battery Replacement
                          </span>
                          <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">
                            Total: ₹{batteryTotal.toFixed(2)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="Quantity"
                            type="number"
                            min={0}
                            value={batteryQty}
                            onChange={(e) => setBatteryQty(Math.max(0, Number(e.target.value)))}
                          />
                          <Input
                            label="Price per Battery (₹)"
                            type="number"
                            min={0}
                            value={batteryPrice}
                            onChange={(e) => setBatteryPrice(Math.max(0, Number(e.target.value)))}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 5: CATALOG & CUSTOM */}
                  {activeTab === 'others' && (
                    <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
                      {((predefinedServices || []).filter(s => s.isEnabled)).length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider pb-1 border-b border-slate-100 dark:border-slate-800">
                            Predefined Catalog Packages (for {category})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(predefinedServices || [])
                              .filter(s => s.isEnabled)
                              .map(service => {
                                const price = service.pricing?.[category]?.price ?? 0;
                                const isSelected = customServices.some(cs => cs.serviceDescription === service.name);
                                return (
                                  <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setCustomServices(prev => prev.filter(cs => cs.serviceDescription !== service.name));
                                      } else {
                                        setCustomServices(prev => [...prev, {
                                          customServiceId: `CS-${service.id}-${Date.now()}`,
                                          relatedServiceId: `SUB-${Date.now()}`,
                                          serviceDescription: service.name,
                                          amount: price
                                        }]);
                                      }
                                    }}
                                    className={`p-3 text-left rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-50/70 dark:bg-indigo-950/50 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-bold'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                    }`}
                                  >
                                    <div className="truncate pr-2">
                                      <p className="text-xs font-bold truncate">{service.name}</p>
                                      <p className="text-[10px] text-slate-500">₹{price.toLocaleString()}</p>
                                    </div>
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                                    }`}>
                                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Supplementary Service Templates */}
                      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Supplementary Service Templates
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {serviceTemplates
                            .filter(t => t.isEnabled && !["Car Washing", "Car Care", "Add-ons", "Tyre Replacement", "Battery Replacement"].includes(t.name))
                            .map(template => {
                              const isSelected = otherServices.includes(template.name);
                              return (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => handleToggleOtherService(template.name)}
                                  className={`p-3 text-left rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                                    isSelected
                                      ? 'bg-indigo-50/70 dark:bg-indigo-950/50 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-bold'
                                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                  }`}
                                >
                                  <span className="text-xs font-bold">{template.name}</span>
                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                                    isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live Sticky Order Summary & Invoice Drawer (4 Cols) */}
              <div className="lg:col-span-4 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-900/60 shadow-xl space-y-4 lg:sticky lg:top-0">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2">
                    <Receipt className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-slate-300">Live Order Invoice</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    INR (₹)
                  </span>
                </div>

                {/* Line Items Breakdown */}
                <div className="space-y-2 text-xs max-h-[220px] overflow-y-auto pr-1 divide-y divide-slate-800/80">
                  {selectedWash && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-slate-300">Wash ({selectedWash})</span>
                      <span className="font-extrabold text-white">₹{washPrice.toFixed(2)}</span>
                    </div>
                  )}

                  {selectedCare && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-slate-300">Care ({selectedCare})</span>
                      <span className="font-extrabold text-white">₹{carePrice.toFixed(2)}</span>
                    </div>
                  )}

                  {addonsList.map(item => (
                    <div key={item.name} className="flex justify-between items-center pt-2">
                      <span className="text-slate-300 truncate max-w-[140px]">➕ {item.name} (x{item.quantity})</span>
                      <span className="font-extrabold text-white">₹{(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}

                  {tyreQty > 0 && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-slate-300">🔧 Tyre Replacement (x{tyreQty})</span>
                      <span className="font-extrabold text-white">₹{tyreTotal.toFixed(2)}</span>
                    </div>
                  )}

                  {batteryQty > 0 && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-slate-300">🔋 Battery Replacement (x{batteryQty})</span>
                      <span className="font-extrabold text-white">₹{batteryTotal.toFixed(2)}</span>
                    </div>
                  )}

                  {customServices.map(item => (
                    <div key={item.customServiceId} className="flex justify-between items-center pt-2">
                      <span className="text-slate-300 truncate max-w-[140px]">📦 Catalog: {item.serviceDescription}</span>
                      <span className="font-extrabold text-amber-300">₹{item.amount.toFixed(2)}</span>
                    </div>
                  ))}

                  {otherServices.map(s => (
                    <div key={s} className="flex justify-between items-center pt-2">
                      <span className="text-slate-300 truncate max-w-[140px]">📋 {s}</span>
                      <span className="font-extrabold text-slate-400">₹0.00</span>
                    </div>
                  ))}

                  {travelCharge > 0 && (
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-slate-300 flex items-center gap-1">
                        <Navigation className="w-3 h-3 text-amber-400" />
                        Doorstep Travel Fee
                      </span>
                      <span className="font-extrabold text-amber-300">₹{travelCharge.toFixed(2)}</span>
                    </div>
                  )}

                  {activeSelectionCount === 0 && (
                    <div className="py-6 text-center text-slate-500 italic">
                      No services or add-ons selected yet. Select items from tabs to build invoice.
                    </div>
                  )}
                </div>

                {/* Total Savings Callout */}
                {totalSavings > 0 && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Total Deal Savings:
                    </span>
                    <span>-₹{totalSavings.toFixed(2)}</span>
                  </div>
                )}

                {/* Grand Total */}
                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-slate-300">Grand Total:</span>
                    <span className="text-2xl font-black text-emerald-400">
                      ₹{grandTotal.toFixed(2)}
                    </span>
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Dispatching Order...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm & Dispatch Order</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 flex-shrink-0">
          <div>
            {currentPhase === 2 && (
              <Button 
                variant="secondary" 
                onClick={() => setCurrentPhase(1)}
                className="w-full sm:w-auto text-xs font-bold flex items-center justify-center gap-1 cursor-pointer py-2 sm:py-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Dispatch Logistics
              </Button>
            )}
          </div>

          <div className="flex items-center space-x-2 sm:space-x-2.5">
            <Button 
              variant="ghost" 
              onClick={onClose} 
              disabled={isSubmitting}
              className="flex-1 sm:flex-none text-xs font-bold cursor-pointer py-2 sm:py-1.5"
            >
              Cancel
            </Button>

            {currentPhase === 1 ? (
              <Button 
                onClick={() => { if (validatePhase1()) setCurrentPhase(2); }}
                className="flex-2 sm:flex-none text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1 shadow-md shadow-indigo-600/20 cursor-pointer py-2 sm:py-1.5"
              >
                <span>Next: Services & Live Pricing</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting}
                className="flex-2 sm:flex-none text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 cursor-pointer py-2 sm:py-1.5"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Order'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Location Picker Modal */}
    <LocationPickerModal 
      isOpen={isLocationPickerOpen}
      onClose={() => setIsLocationPickerOpen(false)}
      onConfirm={(lat, lng, address, eLoc, distanceKm, components) => setFormData(prev => ({ 
        ...prev, 
        customer: { 
          ...prev.customer, 
          latitude: lat, 
          longitude: lng, 
          streetAddress: address || prev.customer.streetAddress,
          eLoc: eLoc || '',
          distanceKm: distanceKm,
          houseNo: components?.houseNo || prev.customer.houseNo || '',
          streetName: components?.streetName || prev.customer.streetName || '',
          city: components?.city || prev.customer.city || '',
          stateName: components?.stateName || prev.customer.stateName || '',
          pincode: components?.pincode || prev.customer.pincode || '',
        } 
      }))}
      initialLat={formData.customer.latitude}
      initialLng={formData.customer.longitude}
      initialAddress={formData.customer.streetAddress}
      googleMapsApiKey={settings?.googleMapsApiKey}
      hubLatitude={settings?.hubLatitude}
      hubLongitude={settings?.hubLongitude}
      maxDistanceKm={settings?.maxDistanceKm}
      customHubs={deliveryHubs}
    />
    </>
  );
};

export default CreateOrderModal;
