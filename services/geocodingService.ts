import { parseGoogleAddressComponents, ParsedAddress, buildFormattedAddress } from '../utils/addressUtils';

export interface LocationDetectionResult extends ParsedAddress {
  accuracy?: number;
  source: 'google-sdk' | 'google-api' | 'osm' | 'coordinates-fallback';
}

/**
 * Captures current GPS coordinates using the browser Geolocation API with high accuracy.
 */
export async function detectCurrentLocation(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
): Promise<{ lat: number; lng: number; accuracy: number }> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported by this browser or device.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy || 10,
        });
      },
      (error) => {
        let msg = 'Failed to detect current location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Location permission was denied. Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Location information is unavailable. Please check your GPS / device settings.';
            break;
          case error.TIMEOUT:
            msg = 'Location request timed out. Please try again or pin your location manually.';
            break;
        }
        reject(new Error(msg));
      },
      options
    );
  });
}

/**
 * Reverse geocodes coordinates (lat, lng) into structured address fields.
 * Tries Google Maps JS SDK Geocoder -> Google Maps REST API -> OpenStreetMap Nominatim -> Fallback.
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  googleMapsApiKey?: string
): Promise<LocationDetectionResult> {
  const roundedLat = Number(lat.toFixed(6));
  const roundedLng = Number(lng.toFixed(6));

  // 1. Try Google Maps JS SDK Geocoder if loaded on window
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const response = await new Promise<any>((resolve, reject) => {
        geocoder.geocode({ location: { lat: roundedLat, lng: roundedLng } }, (results: any, status: any) => {
          if (status === 'OK' && results && results.length > 0) {
            resolve(results);
          } else {
            reject(new Error(`Google Geocoder status: ${status}`));
          }
        });
      });

      if (response && response[0]) {
        const topResult = response[0];
        const formatted = topResult.formatted_address || `${roundedLat}, ${roundedLng}`;
        const parsed = parseGoogleAddressComponents(
          topResult.address_components,
          formatted,
          roundedLat,
          roundedLng
        );

        return {
          ...parsed,
          source: 'google-sdk',
        };
      }
    } catch (sdkErr) {
      console.warn('[GeocodingService] Google Maps JS Geocoder failed, falling back:', sdkErr);
    }
  }

  // 2. Try Google Maps Geocoding REST API if API Key is available
  if (googleMapsApiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${roundedLat},${roundedLng}&key=${googleMapsApiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const topResult = data.results[0];
          const formatted = topResult.formatted_address || `${roundedLat}, ${roundedLng}`;
          const parsed = parseGoogleAddressComponents(
            topResult.address_components,
            formatted,
            roundedLat,
            roundedLng
          );
          return {
            ...parsed,
            source: 'google-api',
          };
        }
      }
    } catch (apiErr) {
      console.warn('[GeocodingService] Google Geocoding REST API failed, falling back:', apiErr);
    }
  }

  // 3. Fallback to OpenStreetMap Nominatim reverse geocoding
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${roundedLat}&lon=${roundedLng}&addressdetails=1`;
    const osmRes = await fetch(osmUrl, {
      headers: {
        'Accept-Language': 'en',
      },
    });

    if (osmRes.ok) {
      const osmData = await osmRes.json();
      if (osmData && osmData.address) {
        const addr = osmData.address;
        const houseNo = addr.house_number || addr.building || '';
        const streetName = [
          addr.road || addr.street || addr.residential || '',
          addr.suburb || addr.neighbourhood || addr.subdivision || '',
        ].filter(Boolean).join(', ');
        
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
        const stateName = addr.state || addr.province || '';
        const pincode = addr.postcode || '';
        const country = addr.country || 'India';
        const formattedAddress = osmData.display_name || buildFormattedAddress(houseNo, streetName, city, stateName, pincode);

        return {
          streetAddress: formattedAddress,
          houseNo,
          streetName,
          city,
          stateName,
          pincode,
          country,
          lat: roundedLat,
          lng: roundedLng,
          source: 'osm',
        };
      }
    }
  } catch (osmErr) {
    console.warn('[GeocodingService] OSM reverse geocoding failed:', osmErr);
  }

  // 4. Final Fallback: return coordinates as street address
  const fallbackStr = `Lat: ${roundedLat.toFixed(5)}, Lng: ${roundedLng.toFixed(5)}`;
  return {
    streetAddress: fallbackStr,
    lat: roundedLat,
    lng: roundedLng,
    country: 'India',
    source: 'coordinates-fallback',
  };
}

/**
 * One-click helper: Detects current GPS position and immediately reverse-geocodes it
 * into structured address components for the service request form.
 */
export async function detectLocationAndGeocode(
  googleMapsApiKey?: string,
  options?: PositionOptions
): Promise<LocationDetectionResult> {
  const coords = await detectCurrentLocation(options);
  const result = await reverseGeocodeCoords(coords.lat, coords.lng, googleMapsApiKey);
  return {
    ...result,
    accuracy: coords.accuracy,
  };
}
