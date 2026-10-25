import React, { useState } from 'react';
import GoogleAddressAutocomplete, { AddressSelectResult } from './GoogleAddressAutocomplete';
import LocationPickerModal, { LocationPickerAddressComponents } from './LocationPickerModal';
import Input from './Input';
import Button from './Button';
import { IconMapPin, IconCrosshair } from './Icon';
import { buildFormattedAddress } from '../../utils/addressUtils';
import { detectLocationAndGeocode } from '../../services/geocodingService';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { haversineDistanceKm } from '../../services/locationService';
import { Navigation, Loader2, Sparkles, MapPin } from 'lucide-react';
import { toast } from 'sonner';

export interface AddressData {
  streetAddress: string;
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
}

interface AddressAutofillSectionProps {
  apiKey: string;
  addressData: AddressData;
  onChange: (updatedData: Partial<AddressData>) => void;
  error?: string;
  customHubs?: any[];
  showMapPinOption?: boolean;
}

export const AddressAutofillSection: React.FC<AddressAutofillSectionProps> = ({
  apiKey,
  addressData,
  onChange,
  error,
  customHubs,
  showMapPinOption = true,
}) => {
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ lat?: number; lng?: number } | null>(null);
  const [isDetectingCurrentLocation, setIsDetectingCurrentLocation] = useState(false);

  // High-accuracy Current GPS Location Detection & Automatic Geocoding
  const handleDetectCurrentLocation = async () => {
    setIsDetectingCurrentLocation(true);
    const toastId = toast.loading('🛰️ Detecting current GPS coordinates and geocoding address...');
    try {
      const result = await detectLocationAndGeocode(apiKey);
      const lat = result.lat!;
      const lng = result.lng!;

      // Calculate distance to nearest hub if hubs are configured
      let computedDistanceKm = addressData.distanceKm;
      const hubsToUse = customHubs && customHubs.length > 0 ? customHubs : DEFAULT_DELIVERY_HUBS;
      if (hubsToUse && hubsToUse.length > 0) {
        const nearest = findNearestHub('washing', lat, lng, hubsToUse);
        if (nearest && typeof nearest.distanceKm === 'number') {
          computedDistanceKm = Math.round(nearest.distanceKm * 10) / 10;
        } else {
          const firstHub = hubsToUse[0];
          const hLat = firstHub.latitude ?? firstHub.lat;
          const hLng = firstHub.longitude ?? firstHub.lon ?? firstHub.lng;
          if (typeof hLat === 'number' && typeof hLng === 'number') {
            computedDistanceKm = Math.round(haversineDistanceKm(lat, lng, hLat, hLng) * 10) / 10;
          }
        }
      }

      // Pre-fill all fields in the service request form
      const updated: Partial<AddressData> = {
        streetAddress: result.streetAddress,
        houseNo: result.houseNo || '',
        streetName: result.streetName || '',
        city: result.city || '',
        stateName: result.stateName || '',
        pincode: result.pincode || '',
        latitude: lat,
        longitude: lng,
        distanceKm: computedDistanceKm,
      };

      onChange(updated);
      setPickerPos({ lat, lng });

      toast.success(
        `📍 Current location detected: ${result.city || result.streetName || 'Address pre-filled!'} (±${Math.round(result.accuracy || 10)}m accuracy)`,
        { id: toastId }
      );
    } catch (err: any) {
      console.error('[AddressAutofillSection] Current location detection error:', err);
      toast.error(err.message || 'Could not detect current location. Please select it on the map.', { id: toastId });
    } finally {
      setIsDetectingCurrentLocation(false);
    }
  };

  // Handle place selection from Google Autocomplete
  const handleSelectAddress = (result: AddressSelectResult) => {
    const newStreetAddress = result.address || '';
    const newLat = result.lat ?? addressData.latitude;
    const newLng = result.lng ?? addressData.longitude;
    
    onChange({
      streetAddress: newStreetAddress,
      houseNo: result.houseNo || addressData.houseNo || '',
      streetName: result.streetName || addressData.streetName || '',
      city: result.city || addressData.city || '',
      stateName: result.stateName || addressData.stateName || '',
      pincode: result.pincode || addressData.pincode || '',
      latitude: newLat,
      longitude: newLng,
      distanceKm: result.distanceKm ?? addressData.distanceKm,
    });

    if (newLat !== undefined && newLng !== undefined) {
      setPickerPos({ lat: newLat, lng: newLng });
    }

    // Automatically trigger pin adjustment modal popup for confirmation & precise coordinate capturing
    setIsLocationPickerOpen(true);
    toast.info('📍 Street address selected! Opening Pin Adjustment tool to confirm doorstep location.');
  };

  // Handle individual component input changes
  const handleComponentChange = (field: keyof AddressData, value: string) => {
    const updated = {
      ...addressData,
      [field]: value,
    };

    // Dynamically rebuild full formatted street address if component fields change
    const newFullAddress = buildFormattedAddress(
      updated.houseNo,
      updated.streetName,
      updated.city,
      updated.stateName,
      updated.pincode
    );

    onChange({
      [field]: value,
      streetAddress: newFullAddress || updated.streetAddress,
    });
  };

  // Handle pin confirmation from Map Picker Modal
  const handleConfirmPin = (
    lat: number,
    lng: number,
    address?: string,
    eLoc?: string,
    distanceKm?: number,
    components?: LocationPickerAddressComponents
  ) => {
    const newAddress = address || addressData.streetAddress;
    onChange({
      latitude: lat,
      longitude: lng,
      streetAddress: newAddress,
      distanceKm: distanceKm ?? addressData.distanceKm,
      houseNo: components?.houseNo || addressData.houseNo || '',
      streetName: components?.streetName || addressData.streetName || '',
      city: components?.city || addressData.city || '',
      stateName: components?.stateName || addressData.stateName || '',
      pincode: components?.pincode || addressData.pincode || '',
    });
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Search Input with 1-Click Current Location Detection */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <label className="block text-sm font-semibold text-slate-700">
            Search Delivery Location (Google Maps Autocomplete)
          </label>
          <button
            type="button"
            onClick={handleDetectCurrentLocation}
            disabled={isDetectingCurrentLocation}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-2xs disabled:opacity-50 cursor-pointer"
            title="Detect current location and pre-fill street address with GPS"
          >
            {isDetectingCurrentLocation ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : (
              <Navigation className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
            )}
            <span>{isDetectingCurrentLocation ? 'Detecting GPS...' : 'Use Current Location'}</span>
          </button>
        </div>
        <GoogleAddressAutocomplete
          googleMapsApiKey={apiKey}
          value={addressData.streetAddress !== undefined && addressData.streetAddress !== null ? String(addressData.streetAddress) : ''}
          onChange={(val) => {
            onChange({ streetAddress: String(val || '') });
          }}
          onSelectAddress={handleSelectAddress}
          customHubs={customHubs}
          error={error}
          placeholder="Search street, locality, landmark or village..."
        />
      </div>

      {/* Structured Address Component Breakdown */}
      <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-accent inline-block"></span>
            Autofilled Address Breakdown
          </span>
          <span className="text-[11px] text-slate-400 font-medium">Auto-populates when location is selected</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Input
              label="Flat / House / Building No."
              placeholder="e.g. Flat 402, Sunshine Apts"
              value={addressData.houseNo !== undefined && addressData.houseNo !== null ? String(addressData.houseNo) : ''}
              onChange={(e) => handleComponentChange('houseNo', e.target.value)}
            />
          </div>
          <div>
            <Input
              label="Street / Area / Landmark"
              placeholder="e.g. Main Road, near Lake Park"
              value={addressData.streetName !== undefined && addressData.streetName !== null ? String(addressData.streetName) : ''}
              onChange={(e) => handleComponentChange('streetName', e.target.value)}
            />
          </div>
          <div>
            <Input
              label="City / Locality"
              placeholder="e.g. Kolkata / Krishnanagar"
              value={addressData.city !== undefined && addressData.city !== null ? String(addressData.city) : ''}
              onChange={(e) => handleComponentChange('city', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="State"
              placeholder="e.g. West Bengal"
              value={addressData.stateName !== undefined && addressData.stateName !== null ? String(addressData.stateName) : ''}
              onChange={(e) => handleComponentChange('stateName', e.target.value)}
            />
            <Input
              label="PIN Code"
              placeholder="e.g. 700001"
              value={addressData.pincode !== undefined && addressData.pincode !== null ? String(addressData.pincode) : ''}
              onChange={(e) => handleComponentChange('pincode', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Map Pinning & Coordinate Control */}
      {showMapPinOption && (
        <div className={`p-3.5 rounded-xl border shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors ${
          addressData.latitude && addressData.longitude
            ? 'bg-white border-slate-200'
            : 'bg-amber-50/70 border-amber-300'
        }`}>
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-full ${
                addressData.latitude && addressData.longitude
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              <IconMapPin className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                {addressData.latitude && addressData.longitude ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    ✓ GPS Location Validated & Pinned
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold flex items-center gap-1">
                    ⚠️ Pin-able Map Coordinates Missing
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-600 font-mono mt-0.5">
                {addressData.latitude && addressData.longitude
                  ? `Lat: ${addressData.latitude.toFixed(6)}, Lng: ${addressData.longitude.toFixed(6)}`
                  : 'Click "Set Pin on Map" to validate exact delivery location and snap to nearest road'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={handleDetectCurrentLocation}
              disabled={isDetectingCurrentLocation}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              title="Detect current location and pre-fill address"
            >
              {isDetectingCurrentLocation ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-indigo-600" />
              )}
              <span>Auto GPS</span>
            </button>
            {addressData.latitude && addressData.longitude && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${addressData.latitude},${addressData.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
              >
                View Map
              </a>
            )}
            <Button
              type="button"
              variant={addressData.latitude && addressData.longitude ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsLocationPickerOpen(true)}
            >
              {addressData.latitude && addressData.longitude ? <IconCrosshair className="w-4 h-4 mr-1.5" /> : <IconMapPin className="w-4 h-4 mr-1.5" />}
              {addressData.latitude && addressData.longitude ? 'Adjust Pin on Map' : 'Set Pin on Map'}
            </Button>
          </div>
        </div>
      )}

      {/* Interactive Map Location Picker Modal */}
      <LocationPickerModal
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onConfirm={handleConfirmPin}
        initialLat={pickerPos?.lat ?? addressData.latitude}
        initialLng={pickerPos?.lng ?? addressData.longitude}
        initialAddress={addressData.streetAddress !== undefined && addressData.streetAddress !== null ? String(addressData.streetAddress) : ''}
        googleMapsApiKey={apiKey}
        customHubs={customHubs}
      />
    </div>
  );
};

export default AddressAutofillSection;
