import React, { useEffect, useRef, useState, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, isQuotaExceeded, setQuotaExceeded, checkIsQuotaError } from '../../services/firebase';
import { Service, User, LocationHistory, DeliveryHub } from '../../types';
import { findNearestHub, DEFAULT_DELIVERY_HUBS } from '../../constants';
import Button from '../ui/Button';
import { IconMapPin, IconRefresh, IconClock, IconAlertTriangle } from '../ui/Icon';
import MapZoomControls from '../ui/MapZoomControls';
import { MapLiveTravelTimeBadge } from '../ui/MapLiveTravelTimeBadge';
import { saveRecord } from '../../services/cloudDataService';

const riderIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 18px; height: 18px; color: white;"><path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h1.5v-1.125c0-1.036.84-1.875 1.875-1.875h13.5c1.035 0 1.875.84 1.875 1.875v1.125h1.5V6.375c0-1.036-.84-1.875-1.875-1.875h-13.5Z" /><path fill-rule="evenodd" d="M3 19.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm12 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM1.5 15a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Zm12 0a.75.75 0 0 0-.75.75v3c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-3a.75.75 0 0 0-.75-.75h-1.5Z" clip-rule="evenodd" /></svg>`;
const houseIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="width: 14px; height: 14px; color: white;"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>`;

const PERMANENT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbxLp_TVdHxujXijZ_Pv76BGJblh66MTmj8ppevLT5NV5ZN-1HtIeUaoazqE3B-yRGLM/exec';

interface OrderTrackingMapProps {
  service: Service;
  currentUser: User;
  deliveryHubs?: DeliveryHub[];
}

// Sub-component to fetch and draw driving route/polylines via Google Maps computeRoutes API
function DrivingRouteDisplay({
  origin,
  destination,
  onRouteComputed
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  onRouteComputed: (info: { distance: string; duration: string }) => void;
}) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLibrary || !map || !origin || !destination) return;

    // Clear previous route polylines
    polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    polylinesRef.current = [];

    routesLibrary.Route.computeRoutes({
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport']
    })
      .then((response) => {
        if (response.routes && response.routes[0]) {
          const route = response.routes[0];
          const polylines = route.createPolylines();
          polylines.forEach((poly) => poly.setMap(map));
          polylinesRef.current = polylines;

          if (route.viewport) {
            map.fitBounds(route.viewport);
          }

          const distanceKm = ((route.distanceMeters || 0) / 1000).toFixed(1);
          const durationMins = Math.round((route.durationMillis || 0) / 60000);
          onRouteComputed({
            distance: `${distanceKm} km`,
            duration: `${durationMins} mins`
          });
        }
      })
      .catch((error) => {
        console.error('Error computing driving route:', error);
      });

    return () => {
      polylinesRef.current.forEach((polyline) => polyline.setMap(null));
    };
  }, [routesLibrary, map, origin.lat, origin.lng, destination.lat, destination.lng]);

  return null;
}

export const OrderTrackingMap: React.FC<OrderTrackingMapProps> = ({ service, currentUser, deliveryHubs }) => {
  const API_KEY =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    'AIzaSyCKvKnwuiCfVbgmFgAp_EP17GV9PuGvy5M';

  const [serviceState, setServiceState] = useState<Service>(service);
  const [riderCoords, setRiderCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(false);
  const [isGpsAcquiring, setIsGpsAcquiring] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastFirestoreUpdateRef = useRef<number>(0);

  const isAssignedRider = service.assignedTo === currentUser.username;
  const isRiderCheckedIn = currentUser.attendanceStatus === 'CHECKED_IN';

  // 1. Setup real-time listening to service changes
  useEffect(() => {
    if (!db || isQuotaExceeded()) return;
    const docRef = doc(db, 'submissions', service.submissionId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const updatedService = docSnap.data() as Service;
        setServiceState(updatedService);

        if (
          typeof updatedService.riderLatitude === 'number' &&
          typeof updatedService.riderLongitude === 'number'
        ) {
          setRiderCoords({
            lat: updatedService.riderLatitude,
            lng: updatedService.riderLongitude
          });
        }
      }
    }, (error) => {
      if (checkIsQuotaError(error)) {
        console.warn("⚠️ [Firestore] Quota limit exceeded detected during real-time tracking subscription.");
        setQuotaExceeded(true);
      } else {
        console.error("❌ [Firestore] Subscription error in OrderTrackingMap:", error);
      }
    });

    return () => unsubscribe();
  }, [service.submissionId]);

  const customerCoords = useMemo(() => {
    if (typeof serviceState.customerLatitude === 'number' && typeof serviceState.customerLongitude === 'number') {
      return { lat: serviceState.customerLatitude, lng: serviceState.customerLongitude };
    }
    return null;
  }, [serviceState.customerLatitude, serviceState.customerLongitude]);

  // Dynamic nearest hub fallback from Hub Management System
  const nearestHubCoords = useMemo(() => {
    const serviceType = service.serviceSelection?.[0] || 'washing';
    const cLat = customerCoords?.lat ?? 22.4981461;
    const cLng = customerCoords?.lng ?? 88.3867093;
    const result = findNearestHub(serviceType, cLat, cLng, deliveryHubs);
    return { lat: result.hub.lat, lng: result.hub.lon };
  }, [service.serviceSelection, customerCoords, deliveryHubs]);

  // Fallback coords if no rider position yet: use the assigned user's last known coords, or nearest registered Hub
  const finalRiderCoords = useMemo(() => {
    if (riderCoords) return riderCoords;
    if (typeof currentUser.latitude === 'number' && typeof currentUser.longitude === 'number') {
      return { lat: currentUser.latitude, lng: currentUser.longitude };
    }
    return nearestHubCoords;
  }, [riderCoords, currentUser.latitude, currentUser.longitude, nearestHubCoords]);

  // 2. Start/stop live location tracking for the active rider
  useEffect(() => {
    if (isTrackingEnabled && isAssignedRider && isRiderCheckedIn) {
      setIsGpsAcquiring(true);
      setGpsError(null);

      const successCallback = async (position: GeolocationPosition) => {
        setIsGpsAcquiring(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setRiderCoords({ lat, lng });

        const now = Date.now();
        // Throttle Firestore updates to at most once every 30 seconds
        if (now - lastFirestoreUpdateRef.current >= 30000) {
          lastFirestoreUpdateRef.current = now;

          // A. Update current user location in Firestore & LocalStorage
          if (db && !isQuotaExceeded()) {
            try {
              const userRef = doc(db, 'users', currentUser.username);
              await setDoc(userRef, {
                latitude: lat,
                longitude: lng,
                lastLocationUpdate: new Date().toISOString()
              }, { merge: true });
            } catch (e) {
              if (checkIsQuotaError(e)) {
                setQuotaExceeded(true);
              }
              console.warn('Failed to update live user coords in Firestore:', e);
            }
          }

          // B. Update service document with rider coordinates
          if (db && !isQuotaExceeded()) {
            try {
              const serviceRef = doc(db, 'submissions', service.submissionId);
              await setDoc(serviceRef, {
                riderLatitude: lat,
                riderLongitude: lng,
                riderLastUpdate: new Date().toISOString(),
                isLocationSharingActive: true
              }, { merge: true });
            } catch (e) {
              if (checkIsQuotaError(e)) {
                setQuotaExceeded(true);
              }
              console.warn('Failed to update live service tracking in Firestore:', e);
            }
          }
        }

        // C. Record Location History entry for trip tracking
        const historyItem: LocationHistory = {
          historyId: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          userId: currentUser.username,
          latitude: lat,
          longitude: lng,
          timestamp: new Date().toISOString(),
          relatedServiceId: service.submissionId
        };
        try {
          await saveRecord('LocationHistory', historyItem, PERMANENT_SHEET_URL);
        } catch (e) {
          console.warn('Failed to save LocationHistory entry:', e);
        }
      };

      const errorCallback = (error: GeolocationPositionError) => {
        setIsGpsAcquiring(false);
        setGpsError(`GPS Error: ${error.message}`);
        setIsTrackingEnabled(false);
      };

      // WatchPosition triggers whenever rider moves
      watchIdRef.current = navigator.geolocation.watchPosition(successCallback, errorCallback, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      });
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsGpsAcquiring(false);
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTrackingEnabled, isAssignedRider, isRiderCheckedIn, service.submissionId, currentUser.username]);

  // Safe handler when toggle is pressed
  const handleTrackingToggle = () => {
    if (!isRiderCheckedIn) {
      alert('Please check in first using the shift control to enable order tracking.');
      return;
    }
    setIsTrackingEnabled(!isTrackingEnabled);
  };

  return (
    <div className="bg-slate-50 p-3 rounded-lg flex flex-col gap-3 border border-slate-200">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <IconMapPin className="w-5 h-5 text-brand-accent animate-pulse" />
          <h4 className="font-bold text-sm text-slate-800">Order Trip Tracking</h4>
        </div>

        {/* Rider tracking toggle controls */}
        {isAssignedRider && (
          <div className="flex items-center gap-2">
            {isGpsAcquiring && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <IconRefresh className="w-3.5 h-3.5 animate-spin" /> Acquiring GPS...
              </span>
            )}
            {gpsError && (
              <span className="text-xs text-red-500 flex items-center gap-1" title={gpsError}>
                <IconAlertTriangle className="w-3.5 h-3.5" /> GPS Error
              </span>
            )}
            <button
              onClick={handleTrackingToggle}
              className={`text-xs px-2.5 py-1.5 rounded-full font-semibold transition-all shadow-xs flex items-center gap-1 ${
                isTrackingEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isTrackingEnabled ? 'bg-white animate-ping' : 'bg-slate-400'}`} />
              {isTrackingEnabled ? 'Live Sharing ON' : 'Turn Location ON'}
            </button>
          </div>
        )}
      </div>

      {/* Render driving stats if calculated */}
      {routeInfo && (
        <div className="grid grid-cols-2 gap-2 bg-white px-3 py-2 rounded-md border border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <IconMapPin className="w-3.5 h-3.5 text-blue-500" />
            <span>Distance: <strong>{routeInfo.distance}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <IconClock className="w-3.5 h-3.5 text-purple-500" />
            <span>Estimated Duration: <strong>{routeInfo.duration}</strong></span>
          </div>
        </div>
      )}

      {/* Render map component */}
      {customerCoords ? (
        <div id="map-container" className="w-full h-64 rounded-md overflow-hidden relative border border-slate-200 bg-slate-100 shadow-inner">
          <APIProvider apiKey={API_KEY} version="weekly" libraries={['places', 'geocoding', 'routes', 'geometry']}>
            <Map
              defaultCenter={finalRiderCoords}
              defaultZoom={13}
              mapId="ORDER_TRACKING_MAP_ID"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              disableDefaultUI={true}
              zoomControl={true}
            >
              {/* Draw path using Directions */}
              <DrivingRouteDisplay
                origin={finalRiderCoords}
                destination={customerCoords}
                onRouteComputed={setRouteInfo}
              />

              <MapZoomControls />

              {/* Live Travel Time Badge from Distance Matrix API */}
              <MapLiveTravelTimeBadge
                origin={{ lat: finalRiderCoords.lat, lng: finalRiderCoords.lng, name: 'Rider / Hub' }}
                destination={{ lat: customerCoords.lat, lng: customerCoords.lng, name: 'Customer Site' }}
                className="top-2 left-2"
                defaultExpanded={false}
              />

              {/* Rider Marker */}
              <AdvancedMarker position={finalRiderCoords} title="Rider Current Location">
                <div
                  className="flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
                  style={{ width: '30px', height: '30px', backgroundColor: '#a855f7' }}
                  dangerouslySetInnerHTML={{ __html: riderIconSvg }}
                />
              </AdvancedMarker>

              {/* Customer Job Site Marker */}
              <AdvancedMarker position={customerCoords} title="Customer Job Site">
                <div
                  className="flex items-center justify-center rounded-full border-2 border-white shadow-lg cursor-pointer"
                  style={{ width: '28px', height: '28px', backgroundColor: '#3b82f6' }}
                  dangerouslySetInnerHTML={{ __html: houseIconSvg }}
                />
              </AdvancedMarker>
            </Map>
          </APIProvider>
        </div>
      ) : (
        <div className="bg-amber-50 p-4 rounded-md border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
          <IconAlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Customer site doesn't have exact GPS coordinates pinned. Directions routing is unavailable.</span>
        </div>
      )}
    </div>
  );
};
