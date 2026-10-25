import { haversineDistanceKm } from './locationService';

export type TravelMode = 'DRIVING' | 'TWO_WHEELER' | 'BICYCLING' | 'TRANSIT' | 'WALKING';

export interface DistanceMatrixResult {
  originName?: string;
  destinationName?: string;
  distanceText: string;
  distanceKm: number;
  durationText: string;
  durationMinutes: number;
  durationInTrafficText?: string;
  durationInTrafficMinutes?: number;
  trafficDelayMinutes: number;
  trafficStatus: 'fast' | 'moderate' | 'heavy' | 'normal';
  mode: TravelMode;
  status: 'OK' | 'ZERO_RESULTS' | 'NOT_FOUND' | 'ERROR' | 'LOADING';
  errorMessage?: string;
  timestamp: number;
  isRealtime: boolean;
}

// In-memory cache to avoid duplicate calls for identical coordinates
const distanceMatrixCache = new Map<string, { data: DistanceMatrixResult; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache for real-time freshness

export async function fetchLiveDistanceMatrix(
  origin: { lat: number; lng: number; name?: string },
  destination: { lat: number; lng: number; name?: string },
  mode: TravelMode = 'DRIVING'
): Promise<DistanceMatrixResult> {
  const cacheKey = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}_${mode}`;
  const cached = distanceMatrixCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Fallback fallback calculator if Google Maps JS SDK is not loaded
  const fallbackCalc = (approxTrafficMultiplier: number = 1.35): DistanceMatrixResult => {
    const straightDist = haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
    // City road network driving distance is roughly 1.35x geodesic straight line
    const roadDistKm = Math.max(0.5, Math.round(straightDist * 1.35 * 10) / 10);
    // Average urban speed 22 km/h during busy hours
    const baseMins = Math.max(3, Math.round((roadDistKm / 28) * 60));
    const trafficMins = Math.round(baseMins * approxTrafficMultiplier);
    const delay = Math.max(0, trafficMins - baseMins);

    return {
      originName: origin.name || 'Central Hub',
      destinationName: destination.name || 'Customer Location',
      distanceText: `${roadDistKm.toFixed(1)} km`,
      distanceKm: roadDistKm,
      durationText: `${baseMins} min`,
      durationMinutes: baseMins,
      durationInTrafficText: `${trafficMins} min`,
      durationInTrafficMinutes: trafficMins,
      trafficDelayMinutes: delay,
      trafficStatus: delay > 10 ? 'heavy' : delay > 4 ? 'moderate' : 'fast',
      mode,
      status: 'OK',
      timestamp: Date.now(),
      isRealtime: false,
    };
  };

  if (typeof window === 'undefined' || !(window as any).google?.maps) {
    return fallbackCalc();
  }

  const google = (window as any).google;

  // 1. MODERN RECOMMENDED API: google.maps.routes.RouteMatrix.computeRouteMatrix
  // (Replaces deprecated google.maps.DistanceMatrix as of Feb 25, 2026)
  try {
    let RouteMatrixClass: any = google.maps.routes?.RouteMatrix;
    if (!RouteMatrixClass && typeof google.maps.importLibrary === 'function') {
      const routesLib: any = await google.maps.importLibrary('routes');
      RouteMatrixClass = routesLib?.RouteMatrix;
    }

    if (RouteMatrixClass && typeof RouteMatrixClass.computeRouteMatrix === 'function') {
      let routesTravelMode = 'DRIVING';
      if (mode === 'TRANSIT') routesTravelMode = 'TRANSIT';
      else if (mode === 'BICYCLING') routesTravelMode = 'BICYCLING';
      else if (mode === 'TWO_WHEELER') routesTravelMode = 'TWO_WHEELER';
      else if (mode === 'WALKING') routesTravelMode = 'WALKING';

      const computeRequest: any = {
        origins: [{ lat: origin.lat, lng: origin.lng }],
        destinations: [{ lat: destination.lat, lng: destination.lng }],
        travelMode: routesTravelMode,
        departureTime: new Date(),
        fields: [
          'distanceMeters',
          'durationMillis',
          'staticDurationMillis',
          'condition',
          'status',
          'localizedValues'
        ]
      };

      if (routesTravelMode === 'DRIVING' || routesTravelMode === 'TWO_WHEELER') {
        computeRequest.routingPreference = 'TRAFFIC_AWARE';
      }

      const response: any = await RouteMatrixClass.computeRouteMatrix(computeRequest);
      const rows = response?.matrix?.rows || response?.rows;
      const item = rows?.[0]?.items?.[0];

      if (item && (item.distanceMeters !== undefined || item.durationMillis !== undefined)) {
        const distMeters = item.distanceMeters ?? 0;
        const distKm = Math.round((distMeters / 1000) * 10) / 10;
        const distText = item.localizedValues?.distance?.text || `${distKm.toFixed(1)} km`;

        const durationMillis = item.durationMillis ?? item.staticDurationMillis ?? 0;
        const trafficMins = Math.max(1, Math.round(durationMillis / 60000));
        const trafficText = item.localizedValues?.duration?.text || `${trafficMins} min`;

        const staticMillis = item.staticDurationMillis ?? durationMillis;
        const baseMins = Math.max(1, Math.round(staticMillis / 60000));
        const baseText = item.localizedValues?.staticDuration?.text || `${baseMins} min`;

        const delayMins = Math.max(0, trafficMins - baseMins);
        let trafficStatus: 'fast' | 'moderate' | 'heavy' | 'normal' = 'normal';
        if (delayMins >= 8) {
          trafficStatus = 'heavy';
        } else if (delayMins >= 3) {
          trafficStatus = 'moderate';
        } else if (delayMins <= 1) {
          trafficStatus = 'fast';
        }

        const result: DistanceMatrixResult = {
          originName: origin.name || 'Central Hub',
          destinationName: destination.name || 'Customer Location',
          distanceText: distText,
          distanceKm: distKm,
          durationText: baseText,
          durationMinutes: baseMins,
          durationInTrafficText: trafficText,
          durationInTrafficMinutes: trafficMins,
          trafficDelayMinutes: delayMins,
          trafficStatus,
          mode,
          status: 'OK',
          timestamp: Date.now(),
          isRealtime: Boolean(item.durationMillis && item.staticDurationMillis && item.durationMillis !== item.staticDurationMillis),
        };

        distanceMatrixCache.set(cacheKey, {
          data: result,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        return result;
      }
    }
  } catch (modernApiErr) {
    // Non-fatal, fall through to legacy DistanceMatrixService or local calculator
    console.debug('[RouteMatrix] RouteMatrix.computeRouteMatrix not available or encountered error, falling back:', modernApiErr);
  }

  // 2. LEGACY FALLBACK: google.maps.DistanceMatrixService
  try {
    const DistanceMatrixService = google.maps.DistanceMatrixService;
    if (!DistanceMatrixService) {
      return fallbackCalc();
    }

    const service = new DistanceMatrixService();

    let mapsTravelMode = google.maps.TravelMode.DRIVING;
    if (mode === 'TRANSIT') mapsTravelMode = google.maps.TravelMode.TRANSIT;
    else if (mode === 'BICYCLING' || mode === 'TWO_WHEELER') mapsTravelMode = google.maps.TravelMode.BICYCLING;
    else if (mode === 'WALKING') mapsTravelMode = google.maps.TravelMode.WALKING;

    const requestOptions: google.maps.DistanceMatrixRequest = {
      origins: [new google.maps.LatLng(origin.lat, origin.lng)],
      destinations: [new google.maps.LatLng(destination.lat, destination.lng)],
      travelMode: mapsTravelMode,
      unitSystem: google.maps.UnitSystem.METRIC,
    };

    // Attach real-time driving options if driving mode
    if (mapsTravelMode === google.maps.TravelMode.DRIVING) {
      requestOptions.drivingOptions = {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      };
    }

    return new Promise<DistanceMatrixResult>((resolve) => {
      service.getDistanceMatrix(requestOptions, (response: any, status: any) => {
        if (status === google.maps.DistanceMatrixStatus.OK && response?.rows?.[0]?.elements?.[0]) {
          const element = response.rows[0].elements[0];

          if (element.status === 'OK') {
            const distMeters = element.distance?.value || 0;
            const distKm = Math.round((distMeters / 1000) * 10) / 10;
            const distText = element.distance?.text || `${distKm} km`;

            const baseSec = element.duration?.value || 0;
            const baseMins = Math.round(baseSec / 60);
            const baseText = element.duration?.text || `${baseMins} mins`;

            const trafficSec = element.duration_in_traffic?.value || baseSec;
            const trafficMins = Math.round(trafficSec / 60);
            const trafficText = element.duration_in_traffic?.text || `${trafficMins} mins`;

            const delayMins = Math.max(0, trafficMins - baseMins);
            let trafficStatus: 'fast' | 'moderate' | 'heavy' | 'normal' = 'normal';
            if (delayMins >= 8) {
              trafficStatus = 'heavy';
            } else if (delayMins >= 3) {
              trafficStatus = 'moderate';
            } else if (delayMins <= 1) {
              trafficStatus = 'fast';
            }

            const originAddress = response.originAddresses?.[0] || origin.name || 'Central Hub';
            const destinationAddress = response.destinationAddresses?.[0] || destination.name || 'Customer Location';

            const result: DistanceMatrixResult = {
              originName: originAddress,
              destinationName: destinationAddress,
              distanceText: distText,
              distanceKm: distKm,
              durationText: baseText,
              durationMinutes: baseMins,
              durationInTrafficText: trafficText,
              durationInTrafficMinutes: trafficMins,
              trafficDelayMinutes: delayMins,
              trafficStatus,
              mode,
              status: 'OK',
              timestamp: Date.now(),
              isRealtime: Boolean(element.duration_in_traffic),
            };

            distanceMatrixCache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });

            resolve(result);
            return;
          }
        }

        // Retry without drivingOptions if failed
        if (requestOptions.drivingOptions) {
          delete requestOptions.drivingOptions;
          service.getDistanceMatrix(requestOptions, (retryResp: any, retryStat: any) => {
            if (retryStat === google.maps.DistanceMatrixStatus.OK && retryResp?.rows?.[0]?.elements?.[0]) {
              const el = retryResp.rows[0].elements[0];
              if (el.status === 'OK') {
                const distMeters = el.distance?.value || 0;
                const distKm = Math.round((distMeters / 1000) * 10) / 10;
                const baseSec = el.duration?.value || 0;
                const baseMins = Math.round(baseSec / 60);

                const result: DistanceMatrixResult = {
                  originName: retryResp.originAddresses?.[0] || origin.name || 'Central Hub',
                  destinationName: retryResp.destinationAddresses?.[0] || destination.name || 'Customer Location',
                  distanceText: el.distance?.text || `${distKm} km`,
                  distanceKm: distKm,
                  durationText: el.duration?.text || `${baseMins} min`,
                  durationMinutes: baseMins,
                  durationInTrafficText: el.duration?.text || `${baseMins} min`,
                  durationInTrafficMinutes: baseMins,
                  trafficDelayMinutes: 0,
                  trafficStatus: 'normal',
                  mode,
                  status: 'OK',
                  timestamp: Date.now(),
                  isRealtime: false,
                };

                distanceMatrixCache.set(cacheKey, {
                  data: result,
                  expiresAt: Date.now() + CACHE_TTL_MS,
                });
                resolve(result);
                return;
              }
            }
            resolve(fallbackCalc());
          });
        } else {
          resolve(fallbackCalc());
        }
      });
    });
  } catch (err) {
    console.warn('[DistanceMatrixService] Failed to calculate real-time distance matrix:', err);
    return fallbackCalc();
  }
}
