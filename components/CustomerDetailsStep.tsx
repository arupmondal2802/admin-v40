

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Service, UserSubscription, ServiceTemplate, Customer, TyreData, VehicleCategoryTag, PricingConfig, BaseStepProps } from '../types';
import Input from './ui/Input';
import { findCustomerByMobile } from '../services/customerService';
import { ValidationErrors } from '../services/validationService';
import { IconLoader, IconMapPin, IconCrosshair } from './ui/Icon';
import VehicleSelector from './VehicleSelector';
import Button from './ui/Button';
import { getCategoryForVehicle } from '../services/vehicleService';
import { VEHICLE_CATEGORY_TAGS, findNearestHub, DEFAULT_DELIVERY_HUBS } from '../constants';
import LocationPickerModal from './ui/LocationPickerModal';
import LocationPreviewMap from './ui/LocationPreviewMap';
import GoogleAddressAutocomplete from './ui/GoogleAddressAutocomplete';
import AddressAutofillSection from './ui/AddressAutofillSection';
import OrderTagsManager from './ui/OrderTagsManager';
import { detectLocationAndGeocode } from '../services/geocodingService';
import { haversineDistanceKm } from '../services/locationService';
import { toast } from 'sonner';

const CustomerDetailsStep: React.FC<BaseStepProps> = ({ state, updateField, dispatch, userSubscriptions, errors, allSubmissions, vehicleData, carDatabase, onUpdateVehicleData, customerBook, allUsers = [], deliveryHubs }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [foundProfiles, setFoundProfiles] = useState<Awaited<ReturnType<typeof findCustomerByMobile>> | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  
  // Track the previous model to only trigger auto-detection when it actually changes
  const prevModelRef = useRef(state.carBrandModel);

  useEffect(() => {
    // Only run auto-detection if the model string has actually changed
    if (state.carBrandModel && state.carBrandModel !== prevModelRef.current) {
        const detectedCategory = getCategoryForVehicle(state.carBrandModel);
        // Only update if it's different to avoid loops, but allow manual override later
        if (state.vehicleCategoryTag !== detectedCategory) {
            updateField('vehicleCategoryTag', detectedCategory);
        }
        prevModelRef.current = state.carBrandModel;
    }
  }, [state.carBrandModel, state.vehicleCategoryTag, updateField]);


  const prefillFormWithProfile = useCallback((profile: { customer: Customer; isSubscriber: boolean; washesRemaining?: number }) => {
    const detectedCategory = getCategoryForVehicle(profile.customer.carBrandModel);
    const customerData = {
      ...state,
      mobileNumber: profile.customer.mobileNumber,
      customerFirstName: profile.customer.firstName,
      customerLastName: profile.customer.lastName,
      streetAddress: profile.customer.streetAddress,
      carNumber: profile.customer.carNumber,
      carBrandModel: profile.customer.carBrandModel,
      customerEmail: profile.customer.customerEmail,
      isSubscription: profile.isSubscriber,
      vehicleCategoryTag: detectedCategory,
      customerLatitude: profile.customer.latitude,
      customerLongitude: profile.customer.longitude,
      loyaltyScore: profile.customer.loyaltyScore,
    };
    dispatch({ type: 'SET_FORM_DATA', payload: customerData });
    setFoundProfiles(null); // Clear profiles to hide the selection UI
    setSearchMessage('Customer data pre-filled.'); // Update message
  }, [dispatch, state]);

  const handleMobileBlur = useCallback(async () => {
    const mobileToSearch = String(state.mobileNumber || '');
    
    if (!mobileToSearch || mobileToSearch.trim().length < 10) {
      setSearchMessage('');
      setFoundProfiles(null);
      return;
    }

    setIsSearching(true);
    setSearchMessage('');
    setFoundProfiles(null);

    const profiles = await findCustomerByMobile(mobileToSearch, allSubmissions, userSubscriptions, customerBook);
    setIsSearching(false);
    if (profiles && profiles.length > 0) {
      if (profiles.length === 1) {
        prefillFormWithProfile(profiles[0]);
        if (profiles[0].isSubscriber) {
          setSearchMessage(`Active subscriber found! Washes remaining: ${profiles[0].washesRemaining}.`);
        } else {
          setSearchMessage('Existing customer data pre-filled.');
        }
      } else {
        setFoundProfiles(profiles);
        setSearchMessage(`${profiles.length} vehicles found for this number. Please select one.`);
      }
    } else {
      setSearchMessage('No customer found. New customer details can be entered manually.');
    }
  }, [state.mobileNumber, allSubmissions, userSubscriptions, customerBook, prefillFormWithProfile]);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const sanitized = value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
    if (sanitized.length <= 15) {
        updateField('mobileNumber', sanitized);
        setSearchMessage('');
    }
  };

  const handleVehicleChange = useCallback((value: string) => {
    updateField('carBrandModel', value);
  }, [updateField]);

  const handleGetLocation = async () => {
    setIsGettingLocation(true);
    const toastId = toast.loading('🛰️ Detecting current GPS coordinates and geocoding address...');
    try {
      const result = await detectLocationAndGeocode("AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M");
      const lat = result.lat!;
      const lng = result.lng!;

      updateField('customerLatitude', lat);
      updateField('customerLongitude', lng);

      if (result.streetAddress) {
        updateField('streetAddress', result.streetAddress);
      }
      if (result.houseNo) {
        updateField('houseNo', result.houseNo);
      }
      if (result.streetName) {
        updateField('streetName', result.streetName);
      }
      if (result.city) {
        updateField('city', result.city);
      }
      if (result.stateName) {
        updateField('stateName', result.stateName);
      }
      if (result.pincode) {
        updateField('pincode', result.pincode);
      }

      // Calculate distance to nearest hub
      const hubsToUse = deliveryHubs && deliveryHubs.length > 0 ? deliveryHubs : DEFAULT_DELIVERY_HUBS;
      if (hubsToUse && hubsToUse.length > 0) {
        const nearest = findNearestHub('washing', lat, lng, hubsToUse);
        if (nearest && typeof nearest.distanceKm === 'number') {
          updateField('customerDistanceKm', Math.round(nearest.distanceKm * 10) / 10);
        } else {
          const firstHub = hubsToUse[0] as any;
          const hLat = firstHub.latitude ?? firstHub.lat;
          const hLng = firstHub.longitude ?? firstHub.lon ?? firstHub.lng;
          if (typeof hLat === 'number' && typeof hLng === 'number') {
            updateField('customerDistanceKm', Math.round(haversineDistanceKm(lat, lng, hLat, hLng) * 10) / 10);
          }
        }
      }

      toast.success(
        `📍 Current location detected and pre-filled: ${result.city || result.streetName || result.streetAddress}`,
        { id: toastId }
      );
    } catch (error: any) {
      console.error('Error getting location & geocoding', error);
      toast.error(error.message || 'Unable to retrieve location. Please ensure location services are enabled.', { id: toastId });
    } finally {
      setIsGettingLocation(false);
    }
  };

  return (
    <div className="space-y-6">
      {state.loyaltyScore !== undefined && state.loyaltyScore > 0 && (
        <div className="p-3.5 border border-amber-200 rounded-xl bg-amber-50 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">👑</span>
            <div>
              <p className="font-bold text-amber-900 text-sm">Priority Customer (Loyalty Score: {state.loyaltyScore})</p>
              <p className="text-xs text-amber-700">Please prioritize this order for high service speed and quality.</p>
            </div>
          </div>
          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-amber-200 text-amber-900 uppercase">
            Score: {state.loyaltyScore}
          </span>
        </div>
      )}
      {Array.isArray(foundProfiles) && foundProfiles.length > 0 && (
        <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
          <h3 className="font-semibold text-blue-800">{searchMessage}</h3>
          <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
            {foundProfiles.map((profile, index) => (
              <label key={index} className="flex items-center p-3 bg-white rounded-md border cursor-pointer hover:bg-blue-100 has-[:checked]:bg-blue-100 has-[:checked]:border-blue-400">
                <input 
                  type="radio" 
                  name="customer-profile-selection" 
                  className="h-4 w-4 text-brand-accent focus:ring-brand-accent"
                  onChange={() => prefillFormWithProfile(profile)}
                />
                <div className="ml-3 text-sm">
                  <p className="font-semibold text-slate-800">{profile.customer.carBrandModel}</p>
                  <p className="text-slate-600">{profile.customer.carNumber}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-2 text-right">
            <Button variant="ghost" size="sm" onClick={() => { setFoundProfiles(null); setSearchMessage(''); }}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Input
          label="Customer First Name"
          id="customerFirstName"
          value={state.customerFirstName}
          onChange={(e) => updateField('customerFirstName', e.target.value)}
          error={errors.customerFirstName}
        />
        <Input
          label="Customer Last Name"
          id="customerLastName"
          value={state.customerLastName}
          onChange={(e) => updateField('customerLastName', e.target.value)}
        />
        <div className="md:col-span-2">
          <AddressAutofillSection
            apiKey="AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M"
            addressData={{
              streetAddress: state.streetAddress !== undefined && state.streetAddress !== null ? String(state.streetAddress) : '',
              houseNo: state.houseNo !== undefined && state.houseNo !== null ? String(state.houseNo) : '',
              streetName: state.streetName !== undefined && state.streetName !== null ? String(state.streetName) : '',
              city: state.city !== undefined && state.city !== null ? String(state.city) : '',
              stateName: state.stateName !== undefined && state.stateName !== null ? String(state.stateName) : '',
              pincode: state.pincode !== undefined && state.pincode !== null ? String(state.pincode) : '',
              latitude: state.customerLatitude,
              longitude: state.customerLongitude,
              distanceKm: state.customerDistanceKm,
            }}
            onChange={(updatedData) => {
              if (updatedData.streetAddress !== undefined) updateField('streetAddress', updatedData.streetAddress);
              if (updatedData.houseNo !== undefined) updateField('houseNo', updatedData.houseNo);
              if (updatedData.streetName !== undefined) updateField('streetName', updatedData.streetName);
              if (updatedData.city !== undefined) updateField('city', updatedData.city);
              if (updatedData.stateName !== undefined) updateField('stateName', updatedData.stateName);
              if (updatedData.pincode !== undefined) updateField('pincode', updatedData.pincode);
              if (updatedData.latitude !== undefined) updateField('customerLatitude', updatedData.latitude);
              if (updatedData.longitude !== undefined) updateField('customerLongitude', updatedData.longitude);
              if (updatedData.distanceKm !== undefined) updateField('customerDistanceKm', updatedData.distanceKm);
            }}
            error={typeof errors.streetAddress === 'string' ? errors.streetAddress : undefined}
            customHubs={deliveryHubs}
            showMapPinOption={true}
          />
        </div>
        <div className="md:col-span-2">
          <LocationPreviewMap
            latitude={state.customerLatitude}
            longitude={state.customerLongitude}
            address={state.streetAddress}
            customHubs={deliveryHubs}
            onOpenPicker={() => setIsLocationPickerOpen(true)}
            onGetLocation={handleGetLocation}
            onCoordinatesChange={(lat, lng, addr) => {
              updateField('customerLatitude', lat);
              updateField('customerLongitude', lng);
              if (addr) updateField('streetAddress', addr);
            }}
            isGettingLocation={isGettingLocation}
            title="Customer Doorstep Location Map Preview"
            height="180px"
          />
        </div>
        <div>
          <Input
            label="Mobile Number"
            id="mobileNumber"
            type="tel"
            prefix="+91"
            value={state.mobileNumber}
            onChange={handleMobileChange}
            onBlur={handleMobileBlur}
            error={errors.mobileNumber}
            placeholder="98765 43210"
            maxLength={15}
            suffix={isSearching ? <IconLoader className="w-5 h-5 text-slate-400 animate-spin" /> : undefined}
          />
           {searchMessage && !isSearching && !foundProfiles && <p className={`mt-2 text-sm font-semibold ${searchMessage.includes('subscriber') ? 'text-green-600' : searchMessage.includes('pre-filled') ? 'text-blue-600' : 'text-slate-600'}`}>{searchMessage}</p>}
        </div>
         <Input
          label="Customer Email (Optional)"
          id="customerEmail"
          type="email"
          value={state.customerEmail || ''}
          onChange={(e) => updateField('customerEmail', e.target.value)}
        />
        <Input
          label="Loyalty Score (Optional)"
          id="loyaltyScore"
          type="number"
          min={0}
          max={100}
          value={state.loyaltyScore !== undefined ? state.loyaltyScore : ''}
          onChange={(e) => updateField('loyaltyScore', e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder="e.g. 85"
        />
        <Input
          label="Car Number"
          id="carNumber"
          value={state.carNumber}
          onChange={(e) => updateField('carNumber', e.target.value)}
          error={errors.carNumber}
        />
         <div>
            <label htmlFor="vehicleCategoryTag" className="block text-sm font-medium text-slate-700 mb-1">
                Vehicle Category
            </label>
            <select
                id="vehicleCategoryTag"
                value={state.vehicleCategoryTag || ''}
                onChange={(e) => updateField('vehicleCategoryTag', e.target.value as VehicleCategoryTag)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
            >
                <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Select Category --</option>
                {VEHICLE_CATEGORY_TAGS.map(tag => (
                    <option key={tag} value={tag} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">{tag}</option>
                ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Auto-detected. Change manually if incorrect.</p>
        </div>
        <div className="md:col-span-2">
            <VehicleSelector
                value={state.carBrandModel}
                onChange={handleVehicleChange}
                error={errors.carBrandModel}
                vehicleData={vehicleData}
                carDatabase={carDatabase || []}
                onUpdateVehicleData={onUpdateVehicleData}
                onSelectCarVariant={(variant) => {
                  if (variant.frontTyresSpec) updateField('frontTyresSpec', variant.frontTyresSpec);
                  if (variant.rearTyresSpec) updateField('rearTyresSpec', variant.rearTyresSpec);
                  if (variant.fuelType) updateField('carFuelType', variant.fuelType);
                  if (variant.version) updateField('carVersion', variant.version);
                  if (variant.brand) updateField('carBrand', variant.brand);
                  if (variant.model) updateField('carModelName', variant.model);
                  if (variant.logo) updateField('carLogoUrl', variant.logo);
                  if (variant.image) updateField('carImageUrl', variant.image);
                  if (variant.tag) updateField('vehicleCategoryTag', variant.tag as any);
                }}
            />
        </div>

        <div className="md:col-span-2 pt-4 border-t border-slate-200 mt-2">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3 flex items-center">
              <span className="w-2 h-2 rounded-full bg-brand-accent mr-2"></span>
              Job Labor & Staff Assignment
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="formPrimaryAssignee" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Primary Technician / Specialist
                </label>
                <select
                  id="formPrimaryAssignee"
                  value={state.assignedTo || ''}
                  onChange={(e) => updateField('assignedTo', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
                >
                  <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- Unassigned (Select Lead) --</option>
                  {allUsers.map(u => (
                    <option key={u.username} value={u.username} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">🔧 {u.username} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="formSecondaryAssignee" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Additional Helper / Technician / Labour (Optional)
                </label>
                <select
                  id="formSecondaryAssignee"
                  value={state.secondaryAssignee || ''}
                  onChange={(e) => updateField('secondaryAssignee', e.target.value || undefined)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent sm:text-sm"
                >
                  <option value="" className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">-- None (Single Labour) --</option>
                  {allUsers.filter(u => u.username !== state.assignedTo).map(u => (
                    <option key={u.username} value={u.username} className="bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100">🤝 {u.username} ({u.role})</option>
                  ))}
                </select>
              </div>
            </div>
        </div>

        <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-800 mt-2">
            <OrderTagsManager
              tags={state.tags || []}
              onChange={(newTags) => updateField('tags', newTags)}
            />
        </div>
      </div>

      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        initialLat={state.customerLatitude}
        initialLng={state.customerLongitude}
        initialAddress={state.streetAddress}
        customHubs={deliveryHubs}
        onConfirm={(lat, lng, address, _eLoc, distanceKm, components) => {
          updateField('customerLatitude', lat);
          updateField('customerLongitude', lng);
          if (address) {
            updateField('streetAddress', address);
          }
          if (distanceKm !== undefined) {
            updateField('customerDistanceKm', distanceKm);
          }
          if (components) {
            if (components.houseNo) updateField('houseNo', components.houseNo);
            if (components.streetName) updateField('streetName', components.streetName);
            if (components.city) updateField('city', components.city);
            if (components.stateName) updateField('stateName', components.stateName);
            if (components.pincode) updateField('pincode', components.pincode);
          }
        }}
      />
    </div>
  );
};

export default CustomerDetailsStep;