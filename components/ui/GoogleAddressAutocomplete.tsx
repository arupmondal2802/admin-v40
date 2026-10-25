import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Navigation, Compass, Loader2, CheckCircle2, AlertCircle, AlertTriangle, X, Search, Sparkles, Target } from 'lucide-react';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { parseGoogleAddressComponents } from '../../utils/addressUtils';
import { reverseGeocodeCoords } from '../../services/geocodingService';

export interface AddressSelectResult {
  address: string;
  lat?: number;
  lng?: number;
  distanceKm?: number;
  accuracyMeters?: number;
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  country?: string;
}

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectAddress?: (result: AddressSelectResult) => void;
  label?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  error?: string;
  className?: string;
  customHubs?: any[];
  googleMapsApiKey?: string;
  showGpsButton?: boolean;
  latitude?: number;
  longitude?: number;
  countryRestriction?: string; // default 'in'
}

// Inner Autocomplete component that uses Google Maps Libraries
const AutocompleteInner: React.FC<GoogleAddressAutocompleteProps> = ({
  value: rawValue,
  onChange,
  onSelectAddress,
  label = 'Street Address',
  placeholder = 'Type street, locality, landmark, or village in Google Maps...',
  id = 'streetAddress',
  name = 'streetAddress',
  error,
  className = '',
  customHubs,
  googleMapsApiKey,
  showGpsButton = true,
  latitude,
  longitude,
  countryRestriction = 'in',
}) => {
  const value = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');

  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const geocoder = useMemo(() => {
    if (!geocodingLib) return null;
    return new geocodingLib.Geocoder();
  }, [geocodingLib]);

  // Debounced Place Predictions using google.maps.places.AutocompleteSuggestion
  useEffect(() => {
    if (!value.trim() || !showDropdown) {
      if (!value.trim()) {
        setPredictions([]);
      }
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);

      const AutocompleteSuggestionClass =
        (placesLib as any)?.AutocompleteSuggestion ||
        (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteSuggestion);

      if (AutocompleteSuggestionClass && typeof AutocompleteSuggestionClass.fetchAutocompleteSuggestions === 'function') {
        try {
          const region = (countryRestriction || 'in').toLowerCase();
          let response = await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({
            input: value,
            includedRegionCodes: [region],
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
          console.warn('AutocompleteSuggestion fetch error in GoogleAddressAutocomplete:', e);
        }
      }

      // Fallback: Lazy instantiation of AutocompleteService
      const AutocompleteServiceClass =
        (placesLib as any)?.AutocompleteService ||
        (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteService);

      if (AutocompleteServiceClass) {
        const service = new AutocompleteServiceClass();
        service.getPlacePredictions(
          {
            input: value,
            componentRestrictions: countryRestriction ? { country: countryRestriction } : undefined,
          },
          (results: any, status: any) => {
            setIsSearching(false);
            if (status === 'OK' && results) {
              setPredictions(results);
            } else {
              setPredictions([]);
            }
          }
        );
      } else {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, placesLib, showDropdown, countryRestriction]);

  // Validate custom address string with Geocoding API to ensure valid coordinates
  const handleValidateAddress = useCallback((addrText: string) => {
    if (!addrText.trim()) return;

    let activeGeocoder = geocoder;
    if (!activeGeocoder && typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      activeGeocoder = new (window as any).google.maps.Geocoder();
    }

    if (!activeGeocoder) {
      setStatusMessage({ text: 'Geocoding service unavailable.', type: 'error' });
      return;
    }

    setIsSearching(true);
    setStatusMessage({ text: 'Validating address with Google Maps Geocoding API...', type: 'info' });

    try {
      activeGeocoder.geocode({ address: addrText }, (results, status) => {
        setIsSearching(false);
        if (status === 'OK' && results && results[0] && results[0].geometry?.location) {
          const loc = results[0].geometry.location;
          const lat: number = getCoordValue(loc.lat);
          const lng: number = getCoordValue(loc.lng);
          const formattedAddress = results[0].formatted_address || addrText;
          const parsed = parseGoogleAddressComponents(results[0].address_components, formattedAddress, lat, lng);

          onChange(formattedAddress);

          const hubsToUse = customHubs && customHubs.length > 0 ? customHubs : DEFAULT_DELIVERY_HUBS;
          const washHub = findNearestHub('washing', lat, lng, hubsToUse);
          const detailHub = findNearestHub('detailing', lat, lng, hubsToUse);
          const minDist = Math.min(washHub?.distanceKm ?? 9999, detailHub?.distanceKm ?? 9999);
          const distanceKm = minDist === 9999 ? 0 : minDist;

          if (onSelectAddress) {
            onSelectAddress({
              address: formattedAddress,
              lat,
              lng,
              distanceKm,
              houseNo: parsed.houseNo,
              streetName: parsed.streetName,
              city: parsed.city,
              stateName: parsed.stateName,
              pincode: parsed.pincode,
              country: parsed.country,
            });
          }

          setStatusMessage({
            text: `✅ Geocoded & Validated: ${formattedAddress} (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            type: 'success',
          });
        } else {
          setStatusMessage({
            text: '⚠️ Address could not be resolved to valid geocoordinates. Please choose a suggestion or set pin on map.',
            type: 'error',
          });
        }
      });
    } catch (e) {
      console.warn('[GoogleAddressAutocomplete] handleValidateAddress exception:', e);
      setIsSearching(false);
      setStatusMessage({
        text: '⚠️ Geocoding validation failed. Please pin location on map.',
        type: 'error',
      });
    }
  }, [geocoder, customHubs, onChange, onSelectAddress]);

  // Handle selection from predictions list with robust multi-tiered coordinate capturing
  const handleSelectPrediction = async (prediction: google.maps.places.AutocompletePrediction) => {
    const selectedAddress = prediction.description;
    onChange(selectedAddress);
    setShowDropdown(false);
    setPredictions([]);
    setIsSearching(true);

    const applySelection = (lat: number, lng: number, formattedAddress: string, rawComponents?: any) => {
      setIsSearching(false);
      onChange(formattedAddress);
      const parsed = parseGoogleAddressComponents(rawComponents, formattedAddress, lat, lng);

      // Calculate hub distances
      const hubsToUse = customHubs && customHubs.length > 0 ? customHubs : DEFAULT_DELIVERY_HUBS;
      const washHub = findNearestHub('washing', lat, lng, hubsToUse);
      const detailHub = findNearestHub('detailing', lat, lng, hubsToUse);
      const minDist = Math.min(washHub?.distanceKm ?? 9999, detailHub?.distanceKm ?? 9999);
      const distanceKm = minDist === 9999 ? 0 : minDist;

      if (onSelectAddress) {
        onSelectAddress({
          address: formattedAddress,
          lat,
          lng,
          distanceKm,
          houseNo: parsed.houseNo,
          streetName: parsed.streetName,
          city: parsed.city,
          stateName: parsed.stateName,
          pincode: parsed.pincode,
          country: parsed.country,
        });
      }

      setStatusMessage({
        text: `📍 Captured: ${formattedAddress} (${lat.toFixed(5)}, ${lng.toFixed(5)})`,
        type: 'success',
      });
    };

    // Strategy 1: Place.fetchFields (Places API New)
    const PlaceClass = (placesLib as any)?.Place || (typeof window !== 'undefined' && (window as any).google?.maps?.places?.Place);
    if (PlaceClass && prediction.place_id) {
      try {
        const place = new PlaceClass({ id: prediction.place_id });
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents', 'displayName'] });
        if (place.location) {
          const lat = typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat);
          const lng = typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng);
          const formatted = place.formattedAddress || selectedAddress;
          applySelection(lat, lng, formatted, place.addressComponents);
          return;
        }
      } catch (e) {
        console.warn('[GoogleAddressAutocomplete] Place.fetchFields fallback:', e);
      }
    }

    // Strategy 2: PlacesService.getDetails
    if (typeof window !== 'undefined' && (window as any).google?.maps?.places?.PlacesService && prediction.place_id) {
      try {
        const dummyNode = document.createElement('div');
        const placesService = new (window as any).google.maps.places.PlacesService(dummyNode);
        placesService.getDetails(
          { placeId: prediction.place_id, fields: ['geometry', 'formatted_address', 'address_components'] },
          (place: any, status: any) => {
            if (status === 'OK' && place?.geometry?.location) {
              const loc = place.geometry.location;
              const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
              const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
              const formatted = place.formatted_address || selectedAddress;
              applySelection(lat, lng, formatted, place.address_components);
              return;
            }
            fallbackWithGeocoder();
          }
        );
        return;
      } catch (e) {
        console.warn('[GoogleAddressAutocomplete] PlacesService fallback:', e);
      }
    }

    // Strategy 3: Geocoder fallback
    fallbackWithGeocoder();

    function fallbackWithGeocoder() {
      let activeGeocoder = geocoder;
      if (!activeGeocoder && typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
        activeGeocoder = new (window as any).google.maps.Geocoder();
      }

      if (activeGeocoder) {
        const processGeocodeResults = (results: any[], status: string) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            const lat: number = getCoordValue(loc.lat);
            const lng: number = getCoordValue(loc.lng);
            const formattedAddress = results[0].formatted_address || selectedAddress;
            applySelection(lat, lng, formattedAddress, results[0].address_components);
          } else if (prediction.description) {
            activeGeocoder.geocode({ address: prediction.description }, (addrResults, addrStatus) => {
              if (addrStatus === 'OK' && addrResults && addrResults[0]) {
                const loc = addrResults[0].geometry.location;
                const lat: number = getCoordValue(loc.lat);
                const lng: number = getCoordValue(loc.lng);
                const formattedAddress = addrResults[0].formatted_address || selectedAddress;
                applySelection(lat, lng, formattedAddress, addrResults[0].address_components);
              } else {
                setIsSearching(false);
                if (onSelectAddress) {
                  onSelectAddress({ address: selectedAddress });
                }
              }
            });
          } else {
            setIsSearching(false);
            if (onSelectAddress) {
              onSelectAddress({ address: selectedAddress });
            }
          }
        };

        try {
          if (prediction.place_id) {
            activeGeocoder.geocode({ placeId: prediction.place_id }, processGeocodeResults);
          } else {
            activeGeocoder.geocode({ address: selectedAddress }, processGeocodeResults);
          }
        } catch (e) {
          console.warn('[GoogleAddressAutocomplete] Geocode exception:', e);
          setIsSearching(false);
          if (onSelectAddress) {
            onSelectAddress({ address: selectedAddress });
          }
        }
      } else {
        setIsSearching(false);
        if (onSelectAddress) {
          onSelectAddress({ address: selectedAddress });
        }
      }
    }
  };

  // High Accuracy GPS Geolocation Tracker
  const handleGPSDetect = () => {
    if (!navigator.geolocation) {
      setStatusMessage({ text: 'Geolocation is not supported by your browser.', type: 'error' });
      return;
    }

    setIsLocating(true);
    setStatusMessage({ text: 'Acquiring high-precision GPS lock...', type: 'info' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy);

        setGpsAccuracy(accuracy);
        setIsLocating(false);

        // Calculate nearest hub
        const washHub = findNearestHub('washing', lat, lng, customHubs);
        const detailHub = findNearestHub('detailing', lat, lng, customHubs);
        const minDist = Math.min(washHub?.distanceKm ?? 9999, detailHub?.distanceKm ?? 9999);
        const distanceKm = minDist === 9999 ? 0 : minDist;

        // Reverse Geocode to formatted street address
        if (geocoder) {
          try {
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              let addressText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              let parsedComponents: any = {};
              if (status === 'OK' && results && results[0]) {
                addressText = results[0].formatted_address;
                parsedComponents = parseGoogleAddressComponents(results[0].address_components, addressText, lat, lng);
              }

              onChange(addressText);
              if (onSelectAddress) {
                onSelectAddress({
                  address: addressText,
                  lat,
                  lng,
                  distanceKm,
                  accuracyMeters: accuracy,
                  houseNo: parsedComponents.houseNo,
                  streetName: parsedComponents.streetName,
                  city: parsedComponents.city,
                  stateName: parsedComponents.stateName,
                  pincode: parsedComponents.pincode,
                  country: parsedComponents.country,
                });
              }

              setStatusMessage({
                text: `📍 GPS locked (Accuracy ±${accuracy}m): ${addressText}`,
                type: 'success',
              });
            });
          } catch (e) {
            console.warn('[GoogleAddressAutocomplete] GPS Reverse Geocode exception, trying fallback:', e);
            reverseGeocodeCoords(lat, lng, googleMapsApiKey)
              .then((parsed) => {
                onChange(parsed.streetAddress);
                if (onSelectAddress) {
                  onSelectAddress({
                    address: parsed.streetAddress,
                    lat,
                    lng,
                    distanceKm,
                    accuracyMeters: accuracy,
                    houseNo: parsed.houseNo,
                    streetName: parsed.streetName,
                    city: parsed.city,
                    stateName: parsed.stateName,
                    pincode: parsed.pincode,
                    country: parsed.country,
                  });
                }
                setStatusMessage({
                  text: `📍 GPS locked (Accuracy ±${accuracy}m): ${parsed.streetAddress}`,
                  type: 'success',
                });
              })
              .catch(() => {
                const fallbackText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                onChange(fallbackText);
                if (onSelectAddress) {
                  onSelectAddress({
                    address: fallbackText,
                    lat,
                    lng,
                    distanceKm,
                    accuracyMeters: accuracy,
                  });
                }
                setStatusMessage({
                  text: `📍 GPS locked (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`,
                  type: 'success',
                });
              });
          }
        } else {
          reverseGeocodeCoords(lat, lng, googleMapsApiKey)
            .then((parsed) => {
              onChange(parsed.streetAddress);
              if (onSelectAddress) {
                onSelectAddress({
                  address: parsed.streetAddress,
                  lat,
                  lng,
                  distanceKm,
                  accuracyMeters: accuracy,
                  houseNo: parsed.houseNo,
                  streetName: parsed.streetName,
                  city: parsed.city,
                  stateName: parsed.stateName,
                  pincode: parsed.pincode,
                  country: parsed.country,
                });
              }
              setStatusMessage({
                text: `📍 GPS locked (Accuracy ±${accuracy}m): ${parsed.streetAddress}`,
                type: 'success',
              });
            })
            .catch(() => {
              const fallbackText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
              onChange(fallbackText);
              if (onSelectAddress) {
                onSelectAddress({
                  address: fallbackText,
                  lat,
                  lng,
                  distanceKm,
                  accuracyMeters: accuracy,
                });
              }
              setStatusMessage({
                text: `📍 GPS locked (Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)})`,
                type: 'success',
              });
            });
        }
      },
      (error) => {
        setIsLocating(false);
        console.error('GPS Geolocation Error:', error);
        let errorMsg = 'Failed to acquire GPS location.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'GPS permission denied. Please allow location access in browser settings.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Location signal unavailable. Try moving outdoors.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'GPS search timed out. Retrying...';
        }
        setStatusMessage({ text: errorMsg, type: 'error' });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number' && !isNaN(latitude) && !isNaN(longitude) && (latitude !== 0 || longitude !== 0);

  return (
    <div className={`relative flex flex-col space-y-1.5 ${className}`} ref={dropdownRef}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            {label}
          </label>
          {hasCoords && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Pin: {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </span>
          )}
        </div>
      )}

      <div className="relative flex items-center">
        <div className="absolute left-3 text-slate-400 pointer-events-none">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
          ) : (
            <MapPin className="w-4 h-4 text-slate-400" />
          )}
        </div>

        <input
          type="text"
          id={id}
          name={name}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowDropdown(true);
            setStatusMessage(null);
          }}
          onFocus={() => {
            if (value.trim()) setShowDropdown(true);
          }}
          onBlur={() => {
            // Automatically run geocoding API validation if user typed address manually without coordinates
            if (value.trim().length > 3 && !hasCoords) {
              setTimeout(() => {
                if (!showDropdown) {
                  handleValidateAddress(value);
                }
              }, 200);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full pl-9 ${showGpsButton ? 'pr-28' : 'pr-8'} py-2.5 bg-white dark:bg-slate-900 border ${
            error ? 'border-red-400 focus:ring-red-300' : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500 focus:border-indigo-500'
          } rounded-xl shadow-xs text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 font-medium transition-all`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setPredictions([]);
                setShowDropdown(false);
                setStatusMessage(null);
                setGpsAccuracy(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Clear Address"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {showGpsButton && (
            <button
              type="button"
              onClick={handleGPSDetect}
              disabled={isLocating}
              className="px-2.5 py-1 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Use Current Device GPS Location"
            >
              {isLocating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span className="hidden sm:inline">Locating...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  <span>GPS Auto</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-0.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

      {/* Warning feedback banner when selected/typed address is missing pin-able coordinates */}
      {!hasCoords && value.trim().length > 3 && !statusMessage && (
        <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-semibold flex items-center justify-between gap-2 shadow-2xs mt-1 animate-fadeIn">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="truncate">Address missing verified map coordinates</span>
          </div>
          <button
            type="button"
            onClick={() => handleValidateAddress(value)}
            className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-md shadow-2xs flex-shrink-0 transition-all cursor-pointer active:scale-95"
          >
            Validate Now
          </button>
        </div>
      )}

      {/* GPS Status Message / Accuracy Feedback */}
      {statusMessage && (
        <div
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border flex items-center justify-between gap-2 animate-fadeIn ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200/80 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
              : 'bg-indigo-50 text-indigo-800 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800'
          }`}
        >
          <span className="truncate">{statusMessage.text}</span>
          {gpsAccuracy !== null && (
            <span className="text-[10px] font-mono font-bold bg-white/80 dark:bg-slate-900/80 px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-900 dark:text-emerald-200 flex-shrink-0">
              ±{gpsAccuracy}m
            </span>
          )}
        </div>
      )}

      {/* Google Maps Autocomplete Dropdown */}
      {showDropdown && predictions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-64 overflow-y-auto z-[9999] divide-y divide-slate-100 dark:divide-slate-800 animate-fadeIn">
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3 text-amber-500" /> Google Maps Places</span>
            <span>Select exact street</span>
          </div>

          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => handleSelectPrediction(p)}
              className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/50 transition-colors flex items-start gap-2.5 group cursor-pointer"
            >
              <MapPin className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 truncate">
                  {p.structured_formatting.main_text}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {p.structured_formatting.secondary_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Outer Wrapper that guarantees APIProvider is present with key fallback
function getCoordValue(val: any): number {
  if (typeof val === 'function') return Number(val());
  return Number(val) || 0;
}

export const GoogleAddressAutocomplete: React.FC<GoogleAddressAutocompleteProps> = (props) => {
  const API_KEY =
    props.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const hasKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  if (!hasKey) {
    // Basic fallback without Google Maps Places
    return (
      <div className={`relative flex flex-col space-y-1.5 ${props.className || ''}`}>
        {props.label && (
          <label htmlFor={props.id || 'streetAddress'} className="block text-xs font-bold text-slate-700">
            {props.label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            type="text"
            id={props.id || 'streetAddress'}
            name={props.name || 'streetAddress'}
            value={typeof props.value === 'string' ? props.value : String(props.value ?? '')}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder || 'Enter street address...'}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {props.error && <p className="text-xs text-red-500">{props.error}</p>}
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
      <AutocompleteInner {...props} googleMapsApiKey={API_KEY} />
    </APIProvider>
  );
};

export default GoogleAddressAutocomplete;
