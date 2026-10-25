import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import Button from './Button';
import { IconMapPin, IconCrosshair } from './Icon';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { Navigation, Target, CheckCircle2, Search, Loader2, MapPin, Compass, Plus, Minus, Clock, X } from 'lucide-react';
import { parseGoogleAddressComponents, ParsedAddress } from '../../utils/addressUtils';
import { reverseGeocodeCoords, detectCurrentLocation } from '../../services/geocodingService';
import { toast } from 'sonner';
import { MapLiveTravelTimeBadge } from './MapLiveTravelTimeBadge';
import { DistanceMatrixResult } from '../../services/distanceMatrixService';
import { useAndroidBackButton } from '../../hooks/useAndroidBackButton';

export interface LocationPickerAddressComponents {
  houseNo?: string;
  streetName?: string;
  city?: string;
  stateName?: string;
  pincode?: string;
  country?: string;
}

export interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    lat: number,
    lng: number,
    address?: string,
    eLoc?: string,
    distanceKm?: number,
    components?: LocationPickerAddressComponents
  ) => void;
  initialLat?: number;
  initialLng?: number;
  initialAddress?: string;
  googleMapsApiKey?: string;
  hubLatitude?: number;
  hubLongitude?: number;
  maxDistanceKm?: number;
  customHubs?: any[];
}

// Popular Hubs & Cities in Bengal for instant one-click jump
const QUICK_JUMP_PRESETS = [
  { name: 'Kalyani', lat: 22.9751, lng: 88.4345 },
  { name: 'Krishnanagar', lat: 23.4013, lng: 88.5021 },
  { name: 'Ranaghat', lat: 23.1809, lng: 88.5802 },
  { name: 'Kolkata Central', lat: 22.5726, lng: 88.3639 },
  { name: 'Shantipur', lat: 23.2505, lng: 88.4328 },
  { name: 'Chakdaha', lat: 23.0805, lng: 88.5255 },
];

// Interactive Map Events & Real-time Crosshair Tracking Controller
function InteractiveMapController({
  customerPos,
  hubPos,
  resetTrigger,
  programmaticTrigger,
  onMapCenterChange,
  reverseGeocode,
  onMapClick,
}: {
  customerPos: { lat: number; lng: number } | null;
  hubPos: { lat: number; lng: number; name?: string } | null;
  resetTrigger?: number;
  programmaticTrigger?: number;
  onMapCenterChange: (pos: { lat: number; lng: number }, shouldGeocode?: boolean) => void;
  reverseGeocode: (pos: { lat: number; lng: number }) => void;
  onMapClick?: () => void;
}) {
  const map = useMap();
  const lastResetTriggerRef = useRef(resetTrigger);
  const lastProgrammaticTriggerRef = useRef(programmaticTrigger);
  const isProgrammaticPanRef = useRef(false);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // Sync map center whenever customerPos is changed externally or programmatically
  useEffect(() => {
    if (!map || !customerPos || isNaN(customerPos.lat) || isNaN(customerPos.lng)) return;

    // Explicit manual click on "Fit Hub & Customer" button
    if (resetTrigger !== undefined && resetTrigger !== lastResetTriggerRef.current) {
      lastResetTriggerRef.current = resetTrigger;
      if (hubPos && !isNaN(hubPos.lat) && !isNaN(hubPos.lng)) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(customerPos);
        bounds.extend({ lat: hubPos.lat, lng: hubPos.lng });
        map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
        return;
      }
    }

    // Programmatic trigger (search result selected, locate-me clicked, quick-jump preset, or search submitted)
    const isProgrammatic = programmaticTrigger !== undefined && programmaticTrigger !== lastProgrammaticTriggerRef.current;
    if (isProgrammatic) {
      lastProgrammaticTriggerRef.current = programmaticTrigger;
      isProgrammaticPanRef.current = true;
      lastPosRef.current = customerPos;
      map.setCenter(customerPos);
      map.panTo(customerPos);
      // Automatically zoom to street-level view (zoom level 16) immediately after a search result is selected
      map.setZoom(16);
      setTimeout(() => {
        isProgrammaticPanRef.current = false;
      }, 500);
      return;
    }

    // Check if position genuinely changed
    if (
      lastPosRef.current &&
      Math.abs(lastPosRef.current.lat - customerPos.lat) < 0.00001 &&
      Math.abs(lastPosRef.current.lng - customerPos.lng) < 0.00001
    ) {
      return;
    }

    lastPosRef.current = customerPos;
    isProgrammaticPanRef.current = true;
    map.panTo(customerPos);
    if (!map.getZoom() || map.getZoom()! < 15) {
      map.setZoom(16);
    }
    setTimeout(() => {
      isProgrammaticPanRef.current = false;
    }, 500);
  }, [map, customerPos, resetTrigger, programmaticTrigger, hubPos]);

  // Handle map clicks & drag/pan idle events to keep crosshair synchronized
  useEffect(() => {
    if (!map) return;

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (onMapClick) onMapClick();
      if (e.latLng) {
        const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        isProgrammaticPanRef.current = true;
        map.panTo(newPos);
        onMapCenterChange(newPos, true);
        reverseGeocode(newPos);
        setTimeout(() => {
          isProgrammaticPanRef.current = false;
        }, 400);
      }
    });

    const dragEndListener = map.addListener('dragend', () => {
      const center = map.getCenter();
      if (center) {
        const newPos = { lat: center.lat(), lng: center.lng() };
        lastPosRef.current = newPos;
        onMapCenterChange(newPos, true);
        reverseGeocode(newPos);
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
      google.maps.event.removeListener(dragEndListener);
    };
  }, [map, onMapCenterChange, reverseGeocode, onMapClick]);

  return null;
}

const LocationPickerModalFallback: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-white rounded-xl shadow-xl flex flex-col h-[80vh] md:h-[600px] modal-content font-sans">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center rounded-t-xl">
          <h3 className="text-lg font-semibold text-slate-800">Pin Exact Location (Google Maps)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        <div className="flex-1 relative bg-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <h4 className="text-sm font-semibold text-slate-700">Google Maps API Key required to render Pin Selector map.</h4>
        </div>

        <div className="p-4 bg-white border-t border-slate-200 rounded-b-xl flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

// Helper component to snap pin to map center
function MapCenterSnapButton({
  setCurrentPos,
  reverseGeocode,
}: {
  setCurrentPos: (pos: { lat: number; lng: number }) => void;
  reverseGeocode: (pos: { lat: number; lng: number }) => void;
}) {
  const map = useMap();

  const handleSnapToCenter = () => {
    if (!map) return;
    const center = map.getCenter();
    if (center) {
      const pos = { lat: center.lat(), lng: center.lng() };
      setCurrentPos(pos);
      reverseGeocode(pos);
      toast.success(`📍 Pin snapped to ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`);
    }
  };

  return (
    <button
      onClick={handleSnapToCenter}
      type="button"
      className="absolute top-3.5 right-16 z-[400] bg-white hover:bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg shadow-md border border-indigo-200 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
      title="Snap Pin & Address to Crosshair Center"
    >
      <Target className="w-4 h-4 text-indigo-600 animate-pulse" />
      <span>Snap Pin to Crosshair</span>
    </button>
  );
}

// Custom Zoom-in and Zoom-out control component
function MapZoomControls() {
  const map = useMap();

  const handleZoomIn = () => {
    if (!map) return;
    const current = map.getZoom();
    if (typeof current === 'number') {
      map.setZoom(Math.min(current + 1, 21));
    } else {
      map.setZoom(16);
    }
  };

  const handleZoomOut = () => {
    if (!map) return;
    const current = map.getZoom();
    if (typeof current === 'number') {
      map.setZoom(Math.max(current - 1, 3));
    } else {
      map.setZoom(13);
    }
  };

  return (
    <div className="absolute right-4 top-16 z-[400] flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-300 dark:border-slate-700 overflow-hidden">
      <button
        id="map-zoom-in-btn"
        onClick={handleZoomIn}
        type="button"
        className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition-colors border-b border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center"
        title="Zoom In (+)"
        aria-label="Zoom in"
      >
        <Plus className="w-5 h-5" />
      </button>
      <button
        id="map-zoom-out-btn"
        onClick={handleZoomOut}
        type="button"
        className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center justify-center"
        title="Zoom Out (-)"
        aria-label="Zoom out"
      >
        <Minus className="w-5 h-5" />
      </button>
    </div>
  );
}

// Visual Service Radius Circle rendered on Google Map centered at Hub
function MapServiceRadiusCircle({
  center,
  radiusKm,
  strokeColor = '#4f46e5',
  fillColor = '#6366f1',
  strokeOpacity = 0.85,
  strokeWeight = 2,
  fillOpacity = 0.12,
}: {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  strokeColor?: string;
  fillColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  fillOpacity?: number;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map || !center || typeof center.lat !== 'number' || typeof center.lng !== 'number' || isNaN(center.lat) || isNaN(center.lng)) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    const radiusMeters = Math.max(radiusKm, 1) * 1000;

    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        map,
        center: { lat: center.lat, lng: center.lng },
        radius: radiusMeters,
        strokeColor,
        strokeOpacity,
        strokeWeight,
        fillColor,
        fillOpacity,
        clickable: false,
        zIndex: 1,
      });
    } else {
      circleRef.current.setCenter({ lat: center.lat, lng: center.lng });
      circleRef.current.setRadius(radiusMeters);
      circleRef.current.setOptions({
        strokeColor,
        strokeOpacity,
        strokeWeight,
        fillColor,
        fillOpacity,
        zIndex: 1,
      });
      if (circleRef.current.getMap() !== map) {
        circleRef.current.setMap(map);
      }
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center?.lat, center?.lng, radiusKm, strokeColor, fillColor, strokeOpacity, strokeWeight, fillOpacity]);

  return null;
}

const LocationPickerModalContent: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
  initialAddress,
  googleMapsApiKey,
  hubLatitude = 22.572646,
  hubLongitude = 88.363895,
  maxDistanceKm = 20,
  customHubs,
}) => {
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );

  const [searchQuery, setSearchQuery] = useState(initialAddress || '');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>(initialAddress || '');
  const [currentComponents, setCurrentComponents] = useState<LocationPickerAddressComponents>({});
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [programmaticTrigger, setProgrammaticTrigger] = useState(0);
  const [liveTravelEstimate, setLiveTravelEstimate] = useState<DistanceMatrixResult | null>(null);
  const [autoCapturedNotice, setAutoCapturedNotice] = useState<{ lat: number; lng: number; address: string } | null>(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng, address: initialAddress || '' } : null
  );

  // Effective settings fallback to localStorage if not directly provided
  const effectiveHubLat = useMemo(() => {
    if (typeof hubLatitude === 'number' && !isNaN(hubLatitude) && hubLatitude !== 0) return hubLatitude;
    const stored = parseFloat(localStorage.getItem('hubLatitude') || '');
    return !isNaN(stored) && stored !== 0 ? stored : 22.572646;
  }, [hubLatitude]);

  const effectiveHubLng = useMemo(() => {
    if (typeof hubLongitude === 'number' && !isNaN(hubLongitude) && hubLongitude !== 0) return hubLongitude;
    const stored = parseFloat(localStorage.getItem('hubLongitude') || '');
    return !isNaN(stored) && stored !== 0 ? stored : 88.363895;
  }, [hubLongitude]);

  const effectiveMaxDistance = useMemo(() => {
    if (typeof maxDistanceKm === 'number' && !isNaN(maxDistanceKm) && maxDistanceKm > 0) return maxDistanceKm;
    const stored = parseFloat(localStorage.getItem('maxDistanceKm') || '');
    return !isNaN(stored) && stored > 0 ? stored : 20;
  }, [maxDistanceKm]);

  // Central Hub calculation
  const hubPos = useMemo(() => {
    const hubsToUse = customHubs && customHubs.length > 0 ? customHubs : DEFAULT_DELIVERY_HUBS;
    if (currentPos && hubsToUse.length > 0) {
      const nearest = findNearestHub('washing', currentPos.lat, currentPos.lng, hubsToUse);
      if (nearest && nearest.hub) {
        const h = nearest.hub as any;
        return {
          lat: typeof h.lat === 'number' ? h.lat : (h.latitude ?? effectiveHubLat),
          lng: typeof h.lon === 'number' ? h.lon : (h.longitude ?? h.lng ?? effectiveHubLng),
          name: h.name || 'Central Hub',
        };
      }
    }
    if (hubsToUse.length > 0) {
      const h = hubsToUse[0];
      return {
        lat: typeof h.latitude === 'number' ? h.latitude : (h.lat ?? effectiveHubLat),
        lng: typeof h.longitude === 'number' ? h.longitude : (h.lon ?? h.lng ?? effectiveHubLng),
        name: h.name || 'Central Hub',
      };
    }
    if (typeof hubLatitude === 'number' && typeof hubLongitude === 'number' && hubLatitude !== 0 && hubLongitude !== 0) {
      return { lat: hubLatitude, lng: hubLongitude, name: 'Central Hub' };
    }
    return { lat: effectiveHubLat, lng: effectiveHubLng, name: 'Central Hub' };
  }, [hubLatitude, hubLongitude, effectiveHubLat, effectiveHubLng, currentPos, customHubs]);

  // Load Google Maps Autocomplete and Geocoding libraries
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');

  const geocoder = useMemo(() => {
    if (!geocodingLib) return null;
    return new geocodingLib.Geocoder();
  }, [geocodingLib]);

  const reverseGeocode = useCallback((pos: { lat: number; lng: number }) => {
    setIsFetchingAddress(true);
    if (!geocoder) {
      // Fallback via reverseGeocodeCoords
      reverseGeocodeCoords(pos.lat, pos.lng, googleMapsApiKey)
        .then((parsed) => {
          setIsFetchingAddress(false);
          setCurrentAddress(parsed.streetAddress);
          setSearchQuery(parsed.streetAddress);
          setCurrentComponents({
            houseNo: parsed.houseNo,
            streetName: parsed.streetName,
            city: parsed.city,
            stateName: parsed.stateName,
            pincode: parsed.pincode,
            country: parsed.country,
          });
        })
        .catch(() => {
          setIsFetchingAddress(false);
          setCurrentAddress(`${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
        });
      return;
    }

    try {
      geocoder.geocode({ location: pos }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          setIsFetchingAddress(false);
          const loc = results[0].geometry?.location;
          let snappedLat = pos.lat;
          let snappedLng = pos.lng;
          if (loc) {
            snappedLat = Number(typeof loc.lat === 'function' ? loc.lat() : loc.lat);
            snappedLng = Number(typeof loc.lng === 'function' ? loc.lng() : loc.lng);
          }

          const formatted = results[0].formatted_address;
          setCurrentAddress(formatted);
          setSearchQuery(formatted);
          const parsed = parseGoogleAddressComponents(results[0].address_components, formatted, snappedLat, snappedLng);
          setCurrentComponents({
            houseNo: parsed.houseNo,
            streetName: parsed.streetName,
            city: parsed.city,
            stateName: parsed.stateName,
            pincode: parsed.pincode,
            country: parsed.country,
          });
        } else {
          // Google geocoder returned non-OK, try fallback
          reverseGeocodeCoords(pos.lat, pos.lng, googleMapsApiKey)
            .then((parsed) => {
              setIsFetchingAddress(false);
              setCurrentAddress(parsed.streetAddress);
              setSearchQuery(parsed.streetAddress);
              setCurrentComponents({
                houseNo: parsed.houseNo,
                streetName: parsed.streetName,
                city: parsed.city,
                stateName: parsed.stateName,
                pincode: parsed.pincode,
                country: parsed.country,
              });
            })
            .catch(() => {
              setIsFetchingAddress(false);
              setCurrentAddress(`${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
            });
        }
      });
    } catch (e) {
      console.warn('[LocationPickerModal] Reverse geocode exception, trying fallback:', e);
      reverseGeocodeCoords(pos.lat, pos.lng, googleMapsApiKey)
        .then((parsed) => {
          setIsFetchingAddress(false);
          setCurrentAddress(parsed.streetAddress);
          setSearchQuery(parsed.streetAddress);
          setCurrentComponents({
            houseNo: parsed.houseNo,
            streetName: parsed.streetName,
            city: parsed.city,
            stateName: parsed.stateName,
            pincode: parsed.pincode,
            country: parsed.country,
          });
        })
        .catch(() => {
          setIsFetchingAddress(false);
          setCurrentAddress(`${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`);
        });
    }
  }, [geocoder, googleMapsApiKey]);

  // Initial geocoding or positioning when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialLat && initialLng) {
      const pos = { lat: initialLat, lng: initialLng };
      setCurrentPos(pos);
      setProgrammaticTrigger((prev) => prev + 1);
      if (initialAddress) {
        setCurrentAddress(initialAddress);
        setSearchQuery(initialAddress);
      } else {
        setTimeout(() => reverseGeocode(pos), 400);
      }
    } else if (initialAddress && initialAddress.trim() && geocoder) {
      // If initial address string exists but coordinates don't, geocode address string immediately!
      setIsSearchingLocation(true);
      geocoder.geocode({ address: initialAddress }, (results, status) => {
        setIsSearchingLocation(false);
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const latVal = typeof loc.lat === 'function' ? loc.lat() : (loc as any).lat;
          const lngVal = typeof loc.lng === 'function' ? loc.lng() : (loc as any).lng;
          const newPos = { lat: latVal, lng: lngVal };
          const formatted = results[0].formatted_address || initialAddress;
          setCurrentPos(newPos);
          setProgrammaticTrigger((prev) => prev + 1);
          setCurrentAddress(formatted);
          setSearchQuery(formatted);
          const parsed = parseGoogleAddressComponents(results[0].address_components, formatted, latVal, lngVal);
          setCurrentComponents({
            houseNo: parsed.houseNo,
            streetName: parsed.streetName,
            city: parsed.city,
            stateName: parsed.stateName,
            pincode: parsed.pincode,
            country: parsed.country,
          });
          toast.success(`📍 Positioned map at "${formatted}"`);
        }
      });
    }
  }, [isOpen, initialLat, initialLng, initialAddress, geocoder, reverseGeocode]);

  const handleLocateMe = async () => {
    setIsFetchingAddress(true);
    const toastId = toast.loading('🛰️ Detecting current GPS position...');
    try {
      const coords = await detectCurrentLocation();
      const newPos = {
        lat: coords.lat,
        lng: coords.lng,
      };
      setCurrentPos(newPos);
      setProgrammaticTrigger((prev) => prev + 1);
      reverseGeocode(newPos);
      toast.success(`📍 Located current GPS position (±${Math.round(coords.accuracy)}m)`, { id: toastId });
    } catch (error: any) {
      setIsFetchingAddress(false);
      console.error('Geolocation failed:', error);
      toast.error(error.message || 'Failed to find current location. Please select it manually.', { id: toastId });
    }
  };

  // Quick Preset City Jump
  const handleQuickJump = (preset: { name: string; lat: number; lng: number }) => {
    const pos = { lat: preset.lat, lng: preset.lng };
    setCurrentPos(pos);
    setProgrammaticTrigger((prev) => prev + 1);
    setShowSearchResults(false);
    setSearchQuery(preset.name);
    reverseGeocode(pos);
    toast.info(`✈️ Jumped map to ${preset.name}`);
  };

  // Helper to commit auto-captured coordinates and sync map, inputs, components and status
  const applyCapturedLocation = useCallback((
    latVal: number,
    lngVal: number,
    formattedAddress: string,
    rawComponents?: any
  ) => {
    const newPos = { lat: latVal, lng: lngVal };
    setCurrentPos(newPos);
    setProgrammaticTrigger((prev) => prev + 1);
    setCurrentAddress(formattedAddress);
    setSearchQuery(formattedAddress);
    setShowSearchResults(false);
    setIsSearchingLocation(false);

    let parsed: ParsedAddress = {
      streetAddress: formattedAddress,
      houseNo: '',
      streetName: '',
      city: '',
      stateName: '',
      pincode: '',
      country: 'India',
    };

    if (rawComponents) {
      parsed = parseGoogleAddressComponents(rawComponents, formattedAddress, latVal, lngVal);
    }

    setCurrentComponents({
      houseNo: parsed.houseNo || '',
      streetName: parsed.streetName || '',
      city: parsed.city || '',
      stateName: parsed.stateName || '',
      pincode: parsed.pincode || '',
      country: parsed.country || 'India',
    });

    setAutoCapturedNotice({
      lat: latVal,
      lng: lngVal,
      address: formattedAddress,
    });

    toast.success(`🎯 Auto-Captured GPS: ${latVal.toFixed(6)}, ${lngVal.toFixed(6)}`);
  }, []);

  // Direct Search Action: Geocode user's search query and auto-capture coordinates
  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearchingLocation(true);
    setShowSearchResults(false);

    if (geocoder) {
      geocoder.geocode(
        { address: query, componentRestrictions: { country: 'in' } },
        (results, status) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            const latVal = typeof loc.lat === 'function' ? loc.lat() : Number((loc as any).lat);
            const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number((loc as any).lng);
            const formatted = results[0].formatted_address || query;
            applyCapturedLocation(latVal, lngVal, formatted, results[0].address_components);
          } else {
            // Retry without country restriction
            geocoder.geocode({ address: query }, (fallbackResults, fallbackStatus) => {
              setIsSearchingLocation(false);
              if (fallbackStatus === 'OK' && fallbackResults && fallbackResults[0]) {
                const loc = fallbackResults[0].geometry.location;
                const latVal = typeof loc.lat === 'function' ? loc.lat() : Number((loc as any).lat);
                const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number((loc as any).lng);
                const formatted = fallbackResults[0].formatted_address || query;
                applyCapturedLocation(latVal, lngVal, formatted, fallbackResults[0].address_components);
              } else {
                toast.error(`Could not locate "${query}". Please check spelling or select from dropdown.`);
              }
            });
          }
        }
      );
    } else {
      setIsSearchingLocation(false);
    }
  };

  // Automatically fetch suggestions as the user types (with a 300ms debounce)
  useEffect(() => {
    if (!searchQuery.trim() || !showSearchResults) {
      if (!searchQuery.trim()) {
        setSearchResults([]);
      }
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingLocation(true);

      const AutocompleteSuggestionClass =
        (placesLib as any)?.AutocompleteSuggestion ||
        (typeof window !== 'undefined' && (window as any).google?.maps?.places?.AutocompleteSuggestion);

      if (AutocompleteSuggestionClass && typeof AutocompleteSuggestionClass.fetchAutocompleteSuggestions === 'function') {
        try {
          let response = await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({
            input: searchQuery,
            includedRegionCodes: ['in'],
          });

          if (!response?.suggestions || response.suggestions.length === 0) {
            response = await AutocompleteSuggestionClass.fetchAutocompleteSuggestions({ input: searchQuery });
          }

          if (response?.suggestions && response.suggestions.length > 0) {
            const mapped = response.suggestions.map((s: any) => {
              const p = s.placePrediction;
              return {
                description: p?.text?.text || p?.structuredFormat?.mainText?.text || searchQuery,
                place_id: p?.placeId || '',
                structured_formatting: {
                  main_text: p?.structuredFormat?.mainText?.text || p?.text?.text || searchQuery,
                  secondary_text: p?.structuredFormat?.secondaryText?.text || '',
                },
              } as google.maps.places.AutocompletePrediction;
            });
            setSearchResults(mapped);
            setIsSearchingLocation(false);
            return;
          }
        } catch (e) {
          console.warn('AutocompleteSuggestion fetch error in LocationPickerModal:', e);
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
            input: searchQuery,
            componentRestrictions: { country: 'in' },
          },
          (predictions: any, status: any) => {
            setIsSearchingLocation(false);
            if (status === 'OK' && predictions) {
              setSearchResults(predictions);
            } else {
              setSearchResults([]);
            }
          }
        );
      } else {
        setIsSearchingLocation(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, placesLib, showSearchResults]);

  // Handle selection from autocomplete dropdown with multi-tier automatic coordinate capturing
  const handleSelectResult = async (result: google.maps.places.AutocompletePrediction) => {
    setIsSearchingLocation(true);
    setShowSearchResults(false);
    const targetDesc = result.description || '';
    setSearchQuery(targetDesc);

    // Strategy 1: Modern Places API (New) Place.fetchFields
    const PlaceClass = (placesLib as any)?.Place || (typeof window !== 'undefined' && (window as any).google?.maps?.places?.Place);
    if (PlaceClass && result.place_id) {
      try {
        const place = new PlaceClass({ id: result.place_id });
        await place.fetchFields({ fields: ['location', 'formattedAddress', 'addressComponents', 'displayName'] });
        if (place.location) {
          const latVal = typeof place.location.lat === 'function' ? place.location.lat() : Number(place.location.lat);
          const lngVal = typeof place.location.lng === 'function' ? place.location.lng() : Number(place.location.lng);
          const formatted = place.formattedAddress || targetDesc;
          applyCapturedLocation(latVal, lngVal, formatted, place.addressComponents);
          return;
        }
      } catch (e) {
        console.warn('[LocationPickerModal] Place.fetchFields fallback:', e);
      }
    }

    // Strategy 2: PlacesService.getDetails
    if (typeof window !== 'undefined' && (window as any).google?.maps?.places?.PlacesService && result.place_id) {
      try {
        const dummyNode = document.createElement('div');
        const placesService = new (window as any).google.maps.places.PlacesService(dummyNode);
        placesService.getDetails(
          { placeId: result.place_id, fields: ['geometry', 'formatted_address', 'address_components'] },
          (place: any, status: any) => {
            if (status === 'OK' && place?.geometry?.location) {
              const loc = place.geometry.location;
              const latVal = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
              const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
              const formatted = place.formatted_address || targetDesc;
              applyCapturedLocation(latVal, lngVal, formatted, place.address_components);
              return;
            }
            fallbackGeocode();
          }
        );
        return;
      } catch (e) {
        console.warn('[LocationPickerModal] PlacesService fallback:', e);
      }
    }

    // Strategy 3: Geocoder
    fallbackGeocode();

    function fallbackGeocode() {
      if (!geocoder) {
        setIsSearchingLocation(false);
        setCurrentAddress(targetDesc);
        return;
      }

      const onGeocodeSuccess = (results: any[], status: string) => {
        setIsSearchingLocation(false);
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const latVal = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
          const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
          const formatted = results[0].formatted_address || targetDesc;
          applyCapturedLocation(latVal, lngVal, formatted, results[0].address_components);
        } else {
          // Final fallback by text search
          geocoder.geocode({ address: targetDesc }, (addrRes, addrStat) => {
            if (addrStat === 'OK' && addrRes && addrRes[0]) {
              const loc = addrRes[0].geometry.location;
              const latVal = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
              const lngVal = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
              const formatted = addrRes[0].formatted_address || targetDesc;
              applyCapturedLocation(latVal, lngVal, formatted, addrRes[0].address_components);
            } else {
              setIsSearchingLocation(false);
              toast.error('Could not auto-capture GPS coordinates for this location. Please adjust pin manually.');
            }
          });
        }
      };

      if (result.place_id) {
        geocoder.geocode({ placeId: result.place_id }, onGeocodeSuccess);
      } else {
        geocoder.geocode({ address: targetDesc, componentRestrictions: { country: 'in' } }, onGeocodeSuccess);
      }
    }
  };

  const washingHubResult = currentPos ? findNearestHub('washing', currentPos.lat, currentPos.lng, customHubs) : null;
  const detailingHubResult = currentPos ? findNearestHub('detailing', currentPos.lat, currentPos.lng, customHubs) : null;

  const washDistance = washingHubResult ? washingHubResult.distanceKm : 0;
  const detailDistance = detailingHubResult ? detailingHubResult.distanceKm : 0;

  const isOutOfRange = currentPos && washDistance > 25 && detailDistance > 100;

  const handleConfirm = () => {
    if (currentPos) {
      const distance = Math.min(washDistance, detailDistance);
      onConfirm(currentPos.lat, currentPos.lng, currentAddress, '', distance, currentComponents);
      toast.success('✓ Doorstep location pin confirmed & coordinates saved!');
      onClose();
    }
  };

  // Intercept Android hardware / browser back button when LocationPickerModal is open
  useAndroidBackButton(() => {
    onClose();
    return true;
  }, isOpen, 60);

  // Default to Kalyani / Krishnanagar region center if no position is set
  const defaultMapCenter = { lat: 22.9751, lng: 88.4345 };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-[60] p-3 sm:p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col h-[90vh] md:h-[680px] modal-content font-sans overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-5 py-3 bg-slate-900 text-white flex justify-between items-center rounded-t-2xl">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-xs">
              <IconMapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                Doorstep Pin Adjustment & Map Picker
                <span className="bg-indigo-500/30 text-indigo-300 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border border-indigo-400/30">
                  Live Center-Lock
                </span>
              </h3>
              <p className="text-xs text-slate-300">Pan map or search location — center crosshair auto-locks doorstep pin</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800">
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        {/* Quick Jump Presets & Notice Bar */}
        <div className="bg-indigo-50/90 dark:bg-slate-800/90 border-b border-indigo-100 dark:border-slate-700 px-5 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wide flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" /> Quick Jump:
            </span>
            {QUICK_JUMP_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => handleQuickJump(preset)}
                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all border border-slate-200 dark:border-slate-600 shadow-2xs cursor-pointer active:scale-95"
              >
                📍 {preset.name}
              </button>
            ))}
          </div>
          {currentPos && (
            <div className="hidden sm:flex items-center gap-1.5 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Coords:</span>
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {currentPos.lat.toFixed(5)}, {currentPos.lng.toFixed(5)}
              </span>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="px-5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col relative z-[500]">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search street, locality, landmark, city or pincode..."
                className="w-full pl-9 pr-8 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => {
                  if (searchQuery.trim()) {
                    setShowSearchResults(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowSearchResults(false);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={isSearchingLocation || !searchQuery.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 flex items-center gap-1.5 font-bold cursor-pointer shrink-0"
            >
              {isSearchingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Capturing...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Search & Move</span>
                </>
              )}
            </Button>
          </div>

          {/* Auto-Captured Coordinates Banner */}
          {autoCapturedNotice && (
            <div className="mt-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-lg flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-200 font-semibold truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">
                  Auto-Captured GPS: <span className="font-mono font-bold text-emerald-900 dark:text-emerald-100">{autoCapturedNotice.lat.toFixed(6)}, {autoCapturedNotice.lng.toFixed(6)}</span>
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/80 px-2 py-0.5 rounded-md ml-2 shrink-0 border border-emerald-300 dark:border-emerald-600">
                Auto-Pinned ✓
              </span>
            </div>
          )}

          {/* Autocomplete suggestions dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-5 right-5 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-[9999] divide-y divide-slate-100 dark:divide-slate-700/50">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50/90 dark:hover:bg-slate-700/90 text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  onClick={() => handleSelectResult(result)}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0">📍</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {result.structured_formatting?.main_text || result.description}
                      </p>
                      {result.structured_formatting?.secondary_text && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {result.structured_formatting.secondary_text}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full shrink-0">
                    Auto-Capture
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div id="map-container" className="flex-1 relative bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <div className="w-full h-full">
            <Map
              defaultCenter={currentPos || defaultMapCenter}
              defaultZoom={currentPos ? 16 : 14}
              mapId="DEMO_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              mapTypeControl={true}
              streetViewControl={false}
            >
              <InteractiveMapController
                customerPos={currentPos}
                hubPos={hubPos}
                resetTrigger={fitBoundsTrigger}
                programmaticTrigger={programmaticTrigger}
                onMapCenterChange={(pos) => {
                  setCurrentPos(pos);
                }}
                reverseGeocode={reverseGeocode}
                onMapClick={() => setShowSearchResults(false)}
              />

              {hubPos && (
                <AdvancedMarker
                  position={{ lat: hubPos.lat, lng: hubPos.lng }}
                  title={`Central Hub: ${hubPos.name || 'Main Hub'} (Service Radius: ${effectiveMaxDistance} km)`}
                >
                  <Pin background="#4f46e5" glyphColor="#fff" borderColor="#ffffff" />
                </AdvancedMarker>
              )}

              {/* Dynamic Service Radius Circle centered at Hub */}
              {hubPos && (
                <MapServiceRadiusCircle
                  center={{ lat: hubPos.lat, lng: hubPos.lng }}
                  radiusKm={effectiveMaxDistance}
                />
              )}

              {currentPos && (
                <AdvancedMarker
                  position={currentPos}
                  draggable={true}
                  onDragEnd={(e) => {
                    if (e.latLng) {
                      const newPos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                      setCurrentPos(newPos);
                      reverseGeocode(newPos);
                    }
                  }}
                  title="Doorstep Pinned Location"
                >
                  <Pin background="#dc2626" glyphColor="#fff" borderColor="#ffffff" />
                </AdvancedMarker>
              )}
            </Map>
          </div>

          {/* Precision Center Crosshair Target Overlay */}
          <div id="map-crosshair" className="map-crosshair absolute inset-0 pointer-events-none flex items-center justify-center z-[300]">
            <div className="map-crosshair-target relative flex items-center justify-center">
              {/* Pulsing Target Ring */}
              <div className="w-14 h-14 rounded-full border-2 border-indigo-600/90 bg-indigo-500/15 animate-pulse flex items-center justify-center shadow-lg" />
              {/* Horizontal Crosshair Line */}
              <div className="absolute w-20 h-0.5 bg-indigo-600" />
              {/* Vertical Crosshair Line */}
              <div className="absolute h-20 w-0.5 bg-indigo-600" />
              {/* Center Bullseye Dot */}
              <div className="absolute w-3 h-3 rounded-full bg-red-600 border-2 border-white shadow-md" />
              {/* Crosshair Label Badge */}
              <div className="absolute top-9 bg-slate-900/90 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full backdrop-blur-xs border border-indigo-400/40 whitespace-nowrap shadow-lg flex items-center gap-1">
                <Target className="w-3 h-3 text-indigo-400" />
                Doorstep Pin Center
              </div>
            </div>
          </div>

          {/* Map Controls */}
          <MapCenterSnapButton setCurrentPos={setCurrentPos} reverseGeocode={reverseGeocode} />
          <MapZoomControls />

          {/* Live Hub Travel Time Estimate Badge via Distance Matrix API */}
          {currentPos && hubPos && (
            <MapLiveTravelTimeBadge
              origin={hubPos}
              destination={currentPos}
              onEstimateCalculated={setLiveTravelEstimate}
            />
          )}

          {currentPos && hubPos && (
            <button
              onClick={() => setFitBoundsTrigger((prev) => prev + 1)}
              type="button"
              className="absolute top-28 sm:top-24 left-4 z-[400] bg-slate-900/90 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-md border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs"
              title="Fit bounds to view both Hub and Customer Location"
            >
              <Navigation className="w-3.5 h-3.5 text-indigo-300" />
              <span className="text-[11px]">Fit Hub & Customer</span>
            </button>
          )}

          <button
            id="use-my-location-btn"
            onClick={handleLocateMe}
            type="button"
            className="absolute top-3.5 right-4 z-[400] bg-white dark:bg-slate-800 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-400 px-3 py-1.5 rounded-lg shadow-md border border-indigo-200 dark:border-indigo-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            title="Use My Current GPS Location & Auto-Fill Address"
          >
            <Navigation className="w-4 h-4 text-indigo-600 animate-pulse" />
            <span className="hidden sm:inline">GPS Current Location</span>
          </button>

          {/* Live Instruction Banner */}
          <div className="absolute bottom-3 left-4 right-4 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-xl shadow-lg border border-slate-200/80 dark:border-slate-700 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-2 w-2 relative flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                {isFetchingAddress ? (
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold animate-pulse">
                    Snapping coordinates & reverse-geocoding doorstep...
                  </span>
                ) : currentAddress ? (
                  <span>📍 {currentAddress}</span>
                ) : (
                  <span>Pan map or click anywhere to position exact customer pin</span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {liveTravelEstimate && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                  <Clock className="w-3 h-3 text-indigo-500" />
                  ETA: {liveTravelEstimate.durationInTrafficText || liveTravelEstimate.durationText}
                </span>
              )}
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider hidden sm:inline-block">
                Auto-Lock Active
              </span>
            </div>
          </div>
        </div>

        {/* Footer & Distance Validation */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="text-sm text-slate-600 dark:text-slate-300 flex-1 min-w-0">
            {currentPos ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200">🧼 Washing Hub Distance</span>
                    {liveTravelEstimate && (
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                        ⏱️ ~{liveTravelEstimate.durationInTrafficText || liveTravelEstimate.durationText}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-400 mr-1.5">{washDistance.toFixed(2)} km</span>
                  {washDistance <= 15 ? (
                    <span className="text-emerald-600 font-bold">✓ Daily Spark/Prime/CoreCare (≤15km)</span>
                  ) : washDistance <= 20 ? (
                    <span className="text-emerald-600 font-bold">✓ Deluxe Spa (≤20km)</span>
                  ) : washDistance <= 25 ? (
                    <span className="text-emerald-600 font-bold">✓ ABE 360 (≤25km)</span>
                  ) : (
                    <span className="text-rose-500 font-bold">✗ Out of washing range (&gt;25km)</span>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200">✨ Detailing Hub Distance</span>
                    {liveTravelEstimate && (
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                        🚗 {liveTravelEstimate.distanceText} driving
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-400 mr-1.5">{detailDistance.toFixed(2)} km</span>
                  {detailDistance <= 45 ? (
                    <span className="text-emerald-600 font-bold">✓ Detailing (≤45km) & Ceramic (≤100km)</span>
                  ) : detailDistance <= 100 ? (
                    <span className="text-emerald-600 font-bold">✓ Ceramic (≤100km only)</span>
                  ) : (
                    <span className="text-rose-500 font-bold">✗ Out of detailing range (&gt;100km)</span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-slate-400">Location not set. Pan map or search above to pin.</span>
            )}
          </div>
          <div className="flex space-x-3 justify-end items-center flex-shrink-0 font-sans">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!currentPos || isOutOfRange}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 mr-2 text-indigo-200" />
              Confirm & Save Pin Coordinates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const LocationPickerModal: React.FC<LocationPickerModalProps> = (props) => {
  const API_KEY =
    props.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  if (!props.isOpen) return null;

  if (!hasValidKey) {
    return <LocationPickerModalFallback {...props} />;
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
      <LocationPickerModalContent {...props} googleMapsApiKey={API_KEY} />
    </APIProvider>
  );
};

export default LocationPickerModal;
