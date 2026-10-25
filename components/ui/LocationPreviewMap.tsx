import React, { useState, useEffect, useMemo, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { IconMapPin, IconCrosshair, IconLoader } from './Icon';
import { MapPin, ExternalLink, CheckCircle2, AlertCircle, Edit3, Search, X, SlidersHorizontal, Check, Navigation, Building2, Plus, Minus, Clock } from 'lucide-react';
import Button from './Button';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import { MapLiveTravelTimeBadge } from './MapLiveTravelTimeBadge';
import { reverseGeocodeCoords } from '../../services/geocodingService';

interface LocationPreviewMapProps {
  latitude?: number;
  longitude?: number;
  address?: string;
  onOpenPicker?: () => void;
  onGetLocation?: () => void;
  onCoordinatesChange?: (lat: number, lng: number, address?: string) => void;
  isGettingLocation?: boolean;
  readOnly?: boolean;
  title?: string;
  height?: string;
  googleMapsApiKey?: string;
  showSearchBar?: boolean;
  showManualCoords?: boolean;
  hubLatitude?: number;
  hubLongitude?: number;
  maxDistanceKm?: number;
  customHubs?: any[];
  serviceType?: string;
}

// Controller to automatically fit bounds to include both Central Hub and Customer Location
function MapFitBoundsController({
  customerPos,
  hubPos,
  resetTrigger,
}: {
  customerPos: { lat: number; lng: number } | null;
  hubPos: { lat: number; lng: number; name?: string } | null;
  resetTrigger?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !customerPos || isNaN(customerPos.lat) || isNaN(customerPos.lng)) return;

    if (
      hubPos &&
      !isNaN(hubPos.lat) &&
      !isNaN(hubPos.lng) &&
      (Math.abs(hubPos.lat - customerPos.lat) > 0.0001 || Math.abs(hubPos.lng - customerPos.lng) > 0.0001)
    ) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(customerPos);
      bounds.extend({ lat: hubPos.lat, lng: hubPos.lng });
      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
    } else {
      map.panTo(customerPos);
      map.setZoom(15);
    }
  }, [map, customerPos?.lat, customerPos?.lng, hubPos?.lat, hubPos?.lng, resetTrigger]);

  return null;
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
    <div className="absolute right-3 bottom-3 z-10 flex flex-col bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        id="map-zoom-in-btn"
        onClick={handleZoomIn}
        type="button"
        className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition-colors border-b border-slate-200 dark:border-slate-700 cursor-pointer flex items-center justify-center"
        title="Zoom In (+)"
        aria-label="Zoom in"
      >
        <Plus className="w-4 h-4" />
      </button>
      <button
        id="map-zoom-out-btn"
        onClick={handleZoomOut}
        type="button"
        className="p-1.5 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center justify-center"
        title="Zoom Out (-)"
        aria-label="Zoom out"
      >
        <Minus className="w-4 h-4" />
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

export const LocationPreviewMapContent: React.FC<LocationPreviewMapProps> = ({
  latitude,
  longitude,
  address,
  onOpenPicker,
  onGetLocation,
  onCoordinatesChange,
  isGettingLocation = false,
  readOnly = false,
  title = 'Customer Pin Verification',
  height = '210px',
  googleMapsApiKey,
  showSearchBar = true,
  showManualCoords = true,
  hubLatitude,
  hubLongitude,
  maxDistanceKm,
  customHubs,
  serviceType,
}) => {
  const hasCoordinates =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude) &&
    (latitude !== 0 || longitude !== 0);

  const currentPos = hasCoordinates ? { lat: latitude!, lng: longitude! } : null;
  const defaultCenter = { lat: 23.4013, lng: 88.5021 };

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

  // Calculate Central Hub location
  const hubPos = useMemo(() => {
    const hubsToUse = (customHubs && customHubs.length > 0) ? customHubs : DEFAULT_DELIVERY_HUBS;
    if (currentPos && hubsToUse.length > 0) {
      const nearest = findNearestHub(serviceType || 'washing', currentPos.lat, currentPos.lng, hubsToUse);
      if (nearest && nearest.hub) {
        const h = nearest.hub as any;
        return {
          lat: typeof h.lat === 'number' ? h.lat : (h.latitude ?? effectiveHubLat),
          lng: typeof h.lon === 'number' ? h.lon : (h.longitude ?? h.lng ?? effectiveHubLng),
          name: h.name || 'Central Hub'
        };
      }
    }
    if (hubsToUse.length > 0) {
      const h = hubsToUse[0];
      return {
        lat: typeof h.latitude === 'number' ? h.latitude : (h.lat ?? effectiveHubLat),
        lng: typeof h.longitude === 'number' ? h.longitude : (h.lon ?? h.lng ?? effectiveHubLng),
        name: h.name || 'Central Hub'
      };
    }
    if (typeof hubLatitude === 'number' && typeof hubLongitude === 'number' && hubLatitude !== 0 && hubLongitude !== 0) {
      return { lat: hubLatitude, lng: hubLongitude, name: 'Central Hub' };
    }
    return { lat: effectiveHubLat, lng: effectiveHubLng, name: 'Central Hub' };
  }, [hubLatitude, hubLongitude, effectiveHubLat, effectiveHubLng, currentPos, serviceType, customHubs]);

  const [fitBoundsResetTrigger, setFitBoundsResetTrigger] = useState(0);

  // Local state for Places search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Local state for manual coordinates input
  const [manualLat, setManualLat] = useState<string>(
    latitude !== undefined && !isNaN(latitude) ? latitude.toString() : ''
  );
  const [manualLng, setManualLng] = useState<string>(
    longitude !== undefined && !isNaN(longitude) ? longitude.toString() : ''
  );
  const [coordsError, setCoordsError] = useState<string | null>(null);
  const [showManualSection, setShowManualSection] = useState<boolean>(false);
  const [coordsAppliedSuccess, setCoordsAppliedSuccess] = useState<boolean>(false);

  // Sync manual lat/lng inputs when props change externally
  useEffect(() => {
    if (latitude !== undefined && !isNaN(latitude)) {
      setManualLat(latitude.toString());
    } else {
      setManualLat('');
    }
    if (longitude !== undefined && !isNaN(longitude)) {
      setManualLng(longitude.toString());
    } else {
      setManualLng('');
    }
  }, [latitude, longitude]);

  // Load Google Maps Places & Geocoding libraries
  const placesLib = useMapsLibrary('places');
  const geocodingLib = useMapsLibrary('geocoding');

  const geocoder = useMemo(() => {
    if (!geocodingLib) return null;
    return new geocodingLib.Geocoder();
  }, [geocodingLib]);

  // Handle Autocomplete predictions with 300ms debounce using google.maps.places.AutocompleteSuggestion
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);

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
            setShowDropdown(true);
            setIsSearching(false);
            return;
          }
        } catch (e) {
          console.warn('AutocompleteSuggestion fetch error in LocationPreviewMap:', e);
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
            setIsSearching(false);
            if (status === 'OK' && predictions) {
              setSearchResults(predictions);
              setShowDropdown(true);
            } else {
              setSearchResults([]);
            }
          }
        );
      } else {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, placesLib]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle place selection from dropdown
  const handleSelectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!geocoder) {
      setSearchQuery('');
      setShowDropdown(false);
      setSearchResults([]);
      if (onCoordinatesChange) {
        onCoordinatesChange(latitude || 0, longitude || 0, prediction.description);
      }
      return;
    }
    setIsSearching(true);
    try {
      geocoder.geocode({ placeId: prediction.place_id }, (results, status) => {
        setIsSearching(false);
        setSearchQuery('');
        setShowDropdown(false);
        setSearchResults([]);
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const newLat = loc.lat();
          const newLng = loc.lng();
          const formattedAddress = results[0].formatted_address || prediction.description;

          if (onCoordinatesChange) {
            onCoordinatesChange(newLat, newLng, formattedAddress);
          }
        } else {
          if (onCoordinatesChange) {
            onCoordinatesChange(latitude || 0, longitude || 0, prediction.description);
          }
        }
      });
    } catch (e) {
      console.warn('[LocationPreviewMap] Geocode exception:', e);
      setIsSearching(false);
      setSearchQuery('');
      setShowDropdown(false);
      setSearchResults([]);
      if (onCoordinatesChange) {
        onCoordinatesChange(latitude || 0, longitude || 0, prediction.description);
      }
    }
  };

  // Handle direct freeform search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (!geocoder) {
      setShowDropdown(false);
      if (onCoordinatesChange) {
        onCoordinatesChange(latitude || 0, longitude || 0, searchQuery);
      }
      return;
    }

    setIsSearching(true);
    try {
      geocoder.geocode({ address: searchQuery }, (results, status) => {
        setIsSearching(false);
        setShowDropdown(false);
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const newLat = loc.lat();
          const newLng = loc.lng();
          const formattedAddress = results[0].formatted_address || searchQuery;

          if (onCoordinatesChange) {
            onCoordinatesChange(newLat, newLng, formattedAddress);
          }
        } else {
          if (onCoordinatesChange) {
            onCoordinatesChange(latitude || 0, longitude || 0, searchQuery);
          }
        }
      });
    } catch (e) {
      console.warn('[LocationPreviewMap] Geocode search exception:', e);
      setIsSearching(false);
      setShowDropdown(false);
      if (onCoordinatesChange) {
        onCoordinatesChange(latitude || 0, longitude || 0, searchQuery);
      }
    }
  };

  // Apply manual coordinates override
  const handleApplyManualCoordinates = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCoordsError(null);

    const latNum = parseFloat(manualLat);
    const lngNum = parseFloat(manualLng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      setCoordsError('Please enter valid numeric latitude and longitude values.');
      return;
    }

    if (latNum < -90 || latNum > 90) {
      setCoordsError('Latitude must be between -90 and 90.');
      return;
    }

    if (lngNum < -180 || lngNum > 180) {
      setCoordsError('Longitude must be between -180 and 180.');
      return;
    }

    // Coordinates are valid! Reverse geocode to update address if possible
    if (geocoder) {
      try {
        geocoder.geocode({ location: { lat: latNum, lng: lngNum } }, (results, status) => {
          let newAddress = address;
          if (status === 'OK' && results && results[0]) {
            newAddress = results[0].formatted_address;
          }
          if (onCoordinatesChange) {
            onCoordinatesChange(latNum, lngNum, newAddress);
          }
        });
      } catch (e) {
        if (onCoordinatesChange) {
          onCoordinatesChange(latNum, lngNum, address);
        }
      }
    } else if (onCoordinatesChange) {
      onCoordinatesChange(latNum, lngNum, address);
    }

    setCoordsAppliedSuccess(true);
    setTimeout(() => setCoordsAppliedSuccess(false), 2500);
  };

  const googleMapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs font-sans space-y-0">
      {/* Places Autocomplete Search Bar above map preview */}
      {!readOnly && showSearchBar && (
        <div className="p-2.5 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 relative" ref={dropdownRef}>
          <form onSubmit={handleSearchSubmit} className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                {isSearching ? (
                  <IconLoader className="w-4 h-4 animate-spin text-brand-accent" />
                ) : (
                  <Search className="w-4 h-4 text-brand-accent" />
                )}
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="Search place or address on Google Places..."
                className="w-full pl-9 pr-8 py-2 bg-slate-800 text-slate-100 placeholder-slate-400 text-xs rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setShowDropdown(false);
                  }}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!searchQuery.trim() || isSearching}
              className="px-3 py-2 bg-brand-accent hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1 shadow-xs"
            >
              Search
            </button>
          </form>

          {/* Autocomplete Predictions Dropdown */}
          {showDropdown && searchResults.length > 0 && (
            <div className="absolute left-2.5 right-2.5 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
              <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Google Places Suggestions ({searchResults.length})
              </div>
              {searchResults.map((item) => (
                <button
                  key={item.place_id}
                  type="button"
                  onClick={() => handleSelectPrediction(item)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800/50 last:border-0 flex items-start gap-2.5 transition-colors group"
                >
                  <MapPin className="w-4 h-4 text-brand-accent shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {item.structured_formatting.main_text}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.structured_formatting.secondary_text}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Header bar */}
      <div className="px-3.5 py-2 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg ${
              hasCoordinates
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
            }`}
          >
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {hasCoordinates ? 'Exact location pinned and verified' : 'Location coordinates unpinned'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {!readOnly && showManualCoords && (
            <button
              type="button"
              onClick={() => setShowManualSection((prev) => !prev)}
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                showManualSection
                  ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-blue-200 dark:border-blue-700'
                  : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Toggle manual coordinates entry"
            >
              <SlidersHorizontal className="w-3 h-3 text-brand-accent" />
              <span>{showManualSection ? 'Hide Coords' : 'Manual Coords'}</span>
            </button>
          )}

          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 bg-blue-50 dark:bg-blue-950/50 rounded-md border border-blue-200 dark:border-blue-900"
              title="Open location in Google Maps"
            >
              <span>Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {!readOnly && onGetLocation && (
            <button
              type="button"
              onClick={onGetLocation}
              disabled={isGettingLocation}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
              title="Detect current GPS location and auto-fill address"
            >
              {isGettingLocation ? (
                <IconLoader className="w-3 h-3 animate-spin text-indigo-600" />
              ) : (
                <Navigation className="w-3 h-3 text-indigo-600" />
              )}
              <span>Auto GPS</span>
            </button>
          )}
          {!readOnly && onOpenPicker && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onOpenPicker}
              className="text-xs py-1 px-2.5"
            >
              <Edit3 className="w-3.5 h-3.5 mr-1 text-slate-600 dark:text-slate-300" />
              {hasCoordinates ? 'Adjust Pin' : 'Pin Map'}
            </Button>
          )}
        </div>
      </div>

      {/* Manual Coordinates Input Section */}
      {!readOnly && showManualCoords && showManualSection && (
        <div className="p-3 bg-blue-50/70 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-xs">
          <form onSubmit={handleApplyManualCoordinates} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] uppercase tracking-wider flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-brand-accent" />
                Manual Coordinate Override
              </span>
              {coordsAppliedSuccess && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Pin Updated!
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                  Latitude
                </label>
                <input
                  type="text"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="e.g. 23.40130"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                  Longitude
                </label>
                <input
                  type="text"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="e.g. 88.50210"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-xs font-mono text-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-brand-accent focus:border-brand-accent"
                />
              </div>
              <div className="sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  className="w-full py-1.5 px-3 bg-brand-accent hover:bg-red-700 text-white font-bold text-xs rounded transition-colors shadow-xs"
                >
                  Apply Pin
                </button>
              </div>
            </div>
            {coordsError && <p className="text-[11px] text-red-600 dark:text-red-400 font-medium">{coordsError}</p>}
          </form>
        </div>
      )}

      {/* Map container */}
      <div id="map-container" className="relative w-full bg-slate-100 dark:bg-slate-800" style={{ height }}>
        <Map
          defaultCenter={currentPos || defaultCenter}
          defaultZoom={hasCoordinates ? 15 : 11}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          gestureHandling="cooperative"
          zoomControl={true}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          onClick={(e) => {
            if (!readOnly && e.detail.latLng && onCoordinatesChange) {
              const clickLat = e.detail.latLng.lat;
              const clickLng = e.detail.latLng.lng;
              if (geocoder) {
                try {
                  geocoder.geocode({ location: { lat: clickLat, lng: clickLng } }, (results, status) => {
                    let newAddr = address;
                    if (status === 'OK' && results && results[0]) {
                      newAddr = results[0].formatted_address;
                    }
                    onCoordinatesChange(clickLat, clickLng, newAddr);
                  });
                } catch {
                  onCoordinatesChange(clickLat, clickLng, address);
                }
              } else {
                reverseGeocodeCoords(clickLat, clickLng, googleMapsApiKey)
                  .then((res) => onCoordinatesChange(clickLat, clickLng, res.streetAddress))
                  .catch(() => onCoordinatesChange(clickLat, clickLng, address));
              }
            }
          }}
        >
          <MapFitBoundsController customerPos={currentPos} hubPos={hubPos} resetTrigger={fitBoundsResetTrigger} />

          {hubPos && (
            <AdvancedMarker position={{ lat: hubPos.lat, lng: hubPos.lng }} title={`Central Hub: ${hubPos.name || 'Main Hub'} (Service Radius: ${effectiveMaxDistance} km)`}>
              <Pin background="#4f46e5" glyphColor="#ffffff" borderColor="#312e81" />
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
              title={address || 'Customer Location Pin (Drag to adjust)'}
              draggable={!readOnly}
              onDragEnd={(e) => {
                if (e.latLng && onCoordinatesChange) {
                  const newLat = e.latLng.lat();
                  const newLng = e.latLng.lng();
                  if (geocoder) {
                    try {
                      geocoder.geocode({ location: { lat: newLat, lng: newLng } }, (results, status) => {
                        let newAddr = address;
                        if (status === 'OK' && results && results[0]) {
                          newAddr = results[0].formatted_address;
                        }
                        onCoordinatesChange(newLat, newLng, newAddr);
                      });
                    } catch (err) {
                      onCoordinatesChange(newLat, newLng, address);
                    }
                  } else {
                    onCoordinatesChange(newLat, newLng, address);
                  }
                }
              }}
            >
              <Pin background="#dc2626" glyphColor="#ffffff" borderColor="#7f1d1d" />
            </AdvancedMarker>
          )}
        </Map>

        {/* Custom Zoom Controls */}
        <MapZoomControls />

        {/* Live Hub Travel Time Estimate Badge */}
        {currentPos && hubPos && (
          <MapLiveTravelTimeBadge
            origin={hubPos}
            destination={currentPos}
            className="top-3 left-3"
            defaultExpanded={false}
          />
        )}

        {/* Fit Bounds floating button */}
        {currentPos && hubPos && (
          <button
            type="button"
            onClick={() => setFitBoundsResetTrigger((prev) => prev + 1)}
            className="absolute bottom-3 left-3 z-10 px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-white text-[11px] font-bold rounded-lg shadow-md border border-slate-700 transition-colors flex items-center gap-1.5 backdrop-blur-xs"
            title="Fit bounds to view both Central Hub and Customer Pin"
          >
            <Navigation className="w-3.5 h-3.5 text-indigo-300" />
            <span>Fit Hub & Customer</span>
          </button>
        )}

        {/* Floating status card if missing coordinates */}
        {!hasCoordinates && (
          <div className="absolute inset-x-4 top-4 bottom-4 m-auto z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs p-4 rounded-xl border border-amber-200 dark:border-amber-800/80 shadow-lg flex flex-col items-center justify-center text-center max-w-sm">
            <AlertCircle className="w-7 h-7 text-amber-500 mb-1.5 animate-bounce" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">No Location Pin Selected</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 mb-3">
              Search address above or enter manual coordinates to set the doorstep pin.
            </p>
            {!readOnly && (
              <div className="flex gap-2">
                {onOpenPicker && (
                  <Button type="button" size="sm" onClick={onOpenPicker}>
                    <IconMapPin className="w-3.5 h-3.5 mr-1" />
                    Select Pin on Map
                  </Button>
                )}
                {onGetLocation && (
                  <Button type="button" variant="secondary" size="sm" onClick={onGetLocation} disabled={isGettingLocation}>
                    {isGettingLocation ? (
                      <IconLoader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <IconCrosshair className="w-3.5 h-3.5 mr-1" />
                    )}
                    GPS
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer bar with coordinate badge and address text */}
      <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/90 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasCoordinates ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 shrink-0">
              <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 shrink-0">
              Unpinned Coordinates
            </span>
          )}
          {address && (
            <span className="text-slate-600 dark:text-slate-300 font-medium text-xs truncate" title={address}>
              {address}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// Fallback component for non-API key environment
const LocationPreviewMapFallback: React.FC<LocationPreviewMapProps> = (props) => {
  const [manualLat, setManualLat] = useState(props.latitude?.toString() || '');
  const [manualLng, setManualLng] = useState(props.longitude?.toString() || '');
  const [showManualSection, setShowManualSection] = useState(false);
  const [coordsError, setCoordsError] = useState<string | null>(null);

  useEffect(() => {
    setManualLat(props.latitude?.toString() || '');
    setManualLng(props.longitude?.toString() || '');
  }, [props.latitude, props.longitude]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng)) {
      setCoordsError('Please enter valid numeric latitude & longitude.');
      return;
    }
    setCoordsError(null);
    if (props.onCoordinatesChange) {
      props.onCoordinatesChange(lat, lng, props.address);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl p-4 font-sans space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-brand-accent" />
          <span>{props.title || 'Location Pin Verification'}</span>
        </span>
        <div className="flex items-center gap-2">
          {!props.readOnly && (
            <button
              type="button"
              onClick={() => setShowManualSection(!showManualSection)}
              className="text-xs text-brand-blue font-semibold hover:underline"
            >
              Manual Coords
            </button>
          )}
          {props.latitude && props.longitude && (
            <a
              href={`https://www.google.com/maps?q=${props.latitude},${props.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>View Map</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {!props.readOnly && showManualSection && (
        <form onSubmit={handleApply} className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Latitude"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="px-2 py-1 border text-xs rounded"
            />
            <input
              type="text"
              placeholder="Longitude"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="px-2 py-1 border text-xs rounded"
            />
          </div>
          {coordsError && <p className="text-[11px] text-red-500">{coordsError}</p>}
          <button type="submit" className="w-full py-1 bg-brand-accent text-white text-xs font-bold rounded">
            Set Manual Coordinates
          </button>
        </form>
      )}

      <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex justify-between items-center">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {props.latitude && props.longitude ? `Pinned: ${props.latitude.toFixed(5)}, ${props.longitude.toFixed(5)}` : 'No location coordinates pinned'}
          </p>
          {props.address && <p className="text-slate-500 truncate max-w-md mt-0.5">{props.address}</p>}
        </div>
        {!props.readOnly && props.onOpenPicker && (
          <Button size="sm" type="button" onClick={props.onOpenPicker}>
            Pin Location
          </Button>
        )}
      </div>
    </div>
  );
};

export const LocationPreviewMap: React.FC<LocationPreviewMapProps> = (props) => {
  const API_KEY =
    props.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

  if (!hasValidKey) {
    return <LocationPreviewMapFallback {...props} />;
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
      <LocationPreviewMapContent {...props} googleMapsApiKey={API_KEY} />
    </APIProvider>
  );
};

export default LocationPreviewMap;
